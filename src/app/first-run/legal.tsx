import { useState } from 'react';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DataSeal, PrimaryButton, Subtle } from '../../components/ui';
import { LegalSections } from '../../components/legal/LegalSections';
import { LEGAL_DOCUMENT_VERSION, legalPages } from '../../data/legal';
import { useAppState } from '../../state/AppStateProvider';
import { useNavoColors } from '../../theme/colors';

export default function FirstRunLegalScreen() {
  const app = useAppState();
  const colors = useNavoColors();
  const [reachedEnd, setReachedEnd] = useState(false);
  const [checked, setChecked] = useState(false);
  const [scrollHeight, setScrollHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const [problem, setProblem] = useState('');

  const markIfShort = (nextContentHeight: number, nextScrollHeight: number) => {
    if (nextContentHeight > 0 && nextScrollHeight > 0 && nextContentHeight <= nextScrollHeight + 8) setReachedEnd(true);
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    if (contentOffset.y + layoutMeasurement.height >= contentSize.height - 20) setReachedEnd(true);
  };

  const continueToSetup = async () => {
    if (!reachedEnd || !checked || !app.ready) return;
    setProblem('');
    try {
      await app.updateState({ firstRun: {
        ...app.firstRun,
        legalAcknowledgement: { version: LEGAL_DOCUMENT_VERSION, acknowledgedAt: new Date().toISOString() },
      } });
      router.replace('/first-run/profile');
    } catch {
      setProblem('Navo could not save your acknowledgment. Check device storage and try again.');
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <View style={styles.heading}>
        <View style={[styles.headingMark, { backgroundColor: colors.accentSoft }]}><Feather name="shield" size={18} color={colors.accent} /></View>
        <View style={styles.headingCopy}>
          <Text accessibilityRole="header" style={[styles.title, { color: colors.ink }]}>Privacy & legal</Text>
          <Subtle>Review this information before using Navo.</Subtle>
        </View>
      </View>
      <DataSeal label="Draft · owner review required" tone="warning" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.document}
        onContentSizeChange={(_width, height) => { setContentHeight(height); markIfShort(height, scrollHeight); }}
        onLayout={(event) => { const height = event.nativeEvent.layout.height; setScrollHeight(height); markIfShort(contentHeight, height); }}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator
      >
        <Text style={[styles.intro, { color: colors.muted }]}>Read the complete information below. When you reach the end, confirm that you reviewed it.</Text>
        <LegalSections sections={legalPages.all.sections} onLinkProblem={setProblem} />
      </ScrollView>
      <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.line }]}>
        {!reachedEnd ? <Text style={[styles.hint, { color: colors.muted }]}>Scroll to the end to enable the acknowledgment.</Text> : null}
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked, disabled: !reachedEnd }}
          disabled={!reachedEnd}
          onPress={() => setChecked((current) => !current)}
          style={[styles.acknowledgement, { opacity: reachedEnd ? 1 : 0.52 }]}
        >
          <View style={[styles.checkbox, { borderColor: checked ? colors.accent : colors.quiet, backgroundColor: checked ? colors.accent : 'transparent' }]}>
            {checked ? <Feather name="check" size={14} color={colors.onAccent} /> : null}
          </View>
          <Text style={[styles.acknowledgementText, { color: colors.ink }]}>I have reviewed the full Privacy & Legal information above.</Text>
        </Pressable>
        {problem ? <Text accessibilityRole="alert" style={[styles.problem, { color: colors.danger }]}>{problem}</Text> : null}
        <PrimaryButton title="Continue" onPress={() => void continueToSetup()} disabled={!reachedEnd || !checked || !app.ready} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flex: 1 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 13 },
  headingMark: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  headingCopy: { flex: 1, gap: 2 },
  title: { fontSize: 23, lineHeight: 29, fontWeight: '700', letterSpacing: -0.45 },
  document: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 20, gap: 20 },
  intro: { fontSize: 14, lineHeight: 21 },
  footer: { gap: 11, paddingHorizontal: 20, paddingTop: 13, borderTopWidth: StyleSheet.hairlineWidth },
  hint: { fontSize: 12, lineHeight: 17 },
  acknowledgement: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkbox: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center', borderRadius: 6, borderWidth: 1.5 },
  acknowledgementText: { flex: 1, fontSize: 13, lineHeight: 19, fontWeight: '600' },
  problem: { fontSize: 13, lineHeight: 19 },
});
