import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
  Modal,
  Animated,
  Dimensions,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { StatusBar } from 'expo-status-bar';
import { getApiErrorMessage } from '@/services/api';
import { yearbookService } from '@/services/yearbook';
import type { AchievementItem } from '@/services/yearbook';
import { ScreenHeader } from '@/components/ScreenHeader';
import { ChatModal, type ChatPeer } from '@/modules/chat';
import {
  SummaryStats,
  SearchField,
  FilterPills,
  InitialsAvatar,
  premiumStyles,
  type FilterPill,
} from '@/components/premium';
import { asText } from '@/utils/text';

const { height } = Dimensions.get('window');

type AchievementCategory = {
  category: string;
  icon: React.ComponentProps<typeof FontAwesome>['name'];
  items: AchievementItem[];
};

export default function AchievementsScreen() {
  const [categories, setCategories] = useState<AchievementCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [selectedAchievement, setSelectedAchievement] = useState<AchievementItem | null>(null);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [chatVisible, setChatVisible] = useState(false);
  const [chatPeer, setChatPeer] = useState<ChatPeer | null>(null);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(height)).current;

  const loadAchievements = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [topViewedResult, trendingResult, profileResult] = await Promise.allSettled([
        yearbookService.getTopViewed(10),
        yearbookService.getTrending(),
        yearbookService.getProfileAchievements(),
      ]);

      const topViewed = topViewedResult.status === 'fulfilled' ? topViewedResult.value : [];
      const trending = trendingResult.status === 'fulfilled' ? trendingResult.value : [];
      const profileAchievements =
        profileResult.status === 'fulfilled' ? profileResult.value : [];

      const grouped: AchievementCategory[] = (
        [
          { category: 'Most Viewed', icon: 'star' as const, items: topViewed },
          { category: 'Trending', icon: 'line-chart' as const, items: trending },
          {
            category: 'Your Achievements',
            icon: 'bookmark' as const,
            items: profileAchievements,
          },
        ] satisfies AchievementCategory[]
      ).filter((section) => section.items.length > 0);

      setCategories(grouped);

      if (
        topViewedResult.status === 'rejected' &&
        trendingResult.status === 'rejected' &&
        profileResult.status === 'rejected'
      ) {
        setError(
          getApiErrorMessage(profileResult.reason, 'Unable to load achievements.'),
        );
      }
    } catch (err) {
      setError(getApiErrorMessage(err, 'Unable to load achievements.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAchievements();
  }, [loadAchievements]);

  const filterPills: FilterPill[] = useMemo(() => {
    const pills: FilterPill[] = [{ key: 'all', label: 'All', value: 'All' }];
    categories.forEach((cat) => {
      pills.push({
        key: cat.category,
        label: cat.category,
        value: cat.category,
      });
    });
    return pills;
  }, [categories]);

  const filteredCategories = useMemo(() => {
    const q = search.trim().toLowerCase();
    return categories
      .filter((cat) => activeCategory === 'All' || cat.category === activeCategory)
      .map((cat) => ({
        ...cat,
        items: cat.items.filter((item) => {
          if (!q) return true;
          return (
            asText(item.title).toLowerCase().includes(q) ||
            asText(item.name).toLowerCase().includes(q) ||
            asText(item.desc).toLowerCase().includes(q)
          );
        }),
      }))
      .filter((cat) => cat.items.length > 0);
  }, [categories, activeCategory, search]);

  const totalItems = categories.reduce((sum, cat) => sum + cat.items.length, 0);
  const showingItems = filteredCategories.reduce((sum, cat) => sum + cat.items.length, 0);

  const stats = useMemo(
    () => [
      { key: 'awards', label: 'Awards', value: totalItems },
      { key: 'categories', label: 'Categories', value: categories.length },
      { key: 'showing', label: 'Showing', value: showingItems },
    ],
    [totalItems, categories.length, showingItems],
  );

  const toggleModal = (visible: boolean, item: AchievementItem | null = null) => {
    if (visible) {
      setSelectedAchievement(item);
      setIsModalVisible(true);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 50, friction: 8 }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: height, duration: 250, useNativeDriver: true }),
      ]).start(() => {
        setIsModalVisible(false);
        setSelectedAchievement(null);
      });
    }
  };

  return (
    <SafeAreaView style={premiumStyles.screen}>
      <StatusBar style="light" />
      <ScreenHeader
        title="Awards"
        subtitle="Hall of Fame · scholar achievements"
        icon="trophy"
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={premiumStyles.scrollContent}>
        <SummaryStats items={stats} />

        <SearchField
          value={search}
          onChangeText={setSearch}
          placeholder="Search awards or recipients…"
        />

        <FilterPills
          items={filterPills}
          activeValue={activeCategory}
          onChange={setActiveCategory}
        />

        {loading ? (
          <View style={premiumStyles.centerState}>
            <ActivityIndicator size="large" color="#35408E" />
            <Text style={premiumStyles.mutedText}>Loading achievements…</Text>
          </View>
        ) : error ? (
          <View style={premiumStyles.centerState}>
            <Text style={premiumStyles.errorText}>{error}</Text>
            <TouchableOpacity
              style={premiumStyles.primaryButton}
              onPress={() => void loadAchievements()}
            >
              <Text style={premiumStyles.primaryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : showingItems === 0 ? (
          <View style={premiumStyles.centerState}>
            <Text style={premiumStyles.mutedText}>No achievements to display yet.</Text>
          </View>
        ) : (
          filteredCategories.map((section) => (
            <View key={section.category} style={styles.section}>
              <View style={styles.categoryLabel}>
                <FontAwesome
                  name={section.icon}
                  size={12}
                  color="#FFC800"
                  style={styles.categoryIcon}
                />
                <Text style={styles.categoryText}>{section.category}</Text>
              </View>

              {section.items.map((item) => (
                <TouchableOpacity
                  key={String(item.id)}
                  style={styles.achievementCard}
                  onPress={() => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    toggleModal(true, item);
                  }}
                  activeOpacity={0.88}
                >
                  <View style={styles.cardTop}>
                    <View style={styles.imageWrapper}>
                      <InitialsAvatar name={item.name || item.title} image={item.image} size={48} />
                      <View style={styles.medalIcon}>
                        <FontAwesome name="trophy" size={9} color="white" />
                      </View>
                    </View>
                    <View style={styles.titles}>
                      <Text style={styles.itemTitle} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text style={styles.itemName} numberOfLines={1}>
                        {item.name}
                      </Text>
                    </View>
                    <FontAwesome name="chevron-right" size={12} color="#D1D1D6" />
                  </View>

                  <View style={styles.cardBody}>
                    <Text style={styles.itemDesc} numberOfLines={2}>
                      {item.desc}
                    </Text>
                    <View style={styles.cardFooter}>
                      <Text style={styles.itemDate}>{item.date}</Text>
                      <TouchableOpacity
                        style={styles.shareButton}
                        onPress={() =>
                          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
                        }
                      >
                        <FontAwesome name="share-alt" size={12} color="#35408E" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          ))
        )}
      </ScrollView>

      <Modal visible={isModalVisible} transparent animationType="none" onRequestClose={() => toggleModal(false)}>
        <View style={styles.modalOverlay}>
          <Animated.View
            style={[styles.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)', opacity: fadeAnim }]}
          >
            <TouchableOpacity
              style={{ flex: 1 }}
              activeOpacity={1}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                toggleModal(false);
              }}
            />
          </Animated.View>

          <Animated.View style={[styles.modalContainer, { transform: [{ translateY: slideAnim }] }]}>
            <View style={styles.modalHeader}>
              <View style={styles.modalBadge}>
                <FontAwesome name="trophy" size={20} color="#FFC800" />
              </View>
              <TouchableOpacity
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  toggleModal(false);
                }}
                style={styles.modalClose}
              >
                <FontAwesome name="times" size={20} color="#8E8E93" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={styles.modalScroll}>
              <Text style={styles.modalTitle}>{selectedAchievement?.title}</Text>
              <Text style={styles.modalSubtitle}>AWARD RECIPIENT</Text>

              <View style={styles.recipientCard}>
                <InitialsAvatar
                  name={selectedAchievement?.name}
                  image={selectedAchievement?.image}
                  size={50}
                />
                <View style={styles.recipientInfo}>
                  <Text style={styles.recipientName}>{selectedAchievement?.name}</Text>
                  <Text style={styles.recipientDate}>Awarded on {selectedAchievement?.date}</Text>
                </View>
              </View>

              <View style={styles.divider} />

              <Text style={styles.modalSubtitle}>CITATION</Text>
              <Text style={styles.modalDesc}>
                {selectedAchievement?.desc || 'No description available.'}
              </Text>

              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() => {
                  const peerId = asText(selectedAchievement?.id);
                  const name = asText(selectedAchievement?.name);
                  if (!peerId || !name || name.toLowerCase() === 'you') {
                    Alert.alert(
                      'Messaging unavailable',
                      'This achievement is not linked to another student you can message.',
                    );
                    return;
                  }
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setChatPeer({
                    id: peerId,
                    name,
                    image: selectedAchievement?.image ?? null,
                    kind: 'student',
                  });
                  setChatVisible(true);
                }}
              >
                <Text style={styles.primaryButtonText}>Message Recipient</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)}
              >
                <Text style={styles.secondaryButtonText}>Share Achievement</Text>
              </TouchableOpacity>
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>

      <ChatModal
        visible={chatVisible}
        peer={chatPeer}
        onClose={() => {
          setChatVisible(false);
          setChatPeer(null);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 18,
  },
  categoryLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    backgroundColor: '#1C2456',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
  },
  categoryIcon: {
    marginRight: 7,
  },
  categoryText: {
    fontSize: 11,
    fontWeight: '800',
    color: 'white',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  achievementCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(53, 64, 142, 0.08)',
    shadowColor: '#1C2456',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  imageWrapper: {
    position: 'relative',
  },
  medalIcon: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: '#FFC800',
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'white',
  },
  titles: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  itemName: {
    fontSize: 13,
    color: '#35408E',
    fontWeight: '600',
    marginTop: 2,
  },
  cardBody: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E8ECF5',
    paddingTop: 12,
  },
  itemDesc: {
    fontSize: 13,
    color: '#4A4A4A',
    lineHeight: 19,
    marginBottom: 12,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemDate: {
    fontSize: 11,
    color: '#8E8E93',
    fontWeight: '700',
  },
  shareButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F0F5FF',
    justifyContent: 'center',
    alignItems: 'center',
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
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    maxHeight: height * 0.85,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFFBE6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalClose: {
    padding: 8,
  },
  modalScroll: {
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1C1C1E',
    marginBottom: 20,
  },
  modalSubtitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#8E8E93',
    letterSpacing: 1,
    marginBottom: 12,
  },
  recipientCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F4F6FB',
    padding: 14,
    borderRadius: 16,
    marginBottom: 20,
    gap: 14,
  },
  recipientInfo: {
    flex: 1,
  },
  recipientName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  recipientDate: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E8ECF5',
    marginBottom: 20,
  },
  modalDesc: {
    fontSize: 15,
    color: '#4A4A4A',
    lineHeight: 24,
    marginBottom: 28,
  },
  primaryButton: {
    backgroundColor: '#35408E',
    height: 52,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  primaryButtonText: {
    color: 'white',
    fontWeight: '700',
    fontSize: 15,
  },
  secondaryButton: {
    backgroundColor: 'white',
    height: 52,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 16,
  },
  secondaryButtonText: {
    color: '#1C1C1E',
    fontWeight: '700',
    fontSize: 15,
  },
});
