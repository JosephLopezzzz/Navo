import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { DataSeal, Screen } from '../../components/ui';
import { LegalSections } from '../../components/legal/LegalSections';
import { isLegalPageKey, legalPages } from '../../data/legal';
import { useNavoColors } from '../../theme/colors';

export default function LegalInformationScreen() {
  const colors = useNavoColors();
  const params = useLocalSearchParams<{ page?: string }>();
  const page = isLegalPageKey(params.page) ? legalPages[params.page] : legalPages.privacy;
  const [linkProblem, setLinkProblem] = useState('');

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={styles.backButton}>
          <Feather name="arrow-left" size={20} color={colors.ink} />
        </Pressable>
        <Text accessibilityRole="header" style={[styles.title, { color: colors.ink }]}>{page.title}</Text>
      </View>
      <DataSeal label="Draft · owner review required" tone="warning" />
      <LegalSections sections={page.sections} onLinkProblem={setLinkProblem} />
      {linkProblem ? <Text accessibilityRole="alert" style={[styles.linkProblem, { color: colors.danger }]}>{linkProblem}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 8 },
  backButton: { width: 42, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 24, lineHeight: 30, fontWeight: '700', letterSpacing: -0.5 },
  linkProblem: { fontSize: 13, lineHeight: 19 },
});
