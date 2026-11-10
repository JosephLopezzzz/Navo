import { describe, expect, it, vi } from 'vitest';
vi.mock('expo-sqlite', () => ({}));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {} }));

import { addImportedSound, importedSoundFileName, MAX_IMPORTED_SOUNDS, normalizeImportedSounds, soundLabel, type ImportedAlarmSound } from '../src/domain/imported-alarm-sounds';
import { getAlarmTone } from '../src/domain/alarm-tones';
import { normalizeAppState } from '../src/services/storage';
import { createDestinationAlarm } from '../src/domain/destination-alarm';

const sound: ImportedAlarmSound = {
  id: 'imported:example-12345678', label: 'My music', fileName: 'navo_imported_example-12345678.wav',
  durationSeconds: 25, sizeBytes: 1_102_544, createdAt: '2026-11-09T00:00:00.000Z',
};

describe('imported alarm sound persistence', () => {
  it('migrates existing alarms without changing their built-in sound or armed state', () => {
    const alarm = { ...createDestinationAlarm('alarm', 'destination'), enabled: true, ringtoneId: 'soft-bell' };
    const state = normalizeAppState({ schemaVersion: 4, destinationAlarms: [alarm] });
    expect(state.schemaVersion).toBe(5);
    expect(state.importedAlarmSounds).toEqual([]);
    expect(state.destinationAlarms[0]).toEqual(alarm);
  });

  it('retains a saved imported selection across a JSON storage round trip', () => {
    const alarm = { ...createDestinationAlarm('alarm', 'destination'), ringtoneId: sound.id };
    const state = normalizeAppState(JSON.parse(JSON.stringify({ importedAlarmSounds: [sound], destinationAlarms: [alarm] })));
    expect(state.importedAlarmSounds).toEqual([sound]);
    expect(state.destinationAlarms[0].ringtoneId).toBe(sound.id);
    expect(getAlarmTone(sound.id, state.importedAlarmSounds)).toMatchObject({ label: sound.label, imported: sound });
    expect(state.importedAlarmSounds[0].fileName).not.toContain('file://');
  });

  it('falls back to the phone default when a referenced import is removed', () => {
    const alarm = { ...createDestinationAlarm('alarm', 'destination'), enabled: true, ringtoneId: sound.id };
    const state = normalizeAppState({ importedAlarmSounds: [], destinationAlarms: [alarm] });
    expect(state.destinationAlarms[0]).toMatchObject({ ringtoneId: 'system-default', enabled: true });
  });

  it.each([
    { fileName: '../../outside.wav' }, { durationSeconds: 30 }, { durationSeconds: NaN },
    { sizeBytes: 30_000_000 }, { sizeBytes: -1 }, { id: 'imported:../../escape' },
  ])('rejects invalid or out-of-budget metadata: %j', (patch) => {
    expect(normalizeImportedSounds([{ ...sound, ...patch }])).toEqual([]);
  });

  it('deduplicates IDs and enforces the library limit while reading stored data', () => {
    const many = Array.from({ length: 15 }, (_, index) => {
      const id: ImportedAlarmSound['id'] = `imported:example-${10000000 + index}`;
      return { ...sound, id, fileName: importedSoundFileName(id) };
    });
    expect(normalizeImportedSounds([sound, sound])).toEqual([sound]);
    expect(normalizeImportedSounds(many)).toHaveLength(MAX_IMPORTED_SOUNDS);
    expect(() => addImportedSound(normalizeImportedSounds(many), sound)).toThrow(/10 imported sounds/);
  });

  it('rejects a duplicate import without overwriting its existing record', () => {
    expect(() => addImportedSound([sound], { ...sound, label: 'Replacement' })).toThrow();
  });

  it('keeps readable file labels without extensions or control characters', () => {
    expect(soundLabel('Morning song.mp3')).toBe('Morning song');
    expect(soundLabel('\u0000My alarm.wav')).toBe('My alarm');
    expect(soundLabel('.wav')).toBe('Imported sound');
  });
});
