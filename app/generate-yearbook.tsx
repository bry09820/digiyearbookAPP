import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  FlatList,
  ActivityIndicator,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ListRenderItemInfo,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { Stack, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fallbackTopInset } from '@/utils/safeArea';
import { UpgradePrompt } from '@/components/UpgradePrompt';
import { getSubscriptionStatus } from '@/services/subscription';
import { useSubscriptionGate } from '@/hooks/useSubscriptionGate';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PAGE_WIDTH = SCREEN_WIDTH;

type FlipPage = {
  id: string;
  kind: 'cover' | 'spread' | 'gallery' | 'closing';
  title: string;
  subtitle: string;
  accent: string;
};

const PLACEHOLDER_PAGES: FlipPage[] = [
  {
    id: 'cover',
    kind: 'cover',
    title: 'NU Lipa',
    subtitle: 'Digital Yearbook · Class of 2026',
    accent: '#35408E',
  },
  {
    id: 'dedication',
    kind: 'spread',
    title: 'Dedication',
    subtitle: 'A placeholder spread for messages from faculty and batch officers.',
    accent: '#2F3A7A',
  },
  {
    id: 'batch',
    kind: 'gallery',
    title: 'Batch Portraits',
    subtitle: 'Swipe through generated student grids once export is wired.',
    accent: '#3D4BA0',
  },
  {
    id: 'memories',
    kind: 'gallery',
    title: 'Campus Memories',
    subtitle: 'Gallery highlights and event photos will land here.',
    accent: '#4656B5',
  },
  {
    id: 'closing',
    kind: 'closing',
    title: 'Until Next Time',
    subtitle: 'Export PDF / flipbook generation hooks go here.',
    accent: '#35408E',
  },
];

export default function GenerateYearbookScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<FlipPage>>(null);
  const [index, setIndex] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [accessChecked, setAccessChecked] = useState(false);
  const [hasAccess, setHasAccess] = useState(false);
  const {
    promptVisible,
    lockedFeature,
    requireSubscription,
    closePrompt,
    refreshAfterUpgrade,
    setPromptVisible,
  } = useSubscriptionGate();

  const topPad = Math.max(insets.top, fallbackTopInset());

  const verifyAccess = useCallback(async () => {
    setAccessChecked(false);
    try {
      const status = await getSubscriptionStatus();
      if (status.isSubscribed) {
        setHasAccess(true);
        setPromptVisible(false);
      } else {
        setHasAccess(false);
        setPromptVisible(true);
      }
    } catch {
      setHasAccess(false);
      setPromptVisible(true);
    } finally {
      setAccessChecked(true);
    }
  }, [setPromptVisible]);

  useEffect(() => {
    void verifyAccess();
  }, [verifyAccess]);

  const onMomentumEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(event.nativeEvent.contentOffset.x / PAGE_WIDTH);
    if (next !== index) {
      setIndex(next);
      void Haptics.selectionAsync();
    }
  };

  const goTo = (next: number) => {
    const clamped = Math.max(0, Math.min(PLACEHOLDER_PAGES.length - 1, next));
    listRef.current?.scrollToIndex({ index: clamped, animated: true });
    setIndex(clamped);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleGenerate = async () => {
    const { allowed } = await requireSubscription('flipbook');
    if (!allowed) {
      setHasAccess(false);
      return;
    }

    setHasAccess(true);
    setGenerating(true);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => {
      setGenerating(false);
      goTo(0);
    }, 900);
  };

  const handleUpgraded = async () => {
    const ok = await refreshAfterUpgrade();
    setHasAccess(ok);
    if (!ok) {
      // Recheck from API in case webhooks are slightly delayed.
      await verifyAccess();
    }
  };

  const renderPage = ({ item, index: pageIndex }: ListRenderItemInfo<FlipPage>) => (
    <View style={[styles.page, { width: PAGE_WIDTH }]}>
      <View style={[styles.pageInner, { backgroundColor: item.accent }]}>
        <Text style={styles.pageIndex}>
          {pageIndex + 1} / {PLACEHOLDER_PAGES.length}
        </Text>
        <View style={styles.pageBody}>
          {item.kind === 'cover' ? (
            <FontAwesome name="book" size={56} color="#FFC800" style={styles.pageIcon} />
          ) : item.kind === 'gallery' ? (
            <View style={styles.photoGrid}>
              {[0, 1, 2, 3].map((slot) => (
                <View key={`${item.id}-slot-${slot}`} style={styles.photoSlot}>
                  <FontAwesome name="image" size={22} color="rgba(255,255,255,0.55)" />
                </View>
              ))}
            </View>
          ) : (
            <FontAwesome
              name={item.kind === 'closing' ? 'graduation-cap' : 'quote-left'}
              size={40}
              color="#FFC800"
              style={styles.pageIcon}
            />
          )}
          <Text style={styles.pageTitle}>{item.title}</Text>
          <Text style={styles.pageSubtitle}>{item.subtitle}</Text>
        </View>
        <Text style={styles.swipeHint}>Swipe to flip pages</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />

      <UpgradePrompt
        visible={promptVisible}
        feature={lockedFeature === 'premium' ? 'flipbook' : lockedFeature}
        onClose={() => {
          closePrompt();
          if (!hasAccess && router.canGoBack()) {
            router.back();
          }
        }}
        onUpgraded={() => {
          void handleUpgraded();
        }}
      />

      <View style={[styles.topBar, { paddingTop: topPad + 8 }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            if (router.canGoBack()) router.back();
            else router.replace('/(tabs)/home');
          }}
        >
          <FontAwesome name="chevron-left" size={18} color="#FFC800" />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.topTitle}>Generate Yearbook</Text>
        <View style={styles.backButtonPlaceholder} />
      </View>

      {!accessChecked ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#35408E" />
          <Text style={styles.muted}>Checking subscription…</Text>
        </View>
      ) : !hasAccess ? (
        <View style={styles.centered}>
          <FontAwesome name="lock" size={36} color="#35408E" />
          <Text style={styles.lockedTitle}>Flipbooks are for subscribers</Text>
          <Text style={styles.muted}>
            Upgrade with PayMongo to open the digital yearbook flipbook and PDF export tools.
          </Text>
          <TouchableOpacity
            style={styles.unlockButton}
            onPress={() => setPromptVisible(true)}
          >
            <Text style={styles.unlockButtonText}>Upgrade to unlock</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={styles.intro}>
            <Text style={styles.introTitle}>Flipbook preview</Text>
            <Text style={styles.introBody}>
              Interactive layout template for presentation. Wire export APIs later — the swipe
              navigation and page chrome are ready now.
            </Text>
          </View>

          <FlatList
            ref={listRef}
            data={PLACEHOLDER_PAGES}
            keyExtractor={(item) => item.id}
            renderItem={renderPage}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onMomentumEnd}
            getItemLayout={(_, i) => ({
              length: PAGE_WIDTH,
              offset: PAGE_WIDTH * i,
              index: i,
            })}
            style={styles.flipbook}
          />

          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
            <View style={styles.dots}>
              {PLACEHOLDER_PAGES.map((page, i) => (
                <TouchableOpacity
                  key={page.id}
                  style={[styles.dot, i === index && styles.dotActive]}
                  onPress={() => goTo(i)}
                />
              ))}
            </View>

            <View style={styles.navRow}>
              <TouchableOpacity
                style={[styles.navButton, index === 0 && styles.navButtonDisabled]}
                disabled={index === 0}
                onPress={() => goTo(index - 1)}
              >
                <FontAwesome name="chevron-left" size={14} color="#35408E" />
                <Text style={styles.navButtonText}>Prev</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.generateButton} onPress={() => void handleGenerate()}>
                <FontAwesome name="magic" size={16} color="#FFFFFF" style={styles.generateIcon} />
                <Text style={styles.generateText}>
                  {generating ? 'Generating…' : 'Generate Yearbook'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.navButton,
                  index === PLACEHOLDER_PAGES.length - 1 && styles.navButtonDisabled,
                ]}
                disabled={index === PLACEHOLDER_PAGES.length - 1}
                onPress={() => goTo(index + 1)}
              >
                <Text style={styles.navButtonText}>Next</Text>
                <FontAwesome name="chevron-right" size={14} color="#35408E" />
              </TouchableOpacity>
            </View>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FB',
  },
  topBar: {
    backgroundColor: '#35408E',
    paddingHorizontal: 16,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 72,
  },
  backButtonPlaceholder: {
    minWidth: 72,
  },
  backText: {
    color: '#FFC800',
    fontWeight: '600',
    marginLeft: 6,
    fontSize: 15,
  },
  topTitle: {
    color: '#FFC800',
    fontSize: 17,
    fontWeight: 'bold',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  muted: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 20,
  },
  lockedTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1C1C1E',
    textAlign: 'center',
    marginTop: 8,
  },
  unlockButton: {
    marginTop: 8,
    backgroundColor: '#35408E',
    paddingHorizontal: 24,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unlockButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  intro: {
    paddingHorizontal: 24,
    paddingTop: 18,
    paddingBottom: 8,
  },
  introTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1C1C1E',
    marginBottom: 6,
  },
  introBody: {
    fontSize: 14,
    color: '#8E8E93',
    lineHeight: 20,
  },
  flipbook: {
    flexGrow: 0,
  },
  page: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  pageInner: {
    borderRadius: 20,
    minHeight: 380,
    padding: 24,
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  pageIndex: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  pageBody: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  pageIcon: {
    marginBottom: 20,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 10,
  },
  pageSubtitle: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 8,
  },
  swipeHint: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    textAlign: 'center',
  },
  photoGrid: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
    marginBottom: 20,
  },
  photoSlot: {
    width: '42%',
    aspectRatio: 1,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 8,
    gap: 14,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#D1D5DB',
  },
  dotActive: {
    width: 22,
    backgroundColor: '#35408E',
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  navButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#35408E',
    backgroundColor: '#FFFFFF',
  },
  navButtonDisabled: {
    opacity: 0.35,
  },
  navButtonText: {
    color: '#35408E',
    fontWeight: '700',
    fontSize: 13,
  },
  generateButton: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#35408E',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  generateIcon: {
    marginRight: 8,
  },
  generateText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
});
