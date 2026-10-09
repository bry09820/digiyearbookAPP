import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Modal,
  Animated,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { FontAwesome } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, type Href } from 'expo-router';
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import * as Haptics from 'expo-haptics';
import { imageUrl, getApiErrorMessage } from '@/services/api';
import { yearbookService } from '@/services/yearbook';
import type { AnnouncementItem } from '@/services/yearbook';
import { UpgradePrompt } from '@/components/UpgradePrompt';
import { ScreenHeader } from '@/components/ScreenHeader';
import {
  SummaryStats,
  InitialsAvatar,
  premiumStyles,
  premium,
} from '@/components/premium';
import { useSubscriptionGate } from '@/hooks/useSubscriptionGate';
import { useUnreadMessages } from '@/modules/chat/useUnreadMessages';
import { asText, firstText } from '@/utils/text';

const { height } = Dimensions.get('window');

const QUICK_ACCESS: {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ComponentProps<typeof FontAwesome>['name'];
  color: string;
  route: Href;
}[] = [
  { id: '1', title: 'Students', subtitle: 'Browse your batchmates', icon: 'users', color: '#E8EFFF', route: '/directory' },
  { id: '2', title: 'Messages', subtitle: 'Inbox & live chat', icon: 'comments', color: '#E8EFFF', route: '/messages' as Href },
  { id: '3', title: 'Gallery', subtitle: 'Campus memories', icon: 'image', color: '#E8EFFF', route: '/gallery' },
  { id: '4', title: 'Faculty', subtitle: 'Professors & Staff', icon: 'graduation-cap', color: '#E8EFFF', route: '/faculty' },
  { id: '5', title: 'Sections', subtitle: 'Class directory', icon: 'th-large', color: '#E8EFFF', route: '/sections' },
  { id: '6', title: 'Yearbook', subtitle: 'Generate & flipbook preview', icon: 'book', color: '#FFF4D6', route: '/generate-yearbook' as Href },
  { id: '7', title: 'Alumni', subtitle: 'Open Alumni Tracker', icon: 'exchange', color: '#E8F8F0', route: '/alumni-tracker' as Href },
];

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning,';
  if (hour < 17) return 'Good Afternoon,';
  return 'Good Evening,';
}

function getUserDisplayName(user: Record<string, unknown> | null): string {
  if (!user) return 'Student';
  return (
    firstText(
      user.name,
      [asText(user.first_name), asText(user.last_name)].filter(Boolean).join(' '),
    ) || 'Student'
  );
}

function pickEvents(announcements: AnnouncementItem[]): AnnouncementItem[] {
  const events = announcements.filter((a) => a.type === 'event');
  return events.length > 0 ? events : announcements;
}

export default function HomeScreen() {
  const router = useRouter();
  const {
    promptVisible,
    lockedFeature,
    checking,
    requireSubscription,
    closePrompt,
    refreshAfterUpgrade,
  } = useSubscriptionGate();
  const { unreadCount } = useUnreadMessages(true);
  const [selectedEvent, setSelectedEvent] = useState<AnnouncementItem | null>(null);
  const [isEventModalVisible, setIsEventModalVisible] = useState(false);
  const [isSeeAllVisible, setIsSeeAllVisible] = useState(false);

  const [userName, setUserName] = useState('Student');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [achievementCount, setAchievementCount] = useState(0);
  const [events, setEvents] = useState<AnnouncementItem[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsError, setEventsError] = useState<string | null>(null);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(height)).current;

  const loadData = useCallback(async () => {
    setEventsLoading(true);
    setEventsError(null);

    const [userResult, achievementsResult, announcementsResult] = await Promise.allSettled([
      yearbookService.getCurrentUser(),
      yearbookService.getProfileAchievements(),
      yearbookService.getAnnouncements(),
    ]);

    if (userResult.status === 'fulfilled') {
      const user = userResult.value as Record<string, unknown>;
      setUserName(getUserDisplayName(user));
      setAvatarUrl(imageUrl(user.profile_picture ?? user.avatar ?? user.photo));
    }

    if (achievementsResult.status === 'fulfilled') {
      setAchievementCount(achievementsResult.value.length);
    }

    if (announcementsResult.status === 'fulfilled') {
      setEvents(pickEvents(announcementsResult.value));
      setEventsError(null);
    } else {
      setEventsError(
        getApiErrorMessage(announcementsResult.reason, 'Unable to load events.'),
      );
    }

    setEventsLoading(false);
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const firstName = useMemo(() => userName.split(/\s+/)[0] || userName, [userName]);

  const summaryStats = useMemo(
    () => [
      { key: 'events', label: 'Events', value: events.length },
      { key: 'achievements', label: 'Achievements', value: achievementCount },
      { key: 'unread', label: 'Unread', value: unreadCount },
    ],
    [events.length, achievementCount, unreadCount],
  );

  const toggleEventModal = (visible: boolean, event: AnnouncementItem | null = null) => {
    if (visible) {
      setSelectedEvent(event);
      setIsEventModalVisible(true);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 50, friction: 8 }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: height, duration: 250, useNativeDriver: true }),
      ]).start(() => {
        setIsEventModalVisible(false);
        setSelectedEvent(null);
      });
    }
  };

  const renderEventCard = (event: AnnouncementItem) => {
    const dateParts = event.date.split(' ');
    const month = dateParts[0] || '';
    const day = dateParts[1] || '';

    return (
      <TouchableOpacity
        key={String(event.id)}
        style={styles.eventCard}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          toggleEventModal(true, event);
        }}
      >
        <View style={styles.dateBadge}>
          <Text style={styles.dateMonth}>{month}</Text>
          <Text style={styles.dateDay}>{day}</Text>
        </View>
        <View style={styles.eventInfo}>
          <Text style={styles.eventTitle}>{event.title}</Text>
          <Text style={styles.eventLocation}>{event.location}</Text>
          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>{event.status}</Text>
          </View>
        </View>
        <FontAwesome name="chevron-right" size={14} color="#D1D1D6" />
      </TouchableOpacity>
    );
  };

  return (
    <View style={premiumStyles.screen}>
      <StatusBar style="light" />
      <UpgradePrompt
        visible={promptVisible}
        feature={lockedFeature}
        onClose={closePrompt}
        onUpgraded={() => {
          void refreshAfterUpgrade();
        }}
      />

      <ScreenHeader
        title={firstName}
        subtitle={`${getGreeting()} Welcome back to NU Lipa`}
        icon="home"
        showIconBadge={false}
        rightAccessory={
          <View style={styles.headerAccessory}>
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push('/messages' as Href);
              }}
              style={styles.inboxButton}
              accessibilityRole="button"
              accessibilityLabel={
                unreadCount > 0 ? `Messages, ${unreadCount} unread` : 'Messages'
              }
            >
              <FontAwesome name="comments" size={16} color="#FFC800" />
              {unreadCount > 0 ? (
                <View style={styles.inboxBadge}>
                  <Text style={styles.inboxBadgeText}>
                    {unreadCount > 99 ? '99+' : String(unreadCount)}
                  </Text>
                </View>
              ) : null}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push('/profile');
              }}
              style={styles.profileBtn}
              accessibilityLabel="Open profile"
            >
              {avatarUrl ? (
                <Image source={avatarUrl} style={styles.headerAvatar} contentFit="cover" />
              ) : (
                <InitialsAvatar
                  name={userName}
                  size={40}
                  backgroundColor="rgba(255, 200, 0, 0.18)"
                  textColor="#FFC800"
                />
              )}
              <View style={styles.statusIndicator} />
            </TouchableOpacity>
          </View>
        }
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={premiumStyles.scrollContent}>
        <LinearGradient
          colors={['#1C2456', '#35408E', '#2A3480']}
          locations={[0, 0.55, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          <View style={styles.heroFrost} pointerEvents="none" />
          <View style={styles.heroBadge}>
            <FontAwesome name="trophy" size={14} color="#FFC800" />
            <Text style={styles.heroBadgeText}>Student of the Month</Text>
          </View>
          <Text style={styles.heroTitle}>Keep up the great work!</Text>
          <Text style={styles.heroSubtitle}>
            You have {achievementCount} achievement badge{achievementCount === 1 ? '' : 's'}.
          </Text>
          <TouchableOpacity
            style={styles.viewProfileButton}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/profile');
            }}
          >
            <Text style={styles.viewProfileText}>View Profile</Text>
            <FontAwesome name="arrow-right" size={12} color={premium.navy} style={styles.ctaIcon} />
          </TouchableOpacity>
        </LinearGradient>

        <SummaryStats items={summaryStats} style={styles.homeStats} />

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Quick Access</Text>
        </View>
        <View style={styles.quickAccessGrid}>
          {QUICK_ACCESS.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={styles.quickAccessCard}
              onPress={() => {
                void (async () => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  if (item.id === '5') {
                    if (checking) return;
                    const { allowed } = await requireSubscription('flipbook');
                    if (!allowed) return;
                  }
                  router.push(item.route);
                })();
              }}
            >
              <View style={[styles.iconBox, { backgroundColor: item.color }]}>
                <FontAwesome name={item.icon} size={20} color="#35408E" />
              </View>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardSubtitle} numberOfLines={2}>
                {item.subtitle}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={[styles.sectionHeader, styles.eventsSectionHeader]}>
          <Text style={styles.sectionTitle}>Upcoming Events</Text>
          {!eventsLoading && !eventsError && events.length > 0 && (
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setIsSeeAllVisible(true);
              }}
            >
              <Text style={styles.viewAllText}>View All</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={[premiumStyles.contentCard, styles.eventsWrap]}>
          {eventsLoading ? (
            <View style={styles.stateContainer}>
              <ActivityIndicator size="small" color="#35408E" />
              <Text style={styles.stateText}>Loading events…</Text>
            </View>
          ) : eventsError ? (
            <View style={styles.stateContainer}>
              <Text style={styles.errorText}>{eventsError}</Text>
              <TouchableOpacity style={styles.retryButton} onPress={() => void loadData()}>
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : events.length === 0 ? (
            <View style={styles.stateContainer}>
              <Text style={styles.stateText}>No upcoming events right now.</Text>
            </View>
          ) : (
            events.slice(0, 3).map(renderEventCard)
          )}
        </View>
      </ScrollView>

      <Modal visible={isEventModalVisible} transparent animationType="none" onRequestClose={() => toggleEventModal(false)}>
        <View style={styles.modalOverlay}>
          <Animated.View style={[styles.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)', opacity: fadeAnim }]}>
            <TouchableOpacity
              style={{ flex: 1 }}
              activeOpacity={1}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                toggleEventModal(false);
              }}
            />
          </Animated.View>

          <Animated.View style={[styles.modalContainer, { transform: [{ translateY: slideAnim }] }]}>
            <View style={styles.modalHeader}>
              <View style={styles.modalBadge}>
                <FontAwesome name="calendar" size={20} color="#35408E" />
              </View>
              <TouchableOpacity
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  toggleEventModal(false);
                }}
              >
                <FontAwesome name="times" size={20} color="#8E8E93" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.eventModalTitle}>{selectedEvent?.title}</Text>

              <View style={styles.eventDetailRow}>
                <View style={styles.detailIconBox}>
                  <FontAwesome name="map-marker" size={18} color="#35408E" />
                </View>
                <View>
                  <Text style={styles.detailLabel}>LOCATION</Text>
                  <Text style={styles.detailValue}>{selectedEvent?.location}</Text>
                </View>
              </View>

              <View style={styles.eventDetailRow}>
                <View style={styles.detailIconBox}>
                  <FontAwesome name="clock-o" size={18} color="#35408E" />
                </View>
                <View>
                  <Text style={styles.detailLabel}>DATE & TIME</Text>
                  <Text style={styles.detailValue}>{selectedEvent?.date}</Text>
                </View>
              </View>

              <View style={styles.divider} />

              <Text style={styles.detailLabel}>DESCRIPTION</Text>
              <Text style={styles.eventModalDesc}>{selectedEvent?.description || 'No description provided.'}</Text>

              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)}
              >
                <Text style={styles.primaryButtonText}>RSVP to Event</Text>
              </TouchableOpacity>
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>

      <Modal visible={isSeeAllVisible} animationType="slide">
        <SafeAreaView style={premiumStyles.screen}>
          <View style={styles.seeAllHeader}>
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setIsSeeAllVisible(false);
              }}
            >
              <FontAwesome name="chevron-left" size={20} color="#35408E" />
            </TouchableOpacity>
            <Text style={styles.seeAllTitle}>All Events</Text>
            <View style={{ width: 20 }} />
          </View>

          <ScrollView contentContainerStyle={{ padding: 24 }}>
            {events.map((event) => (
              <TouchableOpacity
                key={String(event.id)}
                style={styles.eventCard}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setIsSeeAllVisible(false);
                  setTimeout(() => toggleEventModal(true, event), 300);
                }}
              >
                <View style={styles.dateBadge}>
                  <Text style={styles.dateMonth}>{event.date.split(' ')[0]}</Text>
                  <Text style={styles.dateDay}>{event.date.split(' ')[1]}</Text>
                </View>
                <View style={styles.eventInfo}>
                  <Text style={styles.eventTitle}>{event.title}</Text>
                  <Text style={styles.eventLocation}>{event.location}</Text>
                  <View style={styles.statusBadge}>
                    <Text style={styles.statusText}>{event.status}</Text>
                  </View>
                </View>
                <FontAwesome name="chevron-right" size={14} color="#D1D1D6" />
              </TouchableOpacity>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  headerAccessory: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  inboxButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 200, 0, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inboxBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#D14343',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#1C2456',
  },
  inboxBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  profileBtn: {
    position: 'relative',
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 200, 0, 0.45)',
    padding: 1,
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  statusIndicator: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    width: 11,
    height: 11,
    backgroundColor: '#4CD964',
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#1C2456',
  },
  heroCard: {
    borderRadius: 20,
    padding: 22,
    marginBottom: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#0B1028',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    elevation: 8,
  },
  heroFrost: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 200, 0, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255, 200, 0, 0.28)',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginBottom: 16,
  },
  heroBadgeText: {
    color: '#FFC800',
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 6,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: 'white',
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  heroSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: 20,
    lineHeight: 20,
  },
  viewProfileButton: {
    backgroundColor: '#FFC800',
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 12,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
  },
  viewProfileText: {
    color: premium.navy,
    fontWeight: '800',
    fontSize: 14,
  },
  ctaIcon: {
    marginLeft: 8,
  },
  homeStats: {
    marginBottom: 6,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 14,
  },
  eventsSectionHeader: {
    marginTop: 18,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1C1C1E',
    letterSpacing: -0.2,
  },
  viewAllText: {
    fontSize: 14,
    color: '#35408E',
    fontWeight: '600',
  },
  quickAccessGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  quickAccessCard: {
    backgroundColor: '#FFFFFF',
    width: '48%',
    padding: 16,
    marginBottom: 12,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(53, 64, 142, 0.08)',
    shadowColor: '#1C2456',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 3,
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1C1C1E',
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#8E8E93',
    lineHeight: 16,
    opacity: 0.9,
  },
  eventsWrap: {
    padding: 12,
    marginBottom: 8,
  },
  stateContainer: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  stateText: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
  },
  errorText: {
    fontSize: 14,
    color: '#FF3B30',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#35408E',
  },
  retryText: {
    color: '#35408E',
    fontWeight: '600',
    fontSize: 14,
  },
  eventCard: {
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    padding: 14,
    borderRadius: 16,
    marginBottom: 10,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(53, 64, 142, 0.08)',
    shadowColor: '#1C2456',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  dateBadge: {
    width: 50,
    height: 54,
    backgroundColor: '#1C2456',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 200, 0, 0.35)',
  },
  dateMonth: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFC800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  dateDay: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  eventInfo: {
    flex: 1,
  },
  eventTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1C1C1E',
    marginBottom: 2,
  },
  eventLocation: {
    fontSize: 12,
    color: '#8E8E93',
    marginBottom: 8,
    opacity: 0.9,
  },
  statusBadge: {
    backgroundColor: '#E8EFFF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  statusText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#35408E',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  absoluteFill: {
    ...StyleSheet.absoluteFill,
  },
  modalContainer: {
    backgroundColor: 'white',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: 24,
    maxHeight: height * 0.8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#E8EFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  eventModalTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1C1C1E',
    marginBottom: 24,
  },
  eventDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  detailIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#F8F9FB',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  detailLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#8E8E93',
    letterSpacing: 1,
  },
  detailValue: {
    fontSize: 15,
    color: '#1C1C1E',
    fontWeight: '500',
  },
  divider: {
    height: 1,
    backgroundColor: '#F2F2F7',
    marginVertical: 24,
  },
  eventModalDesc: {
    fontSize: 15,
    color: '#4A4A4A',
    lineHeight: 24,
    marginTop: 8,
    marginBottom: 32,
  },
  primaryButton: {
    backgroundColor: '#35408E',
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  primaryButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
  seeAllHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
  },
  seeAllTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1C1C1E',
  },
});
