export const MAX_IMPORT_BYTES = 20 * 1024 * 1024;
export const MAX_IMPORTED_SOUNDS = 10;
export const MAX_SOUND_SECONDS = 25;
export const MAX_SOUND_BYTES = 1_200_000;

export interface ImportedAlarmSound {
  id: `imported:${string}`;
  label: string;
  fileName: string;
  durationSeconds: number;
  sizeBytes: number;
  createdAt: string;
}

export function importedSoundFileName(id: ImportedAlarmSound['id']): string {
  return `navo_imported_${id.slice('imported:'.length)}.wav`;
}

export function soundLabel(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80) || 'Imported sound';
}

export function normalizeImportedSounds(value: unknown): ImportedAlarmSound[] {
  if (!Array.isArray(value)) return [];
  const sounds: ImportedAlarmSound[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const sound = item as Partial<ImportedAlarmSound>;
    if (typeof sound.id !== 'string' || !/^imported:[a-z0-9-]{8,80}$/.test(sound.id)
      || sound.fileName !== importedSoundFileName(sound.id)
      || typeof sound.label !== 'string' || !sound.label.trim()
      || typeof sound.durationSeconds !== 'number' || !Number.isFinite(sound.durationSeconds)
      || sound.durationSeconds <= 0 || sound.durationSeconds > MAX_SOUND_SECONDS
      || !Number.isInteger(sound.sizeBytes) || sound.sizeBytes! <= 44 || sound.sizeBytes! > MAX_SOUND_BYTES
      || typeof sound.createdAt !== 'string' || !Number.isFinite(Date.parse(sound.createdAt))
      || sounds.some((existing) => existing.id === sound.id)) continue;
    sounds.push({
      id: sound.id,
      fileName: sound.fileName,
      label: sound.label.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80) || 'Imported sound',
      durationSeconds: sound.durationSeconds,
      sizeBytes: sound.sizeBytes!,
      createdAt: sound.createdAt,
    });
    if (sounds.length === MAX_IMPORTED_SOUNDS) break;
  }
  return sounds;
}

export function addImportedSound(sounds: ImportedAlarmSound[], sound: ImportedAlarmSound): ImportedAlarmSound[] {
  if (sounds.length >= MAX_IMPORTED_SOUNDS) throw new Error('You can keep 10 imported sounds. Remove one before importing another.');
  const valid = normalizeImportedSounds([sound])[0];
  if (!valid || sounds.some((item) => item.id === valid.id)) throw new Error('That audio file could not be saved as an alarm sound.');
  return [...sounds, valid];
}
