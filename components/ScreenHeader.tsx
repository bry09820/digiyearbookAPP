import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { FontAwesome } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fallbackTopInset } from '@/utils/safeArea';

type FaIcon = React.ComponentProps<typeof FontAwesome>['name'];

type ScreenHeaderProps = {
  title: string;
  subtitle?: string | null;
  /** Optional FontAwesome icon for the badge. Inferred from title when omitted. */
  icon?: FaIcon;
  /** Leading control (e.g. close / back) shown before the title block. */
  leftAccessory?: React.ReactNode;
  /** Extra trailing control(s) shown beside the gold icon badge. */
  rightAccessory?: React.ReactNode;
  /** When false, hides the default gold icon badge (useful when rightAccessory is primary). */
  showIconBadge?: boolean;
  /** Slightly tighter title for dense screens like chat. */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
};

const TITLE_ICONS: Record<string, FaIcon> = {
  Home: 'home',
  Dashboard: 'home',
  Messages: 'comments',
  'Student Directory': 'users',
  Directory: 'users',
  Gallery: 'image',
  Sections: 'th-large',
  Awards: 'trophy',
  Achievements: 'trophy',
  Faculty: 'graduation-cap',
  Profile: 'graduation-cap',
  'My Profile': 'graduation-cap',
};

function resolveIcon(title: string, icon?: FaIcon): FaIcon {
  if (icon) return icon;
  return TITLE_ICONS[title] ?? 'star';
}

/** Premium navy header shared across main tab screens. */
export function ScreenHeader({
  title,
  subtitle,
  icon,
  leftAccessory,
  rightAccessory,
  showIconBadge = true,
  compact = false,
  style,
}: ScreenHeaderProps) {
  const insets = useSafeAreaInsets();
  const paddingTop = Math.max(insets.top, fallbackTopInset()) + 10;
  const badgeIcon = resolveIcon(title, icon);

  return (
    <View style={[styles.shell, style]}>
      <LinearGradient
        colors={['#12183A', '#1C2456', '#35408E']}
        locations={[0, 0.45, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.gradient, { paddingTop }]}
      >
        <View style={styles.orbLarge} pointerEvents="none" />
        <View style={styles.orbSmall} pointerEvents="none" />
        <View style={styles.orbGold} pointerEvents="none" />

        <View style={styles.card}>
          <View style={styles.cardGlow} pointerEvents="none" />

          <View style={styles.row}>
            {leftAccessory != null ? (
              <View style={styles.leading}>{leftAccessory}</View>
            ) : null}

            <View style={styles.copyBlock}>
              <View style={styles.titleRow}>
                <View style={[styles.accentBar, compact ? styles.accentBarCompact : null]} />
                <Text
                  style={[styles.title, compact ? styles.titleCompact : null]}
                  numberOfLines={1}
                >
                  {title}
                </Text>
              </View>

              {subtitle ? (
                <Text style={styles.subtitle} numberOfLines={2}>
                  {subtitle}
                </Text>
              ) : (
                <View style={styles.subtitleSpacer} />
              )}
            </View>

            <View style={styles.trailing}>
              {showIconBadge ? (
                <View style={styles.iconBadge}>
                  <LinearGradient
                    colors={['rgba(255, 200, 0, 0.28)', 'rgba(255, 200, 0, 0.08)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.iconBadgeInner}
                  >
                    <FontAwesome name={badgeIcon} size={18} color="#FFC800" />
                  </LinearGradient>
                </View>
              ) : null}
              {rightAccessory != null ? rightAccessory : null}
            </View>
          </View>

          <View style={styles.bottomRule}>
            <View style={styles.bottomRuleAccent} />
          </View>
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    backgroundColor: '#12183A',
    overflow: 'hidden',
  },
  gradient: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    overflow: 'hidden',
  },
  orbLarge: {
    position: 'absolute',
    top: -40,
    right: -30,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(53, 64, 142, 0.55)',
  },
  orbSmall: {
    position: 'absolute',
    bottom: -20,
    left: -24,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(28, 36, 86, 0.8)',
  },
  orbGold: {
    position: 'absolute',
    top: 48,
    left: '42%',
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(255, 200, 0, 0.06)',
  },
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    overflow: 'hidden',
  },
  cardGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  leading: {
    flexShrink: 0,
  },
  copyBlock: {
    flex: 1,
    minWidth: 0,
  },
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  accentBar: {
    width: 4,
    height: 26,
    borderRadius: 3,
    backgroundColor: '#FFC800',
  },
  accentBarCompact: {
    height: 22,
  },
  title: {
    flex: 1,
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.4,
  },
  titleCompact: {
    fontSize: 20,
    letterSpacing: -0.2,
  },
  subtitle: {
    marginTop: 8,
    marginLeft: 14,
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.62)',
    lineHeight: 18,
    letterSpacing: 0.1,
  },
  subtitleSpacer: {
    height: 4,
  },
  iconBadge: {
    width: 48,
    height: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 200, 0, 0.35)',
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 200, 0, 0.08)',
  },
  iconBadgeInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomRule: {
    marginTop: 14,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
  },
  bottomRuleAccent: {
    width: '28%',
    height: '100%',
    borderRadius: 2,
    backgroundColor: '#FFC800',
  },
});
