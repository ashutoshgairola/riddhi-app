// Renders a bank's brand SVG logo (from assets/bank-logos, via BANK_LOGOS) and
// falls back to a colored box with an initial when no logo matches the name.
// Used by the onboarding bank picker, the Sync connected-banks row, and the
// Accounts cards so all three share one matching + fallback behavior.
import React, { useMemo } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { BANK_LOGOS } from '../assets/bankLogos';
import { weight } from '../theme/tokens';

// Keep in sync with `norm` in scripts/gen-bank-logos.js.
function norm(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]/g, '');
}

// App-facing names that don't literally match a logo filename.
const ALIASES: Record<string, string> = {
  sbi: 'statebankofindia',
  paytm: 'paytmpaymentsbank',
  paytmbank: 'paytmpaymentsbank',
  amex: 'americanexpress',
  citibank: 'citibank',
  citi: 'citibank',
  hsbc: 'hsbcbank',
  natwest: 'natwestbank',
  standardchartered: 'standardcharteredbank',
  scb: 'standardcharteredbank',
  indusind: 'induslndbank', // logo file is misspelled "Induslnd"
  indusindbank: 'induslndbank',
};

export function resolveBankLogo(name: string) {
  const key = norm(name);
  const aliased = ALIASES[key] ?? key;
  return BANK_LOGOS[aliased] ?? BANK_LOGOS[key];
}

export function hasBankLogo(name: string): boolean {
  return resolveBankLogo(name) != null;
}

export interface BankLogoProps {
  /** Institution name, e.g. "HDFC Bank". Matched case/space-insensitively. */
  name: string;
  /** Box side length in px. */
  size?: number;
  /** Corner radius of the box. */
  radius?: number;
  /** Background + initial shown when no logo matches. */
  fallbackColor?: string;
  /** Text shown in the fallback box (defaults to the name's first letter). */
  fallbackText?: string;
  fallbackTextColor?: string;
  style?: StyleProp<ViewStyle>;
}

export function BankLogo({
  name,
  size = 40,
  radius = 12,
  fallbackColor = 'rgba(255,255,255,0.18)',
  fallbackText,
  fallbackTextColor = '#fff',
  style,
}: BankLogoProps) {
  const Logo = useMemo(() => resolveBankLogo(name), [name]);
  const box: StyleProp<ViewStyle> = [
    styles.box,
    { width: size, height: size, borderRadius: radius },
    style,
  ];

  if (Logo) {
    const inner = Math.round(size * 0.62);
    return (
      <View style={[box, styles.logoBox]}>
        <Logo width={inner} height={inner} />
      </View>
    );
  }

  const initial = (fallbackText || name.trim().charAt(0) || '?').toUpperCase();
  return (
    <View style={[box, { backgroundColor: fallbackColor }]}>
      <Text
        style={{
          color: fallbackTextColor,
          fontFamily: weight(700),
          fontSize: Math.round(size * 0.4),
        }}
      >
        {initial}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoBox: {
    backgroundColor: '#fff',
  },
});
