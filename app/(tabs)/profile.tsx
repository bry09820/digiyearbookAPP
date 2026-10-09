import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  Alert,
  ActionSheetIOS,
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { FontAwesome } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FaceLoginCameraModal } from '@/components/FaceLoginCameraModal';
import { UpgradePrompt } from '@/components/UpgradePrompt';
import { ScreenHeader } from '@/components/ScreenHeader';
import {
  SummaryStats,
  FilterPills,
  premiumStyles,
  premium,
  type FilterPill,
} from '@/components/premium';
import { imageUrl, getApiErrorMessage } from '@/services/api';
import { authService } from '@/services/auth';
import { faceService } from '@/services/face';
import { yearbookService, type AchievementItem } from '@/services/yearbook';
import { asText, firstText } from '@/utils/text';
import { resolveSubscription } from '@/utils/subscription';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const COVER_HEIGHT = 120;
const AVATAR_SIZE = 112;
const AVATAR_OVERLAP = 56;

type ProfileTab = 'posts' | 'tagged' | 'yearbook' | 'academic' | 'achievements';

type ProfileFields = {
  name: string;
  firstName: string;
  lastName: string;
  degree: string;
  program: string;
  year: string;
  batch: string;
  about: string;
  avatar: string | null;
  cover: string | null;
  email: string;
  studentId: string;
  userId: number | null;
  subscriptionLabel: string;
  subscriptionTier: string;
  isSubscribed: boolean;
  isGraduate: boolean;
  school: string;
};

type ProfileStats = {
  posts: string;
  views: string;
  program: string;
  id: string;
  batch: string;
};

const PROFILE_TABS: { id: ProfileTab; label: string; icon: React.ComponentProps<typeof FontAwesome>['name'] }[] = [
  { id: 'posts', label: 'Posts', icon: 'th-large' },
  { id: 'tagged', label: 'Tagged', icon: 'tags' },
  { id: 'yearbook', label: 'Yearbook', icon: 'book' },
  { id: 'academic', label: 'Academic', icon: 'graduation-cap' },
  { id: 'achievements', label: 'Achievements', icon: 'trophy' },
];

function isGraduateUser(user: Record<string, unknown>): boolean {
  const role = String(user.role || '').toLowerCase();
  if (['alumni', 'graduate', 'graduated'].includes(role)) return true;
  const year = Number(
    user.graduation_year ?? (user.student as { graduation_year?: number } | undefined)?.graduation_year,
  );
  return Number.isFinite(year) && year <= new Date().getFullYear();
}

function formatStatCount(value: unknown, fallback = '0'): string {
  if (value == null || value === '') return fallback;
  const num = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
  if (!Number.isFinite(num)) return asText(value, fallback) || fallback;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(Math.round(num));
}

function mapUserFields(user: Record<string, unknown>): ProfileFields {
  const firstName = asText(user.first_name);
  const lastName = asText(user.last_name);
  const name =
    firstText(user.name, [firstName, lastName].filter(Boolean).join(' ')) || 'Student';
  const program = firstText(user.course, user.course_short, user.program) || 'NU Lipa';
  const batchRaw = firstText(
    user.batch,
    asText(user.batch_year),
    asText(user.graduation_year),
  );
  const year =
    user.graduation_year != null
      ? `Class of ${asText(user.graduation_year)}`
      : batchRaw
        ? `Batch ${batchRaw}`
        : 'Student';

  const subscription = resolveSubscription(user);

  return {
    name,
    firstName: firstName || name.split(/\s+/)[0] || '',
    lastName: lastName || name.split(/\s+/).slice(1).join(' ') || '',
    degree: program,
    program,
    year,
    batch: batchRaw || '—',
    about: firstText(user.bio, user.motto, user.about),
    avatar: imageUrl(user.profile_picture ?? user.avatar ?? user.photo),
    cover: imageUrl(
      user.cover_photo ?? user.cover_image ?? user.banner ?? user.cover,
    ),
    email: asText(user.email),
    studentId: asText(user.student_id),
    userId: typeof user.id === 'number' ? user.id : Number(user.id) || null,
    subscriptionLabel: subscription.label,
    subscriptionTier: String(subscription.tier),
    isSubscribed: subscription.isSubscribed,
    isGraduate: isGraduateUser(user),
    school: firstText(user.school, user.campus, 'National University — Lipa') || 'National University — Lipa',
  };
}

function mapStats(raw: unknown, fields: ProfileFields): ProfileStats {
  const payload =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const nested =
    payload.stats && typeof payload.stats === 'object'
      ? (payload.stats as Record<string, unknown>)
      : payload;

  return {
    posts: formatStatCount(
      nested.posts ?? nested.post_count ?? nested.total_posts ?? nested.posts_count,
      '0',
    ),
    views: formatStatCount(
      nested.views ??
        nested.profile_views ??
        nested.total_views ??
        nested.views_count ??
        nested.views_this_week,
      '0',
    ),
    program: asText(fields.program, '—') || '—',
    id: asText(fields.studentId, '—') || '—',
    batch: asText(fields.batch, '—') || '—',
  };
}

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [fields, setFields] = useState<ProfileFields>({
    name: '',
    firstName: '',
    lastName: '',
    degree: '',
    program: '',
    year: '',
    batch: '',
    about: '',
    avatar: null,
    cover: null,
    email: '',
    studentId: '',
    userId: null,
    subscriptionLabel: 'Free',
    subscriptionTier: 'free',
    isSubscribed: false,
    isGraduate: false,
    school: 'National University — Lipa',
  });
  const [stats, setStats] = useState<ProfileStats>({
    posts: '0',
    views: '0',
    program: '—',
    id: '—',
    batch: '—',
  });
  const [achievements, setAchievements] = useState<AchievementItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [upgradeVisible, setUpgradeVisible] = useState(false);
  const [faceCameraVisible, setFaceCameraVisible] = useState(false);
  const [faceRegistering, setFaceRegistering] = useState(false);
  const [activeTab, setActiveTab] = useState<ProfileTab>('posts');

  const applyMapped = useCallback(
    (mapped: ProfileFields, achievementList: AchievementItem[], statsRaw: unknown) => {
      setFields(mapped);
      setStats(mapStats(statsRaw, mapped));
      setAchievements(
        (Array.isArray(achievementList) ? achievementList : []).map((item, index) => ({
          ...item,
          id: `${asText(item.id, 'ach')}-${index}`,
          title: asText(item.title, 'Achievement'),
          name: asText(item.name),
          desc: asText(item.desc),
          date: asText(item.date),
        })),
      );
    },
    [],
  );

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [userRaw, achievementList, statsRaw] = await Promise.all([
        yearbookService.getCurrentUser(),
        yearbookService.getProfileAchievements().catch(() => []),
        yearbookService.getMyStats().catch(() => null),
      ]);
      const user = (userRaw && typeof userRaw === 'object' ? userRaw : {}) as Record<string, unknown>;
      applyMapped(mapUserFields(user), achievementList as AchievementItem[], statsRaw);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Unable to load profile.'));
    } finally {
      setLoading(false);
    }
  }, [applyMapped]);

  useFocusEffect(
    useCallback(() => {
      void loadProfile();
    }, [loadProfile]),
  );

  const pickAndUploadAvatar = async (fromCamera: boolean) => {
    try {
      const permission = fromCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          'Permission needed',
          fromCamera
            ? 'Camera access is required to take a profile photo.'
            : 'Photo library access is required to choose a profile picture.',
        );
        return;
      }

      const result = fromCamera
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.85,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.85,
          });

      if (result.canceled || !result.assets?.[0]?.uri) return;

      const uri = result.assets[0].uri;
      setUploadingAvatar(true);
      setFields((prev) => ({ ...prev, avatar: uri }));

      const { url } = await yearbookService.uploadProfilePicture(uri);
      if (url) {
        setFields((prev) => ({ ...prev, avatar: url }));
      } else {
        await loadProfile();
      }

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      Alert.alert('Upload failed', getApiErrorMessage(err, 'Unable to update profile picture.'));
      await loadProfile();
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleChangeAvatar = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Take Photo', 'Choose from Library'],
          cancelButtonIndex: 0,
        },
        (buttonIndex) => {
          if (buttonIndex === 1) void pickAndUploadAvatar(true);
          if (buttonIndex === 2) void pickAndUploadAvatar(false);
        },
      );
      return;
    }

    Alert.alert('Update profile picture', 'Choose a source', [
      { text: 'Camera', onPress: () => void pickAndUploadAvatar(true) },
      { text: 'Photo Library', onPress: () => void pickAndUploadAvatar(false) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleSignOut = async () => {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    try {
      await authService.logout();
    } finally {
      router.replace('/');
    }
  };

  const openFaceRegistration = () => {
    if (Platform.OS === 'web') {
      Alert.alert(
        'Unavailable on web',
        'Face registration requires the iOS or Android app with camera access.',
      );
      return;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFaceCameraVisible(true);
  };

  const closeFaceRegistration = () => {
    if (faceRegistering) return;
    setFaceCameraVisible(false);
  };

  const handleFaceRegisterCapture = async (imageBase64: string) => {
    setFaceRegistering(true);
    try {
      const result = await faceService.registerFace({
        image_base64: imageBase64,
        student_id: fields.studentId || undefined,
        user_id: fields.userId ?? undefined,
      });

      setFaceCameraVisible(false);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        'Face registered',
        result.message ||
          'Your face was indexed for recognition login. Your profile picture was not changed.',
      );
    } catch (err) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        'Face registration failed',
        getApiErrorMessage(err, 'Unable to register face. Please try again.'),
        [
          { text: 'Try again', style: 'cancel' },
          {
            text: 'Close',
            onPress: () => setFaceCameraVisible(false),
          },
        ],
      );
    } finally {
      setFaceRegistering(false);
    }
  };

  const statsItems = useMemo(
    () => [
      { key: 'posts', label: 'Posts', value: stats.posts },
      { key: 'views', label: 'Views', value: stats.views },
      { key: 'program', label: 'Program', value: stats.program },
      { key: 'id', label: 'ID', value: stats.id },
      { key: 'batch', label: 'Batch', value: stats.batch },
    ],
    [stats],
  );

  const tabPills: FilterPill[] = useMemo(
    () =>
      PROFILE_TABS.map((tab) => ({
        key: tab.id,
        label: tab.label,
        value: tab.id,
      })),
    [],
  );

  const headerSubtitle = fields.isGraduate
    ? 'Graduate · National University — Lipa'
    : 'Student · National University — Lipa';
  const headerIcon = fields.isGraduate ? 'graduation-cap' : 'book';

  if (loading) {
    return (
      <View style={premiumStyles.screen}>
        <StatusBar style="light" />
        <ScreenHeader
          title="My Profile"
          subtitle="Loading your profile…"
          icon="graduation-cap"
        />
        <View style={premiumStyles.centerState}>
          <ActivityIndicator size="large" color={premium.brand} />
          <Text style={premiumStyles.mutedText}>Loading profile…</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={premiumStyles.screen}>
      <StatusBar style="light" />

      <UpgradePrompt
        visible={upgradeVisible}
        feature="premium"
        title="Upgrade to Premium"
        message="Unlock full student profiles, flipbooks, and PDF yearbook tools with a PayMongo subscription."
        onClose={() => setUpgradeVisible(false)}
        onUpgraded={() => {
          void loadProfile();
        }}
      />

      <ScreenHeader
        title="My Profile"
        subtitle={headerSubtitle}
        icon={headerIcon}
        rightAccessory={
          <TouchableOpacity
            style={styles.headerSettingsBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/profile-settings' as Href);
            }}
            accessibilityLabel="Account settings"
          >
            <FontAwesome name="cog" size={16} color="#FFC800" />
          </TouchableOpacity>
        }
      />

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{error}</Text>
          <TouchableOpacity onPress={() => void loadProfile()}>
            <Text style={styles.retryLink}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          premiumStyles.scrollContent,
          { paddingBottom: 48 + insets.bottom },
        ]}
      >
        {/* Cover photo strip — no title bar */}
        <View style={styles.coverWrap}>
          {fields.cover ? (
            <Image source={fields.cover} style={styles.coverImage} contentFit="cover" />
          ) : (
            <Image
              source={require('../../assets/images/nu.jpg')}
              style={styles.coverImage}
              contentFit="cover"
            />
          )}
          <View style={styles.coverOverlay} />
        </View>

        {/* Avatar overlapping into identity card */}
        <View style={styles.avatarRow}>
          <TouchableOpacity
            style={styles.avatarWrapper}
            onPress={handleChangeAvatar}
            disabled={uploadingAvatar}
            accessibilityLabel="Change profile picture"
            activeOpacity={0.9}
          >
            {fields.avatar ? (
              <Image source={fields.avatar} style={styles.avatar} contentFit="cover" />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <FontAwesome name="user" size={42} color="#8E8E93" />
              </View>
            )}
            <View style={styles.onlineDot} accessibilityLabel="Online" />
            <View style={styles.cameraBadge}>
              {uploadingAvatar ? (
                <ActivityIndicator size="small" color="#35408E" />
              ) : (
                <FontAwesome name="camera" size={11} color="#35408E" />
              )}
            </View>
          </TouchableOpacity>
        </View>

        {/* Identity card */}
        <View style={[premiumStyles.contentCard, styles.identityCard]}>
          <Text style={styles.userName}>{asText(fields.name, 'Student')}</Text>
          <Text style={styles.userSchool}>{asText(fields.school)}</Text>
          <Text style={styles.userDegree}>
            {[asText(fields.degree, 'NU Lipa'), asText(fields.year)].filter(Boolean).join(' · ')}
          </Text>
          {fields.email ? <Text style={styles.userEmail}>{fields.email}</Text> : null}

          <View style={styles.badgeRow}>
            {fields.isGraduate ? (
              <View style={[styles.statusBadge, styles.graduateBadge]}>
                <FontAwesome name="graduation-cap" size={11} color="#1D39C4" style={styles.badgeIcon} />
                <Text style={[styles.statusBadgeText, styles.graduateBadgeText]}>Graduate</Text>
              </View>
            ) : (
              <View style={[styles.statusBadge, styles.studentBadge]}>
                <FontAwesome name="book" size={11} color="#35408E" style={styles.badgeIcon} />
                <Text style={[styles.statusBadgeText, styles.studentBadgeText]}>Student</Text>
              </View>
            )}
            <View
              style={[
                styles.statusBadge,
                fields.isSubscribed ? styles.premiumBadge : styles.freeBadge,
              ]}
            >
              <FontAwesome
                name={fields.isSubscribed ? 'star' : 'user-o'}
                size={11}
                color={fields.isSubscribed ? '#874D00' : '#5C6B8A'}
                style={styles.badgeIcon}
              />
              <Text
                style={[
                  styles.statusBadgeText,
                  fields.isSubscribed ? styles.premiumBadgeText : styles.freeBadgeText,
                ]}
              >
                {fields.isSubscribed ? 'Premium' : asText(fields.subscriptionLabel, 'Free')}
              </Text>
            </View>
          </View>

          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.primaryAction}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push('/profile-settings' as Href);
              }}
            >
              <FontAwesome name="pencil" size={13} color="#FFFFFF" style={styles.actionIcon} />
              <Text style={styles.primaryActionText}>Edit Profile</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryAction}
              onPress={openFaceRegistration}
              disabled={faceRegistering}
            >
              <FontAwesome name="user" size={13} color="#35408E" style={styles.actionIcon} />
              <Text style={styles.secondaryActionText}>Face ID</Text>
            </TouchableOpacity>
            {!fields.isSubscribed ? (
              <TouchableOpacity
                style={styles.upgradeAction}
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setUpgradeVisible(true);
                }}
              >
                <FontAwesome name="star" size={13} color="#874D00" style={styles.actionIcon} />
                <Text style={styles.upgradeActionText}>Upgrade</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {fields.isSubscribed ? (
            <View style={styles.premiumActiveBanner}>
              <FontAwesome name="check-circle" size={16} color="#874D00" />
              <Text style={styles.premiumActiveBody}>
                Premium active — full profiles, flipbooks, and yearbook tools unlocked.
              </Text>
            </View>
          ) : null}
        </View>

        <SummaryStats items={statsItems} scrollable style={styles.statsSpacing} />

        <FilterPills
          items={tabPills}
          activeValue={activeTab}
          onChange={(value) => setActiveTab(value as ProfileTab)}
        />

        {/* Tab panels */}
        <View style={[premiumStyles.contentCard, styles.panelCard]}>
          {activeTab === 'posts' ? (
            <View style={styles.emptyPanel}>
              <View style={styles.emptyIconWrap}>
                <FontAwesome name="th-large" size={22} color="#35408E" />
              </View>
              <Text style={styles.emptyTitle}>No posts yet</Text>
              <Text style={styles.emptyBody}>
                Your yearbook posts and shared memories will appear here.
              </Text>
            </View>
          ) : null}

          {activeTab === 'tagged' ? (
            <View style={styles.emptyPanel}>
              <View style={styles.emptyIconWrap}>
                <FontAwesome name="tags" size={22} color="#35408E" />
              </View>
              <Text style={styles.emptyTitle}>No tagged photos</Text>
              <Text style={styles.emptyBody}>
                Photos and moments you&apos;re tagged in will show up in this section.
              </Text>
            </View>
          ) : null}

          {activeTab === 'yearbook' ? (
            <View style={styles.yearbookPanel}>
              <Text style={styles.panelHeading}>Digital Yearbook</Text>
              <Text style={styles.aboutText}>
                {asText(fields.about, 'No motto yet. Open Account Settings to add one.')}
              </Text>
              <TouchableOpacity
                style={styles.yearbookCta}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push('/generate-yearbook' as Href);
                }}
              >
                <FontAwesome name="book" size={14} color="#FFFFFF" style={styles.actionIcon} />
                <Text style={styles.primaryActionText}>Open Yearbook</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {activeTab === 'academic' ? (
            <View style={styles.academicPanel}>
              <Text style={styles.panelHeading}>Academic details</Text>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Program</Text>
                <Text style={styles.detailValue}>{asText(fields.program, '—')}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Student ID</Text>
                <Text style={styles.detailValue}>{asText(fields.studentId, '—')}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Batch</Text>
                <Text style={styles.detailValue}>{asText(fields.batch, '—')}</Text>
              </View>
              <View style={[styles.detailRow, styles.detailRowLast]}>
                <Text style={styles.detailLabel}>Class</Text>
                <Text style={styles.detailValue}>{asText(fields.year, '—')}</Text>
              </View>
            </View>
          ) : null}

          {activeTab === 'achievements' ? (
            <View>
              <Text style={styles.panelHeading}>Achievements</Text>
              {achievements.length === 0 ? (
                <Text style={styles.emptyAchievements}>No achievements yet.</Text>
              ) : (
                achievements.map((item, index) => (
                  <View
                    key={`ach-${asText(item.id)}-${index}`}
                    style={index % 2 === 0 ? styles.achievementCardYellow : styles.achievementCardBlue}
                  >
                    <View style={styles.achievementInfo}>
                      <Text
                        style={
                          index % 2 === 0
                            ? styles.achievementTitleYellow
                            : styles.achievementTitleBlue
                        }
                      >
                        {asText(item.title)}
                      </Text>
                      <Text
                        style={
                          index % 2 === 0 ? styles.achievementSubYellow : styles.achievementSubBlue
                        }
                      >
                        {asText(item.name) || asText(item.date)}
                      </Text>
                    </View>
                    <FontAwesome
                      name="bookmark-o"
                      size={18}
                      color={index % 2 === 0 ? '#A67C00' : '#35408E'}
                    />
                  </View>
                ))
              )}
            </View>
          ) : null}
        </View>

        <View style={styles.footerMenu}>
          <TouchableOpacity
            style={[styles.menuButton, styles.signOutButton]}
            onPress={() => void handleSignOut()}
          >
            <FontAwesome name="sign-out" size={16} color="#FF3B30" style={styles.menuIcon} />
            <Text style={[styles.menuButtonText, styles.signOutText]}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <FaceLoginCameraModal
        visible={faceCameraVisible}
        verifying={faceRegistering}
        title="Register Face"
        verifyingLabel="Registering…"
        permissionBody="Allow camera access so we can capture your face for recognition login."
        closeAccessibilityLabel="Close face registration"
        secondaryCloseLabel="Cancel"
        onCapture={handleFaceRegisterCapture}
        onClose={closeFaceRegistration}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  headerSettingsBtn: {
    width: 48,
    height: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 200, 0, 0.35)',
    backgroundColor: 'rgba(255, 200, 0, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBanner: {
    backgroundColor: '#FFF2F0',
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  errorBannerText: {
    flex: 1,
    fontSize: 13,
    color: '#FF3B30',
    marginRight: 8,
  },
  retryLink: {
    fontSize: 13,
    color: '#35408E',
    fontWeight: '600',
  },
  coverWrap: {
    width: SCREEN_WIDTH,
    marginHorizontal: -16,
    height: COVER_HEIGHT,
    backgroundColor: '#35408E',
    overflow: 'hidden',
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
  },
  coverImage: {
    ...StyleSheet.absoluteFill,
    width: '100%',
    height: '100%',
  },
  coverOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(28, 36, 86, 0.35)',
  },
  avatarRow: {
    alignItems: 'center',
    marginTop: -AVATAR_OVERLAP,
    zIndex: 2,
  },
  avatarWrapper: {
    position: 'relative',
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    backgroundColor: '#F0F2F8',
  },
  avatarPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  onlineDot: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#22C55E',
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#1C2456',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },
  identityCard: {
    marginTop: 12,
    paddingTop: 12,
    paddingBottom: 18,
    paddingHorizontal: 18,
    alignItems: 'center',
  },
  userName: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1C1C1E',
    textAlign: 'center',
    marginBottom: 4,
  },
  userSchool: {
    fontSize: 13,
    color: '#5C6B8A',
    textAlign: 'center',
    marginBottom: 2,
    opacity: 0.9,
  },
  userDegree: {
    fontSize: 15,
    color: '#35408E',
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 2,
  },
  userEmail: {
    fontSize: 12,
    color: '#8E8E93',
    textAlign: 'center',
    marginTop: 2,
    opacity: 0.85,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    marginBottom: 14,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  badgeIcon: {
    marginRight: 5,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  graduateBadge: {
    backgroundColor: '#F0F5FF',
    borderColor: '#D6E4FF',
  },
  graduateBadgeText: {
    color: '#1D39C4',
  },
  studentBadge: {
    backgroundColor: '#F0F2F8',
    borderColor: '#D5DBF0',
  },
  studentBadgeText: {
    color: '#35408E',
  },
  premiumBadge: {
    backgroundColor: '#FFFBE6',
    borderColor: '#FFE58F',
  },
  premiumBadgeText: {
    color: '#874D00',
  },
  freeBadge: {
    backgroundColor: '#F7F8FC',
    borderColor: '#E2E6F0',
  },
  freeBadgeText: {
    color: '#5C6B8A',
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
  },
  primaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#35408E',
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 12,
  },
  primaryActionText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  secondaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F2F8',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D5DBF0',
  },
  secondaryActionText: {
    color: '#35408E',
    fontSize: 13,
    fontWeight: '700',
  },
  upgradeAction: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBE6',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FFE58F',
  },
  upgradeActionText: {
    color: '#874D00',
    fontSize: 13,
    fontWeight: '700',
  },
  actionIcon: {
    marginRight: 6,
  },
  premiumActiveBanner: {
    width: '100%',
    marginTop: 14,
    backgroundColor: '#FFFBE6',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FFE58F',
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  premiumActiveBody: {
    flex: 1,
    color: '#A67C00',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
  },
  statsSpacing: {
    marginBottom: 14,
  },
  panelCard: {
    minHeight: 160,
    padding: 18,
  },
  panelHeading: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1C1C1E',
    marginBottom: 12,
  },
  emptyPanel: {
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 8,
  },
  emptyIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#F0F2F8',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 6,
  },
  emptyBody: {
    fontSize: 13,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 19,
    opacity: 0.9,
  },
  yearbookPanel: {
    gap: 4,
  },
  yearbookCta: {
    marginTop: 16,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#35408E',
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 12,
  },
  aboutText: {
    fontSize: 14,
    color: '#4A4A4A',
    lineHeight: 22,
  },
  academicPanel: {},
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E8ECF5',
  },
  detailRowLast: {
    borderBottomWidth: 0,
  },
  detailLabel: {
    fontSize: 13,
    color: '#8E8E93',
    fontWeight: '600',
  },
  detailValue: {
    fontSize: 14,
    color: '#1C1C1E',
    fontWeight: '700',
    maxWidth: '62%',
    textAlign: 'right',
  },
  emptyAchievements: {
    fontSize: 14,
    color: '#8E8E93',
  },
  achievementCardYellow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBE6',
    padding: 14,
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#FFF1B8',
  },
  achievementCardBlue: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F5FF',
    padding: 14,
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#D6E4FF',
  },
  achievementInfo: {
    flex: 1,
  },
  achievementTitleYellow: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#874D00',
    marginBottom: 2,
  },
  achievementSubYellow: {
    fontSize: 12,
    color: '#A67C00',
  },
  achievementTitleBlue: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#1D39C4',
    marginBottom: 2,
  },
  achievementSubBlue: {
    fontSize: 12,
    color: '#2F54EB',
  },
  footerMenu: {
    marginTop: 4,
    marginBottom: 8,
  },
  menuButton: {
    width: '100%',
    height: 50,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#35408E',
  },
  signOutButton: {
    borderColor: '#FFD0CD',
    backgroundColor: '#FFF7F6',
  },
  menuIcon: {
    marginRight: 8,
  },
  menuButtonText: {
    color: '#35408E',
    fontWeight: 'bold',
    fontSize: 15,
  },
  signOutText: {
    color: '#FF3B30',
  },
});
