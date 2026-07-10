/**
 * Chat — "Ask Munshi", the AI chat that is a universal interface to the
 * whole app: the backend agent reads and changes data through tools
 * (transactions, budgets, goals, accounts, categories, investments,
 * reports) and streams text + native widget cards back over SSE.
 *
 * Streaming path: streamChat (expo/fetch SSE) → ChatStreamEvents reduced
 * into block-based ChatMsgs (src/screens/chat/types.ts). If the stream
 * can't start, falls back to the buffered POST /ai-chat/messages; if it
 * drops mid-turn, shows an error bubble with Retry (the server persisted
 * everything that completed).
 *
 * Risky actions (updates/deletes/large amounts) arrive as confirmation
 * widgets — nothing is written until the user taps Confirm on the card
 * (chat/ConfirmationCard.tsx).
 *
 * Thread history lives server-side; the sms icon in the topbar opens
 * ThreadsSheet to resume a past thread or start fresh. Deep links can pass
 * `entry.data = { threadId?, prefill?, autoSend? }` (Home insight cards
 * use prefill+autoSend).
 *
 * Image attach: there is no OCR/vision pipeline (the chat turn is text-only),
 * so a picked image is shown and answered honestly — Munshi ji asks the user to
 * type the amount/merchant, which the real agent then logs. It never invents
 * a transaction from the picture.
 */
import { useEffect, useRef, useState } from "react";
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
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as Crypto from "expo-crypto";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { IconButton, SearchButton, TopbarActions } from "../components/ui";
import { MI } from "../components/icons";
import { AppIcon } from "../components/contentIcons";
import { PageBackground } from "../components/PageBackground";
import { useTheme } from "../theme/ThemeProvider";
import { weight } from "../theme/tokens";
import { useNav, type ScreenEntry } from "../app/navContext";
import { api } from "../api";
import { streamChat, ChatStreamInterrupted } from "../api/chatStream";
import { chatApi } from "../api/chatApi";
import {
  applyEvent,
  hydrateMessages,
  nextLocalId,
  userMsg,
  type ChatBlock,
  type ChatMsg,
} from "./chat/types";
import { WidgetRenderer } from "./chat/WidgetRenderer";
import { ToolStatusChip } from "./chat/ToolStatusChip";
import { ThreadsSheet } from "./chat/ThreadsSheet";

const CHAT_SUGGESTIONS = [
  "I ordered pizza at 5 for ₹1,000",
  "Where am I overspending this month?",
  "How are my goals doing?",
  "Got my ₹1,18,000 salary today",
];

// Honest reply when a user attaches an image — there is no OCR yet, so we
// never fabricate a transaction; we ask for the details in text instead.
const IMAGE_REPLY =
  "I can't read receipts from images yet. Tell me the amount and where you spent it — e.g. “₹2,340 at Reliance Smart” — and I'll log it right away.";

// ── Typing indicator dot ─────────────────────────────────────────────────
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
    // progress is a stable Reanimated shared value ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delayMs]);

  const style = useAnimatedStyle(() => ({
    opacity: 0.3 + progress.value * 0.7,
    transform: [{ translateY: -3 * progress.value }],
  }));

  return (
    <Animated.View style={[styles.dot, { backgroundColor: color }, style]} />
  );
}

interface ChatEntryData {
  threadId?: string;
  prefill?: string;
  autoSend?: boolean;
}

export function Chat({ entry }: { entry: ScreenEntry }) {
  const { t } = useTheme();
  const { pop, openAdd } = useNav();
  const insets = useSafeAreaInsets();
  const entryData = (entry.data ?? {}) as ChatEntryData;

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState(entryData.prefill ?? "");
  const [busy, setBusy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const threadIdRef = useRef<string | undefined>(entryData.threadId);
  const lastSentRef = useRef<string | null>(null);
  // clientMsgId of the last turn; Retry reuses it so the backend dedupes the
  // turn (replay/resume) instead of logging a second action.
  const lastClientMsgIdRef = useRef<string | null>(null);
  // Aborts the in-flight stream when the screen unmounts (navigate-away).
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const bootRef = useRef(false);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [messages, busy]);

  // Abort any in-flight stream on navigate-away so we stop reading a dead pipe.
  useEffect(() => () => abortRef.current?.abort(), []);

  const loadThread = async (threadId: string) => {
    setBusy(true);
    try {
      const detail = await chatApi.getThread(threadId);
      threadIdRef.current = detail.id;
      setMessages(hydrateMessages(detail.messages));
    } catch {
      appendError("Couldn't load that chat.", false);
    } finally {
      setBusy(false);
    }
  };

  const appendError = (message: string, retryable: boolean) => {
    setMessages((m) => [
      ...m,
      {
        id: nextLocalId(),
        role: "assistant",
        blocks: [{ type: "error", message, retryable }],
      },
    ]);
  };

  const send = async (text?: string, clientMsgId?: string) => {
    const q = (text ?? input).trim();
    if (!q || busy) return;
    setInput("");
    lastSentRef.current = q;
    // Fresh send → a new turn id. Retry → reuse the failed turn's id so the
    // backend recognizes it as the same turn and never double-logs.
    const turnId = clientMsgId ?? Crypto.randomUUID();
    lastClientMsgIdRef.current = turnId;
    setMessages((m) => [...m, userMsg(q)]);
    setBusy(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await streamChat({
        threadId: threadIdRef.current,
        message: q,
        clientMsgId: turnId,
        signal: controller.signal,
        onEvent: (event) => {
          if (event.type === "message_start")
            threadIdRef.current = event.threadId;
          setMessages((m) => applyEvent(m, event));
        },
      });
    } catch (err) {
      // Screen unmounted (navigate-away) — drop silently, no error UI.
      if (controller.signal.aborted) return;
      if (err instanceof ChatStreamInterrupted) {
        appendError("Connection dropped mid-reply.", true);
      } else {
        // Stream never started — fall back to the buffered endpoint.
        try {
          const res = await chatApi.sendMessageBuffered(
            threadIdRef.current,
            q,
            turnId,
          );
          threadIdRef.current = res.threadId;
          const blocks: ChatBlock[] = res.blocks.map((b) =>
            b.type === "text"
              ? { type: "text", text: b.text ?? "" }
              : { type: "widget", widget: b.widget! },
          );
          setMessages((m) => [
            ...m,
            { id: res.messageId, role: "assistant", blocks },
          ]);
        } catch {
          appendError("Couldn't reach Munshi ji. Check your connection.", true);
        }
      }
    } finally {
      setBusy(false);
    }
  };

  // Deep-link boot: hydrate a thread and/or auto-send a prefilled prompt.
  useEffect(() => {
    if (bootRef.current) return;
    bootRef.current = true;
    if (entryData.threadId) void loadThread(entryData.threadId);
    else if (entryData.prefill && entryData.autoSend)
      void send(entryData.prefill);
    // boot runs exactly once for this screen entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePickImage = async () => {
    if (busy) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: false,
      quality: 0.7,
      base64: true,
    });
    if (result.canceled || result.assets.length === 0) return;
    const asset = result.assets[0];

    // Show the picked image immediately, plus a "reading…" placeholder we
    // update once the backend vision scan returns.
    const scanMsgId = nextLocalId();
    setMessages((m) => [
      ...m,
      { id: nextLocalId(), role: "user", blocks: [], image: asset.uri },
      {
        id: scanMsgId,
        role: "assistant",
        blocks: [{ type: "text", text: "Reading your receipt…" }],
      },
    ]);

    const replaceScanMsg = (text: string) =>
      setMessages((m) =>
        m.map((msg) =>
          msg.id === scanMsgId
            ? { ...msg, blocks: [{ type: "text" as const, text }] }
            : msg,
        ),
      );

    if (!asset.base64) {
      replaceScanMsg(IMAGE_REPLY);
      return;
    }

    try {
      const allowed = [
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif",
      ] as const;
      const mime = (allowed as readonly string[]).includes(asset.mimeType ?? "")
        ? (asset.mimeType as (typeof allowed)[number])
        : "image/jpeg";
      const scanned = await api.receipts.scan(asset.base64, mime);
      if (scanned.amount) {
        const where = scanned.merchant ? ` at ${scanned.merchant}` : "";
        replaceScanMsg(
          `I read ₹${scanned.amount.toLocaleString("en-IN")}${where}. Opening it for you to confirm.`,
        );
        openAdd({
          type: scanned.type === "income" ? "income" : "expense",
          amount: scanned.amount,
          desc: scanned.merchant ?? undefined,
          category: scanned.category ?? undefined,
        });
      } else {
        replaceScanMsg(IMAGE_REPLY);
      }
    } catch {
      replaceScanMsg(IMAGE_REPLY);
    }
  };

  const selectThread = (threadId: string | null) => {
    setHistoryOpen(false);
    if (threadId) {
      void loadThread(threadId);
    } else {
      threadIdRef.current = undefined;
      setMessages([]);
    }
  };

  const empty = messages.length === 0;
  const canSend = input.trim().length > 0 && !busy;
  const lastMsg = messages[messages.length - 1];
  const showTyping =
    busy && (lastMsg?.role !== "assistant" || lastMsg.blocks.length === 0);

  const renderBlock = (block: ChatBlock, key: string, isUser: boolean) => {
    switch (block.type) {
      case "text":
        if (!block.text.trim()) return null;
        return (
          <View
            key={key}
            style={[
              styles.bubble,
              isUser
                ? [styles.bubbleUser, { backgroundColor: t.em }]
                : [
                    styles.bubbleBot,
                    {
                      backgroundColor: t.bg1,
                      borderColor: t.border,
                      borderWidth: 1,
                    },
                  ],
            ]}
          >
            <Text
              style={[
                styles.bubbleText,
                {
                  color: isUser ? "#1a1228" : t.text1,
                  fontFamily: weight(isUser ? 500 : 400),
                },
              ]}
            >
              {block.text}
            </Text>
          </View>
        );
      case "widget":
        return <WidgetRenderer key={key} widget={block.widget} />;
      case "tool_status":
        return (
          <ToolStatusChip
            key={key}
            label={block.label}
            done={block.done}
            ok={block.ok}
          />
        );
      case "error":
        return (
          <View key={key} style={styles.errorWrap}>
            <View
              style={[
                styles.errorBubble,
                { backgroundColor: t.redDim, borderColor: t.red },
              ]}
            >
              <Text
                style={[
                  styles.errorText,
                  { color: t.red, fontFamily: weight(500) },
                ]}
              >
                {block.message}
              </Text>
            </View>
            {block.retryable && lastSentRef.current ? (
              <Pressable
                onPress={() => {
                  const retry = lastSentRef.current;
                  // Reuse the failed turn's id → backend replays/resumes it
                  // instead of running (and narrating) the action a second time.
                  const retryId = lastClientMsgIdRef.current;
                  // Drop the failed turn's error bubble before retrying.
                  setMessages((m) =>
                    m.filter((msg) => !msg.blocks.includes(block)),
                  );
                  void send(retry ?? undefined, retryId ?? undefined);
                }}
                style={[
                  styles.retryBtn,
                  { backgroundColor: t.bg2, borderColor: t.border },
                ]}
              >
                <MI.refresh size={13} color={t.text2} />
                <Text
                  style={[
                    styles.retryText,
                    { color: t.text2, fontFamily: weight(600) },
                  ]}
                >
                  Retry
                </Text>
              </Pressable>
            ) : null}
          </View>
        );
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.page}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={insets.top}
    >
      <PageBackground />

      {/* topbar */}
      <View style={[styles.topbar, { paddingTop: insets.top + 14 }]}>
        <IconButton onPress={pop}>
          <MI.back size={20} color={t.text1} />
        </IconButton>
        <View style={styles.topbarMid}>
          <View style={[styles.sparkleBox, { backgroundColor: t.emDim }]}>
            <Image
              source={require("../../assets/munshi.png")}
              style={styles.sparkleLogo}
            />
          </View>
          <View>
            <Text
              style={[
                styles.title,
                { color: t.text1, fontFamily: weight(700) },
              ]}
            >
              Ask Munshi ji
            </Text>
            <View style={styles.onlineRow}>
              <AppIcon value="dot" size={16} color={t.em} />
              <Text
                style={[
                  styles.online,
                  { color: t.em, fontFamily: weight(600) },
                ]}
              >
                Online
              </Text>
            </View>
          </View>
        </View>
        <TopbarActions>
          <SearchButton />
          <IconButton onPress={() => setHistoryOpen(true)}>
            <MI.sms size={18} color={t.text1} />
          </IconButton>
        </TopbarActions>
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
              <Image
                source={require("../../assets/munshi.png")}
                style={styles.emptyLogo}
              />
            </View>
            <Text
              style={[
                styles.emptyTitle,
                { color: t.text1, fontFamily: weight(700) },
              ]}
            >
              Every rupee,{"\n"}accounted for.
            </Text>
            <Text
              style={[
                styles.emptySubtitle,
                { color: t.text3, fontFamily: weight(400) },
              ]}
            >
              Log spends, move budgets, track goals, or ask anything — Munshi ji
              keeps the hisaab.
            </Text>

            <View style={styles.emptyActions}>
              <Pressable
                onPress={handlePickImage}
                style={[
                  styles.scanBtn,
                  {
                    backgroundColor: t.emDim,
                    borderColor: "rgba(182,164,243,0.25)",
                  },
                ]}
              >
                <MI.camera size={16} color={t.em} />
                <Text
                  style={[
                    styles.scanBtnText,
                    { color: t.em, fontFamily: weight(600) },
                  ]}
                >
                  Attach a bill or bank screenshot
                </Text>
              </Pressable>
              {CHAT_SUGGESTIONS.map((s) => (
                <Pressable
                  key={s}
                  onPress={() => send(s)}
                  style={[
                    styles.suggestionBtn,
                    { backgroundColor: t.bg1, borderColor: t.border },
                  ]}
                >
                  <MI.arrow size={15} color={t.text3} />
                  <Text
                    style={[
                      styles.suggestionText,
                      { color: t.text1, fontFamily: weight(500) },
                    ]}
                  >
                    {s}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {messages.map((m) => (
          <View
            key={m.id}
            style={[
              styles.msgRow,
              { alignItems: m.role === "user" ? "flex-end" : "flex-start" },
            ]}
          >
            {m.image ? (
              <Image
                source={{ uri: m.image }}
                style={[styles.receiptImage, { borderColor: t.border }]}
                resizeMode="cover"
              />
            ) : null}
            {m.blocks.map((block, i) =>
              renderBlock(block, `${m.id}-${i}`, m.role === "user"),
            )}
          </View>
        ))}

        {showTyping && (
          <View style={styles.typingRow}>
            <View
              style={[
                styles.typingBubble,
                { backgroundColor: t.bg1, borderColor: t.border },
              ]}
            >
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
          {
            borderTopColor: t.border,
            backgroundColor: t.bg,
            paddingBottom: Math.max(insets.bottom, 0) + 12,
          },
        ]}
      >
        <Pressable
          onPress={handlePickImage}
          style={[
            styles.attachBtn,
            { backgroundColor: t.bg2, borderColor: t.border },
          ]}
        >
          <MI.camera size={19} color={t.text2} />
        </Pressable>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Message Munshi…"
          placeholderTextColor={t.text3}
          multiline
          style={[
            styles.input,
            { backgroundColor: t.bg2, borderColor: t.border, color: t.text1 },
          ]}
        />
        <Pressable
          onPress={() => send()}
          disabled={!canSend}
          style={[styles.sendBtn, { backgroundColor: canSend ? t.em : t.bg3 }]}
        >
          <MI.send
            size={19}
            color={canSend ? "#1a1228" : t.text3}
            strokeWidth={2.2}
          />
        </Pressable>
      </View>

      <ThreadsSheet
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onSelect={selectThread}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
  },
  topbar: {
    position: "relative",
    paddingTop: 14,
    paddingHorizontal: 18,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  topbarMid: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sparkleBox: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    overflow: "hidden",
  },
  sparkleLogo: {
    width: 34,
    height: 34,
    resizeMode: "cover",
  },
  title: {
    fontSize: 15,
    letterSpacing: -0.15,
  },
  onlineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: -1,
  },
  online: {
    fontSize: 10.5,
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
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    overflow: "hidden",
  },
  emptyLogo: {
    width: 54,
    height: 54,
    resizeMode: "cover",
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
    flexDirection: "column",
    gap: 8,
    marginTop: 22,
  },
  scanBtn: {
    paddingVertical: 13,
    paddingHorizontal: 15,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
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
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  suggestionText: {
    fontSize: 13.5,
    flexShrink: 1,
  },
  msgRow: {
    flexDirection: "column",
    marginBottom: 14,
  },
  bubble: {
    maxWidth: "82%",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 18,
    marginTop: 6,
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
  errorWrap: {
    marginTop: 6,
    gap: 8,
  },
  errorBubble: {
    maxWidth: "82%",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderBottomLeftRadius: 5,
    borderWidth: 1,
  },
  errorText: {
    fontSize: 13,
    lineHeight: 19,
  },
  retryBtn: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 13,
    borderRadius: 13,
    borderWidth: 1,
  },
  retryText: {
    fontSize: 12,
  },
  typingRow: {
    flexDirection: "row",
    marginBottom: 14,
  },
  typingBubble: {
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 18,
    borderBottomLeftRadius: 5,
    borderWidth: 1,
    flexDirection: "row",
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
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 9,
  },
  attachBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
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
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
});
