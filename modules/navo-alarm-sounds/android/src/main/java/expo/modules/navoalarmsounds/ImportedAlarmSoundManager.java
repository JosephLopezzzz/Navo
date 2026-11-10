package expo.modules.navoalarmsounds;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.MediaCodec;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import java.io.File;
import java.io.IOException;
import java.io.RandomAccessFile;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.HashMap;
import java.util.Map;
import java.util.List;

public final class ImportedAlarmSoundManager {
  private static final int SAMPLE_RATE = 22050;
  private static final int MAX_FRAMES = SAMPLE_RATE * 25;
  private static final long MAX_INPUT_BYTES = 20 * 1024 * 1024;
  private static final String NOTIFICATION_PREFIX = "navo-imported-";

  static File soundFile(Context context, String name) {
    if (name == null || !name.matches("navo_imported_[a-z0-9-]{8,80}\\.wav")) throw new IllegalArgumentException("Invalid sound name");
    return new File(new File(context.getFilesDir(), "navo-alarm-sounds"), name);
  }

  private static String channelId(String name) {
    return "navo-imported-" + name.substring("navo_imported_".length(), name.length() - 4) + "-v1";
  }

  private static Uri contentUri(Context context, String name) {
    return new Uri.Builder().scheme("content").authority(context.getPackageName() + ".navo-alarm-sounds").appendPath(name).build();
  }

  public static String getSoundUri(Context context, String name) {
    File file = soundFile(context, name);
    return file.isFile() ? Uri.fromFile(file).toString() : null;
  }

  public static Map<String, Object> prepareSound(Context context, String sourceUri, String name) throws IOException {
    Uri uri = Uri.parse(sourceUri);
    if (!"file".equals(uri.getScheme()) || uri.getPath() == null) throw new IOException("A local audio file is required");
    File source = new File(uri.getPath());
    if (!source.isFile() || source.length() <= 0 || source.length() > MAX_INPUT_BYTES) throw new IOException("Invalid audio file size");
    File target = soundFile(context, name);
    if (target.exists()) throw new IOException("Sound already exists");
    File folder = target.getParentFile();
    if (!folder.isDirectory() && !folder.mkdirs()) throw new IOException("Sound storage is unavailable");
    File temporary = new File(folder, name + ".tmp");
    MediaExtractor extractor = new MediaExtractor();
    MediaCodec decoder = null;
    boolean started = false;
    boolean complete = false;
    int frames = 0;
    try (RandomAccessFile output = new RandomAccessFile(temporary, "rw")) {
      output.setLength(44);
      output.seek(44);
      extractor.setDataSource(source.getAbsolutePath());
      MediaFormat format = null;
      for (int track = 0; track < extractor.getTrackCount(); track++) {
        MediaFormat candidate = extractor.getTrackFormat(track);
        String mime = candidate.getString(MediaFormat.KEY_MIME);
        if (mime != null && mime.startsWith("audio/")) {
          format = candidate;
          extractor.selectTrack(track);
          break;
        }
      }
      if (format == null) throw new IOException("No audio track found");
      decoder = MediaCodec.createDecoderByType(format.getString(MediaFormat.KEY_MIME));
      format.setInteger(MediaFormat.KEY_PCM_ENCODING, AudioFormat.ENCODING_PCM_16BIT);
      decoder.configure(format, null, null, 0);
      decoder.start();
      started = true;
      MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
      boolean inputEnded = false;
      boolean outputEnded = false;
      int sampleRate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE);
      int channels = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT);
      int encoding = AudioFormat.ENCODING_PCM_16BIT;
      long resamplePhase = 0;
      double monoSum = 0;
      int monoFrames = 0;
      long deadline = SystemClock.elapsedRealtime() + 30_000;
      while (!outputEnded && frames < MAX_FRAMES) {
        if (SystemClock.elapsedRealtime() > deadline) throw new IOException("Audio conversion timed out");
        if (!inputEnded) {
          int index = decoder.dequeueInputBuffer(10_000);
          if (index >= 0) {
            ByteBuffer input = decoder.getInputBuffer(index);
            if (input == null) throw new IOException("Audio decoder unavailable");
            input.clear();
            int size = extractor.readSampleData(input, 0);
            if (size < 0) {
              decoder.queueInputBuffer(index, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM);
              inputEnded = true;
            } else {
              if ((extractor.getSampleFlags() & MediaExtractor.SAMPLE_FLAG_ENCRYPTED) != 0) throw new IOException("Protected audio is unsupported");
              decoder.queueInputBuffer(index, 0, size, extractor.getSampleTime(), 0);
              extractor.advance();
            }
          }
        }
        int index = decoder.dequeueOutputBuffer(info, 10_000);
        if (index == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
          MediaFormat decoded = decoder.getOutputFormat();
          sampleRate = decoded.getInteger(MediaFormat.KEY_SAMPLE_RATE);
          channels = decoded.getInteger(MediaFormat.KEY_CHANNEL_COUNT);
          encoding = decoded.containsKey(MediaFormat.KEY_PCM_ENCODING) ? decoded.getInteger(MediaFormat.KEY_PCM_ENCODING) : AudioFormat.ENCODING_PCM_16BIT;
          if (sampleRate < 8000 || sampleRate > 192000 || channels < 1 || channels > 8
              || (encoding != AudioFormat.ENCODING_PCM_16BIT && encoding != AudioFormat.ENCODING_PCM_FLOAT)) throw new IOException("Unsupported decoded audio format");
        } else if (index >= 0) {
          try {
            ByteBuffer pcm = decoder.getOutputBuffer(index);
            if (pcm != null && info.size > 0 && (info.flags & MediaCodec.BUFFER_FLAG_CODEC_CONFIG) == 0) {
              pcm.position(info.offset);
              pcm.limit(info.offset + info.size);
              pcm.order(ByteOrder.LITTLE_ENDIAN);
              int bytesPerSample = encoding == AudioFormat.ENCODING_PCM_FLOAT ? 4 : 2;
              // Keep conversion memory bounded to one decoder buffer; never load a song into JS.
              ByteBuffer converted = ByteBuffer.allocate(Math.min((MAX_FRAMES - frames) * 2, (int) Math.ceil((double) info.size / bytesPerSample / channels * SAMPLE_RATE / sampleRate + 2) * 2)).order(ByteOrder.LITTLE_ENDIAN);
              while (pcm.remaining() >= channels * bytesPerSample && frames < MAX_FRAMES) {
                double mono = 0;
                for (int channel = 0; channel < channels; channel++) mono += encoding == AudioFormat.ENCODING_PCM_FLOAT ? pcm.getFloat() * 32767.0 : pcm.getShort();
                mono /= channels;
                mono = Double.isFinite(mono) ? mono : 0;
                monoSum += mono;
                monoFrames++;
                resamplePhase += SAMPLE_RATE;
                while (resamplePhase >= sampleRate && frames < MAX_FRAMES) {
                  double averaged = monoFrames > 0 ? monoSum / monoFrames : mono;
                  short sample = (short) Math.max(-32768, Math.min(32767, averaged));
                  converted.putShort(sample);
                  frames++;
                  resamplePhase -= sampleRate;
                  monoSum = 0;
                  monoFrames = 0;
                }
              }
              output.write(converted.array(), 0, converted.position());
            }
            outputEnded = (info.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0;
          } finally { decoder.releaseOutputBuffer(index, false); }
        }
      }
      if (frames == 0) throw new IOException("Audio file contains no playable samples");
      ByteBuffer header = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN);
      header.put(new byte[] {'R','I','F','F'}).putInt(36 + frames * 2).put(new byte[] {'W','A','V','E','f','m','t',' '});
      header.putInt(16).putShort((short) 1).putShort((short) 1).putInt(SAMPLE_RATE).putInt(SAMPLE_RATE * 2).putShort((short) 2).putShort((short) 16);
      header.put(new byte[] {'d','a','t','a'}).putInt(frames * 2);
      output.seek(0);
      output.write(header.array());
      output.getFD().sync();
      complete = true;
    } finally {
      if (decoder != null) {
        try { if (started) decoder.stop(); } catch (RuntimeException ignored) { /* Release a failed codec as well. */ }
        try { decoder.release(); } catch (RuntimeException ignored) { /* Do not prevent temporary-file cleanup. */ }
      }
      extractor.release();
      if (!complete) temporary.delete();
    }
    if (!temporary.renameTo(target)) {
      temporary.delete();
      throw new IOException("Could not save the imported sound");
    }
    Map<String, Object> result = new HashMap<>();
    result.put("durationSeconds", (double) frames / SAMPLE_RATE);
    result.put("sizeBytes", target.length());
    return result;
  }

  public static void deleteSound(Context context, String name) throws IOException {
    File file = soundFile(context, name);
    if (file.exists() && !file.delete()) throw new IOException("Could not remove the sound file");
    context.revokeUriPermission(contentUri(context, name), Intent.FLAG_GRANT_READ_URI_PERMISSION);
    if (Build.VERSION.SDK_INT >= 26) context.getSystemService(NotificationManager.class).deleteNotificationChannel(channelId(name));
  }

  public static void pruneUnusedSounds(Context context, List<String> fileNames) throws IOException {
    File[] files = new File(context.getFilesDir(), "navo-alarm-sounds").listFiles();
    if (files == null) return;
    long cutoff = System.currentTimeMillis() - 24 * 60 * 60 * 1000L;
    for (File file : files) {
      String name = file.getName();
      String baseName = name.endsWith(".tmp") ? name.substring(0, name.length() - 4) : name;
      if (!file.isFile() || file.lastModified() >= cutoff || fileNames.contains(name)
          || !baseName.matches("navo_imported_[a-z0-9-]{8,80}\\.wav")) continue;
      if (name.equals(baseName)) deleteSound(context, name);
      else file.delete();
    }
  }

  public static boolean isNotificationPresented(Context context, String identifier) {
    for (android.service.notification.StatusBarNotification notification : context.getSystemService(NotificationManager.class).getActiveNotifications()) {
      if (identifier.equals(notification.getTag())) return true;
    }
    return false;
  }

  public static void dismissNotification(Context context, String identifier) {
    if (!identifier.startsWith(NOTIFICATION_PREFIX)) throw new IllegalArgumentException("Invalid notification identifier");
    context.getSystemService(NotificationManager.class).cancel(identifier, 0);
  }

  public static void presentNotification(Context context, String identifier, String name, String channel, String label, String body, Map<String, String> data) throws IOException, PackageManager.NameNotFoundException {
    if (!identifier.startsWith(NOTIFICATION_PREFIX) || !channel.equals(channelId(name))) throw new IllegalArgumentException("Invalid notification identifier");
    File file = soundFile(context, name);
    if (!file.isFile()) throw new IOException("Imported sound unavailable");
    if (isNotificationPresented(context, identifier)) return;
    Uri sound = contentUri(context, name);
    // Only the OS sound services receive access; the provider is otherwise private.
    context.grantUriPermission("android", sound, Intent.FLAG_GRANT_READ_URI_PERMISSION);
    try { context.grantUriPermission("com.android.systemui", sound, Intent.FLAG_GRANT_READ_URI_PERMISSION); } catch (IllegalArgumentException ignored) { /* Vendor SystemUI can have another package name. */ }
    AudioAttributes attributes = new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build();
    NotificationManager manager = context.getSystemService(NotificationManager.class);
    if (Build.VERSION.SDK_INT >= 26 && manager.getNotificationChannel(channel) == null) {
      NotificationChannel notificationChannel = new NotificationChannel(channel, "Destination alarm: " + label, NotificationManager.IMPORTANCE_HIGH);
      notificationChannel.setSound(sound, attributes);
      notificationChannel.enableVibration(true);
      notificationChannel.setVibrationPattern(new long[] {0, 250, 120, 250});
      manager.createNotificationChannel(notificationChannel);
    }
    Bundle metadata = context.getPackageManager().getApplicationInfo(context.getPackageName(), PackageManager.GET_META_DATA).metaData;
    int icon = metadata != null ? metadata.getInt("expo.modules.notifications.default_notification_icon", context.getApplicationInfo().icon) : context.getApplicationInfo().icon;
    Notification.Builder builder = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(context, channel) : new Notification.Builder(context);
    Bundle extras = new Bundle();
    for (Map.Entry<String, String> item : data.entrySet()) extras.putString(item.getKey(), item.getValue());
    builder.setSmallIcon(icon).setContentTitle("Your stop is near").setContentText(body).setStyle(new Notification.BigTextStyle().bigText(body))
      .setColor(Color.rgb(8, 105, 168)).setCategory(Notification.CATEGORY_ALARM).setAutoCancel(true).setOnlyAlertOnce(true).setExtras(extras);
    if (Build.VERSION.SDK_INT < 26) builder.setSound(sound, attributes).setVibrate(new long[] {0, 250, 120, 250}).setPriority(Notification.PRIORITY_HIGH);
    Intent launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
    if (launch != null) {
      launch.setAction(context.getPackageName() + "." + identifier).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
      builder.setContentIntent(PendingIntent.getActivity(context, 0, launch, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
    }
    manager.notify(identifier, 0, builder.build());
  }
}
