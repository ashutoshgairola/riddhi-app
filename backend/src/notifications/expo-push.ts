export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  channelId: 'default';
  sound: 'default';
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

export function buildExpoMessages(
  tokens: string[],
  n: { title: string; body: string; data: Record<string, unknown> },
): ExpoPushMessage[] {
  return tokens.map((to) => ({
    to,
    title: n.title,
    body: n.body,
    data: n.data,
    channelId: 'default',
    sound: 'default',
  }));
}
