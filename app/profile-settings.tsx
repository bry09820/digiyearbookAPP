import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FaceLoginCameraModal } from '@/components/FaceLoginCameraModal';
import { ScreenHeader } from '@/components/ScreenHeader';
import { premium, premiumStyles } from '@/components/premium';
import { getApiErrorMessage } from '@/services/api';
import { faceService } from '@/services/face';
import { yearbookService } from '@/services/yearbook';
import { asText, firstText } from '@/utils/text';

type VisibilityValue = 'public' | 'batchmates' | 'private';

type NavSection = {
  id: string;
  label: string;
  icon: React.ComponentProps<typeof FontAwesome>['name'];
};

type EditableAchievement = {
  id: string | number | null;
  title: string;
  subtitle: string;
  icon: string;
  color: string;
};

const VISIBILITY_OPTS: Array<{
  value: VisibilityValue;
  label: string;
  desc: string;
  icon: React.ComponentProps<typeof FontAwesome>['name'];
}> = [
  { value: 'public', label: 'Public', desc: 'Anyone can view your profile', icon: 'globe' },
  {
    value: 'batchmates',
    label: 'Batchmates',
    desc: 'Only students in your batch can view',
    icon: 'users',
  },
  { value: 'private', label: 'Private', desc: 'Only you can view your profile', icon: 'lock' },
];

const ACHIEVEMENT_ICON_OPTIONS: Array<{
  icon: string;
  label: string;
  fa: React.ComponentProps<typeof FontAwesome>['name'];
}> = [
  { icon: 'fa-code', label: 'Code', fa: 'code' },
  { icon: 'fa-lightbulb', label: 'Idea', fa: 'lightbulb-o' },
  { icon: 'fa-star', label: 'Star', fa: 'star' },
  { icon: 'fa-trophy', label: 'Trophy', fa: 'trophy' },
  { icon: 'fa-medal', label: 'Medal', fa: 'certificate' },
  { icon: 'fa-certificate', label: 'Certificate', fa: 'certificate' },
  { icon: 'fa-flask', label: 'Science', fa: 'flask' },
  { icon: 'fa-music', label: 'Music', fa: 'music' },
  { icon: 'fa-palette', label: 'Art', fa: 'paint-brush' },
  { icon: 'fa-futbol', label: 'Sports', fa: 'soccer-ball-o' },
];

const ACHIEVEMENT_COLOR_OPTIONS = [
  '#3f51b5',
  '#f59e0b',
  '#fdb813',
  '#10b981',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#f97316',
  '#1d2b4b',
];

const BASE_NAV: NavSection[] = [
  { id: 'visibility', label: 'Visibility', icon: 'eye' },
  { id: 'motto', label: 'Motto', icon: 'quote-left' },
  { id: 'academic', label: 'Academic', icon: 'graduation-cap' },
  { id: 'achievements', label: 'Achievements', icon: 'trophy' },
  { id: 'face', label: 'Face', icon: 'user' },
  { id: 'password', label: 'Password', icon: 'lock' },
];

const CAREER_NAV: NavSection = { id: 'career', label: 'Career', icon: 'briefcase' };

function isMeaningfulText(value: string, minLength = 10): boolean {
  const text = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
  const compact = text.replace(/[^a-z0-9]/gi, '').toLowerCase();
  if (text.length < minLength || compact.length < minLength) return false;
  if (/^(test|asdf|qwerty|sample|lorem|abc|haha)+$/i.test(compact)) return false;
  if (/^(.)\1{2,}$/.test(compact)) return false;
  return true;
}

function parseAchievementType(value: unknown): { icon: string; color: string } {
  try {
    const parsed = JSON.parse(String(value || '{}')) as { icon?: string; color?: string };
    return {
      icon: parsed.icon || 'fa-star',
      color: parsed.color || '#fdb813',
    };
  } catch {
    return { icon: 'fa-star', color: '#fdb813' };
  }
}

function resolveFaIcon(icon: string): React.ComponentProps<typeof FontAwesome>['name'] {
  const match = ACHIEVEMENT_ICON_OPTIONS.find((opt) => opt.icon === icon);
  return match?.fa ?? 'star';
}

function isGraduateUser(user: Record<string, unknown> | null): boolean {
  if (!user) return false;
  const role = String(user.role || '').toLowerCase();
  if (['alumni', 'graduate', 'graduated'].includes(role)) return true;
  const year = Number(user.graduation_year ?? (user.student as { graduation_year?: number })?.graduation_year);
  return Number.isFinite(year) && year <= new Date().getFullYear();
}

function normalizeVisibility(raw: unknown): VisibilityValue {
  const value = asText(raw).toLowerCase().trim();
  if (!value) return 'public';
  if (value === 'alumni_only' || value === 'alumni' || value === 'batch' || value === 'batchmate') {
    return 'batchmates';
  }
  if (value === 'only_me' || value === 'me' || value === 'hidden' || value === 'none') {
    return 'private';
  }
  if (value === 'public' || value === 'batchmates' || value === 'private') return value;
  return 'public';
}

/** Pull visibility from every shape /auth/me (and nested student) may return. */
function extractVisibilityFromUser(raw: Record<string, unknown> | null | undefined): VisibilityValue {
  if (!raw || typeof raw !== 'object') return 'public';

  const nested =
    (raw.student_record as Record<string, unknown> | undefined) ||
    (raw.studentRecord as Record<string, unknown> | undefined) ||
    (raw.student as Record<string, unknown> | undefined) ||
    {};

  return normalizeVisibility(
    firstText(
      raw.profile_visibility,
      raw.visibility,
      raw.privacy,
      raw.profile_privacy,
      nested.profile_visibility,
      nested.visibility,
    ),
  );
}

export default function ProfileSettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const sectionOffsets = useRef<Record<string, number>>({});

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [user, setUser] = useState<Record<string, unknown> | null>(null);
  const [activeSection, setActiveSection] = useState('visibility');

  const [visibility, setVisibility] = useState<VisibilityValue>('public');
  const [savedVisibility, setSavedVisibility] = useState<VisibilityValue>('public');
  const [visibilitySaving, setVisibilitySaving] = useState(false);
  const savedVisibilityRef = useRef<VisibilityValue>('public');
  const visibilityRef = useRef<VisibilityValue>('public');
  const visibilitySavingRef = useRef(false);

  const [motto, setMotto] = useState('');
  const [mottoSaving, setMottoSaving] = useState(false);

  const [academicForm, setAcademicForm] = useState({
    student_id: '',
    course: '',
    graduation_year: '',
    batch: '',
  });
  const [academicSaving, setAcademicSaving] = useState(false);

  const [careerForm, setCareerForm] = useState({
    job_title: '',
    company: '',
    location: '',
    field: '',
    bio: '',
  });
  const [careerLoading, setCareerLoading] = useState(false);
  const [careerSaving, setCareerSaving] = useState(false);

  const [achievements, setAchievements] = useState<EditableAchievement[]>([]);
  const [achieveLoading, setAchieveLoading] = useState(false);
  const [achieveSaving, setAchieveSaving] = useState(false);
  const [iconPickerIndex, setIconPickerIndex] = useState<number | null>(null);

  const [pwForm, setPwForm] = useState({
    current_password: '',
    password: '',
    password_confirmation: '',
  });
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pwErrors, setPwErrors] = useState<Record<string, string>>({});
  const [pwSaving, setPwSaving] = useState(false);
  const [faceCameraVisible, setFaceCameraVisible] = useState(false);
  const [faceRegistering, setFaceRegistering] = useState(false);

  const canEditCareer = isGraduateUser(user);

  const navSections = useMemo(() => {
    if (!canEditCareer) return BASE_NAV;
    return [...BASE_NAV.slice(0, 3), CAREER_NAV, ...BASE_NAV.slice(3)];
  }, [canEditCareer]);

  const applyUser = useCallback((raw: Record<string, unknown>) => {
    setUser(raw);
    const nextVisibility = extractVisibilityFromUser(raw);
    setVisibility(nextVisibility);
    setSavedVisibility(nextVisibility);
    savedVisibilityRef.current = nextVisibility;
    visibilityRef.current = nextVisibility;
    setMotto(firstText(raw.motto, raw.bio));
    setAcademicForm({
      student_id: asText(raw.student_id),
      course: asText(raw.course),
      graduation_year: asText(raw.graduation_year),
      batch: asText(raw.batch),
    });
  }, []);

  const loadAchievements = useCallback(async () => {
    setAchieveLoading(true);
    try {
      const rows = await yearbookService.getProfileAchievements();
      setAchievements(
        rows.map((row) => {
          const meta = parseAchievementType(row.type);
          const rawId = row.id;
          const asNumber = typeof rawId === 'number' ? rawId : Number(rawId);
          const id =
            typeof rawId === 'number' ||
            (typeof rawId === 'string' && /^\d+$/.test(rawId) && Number.isFinite(asNumber))
              ? (typeof rawId === 'number' ? rawId : asNumber)
              : null;
          return {
            id,
            title: asText(row.title),
            subtitle: firstText(row.desc, row.name),
            icon: meta.icon,
            color: meta.color,
          };
        }),
      );
    } catch {
      setAchievements([]);
    } finally {
      setAchieveLoading(false);
    }
  }, []);

  const loadCareer = useCallback(async () => {
    setCareerLoading(true);
    try {
      const career = await yearbookService.getAlumniCareer();
      setCareerForm({
        job_title: career.job_title,
        company: career.company,
        location: career.location,
        field: career.field,
        bio: career.bio,
      });
    } catch {
      // Alumni endpoint may 403 for non-alumni; keep empty form.
    } finally {
      setCareerLoading(false);
    }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const userRaw = await yearbookService.getCurrentUser();
      const mapped = (userRaw && typeof userRaw === 'object' ? userRaw : {}) as Record<
        string,
        unknown
      >;
      applyUser(mapped);
      await loadAchievements();
      if (isGraduateUser(mapped)) {
        await loadCareer();
      }
    } catch (err) {
      setLoadError(getApiErrorMessage(err, 'Unable to load profile settings.'));
    } finally {
      setLoading(false);
    }
  }, [applyUser, loadAchievements, loadCareer]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // Re-sync visibility from /auth/me on focus so reopen matches the DB.
  // Skip while saving or when the user has an unsaved local selection.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        if (visibilitySavingRef.current) return;
        if (visibilityRef.current !== savedVisibilityRef.current) return;
        try {
          const userRaw = await yearbookService.getCurrentUser();
          if (cancelled || !userRaw || typeof userRaw !== 'object') return;
          // Bail again if the user started editing while the request was in flight.
          if (visibilityRef.current !== savedVisibilityRef.current) return;
          const mapped = userRaw as Record<string, unknown>;
          const next = extractVisibilityFromUser(mapped);
          setUser((prev) => ({ ...(prev ?? {}), ...mapped, profile_visibility: next, visibility: next }));
          setVisibility(next);
          setSavedVisibility(next);
          visibilityRef.current = next;
          savedVisibilityRef.current = next;
        } catch {
          // Keep whatever is already on screen.
        }
      })();
      return () => {
        cancelled = true;
      };
    }, []),
  );

  const scrollToSection = (id: string) => {
    setActiveSection(id);
    const y = sectionOffsets.current[id];
    if (typeof y === 'number') {
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
    }
  };

  const onMainScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = event.nativeEvent.contentOffset.y;
    let closest = navSections[0]?.id ?? 'visibility';
    let best = Number.POSITIVE_INFINITY;
    for (const section of navSections) {
      const top = sectionOffsets.current[section.id];
      if (typeof top !== 'number') continue;
      const dist = Math.abs(top - y - 24);
      if (dist < best) {
        best = dist;
        closest = section.id;
      }
    }
    if (closest !== activeSection) setActiveSection(closest);
  };

  const toast = (message: string, type: 'success' | 'error' = 'success') => {
    Alert.alert(type === 'success' ? 'Saved' : 'Error', message);
  };

  const saveVisibility = async () => {
    setVisibilitySaving(true);
    visibilitySavingRef.current = true;
    try {
      const result = await yearbookService.updateVisibility(visibility);
      const confirmed = normalizeVisibility(result.visibility);
      setVisibility(confirmed);
      setSavedVisibility(confirmed);
      visibilityRef.current = confirmed;
      savedVisibilityRef.current = confirmed;
      setUser((prev) =>
        prev
          ? {
              ...prev,
              profile_visibility: confirmed,
              visibility: confirmed,
            }
          : prev,
      );

      // Re-fetch /auth/me so subsequent opens match the database.
      try {
        const userRaw = await yearbookService.getCurrentUser();
        const mapped =
          userRaw && typeof userRaw === 'object'
            ? (userRaw as Record<string, unknown>)
            : null;
        if (mapped) {
          // Prefer server value when present; otherwise keep the confirmed save.
          const fromServer = extractVisibilityFromUser(mapped);
          const resolved =
            firstText(
              mapped.profile_visibility,
              mapped.visibility,
              (mapped.student_record as Record<string, unknown> | undefined)?.profile_visibility,
            )
              ? fromServer
              : confirmed;
          applyUser({
            ...mapped,
            profile_visibility: resolved,
            visibility: resolved,
          });
        }
      } catch {
        // Local state already mirrors the successful save.
      }

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast('Your profile visibility was updated successfully.');
    } catch (err) {
      toast(getApiErrorMessage(err, 'Failed to save visibility.'), 'error');
    } finally {
      setVisibilitySaving(false);
      visibilitySavingRef.current = false;
    }
  };

  const saveMotto = async () => {
    if (motto.trim() && !isMeaningfulText(motto, 10)) {
      toast('Please enter a meaningful bio.', 'error');
      return;
    }
    setMottoSaving(true);
    try {
      await yearbookService.updateMotto(motto.trim() || null);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast('Your motto was updated successfully.');
    } catch (err) {
      toast(getApiErrorMessage(err, 'Failed to save motto.'), 'error');
    } finally {
      setMottoSaving(false);
    }
  };

  const saveAcademic = async () => {
    setAcademicSaving(true);
    try {
      const res = (await yearbookService.updateAcademic({
        student_id: academicForm.student_id || null,
        course: academicForm.course || null,
        graduation_year: academicForm.graduation_year
          ? Number(academicForm.graduation_year)
          : null,
        batch: academicForm.batch || null,
      })) as { user?: Record<string, unknown> };
      if (res?.user) {
        setAcademicForm({
          student_id: asText(res.user.student_id),
          course: asText(res.user.course),
          graduation_year: asText(res.user.graduation_year),
          batch: asText(res.user.batch),
        });
      }
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast('Your academic info was updated successfully.');
    } catch (err) {
      toast(getApiErrorMessage(err, 'Failed to update academic info.'), 'error');
    } finally {
      setAcademicSaving(false);
    }
  };

  const saveCareer = async () => {
    if (careerForm.bio.trim() && !isMeaningfulText(careerForm.bio, 12)) {
      toast('Please enter a meaningful career bio.', 'error');
      return;
    }
    setCareerSaving(true);
    try {
      await yearbookService.updateCareer({
        job_title: careerForm.job_title || null,
        company: careerForm.company || null,
        location: careerForm.location || null,
        field: careerForm.field || null,
        bio: careerForm.bio || null,
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast('Your alumni career profile was updated successfully.');
    } catch (err) {
      toast(getApiErrorMessage(err, 'Failed to save career profile.'), 'error');
    } finally {
      setCareerSaving(false);
    }
  };

  const addAchievement = () => {
    setAchievements((prev) => [
      ...prev,
      { id: null, title: '', subtitle: '', icon: 'fa-star', color: '#fdb813' },
    ]);
  };

  const removeAchievement = (idx: number) => {
    setAchievements((prev) => prev.filter((_, i) => i !== idx));
    if (iconPickerIndex === idx) setIconPickerIndex(null);
  };

  const updateAchievement = (
    idx: number,
    field: keyof EditableAchievement,
    value: string | number | null,
  ) => {
    setAchievements((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item)),
    );
  };

  const saveAchievements = async () => {
    setAchieveSaving(true);
    try {
      await yearbookService.updateAchievements(
        achievements.map((item) => ({
          id: item.id,
          title: item.title,
          subtitle: item.subtitle,
          type: JSON.stringify({ icon: item.icon, color: item.color }),
        })),
      );
      await loadAchievements();
      setIconPickerIndex(null);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast('Your achievements were updated successfully.');
    } catch (err) {
      toast(getApiErrorMessage(err, 'Failed to save achievements.'), 'error');
    } finally {
      setAchieveSaving(false);
    }
  };

  const validatePassword = (): Record<string, string> => {
    const errors: Record<string, string> = {};
    if (!pwForm.current_password) errors.current_password = 'Current password is required.';
    if (pwForm.password.length < 8) errors.password = 'Must be at least 8 characters.';
    else if (!/[0-9]/.test(pwForm.password)) errors.password = 'Must contain at least one number.';
    if (pwForm.password !== pwForm.password_confirmation) {
      errors.password_confirmation = 'Passwords do not match.';
    }
    return errors;
  };

  const savePassword = async () => {
    const errors = validatePassword();
    if (Object.keys(errors).length) {
      setPwErrors(errors);
      return;
    }
    setPwSaving(true);
    setPwErrors({});
    try {
      await yearbookService.updatePassword(pwForm);
      setPwForm({ current_password: '', password: '', password_confirmation: '' });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast('Your password was updated successfully.');
    } catch (err) {
      setPwErrors({ general: getApiErrorMessage(err, 'Failed to change password.') });
    } finally {
      setPwSaving(false);
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

  const handleFaceRegisterCapture = async (imageBase64: string) => {
    setFaceRegistering(true);
    try {
      const studentId = asText(user?.student_id) || academicForm.student_id || undefined;
      const userId =
        typeof user?.id === 'number' ? user.id : Number(user?.id) || undefined;

      const result = await faceService.registerFace({
        image_base64: imageBase64,
        student_id: studentId,
        user_id: userId,
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
          { text: 'Close', onPress: () => setFaceCameraVisible(false) },
        ],
      );
    } finally {
      setFaceRegistering(false);
    }
  };

  const pwStrength = [
    { label: 'At least 8 characters', ok: pwForm.password.length >= 8 },
    { label: 'Contains a number', ok: /[0-9]/.test(pwForm.password) },
    { label: 'Contains a letter', ok: /[a-zA-Z]/.test(pwForm.password) },
  ];

  if (loading) {
    return (
      <View style={[premiumStyles.screen, styles.centered]}>
        <Stack.Screen options={{ headerShown: false }} />
        <StatusBar style="light" />
        <ScreenHeader
          title="Profile Settings"
          subtitle="Loading your preferences…"
          icon="cog"
          leftAccessory={
            <TouchableOpacity
              style={styles.headerBackBtn}
              onPress={() => {
                if (router.canGoBack()) router.back();
                else router.replace('/(tabs)/profile');
              }}
            >
              <FontAwesome name="chevron-left" size={16} color="#FFC800" />
            </TouchableOpacity>
          }
          showIconBadge={false}
          compact
        />
        <ActivityIndicator size="large" color={premium.brand} />
        <Text style={premiumStyles.mutedText}>Loading settings…</Text>
      </View>
    );
  }

  const visibilityDirty = visibility !== savedVisibility;
  const activeVisibilityLabel =
    VISIBILITY_OPTS.find((opt) => opt.value === visibility)?.label ?? 'Public';

  return (
    <View style={premiumStyles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />

      <ScreenHeader
        title="Profile Settings"
        subtitle={`Visibility · ${activeVisibilityLabel}${visibilityDirty ? ' (unsaved)' : ''}`}
        icon="cog"
        compact
        showIconBadge
        leftAccessory={
          <TouchableOpacity
            style={styles.headerBackBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              if (router.canGoBack()) router.back();
              else router.replace('/(tabs)/profile');
            }}
            accessibilityLabel="Go back"
          >
            <FontAwesome name="chevron-left" size={16} color="#FFC800" />
          </TouchableOpacity>
        }
      />

      {loadError ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{loadError}</Text>
          <TouchableOpacity onPress={() => void loadAll()}>
            <Text style={styles.retryLink}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.navScroll}
        contentContainerStyle={styles.navContent}
      >
        {navSections.map((section) => {
          const active = activeSection === section.id;
          return (
            <TouchableOpacity
              key={section.id}
              style={[styles.navChip, active && styles.navChipActive]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                scrollToSection(section.id);
              }}
            >
              <FontAwesome
                name={section.icon}
                size={12}
                color={active ? '#FFC800' : '#8E8E93'}
                style={styles.navChipIcon}
              />
              <Text style={[styles.navChipText, active && styles.navChipTextActive]}>
                {section.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
          onScroll={onMainScroll}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.pageEyebrow}>ACCOUNT</Text>
          <Text style={styles.pageTitle}>Manage your yearbook profile</Text>

          {/* Visibility */}
          <SettingsSection
            id="visibility"
            icon="eye"
            iconBg="#1C2456"
            iconColor="#FFC800"
            title="Profile Visibility"
            desc="Control who can see your profile"
            onLayout={(y) => {
              sectionOffsets.current.visibility = y;
            }}
          >
            <View style={styles.visibilityStatusRow}>
              <View
                style={[
                  styles.visibilityStatusDot,
                  visibilityDirty && styles.visibilityStatusDotDirty,
                ]}
              />
              <Text style={styles.visibilityStatusText}>
                {visibilityDirty
                  ? `Unsaved · ${VISIBILITY_OPTS.find((o) => o.value === savedVisibility)?.label ?? 'Public'} → ${activeVisibilityLabel}`
                  : `Active · ${VISIBILITY_OPTS.find((o) => o.value === savedVisibility)?.label ?? 'Public'}`}
              </Text>
            </View>

            {VISIBILITY_OPTS.map((opt) => {
              const selected = visibility === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.optionCard, selected && styles.optionCardSelected]}
                  onPress={() => {
                    void Haptics.selectionAsync();
                    visibilityRef.current = opt.value;
                    setVisibility(opt.value);
                  }}
                  activeOpacity={0.85}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                >
                  <View style={[styles.radioOuter, selected && styles.radioOuterSelected]}>
                    {selected ? <View style={styles.radioInner} /> : null}
                  </View>
                  <View style={[styles.optionIcon, selected && styles.optionIconSelected]}>
                    <FontAwesome
                      name={opt.icon}
                      size={16}
                      color={selected ? '#FFC800' : '#8E8E93'}
                    />
                  </View>
                  <View style={styles.optionCopy}>
                    <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>
                      {opt.label}
                    </Text>
                    <Text style={styles.optionDesc}>{opt.desc}</Text>
                  </View>
                  {selected ? (
                    <FontAwesome name="check-circle" size={18} color={premium.gold} />
                  ) : null}
                </TouchableOpacity>
              );
            })}
            <SaveButton
              label={visibilityDirty ? 'Save Visibility' : 'Saved'}
              loading={visibilitySaving}
              disabled={!visibilityDirty && !visibilitySaving}
              onPress={() => void saveVisibility()}
            />
          </SettingsSection>

          {/* Motto */}
          <SettingsSection
            id="motto"
            icon="quote-left"
            iconBg="#FFF8E6"
            iconColor="#F5A623"
            title="Personal Motto"
            desc="Appears on your yearbook profile"
            onLayout={(y) => {
              sectionOffsets.current.motto = y;
            }}
          >
            <TextInput
              style={[styles.input, styles.textArea]}
              value={motto}
              onChangeText={(text) => setMotto(text.slice(0, 255))}
              placeholder="Write your personal motto or yearbook quote…"
              placeholderTextColor="#C7C7CC"
              multiline
              maxLength={255}
            />
            <Text style={styles.charCount}>{motto.length}/255 characters</Text>
            <SaveButton
              label="Save Motto"
              loading={mottoSaving}
              onPress={() => void saveMotto()}
            />
          </SettingsSection>

          {/* Academic */}
          <SettingsSection
            id="academic"
            icon="graduation-cap"
            iconBg="#EEF0FA"
            iconColor="#35408E"
            title="Academic Info"
            desc="Your graduation details shown on your yearbook profile"
            onLayout={(y) => {
              sectionOffsets.current.academic = y;
            }}
          >
            <FieldLabel icon="id-card" label="Student ID" />
            <TextInput
              style={styles.input}
              value={academicForm.student_id}
              onChangeText={(student_id) => setAcademicForm((p) => ({ ...p, student_id }))}
              placeholder="e.g. 2021-00001"
              placeholderTextColor="#C7C7CC"
              autoCapitalize="none"
            />

            <FieldLabel icon="book" label="Course" />
            <TextInput
              style={styles.input}
              value={academicForm.course}
              onChangeText={(course) => setAcademicForm((p) => ({ ...p, course }))}
              placeholder="e.g. Bachelor of Science in Information Technology"
              placeholderTextColor="#C7C7CC"
            />

            <View style={styles.row}>
              <View style={styles.half}>
                <FieldLabel icon="calendar" label="Graduation Year" />
                <TextInput
                  style={styles.input}
                  value={academicForm.graduation_year}
                  onChangeText={(graduation_year) =>
                    setAcademicForm((p) => ({ ...p, graduation_year }))
                  }
                  placeholder="e.g. 2026"
                  placeholderTextColor="#C7C7CC"
                  keyboardType="number-pad"
                />
              </View>
              <View style={styles.half}>
                <FieldLabel icon="users" label="Batch" />
                <TextInput
                  style={styles.input}
                  value={academicForm.batch}
                  onChangeText={(batch) => setAcademicForm((p) => ({ ...p, batch }))}
                  placeholder="e.g. Batch 2026"
                  placeholderTextColor="#C7C7CC"
                />
              </View>
            </View>

            <SaveButton
              label="Save Academic Info"
              loading={academicSaving}
              onPress={() => void saveAcademic()}
            />
          </SettingsSection>

          {/* Career (alumni / graduates) */}
          {canEditCareer ? (
            <SettingsSection
              id="career"
              icon="briefcase"
              iconBg="#ECFDF5"
              iconColor="#059669"
              title="Career Path"
              desc="Shown in Alumni Tracker so classmates can see where you are now"
              onLayout={(y) => {
                sectionOffsets.current.career = y;
              }}
            >
              {careerLoading ? (
                <ActivityIndicator color="#35408E" style={styles.sectionSpinner} />
              ) : (
                <>
                  <View style={styles.row}>
                    <View style={styles.half}>
                      <FieldLabel icon="briefcase" label="Job Title" />
                      <TextInput
                        style={styles.input}
                        value={careerForm.job_title}
                        onChangeText={(job_title) => setCareerForm((p) => ({ ...p, job_title }))}
                        placeholder="e.g. Software Engineer"
                        placeholderTextColor="#C7C7CC"
                      />
                    </View>
                    <View style={styles.half}>
                      <FieldLabel icon="building" label="Company" />
                      <TextInput
                        style={styles.input}
                        value={careerForm.company}
                        onChangeText={(company) => setCareerForm((p) => ({ ...p, company }))}
                        placeholder="e.g. Accenture"
                        placeholderTextColor="#C7C7CC"
                      />
                    </View>
                  </View>

                  <View style={styles.row}>
                    <View style={styles.half}>
                      <FieldLabel icon="map-marker" label="Location" />
                      <TextInput
                        style={styles.input}
                        value={careerForm.location}
                        onChangeText={(location) => setCareerForm((p) => ({ ...p, location }))}
                        placeholder="e.g. Makati"
                        placeholderTextColor="#C7C7CC"
                      />
                    </View>
                    <View style={styles.half}>
                      <FieldLabel icon="tag" label="Career Field" />
                      <TextInput
                        style={styles.input}
                        value={careerForm.field}
                        onChangeText={(field) => setCareerForm((p) => ({ ...p, field }))}
                        placeholder="e.g. Technology"
                        placeholderTextColor="#C7C7CC"
                      />
                    </View>
                  </View>

                  <FieldLabel icon="align-left" label="Career Bio" />
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    value={careerForm.bio}
                    onChangeText={(bio) => setCareerForm((p) => ({ ...p, bio: bio.slice(0, 500) }))}
                    placeholder="Share a short update about your career path..."
                    placeholderTextColor="#C7C7CC"
                    multiline
                    maxLength={500}
                  />
                  <Text style={styles.charCount}>{careerForm.bio.length}/500 characters</Text>

                  <View style={styles.infoBanner}>
                    <FontAwesome name="info-circle" size={14} color="#F5A623" style={styles.infoIcon} />
                    <Text style={styles.infoText}>
                      These details appear on the Alumni Tracker page after you save them.
                    </Text>
                  </View>

                  <SaveButton
                    label="Save Career Path"
                    loading={careerSaving}
                    onPress={() => void saveCareer()}
                  />
                </>
              )}
            </SettingsSection>
          ) : null}

          {/* Achievements */}
          <SettingsSection
            id="achievements"
            icon="trophy"
            iconBg="#FFF8E6"
            iconColor="#F5A623"
            title="Achievements"
            desc="Add or edit the achievements shown on your yearbook profile"
            onLayout={(y) => {
              sectionOffsets.current.achievements = y;
            }}
          >
            {achieveLoading ? (
              <ActivityIndicator color="#35408E" style={styles.sectionSpinner} />
            ) : (
              <>
                {achievements.map((item, idx) => (
                  <View key={`ach-edit-${idx}`} style={styles.achievementCard}>
                    <TouchableOpacity
                      style={styles.removeButton}
                      onPress={() => removeAchievement(idx)}
                      hitSlop={8}
                    >
                      <FontAwesome name="times" size={12} color="#FF3B30" />
                    </TouchableOpacity>

                    <View style={styles.achievementPreview}>
                      <View style={styles.achievementIconWrap}>
                        <FontAwesome
                          name={resolveFaIcon(item.icon)}
                          size={16}
                          color={item.color}
                        />
                      </View>
                      <View style={styles.flex}>
                        <Text style={styles.achievementPreviewTitle} numberOfLines={1}>
                          {item.title || 'Achievement title'}
                        </Text>
                        <Text style={styles.achievementPreviewSub} numberOfLines={1}>
                          {item.subtitle || 'Event / description'}
                        </Text>
                      </View>
                    </View>

                    <TextInput
                      style={styles.input}
                      value={item.title}
                      onChangeText={(title) => updateAchievement(idx, 'title', title)}
                      placeholder="Achievement title…"
                      placeholderTextColor="#C7C7CC"
                    />
                    <TextInput
                      style={[styles.input, styles.inputSpaced]}
                      value={item.subtitle}
                      onChangeText={(subtitle) => updateAchievement(idx, 'subtitle', subtitle)}
                      placeholder="Event / description…"
                      placeholderTextColor="#C7C7CC"
                    />

                    <View style={styles.metaRow}>
                      <TouchableOpacity
                        style={styles.iconPickerBtn}
                        onPress={() =>
                          setIconPickerIndex(iconPickerIndex === idx ? null : idx)
                        }
                      >
                        <FontAwesome
                          name={resolveFaIcon(item.icon)}
                          size={14}
                          color={item.color}
                        />
                        <Text style={styles.iconPickerLabel}>Icon</Text>
                        <FontAwesome name="chevron-down" size={10} color="#8E8E93" />
                      </TouchableOpacity>

                      <View style={styles.colorRow}>
                        {ACHIEVEMENT_COLOR_OPTIONS.map((color) => (
                          <TouchableOpacity
                            key={color}
                            style={[
                              styles.colorSwatch,
                              { backgroundColor: color },
                              item.color === color && styles.colorSwatchSelected,
                            ]}
                            onPress={() => updateAchievement(idx, 'color', color)}
                          />
                        ))}
                      </View>
                    </View>

                    {iconPickerIndex === idx ? (
                      <View style={styles.iconGrid}>
                        {ACHIEVEMENT_ICON_OPTIONS.map((opt) => (
                          <TouchableOpacity
                            key={opt.icon}
                            style={[
                              styles.iconCell,
                              item.icon === opt.icon && styles.iconCellSelected,
                            ]}
                            onPress={() => {
                              updateAchievement(idx, 'icon', opt.icon);
                              setIconPickerIndex(null);
                            }}
                          >
                            <FontAwesome name={opt.fa} size={16} color={item.color} />
                          </TouchableOpacity>
                        ))}
                      </View>
                    ) : null}
                  </View>
                ))}

                <TouchableOpacity style={styles.addButton} onPress={addAchievement}>
                  <FontAwesome name="plus" size={12} color="#8E8E93" style={styles.addIcon} />
                  <Text style={styles.addButtonText}>Add Achievement</Text>
                </TouchableOpacity>

                <SaveButton
                  label="Save Achievements"
                  loading={achieveSaving}
                  onPress={() => void saveAchievements()}
                />
              </>
            )}
          </SettingsSection>

          {/* Face registration */}
          <SettingsSection
            id="face"
            icon="user"
            iconBg="#EEF0FA"
            iconColor="#35408E"
            title="Face Recognition"
            desc="Register your face for passwordless sign-in"
            onLayout={(y) => {
              sectionOffsets.current.face = y;
            }}
          >
            <Text style={styles.faceHint}>
              Capture a clear front-facing photo. We index it so you can use Sign in with Face
              Recognition on the login screen.
            </Text>
            <SaveButton
              label="Register Face"
              loading={faceRegistering}
              onPress={openFaceRegistration}
            />
          </SettingsSection>

          {/* Password */}
          <SettingsSection
            id="password"
            icon="lock"
            iconBg="#F0F2F8"
            iconColor="#4A4A4A"
            title="Change Password"
            desc="Use a strong password with letters and numbers"
            onLayout={(y) => {
              sectionOffsets.current.password = y;
            }}
          >
            {pwErrors.general ? (
              <View style={styles.pwErrorBanner}>
                <FontAwesome name="exclamation-triangle" size={12} color="#FF3B30" />
                <Text style={styles.pwErrorText}>{pwErrors.general}</Text>
              </View>
            ) : null}

            {(
              [
                {
                  label: 'Current Password',
                  field: 'current_password' as const,
                  show: showCurrent,
                  toggle: () => setShowCurrent((p) => !p),
                },
                {
                  label: 'New Password',
                  field: 'password' as const,
                  show: showNew,
                  toggle: () => setShowNew((p) => !p),
                },
                {
                  label: 'Confirm Password',
                  field: 'password_confirmation' as const,
                  show: showConfirm,
                  toggle: () => setShowConfirm((p) => !p),
                },
              ] as const
            ).map(({ label, field, show, toggle }) => (
              <View key={field}>
                <Text style={styles.pwLabel}>{label}</Text>
                <View style={styles.passwordRow}>
                  <TextInput
                    style={[
                      styles.input,
                      styles.passwordInput,
                      pwErrors[field] ? styles.inputError : null,
                    ]}
                    value={pwForm[field]}
                    onChangeText={(value) => setPwForm((p) => ({ ...p, [field]: value }))}
                    placeholder={`Enter ${label.toLowerCase()}`}
                    placeholderTextColor="#C7C7CC"
                    secureTextEntry={!show}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <TouchableOpacity style={styles.eyeButton} onPress={toggle}>
                    <FontAwesome name={show ? 'eye-slash' : 'eye'} size={16} color="#8E8E93" />
                  </TouchableOpacity>
                </View>
                {pwErrors[field] ? (
                  <Text style={styles.fieldError}>{pwErrors[field]}</Text>
                ) : null}
              </View>
            ))}

            {pwForm.password ? (
              <View style={styles.strengthBox}>
                {pwStrength.map((rule) => (
                  <View key={rule.label} style={styles.strengthRow}>
                    <FontAwesome
                      name={rule.ok ? 'check-circle' : 'circle-o'}
                      size={12}
                      color={rule.ok ? '#10B981' : '#C7C7CC'}
                    />
                    <Text style={[styles.strengthText, rule.ok && styles.strengthTextOk]}>
                      {rule.label}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            <SaveButton
              label="Change Password"
              loading={pwSaving}
              onPress={() => void savePassword()}
            />
          </SettingsSection>

          <View style={styles.privacyCard}>
            <FontAwesome name="shield" size={16} color="#35408E" style={styles.privacyIcon} />
            <View style={styles.flex}>
              <Text style={styles.privacyTitle}>Data Privacy Notice</Text>
              <Text style={styles.privacyBody}>
                Your data is protected under Republic Act No. 10173 (Data Privacy Act of 2012).
                Sinag-Bughaw is fully compliant with NU Lipa's data protection policies.
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <FaceLoginCameraModal
        visible={faceCameraVisible}
        verifying={faceRegistering}
        title="Register Face"
        verifyingLabel="Registering…"
        permissionBody="Allow camera access so we can capture your face for recognition login."
        closeAccessibilityLabel="Close face registration"
        secondaryCloseLabel="Cancel"
        onCapture={handleFaceRegisterCapture}
        onClose={() => {
          if (!faceRegistering) setFaceCameraVisible(false);
        }}
      />
    </View>
  );
}

function FieldLabel({
  icon,
  label,
}: {
  icon: React.ComponentProps<typeof FontAwesome>['name'];
  label: string;
}) {
  return (
    <View style={styles.fieldLabelRow}>
      <FontAwesome name={icon} size={10} color="#F5A623" style={styles.fieldLabelIcon} />
      <Text style={styles.fieldLabel}>{label}</Text>
    </View>
  );
}

function SaveButton({
  label,
  loading,
  onPress,
  disabled = false,
}: {
  label: string;
  loading: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  const isDisabled = loading || disabled;
  return (
    <TouchableOpacity
      style={[styles.saveButton, isDisabled && styles.saveButtonDisabled]}
      disabled={isDisabled}
      onPress={onPress}
      activeOpacity={0.85}
    >
      {loading ? (
        <ActivityIndicator size="small" color="#FFFFFF" />
      ) : (
        <Text style={styles.saveButtonText}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

function SettingsSection({
  id,
  icon,
  iconBg,
  iconColor,
  title,
  desc,
  children,
  onLayout,
}: {
  id: string;
  icon: React.ComponentProps<typeof FontAwesome>['name'];
  iconBg: string;
  iconColor: string;
  title: string;
  desc: string;
  children: React.ReactNode;
  onLayout: (y: number) => void;
}) {
  return (
    <View
      style={styles.sectionCard}
      onLayout={(event) => onLayout(event.nativeEvent.layout.y)}
      nativeID={id}
    >
      <View style={styles.sectionHeader}>
        <View style={[styles.sectionIconWrap, { backgroundColor: iconBg }]}>
          <FontAwesome name={icon} size={14} color={iconColor} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.sectionTitle}>{title}</Text>
          <Text style={styles.sectionDesc}>{desc}</Text>
        </View>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F6FB',
  },
  flex: {
    flex: 1,
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
  headerBackBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 200, 0, 0.28)',
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
  navScroll: {
    maxHeight: 56,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E8ECF4',
  },
  navContent: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    alignItems: 'center',
  },
  navChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F4F7FE',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#E2E6F0',
  },
  navChipActive: {
    backgroundColor: '#1C2456',
    borderColor: '#1C2456',
  },
  navChipIcon: {
    marginRight: 6,
  },
  navChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8E8E93',
  },
  navChipTextActive: {
    color: '#FFFFFF',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  pageEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8E8E93',
    letterSpacing: 1,
    marginBottom: 4,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1D2B4B',
    marginBottom: 16,
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    marginBottom: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(53, 64, 142, 0.08)',
    shadowColor: '#1C2456',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  sectionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1D2B4B',
  },
  sectionDesc: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
  },
  sectionSpinner: {
    marginVertical: 16,
  },
  visibilityStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  visibilityStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22C55E',
  },
  visibilityStatusDotDirty: {
    backgroundColor: '#FFC800',
  },
  visibilityStatusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#5C6B8A',
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    backgroundColor: '#FFFFFF',
  },
  optionCardSelected: {
    borderColor: '#FFC800',
    backgroundColor: '#F7F8FC',
    shadowColor: '#1C2456',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#C7C7CC',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  radioOuterSelected: {
    borderColor: '#FFC800',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FFC800',
  },
  optionIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#F0F2F8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  optionIconSelected: {
    backgroundColor: '#1C2456',
  },
  optionCopy: {
    flex: 1,
  },
  optionLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4A4A4A',
  },
  optionLabelSelected: {
    color: '#1C2456',
    fontWeight: '800',
  },
  optionDesc: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
  },
  fieldLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    marginTop: 12,
  },
  fieldLabelIcon: {
    marginRight: 6,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#8E8E93',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: '#F8F9FB',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1C1C1E',
  },
  inputSpaced: {
    marginTop: 10,
  },
  inputError: {
    borderColor: '#FF6B6B',
  },
  textArea: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  charCount: {
    fontSize: 11,
    color: '#8E8E93',
    marginTop: 8,
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  half: {
    flex: 1,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFF8E6',
    borderWidth: 1,
    borderColor: '#FFE58F',
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
    marginBottom: 4,
  },
  infoIcon: {
    marginRight: 8,
    marginTop: 1,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: '#A67C00',
    lineHeight: 17,
  },
  achievementCard: {
    backgroundColor: '#F8F9FB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  removeButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FFF2F0',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  achievementPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingRight: 28,
  },
  achievementIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  achievementPreviewTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1D2B4B',
  },
  achievementPreviewSub: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
  },
  metaRow: {
    marginTop: 12,
    gap: 10,
  },
  iconPickerBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  iconPickerLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8E8E93',
  },
  colorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  colorSwatch: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  colorSwatchSelected: {
    borderWidth: 2,
    borderColor: '#1D2B4B',
    transform: [{ scale: 1.1 }],
  },
  iconGrid: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 10,
  },
  iconCell: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8F9FB',
  },
  iconCellSelected: {
    backgroundColor: '#EEF0FA',
    borderWidth: 1.5,
    borderColor: '#35408E',
  },
  addButton: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#D1D5DB',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    marginBottom: 8,
  },
  addIcon: {
    marginRight: 8,
  },
  addButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8E8E93',
  },
  pwLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1D2B4B',
    marginBottom: 8,
    marginTop: 12,
  },
  passwordRow: {
    position: 'relative',
    justifyContent: 'center',
  },
  passwordInput: {
    paddingRight: 44,
  },
  eyeButton: {
    position: 'absolute',
    right: 14,
    height: '100%',
    justifyContent: 'center',
  },
  fieldError: {
    fontSize: 11,
    color: '#FF3B30',
    marginTop: 6,
  },
  pwErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFF2F0',
    borderWidth: 1,
    borderColor: '#FFD0CC',
    borderRadius: 12,
    padding: 12,
  },
  pwErrorText: {
    flex: 1,
    fontSize: 12,
    color: '#FF3B30',
  },
  strengthBox: {
    backgroundColor: '#F8F9FB',
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
    gap: 8,
  },
  strengthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  strengthText: {
    fontSize: 11,
    color: '#8E8E93',
  },
  strengthTextOk: {
    color: '#10B981',
  },
  saveButton: {
    marginTop: 16,
    alignSelf: 'flex-start',
    backgroundColor: '#1C2456',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    minWidth: 140,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 200, 0, 0.35)',
  },
  saveButtonDisabled: {
    opacity: 0.55,
  },
  saveButtonText: {
    color: '#FFC800',
    fontWeight: '700',
    fontSize: 14,
  },
  faceHint: {
    fontSize: 13,
    lineHeight: 20,
    color: '#636366',
    marginBottom: 4,
  },
  privacyCard: {
    flexDirection: 'row',
    backgroundColor: '#EEF0FA',
    borderWidth: 1,
    borderColor: '#D5DBF0',
    borderRadius: 16,
    padding: 16,
    marginTop: 4,
    marginBottom: 8,
  },
  privacyIcon: {
    marginRight: 12,
    marginTop: 2,
  },
  privacyTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1D2B4B',
    marginBottom: 4,
  },
  privacyBody: {
    fontSize: 12,
    color: '#8E8E93',
    lineHeight: 18,
  },
});
