import NativeAlarmSounds from '../../modules/navo-alarm-sounds';
import { importedSoundFileName, MAX_IMPORT_BYTES, normalizeImportedSounds, soundLabel, type ImportedAlarmSound } from '../domain/imported-alarm-sounds';

export const canImportAlarmSounds = Boolean(NativeAlarmSounds);

class SoundImportError extends Error {}

function nativeSounds() {
  if (!NativeAlarmSounds) throw new Error('Install an updated Navo build to import audio files.');
  return NativeAlarmSounds;
}

/** The native converter retains only a bounded, notification-compatible clip. */
export async function importAlarmSound(existingSounds: ImportedAlarmSound[]): Promise<ImportedAlarmSound | null> {
  const native = nativeSounds();
  // Recover abandoned imports after crashes without touching recent conversions or registered clips.
  await native.pruneUnusedSounds(existingSounds.map((sound) => sound.fileName)).catch(() => undefined);
  const { getDocumentAsync } = await import('expo-document-picker');
  const { File, Paths } = await import('expo-file-system');
  const result = await getDocumentAsync({ type: 'audio/*', multiple: false, copyToCacheDirectory: true }).catch(() => {
    throw new SoundImportError('The file picker could not read that audio. Try a file saved on this device.');
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) throw new Error('No audio file was selected.');
  let source: InstanceType<typeof File> | null = null;
  const id: ImportedAlarmSound['id'] = `imported:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  const fileName = importedSoundFileName(id);
  let created = false;
  try {
    source = new File(asset.uri);
    if (!source.exists || source.size <= 0) throw new SoundImportError('That file is empty or unavailable. Choose another audio file.');
    if (source.size > MAX_IMPORT_BYTES) throw new SoundImportError('Choose an audio file smaller than 20 MB.');
    const prepared = await native.prepareSound(source.uri, fileName);
    created = true;
    const sound = normalizeImportedSounds([{
      id, fileName, label: soundLabel(asset.name), ...prepared, createdAt: new Date().toISOString(),
    }])[0];
    if (!sound) throw new SoundImportError('That audio could not be converted to an alarm sound. Try an MP3, M4A or WAV file.');
    return sound;
  } catch (error) {
    if (created) await native.deleteSound(fileName).catch(() => undefined);
    if (error instanceof SoundImportError) throw error;
    throw new Error('That audio could not be imported. Try an unprotected MP3, M4A or WAV file.');
  } finally {
    // Never remove the user's original: only the picker copy inside this app's cache.
    try {
      if (source && source.uri.startsWith(`${Paths.cache.uri.replace(/\/$/, '')}/`) && source.exists) source.delete();
    } catch { /* The OS can reclaim an inaccessible picker cache copy. */ }
  }
}

export async function importedSoundUri(sound: ImportedAlarmSound): Promise<string> {
  const uri = await nativeSounds().getSoundUri(sound.fileName);
  if (!uri) throw new Error('This saved sound is unavailable. Remove it and import the file again.');
  return uri;
}

export async function deleteImportedSoundFile(sound: ImportedAlarmSound): Promise<void> {
  await nativeSounds().deleteSound(sound.fileName);
}
