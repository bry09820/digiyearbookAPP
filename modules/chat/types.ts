export type ChatPeerKind = 'student' | 'faculty' | 'user';

/** Someone the current user can message (no subscription required). */
export type ChatPeer = {
  id: string | number;
  name: string;
  image?: string | null;
  kind?: ChatPeerKind;
};

export type ChatMessage = {
  id: string;
  body: string;
  senderId: string;
  createdAt: string;
  /** True when the authenticated user sent this message. */
  isMine: boolean;
  pending?: boolean;
  failed?: boolean;
};

export type ChatThread = {
  id: string;
  peer: ChatPeer;
  messages: ChatMessage[];
};

/** One row in the Messages inbox (active conversation). */
export type ChatConversation = {
  id: string;
  peer: ChatPeer;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
  isRead: boolean;
};
