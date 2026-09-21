import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fallbackTopInset } from '@/utils/safeArea';

type ScreenHeaderProps = {
  title: string;
  subtitle?: string | null;
  style?: StyleProp<ViewStyle>;
};

/** Consistent NU blue page header with safe-area padding. */
export function ScreenHeader({ title, subtitle, style }: ScreenHeaderProps) {
  const insets = useSafeAreaInsets();
  const paddingTop = Math.max(insets.top, fallbackTopInset()) + 8;

  return (
    <View style={[styles.header, { paddingTop }, style]}>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={styles.subtitle} numberOfLines={2}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: '#35408E',
    paddingHorizontal: 24,
    paddingBottom: 18,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFC800',
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: 4,
  },
});
