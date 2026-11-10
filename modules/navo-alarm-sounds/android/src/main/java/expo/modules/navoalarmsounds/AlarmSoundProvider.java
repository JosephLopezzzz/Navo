package expo.modules.navoalarmsounds;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.File;
import java.io.FileNotFoundException;

/** Read-only access to individual prepared clips, granted to the system sound player. */
public final class AlarmSoundProvider extends ContentProvider {
  @Override public boolean onCreate() { return true; }

  private File soundFile(Uri uri) throws FileNotFoundException {
    if (getContext() == null || !(getContext().getPackageName() + ".navo-alarm-sounds").equals(uri.getAuthority())
        || uri.getPathSegments().size() != 1) throw new FileNotFoundException("Invalid sound");
    try {
      File file = ImportedAlarmSoundManager.soundFile(getContext(), uri.getLastPathSegment());
      if (!file.isFile()) throw new FileNotFoundException("Sound unavailable");
      return file;
    } catch (IllegalArgumentException error) {
      throw new FileNotFoundException("Invalid sound");
    }
  }

  @Override public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
    if (!"r".equals(mode)) throw new FileNotFoundException("Read only");
    return ParcelFileDescriptor.open(soundFile(uri), ParcelFileDescriptor.MODE_READ_ONLY);
  }

  @Override public String getType(Uri uri) { return "audio/wav"; }

  @Override public Cursor query(Uri uri, String[] projection, String selection, String[] args, String sortOrder) {
    try {
      File file = soundFile(uri);
      String[] columns = projection != null ? projection : new String[] { OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE };
      MatrixCursor cursor = new MatrixCursor(columns, 1);
      MatrixCursor.RowBuilder row = cursor.newRow();
      for (String column : columns) {
        if (OpenableColumns.DISPLAY_NAME.equals(column)) row.add(file.getName());
        else if (OpenableColumns.SIZE.equals(column)) row.add(file.length());
        else row.add(null);
      }
      return cursor;
    } catch (FileNotFoundException error) { return null; }
  }

  @Override public Uri insert(Uri uri, ContentValues values) { throw new UnsupportedOperationException("Read only"); }
  @Override public int update(Uri uri, ContentValues values, String selection, String[] args) { throw new UnsupportedOperationException("Read only"); }
  @Override public int delete(Uri uri, String selection, String[] args) { throw new UnsupportedOperationException("Read only"); }
}
