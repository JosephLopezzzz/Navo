package expo.modules.navoalarmsounds;

import android.content.Context;
import android.database.Cursor;
import android.media.RingtoneManager;
import android.net.Uri;
import android.provider.Settings;
import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** References OS-owned alarm audio. No ringtone is copied into Navo's storage. */
public final class DeviceAlarmSounds {
  private static final String ALLOWED_URI = "^content://(?:media/(?:internal|external|external_primary)/audio/media/[1-9][0-9]{0,19}|settings/system/alarm_alert)$";

  static Uri checkedUri(String value) {
    if (value == null || !value.matches(ALLOWED_URI)) throw new IllegalArgumentException("Invalid phone alarm sound");
    return Uri.parse(value);
  }

  public static List<Map<String, String>> getSounds(Context context) {
    RingtoneManager ringtones = new RingtoneManager(context);
    ringtones.setType(RingtoneManager.TYPE_ALARM);
    List<Map<String, String>> result = new ArrayList<>();
    Cursor cursor = null;
    try {
      cursor = ringtones.getCursor();
      while (cursor != null && cursor.moveToNext() && result.size() < 64) {
        Uri uri = ringtones.getRingtoneUri(cursor.getPosition());
        if (uri == null || !uri.toString().matches(ALLOWED_URI)) continue;
        String title = cursor.getString(RingtoneManager.TITLE_COLUMN_INDEX);
        Map<String, String> sound = new HashMap<>();
        sound.put("uri", uri.toString());
        sound.put("label", title == null || title.trim().isEmpty() ? "Phone sound" : title.substring(0, Math.min(title.length(), 80)));
        result.add(sound);
      }
    } finally {
      // This one-shot manager is not retained or reused after its query.
      if (cursor != null) cursor.close();
    }
    return result;
  }

  public static String getSoundUri(Context context, String value) throws IOException {
    Uri uri = checkedUri(value);
    if (Settings.System.DEFAULT_ALARM_ALERT_URI.equals(uri)) {
      uri = RingtoneManager.getActualDefaultRingtoneUri(context, RingtoneManager.TYPE_ALARM);
      if (uri == null) return null; // The user may intentionally have a silent default.
    }
    try (android.content.res.AssetFileDescriptor descriptor = context.getContentResolver().openAssetFileDescriptor(uri, "r")) {
      return descriptor == null ? null : uri.toString();
    }
  }

  static String channelId(String value, boolean vibrate) {
    checkedUri(value);
    if (Settings.System.DEFAULT_ALARM_ALERT_URI.toString().equals(value)) return "navo-destination-phone-alarm-v2-" + (vibrate ? "vibrate" : "still");
    return "navo-device-" + value.replace("content://", "").replace('/', '-') + "-v2-" + (vibrate ? "vibrate" : "still");
  }

  public static void presentNotification(Context context, String identifier, String value, String channel, String label, String body, Map<String, String> data) throws Exception {
    Uri uri = checkedUri(value);
    boolean vibrate = !"false".equals(data.get("vibrationEnabled"));
    if (!channel.equals(channelId(value, vibrate))) throw new IllegalArgumentException("Invalid phone sound channel");
    // A selected media entry may disappear after an OS upgrade. Let JS fall back.
    if (!Settings.System.DEFAULT_ALARM_ALERT_URI.equals(uri) && getSoundUri(context, value) == null) throw new IOException("Phone sound unavailable");
    ImportedAlarmSoundManager.postNotification(context, identifier, uri, channel, label, body, data);
  }
}
