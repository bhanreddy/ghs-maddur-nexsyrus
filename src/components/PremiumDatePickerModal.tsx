import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, Platform, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import Animated, { FadeIn, FadeOut, ZoomIn, ZoomOut } from 'react-native-reanimated';
import { useTheme } from '../hooks/useTheme';

type PremiumDatePickerModalProps = {
  visible: boolean;
  date: Date;
  onClose: () => void;
  onSelect: (date: Date) => void;
};

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function PremiumDatePickerModal({ visible, date, onClose, onSelect }: PremiumDatePickerModalProps) {
  const { theme, isDark } = useTheme();
  
  // Local state for calendar navigation
  const [currentMonth, setCurrentMonth] = useState(date.getMonth());
  const [currentYear, setCurrentYear] = useState(date.getFullYear());

  useEffect(() => {
    if (visible) {
      setCurrentMonth(date.getMonth());
      setCurrentYear(date.getFullYear());
    }
  }, [visible, date]);

  const daysInMonth = useMemo(() => new Date(currentYear, currentMonth + 1, 0).getDate(), [currentYear, currentMonth]);
  const firstDay = useMemo(() => new Date(currentYear, currentMonth, 1).getDay(), [currentYear, currentMonth]);

  const prevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(y => y - 1);
    } else {
      setCurrentMonth(m => m - 1);
    }
  };

  const nextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(y => y + 1);
    } else {
      setCurrentMonth(m => m + 1);
    }
  };

  const isToday = (d: number) => {
    const today = new Date();
    return today.getDate() === d && today.getMonth() === currentMonth && today.getFullYear() === currentYear;
  };

  const isSelected = (d: number) => {
    return date.getDate() === d && date.getMonth() === currentMonth && date.getFullYear() === currentYear;
  };

  if (!visible) return null;

  const content = (
    <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.overlay}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        {Platform.OS !== 'android' && (
          <BlurView intensity={isDark ? 40 : 20} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
        )}
      </Pressable>
      
      <Animated.View entering={ZoomIn.duration(250).springify().damping(18)} exiting={ZoomOut.duration(200)} style={[styles.modalCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
        
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={prevMonth} style={[styles.navBtn, { backgroundColor: theme.colors.background }]}>
            <Ionicons name="chevron-back" size={18} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={[styles.monthText, { color: theme.colors.text }]}>
            {MONTHS[currentMonth]} {currentYear}
          </Text>
          <TouchableOpacity onPress={nextMonth} style={[styles.navBtn, { backgroundColor: theme.colors.background }]}>
            <Ionicons name="chevron-forward" size={18} color={theme.colors.text} />
          </TouchableOpacity>
        </View>

        {/* Days of week */}
        <View style={styles.daysRow}>
          {DAYS.map((d, i) => (
            <Text key={i} style={[styles.dayName, { color: theme.colors.textSecondary }]}>{d}</Text>
          ))}
        </View>

        {/* Calendar Grid */}
        <View style={styles.grid}>
          {Array.from({ length: firstDay }).map((_, i) => (
            <View key={`empty-${i}`} style={styles.cell} />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const d = i + 1;
            const selected = isSelected(d);
            const today = isToday(d);
            return (
              <TouchableOpacity
                key={d}
                activeOpacity={0.7}
                onPress={() => onSelect(new Date(currentYear, currentMonth, d))}
                style={[
                  styles.cell,
                  selected && [styles.selectedCell, { backgroundColor: theme.colors.primary }],
                  !selected && today && [styles.todayCell, { borderColor: theme.colors.primary }]
                ]}>
                <Text style={[
                  styles.cellText,
                  { color: theme.colors.text },
                  selected && styles.selectedCellText,
                  !selected && today && { color: theme.colors.primary, fontWeight: '800' }
                ]}>
                  {d}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Footer */}
        <View style={[styles.footer, { borderTopColor: theme.colors.border }]}>
          <TouchableOpacity onPress={onClose} style={styles.footerBtn}>
            <Text style={[styles.footerBtnText, { color: theme.colors.textSecondary }]}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={() => onSelect(new Date())} 
            style={[styles.footerBtn, { backgroundColor: theme.colors.primary + '15', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 8 }]}>
            <Text style={[styles.footerBtnText, { color: theme.colors.primary, fontWeight: '700' }]}>Today</Text>
          </TouchableOpacity>
        </View>

      </Animated.View>
    </Animated.View>
  );

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      {content}
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  modalCard: {
    width: 320,
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 32,
    elevation: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthText: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  daysRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  dayName: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 16,
    marginBottom: 4,
  },
  selectedCell: {
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
  todayCell: {
    borderWidth: 1.5,
  },
  cellText: {
    fontSize: 14,
    fontWeight: '600',
  },
  selectedCellText: {
    color: '#fff',
    fontWeight: '800',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  footerBtnText: {
    fontSize: 14,
    fontWeight: '600',
  }
});
