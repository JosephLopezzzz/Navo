# Local alarm sounds

Both **Edit alarm → Alarm sound** and a saved alarm's **Sound** dialog include **Import from files**. Pick an unprotected MP3, M4A, WAV, or another audio format supported by the device. The source file must be no larger than 20 MB. Canceling the picker leaves the current selection unchanged.

Navo converts only the first 25 seconds into mono 22,050 Hz PCM16 WAV, usually at most about 1.1 MB per imported clip. It keeps up to ten imported sounds. Conversion runs away from the UI/notification-delivery queue. The picker cache copy is removed after processing; the user's original file is retained. Audio stays on the device and is not uploaded by Navo.

Import adds the clip to the device's sound library and selects it in the editor. **Save alarm** or **Save sound** commits the alarm's selection. Closing without saving keeps the previous alarm selection; the imported clip remains available in the library. **Remove** deletes the clip from the library and changes every alarm using it to **System default**, without changing whether those alarms are armed. Abandoned, unregistered files older than a day are cleaned up during later imports.

## Native integration

- `expo-document-picker` opens the system file picker, with cache copying enabled.
- The local Expo module in `modules/navo-alarm-sounds` decodes/converts audio using platform APIs, stores a bounded clip, and posts notifications using that imported sound. No generated root `android/` or `ios/` projects are maintained by hand.
- Android keeps clips in the app's private files directory. A private read-only content provider grants the system sound services access to an individual clip. Android 8+ gets an immutable channel per imported sound; Android 7 uses the notification's sound URI. Deleting a clip also removes its channel.
- iOS keeps clips in the app container's `Library/Sounds` and uses `UNNotificationSound` with the generated filename. Files remain readable after the first unlock when the phone is locked again. The 25-second clip stays below [Apple's 30-second notification sound limit](https://developer.apple.com/documentation/usernotifications/unnotificationsound).
- SQLite state schema 5 stores relative filenames and metadata, never a temporary file URI. Existing bundled selections remain unchanged. Invalid, removed, or missing imports fall back to the phone default.
- Imported notifications use a stable event identifier. Pending-event acknowledgement, session checks, and disarming rules stay in the existing destination-alarm flow. If a file or native import support is unavailable when the alert fires, Navo posts a normal phone-default notification explaining the fallback.

Imported clips remain ordinary notification sounds. They do not loop indefinitely, play an entire song, bypass silent mode or Focus, or guarantee background delivery. No foreground audio service or alarm-clock override is introduced.

## Rebuild and acceptance

The new picker and local native module require a new development or release build for each platform. An old APK, an OTA update alone, or Expo Go cannot validate Navo's full integration. Use the existing EAS development/preview profiles; do not publish an update that assumes the new module exists in older binaries. The import control remains unavailable when the native module is absent.

Required device acceptance:

1. Import and preview MP3, M4A and WAV on Android and iOS; test picker cancellation and unreadable/protected, empty, oversized and corrupt files.
2. Save the selection, restart the app, and verify the selected clip and preview persist. Rename or remove the original outside Navo and confirm the owned clip still works.
3. Trigger a test destination arrival with the app visible, backgrounded and phone locked. Verify the chosen clip, visible notification, event acknowledgement and dismissal without duplicate alerts.
4. Remove an imported sound used by several alarms and verify their default-sound selection while preserving armed state. Verify the ten-sound limit, storage-failure recovery, and a missing-file fallback.
5. Check both themes, long filenames, large text, small screens, scrolling in the Sound dialog, busy/disabled states, and press feedback with Reduce Motion.
6. Test silent mode, Focus, notification/channel overrides, and reboot/first-unlock behavior. These OS settings may mute or delay the sound.

Vitest covers storage normalization, migration, picker cancellation, import size/cleanup boundaries, notification fallback, retry deduplication and dismissal. The Android instrumentation smoke runner in `modules/navo-alarm-sounds/android/src/androidTest` uses synthetic WAV and M4A fixtures to exercise conversion, notification/provider/channel setup, dismissal and cleanup; it still requires execution in a native test build. Java compilation, autolinking and Expo bundle export are separate from native build and device acceptance. iOS native compilation and playback must be checked on an Apple build/device.
