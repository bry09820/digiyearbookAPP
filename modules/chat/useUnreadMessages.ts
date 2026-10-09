import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { chatService } from '@/modules/chat/chatService';
import {
  getCachedUnreadCount,
  setCachedUnreadCount,
  subscribeUnreadCount,
} from '@/modules/chat/unreadStore';

const POLL_MS = 30_000;

/**
 * Polls unread message count for the Messages tab badge.
 * Safe for all authenticated users (no subscription gate).
 */
export function useUnreadMessages(enabled = true) {
  const [count, setCount] = useState(getCachedUnreadCount);

  const refresh = useCallback(async () => {
    if (!enabled) return 0;
    const next = await chatService.getUnreadCount();
    setCachedUnreadCount(next);
    return next;
  }, [enabled]);

  useEffect(() => subscribeUnreadCount(setCount), []);

  useEffect(() => {
    if (!enabled) return;

    void refresh();
    const interval = setInterval(() => {
      void refresh();
    }, POLL_MS);

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void refresh();
      }
    });

    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [enabled, refresh]);

  return { unreadCount: count, refreshUnread: refresh };
}
