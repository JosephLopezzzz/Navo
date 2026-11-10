package expo.modules.navoalarmsounds;

import android.app.Activity;
import android.app.Instrumentation;
import android.app.NotificationManager;
import android.content.Context;
import android.media.MediaCodec;
import android.media.MediaCodecInfo;
import android.media.MediaFormat;
import android.media.MediaMuxer;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import java.io.File;
import java.io.RandomAccessFile;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.Collections;
import java.util.Map;

/** Runs against synthetic audio only; it does not read or change saved Navo alarms. */
public final class ImportedSoundSmokeTest extends Instrumentation {
  @Override public void onCreate(Bundle arguments) { super.onCreate(arguments); start(); }

  private static void check(boolean value, String message) {
    if (!value) throw new AssertionError(message);
  }

  @Override public void onStart() {
    Context context = getTargetContext();
    Bundle result = new Bundle();
    String suffix = "qa-" + System.currentTimeMillis();
    String waveName = "navo_imported_" + suffix + "-wave.wav";
    String musicName = "navo_imported_" + suffix + "-music.wav";
    String badName = "navo_imported_" + suffix + "-invalid.wav";
    String identifier = "navo-imported-" + suffix;
    File input = new File(context.getCacheDir(), suffix + ".wav");
    File music = new File(context.getCacheDir(), suffix + ".m4a");
    File bad = new File(context.getCacheDir(), suffix + ".txt");
    File oversized = new File(context.getCacheDir(), suffix + "-large.wav");
    int status = Activity.RESULT_OK;
    try {
      writeWave(input, 30);
      Map<String, Object> prepared = ImportedAlarmSoundManager.prepareSound(context, input.toURI().toString(), waveName);
      check(((Number) prepared.get("durationSeconds")).doubleValue() == 25, "Long WAV must stop at 25 seconds");
      check(((Number) prepared.get("sizeBytes")).longValue() == 1_102_544, "Clip must be mono 22050Hz PCM16");
      try (RandomAccessFile wav = new RandomAccessFile(ImportedAlarmSoundManager.soundFile(context, waveName), "r")) {
        byte[] header = new byte[44];
        wav.readFully(header);
        ByteBuffer parsed = ByteBuffer.wrap(header).order(ByteOrder.LITTLE_ENDIAN);
        check(parsed.getInt(24) == 22050 && parsed.getShort(22) == 1 && parsed.getShort(34) == 16, "WAV header must match the prepared format");
      }
      boolean duplicateRejected = false;
      try { ImportedAlarmSoundManager.prepareSound(context, input.toURI().toString(), waveName); } catch (Exception expected) { duplicateRejected = true; }
      check(duplicateRejected && ImportedAlarmSoundManager.getSoundUri(context, waveName) != null, "Duplicate preparation must preserve the existing clip");

      encodeMusic(input, music);
      Map<String, Object> compressed = ImportedAlarmSoundManager.prepareSound(context, music.toURI().toString(), musicName);
      double seconds = ((Number) compressed.get("durationSeconds")).doubleValue();
      check(seconds > 2.8 && seconds < 3.2, "Compressed M4A must decode and retain its short duration");

      try (RandomAccessFile invalid = new RandomAccessFile(bad, "rw")) { invalid.writeBytes("not an audio file"); }
      boolean corruptRejected = false;
      try { ImportedAlarmSoundManager.prepareSound(context, bad.toURI().toString(), badName); } catch (Exception expected) { corruptRejected = true; }
      check(corruptRejected && ImportedAlarmSoundManager.getSoundUri(context, badName) == null, "Corrupt input must not leave a selectable clip");
      try (RandomAccessFile large = new RandomAccessFile(oversized, "rw")) { large.setLength(21 * 1024 * 1024); }
      boolean largeRejected = false;
      try { ImportedAlarmSoundManager.prepareSound(context, oversized.toURI().toString(), badName); } catch (Exception expected) { largeRejected = true; }
      check(largeRejected, "Oversized input must be rejected before decoding");
      boolean traversalRejected = false;
      try { ImportedAlarmSoundManager.getSoundUri(context, "../outside.wav"); } catch (IllegalArgumentException expected) { traversalRejected = true; }
      check(traversalRejected, "Sound lookup must reject path traversal");

      String channel = "navo-imported-" + suffix + "-wave-v1";
      ImportedAlarmSoundManager.presentNotification(context, identifier, waveName, channel, "Synthetic test sound", "Navo native sound test", Collections.singletonMap("eventId", suffix));
      long deadline = SystemClock.elapsedRealtime() + 3000;
      while (!ImportedAlarmSoundManager.isNotificationPresented(context, identifier) && SystemClock.elapsedRealtime() < deadline) SystemClock.sleep(50);
      check(ImportedAlarmSoundManager.isNotificationPresented(context, identifier), "Imported notification must be presented");
      if (Build.VERSION.SDK_INT >= 26) {
        String uri = context.getSystemService(NotificationManager.class).getNotificationChannel(channel).getSound().toString();
        check(uri.equals("content://" + context.getPackageName() + ".navo-alarm-sounds/" + waveName), "Channel must use the private imported clip");
        try (android.os.ParcelFileDescriptor descriptor = context.getContentResolver().openFileDescriptor(android.net.Uri.parse(uri), "r")) {
          check(descriptor != null && descriptor.getStatSize() == 1_102_544, "The sound provider must expose the prepared clip");
        }
      }
      ImportedAlarmSoundManager.dismissNotification(context, identifier);
      deadline = SystemClock.elapsedRealtime() + 3000;
      while (ImportedAlarmSoundManager.isNotificationPresented(context, identifier) && SystemClock.elapsedRealtime() < deadline) SystemClock.sleep(50);
      check(!ImportedAlarmSoundManager.isNotificationPresented(context, identifier), "Imported notification must be dismissible");
      ImportedAlarmSoundManager.deleteSound(context, waveName);
      check(ImportedAlarmSoundManager.getSoundUri(context, waveName) == null, "Removing an import must delete the owned clip");
      if (Build.VERSION.SDK_INT >= 26) check(context.getSystemService(NotificationManager.class).getNotificationChannel(channel) == null, "Removing an import must remove its channel");
      result.putString("report", "PASS: WAV clip/format, duplicate safety, M4A decoding, corrupt/oversize rejection, path isolation, notification/channel/provider, dismissal, deletion");
    } catch (Throwable error) {
      status = Activity.RESULT_CANCELED;
      result.putString("report", "FAIL: " + error.toString());
      android.util.Log.e("NavoSoundTest", "Native smoke test failed", error);
    } finally {
      ImportedAlarmSoundManager.dismissNotification(context, identifier);
      for (String name : new String[] {waveName, musicName, badName}) try { ImportedAlarmSoundManager.deleteSound(context, name); } catch (Exception ignored) { }
      input.delete(); music.delete(); bad.delete(); oversized.delete();
    }
    finish(status, result);
  }

  private static void writeWave(File file, int seconds) throws Exception {
    int bytes = 48000 * 2 * 2 * seconds;
    ByteBuffer header = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN);
    header.put(new byte[] {'R','I','F','F'}).putInt(36 + bytes).put(new byte[] {'W','A','V','E','f','m','t',' '});
    header.putInt(16).putShort((short) 1).putShort((short) 2).putInt(48000).putInt(48000 * 4).putShort((short) 4).putShort((short) 16);
    header.put(new byte[] {'d','a','t','a'}).putInt(bytes);
    ByteBuffer second = ByteBuffer.allocate(48000 * 4).order(ByteOrder.LITTLE_ENDIAN);
    for (int frame = 0; frame < 48000; frame++) {
      short sample = (short) (Math.sin(frame * 2 * Math.PI * 440 / 48000) * 6000);
      second.putShort(sample).putShort(sample);
    }
    try (RandomAccessFile output = new RandomAccessFile(file, "rw")) {
      output.setLength(0); output.write(header.array());
      for (int i = 0; i < seconds; i++) output.write(second.array());
    }
  }

  private static void encodeMusic(File wave, File target) throws Exception {
    MediaCodec encoder = MediaCodec.createEncoderByType("audio/mp4a-latm");
    MediaMuxer muxer = new MediaMuxer(target.getAbsolutePath(), MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4);
    boolean muxerStarted = false;
    try (RandomAccessFile input = new RandomAccessFile(wave, "r")) {
      input.seek(44);
      MediaFormat format = MediaFormat.createAudioFormat("audio/mp4a-latm", 48000, 2);
      format.setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC);
      format.setInteger(MediaFormat.KEY_BIT_RATE, 128000);
      encoder.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE);
      encoder.start();
      int bytesRead = 0;
      int track = -1;
      boolean ended = false;
      boolean outputEnded = false;
      long deadline = SystemClock.elapsedRealtime() + 30_000;
      MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
      while (!outputEnded) {
        if (SystemClock.elapsedRealtime() > deadline) throw new Exception("AAC fixture encoding timed out");
        if (!ended) {
          int index = encoder.dequeueInputBuffer(10_000);
          if (index >= 0) {
            ByteBuffer buffer = encoder.getInputBuffer(index);
            buffer.clear();
            int size = Math.min(buffer.remaining(), 48000 * 4 * 3 - bytesRead);
            byte[] pcm = new byte[size];
            if (size > 0) input.readFully(pcm);
            buffer.put(pcm);
            encoder.queueInputBuffer(index, 0, size, (long) bytesRead * 1_000_000 / (48000 * 4), size == 0 ? MediaCodec.BUFFER_FLAG_END_OF_STREAM : 0);
            bytesRead += size;
            ended = size == 0;
          }
        }
        int index = encoder.dequeueOutputBuffer(info, 10_000);
        if (index == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
          track = muxer.addTrack(encoder.getOutputFormat()); muxer.start(); muxerStarted = true;
        } else if (index >= 0) {
          ByteBuffer buffer = encoder.getOutputBuffer(index);
          if (info.size > 0 && (info.flags & MediaCodec.BUFFER_FLAG_CODEC_CONFIG) == 0) {
            buffer.position(info.offset); buffer.limit(info.offset + info.size);
            muxer.writeSampleData(track, buffer, info);
          }
          outputEnded = (info.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0;
          encoder.releaseOutputBuffer(index, false);
        }
      }
    } finally {
      encoder.stop(); encoder.release();
      if (muxerStarted) muxer.stop();
      muxer.release();
    }
  }
}
