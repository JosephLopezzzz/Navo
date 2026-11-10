import AVFoundation
import ExpoModulesCore
import UserNotifications
import Dispatch

public class NavoAlarmSoundsModule: Module {
  private let sampleRate = 22050.0
  private let maxFrames: AVAudioFramePosition = 22050 * 25
  private let importQueue = DispatchQueue(label: "navo.alarm-sound-import", qos: .userInitiated)

  public func definition() -> ModuleDefinition {
    Name("NavoAlarmSounds")

    AsyncFunction("prepareSound") { (sourceUri: String, fileName: String) -> [String: Any] in
      return try self.prepareSound(sourceUri: sourceUri, fileName: fileName)
    }.runOnQueue(importQueue)
    AsyncFunction("getSoundUri") { (fileName: String) -> String? in
      let url = try self.soundURL(fileName)
      return FileManager.default.fileExists(atPath: url.path) ? url.absoluteString : nil
    }
    AsyncFunction("deleteSound") { (fileName: String) in
      let url = try self.soundURL(fileName)
      if FileManager.default.fileExists(atPath: url.path) { try FileManager.default.removeItem(at: url) }
    }
    AsyncFunction("pruneUnusedSounds") { (fileNames: [String]) in
      let directory = try self.soundDirectory()
      let retained = Set(fileNames)
      let cutoff = Date().addingTimeInterval(-24 * 60 * 60)
      for file in try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: [.contentModificationDateKey, .isRegularFileKey]) {
        let name = file.lastPathComponent
        guard !retained.contains(name), name.range(of: "^navo_imported_[a-z0-9-]{8,80}\\.wav(?:\\.tmp\\.wav)?$", options: .regularExpression) != nil else { continue }
        let values = try file.resourceValues(forKeys: [.contentModificationDateKey, .isRegularFileKey])
        if values.isRegularFile == true, let modified = values.contentModificationDate, modified < cutoff { try FileManager.default.removeItem(at: file) }
      }
    }
    AsyncFunction("presentNotification") { (identifier: String, fileName: String, channelId: String, label: String, body: String, data: [String: String], promise: Promise) in
      do {
        try self.validateIdentifier(identifier)
        let url = try self.soundURL(fileName)
        guard FileManager.default.fileExists(atPath: url.path) else { throw self.failure("Imported sound unavailable") }
        let content = UNMutableNotificationContent()
        content.title = "Your stop is near"
        content.body = body
        content.sound = UNNotificationSound(named: UNNotificationSoundName(rawValue: fileName))
        content.userInfo = data
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: identifier, content: content, trigger: nil)) { error in
          if let error = error { promise.reject(error) } else { promise.resolve(nil) }
        }
      } catch { promise.reject(error) }
    }
    AsyncFunction("isNotificationPresented") { (identifier: String, promise: Promise) in
      UNUserNotificationCenter.current().getDeliveredNotifications { notifications in
        promise.resolve(notifications.contains { $0.request.identifier == identifier })
      }
    }
    AsyncFunction("dismissNotification") { (identifier: String) in
      try self.validateIdentifier(identifier)
      UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: [identifier])
      UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [identifier])
    }
  }

  private func failure(_ message: String) -> NSError {
    return NSError(domain: "NavoAlarmSounds", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
  }

  private func validateIdentifier(_ identifier: String) throws {
    guard identifier.hasPrefix("navo-imported-") else { throw failure("Invalid notification identifier") }
  }

  private func soundURL(_ name: String) throws -> URL {
    guard name.range(of: "^navo_imported_[a-z0-9-]{8,80}\\.wav$", options: .regularExpression) != nil else { throw failure("Invalid sound name") }
    return try soundDirectory().appendingPathComponent(name)
  }

  private func soundDirectory() throws -> URL {
    let library = try FileManager.default.url(for: .libraryDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
    let directory = library.appendingPathComponent("Sounds", isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true, attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication])
    return directory
  }

  private func prepareSound(sourceUri: String, fileName: String) throws -> [String: Any] {
    guard let sourceURL = URL(string: sourceUri), sourceURL.isFileURL else { throw failure("A local audio file is required") }
    let size = try sourceURL.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
    guard size > 0 && size <= 20 * 1024 * 1024 else { throw failure("Invalid audio file size") }
    let destination = try soundURL(fileName)
    guard !FileManager.default.fileExists(atPath: destination.path) else { throw failure("Sound already exists") }
    let temporary = destination.appendingPathExtension("tmp.wav")
    var saved = false
    defer { if !saved { try? FileManager.default.removeItem(at: temporary) } }

    let input = try AVAudioFile(forReading: sourceURL)
    guard input.length > 0,
          let format = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: sampleRate, channels: 1, interleaved: true),
          let converter = AVAudioConverter(from: input.processingFormat, to: format),
          let inputBuffer = AVAudioPCMBuffer(pcmFormat: input.processingFormat, frameCapacity: 4096),
          let outputBuffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 4096) else { throw failure("Unsupported audio format") }
    var output: AVAudioFile? = try AVAudioFile(forWriting: temporary, settings: format.settings, commonFormat: .pcmFormatInt16, interleaved: true)
    var written: AVAudioFramePosition = 0
    var reachedEnd = false
    var readError: Error?
    let deadline = Date().addingTimeInterval(30)
    while written < maxFrames {
      guard Date() < deadline else { throw failure("Audio conversion timed out") }
      outputBuffer.frameLength = 0
      var conversionError: NSError?
      let status = converter.convert(to: outputBuffer, error: &conversionError) { requested, inputStatus in
        if reachedEnd {
          inputStatus.pointee = .endOfStream
          return nil
        }
        do {
          try input.read(into: inputBuffer, frameCount: min(4096, requested))
          if inputBuffer.frameLength == 0 {
            reachedEnd = true
            inputStatus.pointee = .endOfStream
            return nil
          }
          inputStatus.pointee = .haveData
          return inputBuffer
        } catch {
          readError = error
          reachedEnd = true
          inputStatus.pointee = .endOfStream
          return nil
        }
      }
      if let error = readError { throw error }
      if let error = conversionError { throw error }
      guard status != .error else { throw failure("Audio conversion failed") }
      if outputBuffer.frameLength > 0 {
        outputBuffer.frameLength = min(outputBuffer.frameLength, AVAudioFrameCount(maxFrames - written))
        try output?.write(from: outputBuffer)
        written += AVAudioFramePosition(outputBuffer.frameLength)
      }
      if status == .endOfStream || (reachedEnd && outputBuffer.frameLength == 0) { break }
    }
    guard written > 0 else { throw failure("Audio file contains no playable samples") }
    // Close the writer before publishing the file so the WAV header is complete.
    output = nil
    try FileManager.default.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: temporary.path)
    try FileManager.default.moveItem(at: temporary, to: destination)
    saved = true
    return [
      "durationSeconds": Double(written) / sampleRate,
      "sizeBytes": try destination.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
    ]
  }
}
