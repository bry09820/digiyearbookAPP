import React from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle, type ImageStyle } from 'react-native';
import { Image } from 'expo-image';
import { getInitials } from '@/utils/initials';
import { premium } from '@/components/premium/styles';

type InitialsAvatarProps = {
  name?: string | null;
  image?: string | null;
  size?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  backgroundColor?: string;
  textColor?: string;
};

export function InitialsAvatar({
  name,
  image,
  size = 56,
  radius,
  style,
  backgroundColor = '#E8EFFF',
  textColor = premium.brand,
}: InitialsAvatarProps) {
  const borderRadius = radius ?? size / 2;
  const initials = getInitials(name);
  const fontSize = Math.max(12, Math.round(size * 0.34));
  const boxStyle: ImageStyle = {
    width: size,
    height: size,
    borderRadius,
  };

  if (image) {
    return (
      <Image
        source={image}
        style={[boxStyle, { backgroundColor: premium.softFill }, style as StyleProp<ImageStyle>]}
        contentFit="cover"
      />
    );
  }

  return (
    <View style={[styles.fallback, boxStyle, { backgroundColor }, style]}>
      <Text style={[styles.initials, { fontSize, color: textColor }]}>{initials}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
