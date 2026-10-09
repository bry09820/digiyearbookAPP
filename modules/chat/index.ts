export type {
  ChatPeer,
  ChatPeerKind,
  ChatMessage,
  ChatThread,
  ChatConversation,
} from '@/modules/chat/types';
export { chatService, CHAT_ENDPOINTS } from '@/modules/chat/chatService';
export { useLiveChat } from '@/modules/chat/useLiveChat';
export { useUnreadMessages } from '@/modules/chat/useUnreadMessages';
export { ChatModal } from '@/modules/chat/ChatModal';
export { default as ChatModalDefault } from '@/modules/chat/ChatModal';
export {
  getCachedUnreadCount,
  setCachedUnreadCount,
  subscribeUnreadCount,
} from '@/modules/chat/unreadStore';
