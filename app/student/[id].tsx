import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Alert,
  Share,
} from 'react-native';
import { Image } from 'expo-image';
import { FontAwesome } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getApiErrorMessage } from '@/services/api';
import {
  yearbookService,
  type DirectoryStudent,
  type AchievementItem,
} from '@/services/yearbook';
import { asText } from '@/utils/text';
import { fallbackTopInset } from '@/utils/safeArea';
import { resolveSubscription } from '@/utils/subscription';
import { UpgradePrompt } from '@/components/UpgradePrompt';

function paramId(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return asText(value[0]);
  return asText(value);
}

export default function StudentProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const studentId = paramId(id);

  const [student, setStudent] = useState<DirectoryStudent | null>(null);
  const [achievements, setAchievements] = useState<AchievementItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [upgradeVisible, setUpgradeVisible] = useState(false);

  const load = useCallback(async () => {
    if (!studentId) {
      setError('Missing student id.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [profile, me] = await Promise.all([
        yearbookService.getStudent(studentId),
        yearbookService.getCurrentUser().catch(() => null),
      ]);

      const meRecord = me && typeof me === 'object' ? (me as Record<string, unknown>) : null;
      const subscription = resolveSubscription(meRecord);

      const viewerId = meRecord?.id;
      const isOwner =
        viewerId != null && String(viewerId) === String(profile.id);

      // Free viewers only see the name. Owners and subscribed viewers get full details
      // unless the API marked the profile restricted (e.g. privacy / 402 teaser).
      const canViewFull =
        isOwner || (subscription.isSubscribed && profile.restricted !== true);

      setStudent(
        canViewFull
          ? { ...profile, restricted: false }
          : { ...profile, restricted: true },
      );

      if (!canViewFull) {
        setAchievements([]);
      } else {
        const ach = await yearbookService
          .getStudentAchievements(studentId)
          .catch(() => []);
        setAchievements(
          (Array.isArray(ach) ? ach : []).map((item, index) => ({
            ...item,
            id: `${asText(item.id, 'ach')}-${index}`,
            title: asText(item.title, 'Achievement'),
            name: asText(item.name),
            desc: asText(item.desc),
            date: asText(item.date),
          })),
        );
        void yearbookService.recordStudentView(studentId);
      }
    } catch (err) {
      setError(getApiErrorMessage(err, 'Unable to load student profile.'));
      setStudent(null);
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleMessage = async () => {
    const email = asText(student?.email);
    if (!email) {
      Alert.alert(
        'Messaging unavailable',
        'This student has not shared a public email address yet.',
      );
      return;
    }

    const url = `mailto:${email}?subject=${encodeURIComponent('Hello from NU Lipa Yearbook')}`;
    try {
      const can = await Linking.canOpenURL(url);
      if (!can) {
        Alert.alert('Cannot open mail', `Email this student at ${email}`);
        return;
      }
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await Linking.openURL(url);
    } catch {
      Alert.alert('Cannot open mail', `Email this student at ${email}`);
    }
  };

  const handleShare = async () => {
    if (!student) return;
    try {
      await Share.share({
        message: student.restricted
          ? `${asText(student.name)} — NU Lipa Yearbook`
          : `${asText(student.name)} — ${asText(student.degree)}\n${asText(student.year)} • ${asText(student.section)}\n\n${asText(student.bio)}`,
      });
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {
      // User cancelled share sheet.
    }
  };

  const topPad = Math.max(insets.top, fallbackTopInset());
  const showFullProfile = Boolean(student && !student.restricted);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />

      <UpgradePrompt
        visible={upgradeVisible && !showFullProfile}
        feature="profile"
        onClose={() => setUpgradeVisible(false)}
        onUpgraded={() => {
          void load();
        }}
      />

      <View style={[styles.topBar, { paddingTop: topPad + 8 }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            if (router.canGoBack()) router.back();
            else router.replace('/directory');
          }}
          accessibilityLabel="Go back"
        >
          <FontAwesome name="chevron-left" size={18} color="#FFC800" />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.topTitle}>Student Profile</Text>
        <View style={styles.backButtonPlaceholder} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#35408E" />
          <Text style={styles.muted}>Loading profile…</Text>
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => void load()}>
            <Text style={styles.primaryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : student ? (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          <View style={styles.blueHeader} />
          <View style={styles.profileBlock}>
            <View style={styles.avatarWrapper}>
              {showFullProfile && student.image ? (
                <Image source={student.image} style={styles.avatar} contentFit="cover" />
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder]}>
                  <FontAwesome
                    name={showFullProfile ? 'user' : 'lock'}
                    size={showFullProfile ? 56 : 40}
                    color="#8E8E93"
                  />
                </View>
              )}
            </View>

            <Text style={styles.name}>{asText(student.name, 'Student')}</Text>

            {showFullProfile ? (
              <>
                <Text style={styles.degree}>{asText(student.degree, 'NU Lipa')}</Text>
                <Text style={styles.meta}>
                  {[asText(student.year), asText(student.section)].filter(Boolean).join(' • ')}
                </Text>
                {student.student_id ? (
                  <Text style={styles.studentId}>ID {asText(student.student_id)}</Text>
                ) : null}
                {student.email ? (
                  <Text style={styles.email}>{asText(student.email)}</Text>
                ) : null}

                <View style={styles.actions}>
                  <TouchableOpacity style={styles.primaryAction} onPress={() => void handleMessage()}>
                    <FontAwesome name="envelope" size={14} color="#fff" style={styles.actionIcon} />
                    <Text style={styles.primaryActionText}>Message</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.secondaryAction} onPress={() => void handleShare()}>
                    <FontAwesome name="share-alt" size={14} color="#35408E" style={styles.actionIcon} />
                    <Text style={styles.secondaryActionText}>Share</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <View style={styles.lockedCard}>
                <FontAwesome name="lock" size={18} color="#35408E" style={styles.lockedIcon} />
                <Text style={styles.lockedTitle}>Subscribers see full profiles</Text>
                <Text style={styles.lockedBody}>
                  Free accounts can only view a student&apos;s name. Upgrade to Standard or Premium
                  to unlock photos, contact details, bio, and achievements.
                </Text>
                <TouchableOpacity
                  style={styles.upgradeButton}
                  onPress={() => {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                    setUpgradeVisible(true);
                  }}
                >
                  <Text style={styles.primaryActionText}>Upgrade to unlock</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {showFullProfile ? (
            <>
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <FontAwesome name="book" size={16} color="#35408E" style={styles.sectionIcon} />
                  <Text style={styles.sectionTitle}>ABOUT</Text>
                </View>
                <Text style={styles.about}>{asText(student.bio, 'No bio available yet.')}</Text>
              </View>

              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <FontAwesome name="bookmark-o" size={16} color="#35408E" style={styles.sectionIcon} />
                  <Text style={styles.sectionTitle}>ACHIEVEMENTS</Text>
                </View>
                {achievements.length === 0 ? (
                  <Text style={styles.muted}>No achievements listed yet.</Text>
                ) : (
                  achievements.map((item, index) => (
                    <View key={`ach-${asText(item.id)}-${index}`} style={styles.achievementCard}>
                      <View style={styles.achievementInfo}>
                        <Text style={styles.achievementTitle}>{asText(item.title)}</Text>
                        <Text style={styles.achievementSub}>
                          {asText(item.date)}
                          {asText(item.desc) ? ` · ${asText(item.desc)}` : ''}
                        </Text>
                      </View>
                      <FontAwesome name="trophy" size={16} color="#A67C00" />
                    </View>
                  ))
                )}
              </View>
            </>
          ) : null}
        </ScrollView>
      ) : (
        <View style={styles.centered}>
          <Text style={styles.muted}>Student not found.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
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
    padding: 24,
    gap: 12,
  },
  muted: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
  },
  errorText: {
    fontSize: 14,
    color: '#FF3B30',
    textAlign: 'center',
    marginBottom: 8,
  },
  scroll: {
    paddingBottom: 40,
  },
  blueHeader: {
    height: 120,
    backgroundColor: '#35408E',
  },
  profileBlock: {
    alignItems: 'center',
    marginTop: -70,
    paddingHorizontal: 24,
  },
  avatarWrapper: {
    marginBottom: 16,
  },
  avatar: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 6,
    borderColor: '#FFFFFF',
    backgroundColor: '#F0F2F8',
  },
  avatarPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  name: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#1C1C1E',
    textAlign: 'center',
    marginBottom: 4,
  },
  degree: {
    fontSize: 16,
    color: '#35408E',
    fontWeight: '500',
    textAlign: 'center',
  },
  meta: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: 4,
    textAlign: 'center',
  },
  studentId: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 6,
  },
  email: {
    fontSize: 13,
    color: '#35408E',
    marginTop: 4,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    marginTop: 20,
    marginBottom: 28,
  },
  primaryAction: {
    flex: 1,
    height: 50,
    backgroundColor: '#35408E',
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  upgradeButton: {
    width: '100%',
    height: 50,
    backgroundColor: '#35408E',
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
    marginTop: 4,
  },
  primaryActionText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },
  secondaryAction: {
    flex: 1,
    height: 50,
    backgroundColor: 'white',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#35408E',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryActionText: {
    color: '#35408E',
    fontWeight: 'bold',
    fontSize: 14,
  },
  actionIcon: {
    marginRight: 8,
  },
  lockedCard: {
    width: '100%',
    marginTop: 20,
    marginBottom: 28,
    backgroundColor: '#F5F7FC',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#D5DBF0',
    padding: 20,
    alignItems: 'center',
    gap: 10,
  },
  lockedIcon: {
    marginBottom: 4,
  },
  lockedTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1C1C1E',
    textAlign: 'center',
  },
  lockedBody: {
    fontSize: 13,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 8,
  },
  section: {
    paddingHorizontal: 24,
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionIcon: {
    marginRight: 10,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1C1C1E',
    letterSpacing: 0.5,
  },
  about: {
    fontSize: 14,
    color: '#4A4A4A',
    lineHeight: 22,
  },
  achievementCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBE6',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#FFF1B8',
  },
  achievementInfo: {
    flex: 1,
  },
  achievementTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#874D00',
    marginBottom: 2,
  },
  achievementSub: {
    fontSize: 12,
    color: '#A67C00',
  },
  primaryButton: {
    backgroundColor: '#35408E',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  primaryButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
});
