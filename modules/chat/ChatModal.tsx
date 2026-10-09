import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ScreenHeader';
import { InitialsAvatar, premium, premiumStyles } from '@/components/premium';
import { useLiveChat } from '@/modules/chat/useLiveChat';
import type { ChatMessage, ChatPeer } from '@/modules/chat/types';
import { asText } from '@/utils/text';

export type ChatModalProps = {
  visible: boolean;
  peer: ChatPeer | null;
  onClose: () => void;
};

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function MessageBubble({ item }: { item: ChatMessage }) {
  const metaLabel = item.failed
    ? 'Failed'
    : item.pending
      ? 'Sending…'
      : formatTime(item.createdAt);

  return (
    <View
      style={[
        styles.bubbleRow,
        item.isMine ? styles.bubbleRowMine : styles.bubbleRowTheirs,
      ]}
    >
      <View style={styles.bubbleCol}>
        <View
          style={[
            styles.bubble,
            item.isMine ? styles.bubbleMine : styles.bubbleTheirs,
            item.failed ? styles.bubbleFailed : null,
            item.pending ? styles.bubblePending : null,
          ]}
        >
          {!item.isMine ? <View style={styles.incomingAccent} /> : null}
          <Text
            style={[
              styles.bubbleText,
              item.isMine ? styles.bubbleTextMine : styles.bubbleTextTheirs,
            ]}
          >
            {item.body}
          </Text>
        </View>

        <View
          style={[
            styles.metaRow,
            item.isMine ? styles.metaRowMine : styles.metaRowTheirs,
          ]}
        >
          <Text
            style={[
              styles.bubbleMeta,
              item.failed ? styles.bubbleMetaFailed : null,
            ]}
          >
            {metaLabel}
          </Text>
          {item.isMine && !item.failed ? (
            <FontAwesome
              name={item.pending ? 'clock-o' : 'check'}
              size={10}
              color={item.pending ? 'rgba(28, 36, 86, 0.45)' : premium.gold}
              style={styles.receiptIcon}
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}

/**
 * Full-screen live chat modal — available to all registered students.
 * Does not check subscription / premium status.
 */
export function ChatModal({ visible, peer, onClose }: ChatModalProps) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState('');
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const { messages, loading, sending, error, setError, sendMessage, reload } =
    useLiveChat({
      peer,
      enabled: visible && peer != null,
    });

  useEffect(() => {
    if (!visible) {
      setDraft('');
    }
  }, [visible]);

  useEffect(() => {
    if (messages.length === 0) return;
    const timer = setTimeout(() => {
      listRef.current?.scrollToEnd({ animated: true });
    }, 80);
    return () => clearTimeout(timer);
  }, [messages.length]);

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setDraft('');
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const ok = await sendMessage(text);
    if (!ok) {
      setDraft(text);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const handleClose = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  };

  const handleQuickAction = (kind: 'attach' | 'camera') => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert(
      kind === 'camera' ? 'Camera' : 'Attachments',
      'Media sharing will be available in a future update. You can still send text messages now.',
    );
  };

  const peerName = asText(peer?.name, 'Chat');
  const statusSubtitle = loading && messages.length === 0
    ? 'Connecting…'
    : error
      ? 'Reconnecting…'
      : 'Online';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleClose}
    >
      <StatusBar style="light" />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <ScreenHeader
          title={peerName}
          subtitle={statusSubtitle}
          icon="comments"
          compact
          showIconBadge={false}
          leftAccessory={
            <TouchableOpacity
              style={styles.headerIconBtn}
              onPress={handleClose}
              accessibilityLabel="Close chat"
            >
              <FontAwesome name="chevron-down" size={16} color="#FFC800" />
            </TouchableOpacity>
          }
          rightAccessory={
            <View style={styles.headerTrailing}>
              <TouchableOpacity
                style={styles.headerIconBtn}
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  void reload();
                }}
                accessibilityLabel="Refresh messages"
              >
                <FontAwesome name="refresh" size={14} color="#FFC800" />
              </TouchableOpacity>
              <View style={styles.avatarBadge}>
                <InitialsAvatar
                  name={peerName}
                  image={peer?.image}
                  size={44}
                  radius={14}
                  backgroundColor="rgba(255, 200, 0, 0.16)"
                  textColor="#FFC800"
                />
                <View style={styles.onlineDot} />
              </View>
            </View>
          }
        />

        {loading && messages.length === 0 ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={premium.brand} />
            <Text style={premiumStyles.mutedText}>Opening conversation…</Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[
              styles.listContent,
              messages.length === 0 ? styles.listEmpty : null,
            ]}
            renderItem={({ item }) => <MessageBubble item={item} />}
            ListEmptyComponent={
              <View style={styles.emptyCard}>
                <View style={styles.emptyIconWrap}>
                  <FontAwesome name="comments-o" size={24} color={premium.brand} />
                </View>
                <Text style={styles.emptyTitle}>Say hello</Text>
                <Text style={styles.emptyBody}>
                  Start a conversation with {peerName}. Messaging is available to every
                  registered student — no subscription required.
                </Text>
              </View>
            }
          />
        )}

        {error ? (
          <TouchableOpacity
            style={styles.errorBanner}
            onPress={() => setError(null)}
            activeOpacity={0.85}
          >
            <Text style={styles.errorText}>{error}</Text>
            <Text style={styles.errorDismiss}>Dismiss</Text>
          </TouchableOpacity>
        ) : null}

        <View
          style={[
            styles.composerShell,
            { paddingBottom: Math.max(insets.bottom, 12) },
          ]}
        >
          <View style={styles.composerCard}>
            <TouchableOpacity
              style={styles.quickAction}
              onPress={() => handleQuickAction('attach')}
              accessibilityLabel="Attach file"
            >
              <FontAwesome name="paperclip" size={16} color={premium.gold} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickAction}
              onPress={() => handleQuickAction('camera')}
              accessibilityLabel="Open camera"
            >
              <FontAwesome name="camera" size={15} color={premium.brand} />
            </TouchableOpacity>

            <TextInput
              style={styles.input}
              value={draft}
              onChangeText={setDraft}
              placeholder={`Message ${peerName}…`}
              placeholderTextColor="#C7C7CC"
              multiline
              maxLength={2000}
              editable={!sending}
              onSubmitEditing={() => void handleSend()}
              blurOnSubmit={false}
            />

            <TouchableOpacity
              style={[
                styles.sendButtonWrap,
                (!draft.trim() || sending) && styles.sendButtonDisabled,
              ]}
              onPress={() => void handleSend()}
              disabled={!draft.trim() || sending}
              accessibilityLabel="Send message"
              activeOpacity={0.88}
            >
              <LinearGradient
                colors={
                  !draft.trim() || sending
                    ? ['#8E96B8', '#6B7399']
                    : ['#1C2456', '#35408E']
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.sendButton}
              >
                {sending ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <FontAwesome name="send" size={15} color="#FFC800" />
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default ChatModal;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: premium.pageBg,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 200, 0, 0.28)',
  },
  headerTrailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  avatarBadge: {
    position: 'relative',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'rgba(255, 200, 0, 0.4)',
    shadowColor: '#0B1028',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
    overflow: 'visible',
  },
  onlineDot: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#22C55E',
    borderWidth: 2,
    borderColor: '#1C2456',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 18,
    flexGrow: 1,
  },
  listEmpty: {
    justifyContent: 'center',
  },
  emptyCard: {
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingVertical: 24,
    marginHorizontal: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: premium.border,
    gap: 10,
    shadowColor: '#1C2456',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  emptyIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#F0F2F8',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: premium.text,
  },
  emptyBody: {
    fontSize: 13,
    color: premium.muted,
    textAlign: 'center',
    lineHeight: 19,
  },
  bubbleRow: {
    marginBottom: 14,
    flexDirection: 'row',
  },
  bubbleRowMine: {
    justifyContent: 'flex-end',
  },
  bubbleRowTheirs: {
    justifyContent: 'flex-start',
  },
  bubbleCol: {
    maxWidth: '82%',
  },
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 11,
    overflow: 'hidden',
  },
  bubbleMine: {
    backgroundColor: '#12183A',
    borderBottomRightRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 200, 0, 0.18)',
    shadowColor: '#0B1028',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 3,
  },
  bubbleTheirs: {
    backgroundColor: '#F3F4F6',
    borderBottomLeftRadius: 6,
    borderWidth: 1,
    borderColor: '#E8ECF5',
    paddingLeft: 16,
  },
  incomingAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: premium.gold,
  },
  bubblePending: {
    opacity: 0.72,
  },
  bubbleFailed: {
    backgroundColor: '#D14343',
    borderColor: '#B83232',
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '500',
  },
  bubbleTextMine: {
    color: '#FFFFFF',
  },
  bubbleTextTheirs: {
    color: premium.text,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 5,
    gap: 5,
  },
  metaRowMine: {
    justifyContent: 'flex-end',
  },
  metaRowTheirs: {
    justifyContent: 'flex-start',
    paddingLeft: 4,
  },
  bubbleMeta: {
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(28, 36, 86, 0.45)',
  },
  bubbleMetaFailed: {
    color: '#D14343',
  },
  receiptIcon: {
    marginTop: 1,
  },
  errorBanner: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#FFF0F0',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#F5C2C2',
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  errorText: {
    flex: 1,
    color: '#D14343',
    fontSize: 13,
  },
  errorDismiss: {
    color: premium.brand,
    fontWeight: '700',
    fontSize: 12,
  },
  composerShell: {
    paddingHorizontal: 12,
    paddingTop: 8,
    backgroundColor: 'transparent',
  },
  composerCard: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(53, 64, 142, 0.12)',
    shadowColor: '#1C2456',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 6,
  },
  quickAction: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F4F6FB',
    borderWidth: 1,
    borderColor: '#E2E6F0',
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    paddingHorizontal: 8,
    paddingVertical: Platform.OS === 'ios' ? 10 : 6,
    fontSize: 15,
    color: premium.text,
    fontWeight: '500',
  },
  sendButtonWrap: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.7,
  },
});
