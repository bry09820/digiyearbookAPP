type Listener = (count: number) => void;

let unreadCount = 0;
const listeners = new Set<Listener>();

export function getCachedUnreadCount(): number {
  return unreadCount;
}

export function setCachedUnreadCount(count: number): void {
  const next = Math.max(0, Math.floor(count) || 0);
  if (next === unreadCount) return;
  unreadCount = next;
  listeners.forEach((listener) => listener(unreadCount));
}

export function subscribeUnreadCount(listener: Listener): () => void {
  listeners.add(listener);
  listener(unreadCount);
  return () => {
    listeners.delete(listener);
  };
}
