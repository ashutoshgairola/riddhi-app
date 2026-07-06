/**
 * BackendUrlCard — dev-only control to repoint the app at a different backend
 * (e.g. a fresh ngrok URL) without rebuilding. Rendered in Settings only when
 * EXPO_PUBLIC_SHOW_DEV_SETTINGS === '1' (set on internal EAS build profiles).
 */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { getBakedDefault, getBaseUrl, setBaseUrl } from '../api/baseUrl';
import { GlassCard } from '../components/Glass';
import { SectionHead } from '../components/ui';
import { useFeedback } from '../feedback/FeedbackProvider';
import { useTheme } from '../theme/ThemeProvider';
import { weight } from '../theme/tokens';

export function BackendUrlCard() {
  const { t } = useTheme();
  const { toast } = useFeedback();
  const [value, setValue] = useState(getBaseUrl());

  const save = async () => {
    await setBaseUrl(value);
    setValue(getBaseUrl());
    toast('Backend URL saved', '🔌');
  };

  const reset = async () => {
    await setBaseUrl(null);
    setValue(getBakedDefault());
    toast('Reset to default backend', '↩️');
  };

  return (
    <View style={styles.section}>
      <SectionHead title="Developer" />
      <GlassCard>
        <Text style={[styles.label, { color: t.text3 }]}>Backend URL</Text>
        <TextInput
          value={value}
          onChangeText={setValue}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="https://xxxx.ngrok-free.app"
          placeholderTextColor={t.text3}
          style={[
            styles.input,
            { color: t.text1, borderColor: t.border, backgroundColor: t.bg2 },
          ]}
        />
        <View style={styles.row}>
          <Pressable
            onPress={() => void save()}
            style={[styles.btn, { backgroundColor: t.bg2, borderColor: t.border }]}
          >
            <Text style={[styles.btnText, { color: t.text1, fontFamily: weight(600) }]}>
              Save
            </Text>
          </Pressable>
          <Pressable
            onPress={() => void reset()}
            style={[styles.btn, { backgroundColor: t.bg2, borderColor: t.border }]}
          >
            <Text style={[styles.btnText, { color: t.text3, fontFamily: weight(600) }]}>
              Reset
            </Text>
          </Pressable>
        </View>
      </GlassCard>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 18 },
  label: { fontSize: 12, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  row: { flexDirection: 'row', gap: 10, marginTop: 12 },
  btn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  btnText: { fontSize: 14 },
});
