import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity, Modal, Animated, Dimensions, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { FontAwesome } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { StatusBar } from 'expo-status-bar';
import { getApiErrorMessage } from '@/services/api';
import { yearbookService } from '@/services/yearbook';
import type { AchievementItem } from '@/services/yearbook';
import { ScreenHeader } from '@/components/ScreenHeader';

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
  const [selectedAchievement, setSelectedAchievement] = useState<AchievementItem | null>(null);
  const [isModalVisible, setIsModalVisible] = useState(false);

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

  const totalItems = categories.reduce((sum, cat) => sum + cat.items.length, 0);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />

      <ScreenHeader title="Achievements" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.pageHeader}>
          <Text style={styles.pageTitle}>Hall of Fame</Text>
          <Text style={styles.pageSubtitle}>Celebrating the outstanding achievements of our scholars</Text>
        </View>

        {loading ? (
          <View style={styles.stateContainer}>
            <ActivityIndicator size="large" color="#35408E" />
            <Text style={styles.stateText}>Loading achievements…</Text>
          </View>
        ) : error ? (
          <View style={styles.stateContainer}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={() => void loadAchievements()}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : totalItems === 0 ? (
          <View style={styles.stateContainer}>
            <Text style={styles.stateText}>No achievements to display yet.</Text>
          </View>
        ) : (
          categories.map((section) => (
            <View key={section.category} style={styles.section}>
              <View style={styles.categoryLabel}>
                <FontAwesome name={section.icon} size={14} color="#FFC800" style={styles.categoryIcon} />
                <Text style={styles.categoryText}>{section.category}</Text>
              </View>

              {section.items.map((item) => (
                <TouchableOpacity
                  key={String(item.id)}
                  style={styles.achievementCard}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    toggleModal(true, item);
                  }}
                >
                  <View style={styles.cardTop}>
                    <View style={styles.imageWrapper}>
                      {item.image ? (
                        <Image source={item.image} style={styles.avatar} contentFit="cover" transition={500} />
                      ) : (
                        <View style={[styles.avatar, styles.avatarPlaceholder]}>
                          <FontAwesome name="user" size={20} color="#8E8E93" />
                        </View>
                      )}
                      <View style={styles.medalIcon}>
                        <FontAwesome name="trophy" size={10} color="white" />
                      </View>
                    </View>
                    <View style={styles.titles}>
                      <Text style={styles.itemTitle}>{item.title}</Text>
                      <Text style={styles.itemName}>{item.name}</Text>
                    </View>
                    <FontAwesome name="chevron-right" size={12} color="#D1D1D6" style={{ marginLeft: 'auto' }} />
                  </View>

                  <View style={styles.cardBody}>
                    <Text style={styles.itemDesc} numberOfLines={2}>
                      {item.desc}
                    </Text>
                    <View style={styles.cardFooter}>
                      <Text style={styles.itemDate}>{item.date}</Text>
                      <TouchableOpacity
                        style={styles.shareButton}
                        onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)}
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
          <Animated.View style={[styles.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)', opacity: fadeAnim }]}>
            <TouchableOpacity
              style={{ flex: 1 }}
              activeOpacity={1}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
                {selectedAchievement?.image ? (
                  <Image source={selectedAchievement.image} style={styles.recipientAvatar} />
                ) : (
                  <View style={[styles.recipientAvatar, styles.avatarPlaceholder]}>
                    <FontAwesome name="user" size={22} color="#8E8E93" />
                  </View>
                )}
                <View style={styles.recipientInfo}>
                  <Text style={styles.recipientName}>{selectedAchievement?.name}</Text>
                  <Text style={styles.recipientDate}>Awarded on {selectedAchievement?.date}</Text>
                </View>
              </View>

              <View style={styles.divider} />

              <Text style={styles.modalSubtitle}>CITATION</Text>
              <Text style={styles.modalDesc}>{selectedAchievement?.desc || 'No description available.'}</Text>

              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)}
              >
                <Text style={styles.primaryButtonText}>Message Recipient</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)}
              >
                <Text style={styles.secondaryButtonText}>Share Achievement</Text>
              </TouchableOpacity>
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FB',
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 100,
  },
  pageHeader: {
    marginBottom: 32,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1C1C1E',
  },
  pageSubtitle: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: 4,
  },
  stateContainer: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 12,
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
    paddingHorizontal: 24,
  },
  retryButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#35408E',
  },
  retryText: {
    color: '#35408E',
    fontWeight: 'bold',
    fontSize: 14,
  },
  section: {
    marginBottom: 32,
  },
  categoryLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    backgroundColor: '#35408E',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  categoryIcon: {
    marginRight: 8,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: 'white',
    textTransform: 'uppercase',
  },
  achievementCard: {
    backgroundColor: 'white',
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  imageWrapper: {
    position: 'relative',
    marginRight: 16,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F0F2F8',
  },
  avatarPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  medalIcon: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: '#FFC800',
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'white',
  },
  titles: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1C1C1E',
  },
  itemName: {
    fontSize: 14,
    color: '#35408E',
    fontWeight: '500',
  },
  cardBody: {
    borderTopWidth: 1,
    borderTopColor: '#F2F2F7',
    paddingTop: 16,
  },
  itemDesc: {
    fontSize: 14,
    color: '#4A4A4A',
    lineHeight: 20,
    marginBottom: 16,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemDate: {
    fontSize: 12,
    color: '#8E8E93',
    fontWeight: '600',
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
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
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
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1C1C1E',
    marginBottom: 24,
  },
  modalSubtitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#8E8E93',
    letterSpacing: 1,
    marginBottom: 12,
  },
  recipientCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FB',
    padding: 16,
    borderRadius: 20,
    marginBottom: 24,
  },
  recipientAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 16,
    backgroundColor: '#F0F2F8',
  },
  recipientInfo: {
    flex: 1,
  },
  recipientName: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#1C1C1E',
  },
  recipientDate: {
    fontSize: 13,
    color: '#8E8E93',
  },
  divider: {
    height: 1,
    backgroundColor: '#F2F2F7',
    marginBottom: 24,
  },
  modalDesc: {
    fontSize: 16,
    color: '#4A4A4A',
    lineHeight: 26,
    marginBottom: 32,
  },
  primaryButton: {
    backgroundColor: '#35408E',
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#35408E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
  secondaryButton: {
    backgroundColor: 'white',
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 20,
  },
  secondaryButtonText: {
    color: '#1C1C1E',
    fontWeight: 'bold',
    fontSize: 16,
  },
});
