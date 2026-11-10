import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import Feather from '@expo/vector-icons/Feather';
import { ALARM_TONES, DEFAULT_ALARM_TONE_ID, getAlarmTone, isBuiltInAlarmToneId, type AlarmTone, type AlarmToneId } from '../domain/alarm-tones';
import { addImportedSound, MAX_IMPORTED_SOUNDS, type ImportedAlarmSound } from '../domain/imported-alarm-sounds';
import { ALARM_TONE_PREVIEWS } from '../data/alarm-tone-previews';
import { canImportAlarmSounds, deleteImportedSoundFile, importAlarmSound, importedSoundUri } from '../services/imported-alarm-sounds';
import { useAppState } from '../state/AppStateProvider';
import { readAppState } from '../services/storage';
import { useNavoColors } from '../theme/colors';
import { NavoPressable as Pressable } from './NavoPressable';

interface Props {
  value: AlarmToneId;
  onChange: (id: AlarmToneId) => void;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
  scroll?: boolean;
}

export function AlarmSoundPicker({ value, onChange, disabled = false, onBusyChange, scroll = false }: Props) {
  const colors = useNavoColors();
  const app = useAppState();
  const { height } = useWindowDimensions();
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const [previewing, setPreviewing] = useState<AlarmToneId | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const mounted = useRef(true);
  const operation = useRef(false);
  const previewRevision = useRef(0);
  const locked = disabled || busy;
  const tones: AlarmTone[] = [...ALARM_TONES, ...app.importedAlarmSounds.map((sound) => getAlarmTone(sound.id, app.importedAlarmSounds))];

  const stopPreview = useCallback(() => {
    previewRevision.current += 1;
    // Expo may have released the native player before navigation's unmount cleanup.
    try { player.pause(); } catch { /* Nothing can keep playing after release. */ }
  }, [player]);
  useFocusEffect(useCallback(() => stopPreview, [stopPreview]));
  useEffect(() => { if (disabled) stopPreview(); }, [disabled, stopPreview]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; onBusyChange?.(false); };
  }, [onBusyChange]);

  const preview = async (id: AlarmToneId) => {
    const wasPlaying = previewing === id && status.playing;
    stopPreview();
    setPreviewing(null);
    setProblem(null);
    if (wasPlaying) return;
    const revision = previewRevision.current;
    try {
      const tone = getAlarmTone(id, app.importedAlarmSounds);
      const source = tone.imported ? { uri: await importedSoundUri(tone.imported) } : isBuiltInAlarmToneId(id) ? ALARM_TONE_PREVIEWS[id] : undefined;
      if (!source || !mounted.current || revision !== previewRevision.current) return;
      player.replace(source);
      setPreviewing(id);
      player.play();
    } catch (error) {
      if (mounted.current && revision === previewRevision.current) setProblem(error instanceof Error ? error.message : 'This sound could not be played.');
    }
  };

  const startOperation = () => {
    if (operation.current || disabled) return false;
    operation.current = true;
    stopPreview();
    setPreviewing(null);
    setProblem(null);
    setBusy(true);
    onBusyChange?.(true);
    return true;
  };
  const finishOperation = () => {
    operation.current = false;
    if (mounted.current) { setBusy(false); onBusyChange?.(false); }
  };

  const importSound = async () => {
    if (!startOperation()) return;
    let sound: ImportedAlarmSound | null = null;
    let saved = false;
    try {
      if (app.importedAlarmSounds.length >= MAX_IMPORTED_SOUNDS) throw new Error('Remove an imported sound before adding another.');
      sound = await importAlarmSound(app.importedAlarmSounds);
      if (!sound) return;
      const imported = sound;
      await app.mutateState((current) => ({ ...current, importedAlarmSounds: addImportedSound(current.importedAlarmSounds, imported) }));
      saved = true;
      if (mounted.current) onChange(imported.id);
    } catch (error) {
      if (sound && !saved) {
        // A write can commit before the provider's refresh fails. Never delete a registered clip.
        const importedId = sound.id;
        const stored = await readAppState().catch(() => null);
        if (stored && !stored.importedAlarmSounds.some((item) => item.id === importedId)) {
          await deleteImportedSoundFile(sound).catch(() => undefined);
        }
      }
      if (mounted.current) setProblem(sound && !saved ? 'The import could not be confirmed. Reopen this editor before trying again.' : error instanceof Error ? error.message : 'This sound could not be imported.');
    } finally { finishOperation(); }
  };

  const removeSound = async (sound: ImportedAlarmSound) => {
    if (!startOperation()) return;
    try {
      await app.mutateState((current) => ({
        ...current,
        importedAlarmSounds: current.importedAlarmSounds.filter((item) => item.id !== sound.id),
        destinationAlarms: current.destinationAlarms.map((alarm) => alarm.ringtoneId === sound.id ? { ...alarm, ringtoneId: DEFAULT_ALARM_TONE_ID } : alarm),
      }));
      if (mounted.current && value === sound.id) onChange(DEFAULT_ALARM_TONE_ID);
      await deleteImportedSoundFile(sound);
    } catch {
      if (mounted.current) setProblem('Removal could not finish. Check your sound selection. Unused audio files are cleaned up on later imports.');
    } finally { finishOperation(); }
  };

  const rows = (
    <View style={styles.list}>
      {tones.map((tone) => {
        const selected = value === tone.id;
        const canPreview = Boolean(tone.imported || (isBuiltInAlarmToneId(tone.id) && ALARM_TONE_PREVIEWS[tone.id]));
        const isPlaying = previewing === tone.id && status.playing;
        return (
          <View key={tone.id} style={[styles.row, { borderColor: selected ? colors.accent : colors.line, backgroundColor: selected ? colors.accentSoft : colors.surface }]}>
            <Pressable motion="card" accessibilityRole="radio" accessibilityLabel={tone.label} accessibilityState={{ checked: selected, disabled: locked }} disabled={locked}
              onPress={() => { stopPreview(); setPreviewing(null); setProblem(null); onChange(tone.id); }} style={styles.choice}>
              <Feather name={selected ? 'check-circle' : 'circle'} size={19} color={selected ? colors.accent : colors.muted} />
              <View style={styles.copy}>
                <Text numberOfLines={1} style={[styles.title, { color: colors.ink }]}>{tone.label}</Text>
                <Text numberOfLines={1} style={[styles.detail, { color: colors.muted }]}>{tone.detail}</Text>
              </View>
            </Pressable>
            <Pressable motion="compact" accessibilityRole="button" accessibilityLabel={canPreview ? `${isPlaying ? 'Pause' : 'Preview'} ${tone.label}` : 'System default preview unavailable'}
              disabled={locked || !canPreview} accessibilityState={{ disabled: locked || !canPreview }} onPress={() => void preview(tone.id)}
              style={[styles.iconButton, { opacity: canPreview ? 1 : 0.45 }]}>
              <Feather name={canPreview ? isPlaying ? 'pause' : 'play' : 'volume-1'} size={16} color={colors.accent} />
            </Pressable>
            {tone.imported ? (
              <Pressable motion="compact" accessibilityRole="button" accessibilityLabel={`Remove ${tone.label}`} disabled={locked} style={styles.iconButton}
                onPress={() => Alert.alert('Remove imported sound?', `Remove “${tone.label}” from Navo? Alarms using it will use System default.`, [
                  { text: 'Keep sound', style: 'cancel' },
                  { text: 'Remove', style: 'destructive', onPress: () => void removeSound(tone.imported!) },
                ])}>
                <Feather name="trash-2" size={16} color={colors.muted} />
              </Pressable>
            ) : null}
          </View>
        );
      })}
    </View>
  );

  return (
    <View style={styles.root}>
      {scroll ? <ScrollView nestedScrollEnabled style={{ maxHeight: Math.min(260, height * 0.3) }} keyboardShouldPersistTaps="handled">{rows}</ScrollView> : rows}
      <Pressable accessibilityRole="button" accessibilityLabel={busy ? 'Preparing audio file' : 'Import alarm sound from files'} disabled={locked || !app.ready || !canImportAlarmSounds}
        onPress={() => void importSound()} style={[styles.importButton, { borderColor: colors.line, opacity: locked || !canImportAlarmSounds ? 0.5 : 1 }]}>
        {busy ? <ActivityIndicator color={colors.accent} /> : <Feather name="upload" size={17} color={colors.accent} />}
        <Text style={[styles.importLabel, { color: colors.accent }]}>{busy ? 'Preparing audio…' : 'Import from files'}</Text>
      </Pressable>
      <Text style={[styles.note, { color: colors.muted }]}>{canImportAlarmSounds ? 'MP3, M4A or WAV · up to 20 MB. Keeps the first 25 seconds on this device. Up to 10 imported sounds.' : 'Install an updated Navo build to import audio files.'}</Text>
      {problem || status.error ? <Text accessibilityRole="alert" style={[styles.note, { color: colors.danger }]}>{problem ?? 'This sound could not be played. Try another file.'}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 9, flexShrink: 1 },
  list: { gap: 7 },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', paddingLeft: 10, paddingRight: 3, borderWidth: 1, borderRadius: 12 },
  choice: { flex: 1, minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 10 },
  copy: { flex: 1, gap: 2 },
  title: { fontSize: 12, lineHeight: 17, fontWeight: '700' },
  detail: { fontSize: 10, lineHeight: 14 },
  iconButton: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  importButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12 },
  importLabel: { fontSize: 13, fontWeight: '700' },
  note: { fontSize: 11, lineHeight: 16 },
});
