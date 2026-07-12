/**
 * PayBillSheet — pay a credit card's statement bill from a bank account.
 *
 * Source of truth: project/riddhi/MobileCards.jsx:10–113 (`PayBillSheet`).
 *
 * Three amount modes (radio rows, MobileCards.jsx:46–71): `total` (the
 * statement's billed amount — clears the cycle), `min` (the minimum due —
 * keeps the card active, interest still applies), `custom` (a typed
 * amount). The web version's `outstanding = store.cardOutstanding(card)`
 * for `total` is ported as `card.billed` here — `CardSummaryView` already
 * carries the statement's billed total as a first-class field (Task 6),
 * so no client-side re-derivation is needed.
 *
 * "Pay from" (MobileCards.jsx:82–102) lists bank accounts — non-credit
 * accounts with a positive balance, mirroring the web's
 * `accounts.filter(a => a.type !== 'wallet' || a.bal > 0)` intent (this
 * app's `AccountView.type` has no 'wallet' distinction, so the filter is
 * simplified to "not a credit card, and has money to pay with").
 *
 * The insufficient-balance guard (MobileCards.jsx:104,107) disables Pay
 * and shows a small red warning when the chosen amount exceeds the
 * selected account's balance.
 *
 * `api.cards.pay` calls `bumpData()` on success, and CardDetail's summary/
 * transactions (and this sheet's own account list) are all wired through
 * `useApiData`, which re-fetches on that same signal — so the card's
 * outstanding/available and the paying account's balance refresh
 * automatically once this sheet closes, no manual refresh needed.
 */
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { api } from "../api";
import type { AccountView, CardSummaryView } from "../api/types";
import { useApiData } from "../api/useApi";
import { BottomSheet } from "../components/BottomSheet";
import { AppIcon } from "../components/contentIcons";
import { Btn } from "../components/ui";
import { MI } from "../components/icons";
import { useFeedback } from "../feedback/FeedbackProvider";
import { useTheme } from "../theme/ThemeProvider";
import { radius, space, weight } from "../theme/tokens";

/** No-accounts fallback for `useApiData` (stable module-level reference —
 * see AddTxSheet.tsx for why this matters: a fresh array identity on every
 * render would look like a changed dep to any effect keyed on it). */
const EMPTY_ACCOUNTS: AccountView[] = [];

type PayMode = "total" | "min" | "custom";

// Money formatting — unsigned, en-IN grouped (CardDetail.tsx's `cFmt`).
function cFmt(n: number): string {
  return "₹" + Math.abs(Math.round(n)).toLocaleString("en-IN");
}

// Due-date formatting (CardDetail.tsx's `cFmtDate`).
function cFmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export interface PayBillSheetProps {
  open: boolean;
  onClose: () => void;
  card: CardSummaryView;
}

export function PayBillSheet({ open, onClose, card }: PayBillSheetProps) {
  const { t } = useTheme();
  const { toast } = useFeedback();

  const [mode, setMode] = useState<PayMode>("total");
  const [custom, setCustom] = useState("");
  const [fromAccountId, setFromAccountId] = useState<string | undefined>(undefined);
  const [paying, setPaying] = useState(false);

  const { data: accounts } = useApiData(() => api.accounts.list(), EMPTY_ACCOUNTS);
  // "Pay from" candidates: bank/other accounts (not the card itself) that
  // actually have money in them (MobileCards.jsx:17).
  const payAccounts = accounts.filter((a) => a.type !== "credit" && a.bal > 0);
  const selectedAccount = payAccounts.find((a) => String(a.id) === fromAccountId);

  // Reset the form on open (MobileCards.jsx:19) — mode/custom back to
  // defaults, and the account selection cleared so the effect below
  // re-picks the first eligible account for this run.
  useEffect(() => {
    if (!open) return;
    setMode("total");
    setCustom("");
    setFromAccountId(undefined);
  }, [open]);

  // Default to the first eligible "pay from" account once `accounts` has
  // loaded, same pattern as AddTxSheet's primary-account default — only
  // when nothing has claimed `fromAccountId` yet, so this doesn't clobber
  // a user's in-progress pick on later (unrelated) `bumpData` refetches.
  useEffect(() => {
    if (!open || fromAccountId || payAccounts.length === 0) return;
    setFromAccountId(String(payAccounts[0]!.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fromAccountId, payAccounts]);

  const amount =
    mode === "total" ? card.billed : mode === "min" ? card.minDue : Number(custom || 0);
  const insufficient = !!selectedAccount && amount > selectedAccount.bal;
  const canPay = amount > 0 && !!fromAccountId && !insufficient && !paying;

  const pay = async () => {
    if (!canPay || !fromAccountId) return;
    setPaying(true);
    try {
      await api.cards.pay(card.accountId, { fromAccountId, amount });
      toast(`${cFmt(amount)} paid to ${card.name}`, "💳");
      onClose();
    } catch {
      toast("Couldn't process the payment — try again", "📡");
    } finally {
      setPaying(false);
    }
  };

  const modeOptions: { key: PayMode; label: string; hint?: string; amount: number | null }[] = [
    { key: "total", label: "Total outstanding", hint: "Clears the card · avoids interest", amount: card.billed },
    { key: "min", label: "Minimum due", hint: "Keeps card active · interest applies", amount: card.minDue },
    { key: "custom", label: "Custom amount", amount: null },
  ];

  return (
    <BottomSheet open={open} onClose={onClose} title="Pay card bill">
      {/* card mini (MobileCards.jsx:37–43) */}
      <View style={styles.cardMini}>
        <Text style={[styles.cardMiniName, { color: t.text1, fontFamily: weight(700) }]} numberOfLines={1}>
          {card.name}
        </Text>
        <Text style={[styles.cardMiniSub, { color: t.text3, fontFamily: weight(500) }]}>
          •••• {card.last4 ?? "••••"} · due {cFmtDate(card.dueDate)}
        </Text>
      </View>

      {/* amount options (MobileCards.jsx:45–71) */}
      <View style={styles.optionList}>
        {modeOptions.map((o) => {
          const on = mode === o.key;
          return (
            <Pressable
              key={o.key}
              onPress={() => setMode(o.key)}
              style={[
                styles.optionRow,
                { backgroundColor: on ? t.emDim : t.glassBg, borderColor: on ? t.emGlow : t.glassBrd },
              ]}
            >
              <View style={[styles.radioOuter, { borderColor: on ? t.em : t.text3 }]}>
                {on ? <View style={[styles.radioInner, { backgroundColor: t.em }]} /> : null}
              </View>
              <View style={styles.optionTextBlock}>
                <Text style={[styles.optionLabel, { color: t.text1, fontFamily: weight(600) }]}>
                  {o.label}
                </Text>
                {o.hint ? (
                  <Text style={[styles.optionHint, { color: t.text3, fontFamily: weight(500) }]}>
                    {o.hint}
                  </Text>
                ) : null}
              </View>
              {o.amount != null ? (
                <Text
                  style={[
                    styles.optionAmount,
                    { color: on ? t.em : t.text2, fontFamily: weight(700) },
                  ]}
                >
                  {cFmt(o.amount)}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {/* custom amount input (MobileCards.jsx:73–79) */}
      {mode === "custom" ? (
        <View style={[styles.customBox, { backgroundColor: t.glassBg, borderColor: t.glassBrd }]}>
          <Text style={[styles.customSymbol, { color: t.text3, fontFamily: weight(700) }]}>₹</Text>
          <TextInput
            autoFocus
            value={custom}
            onChangeText={(v) => setCustom(v.replace(/[^0-9]/g, ""))}
            keyboardType="number-pad"
            placeholder="0"
            placeholderTextColor={t.text3}
            style={[styles.customInput, { color: t.text1, fontFamily: weight(700) }]}
          />
        </View>
      ) : null}

      {/* from account (MobileCards.jsx:81–102) */}
      <Text style={[styles.fromLabel, { color: t.text3, fontFamily: weight(600) }]}>Pay from</Text>
      <View style={styles.optionList}>
        {payAccounts.map((a) => {
          const on = String(a.id) === fromAccountId;
          return (
            <Pressable
              key={String(a.id)}
              onPress={() => setFromAccountId(String(a.id))}
              style={[
                styles.acctRow,
                { backgroundColor: on ? t.glassBg2 : t.glassBg, borderColor: on ? t.emGlow : t.glassBrd },
              ]}
            >
              <View style={styles.optionTextBlock}>
                <Text style={[styles.optionLabel, { color: t.text1, fontFamily: weight(600) }]} numberOfLines={1}>
                  {a.name}
                </Text>
                <Text style={[styles.optionHint, { color: t.text3, fontFamily: weight(500) }]}>
                  Balance {cFmt(a.bal)}
                </Text>
              </View>
              {on ? <MI.check size={18} color={t.em} strokeWidth={2.6} /> : null}
            </Pressable>
          );
        })}
        {payAccounts.length === 0 ? (
          <Text style={[styles.noAccounts, { color: t.text3, fontFamily: weight(500) }]}>
            No bank account with a balance to pay from.
          </Text>
        ) : null}
      </View>

      {insufficient ? (
        <View style={styles.warningRow}>
          <AppIcon value="warn" size={16} color={t.red} />
          <Text style={[styles.warning, { color: t.red, fontFamily: weight(600) }]}>
            Not enough balance in {selectedAccount?.name}
          </Text>
        </View>
      ) : null}

      <Btn variant="em" onPress={() => void pay()} disabled={!canPay} style={styles.payBtn}>
        {paying ? "Paying…" : `Pay ${amount ? cFmt(amount) : "₹0"}`}
      </Btn>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  cardMini: {
    paddingVertical: space[6],
    paddingBottom: space[16],
  },
  cardMiniName: {
    fontSize: 14,
  },
  cardMiniSub: {
    fontSize: 11.5,
    marginTop: space[4],
  },
  optionList: {
    gap: space[8],
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[12],
    paddingVertical: space[14],
    paddingHorizontal: space[16],
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  radioInner: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  optionTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  optionLabel: {
    fontSize: 14,
  },
  optionHint: {
    fontSize: 11,
    marginTop: space[2],
  },
  optionAmount: {
    fontSize: 15,
  },
  customBox: {
    marginTop: space[10],
    flexDirection: "row",
    alignItems: "center",
    gap: space[8],
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: space[16],
    height: 50,
  },
  customSymbol: {
    fontSize: 18,
  },
  customInput: {
    flex: 1,
    fontSize: 20,
  },
  fromLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginTop: space[18],
    marginBottom: space[8],
  },
  acctRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[12],
    paddingVertical: space[12],
    paddingHorizontal: space[14],
    borderRadius: radius.md,
    borderWidth: 1,
  },
  noAccounts: {
    fontSize: 12.5,
    paddingVertical: space[4],
  },
  warningRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[4],
    marginTop: space[10],
  },
  warning: {
    fontSize: 11.5,
  },
  payBtn: {
    marginTop: space[16],
    height: 52,
  },
});
