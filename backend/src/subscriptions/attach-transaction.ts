import { Subscription } from './subscription.entity';
import { normalizeDescriptor } from './detect-subscriptions';

export function matchSubscription(
  description: string,
  accountId: string | null,
  subs: Pick<Subscription, 'id' | 'merchantDescriptor' | 'accountId' | 'status'>[],
): Subscription | null {
  const key = normalizeDescriptor(description);
  const hit = subs.find(
    (s) => s.status === 'active' && s.merchantDescriptor === key && (s.accountId ?? null) === (accountId ?? null),
  );
  return (hit as Subscription) ?? null;
}
