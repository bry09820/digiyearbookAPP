import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { FontAwesome } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useUnreadMessages } from '@/modules/chat/useUnreadMessages';

// Expo Router / React Navigation tab bar prop types diverge across versions.
// Accept the runtime shape without fighting the incompatible type packages.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function CustomTabBar({ state, descriptors, navigation }: any) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const tabWidth = width / Math.max(state.routes.length, 1);
  const translateX = useSharedValue(state.index * tabWidth);
  const bottomPad = Math.max(insets.bottom, 6);
  const { unreadCount } = useUnreadMessages(true);

  useEffect(() => {
    translateX.value = withTiming(state.index * tabWidth, {
      duration: 300,
      easing: Easing.out(Easing.quad),
    });
  }, [state.index, tabWidth, translateX]);

  const animatedCircleStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const getIcon = (name: string, focused: boolean) => {
    const color = focused ? '#35408E' : '#B0B3C7';
    const size = 20;
    switch (name.toLowerCase()) {
      case 'home':
        return <FontAwesome name="home" size={size} color={color} />;
      case 'messages':
        return <FontAwesome name="comments" size={size} color={color} />;
      case 'directory':
        return <FontAwesome name="users" size={size} color={color} />;
      case 'gallery':
        return <FontAwesome name="image" size={size} color={color} />;
      case 'sections':
        return <FontAwesome name="th-large" size={size} color={color} />;
      case 'achievements':
        return <FontAwesome name="trophy" size={size} color={color} />;
      case 'faculty':
        return <FontAwesome name="user-circle" size={size} color={color} />;
      case 'profile':
        return <FontAwesome name="user" size={size} color={color} />;
      default:
        return <FontAwesome name="question-circle" size={size} color={color} />;
    }
  };

  return (
    <View style={[styles.tabBarContainer, { paddingBottom: bottomPad, height: 62 + bottomPad }]}>
      <Animated.View
        style={[
          styles.slidingBackground,
          { width: tabWidth },
          animatedCircleStyle,
        ]}
      >
        <View style={styles.activeIndicatorWrapper}>
          <View style={styles.circle} />
          <View style={styles.dot} />
        </View>
      </Animated.View>

      {state.routes.map((route: { key: string; name: string }, index: number) => {
        const { options } = descriptors[route.key];
        const label =
          typeof options.tabBarLabel === 'string'
            ? options.tabBarLabel
            : typeof options.title === 'string'
              ? options.title
              : route.name;

        const isFocused = state.index === index;
        const showBadge = route.name === 'messages' && unreadCount > 0;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });

          if (!isFocused && !event.defaultPrevented) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            navigation.navigate(route.name);
          }
        };

        return (
          <TouchableOpacity
            key={route.key}
            onPress={onPress}
            style={styles.tabItem}
            activeOpacity={1}
            accessibilityRole="button"
            accessibilityState={isFocused ? { selected: true } : {}}
            accessibilityLabel={
              showBadge ? `${label}, ${unreadCount} unread` : label
            }
          >
            <View style={styles.iconContainer}>
              {getIcon(route.name, isFocused)}
              {showBadge ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {unreadCount > 99 ? '99+' : String(unreadCount)}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text
              style={[
                styles.label,
                {
                  color: isFocused ? '#35408E' : '#B0B3C7',
                  fontWeight: isFocused ? '600' : '500',
                },
              ]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tabBarContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E8EAEF',
    elevation: 0,
  },
  tabItem: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 4,
  },
  iconContainer: {
    width: 40,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#D14343',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
  label: {
    fontSize: 9,
    marginTop: 1,
    maxWidth: '96%',
    textAlign: 'center',
  },
  slidingBackground: {
    position: 'absolute',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeIndicatorWrapper: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    width: '100%',
    height: '100%',
    paddingTop: 4,
  },
  circle: {
    width: 40,
    height: 36,
    backgroundColor: '#E8EFFF',
    borderRadius: 10,
  },
  dot: {
    width: 4,
    height: 4,
    backgroundColor: '#35408E',
    borderRadius: 2,
    marginTop: 3,
  },
});
