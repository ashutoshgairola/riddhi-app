/**
 * Wizard step bodies — RN port of OBGoals/OBIncome/OBAccounts/OBSync/
 * OBGoal/OBSecure (project/riddhi/MobileOnboard.jsx:50-308).
 */
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Path, Polyline, Rect } from 'react-native-svg';

import { useBiometricLabel } from '../../auth/biometricLabel';
import { BankLogo } from '../../components/BankLogo';
import { Chip, Toggle } from '../../components/ui';
import { useTheme } from '../../theme/ThemeProvider';
import { radius, weight } from '../../theme/tokens';
import { AuthInput, PressableScale } from '../auth/authUi';
import { OBKeypad, amountKey } from './obUi';

export function CheckSm({ color = '#1a1228', size = 13, strokeWidth = 3.4 }: { color?: string; size?: number; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="20 6 9 17 4 12" />
    </Svg>
  );
}

// ── Step 1: Goals (MobileOnboard.jsx:50-82) ─────────────────────────
export const GOAL_OPTS = [
  { id: 'track', i: '📊', l: 'Track my spending', d: 'See where money goes' },
  { id: 'save', i: '🌱', l: 'Save more', d: 'Build a cushion' },
  { id: 'budget', i: '◎', l: 'Stick to a budget', d: 'Spend with intent' },
  { id: 'invest', i: '▲', l: 'Grow investments', d: 'Track my portfolio' },
  { id: 'debt', i: '✂️', l: 'Pay off debt', d: 'Clear cards & loans' },
];

export function OBGoals({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const { t } = useTheme();
  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  return (
    <View style={{ gap: 10 }}>
      {GOAL_OPTS.map((o) => {
        const on = value.includes(o.id);
        return (
          <PressableScale key={o.id} onPress={() => toggle(o.id)}>
            <View
              style={[
                styles.optRow,
                { backgroundColor: on ? t.emDim : t.glassBg, borderColor: on ? t.emGlow : t.glassBrd },
              ]}
            >
              <View style={[styles.optIcon, { backgroundColor: on ? t.em : t.bg3 }]}>
                <Text style={{ fontSize: 20, color: on ? '#1a1228' : t.text2 }}>{o.i}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 14.5, fontFamily: weight(700), color: on ? t.em : t.text1 }}>{o.l}</Text>
                <Text style={{ fontSize: 11.5, color: t.text3, marginTop: 2, fontFamily: weight(500) }}>{o.d}</Text>
              </View>
              <View
                style={[
                  styles.radio,
                  { backgroundColor: on ? t.em : 'transparent', borderColor: on ? t.em : t.borderStr },
                ]}
              >
                {on ? <CheckSm /> : null}
              </View>
            </View>
          </PressableScale>
        );
      })}
    </View>
  );
}

// ── Step 2: Income (MobileOnboard.jsx:104-136) ──────────────────────
const INCOME_PRESETS = [30000, 60000, 100000, 200000];

export function OBIncome({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useTheme();
  return (
    <View>
      <View style={{ alignItems: 'center', paddingTop: 6, paddingBottom: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5 }}>
          <Text style={{ fontSize: 28, color: t.text3, fontFamily: weight(600) }}>₹</Text>
          <Text
            style={{
              fontSize: 54,
              fontFamily: weight(800),
              letterSpacing: -1.89, // -0.035em of 54px
              color: value === '' ? t.text3 : t.text1,
              lineHeight: 58,
            }}
          >
            {value === '' ? '0' : Number(value).toLocaleString('en-IN')}
          </Text>
        </View>
        <Text style={{ fontSize: 12.5, color: t.text3, marginTop: 8, fontFamily: weight(500) }}>
          per month · you can change this later
        </Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 22 }}>
        {INCOME_PRESETS.map((p) => (
          <Chip key={p} onPress={() => onChange(String(p))}>
            {`₹${p >= 100000 ? `${p / 100000}L` : `${p / 1000}K`}`}
          </Chip>
        ))}
      </View>

      <OBKeypad onKey={(k) => onChange(amountKey(value, k))} />
    </View>
  );
}

// ── Step 3: Accounts (MobileOnboard.jsx:139-178) ────────────────────
export const BANKS = [
  { id: 'hdfc', n: 'HDFC Bank', logo: 'H', col: '#004c8f' },
  { id: 'icici', n: 'ICICI Bank', logo: 'I', col: '#ae282e' },
  { id: 'sbi', n: 'SBI', logo: 'S', col: '#2d4d8f' },
  { id: 'axis', n: 'Axis Bank', logo: 'A', col: '#97144d' },
  { id: 'paytm', n: 'Paytm', logo: 'P', col: '#00398f' },
  { id: 'zerodha', n: 'Zerodha', logo: 'Z', col: '#387ed1' },
];

function LockIcon({ color }: { color: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Rect x={3} y={11} width={18} height={11} rx={2} />
      <Path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </Svg>
  );
}

export function OBAccounts({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const { t } = useTheme();
  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  return (
    <View>
      <View style={styles.bankGrid}>
        {BANKS.map((b) => {
          const on = value.includes(b.id);
          return (
            <PressableScale key={b.id} onPress={() => toggle(b.id)} style={styles.bankCell}>
              <View
                style={[
                  styles.bankRow,
                  { backgroundColor: on ? t.emDim : t.glassBg, borderColor: on ? t.emGlow : t.glassBrd },
                ]}
              >
                <BankLogo name={b.n} size={36} radius={10} fallbackColor={b.col} fallbackText={b.logo} />
                <Text
                  style={{ flex: 1, fontSize: 13, lineHeight: 16, color: t.text1, fontFamily: weight(700) }}
                  numberOfLines={2}
                >
                  {b.n}
                </Text>
                {/* Same-width slot in both states so selecting never reflows the name (#11). */}
                <View style={[styles.bankCheck, { backgroundColor: on ? t.em : 'transparent' }]}>
                  {on ? <CheckSm size={11} strokeWidth={3.6} /> : null}
                </View>
              </View>
            </PressableScale>
          );
        })}
      </View>
      <View style={[styles.securityNote, { backgroundColor: t.glassBg, borderColor: t.glassBrd }]}>
        <View style={{ marginTop: 1 }}>
          <LockIcon color={t.em} />
        </View>
        <Text style={{ flex: 1, fontSize: 11.5, color: t.text3, lineHeight: 17.25, fontFamily: weight(500) }}>
          Bank-grade 256-bit encryption. Riddhi is read-only — we can never move your money.
        </Text>
      </View>
    </View>
  );
}

// ── Step 4: Auto-sync (MobileOnboard.jsx:181-221) ───────────────────
const SYNC_FEATS = [
  { i: '⚡', l: 'Zero manual entry', d: 'Spends, salary and bills appear on their own' },
  { i: '🔒', l: 'Fully on-device', d: 'Message content never leaves your phone' },
  { i: '🏷', l: 'Auto-categorized', d: 'Riddhi tags the merchant and category' },
];

function SyncIcon({ color }: { color: string }) {
  return (
    <Svg width={38} height={38} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <Path d="M3 3v5h5" />
      <Path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
      <Path d="M16 16h5v5" />
    </Svg>
  );
}

export function OBSync({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  const { t } = useTheme();
  return (
    <View>
      <View style={{ alignItems: 'center', paddingTop: 6, paddingBottom: 22 }}>
        <View style={[styles.syncBadge, { backgroundColor: value ? t.emDim : t.bg3 }]}>
          <SyncIcon color={value ? t.em : t.text3} />
        </View>
      </View>

      <PressableScale onPress={() => onChange(!value)}>
        <View style={[styles.syncToggleRow, { backgroundColor: t.glassBg, borderColor: value ? t.emGlow : t.glassBrd }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, color: t.text1, fontFamily: weight(700) }}>Read bank SMS</Text>
            <Text style={{ fontSize: 12, color: t.text3, marginTop: 3, fontFamily: weight(500) }}>
              Auto-log transactions as they arrive
            </Text>
          </View>
          <Toggle on={value} onChange={onChange} />
        </View>
      </PressableScale>

      <View style={{ gap: 12, marginTop: 22 }}>
        {SYNC_FEATS.map((x) => (
          <View key={x.l} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
            <View style={[styles.syncFeatIcon, { backgroundColor: t.glassBg, borderColor: t.glassBrd }]}>
              <Text style={{ fontSize: 15 }}>{x.i}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13.5, color: t.text1, fontFamily: weight(700) }}>{x.l}</Text>
              <Text style={{ fontSize: 11.5, color: t.text3, marginTop: 2, lineHeight: 16.1, fontFamily: weight(500) }}>{x.d}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Step 5: First goal (MobileOnboard.jsx:224-268) ──────────────────
export const GOAL_PRESETS = [
  { l: 'Emergency fund', i: '🛟', amt: 200000 },
  { l: 'Goa trip', i: '🏖', amt: 50000 },
  { l: 'New iPhone', i: '📱', amt: 80000 },
  { l: 'House down pay', i: '🏠', amt: 1000000 },
];

export function OBGoal({
  name,
  onName,
  target,
  onTarget,
}: {
  name: string;
  onName: (v: string) => void;
  target: string;
  onTarget: (v: string) => void;
}) {
  const { t } = useTheme();
  return (
    <View>
      <AuthInput value={name} onChangeText={onName} placeholder="Name your goal" style={{ marginBottom: 12 }} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
        {GOAL_PRESETS.map((p) => {
          const on = name === p.l;
          return (
            <Pressable
              key={p.l}
              onPress={() => {
                onName(p.l);
                onTarget(String(p.amt));
              }}
            >
              <View
                style={[
                  styles.goalPreset,
                  { backgroundColor: on ? t.emDim : t.bg2, borderColor: on ? t.emGlow : t.border },
                ]}
              >
                <Text style={{ fontSize: 15 }}>{p.i}</Text>
                <Text style={{ fontSize: 13, color: on ? t.em : t.text2, fontFamily: weight(600) }}>{p.l}</Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={{ alignItems: 'center', paddingTop: 20, paddingBottom: 16 }}>
        <Text style={[styles.targetLabel, { color: t.text3, fontFamily: weight(700) }]}>TARGET AMOUNT</Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5 }}>
          <Text style={{ fontSize: 26, color: t.text3, fontFamily: weight(600) }}>₹</Text>
          <Text
            style={{
              fontSize: 48,
              fontFamily: weight(800),
              letterSpacing: -1.68, // -0.035em of 48px
              color: target === '' ? t.text3 : t.em,
              lineHeight: 52,
            }}
          >
            {target === '' ? '0' : Number(target).toLocaleString('en-IN')}
          </Text>
        </View>
      </View>

      <OBKeypad onKey={(k) => onTarget(amountKey(target, k))} />
    </View>
  );
}

// ── Step 6: Secure (MobileOnboard.jsx:271-308) ──────────────────────
function FaceIdSm({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 2a5 5 0 0 0-5 5v3a5 5 0 0 0 10 0V7a5 5 0 0 0-5-5z" />
      <Path d="M4 11v2a8 8 0 0 0 16 0v-2" />
    </Svg>
  );
}

export function OBSecure({
  pin,
  onPin,
  biometric,
  onBiometric,
}: {
  pin: string;
  onPin: (v: string) => void;
  biometric: boolean;
  onBiometric: (v: boolean) => void;
}) {
  const { t } = useTheme();
  const bioLabel = useBiometricLabel();
  const press = (k: string) => {
    if (k === 'del') return onPin(pin.slice(0, -1));
    if (k === '.') return;
    if (pin.length >= 4) return;
    onPin(pin + k);
  };
  return (
    <View>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16, paddingTop: 8, paddingBottom: 26 }}>
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            style={{
              width: 18,
              height: 18,
              borderRadius: 9,
              backgroundColor: i < pin.length ? t.em : 'transparent',
              borderWidth: 2,
              borderColor: i < pin.length ? t.em : t.borderStr,
              transform: [{ scale: i < pin.length ? 1.1 : 1 }],
            }}
          />
        ))}
      </View>

      <OBKeypad onKey={press} />

      <PressableScale onPress={() => onBiometric(!biometric)}>
        <View style={[styles.bioRow, { backgroundColor: t.glassBg, borderColor: biometric ? t.emGlow : t.glassBrd }]}>
          <View style={[styles.bioIcon, { backgroundColor: biometric ? t.emDim : t.bg3 }]}>
            <FaceIdSm color={biometric ? t.em : t.text3} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14.5, color: t.text1, fontFamily: weight(700) }}>{`Enable ${bioLabel}`}</Text>
            <Text style={{ fontSize: 11.5, color: t.text3, marginTop: 2, fontFamily: weight(500) }}>
              Unlock without typing your PIN
            </Text>
          </View>
          <Toggle on={biometric} onChange={onBiometric} />
        </View>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  optRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingVertical: 14,
    paddingHorizontal: 15,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  optIcon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bankGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  bankCell: {
    flexBasis: '47%',
    flexGrow: 1,
  },
  bankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 13,
    paddingHorizontal: 12,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  bankCheck: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  securityNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  syncBadge: { width: 80, height: 80, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  syncToggleRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: radius.lg, borderWidth: 1 },
  syncFeatIcon: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  goalPreset: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 9, paddingHorizontal: 14, borderRadius: 99, borderWidth: 1 },
  targetLabel: { fontSize: 11.5, letterSpacing: 0.92, marginBottom: 8 },
  bioRow: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 15, paddingHorizontal: 16, marginTop: 20, borderRadius: radius.lg, borderWidth: 1 },
  bioIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
