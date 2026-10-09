import React from 'react';
import { View, Text, ScrollView, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { premiumStyles } from '@/components/premium/styles';

export type SummaryStat = {
  key: string;
  label: string;
  value: string | number;
  hint?: string;
};

type SummaryStatsProps = {
  items: SummaryStat[];
  /** When true, cards sit in a horizontal scroll instead of equal flex row. */
  scrollable?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function SummaryStats({ items, scrollable = false, style }: SummaryStatsProps) {
  if (items.length === 0) return null;

  if (scrollable || items.length > 3) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={style}
        contentContainerStyle={premiumStyles.statsScroll}
      >
        {items.map((item) => (
          <View key={item.key} style={[premiumStyles.statCard, premiumStyles.statCardWide]}>
            <Text style={premiumStyles.statLabel}>{item.label}</Text>
            <Text style={premiumStyles.statValue}>{item.value}</Text>
            {item.hint ? <Text style={premiumStyles.statHint}>{item.hint}</Text> : null}
          </View>
        ))}
      </ScrollView>
    );
  }

  return (
    <View style={[premiumStyles.statsRow, style]}>
      {items.map((item) => (
        <View key={item.key} style={premiumStyles.statCard}>
          <Text style={premiumStyles.statLabel}>{item.label}</Text>
          <Text style={premiumStyles.statValue} numberOfLines={1}>
            {item.value}
          </Text>
          {item.hint ? <Text style={premiumStyles.statHint}>{item.hint}</Text> : null}
        </View>
      ))}
    </View>
  );
}

export const summaryStatsStyles = StyleSheet.create({
  spacer: {
    height: 14,
  },
});
