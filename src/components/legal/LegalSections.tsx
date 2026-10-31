import Feather from '@expo/vector-icons/Feather';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { NavoPressable as Pressable } from '../NavoPressable';
import type { LegalSection } from '../../data/legal';
import { useNavoColors } from '../../theme/colors';

export function LegalSections({ sections, onLinkProblem }: { sections: LegalSection[]; onLinkProblem: (message: string) => void }) {
  const colors = useNavoColors();

  const openLink = (url: string) => {
    onLinkProblem('');
    void Linking.openURL(url).catch(() => onLinkProblem('This link could not be opened.'));
  };

  return (
    <View style={styles.list}>
      {sections.map((section, index) => (
        <View key={`${section.title}-${index}`} style={styles.section}>
          <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.ink }]}>{section.title}</Text>
          {section.body ? <Text style={[styles.body, { color: colors.muted }]}>{section.body}</Text> : null}
          {section.links?.map((link) => (
            <Pressable key={link.url} accessibilityRole="link" onPress={() => openLink(link.url)} style={styles.linkRow}>
              <Text style={[styles.linkText, { color: colors.accent }]}>{link.label}</Text>
              <Feather name="external-link" size={15} color={colors.accent} />
            </Pressable>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 22 },
  section: { gap: 7 },
  sectionTitle: { fontSize: 16, lineHeight: 22, fontWeight: '700' },
  body: { fontSize: 14, lineHeight: 22 },
  linkRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 5 },
  linkText: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '600' },
});
