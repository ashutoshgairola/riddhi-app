/**
 * Wizard step bodies — RN port of OBGoals/OBIncome/OBAccounts
 * (project/riddhi/MobileOnboard.jsx:50-178). Steps 4-6 (OBSync/OBGoal/
 * OBSecure) are appended in the next task.
 */
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path, Polyline, Rect } from 'react-native-svg';

import { Chip } from '../../components/ui';
import { useTheme } from '../../theme/ThemeProvider';
import { radius, weight } from '../../theme/tokens';
import { PressableScale } from '../auth/authUi';
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
                <View style={[styles.bankLogo, { backgroundColor: b.col }]}>
                  <Text style={{ fontSize: 15, color: '#fff', fontFamily: weight(700) }}>{b.logo}</Text>
                </View>
                <Text style={{ flex: 1, fontSize: 13, color: t.text1, fontFamily: weight(700) }} numberOfLines={1}>
                  {b.n}
                </Text>
                {on ? (
                  <View style={[styles.bankCheck, { backgroundColor: t.em }]}>
                    <CheckSm size={11} strokeWidth={3.6} />
                  </View>
                ) : null}
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
    gap: 11,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  bankLogo: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bankCheck: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
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
});
