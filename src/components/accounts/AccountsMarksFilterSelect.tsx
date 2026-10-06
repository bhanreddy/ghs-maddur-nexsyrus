import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import type { Theme } from '../../theme/themes';

export interface AccountsMarksFilterSelectProps {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export default function AccountsMarksFilterSelect({ label, value, options, onChange, disabled = false, style }: AccountsMarksFilterSelectProps) {
  const { theme, isDark } = useTheme();
  const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark]);
  const [open, setOpen] = useState(false);
  const selected = options.find(option => option.value === value)?.label || 'Select';
  return <View style={[styles.field, style]}>
    <Text style={styles.label}>{label}</Text>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${label}: ${selected}`} accessibilityState={{ expanded: open, disabled }} disabled={disabled} onPress={() => setOpen(true)} style={[styles.trigger, disabled && styles.disabled]}>
      <Text style={styles.value} numberOfLines={1}>{selected}</Text>
      <Ionicons name="chevron-down" size={16} color={theme.colors.textSecondary} />
    </TouchableOpacity>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <Pressable style={styles.overlay} accessibilityLabel={`Dismiss ${label} options`} onPress={() => setOpen(false)}>
        <Pressable style={styles.menu} onPress={event => event.stopPropagation()}>
          <View style={styles.menuHeader}>
            <Text style={styles.menuTitle}>Select {label.toLowerCase()}</Text>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Close ${label} options`} onPress={() => setOpen(false)} style={styles.close}>
              <Ionicons name="close" size={22} color={theme.colors.textStrong} />
            </TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">
            {options.map(option => <TouchableOpacity key={option.value} accessibilityRole="radio" accessibilityState={{ selected: option.value === value }} onPress={() => { onChange(option.value); setOpen(false); }} style={[styles.option, option.value === value && styles.optionActive]}>
              <Text style={[styles.optionText, option.value === value && styles.optionTextActive]}>{option.label}</Text>
              {option.value === value && <Ionicons name="checkmark" size={18} color={isDark ? '#BFDBFE' : '#2563EB'} />}
            </TouchableOpacity>)}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  </View>;
}

const createStyles = (theme: Theme, isDark: boolean) => StyleSheet.create({
  field: { flexGrow: 1, flexBasis: 140, minWidth: 130, gap: 7 },
  label: { fontSize: 10, fontWeight: '800', color: theme.colors.textSecondary },
  trigger: { minHeight: 44, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.card },
  value: { flex: 1, fontSize: 13, fontWeight: '600', color: theme.colors.textStrong },
  disabled: { opacity: .5 },
  overlay: { flex: 1, padding: 24, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(15,23,42,.4)' },
  menu: { width: '100%', maxWidth: 440, maxHeight: '75%', backgroundColor: theme.colors.card, borderRadius: 16, overflow: 'hidden' },
  menuHeader: { padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  menuTitle: { color: theme.colors.textStrong, fontSize: 16, fontWeight: '800' },
  close: { padding: 6 },
  option: { minHeight: 48, paddingVertical: 12, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 12 },
  optionActive: { backgroundColor: isDark ? 'rgba(37,99,235,.16)' : '#EFF6FF' },
  optionText: { flex: 1, color: theme.colors.textStrong, fontSize: 14 },
  optionTextActive: { fontWeight: '700', color: isDark ? '#BFDBFE' : '#1D4ED8' },
});
