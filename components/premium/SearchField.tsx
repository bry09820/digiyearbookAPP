import React from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { premiumStyles } from '@/components/premium/styles';

type SearchFieldProps = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  onClear?: () => void;
  showClear?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function SearchField({
  value,
  onChangeText,
  placeholder = 'Search…',
  onClear,
  showClear,
  style,
}: SearchFieldProps) {
  const canClear = showClear ?? (value.length > 0 || Boolean(onClear));

  return (
    <View style={[premiumStyles.searchContainer, style]}>
      <FontAwesome
        name="search"
        size={16}
        color="#C7C7CC"
        style={premiumStyles.searchIcon}
      />
      <TextInput
        style={premiumStyles.searchInput}
        placeholder={placeholder}
        placeholderTextColor="#C7C7CC"
        value={value}
        onChangeText={onChangeText}
        returnKeyType="search"
        autoCorrect={false}
        autoCapitalize="none"
      />
      {canClear && value.length > 0 ? (
        <TouchableOpacity
          onPress={() => {
            onChangeText('');
            onClear?.();
          }}
          hitSlop={8}
          accessibilityLabel="Clear search"
        >
          <FontAwesome name="times-circle" size={16} color="#C7C7CC" />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
