import React, { useId } from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import type { AccountsMarksFilterSelectProps } from './AccountsMarksFilterSelect';

export default function AccountsMarksFilterSelect({ label, value, options, onChange, disabled = false, style }: AccountsMarksFilterSelectProps) {
  const { theme, isDark } = useTheme();
  const id = useId();
  return <View style={[{ flexGrow: 1, flexBasis: 140, minWidth: 130, gap: 7 }, style]}>
    <Text nativeID={id} style={{ color: theme.colors.textSecondary, fontSize: 10, fontWeight: '800' }}>{label}</Text>
    <View>
      <select aria-labelledby={id} value={value} disabled={disabled} onChange={event => onChange(event.target.value)} style={{
        width: '100%', minWidth: 0, height: 44, padding: '0 36px 0 12px', appearance: 'none',
        border: `1px solid ${theme.colors.border}`, borderRadius: 10, backgroundColor: theme.colors.card,
        color: theme.colors.textStrong, fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? .5 : 1, colorScheme: isDark ? 'dark' : 'light',
      }}>
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <View pointerEvents="none" style={{ position: 'absolute', right: 12, top: 14 }}><Ionicons name="chevron-down" size={16} color={theme.colors.textSecondary} /></View>
    </View>
  </View>;
}
