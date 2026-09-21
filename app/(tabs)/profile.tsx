import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Animated,
  ActivityIndicator,
  Alert,
  ActionSheetIOS,
} from 'react-native';
import { Image } from 'expo-image';
import { FontAwesome } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { imageUrl, getApiErrorMessage } from '@/services/api';
import { yearbookService, type AchievementItem } from '@/services/yearbook';
import { authService } from '@/services/auth';
import { asText, firstText } from '@/utils/text';
import { resolveSubscription } from '@/utils/subscription';
import { UpgradePrompt } from '@/components/UpgradePrompt';

const { height } = Dimensions.get('window');

type ProfileFields = {
  name: string;
  firstName: string;
  lastName: string;
  degree: string;
  year: string;
  about: string;
  avatar: string | null;
  email: string;
  studentId: string;
  subscriptionLabel: string;
  subscriptionTier: string;
  isSubscribed: boolean;
};

function mapUserFields(user: Record<string, unknown>): ProfileFields {
  const firstName = asText(user.first_name);
  const lastName = asText(user.last_name);
  const name =
    firstText(user.name, [firstName, lastName].filter(Boolean).join(' ')) || 'Student';
  const degree = firstText(user.course, 'NU Lipa') || 'NU Lipa';
  const year =
    user.graduation_year != null
      ? `Class of ${asText(user.graduation_year)}`
      : firstText(user.batch, 'Student') || 'Student';

  const subscription = resolveSubscription(user);

  return {
    name,
    firstName: firstName || name.split(/\s+/)[0] || '',
    lastName: lastName || name.split(/\s+/).slice(1).join(' ') || '',
    degree,
    year,
    about: firstText(user.bio, user.motto, user.about),
    avatar: imageUrl(user.profile_picture ?? user.avatar ?? user.photo),
    email: asText(user.email),
    studentId: asText(user.student_id),
    subscriptionLabel: subscription.label,
    subscriptionTier: String(subscription.tier),
    isSubscribed: subscription.isSubscribed,
  };
}

export default function ProfileScreen() {
  const router = useRouter();

  const [fields, setFields] = useState<ProfileFields>({
    name: '',
    firstName: '',
    lastName: '',
    degree: '',
    year: '',
    about: '',
    avatar: null,
    email: '',
    studentId: '',
    subscriptionLabel: 'Free',
    subscriptionTier: 'free',
    isSubscribed: false,
  });
  const [achievements, setAchievements] = useState<AchievementItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [isPasswordModalVisible, setIsPasswordModalVisible] = useState(false);
  const [upgradeVisible, setUpgradeVisible] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(height)).current;

  const [editName, setEditName] = useState('');
  const [editAbout, setEditAbout] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const applyMapped = useCallback((mapped: ProfileFields, achievementList: AchievementItem[]) => {
    setFields(mapped);
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
    setEditName(mapped.name);
    setEditAbout(mapped.about);
  }, []);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [userRaw, achievementList] = await Promise.all([
        yearbookService.getCurrentUser(),
        yearbookService.getProfileAchievements().catch(() => []),
      ]);
      const user = (userRaw && typeof userRaw === 'object' ? userRaw : {}) as Record<string, unknown>;
      applyMapped(mapUserFields(user), achievementList as AchievementItem[]);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Unable to load profile.'));
    } finally {
      setLoading(false);
    }
  }, [applyMapped]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const toggleModal = (modalType: 'edit' | 'password', visible: boolean) => {
    if (visible) {
      if (modalType === 'edit') {
        setEditName(fields.name);
        setEditAbout(fields.about);
        setSaveError(null);
        setIsEditModalVisible(true);
      } else {
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setPasswordError(null);
        setIsPasswordModalVisible(true);
      }

      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 50, friction: 8 }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: height, duration: 250, useNativeDriver: true }),
      ]).start(() => {
        setIsEditModalVisible(false);
        setIsPasswordModalVisible(false);
      });
    }
  };

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
      // Optimistic local preview
      setFields((prev) => ({ ...prev, avatar: uri }));

      const { url } = await yearbookService.uploadProfilePicture(uri);
      if (url) {
        setFields((prev) => ({ ...prev, avatar: url }));
      } else {
        // Refresh from /auth/me so storage URL resolves like the web app
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

  const handleSaveProfile = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const nextBio = editAbout.trim();
      const nextName = editName.trim();

      await yearbookService.updateProfileBio(nextBio);

      if (nextName && nextName !== fields.name) {
        const parts = nextName.split(/\s+/);
        const first_name = parts[0];
        const last_name = parts.slice(1).join(' ') || parts[0];
        await yearbookService.updateAcademic({
          first_name,
          last_name,
          name: nextName,
        });
      }

      await loadProfile();
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toggleModal('edit', false);
    } catch (err) {
      setSaveError(getApiErrorMessage(err, 'Unable to save profile.'));
    } finally {
      setSaving(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError('Please fill in all password fields.');
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }

    setUpdatingPassword(true);
    setPasswordError(null);
    try {
      await yearbookService.updatePassword({
        current_password: currentPassword,
        password: newPassword,
        password_confirmation: confirmPassword,
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toggleModal('password', false);
      Alert.alert('Password updated', 'Your password was changed successfully.');
    } catch (err) {
      setPasswordError(getApiErrorMessage(err, 'Unable to update password.'));
    } finally {
      setUpdatingPassword(false);
    }
  };

  const handleSignOut = async () => {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    try {
      await authService.logout();
    } finally {
      router.replace('/login');
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" color="#35408E" />
        <Text style={styles.loadingText}>Loading profile…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
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

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{error}</Text>
          <TouchableOpacity onPress={() => void loadProfile()}>
            <Text style={styles.retryLink}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.blueHeader} />

        <View style={styles.profileInfoSection}>
          <TouchableOpacity
            style={styles.avatarWrapper}
            onPress={handleChangeAvatar}
            disabled={uploadingAvatar}
            accessibilityLabel="Change profile picture"
          >
            {fields.avatar ? (
              <Image source={fields.avatar} style={styles.avatar} contentFit="cover" />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <FontAwesome name="user" size={56} color="#8E8E93" />
              </View>
            )}
            <View style={styles.cameraBadge}>
              {uploadingAvatar ? (
                <ActivityIndicator size="small" color="#35408E" />
              ) : (
                <FontAwesome name="camera" size={12} color="#35408E" />
              )}
            </View>
          </TouchableOpacity>

          <Text style={styles.userName}>{asText(fields.name, 'Student')}</Text>
          <Text style={styles.userDegree}>{asText(fields.degree, 'NU Lipa')}</Text>
          <Text style={styles.userYear}>{asText(fields.year)}</Text>
          {fields.email ? <Text style={styles.userEmail}>{fields.email}</Text> : null}
          {fields.studentId ? (
            <Text style={styles.userMeta}>Student ID {fields.studentId}</Text>
          ) : null}
          <View
            style={[
              styles.subscriptionBadge,
              fields.isSubscribed ? styles.subscriptionBadgeActive : styles.subscriptionBadgeFree,
            ]}
          >
            <FontAwesome
              name={fields.isSubscribed ? 'star' : 'user-o'}
              size={12}
              color={fields.isSubscribed ? '#874D00' : '#35408E'}
              style={styles.subscriptionIcon}
            />
            <Text
              style={[
                styles.subscriptionText,
                fields.isSubscribed ? styles.subscriptionTextActive : styles.subscriptionTextFree,
              ]}
            >
              {asText(fields.subscriptionLabel, 'Free')}
            </Text>
          </View>

          {fields.isSubscribed ? (
            <View style={styles.premiumActiveBanner}>
              <FontAwesome name="check-circle" size={18} color="#874D00" />
              <View style={styles.premiumActiveCopy}>
                <Text style={styles.premiumActiveTitle}>Premium active</Text>
                <Text style={styles.premiumActiveBody}>
                  Full profiles, flipbooks, and yearbook tools are unlocked on your account.
                </Text>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.upgradeBanner}
              activeOpacity={0.9}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setUpgradeVisible(true);
              }}
              accessibilityRole="button"
              accessibilityLabel="Upgrade to Premium"
            >
              <View style={styles.upgradeBannerIcon}>
                <FontAwesome name="star" size={18} color="#FFC800" />
              </View>
              <View style={styles.upgradeBannerCopy}>
                <Text style={styles.upgradeBannerTitle}>Upgrade to Premium</Text>
                <Text style={styles.upgradeBannerBody}>
                  Unlock full directory profiles and digital yearbook flipbooks.
                </Text>
              </View>
              <FontAwesome name="chevron-right" size={14} color="#FFC800" />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.contentSection}>
          <View style={styles.sectionHeader}>
            <FontAwesome name="book" size={16} color="#35408E" style={styles.sectionIcon} />
            <Text style={styles.sectionTitle}>ABOUT</Text>
          </View>
          <Text style={styles.aboutText}>{asText(fields.about, 'No bio yet. Tap Account Settings to add one.')}</Text>

          <View style={[styles.sectionHeader, styles.achievementsHeader]}>
            <FontAwesome name="bookmark-o" size={16} color="#35408E" style={styles.sectionIcon} />
            <Text style={styles.sectionTitle}>ACHIEVEMENTS</Text>
          </View>

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
                      index % 2 === 0 ? styles.achievementTitleYellow : styles.achievementTitleBlue
                    }
                  >
                    {asText(item.title)}
                  </Text>
                  <Text
                    style={index % 2 === 0 ? styles.achievementSubYellow : styles.achievementSubBlue}
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

          <View style={styles.footerMenu}>
            <TouchableOpacity
              style={styles.menuButton}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                toggleModal('edit', true);
              }}
            >
              <FontAwesome name="cog" size={18} color="#35408E" style={styles.menuIcon} />
              <Text style={styles.menuButtonText}>Account Settings</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuButton, styles.menuButtonSpaced]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                toggleModal('password', true);
              }}
            >
              <FontAwesome name="lock" size={18} color="#35408E" style={styles.menuIcon} />
              <Text style={styles.menuButtonText}>Change Password</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuButton, styles.menuButtonSpaced, styles.signOutButton]}
              onPress={() => void handleSignOut()}
            >
              <FontAwesome name="sign-out" size={18} color="#FF3B30" style={styles.menuIcon} />
              <Text style={[styles.menuButtonText, styles.signOutText]}>Sign Out</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      <Modal
        visible={isEditModalVisible}
        transparent
        animationType="none"
        onRequestClose={() => toggleModal('edit', false)}
      >
        <View style={styles.modalOverlay}>
          <Animated.View
            style={[styles.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)', opacity: fadeAnim }]}
          >
            <TouchableOpacity
              style={styles.flex}
              activeOpacity={1}
              onPress={() => toggleModal('edit', false)}
            />
          </Animated.View>

          <Animated.View style={[styles.modalContainer, { transform: [{ translateY: slideAnim }] }]}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Edit Profile</Text>
                <TouchableOpacity onPress={() => toggleModal('edit', false)}>
                  <FontAwesome name="times" size={20} color="#8E8E93" />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
                <View style={styles.editAvatarSection}>
                  {fields.avatar ? (
                    <Image source={fields.avatar} style={styles.editAvatar} contentFit="cover" />
                  ) : (
                    <View style={[styles.editAvatar, styles.avatarPlaceholder]}>
                      <FontAwesome name="user" size={36} color="#8E8E93" />
                    </View>
                  )}
                  <TouchableOpacity
                    style={styles.changePicButton}
                    onPress={handleChangeAvatar}
                    disabled={uploadingAvatar}
                  >
                    {uploadingAvatar ? (
                      <ActivityIndicator size="small" color="#35408E" />
                    ) : (
                      <>
                        <FontAwesome name="camera" size={14} color="#35408E" style={styles.menuIcon} />
                        <Text style={styles.changePicText}>Change Profile Picture</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>

                <Text style={styles.inputLabel}>FULL NAME</Text>
                <TextInput
                  style={styles.input}
                  value={editName}
                  onChangeText={setEditName}
                  placeholder="Enter your name"
                  placeholderTextColor="#C7C7CC"
                />

                <Text style={styles.inputLabel}>ABOUT / BIO</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={editAbout}
                  onChangeText={setEditAbout}
                  placeholder="Tell your batchmates about yourself"
                  placeholderTextColor="#C7C7CC"
                  multiline
                />

                {saveError ? <Text style={styles.modalErrorText}>{saveError}</Text> : null}

                <TouchableOpacity
                  style={[styles.saveButton, saving && styles.saveButtonDisabled]}
                  disabled={saving}
                  onPress={() => void handleSaveProfile()}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#35408E" />
                  ) : (
                    <Text style={styles.saveButtonText}>Save Changes</Text>
                  )}
                </TouchableOpacity>
              </ScrollView>
            </KeyboardAvoidingView>
          </Animated.View>
        </View>
      </Modal>

      <Modal
        visible={isPasswordModalVisible}
        transparent
        animationType="none"
        onRequestClose={() => toggleModal('password', false)}
      >
        <View style={styles.modalOverlay}>
          <Animated.View
            style={[styles.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)', opacity: fadeAnim }]}
          >
            <TouchableOpacity
              style={styles.flex}
              activeOpacity={1}
              onPress={() => toggleModal('password', false)}
            />
          </Animated.View>

          <Animated.View style={[styles.modalContainer, { transform: [{ translateY: slideAnim }] }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Change Password</Text>
              <TouchableOpacity onPress={() => toggleModal('password', false)}>
                <FontAwesome name="times" size={20} color="#8E8E93" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.inputLabel}>CURRENT PASSWORD</Text>
              <TextInput
                style={styles.input}
                secureTextEntry
                placeholder="••••••••"
                placeholderTextColor="#C7C7CC"
                value={currentPassword}
                onChangeText={setCurrentPassword}
              />
              <Text style={styles.inputLabel}>NEW PASSWORD</Text>
              <TextInput
                style={styles.input}
                secureTextEntry
                placeholder="••••••••"
                placeholderTextColor="#C7C7CC"
                value={newPassword}
                onChangeText={setNewPassword}
              />
              <Text style={styles.inputLabel}>CONFIRM NEW PASSWORD</Text>
              <TextInput
                style={styles.input}
                secureTextEntry
                placeholder="••••••••"
                placeholderTextColor="#C7C7CC"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
              />

              {passwordError ? <Text style={styles.modalErrorText}>{passwordError}</Text> : null}

              <TouchableOpacity
                style={[styles.saveButton, updatingPassword && styles.saveButtonDisabled]}
                disabled={updatingPassword}
                onPress={() => void handleUpdatePassword()}
              >
                {updatingPassword ? (
                  <ActivityIndicator size="small" color="#35408E" />
                ) : (
                  <Text style={styles.saveButtonText}>Update Password</Text>
                )}
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#8E8E93',
  },
  errorBanner: {
    backgroundColor: '#FFF2F0',
    padding: 12,
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
  flex: {
    flex: 1,
  },
  absoluteFill: {
    ...StyleSheet.absoluteFill,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 40,
  },
  blueHeader: {
    height: 180,
    backgroundColor: '#35408E',
    width: '100%',
  },
  profileInfoSection: {
    alignItems: 'center',
    marginTop: -80,
    paddingHorizontal: 24,
  },
  avatarWrapper: {
    position: 'relative',
    marginBottom: 20,
  },
  avatar: {
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 6,
    borderColor: '#FFFFFF',
    backgroundColor: '#F0F2F8',
  },
  avatarPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  userName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1C1C1E',
    marginBottom: 6,
    textAlign: 'center',
  },
  userDegree: {
    fontSize: 18,
    color: '#35408E',
    fontWeight: '500',
    marginBottom: 4,
  },
  userYear: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 13,
    color: '#35408E',
    marginBottom: 2,
  },
  userMeta: {
    fontSize: 12,
    color: '#8E8E93',
    marginBottom: 8,
  },
  subscriptionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 4,
    marginBottom: 16,
    borderWidth: 1,
  },
  subscriptionBadgeActive: {
    backgroundColor: '#FFFBE6',
    borderColor: '#FFE58F',
  },
  subscriptionBadgeFree: {
    backgroundColor: '#F0F2F8',
    borderColor: '#D5DBF0',
  },
  subscriptionIcon: {
    marginRight: 6,
  },
  subscriptionText: {
    fontSize: 13,
    fontWeight: '700',
  },
  subscriptionTextActive: {
    color: '#874D00',
  },
  subscriptionTextFree: {
    color: '#35408E',
  },
  upgradeBanner: {
    width: '100%',
    marginTop: 4,
    marginBottom: 8,
    backgroundColor: '#35408E',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  upgradeBannerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 200, 0, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  upgradeBannerCopy: {
    flex: 1,
  },
  upgradeBannerTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  upgradeBannerBody: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 12,
    lineHeight: 17,
  },
  premiumActiveBanner: {
    width: '100%',
    marginTop: 4,
    marginBottom: 8,
    backgroundColor: '#FFFBE6',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FFE58F',
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  premiumActiveCopy: {
    flex: 1,
  },
  premiumActiveTitle: {
    color: '#874D00',
    fontSize: 15,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  premiumActiveBody: {
    color: '#A67C00',
    fontSize: 12,
    lineHeight: 17,
  },
  contentSection: {
    paddingHorizontal: 24,
    paddingBottom: 40,
    marginTop: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  achievementsHeader: {
    marginTop: 30,
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
  aboutText: {
    fontSize: 14,
    color: '#4A4A4A',
    lineHeight: 22,
  },
  emptyAchievements: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 12,
  },
  achievementCardYellow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBE6',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#FFF1B8',
  },
  achievementCardBlue: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F5FF',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
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
    marginTop: 30,
    borderTopWidth: 1,
    borderTopColor: '#F0F2F8',
    paddingTop: 20,
  },
  menuButton: {
    width: '100%',
    height: 50,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#35408E',
  },
  menuButtonSpaced: {
    marginTop: 12,
  },
  signOutButton: {
    borderColor: '#FF3B30',
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
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: 'white',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: 24,
    paddingBottom: 40,
    maxHeight: height * 0.9,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1C1C1E',
  },
  modalBody: {
    marginBottom: 20,
  },
  modalErrorText: {
    fontSize: 13,
    color: '#FF3B30',
    marginTop: 12,
  },
  editAvatarSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  editAvatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 16,
    borderWidth: 3,
    borderColor: '#F0F2F8',
  },
  changePicButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F2F8',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    minHeight: 36,
  },
  changePicText: {
    fontSize: 12,
    color: '#35408E',
    fontWeight: 'bold',
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8E8E93',
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    backgroundColor: '#F8F9FB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#1C1C1E',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  saveButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#35408E',
    height: 55,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 32,
    marginBottom: 20,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#35408E',
    fontWeight: 'bold',
    fontSize: 16,
  },
});
