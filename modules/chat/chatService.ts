import api, {
  ApiClientError,
  apiPath,
  asArray,
  getApiErrorMessage,
  imageUrl,
  isNetworkOrTimeoutError,
  unwrap,
} from '@/services/api';
import { asText, firstText } from '@/utils/text';
import type {
  ChatConversation,
  ChatMessage,
  ChatPeer,
  ChatThread,
} from '@/modules/chat/types';

/** Laravel chat routes (no trailing slashes). Open to all authenticated users. */
export const CHAT_ENDPOINTS = {
  /** GET — thread + messages for a peer user id */
  withUser: (userId: string | number) => `/chat/with/${userId}`,
  /** POST — { recipient_id, body } or { conversation_id, body } */
  send: '/chat/messages',
  /** GET — inbox conversation list */
  conversations: '/chat/conversations',
  /** GET — unread badge count (messages API) */
  unreadCount: '/messages/unread-count',
} as const;

function rethrowAsSafeError(error: unknown, fallback: string): never {
  const message = getApiErrorMessage(error, fallback);
  if (error instanceof ApiClientError) {
    throw error;
  }
  throw new ApiClientError({
    message,
    kind: isNetworkOrTimeoutError(error) ? 'network' : 'unknown',
    original: error,
  });
}

function personName(person: unknown, fallback = 'Student'): string {
  if (!person || typeof person !== 'object') return fallback;
  const p = person as Record<string, unknown>;
  return (
    firstText(
      p.name,
      `${asText(p.first_name)} ${asText(p.last_name)}`.trim(),
      p.email,
    ) || fallback
  );
}

function personImage(person: unknown): string | null {
  if (!person || typeof person !== 'object') return null;
  const p = person as Record<string, unknown>;
  const nestedRecord =
    p.studentRecord && typeof p.studentRecord === 'object'
      ? (p.studentRecord as Record<string, unknown>).photo
      : null;
  return imageUrl(
    p.profile_picture || p.photo || p.image || p.avatar || nestedRecord,
  );
}

function normalizeConversation(
  raw: Record<string, unknown>,
  currentUserId: string,
  index: number,
): ChatConversation | null {
  const other =
    (raw.other_user && typeof raw.other_user === 'object' && raw.other_user) ||
    (raw.participant && typeof raw.participant === 'object' && raw.participant) ||
    (raw.peer && typeof raw.peer === 'object' && raw.peer) ||
    null;

  let peerId = '';
  let peerName = 'Student';
  let peerImage: string | null = null;

  if (other) {
    const o = other as Record<string, unknown>;
    peerId = asText(o.id ?? o.user_id);
    peerName = personName(other);
    peerImage = personImage(other);
  } else {
    const senderId = asText(raw.sender_id);
    const receiverId = asText(raw.receiver_id);
    const otherId =
      senderId && senderId === currentUserId
        ? receiverId
        : receiverId && receiverId === currentUserId
          ? senderId
          : senderId || receiverId;

    peerId = asText(otherId || raw.user_id || raw.participant_id);
    if (senderId === currentUserId) {
      peerName = personName(raw.receiver, peerName);
      peerImage = personImage(raw.receiver);
    } else {
      peerName = personName(raw.sender, peerName);
      peerImage = personImage(raw.sender);
    }
  }

  if (!peerId) return null;

  const unread = Number(raw.unread_count ?? raw.unread ?? 0) || 0;
  const isRead = raw.is_read === true || unread === 0;

  return {
    id: asText(raw.id, `conv-${peerId}-${index}`),
    peer: {
      id: peerId,
      name: peerName,
      image: peerImage,
      kind: 'student',
    },
    lastMessage:
      firstText(raw.body, raw.last_message, raw.message, raw.preview) ||
      (raw.image_path || raw.image_url ? 'Sent an image' : 'No messages yet'),
    lastMessageAt: firstText(
      raw.created_at,
      raw.updated_at,
      raw.last_message_at,
      new Date().toISOString(),
    ),
    unreadCount: unread,
    isRead,
  };
}

function normalizeMessage(
  raw: Record<string, unknown>,
  currentUserId: string,
  index: number,
): ChatMessage {
  const senderRaw =
    raw.sender_id ??
    raw.user_id ??
    raw.from_id ??
    (raw.sender && typeof raw.sender === 'object'
      ? (raw.sender as { id?: unknown }).id
      : undefined);

  const senderId = asText(senderRaw, '');
  const body = firstText(raw.body, raw.message, raw.content, raw.text) || '';
  const createdAt = firstText(
    raw.created_at,
    raw.sent_at,
    raw.timestamp,
    new Date().toISOString(),
  );

  const id = asText(raw.id, `msg-${index}-${createdAt}`);

  return {
    id,
    body,
    senderId,
    createdAt,
    isMine: senderId !== '' && senderId === currentUserId,
  };
}

function extractMessages(
  payload: unknown,
  currentUserId: string,
): ChatMessage[] {
  const root = unwrap(payload);
  if (Array.isArray(root)) {
    return root.map((row, index) =>
      normalizeMessage((row || {}) as Record<string, unknown>, currentUserId, index),
    );
  }

  if (root && typeof root === 'object') {
    const obj = root as Record<string, unknown>;
    const nested =
      (Array.isArray(obj.messages) && obj.messages) ||
      (Array.isArray(obj.data) && obj.data) ||
      (Array.isArray(obj.items) && obj.items) ||
      [];

    return (nested as unknown[]).map((row, index) =>
      normalizeMessage((row || {}) as Record<string, unknown>, currentUserId, index),
    );
  }

  return [];
}

function extractThreadId(payload: unknown, peerId: string | number): string {
  const root = unwrap(payload);
  if (root && typeof root === 'object') {
    const obj = root as Record<string, unknown>;
    const id =
      obj.conversation_id ??
      obj.thread_id ??
      obj.id ??
      (obj.conversation && typeof obj.conversation === 'object'
        ? (obj.conversation as { id?: unknown }).id
        : undefined);
    if (id != null && asText(id)) return asText(id);
  }
  return `peer-${peerId}`;
}

/**
 * Live chat against Sanctum-authenticated Laravel `/chat/*` routes.
 * Available to every registered student — no subscription checks.
 */
export const chatService = {
  async listConversations(currentUserId: string | number): Promise<ChatConversation[]> {
    const me = asText(currentUserId);
    try {
      const { data } = await api.get(apiPath(CHAT_ENDPOINTS.conversations));
      const rows = asArray<Record<string, unknown>>(data);
      const list = (rows.length > 0 ? rows : asArray(unwrap(data))).map(
        (row, index) => normalizeConversation(row as Record<string, unknown>, me, index),
      );

      return list
        .filter((row): row is ChatConversation => row != null)
        .sort(
          (a, b) =>
            new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
        );
    } catch (error) {
      // Fallback to legacy /messages/conversations if /chat alias is unavailable.
      try {
        const { data } = await api.get(apiPath('/messages/conversations'));
        const rows = asArray<Record<string, unknown>>(data);
        return rows
          .map((row, index) => normalizeConversation(row, me, index))
          .filter((row): row is ChatConversation => row != null)
          .sort(
            (a, b) =>
              new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
          );
      } catch {
        rethrowAsSafeError(error, 'Unable to load your inbox.');
      }
    }
  },

  async getUnreadCount(): Promise<number> {
    try {
      const { data } = await api.get(apiPath(CHAT_ENDPOINTS.unreadCount));
      const root = unwrap(data);
      if (typeof root === 'number') return root;
      if (root && typeof root === 'object') {
        const obj = root as Record<string, unknown>;
        return Number(obj.unread_count ?? obj.count ?? obj.unread ?? 0) || 0;
      }
      return 0;
    } catch {
      return 0;
    }
  },

  async getThreadWithUser(
    peer: ChatPeer,
    currentUserId: string | number,
  ): Promise<ChatThread> {
    const me = asText(currentUserId);
    const peerId = asText(peer.id);
    if (!peerId) {
      throw new ApiClientError({
        message: 'Cannot open chat — missing recipient.',
        kind: 'unknown',
      });
    }

    try {
      const { data } = await api.get(apiPath(CHAT_ENDPOINTS.withUser(peerId)), {
        params: peer.kind ? { recipient_type: peer.kind } : undefined,
      });

      return {
        id: extractThreadId(data, peerId),
        peer,
        messages: extractMessages(data, me).sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        ),
      };
    } catch (error) {
      rethrowAsSafeError(error, 'Unable to load conversation.');
    }
  },

  async sendMessage(options: {
    peer: ChatPeer;
    body: string;
    conversationId?: string | null;
    currentUserId: string | number;
  }): Promise<ChatMessage> {
    const text = options.body.trim();
    if (!text) {
      throw new ApiClientError({
        message: 'Message cannot be empty.',
        kind: 'unknown',
      });
    }

    const me = asText(options.currentUserId);
    const peerId = asText(options.peer.id);

    const payload: Record<string, unknown> = {
      body: text,
      message: text,
      recipient_id: peerId,
      receiver_id: peerId,
      user_id: peerId,
    };
    if (options.conversationId && !options.conversationId.startsWith('peer-')) {
      payload.conversation_id = options.conversationId;
      payload.thread_id = options.conversationId;
    }
    if (options.peer.kind) {
      payload.recipient_type = options.peer.kind;
    }

    try {
      const { data } = await api.post(apiPath(CHAT_ENDPOINTS.send), payload);
      const root = unwrap(data);
      const raw =
        root && typeof root === 'object' && !Array.isArray(root)
          ? (root as Record<string, unknown>)
          : { body: text, sender_id: me, created_at: new Date().toISOString() };

      const messageRaw =
        raw.message && typeof raw.message === 'object'
          ? (raw.message as Record<string, unknown>)
          : raw.data && typeof raw.data === 'object' && !Array.isArray(raw.data)
            ? (raw.data as Record<string, unknown>)
            : raw;

      const normalized = normalizeMessage(messageRaw, me, Date.now());
      if (!normalized.body) {
        normalized.body = text;
      }
      if (!normalized.senderId) {
        normalized.senderId = me;
        normalized.isMine = true;
      }
      return normalized;
    } catch (error) {
      rethrowAsSafeError(error, 'Unable to send message. Please try again.');
    }
  },
};

export default chatService;
