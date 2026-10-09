import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ScreenHeader } from '@/components/ScreenHeader';
import { getApiErrorMessage } from '@/services/api';
import { yearbookService } from '@/services/yearbook';
import {
  ChatModal,
  chatService,
  type ChatConversation,
  type ChatPeer,
} from '@/modules/chat';
import { setCachedUnreadCount } from '@/modules/chat/unreadStore';
import {
  SummaryStats,
  SearchField,
  FilterPills,
  InitialsAvatar,
  premiumStyles,
  type FilterPill,
} from '@/components/premium';
import { asText } from '@/utils/text';

type InboxFilter = 'All' | 'Unread' | 'Students' | 'Faculty';

function formatInboxTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (sameDay) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();

  if (isYesterday) return 'Yesterday';

  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function MessagesScreen() {
  const router = useRouter();
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<InboxFilter>('All');
  const [chatVisible, setChatVisible] = useState(false);
  const [chatPeer, setChatPeer] = useState<ChatPeer | null>(null);

  const loadInbox = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) {
      setLoading(true);
    }
    setError(null);

    try {
      const me = await yearbookService.getCurrentUser();
      const meRecord = me && typeof me === 'object' ? (me as Record<string, unknown>) : null;
      const myId = asText(meRecord?.id);
      if (!myId) {
        throw new Error('You must be signed in to view messages.');
      }

      const [list, unread] = await Promise.all([
        chatService.listConversations(myId),
        chatService.getUnreadCount(),
      ]);

      setConversations(list);
      setCachedUnreadCount(unread);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Unable to load your inbox.'));
      setConversations([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadInbox();
    }, [loadInbox]),
  );

  const openConversation = (item: ChatConversation) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setChatPeer(item.peer);
    setChatVisible(true);
  };

  const closeChat = () => {
    setChatVisible(false);
    setChatPeer(null);
    void loadInbox({ silent: true });
  };

  const totalUnread = conversations.reduce((sum, row) => sum + row.unreadCount, 0);

  const filterPills: FilterPill[] = [
    { key: 'all', label: 'All', value: 'All' },
    { key: 'unread', label: 'Unread', value: 'Unread' },
    { key: 'students', label: 'Students', value: 'Students' },
    { key: 'faculty', label: 'Faculty', value: 'Faculty' },
  ];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return conversations.filter((item) => {
      if (activeFilter === 'Unread' && item.unreadCount <= 0) return false;
      if (activeFilter === 'Students' && item.peer.kind === 'faculty') return false;
      if (activeFilter === 'Faculty' && item.peer.kind !== 'faculty') return false;
      if (!q) return true;
      return (
        item.peer.name.toLowerCase().includes(q) ||
        item.lastMessage.toLowerCase().includes(q)
      );
    });
  }, [conversations, search, activeFilter]);

  const stats = useMemo(
    () => [
      { key: 'chats', label: 'Chats', value: conversations.length },
      { key: 'unread', label: 'Unread', value: totalUnread, hint: totalUnread > 0 ? 'Needs reply' : undefined },
      {
        key: 'showing',
        label: 'Showing',
        value: filtered.length,
      },
    ],
    [conversations.length, totalUnread, filtered.length],
  );

  return (
    <SafeAreaView style={premiumStyles.screen}>
      <StatusBar style="light" />
      <ScreenHeader
        title="Messages"
        subtitle={
          totalUnread > 0
            ? `${totalUnread} unread · free for all students`
            : 'Your conversations · free for all students'
        }
        icon="comments"
      />

      {loading ? (
        <View style={premiumStyles.centerState}>
          <ActivityIndicator size="large" color="#35408E" />
          <Text style={premiumStyles.mutedText}>Loading inbox…</Text>
        </View>
      ) : error ? (
        <View style={premiumStyles.centerState}>
          <Text style={premiumStyles.errorText}>{error}</Text>
          <TouchableOpacity style={premiumStyles.primaryButton} onPress={() => void loadInbox()}>
            <Text style={premiumStyles.primaryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => `${item.id}-${item.peer.id}`}
          contentContainerStyle={[
            premiumStyles.scrollContent,
            filtered.length === 0 ? styles.listEmpty : null,
          ]}
          ListHeaderComponent={
            <View>
              <SummaryStats items={stats} />
              <SearchField
                value={search}
                onChangeText={setSearch}
                placeholder="Search conversations…"
              />
              <FilterPills
                items={filterPills}
                activeValue={activeFilter}
                onChange={(value) => setActiveFilter(value as InboxFilter)}
              />
            </View>
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void loadInbox({ silent: true });
              }}
              tintColor="#35408E"
              colors={['#35408E']}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyCard}>
              <View style={styles.emptyIcon}>
                <FontAwesome name="comments-o" size={28} color="#35408E" />
              </View>
              <Text style={styles.emptyTitle}>No conversations yet</Text>
              <Text style={styles.emptyBody}>
                Message a classmate from their profile, the directory, or achievements. New chats
                will show up here.
              </Text>
              <TouchableOpacity
                style={premiumStyles.primaryButton}
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push('/directory' as Href);
                }}
              >
                <Text style={premiumStyles.primaryButtonText}>Browse directory</Text>
              </TouchableOpacity>
            </View>
          }
          renderItem={({ item }) => {
            const unread = item.unreadCount > 0;
            return (
              <TouchableOpacity
                style={[styles.row, unread ? styles.rowUnread : null]}
                onPress={() => openConversation(item)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={`Message ${item.peer.name}`}
              >
                <InitialsAvatar
                  name={item.peer.name}
                  image={item.peer.image}
                  size={52}
                />

                <View style={styles.rowBody}>
                  <View style={styles.rowTop}>
                    <Text
                      style={[styles.name, unread ? styles.nameUnread : null]}
                      numberOfLines={1}
                    >
                      {item.peer.name}
                    </Text>
                    <Text style={styles.time}>{formatInboxTime(item.lastMessageAt)}</Text>
                  </View>
                  <View style={styles.rowBottom}>
                    <Text
                      style={[styles.preview, unread ? styles.previewUnread : null]}
                      numberOfLines={1}
                    >
                      {item.lastMessage}
                    </Text>
                    {unread ? (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>
                          {item.unreadCount > 99 ? '99+' : String(item.unreadCount)}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      <ChatModal visible={chatVisible} peer={chatPeer} onClose={closeChat} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  listEmpty: {
    flexGrow: 1,
  },
  emptyCard: {
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 28,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(53, 64, 142, 0.08)',
    gap: 10,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#F0F2F8',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  emptyBody: {
    fontSize: 13,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(53, 64, 142, 0.08)',
    shadowColor: '#1C2456',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
    gap: 12,
  },
  rowUnread: {
    borderColor: '#D5DBF0',
    backgroundColor: '#F7F9FF',
  },
  rowBody: {
    flex: 1,
    gap: 4,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  rowBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  name: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  nameUnread: {
    fontWeight: '800',
    color: '#35408E',
  },
  time: {
    fontSize: 11,
    color: '#8E8E93',
    fontWeight: '600',
  },
  preview: {
    flex: 1,
    fontSize: 13,
    color: '#8E8E93',
  },
  previewUnread: {
    color: '#4A4A4A',
    fontWeight: '600',
  },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#35408E',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
});
