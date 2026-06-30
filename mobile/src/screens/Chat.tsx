/**
 * Chat — RN port of `project/riddhi/MobileChat.jsx` (the `MobileChat`
 * component, lines 107–251), the "Ask Riddhi" conversational logging +
 * planning assistant.
 *
 * Building blocks reused rather than reimplemented:
 *  - `PageBackground` for the `.m-page` gradient + glow.
 *  - `IconButton` for the back button.
 *  - `MI.sparkle`/`MI.back`/`MI.arrow`/`MI.camera`/`MI.send` for icons.
 *  - `useNav().pop` for the back button.
 *  - `ChatTxCard` (this directory) for the extracted-transaction card
 *    rendered under a bot message.
 *  - `askRiddhi`/`localParse` (src/ai) for the reply/transaction logic.
 *
 * The web topbar here is custom (not the shared `Topbar`/`MPageShell`):
 * it's a 2-line title+status block next to the sparkle icon box rather
 * than `Topbar`'s single-line title slot, so it's hand-built the same way
 * `Home.tsx` hand-builds its topbar for an analogous reason (see that
 * file's header comment) — same `.m-topbar` padding/row shape, just a
 * different middle slot. Per the task spec the topbar is intentionally
 * static (no `scrolled` glass toggle — the source never wires `onScroll`
 * on `.m-topbar` here, only the body scrolls).
 *
 * Image picking uses `expo-image-picker`'s `launchImageLibraryAsync`, the
 * same RN substitution `AddTxSheet.tsx` already uses in place of the web's
 * hidden `<input type=file>` + `URL.createObjectURL` (MobileChat.jsx:134–147)
 * — the picked image's local `uri` is used directly as the message's
 * `image` field.
 *
 * Source values transcribed verbatim:
 *  - `CHAT_SUGGESTIONS` — MobileChat.jsx:3–8.
 *  - `RECEIPT_RESULTS` — MobileChat.jsx:11–16.
 *  - `send`/`handleFile` logic — MobileChat.jsx:117–127, 134–147.
 *  - Message bubble / typing-dot styling — MobileChat.jsx:196–220.
 *  - Composer layout — MobileChat.jsx:225–248.
 *
 * Typing indicator (`.chat-dot` / `@keyframes chatDot`, mobile.css:680–684,
 * 714–717): 3 dots, each looping opacity 0.3->1->0.3 and translateY
 * 0->-3->0 over 1s, staggered by 0.16s — ported via per-dot Reanimated
 * `withRepeat(withSequence(...))` loops started with a `setTimeout` stagger
 * matching the CSS `animation-delay`.
 */
import { useEffect, useRef, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { IconButton } from '../components/ui';
import { MI } from '../components/icons';
import { PageBackground } from '../components/PageBackground';
import { useTheme } from '../theme/ThemeProvider';
import { weight } from '../theme/tokens';
import { useNav, type ScreenEntry } from '../app/navContext';
import { askRiddhi, type ChatMessage } from '../ai/askRiddhi';
import type { ChatTx } from '../ai/localParse';
import { ChatTxCard } from './ChatTxCard';

// MobileChat.jsx:3–8
const CHAT_SUGGESTIONS = [
  'I ordered pizza at 5 for ₹1,000',
  'How do I plan budget to finish my bike goal?',
  'Got my ₹1,18,000 salary today',
  'Where am I overspending this month?',
];

interface ReceiptResult {
  reply: string;
  tx: ChatTx;
}

// MobileChat.jsx:11–16
const RECEIPT_RESULTS: ReceiptResult[] = [
  {
    reply: 'Read your receipt — ₹2,340 at Reliance Smart. Filed under Groceries.',
    tx: { merchant: 'Reliance Smart', amount: -2340, category: 'Groceries', time: '' },
  },
  {
    reply: 'Pulled it from the screenshot — ₹899 Jio recharge. Logged under Bills.',
    tx: { merchant: 'Jio Recharge', amount: -899, category: 'Bills', time: '' },
  },
  {
    reply: 'Got ₹1,560 at Apollo Pharmacy from the bill. Added to Health.',
    tx: { merchant: 'Apollo Pharmacy', amount: -1560, category: 'Health', time: '' },
  },
  {
    reply: 'From the bank screenshot — ₹4,200 to Croma. Filed under Shopping.',
    tx: { merchant: 'Croma', amount: -4200, category: 'Shopping', time: '' },
  },
];

const RECEIPT_DELAY_MS = 1600;

interface ChatMsg {
  role: 'user' | 'bot';
  text?: string;
  image?: string;
  tx?: ChatTx | null;
}

// ── Typing indicator dot (chatDot keyframes, mobile.css:714–717) ────────
function TypingDot({ delayMs, color }: { delayMs: number; color: string }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delayMs,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 300, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: 700, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
      ),
    );
    // progress is a stable Reanimated shared value ref; only re-run on
    // prop changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delayMs]);

  const style = useAnimatedStyle(() => ({
    opacity: 0.3 + progress.value * 0.7,
    transform: [{ translateY: -3 * progress.value }],
  }));

  return <Animated.View style={[styles.dot, { backgroundColor: color }, style]} />;
}

export function Chat({ entry: _entry }: { entry: ScreenEntry }) {
  const { t } = useTheme();
  const { pop } = useNav();
  const insets = useSafeAreaInsets();

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const receiptIdx = useRef(0);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [messages, busy]);

  // MobileChat.jsx:117–127
  const send = async (text?: string) => {
    const q = (text ?? input).trim();
    if (!q || busy) return;
    setInput('');
    const next: ChatMessage[] = [...messages.map((m) => ({ role: m.role, text: m.text ?? '' })), { role: 'user', text: q }];
    setMessages((m) => [...m, { role: 'user', text: q }]);
    setBusy(true);
    const res = await askRiddhi(next);
    setMessages((m) => [...m, { role: 'bot', text: res.reply, tx: res.transaction }]);
    setBusy(false);
  };

  // MobileChat.jsx:134–147
  const handlePickImage = async () => {
    if (busy) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
      quality: 0.8,
    });
    if (result.canceled || result.assets.length === 0) return;
    const uri = result.assets[0].uri;
    setMessages((m) => [...m, { role: 'user', image: uri }]);
    setBusy(true);
    setTimeout(() => {
      const r = RECEIPT_RESULTS[receiptIdx.current % RECEIPT_RESULTS.length];
      receiptIdx.current += 1;
      setMessages((m) => [...m, { role: 'bot', text: r.reply, tx: r.tx }]);
      setBusy(false);
    }, RECEIPT_DELAY_MS);
  };

  const empty = messages.length === 0;
  const canSend = input.trim().length > 0 && !busy;

  return (
    <KeyboardAvoidingView
      style={styles.page}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.top}
    >
      <PageBackground />

      {/* topbar */}
      <View style={styles.topbar}>
        <IconButton onPress={pop}>
          <MI.back size={20} color={t.text1} />
        </IconButton>
        <View style={styles.topbarMid}>
          <View style={[styles.sparkleBox, { backgroundColor: t.emDim }]}>
            <MI.sparkle size={17} color={t.em} />
          </View>
          <View>
            <Text style={[styles.title, { color: t.text1, fontFamily: weight(700) }]}>Ask Riddhi</Text>
            <Text style={[styles.online, { color: t.em, fontFamily: weight(600) }]}>● Online</Text>
          </View>
        </View>
      </View>

      {/* body */}
      <ScrollView
        ref={scrollRef}
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
      >
        {empty && (
          <View style={styles.emptyWrap}>
            <View style={[styles.emptySparkle, { backgroundColor: t.emDim }]}>
              <MI.sparkle size={26} color={t.em} />
            </View>
            <Text style={[styles.emptyTitle, { color: t.text1, fontFamily: weight(700) }]}>
              Just tell me{'\n'}what happened.
            </Text>
            <Text style={[styles.emptySubtitle, { color: t.text3, fontFamily: weight(400) }]}>
              Log a spend in plain words, attach a bill, or ask how to hit your goals.
            </Text>

            <View style={styles.emptyActions}>
              <Pressable
                onPress={handlePickImage}
                style={[styles.scanBtn, { backgroundColor: t.emDim, borderColor: 'rgba(182,164,243,0.25)' }]}
              >
                <MI.camera size={16} color={t.em} />
                <Text style={[styles.scanBtnText, { color: t.em, fontFamily: weight(600) }]}>
                  Scan a bill or bank screenshot
                </Text>
              </Pressable>
              {CHAT_SUGGESTIONS.map((s) => (
                <Pressable
                  key={s}
                  onPress={() => send(s)}
                  style={[styles.suggestionBtn, { backgroundColor: t.bg1, borderColor: t.border }]}
                >
                  <MI.arrow size={15} color={t.text3} />
                  <Text style={[styles.suggestionText, { color: t.text1, fontFamily: weight(500) }]}>{s}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {messages.map((m, i) => (
          <View
            key={i}
            style={[styles.msgRow, { alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }]}
          >
            {m.text ? (
              <View
                style={[
                  styles.bubble,
                  m.role === 'user'
                    ? [styles.bubbleUser, { backgroundColor: t.em }]
                    : [styles.bubbleBot, { backgroundColor: t.bg1, borderColor: t.border, borderWidth: 1 }],
                ]}
              >
                <Text
                  style={[
                    styles.bubbleText,
                    {
                      color: m.role === 'user' ? '#1a1228' : t.text1,
                      fontFamily: weight(m.role === 'user' ? 500 : 400),
                    },
                  ]}
                >
                  {m.text}
                </Text>
              </View>
            ) : null}
            {m.image ? (
              <Image
                source={{ uri: m.image }}
                style={[styles.receiptImage, { borderColor: t.border }]}
                resizeMode="cover"
              />
            ) : null}
            {m.tx ? <ChatTxCard tx={m.tx} /> : null}
          </View>
        ))}

        {busy && (
          <View style={styles.typingRow}>
            <View style={[styles.typingBubble, { backgroundColor: t.bg1, borderColor: t.border }]}>
              <TypingDot delayMs={0} color={t.text3} />
              <TypingDot delayMs={160} color={t.text3} />
              <TypingDot delayMs={320} color={t.text3} />
            </View>
          </View>
        )}
      </ScrollView>

      {/* composer */}
      <View
        style={[
          styles.composer,
          { borderTopColor: t.border, backgroundColor: t.bg, paddingBottom: Math.max(insets.bottom, 0) + 12 },
        ]}
      >
        <Pressable
          onPress={handlePickImage}
          style={[styles.attachBtn, { backgroundColor: t.bg2, borderColor: t.border }]}
        >
          <MI.camera size={19} color={t.text2} />
        </Pressable>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Message Riddhi…"
          placeholderTextColor={t.text3}
          multiline
          style={[styles.input, { backgroundColor: t.bg2, borderColor: t.border, color: t.text1 }]}
        />
        <Pressable
          onPress={() => send()}
          disabled={!canSend}
          style={[styles.sendBtn, { backgroundColor: canSend ? t.em : t.bg3 }]}
        >
          <MI.send size={19} color={canSend ? '#1a1228' : t.text3} strokeWidth={2.2} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
  },
  topbar: {
    position: 'relative',
    paddingTop: 14,
    paddingHorizontal: 18,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  topbarMid: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sparkleBox: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  title: {
    fontSize: 15,
    letterSpacing: -0.15,
  },
  online: {
    fontSize: 10.5,
    marginTop: -1,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 8,
    flexGrow: 1,
  },
  emptyWrap: {
    paddingTop: 24,
  },
  emptySparkle: {
    width: 54,
    height: 54,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 21,
    letterSpacing: -0.42,
    lineHeight: 26,
  },
  emptySubtitle: {
    fontSize: 13.5,
    marginTop: 8,
    lineHeight: 20,
  },
  emptyActions: {
    flexDirection: 'column',
    gap: 8,
    marginTop: 22,
  },
  scanBtn: {
    paddingVertical: 13,
    paddingHorizontal: 15,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  scanBtnText: {
    fontSize: 13.5,
    flexShrink: 1,
  },
  suggestionBtn: {
    paddingVertical: 13,
    paddingHorizontal: 15,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  suggestionText: {
    fontSize: 13.5,
    flexShrink: 1,
  },
  msgRow: {
    flexDirection: 'column',
    marginBottom: 14,
  },
  bubble: {
    maxWidth: '82%',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 18,
  },
  bubbleUser: {
    borderBottomRightRadius: 5,
  },
  bubbleBot: {
    borderBottomLeftRadius: 5,
  },
  bubbleText: {
    fontSize: 14,
    lineHeight: 21,
  },
  receiptImage: {
    width: 200,
    height: 260,
    borderRadius: 16,
    borderWidth: 1,
  },
  typingRow: {
    flexDirection: 'row',
    marginBottom: 14,
  },
  typingBubble: {
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 18,
    borderBottomLeftRadius: 5,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  composer: {
    flexShrink: 0,
    paddingTop: 10,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 9,
  },
  attachBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  input: {
    flex: 1,
    maxHeight: 96,
    paddingVertical: 11,
    paddingHorizontal: 15,
    borderRadius: 20,
    borderWidth: 1,
    fontSize: 14,
    lineHeight: 19.6,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});
