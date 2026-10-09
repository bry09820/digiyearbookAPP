import React from 'react';
import {
  ScrollView,
  TouchableOpacity,
  Text,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { premiumStyles } from '@/components/premium/styles';

export type FilterPill = {
  key: string;
  label: string;
  value: string;
};

type FilterPillsProps = {
  items: FilterPill[];
  activeValue: string;
  onChange: (value: string) => void;
  style?: StyleProp<ViewStyle>;
};

export function FilterPills({ items, activeValue, onChange, style }: FilterPillsProps) {
  if (items.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={[premiumStyles.filterScroll, style]}
      contentContainerStyle={premiumStyles.filterScrollContent}
    >
      {items.map((item) => {
        const active = activeValue === item.value;
        return (
          <TouchableOpacity
            key={item.key}
            style={[premiumStyles.filterPill, active ? premiumStyles.filterPillActive : null]}
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onChange(item.value);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text
              style={[premiumStyles.filterText, active ? premiumStyles.filterTextActive : null]}
            >
              {item.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}
