import { useCallback, useEffect, useRef, useState } from 'react';
import { chatService } from '@/modules/chat/chatService';
import type { ChatMessage, ChatPeer, ChatThread } from '@/modules/chat/types';
import { getApiErrorMessage } from '@/services/api';
import { yearbookService } from '@/services/yearbook';
import { asText } from '@/utils/text';

const POLL_INTERVAL_MS = 4000;

type UseLiveChatOptions = {
  peer: ChatPeer | null;
  enabled: boolean;
};

/**
 * Loads a 1:1 thread and polls for new messages while the chat modal is open.
 * No subscription gating — any authenticated user can chat.
 */
export function useLiveChat({ peer, enabled }: UseLiveChatOptions) {
  const [thread, setThread] = useState<ChatThread | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentUserIdRef = useRef<string | null>(null);
  const threadIdRef = useRef<string | null>(null);
  const sendingRef = useRef(false);

  useEffect(() => {
    currentUserIdRef.current = currentUserId;
  }, [currentUserId]);

  useEffect(() => {
    threadIdRef.current = thread?.id ?? null;
  }, [thread?.id]);

  useEffect(() => {
    sendingRef.current = sending;
  }, [sending]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const mergeMessages = useCallback((incoming: ChatMessage[], existing: ChatMessage[]) => {
    const pending = existing.filter((m) => m.pending || m.failed);
    const byId = new Map<string, ChatMessage>();
    for (const msg of incoming) {
      byId.set(msg.id, msg);
    }
    for (const msg of pending) {
      const alreadySynced = incoming.some(
        (m) => m.isMine && m.body === msg.body && !m.pending,
      );
      if (!alreadySynced) {
        byId.set(msg.id, msg);
      }
    }
    return Array.from(byId.values()).sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  }, []);

  const loadThread = useCallback(
    async (activePeer: ChatPeer, opts?: { silent?: boolean }) => {
      const peerId = asText(activePeer.id);
      if (!peerId) return;

      if (!opts?.silent) {
        setLoading(true);
        setError(null);
      }

      try {
        let me = currentUserIdRef.current;
        if (!me) {
          const user = await yearbookService.getCurrentUser();
          const record =
            user && typeof user === 'object' ? (user as Record<string, unknown>) : null;
          me = asText(record?.id);
          if (!me) {
            throw new Error('You must be signed in to use chat.');
          }
          currentUserIdRef.current = me;
          setCurrentUserId(me);
        }

        if (me === peerId) {
          setError('You cannot message yourself.');
          setThread(null);
          return;
        }

        const next = await chatService.getThreadWithUser(activePeer, me);
        setThread((prev) => {
          if (!prev || asText(prev.peer.id) !== peerId) {
            return next;
          }
          return {
            ...next,
            messages: mergeMessages(next.messages, prev.messages),
          };
        });
        setError(null);
      } catch (err) {
        if (!opts?.silent) {
          setError(getApiErrorMessage(err, 'Unable to open chat.'));
        }
      } finally {
        if (!opts?.silent) {
          setLoading(false);
        }
      }
    },
    [mergeMessages],
  );

  useEffect(() => {
    if (!enabled || !peer) {
      stopPolling();
      setThread(null);
      setError(null);
      setLoading(false);
      return;
    }

    const activePeer = peer;
    void loadThread(activePeer);

    stopPolling();
    pollRef.current = setInterval(() => {
      void loadThread(activePeer, { silent: true });
    }, POLL_INTERVAL_MS);

    return () => {
      stopPolling();
    };
  }, [enabled, peer, loadThread, stopPolling]);

  const sendMessage = useCallback(
    async (body: string) => {
      if (!peer || !currentUserIdRef.current || sendingRef.current) return false;
      const text = body.trim();
      if (!text) return false;

      const me = currentUserIdRef.current;
      const tempId = `pending-${Date.now()}`;
      const optimistic: ChatMessage = {
        id: tempId,
        body: text,
        senderId: me,
        createdAt: new Date().toISOString(),
        isMine: true,
        pending: true,
      };

      setThread((prev) =>
        prev
          ? { ...prev, messages: [...prev.messages, optimistic] }
          : {
              id: `peer-${peer.id}`,
              peer,
              messages: [optimistic],
            },
      );

      setSending(true);
      try {
        const sent = await chatService.sendMessage({
          peer,
          body: text,
          conversationId: threadIdRef.current,
          currentUserId: me,
        });

        setThread((prev) => {
          if (!prev) {
            return { id: threadIdRef.current || `peer-${peer.id}`, peer, messages: [sent] };
          }
          return {
            ...prev,
            messages: prev.messages
              .filter((m) => m.id !== tempId)
              .concat(sent)
              .sort(
                (a, b) =>
                  new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
              ),
          };
        });
        return true;
      } catch (err) {
        setThread((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            messages: prev.messages.map((m) =>
              m.id === tempId ? { ...m, pending: false, failed: true } : m,
            ),
          };
        });
        setError(getApiErrorMessage(err, 'Failed to send message.'));
        return false;
      } finally {
        setSending(false);
      }
    },
    [peer],
  );

  const reload = useCallback(() => {
    if (peer) {
      void loadThread(peer);
    }
  }, [peer, loadThread]);

  return {
    thread,
    messages: thread?.messages ?? [],
    loading,
    sending,
    error,
    setError,
    reload,
    sendMessage,
    currentUserId,
  };
}
