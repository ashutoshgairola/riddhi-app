/**
 * useStatementImportLauncher — the shared pick → decrypt → parse launcher
 * for the statement-import feature (Slice C, Task 10). The three entry
 * points (`CardDetail`, `AccountDetail`, `Sync`) all call the returned
 * `launch(accountId?)`; this hook owns every step between "user tapped
 * Import statement" and "StatementReview is on screen":
 *
 *  1. `expo-document-picker`'s `getDocumentAsync` to pick a PDF.
 *  2. `expo-file-system`'s legacy `readAsStringAsync` (Base64 encoding) to
 *     read the picked file off disk — the *new* `expo-file-system` (v56,
 *     the `File`/`Directory` class API used elsewhere in this app, e.g.
 *     `lib/exportCsv.ts`) has no base64-read entry point; that capability
 *     only exists on the pre-56 API, re-exposed at the `expo-file-system/
 *     legacy` subpath (verified against the installed package's
 *     `build/legacy/FileSystem.d.ts` — `readAsStringAsync`/`EncodingType`
 *     live there, not on the top-level `.` export).
 *  3. `statementPdf.prepareUpload` (Task 4) — resolves to `{ pdf }` for an
 *     unencrypted PDF, or throws `PdfPasswordError` for an encrypted one.
 *     On that error this hook opens the password sheet below; the typed
 *     password is only ever handed back into `prepareUpload` (never sent
 *     anywhere, never persisted) and retried locally.
 *  4. `api.statements.parse` (Task 9) with the resolved `{pdf}|{text}` and
 *     the caller's `accountId` (if any).
 *  5. If no `accountId` was supplied (the Sync entry point) and the backend
 *     couldn't resolve one by last4 either (`view.account.id === null`),
 *     ask which account this statement is for (an action sheet, reusing
 *     `useFeedback().sheet` — no bespoke picker component needed) and
 *     re-parse scoped to that account, since dedup classification depends
 *     on it (`StatementsService.parse` dedups against the resolved
 *     account's existing transactions).
 *  6. Push `statement-review` with `{ view, accountId }`.
 *
 * Errors at any network/parse step are toasted, mirroring `Sync.tsx`'s
 * `runSync` convention (try/catch around the network call, toast on
 * failure, no thrown error escapes to a red-box).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';

import { api } from '../api';
import { BottomSheet } from '../components/BottomSheet';
import { Btn } from '../components/ui';
import { useTheme } from '../theme/ThemeProvider';
import { radius, weight } from '../theme/tokens';
import { spacing } from '../theme/spacing';
import { useFeedback } from '../feedback/FeedbackProvider';
import { useNav } from './navContext';
import { PdfPasswordError, prepareUpload, type PreparedUpload } from '../screens/statementPdf';
import type { StatementParseResultView } from '../screens/statementReview';

interface PasswordPromptState {
  open: boolean;
  base64: string;
  accountId?: string;
  error: string | null;
}

const CLOSED_PROMPT: PasswordPromptState = { open: false, base64: '', accountId: undefined, error: null };

export interface StatementImportLauncher {
  /** Opens the PDF picker and drives the flow through to `StatementReview`.
   * `accountId` is omitted only from the Sync entry point — the backend
   * resolves by last4, falling back to the account-picker sheet. */
  launch: (accountId?: string) => void;
  /** Mount once near the screen root (a sibling of `MPageShell`, like
   * `PayBillSheet` in `CardDetail`) — renders the password prompt sheet. */
  sheet: React.ReactNode;
}

export function useStatementImportLauncher(): StatementImportLauncher {
  const { push } = useNav();
  const { toast, sheet } = useFeedback();
  const [prompt, setPrompt] = useState<PasswordPromptState>(CLOSED_PROMPT);
  const [submitting, setSubmitting] = useState(false);
  // Guards against a double-tap opening the system picker twice.
  const pickerOpen = useRef(false);

  const pushReview = useCallback(
    (view: StatementParseResultView, accountId: string) => {
      push({ kind: 'statement-review', data: { view, accountId } });
    },
    [push],
  );

  /** No explicit account and no last4 match — ask which account this
   * statement belongs to, then re-parse scoped to it (classification/dedup
   * needs a concrete account). */
  const resolveAccountThenReview = useCallback(
    async (prepared: PreparedUpload, view: StatementParseResultView) => {
      const accounts = await api.accounts.list();
      const candidates = accounts.filter((a) =>
        view.statementType === 'card' ? a.type === 'credit' : a.type !== 'credit',
      );
      if (candidates.length === 0) {
        toast("No matching account to import into", '🏦');
        return;
      }
      sheet({
        title: 'Which account is this statement for?',
        options: candidates.map((a) => ({
          label: a.name,
          onPress: () => {
            void (async () => {
              try {
                const rescoped = await api.statements.parse(prepared, String(a.id));
                pushReview(rescoped, String(a.id));
              } catch {
                toast("Couldn't read that statement", '📄');
              }
            })();
          },
        })),
      });
    },
    [sheet, toast, pushReview],
  );

  const proceed = useCallback(
    async (prepared: PreparedUpload, accountId?: string) => {
      try {
        const view = await api.statements.parse(prepared, accountId);
        if (!accountId && !view.account.id) {
          await resolveAccountThenReview(prepared, view);
          return;
        }
        pushReview(view, accountId ?? view.account.id!);
      } catch {
        toast("Couldn't read that statement", '📄');
      }
    },
    [pushReview, resolveAccountThenReview, toast],
  );

  const launch = useCallback(
    (accountId?: string) => {
      if (pickerOpen.current) return;
      pickerOpen.current = true;
      void (async () => {
        try {
          const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf' });
          if (result.canceled || !result.assets?.[0]) return;
          const base64 = await FileSystem.readAsStringAsync(result.assets[0].uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          let prepared: PreparedUpload;
          try {
            prepared = await prepareUpload(base64);
          } catch (e) {
            if (e instanceof PdfPasswordError) {
              setPrompt({ open: true, base64, accountId, error: null });
              return;
            }
            throw e;
          }
          await proceed(prepared, accountId);
        } catch {
          toast("Couldn't open that PDF", '📄');
        } finally {
          pickerOpen.current = false;
        }
      })();
    },
    [proceed, toast],
  );

  const closePrompt = useCallback(() => setPrompt(CLOSED_PROMPT), []);

  const submitPassword = useCallback(
    (password: string) => {
      void (async () => {
        setSubmitting(true);
        try {
          const prepared = await prepareUpload(prompt.base64, password);
          const accountId = prompt.accountId;
          setPrompt(CLOSED_PROMPT);
          await proceed(prepared, accountId);
        } catch (e) {
          if (e instanceof PdfPasswordError) {
            setPrompt((p) => ({ ...p, error: 'Wrong password — try again' }));
          } else {
            setPrompt(CLOSED_PROMPT);
            toast("Couldn't read that statement", '📄');
          }
        } finally {
          setSubmitting(false);
        }
      })();
    },
    [prompt, proceed, toast],
  );

  const sheetNode = (
    <PasswordSheet
      open={prompt.open}
      error={prompt.error}
      submitting={submitting}
      onClose={closePrompt}
      onSubmit={submitPassword}
    />
  );

  return { launch, sheet: sheetNode };
}

interface PasswordSheetProps {
  open: boolean;
  error: string | null;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (password: string) => void;
}

/** The local password prompt — a small `BottomSheet` with a masked
 * `TextInput`. The password never leaves this component: `onSubmit` hands
 * it straight to `prepareUpload`, which decrypts on-device via pdfjs and
 * discards it. */
function PasswordSheet({ open, error, submitting, onClose, onSubmit }: PasswordSheetProps) {
  const { t } = useTheme();
  const [value, setValue] = useState('');
  const inputRef = useRef<TextInput>(null);

  // `BottomSheet` keeps its children mounted even while closed (it just
  // slides the surface offscreen), so a bare `autoFocus` here would grab the
  // keyboard the moment this sheet's host screen mounts — before the user has
  // opened anything. Instead, focus imperatively only when `open` flips true.
  // The short delay lets the open-slide start so the keyboard rises with it.
  useEffect(() => {
    if (!open) return;
    setValue('');
    const id = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(id);
  }, [open]);

  return (
    <BottomSheet open={open} onClose={onClose} title="Statement password">
      <View style={styles.body}>
        <Text style={[styles.hint, { color: t.text3 }]}>
          This PDF is password-protected. Enter its password to unlock it — it's used on this
          device only and is never sent anywhere.
        </Text>
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={setValue}
          placeholder="Password"
          placeholderTextColor={t.text3}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          onSubmitEditing={() => value && onSubmit(value)}
          style={[
            styles.input,
            { color: t.text1, backgroundColor: t.bg2, borderColor: error ? t.red : t.border, fontFamily: weight(600) },
          ]}
        />
        {error ? <Text style={[styles.error, { color: t.red }]}>{error}</Text> : null}
        <Btn onPress={() => value && onSubmit(value)} disabled={submitting || !value} style={styles.submit}>
          {submitting ? 'Unlocking…' : 'Unlock'}
        </Btn>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingBottom: spacing.xs,
    gap: spacing.sm,
  },
  hint: {
    fontSize: 12.5,
    lineHeight: 18,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 15,
  },
  error: {
    fontSize: 12,
    marginTop: -4,
  },
  submit: {
    marginTop: spacing.xxs,
  },
});
