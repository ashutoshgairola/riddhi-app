/**
 * ThreadsSheet — chat history in the shared BottomSheet: a "New chat" row
 * plus recent threads (title + relative time) from GET /ai-chat/threads.
 * Selecting a thread hands its id back to Chat, which rehydrates it.
 */
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { BottomSheet } from '../../components/BottomSheet';
import { MI } from '../../components/icons';
import { useTheme } from '../../theme/ThemeProvider';
import { weight } from '../../theme/tokens';
import { chatApi, type ThreadSummary } from '../../api/chatApi';

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function ThreadsSheet({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (threadId: string | null) => void;
}) {
  const { t } = useTheme();
  const [threads, setThreads] = useState<ThreadSummary[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open) return;
    setThreads(null);
    setError(false);
    chatApi
      .listThreads()
      .then(setThreads)
      .catch(() => setError(true));
  }, [open]);

  return (
    <BottomSheet open={open} onClose={onClose} title="Chats">
      <Pressable
        onPress={() => onSelect(null)}
        style={[styles.row, styles.newChat, { backgroundColor: t.emDim }]}
      >
        <MI.sparkle size={16} color={t.em} />
        <Text style={[styles.newChatText, { color: t.em, fontFamily: weight(600) }]}>
          New chat
        </Text>
      </Pressable>

      {error && (
        <Text style={[styles.note, { color: t.text3, fontFamily: weight(400) }]}>
          Couldn't load your chats.
        </Text>
      )}
      {!error && threads === null && (
        <View style={styles.loading}>
          <ActivityIndicator color={t.em} />
        </View>
      )}
      {threads?.length === 0 && (
        <Text style={[styles.note, { color: t.text3, fontFamily: weight(400) }]}>
          No past chats yet.
        </Text>
      )}
      {threads?.map((thread) => (
        <Pressable
          key={thread.id}
          onPress={() => onSelect(thread.id)}
          style={[styles.row, { borderBottomColor: t.border }]}
        >
          <Text
            style={[styles.title, { color: t.text1, fontFamily: weight(500) }]}
            numberOfLines={1}
          >
            {thread.title}
          </Text>
          <Text style={[styles.time, { color: t.text3, fontFamily: weight(500) }]}>
            {relativeTime(thread.lastMessageAt)}
          </Text>
        </Pressable>
      ))}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  newChat: {
    borderRadius: 13,
    paddingHorizontal: 14,
    borderBottomWidth: 0,
    marginBottom: 6,
  },
  newChatText: {
    fontSize: 13.5,
  },
  title: {
    flex: 1,
    fontSize: 13.5,
  },
  time: {
    fontSize: 11,
    flexShrink: 0,
  },
  loading: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  note: {
    fontSize: 12.5,
    paddingVertical: 16,
    textAlign: 'center',
  },
});
