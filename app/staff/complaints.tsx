import { TourTarget, TourScrollView } from '@/src/features/app-tour';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import AppTextInput from '@/src/components/AppTextInput';
import KeyboardAwareScreen from '@/components/keyboard/KeyboardAwareScreen';
import { clayCard, clayInset } from '@/src/theme/clayStyles';

import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform,
  Modal, Pressable, Dimensions, useWindowDimensions,
} from 'react-native';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import { promptAppReviewAfterSuccess } from '../../src/utils/openPlayStore';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  FadeInDown, FadeIn, FadeInUp, useSharedValue, useAnimatedStyle,
  withSpring, withRepeat, withTiming, Easing,
} from 'react-native-reanimated';
import StaffHeader from '../../src/components/StaffHeader';
import ViewAsBanner from '../../src/components/ViewAsBanner';
import { useEffectiveStaffId } from '../../src/hooks/useEffectiveStaffId';
import { ComplaintService, Complaint, TeacherService, TeacherClassAssignment } from '../../src/services/commonServices';
import { StudentService } from '../../src/services/studentService';
import { AttendanceService } from '../../src/services/attendanceService';
import { StudentWithDetails } from '../../src/types/schema';
import { useTheme } from '../../src/hooks/useTheme';
import LogoLoader from '../../src/components/LogoLoader';
import StudentPhoto from '../../src/components/StudentPhoto';

const { width: WIN_W } = Dimensions.get('window');
const FONT = Platform.OS === 'ios' ? 'SF Pro Display' : 'sans-serif';
const AnimatedTouch = Animated.createAnimatedComponent(TouchableOpacity);
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Emerald staff accent — Mode A clay world
const EM = '#059669';
const EM_SOFT = '#10B981';
const EM_GLOW = 'rgba(16,185,129,0.18)';

// ─── Types ─────────────────────────────────────────────────────────
interface UIComplaint extends Complaint {
  color?: string;
  target?: string;
  date?: string;
  student_name?: string;
  student_admission_no?: string;
  student_photo_url?: string | null;
}
interface Student {
  id: string;
  display_name: string;
  admission_no: string;
  photo_url?: string | null;
}
interface ClassSectionOption {
  class_section_id: string;
  class_id: string;
  section_id: string;
  label: string;
}

function getUniqueClassSections(assignments: TeacherClassAssignment[]): ClassSectionOption[] {
  const seen = new Set<string>();
  const result: ClassSectionOption[] = [];
  for (const assignment of assignments) {
    if (!seen.has(assignment.class_section_id)) {
      seen.add(assignment.class_section_id);
      result.push({
        class_section_id: assignment.class_section_id,
        class_id: assignment.class_id,
        section_id: assignment.section_id,
        label: `${assignment.class_name}-${assignment.section_name}`,
      });
    }
  }
  return result;
}

function mapStudentRows(
  rows: Array<{
    student_id?: string;
    id?: string;
    student_name?: string;
    display_name?: string;
    admission_no: string;
    photo_url?: string | null;
  }>
): Student[] {
  return rows.map((row) => ({
    id: row.student_id || row.id || '',
    display_name: row.student_name || row.display_name || 'Unknown',
    admission_no: row.admission_no,
    photo_url: row.photo_url,
  }));
}

function normalizeStatus(status?: string) {
  return (status || 'open').toLowerCase().trim().replace(/_/g, ' ');
}

function formatTimeAgo(dateString?: string) {
  if (!dateString) return '—';
  const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
  if (Number.isNaN(seconds)) return '—';
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(dateString).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Config ────────────────────────────────────────────────────────
const CATEGORY_CFG: Record<string, { color: string; bg: string; icon: keyof typeof Ionicons.glyphMap; label: string }> = {
  disciplinary: { color: '#EF4444', bg: 'rgba(239,68,68,0.10)', icon: 'warning-outline', label: 'Disciplinary' },
  academic: { color: '#6366F1', bg: 'rgba(99,102,241,0.10)', icon: 'school-outline', label: 'Academic' },
  facility: { color: '#F59E0B', bg: 'rgba(245,158,11,0.10)', icon: 'business-outline', label: 'Facility' },
  default: { color: '#64748B', bg: 'rgba(100,116,139,0.10)', icon: 'chatbubble-ellipses-outline', label: 'Other' },
};

const PRIORITY_CFG: Record<string, { color: string; bg: string; border: string }> = {
  high: { color: '#EF4444', bg: 'rgba(239,68,68,0.10)', border: 'rgba(239,68,68,0.22)' },
  urgent: { color: '#DC2626', bg: 'rgba(220,38,38,0.12)', border: 'rgba(220,38,38,0.28)' },
  medium: { color: '#F59E0B', bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.22)' },
  low: { color: '#3B82F6', bg: 'rgba(59,130,246,0.10)', border: 'rgba(59,130,246,0.22)' },
};

const STATUS_CFG: Record<string, { color: string; bg: string; border: string; icon: keyof typeof MaterialIcons.glyphMap; label: string }> = {
  open: { color: '#F59E0B', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.25)', icon: 'lock-open', label: 'Open' },
  pending: { color: '#F59E0B', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.25)', icon: 'hourglass-empty', label: 'Pending' },
  'in progress': { color: '#3B82F6', bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.25)', icon: 'autorenew', label: 'In Progress' },
  resolved: { color: '#10B981', bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.25)', icon: 'check-circle', label: 'Resolved' },
  closed: { color: '#64748B', bg: 'rgba(100,116,139,0.12)', border: 'rgba(100,116,139,0.22)', icon: 'lock', label: 'Closed' },
  escalated: { color: '#EF4444', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.25)', icon: 'arrow-upward', label: 'Escalated' },
};

const SEVERITY_CFG = [
  { key: 'Low' as const, color: '#3B82F6', bg: 'rgba(59,130,246,0.10)', activeBg: 'rgba(59,130,246,0.15)' },
  { key: 'Medium' as const, color: '#F59E0B', bg: 'rgba(245,158,11,0.10)', activeBg: 'rgba(245,158,11,0.15)' },
  { key: 'High' as const, color: '#EF4444', bg: 'rgba(239,68,68,0.10)', activeBg: 'rgba(239,68,68,0.15)' },
];

const FILTER_TABS = [
  { key: 'ALL' as const, label: 'All', icon: 'grid-outline' as const },
  { key: 'DISCIPLINARY' as const, label: 'Disciplinary', icon: 'warning-outline' as const },
  { key: 'FACILITY' as const, label: 'Facility', icon: 'business-outline' as const },
];

type StatusStatFilter = 'ALL' | 'OPEN' | 'ACTIVE' | 'DONE';

const INCIDENT_PRESETS = [
  { key: 'disruption', label: 'Disruption', title: 'Classroom disruption', icon: 'megaphone-outline' as const },
  { key: 'bullying', label: 'Bullying', title: 'Bullying or harassment', icon: 'hand-left-outline' as const },
  { key: 'late', label: 'Late', title: 'Repeated lateness', icon: 'time-outline' as const },
  { key: 'disrespect', label: 'Disrespect', title: 'Disrespectful behaviour', icon: 'alert-circle-outline' as const },
  { key: 'other', label: 'Other', title: '', icon: 'ellipsis-horizontal-outline' as const },
] as const;

function matchesStatusStatFilter(status: string | undefined, filter: StatusStatFilter) {
  const s = normalizeStatus(status);
  if (filter === 'ALL') return true;
  if (filter === 'OPEN') return s === 'open' || s === 'pending';
  if (filter === 'ACTIVE') return s === 'in progress' || s === 'escalated';
  if (filter === 'DONE') return s === 'resolved' || s === 'closed';
  return true;
}

function isHighPriority(priority?: string) {
  return ['high', 'urgent'].includes((priority || '').toLowerCase());
}

// ─── PressScale ────────────────────────────────────────────────────
function PressScale({
  onPress, children, disabled, style,
}: {
  onPress?: () => void; children: React.ReactNode; disabled?: boolean; style?: any;
}) {
  const scale = useSharedValue(1);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Pressable
      style={style}
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => { if (!disabled) scale.value = withSpring(0.96, { damping: 18, stiffness: 320 }); }}
      onPressOut={() => { scale.value = withSpring(1, { damping: 14, stiffness: 220 }); }}
    >
      <Animated.View style={aStyle}>{children}</Animated.View>
    </Pressable>
  );
}

/** Single-depth field — avoids ClayInput’s double clay frame (bubbly / tall). */
function FormField({
  label, hint, value, onChangeText, placeholder, isDark, multiline, icon, suffix, error, required,
}: {
  label: string;
  hint?: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  isDark: boolean;
  multiline?: boolean;
  icon?: keyof typeof MaterialIcons.glyphMap;
  suffix?: React.ReactNode;
  error?: string;
  required?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const showError = !!error && error.trim().length > 0;

  return (
    <View style={ff.wrap}>
      <View style={ff.labelRow}>
        <Text style={[ff.label, { color: isDark ? '#CBD5E1' : '#334155', fontFamily: FONT }]}>
          {label}{required ? <Text style={{ color: '#EF4444' }}> *</Text> : null}
        </Text>
        {hint ? (
          <Text style={[ff.hint, { color: isDark ? '#64748B' : '#94A3B8', fontFamily: FONT }]}>{hint}</Text>
        ) : null}
      </View>
      <View
        style={[
          ff.field,
          clayInset(isDark, focused) as any,
          focused && !showError && { borderWidth: 1.5, borderColor: isDark ? 'rgba(52,211,153,0.45)' : 'rgba(5,150,105,0.40)' },
          showError && { borderWidth: 1.5, borderColor: 'rgba(239,68,68,0.45)' },
        ]}
      >
        {icon ? (
          <MaterialIcons
            name={icon}
            size={18}
            color={showError ? '#EF4444' : focused ? (isDark ? '#34D399' : EM) : (isDark ? '#64748B' : '#94A3B8')}
            style={{ marginTop: multiline ? 2 : 0 }}
          />
        ) : null}
        <AppTextInput
          style={[
            ff.input,
            multiline && ff.multi,
            {
              color: isDark ? '#EEF2FF' : '#0F172A',
              fontFamily: FONT,
              ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
            } as any,
          ]}
          placeholder={placeholder}
          placeholderTextColor={isDark ? '#475569' : '#94A3B8'}
          value={value}
          onChangeText={onChangeText}
          multiline={multiline}
          textAlignVertical={multiline ? 'top' : 'center'}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          numberOfLines={multiline ? 4 : 1}
        />
        {suffix}
      </View>
      {showError ? (
        <Text style={[ff.error, { fontFamily: FONT }]}>{error}</Text>
      ) : null}
    </View>
  );
}

function StepHeader({
  step, title, subtitle, isDark, done,
}: {
  step: number; title: string; subtitle?: string; isDark: boolean; done?: boolean;
}) {
  return (
    <View style={ff.stepRow}>
      <View style={[
        ff.stepBadge,
        done
          ? { backgroundColor: isDark ? 'rgba(16,185,129,0.22)' : 'rgba(5,150,105,0.14)' }
          : { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.06)' },
      ]}>
        {done ? (
          <Ionicons name="checkmark" size={14} color={isDark ? '#34D399' : EM} />
        ) : (
          <Text style={[ff.stepNum, { color: isDark ? '#94A3B8' : '#475569', fontFamily: FONT }]}>{step}</Text>
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[ff.stepTitle, { color: isDark ? '#EEF2FF' : '#0F172A', fontFamily: FONT }]}>{title}</Text>
        {subtitle ? (
          <Text style={[ff.stepSub, { color: isDark ? '#64748B' : '#64748B', fontFamily: FONT }]}>{subtitle}</Text>
        ) : null}
      </View>
    </View>
  );
}

const ff = StyleSheet.create({
  wrap: { marginBottom: 14 },
  labelRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 7, gap: 8 },
  label: { fontSize: 13, fontWeight: '700', letterSpacing: -0.15 },
  hint: { fontSize: 11, fontWeight: '500' },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'web' ? 11 : 12,
    borderRadius: 14,
    minHeight: 48,
    borderWidth: 0,
  },
  input: { flex: 1, fontSize: 14, fontWeight: '600', letterSpacing: -0.2, minHeight: 22, padding: 0, backgroundColor: 'transparent', borderWidth: 0 },
  multi: { minHeight: 88, lineHeight: 21, paddingTop: 2 },
  error: { marginTop: 6, fontSize: 12, fontWeight: '600', color: '#EF4444' },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  stepBadge: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  stepNum: { fontSize: 13, fontWeight: '800' },
  stepTitle: { fontSize: 15, fontWeight: '800', letterSpacing: -0.3 },
  stepSub: { fontSize: 12, fontWeight: '500', marginTop: 1 },
});

// ─── Skeleton ──────────────────────────────────────────────────────
function SkeletonCard({ isDark, delay = 0 }: { isDark: boolean; delay?: number }) {
  const opacity = useSharedValue(0.45);
  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, []);
  const aStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const bone = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(148,163,184,0.18)';

  return (
    <Animated.View entering={FadeIn.delay(delay).duration(200)} style={[sk.card, clayCard(isDark, 'sm') as any, aStyle]}>
      <View style={[sk.stripe, { backgroundColor: bone }]} />
      <View style={sk.row}>
        <View style={[sk.icon, { backgroundColor: bone }]} />
        <View style={{ flex: 1, gap: 8 }}>
          <View style={[sk.line, { width: '38%', backgroundColor: bone }]} />
          <View style={[sk.line, { width: '72%', height: 14, backgroundColor: bone }]} />
        </View>
        <View style={[sk.pill, { backgroundColor: bone }]} />
      </View>
      <View style={[sk.line, { width: '90%', marginTop: 12, backgroundColor: bone }]} />
      <View style={[sk.line, { width: '55%', marginTop: 8, backgroundColor: bone }]} />
    </Animated.View>
  );
}

const sk = StyleSheet.create({
  card: { padding: 16, paddingLeft: 20, marginBottom: 12, overflow: 'hidden' },
  stripe: { position: 'absolute', left: 0, top: 14, bottom: 14, width: 3.5, borderRadius: 3 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 40, height: 40, borderRadius: 13 },
  line: { height: 10, borderRadius: 6 },
  pill: { width: 48, height: 24, borderRadius: 8 },
});

// ─── Complaint Card ────────────────────────────────────────────────
const ComplaintCard = React.memo(function ComplaintCard({
  item, index, isDark, wide, onPress,
}: {
  item: UIComplaint; index: number; isDark: boolean; wide: boolean; onPress: (c: UIComplaint) => void;
}) {
  const catKey = item.category?.toLowerCase() || 'default';
  const cat = CATEGORY_CFG[catKey] || CATEGORY_CFG.default;
  const pri = PRIORITY_CFG[(item.priority || 'low').toLowerCase()] || PRIORITY_CFG.low;
  const stat = STATUS_CFG[normalizeStatus(item.status)] || STATUS_CFG.open;
  const isHigh = isHighPriority(item.priority);
  const studentLabel = item.student_name?.trim() || 'Student not linked';
  const adm = item.student_admission_no ? `#${item.student_admission_no}` : null;
  const s = useSharedValue(1);
  const scaleStyle = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));

  return (
    <Animated.View
      entering={FadeInDown.delay(Math.min(index, 8) * 45).duration(280).easing(Easing.out(Easing.cubic))}
      style={wide ? cc.gridItem : undefined}
    >
      <AnimatedTouch
        activeOpacity={1}
        onPressIn={() => { s.value = withSpring(0.98, { damping: 18, stiffness: 240 }); }}
        onPressOut={() => { s.value = withSpring(1, { damping: 16, stiffness: 220 }); }}
        onPress={() => onPress(item)}
        style={[scaleStyle, { marginBottom: 10 }]}
      >
        <View style={[cc.card, wide && cc.cardWide, clayCard(isDark, 'sm') as any, isHigh && cc.cardUrgent]}>
          <View style={[cc.stripe, { backgroundColor: cat.color }]} />
          <View style={cc.row}>
            <StudentPhoto
              photoUrl={item.student_photo_url}
              displayName={studentLabel}
              size={wide ? 44 : 36}
              borderRadius={wide ? 14 : 11}
              style={[cc.avatar, { backgroundColor: cat.bg }]}
              fallbackTextStyle={{ color: cat.color, fontWeight: '800', fontSize: 14, fontFamily: FONT }}
            />
            <View style={cc.main}>
              <View style={cc.titleRow}>
                <Text style={[cc.studentName, { color: isDark ? '#EEF2FF' : '#0F172A', fontFamily: FONT }]} numberOfLines={1}>
                  {studentLabel}
                </Text>
                <Text style={[cc.timeText, { color: isDark ? '#64748B' : '#94A3B8', fontFamily: FONT }]}>
                  {formatTimeAgo(item.created_at)}
                </Text>
              </View>
              {adm ? (
                <Text style={[cc.adm, { color: isDark ? '#64748B' : '#94A3B8', fontFamily: FONT }]}>{adm}</Text>
              ) : null}
              <Text style={[cc.incident, { color: isDark ? '#94A3B8' : '#475569', fontFamily: FONT }]} numberOfLines={1}>
                {item.title || 'Untitled report'}
              </Text>
              {wide && item.description ? (
                <Text
                  style={[cc.description, { color: isDark ? '#64748B' : '#64748B', fontFamily: FONT }]}
                  numberOfLines={2}
                >
                  {item.description}
                </Text>
              ) : null}
              <View style={cc.pillRow}>
                <View style={[cc.categoryBadge, { backgroundColor: cat.bg }]}>
                  <Ionicons name={cat.icon} size={10} color={cat.color} />
                  <Text style={[cc.categoryText, { color: cat.color, fontFamily: FONT }]}>{cat.label}</Text>
                </View>
                <View style={[cc.statusBadge, { backgroundColor: stat.bg, borderColor: stat.border }]}>
                  <MaterialIcons name={stat.icon} size={10} color={stat.color} />
                  <Text style={[cc.statusText, { color: stat.color, fontFamily: FONT }]}>{stat.label}</Text>
                </View>
                <View style={[cc.priorityBadge, { backgroundColor: pri.bg, borderColor: pri.border }]}>
                  <Text style={[cc.priorityText, { color: pri.color, fontFamily: FONT }]}>
                    {(item.priority || 'low').toUpperCase()}
                  </Text>
                </View>
                <Text style={[cc.ticket, { color: isDark ? '#475569' : '#94A3B8', fontFamily: FONT }]}>
                  {item.ticket_no ? `#${item.ticket_no}` : ''}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={16} color={isDark ? '#475569' : '#94A3B8'} />
          </View>
        </View>
      </AnimatedTouch>
    </Animated.View>
  );
});

const cc = StyleSheet.create({
  card: { borderRadius: 18, overflow: 'hidden', position: 'relative' },
  cardWide: { minHeight: 176 },
  gridItem: { width: '49.35%' },
  cardUrgent: {
    borderColor: 'rgba(239,68,68,0.28)',
    ...Platform.select({
      ios: { shadowColor: '#EF4444', shadowOpacity: 0.1, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 3 },
      default: {},
    }),
  },
  stripe: { position: 'absolute', left: 0, top: 10, bottom: 10, width: 3, borderRadius: 2, zIndex: 2 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 12, paddingHorizontal: 14, paddingLeft: 16,
  },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  main: { flex: 1, minWidth: 0, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  studentName: { fontSize: 15, fontWeight: '800', letterSpacing: -0.3, flex: 1 },
  adm: { fontSize: 11, fontWeight: '600' },
  incident: { fontSize: 13, fontWeight: '500', marginTop: 1 },
  description: { fontSize: 12, fontWeight: '500', lineHeight: 17, marginTop: 4 },
  pillRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  categoryBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 8 },
  categoryText: { fontSize: 10, fontWeight: '700' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  statusText: { fontSize: 10, fontWeight: '700' },
  priorityBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  priorityText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.3 },
  ticket: { fontSize: 10, fontWeight: '600', marginLeft: 'auto' },
  timeText: { fontSize: 11, fontWeight: '500' },
});

// ─── Detail Sheet ──────────────────────────────────────────────────
function DetailSheet({
  item, visible, onClose, isDark,
}: {
  item: UIComplaint | null; visible: boolean; onClose: () => void; isDark: boolean;
}) {
  if (!item) return null;
  const cat = CATEGORY_CFG[item.category?.toLowerCase() || 'default'] || CATEGORY_CFG.default;
  const pri = PRIORITY_CFG[(item.priority || 'low').toLowerCase()] || PRIORITY_CFG.low;
  const stat = STATUS_CFG[normalizeStatus(item.status)] || STATUS_CFG.open;
  const studentLine = item.student_name
    ? `${item.student_name}${item.student_admission_no ? ` · #${item.student_admission_no}` : ''}`
    : null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={ds.backdrop} onPress={onClose}>
        <Pressable style={[ds.sheet, clayCard(isDark, 'lg') as any]} onPress={(e) => e.stopPropagation?.()}>
          <View style={ds.handle} />
          <View style={ds.sheetHeader}>
            <StudentPhoto
              photoUrl={item.student_photo_url}
              displayName={item.student_name || item.title}
              size={44}
              borderRadius={14}
              style={[ds.sheetIcon, { backgroundColor: cat.bg }]}
              fallbackTextStyle={{ color: cat.color, fontWeight: '800', fontSize: 18, fontFamily: FONT }}
            />
            <View style={{ flex: 1 }}>
              <Text style={[ds.sheetTicket, { color: isDark ? '#64748B' : '#94A3B8', fontFamily: FONT }]}>
                {item.ticket_no ? `#${item.ticket_no}` : 'Report'}
              </Text>
              <Text style={[ds.sheetTitle, { color: isDark ? '#EEF2FF' : '#0F172A', fontFamily: FONT }]}>
                {studentLine || item.title || 'Disciplinary report'}
              </Text>
              {studentLine && item.title ? (
                <Text style={[ds.sheetSub, { color: isDark ? '#94A3B8' : '#64748B', fontFamily: FONT }]} numberOfLines={2}>
                  {item.title}
                </Text>
              ) : null}
            </View>
            <PressScale onPress={onClose}>
              <View style={[ds.closeBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.06)' }]}>
                <Ionicons name="close" size={18} color={isDark ? '#94A3B8' : '#64748B'} />
              </View>
            </PressScale>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: WIN_W * 0.85 }}>
            <View style={ds.badgeRow}>
              <View style={[ds.badge, { backgroundColor: cat.bg }]}>
                <Text style={[ds.badgeText, { color: cat.color, fontFamily: FONT }]}>{cat.label}</Text>
              </View>
              <View style={[ds.badge, { backgroundColor: pri.bg, borderColor: pri.border, borderWidth: 1 }]}>
                <Text style={[ds.badgeText, { color: pri.color, fontFamily: FONT }]}>{(item.priority || 'Low').toUpperCase()}</Text>
              </View>
              <View style={[ds.badge, { backgroundColor: stat.bg, borderColor: stat.border, borderWidth: 1 }]}>
                <MaterialIcons name={stat.icon} size={12} color={stat.color} />
                <Text style={[ds.badgeText, { color: stat.color, fontFamily: FONT }]}>{stat.label}</Text>
              </View>
            </View>

            <Text style={[ds.sectionLabel, { color: isDark ? '#64748B' : '#94A3B8', fontFamily: FONT }]}>What happened</Text>
            <Text style={[ds.body, { color: isDark ? '#CBD5E1' : '#334155', fontFamily: FONT }]}>
              {item.description || 'No description provided.'}
            </Text>

            <View style={[ds.metaGrid, { borderTopColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)' }]}>
              <View style={ds.metaItem}>
                <Ionicons name="time-outline" size={14} color={EM} />
                <View>
                  <Text style={[ds.metaLabel, { color: isDark ? '#64748B' : '#94A3B8', fontFamily: FONT }]}>Filed</Text>
                  <Text style={[ds.metaValue, { color: isDark ? '#E2E8F0' : '#0F172A', fontFamily: FONT }]}>
                    {formatTimeAgo(item.created_at)}
                  </Text>
                </View>
              </View>
              {item.raised_by_name || item.raised_by ? (
                <View style={ds.metaItem}>
                  <Ionicons name="person-outline" size={14} color={EM} />
                  <View>
                    <Text style={[ds.metaLabel, { color: isDark ? '#64748B' : '#94A3B8', fontFamily: FONT }]}>Raised by</Text>
                    <Text style={[ds.metaValue, { color: isDark ? '#E2E8F0' : '#0F172A', fontFamily: FONT }]} numberOfLines={1}>
                      {item.raised_by_name || item.raised_by}
                    </Text>
                  </View>
                </View>
              ) : null}
            </View>

            {item.resolution ? (
              <>
                <Text style={[ds.sectionLabel, { color: isDark ? '#64748B' : '#94A3B8', fontFamily: FONT, marginTop: 16 }]}>Resolution</Text>
                <Text style={[ds.body, { color: isDark ? '#CBD5E1' : '#334155', fontFamily: FONT }]}>{item.resolution}</Text>
              </>
            ) : null}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const ds = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'flex-end', padding: 16, paddingBottom: 28,
  },
  sheet: {
    borderRadius: 28, padding: 22, maxHeight: '78%',
    width: Math.min(WIN_W - 32, 520), alignSelf: 'center',
  },
  handle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(148,163,184,0.45)',
    alignSelf: 'center', marginBottom: 16,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14 },
  sheetIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  sheetTicket: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 3 },
  sheetTitle: { fontSize: 18, fontWeight: '800', letterSpacing: -0.4, lineHeight: 24 },
  sheetSub: { fontSize: 13, fontWeight: '500', marginTop: 4, lineHeight: 18 },
  closeBtn: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  badgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },
  sectionLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 8 },
  body: { fontSize: 14, lineHeight: 22, fontWeight: '500' },
  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 18, paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: '40%' },
  metaLabel: { fontSize: 11, fontWeight: '600', marginBottom: 2 },
  metaValue: { fontSize: 13, fontWeight: '700' },
});

// ─── Main Screen ───────────────────────────────────────────────────
export default function StaffComplaints() {
  const { isDark } = useTheme();
  const { isViewingAsAdmin, viewAsName, staffId } = useEffectiveStaffId();

  const [wizardVisible, setWizardVisible] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [statusStatFilter, setStatusStatFilter] = useState<StatusStatFilter>('ALL');
  const [highPriorityOnly, setHighPriorityOnly] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [complaints, setComplaints] = useState<UIComplaint[]>([]);
  const [filterType, setFilterType] = useState<'ALL' | 'DISCIPLINARY' | 'FACILITY'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [detailItem, setDetailItem] = useState<UIComplaint | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);

  // Form
  const [studentMode, setStudentMode] = useState<'single' | 'multiple'>('single');
  const [studentSearch, setStudentSearch] = useState('');
  const [studentsList, setStudentsList] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [classSections, setClassSections] = useState<ClassSectionOption[]>([]);
  const [selectedClassSectionId, setSelectedClassSectionId] = useState<string | null>(null);
  const [classStudents, setClassStudents] = useState<Student[]>([]);
  const [loadingClass, setLoadingClass] = useState(false);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [severity, setSeverity] = useState<'Low' | 'Medium' | 'High'>('Low');
  const [isSearching, setIsSearching] = useState(false);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);

  const { width: winW } = useWindowDimensions();
  const isDesktop = winW >= 1024;
  const useReportGrid = winW >= 860;
  const formMaxW = Math.min(winW - 36, 560);

  const submitScale = useSharedValue(1);
  const submitAnim = useAnimatedStyle(() => ({ transform: [{ scale: submitScale.value }] }));

  useEffect(() => {
    fetchComplaints();
  }, []);

  useEffect(() => {
    if (wizardVisible && studentMode === 'single' && studentSearch.length > 2) {
      const t = setTimeout(searchStudents, 500);
      return () => clearTimeout(t);
    } else if (studentMode === 'single') setStudentsList([]);
  }, [studentSearch, wizardVisible, studentMode]);

  useEffect(() => {
    if (!wizardVisible || studentMode !== 'multiple') return;
    loadTeacherClasses();
  }, [wizardVisible, studentMode, staffId]);

  useEffect(() => {
    if (!wizardVisible || studentMode !== 'multiple' || !selectedClassSectionId) return;
    loadClassStudents(selectedClassSectionId);
  }, [wizardVisible, studentMode, selectedClassSectionId, classSections]);

  const resetForm = useCallback(() => {
    setWizardStep(1);
    setStudentMode('single');
    setStudentSearch('');
    setStudentsList([]);
    setSelectedStudent(null);
    setSelectedStudentIds([]);
    setClassSections([]);
    setSelectedClassSectionId(null);
    setClassStudents([]);
    setTitle('');
    setDesc('');
    setSeverity('Low');
    setSelectedPreset(null);
    setAttemptedSubmit(false);
  }, []);

  const openWizard = useCallback(() => {
    resetForm();
    setWizardVisible(true);
  }, [resetForm]);

  const closeWizard = useCallback(() => {
    setWizardVisible(false);
    resetForm();
  }, [resetForm]);

  const toggleStatusStat = useCallback((key: StatusStatFilter) => {
    setStatusStatFilter((prev) => (prev === key ? 'ALL' : key));
  }, []);

  const clearAllFilters = useCallback(() => {
    setSearchQuery('');
    setFilterType('ALL');
    setStatusStatFilter('ALL');
    setHighPriorityOnly(false);
  }, []);

  const loadTeacherClasses = async () => {
    setLoadingClass(true);
    let loadedSections: ClassSectionOption[] = [];
    try {
      const assignments = await TeacherService.getMyClasses();
      let sections = getUniqueClassSections(assignments);

      const homeroom = await AttendanceService.getMyClass(undefined, staffId);
      if (
        homeroom?.class_section_id &&
        !sections.some((section) => section.class_section_id === homeroom.class_section_id)
      ) {
        sections = [
          ...sections,
          {
            class_section_id: homeroom.class_section_id,
            class_id: '',
            section_id: '',
            label: `${homeroom.class_name || 'Class'} ${homeroom.section_name || ''}`.trim(),
          },
        ];
      }

      loadedSections = sections;
      setClassSections(sections);
      setSelectedClassSectionId((prev) =>
        prev && sections.some((section) => section.class_section_id === prev)
          ? prev
          : sections[0]?.class_section_id ?? null
      );

      if (sections.length === 0) setClassStudents([]);
    } catch {
      loadedSections = [];
      setClassSections([]);
      setSelectedClassSectionId(null);
      setClassStudents([]);
    } finally {
      if (loadedSections.length === 0) setLoadingClass(false);
    }
  };

  const loadClassStudents = async (classSectionId: string) => {
    setLoadingClass(true);
    setSelectedStudentIds([]);
    try {
      const section = classSections.find((item) => item.class_section_id === classSectionId);
      if (section?.class_id && section?.section_id) {
        const response = await StudentService.getAll<StudentWithDetails>({
          class_id: section.class_id,
          section_id: section.section_id,
          limit: 200,
          sort_by: 'roll_number',
          sort_order: 'asc',
        });
        setClassStudents(response.data.map((student) => ({
          id: student.id,
          display_name: student.person.display_name || `${student.person.first_name} ${student.person.last_name}`,
          admission_no: student.admission_no,
          photo_url: student.person.photo_url,
        })));
        return;
      }

      const homeroom = await AttendanceService.getMyClass(undefined, staffId);
      if (homeroom?.class_section_id === classSectionId && homeroom.students?.length) {
        setClassStudents(mapStudentRows(homeroom.students));
        return;
      }

      setClassStudents([]);
    } catch {
      setClassStudents([]);
    } finally {
      setLoadingClass(false);
    }
  };

  const toggleStudentSelection = (student: Student) => {
    setSelectedStudentIds((prev) =>
      prev.includes(student.id) ? prev.filter((id) => id !== student.id) : [...prev, student.id]
    );
  };

  const selectAllClassStudents = () => setSelectedStudentIds(classStudents.map((s) => s.id));
  const clearClassSelection = () => setSelectedStudentIds([]);

  const switchStudentMode = (mode: 'single' | 'multiple') => {
    setStudentMode(mode);
    setSelectedStudent(null);
    setSelectedStudentIds([]);
    setStudentSearch('');
    setStudentsList([]);
    setClassSections([]);
    setSelectedClassSectionId(null);
    setClassStudents([]);
  };

  const fetchComplaints = async () => {
    try {
      setLoading(true);
      const data = await ComplaintService.getAll();
      setComplaints(data.map((item) => ({
        ...item,
        color: CATEGORY_CFG[item.category?.toLowerCase() || 'default']?.color || '#6B7280',
        date: new Date(item.created_at).toLocaleDateString(),
      })));
    } catch {
      alertCompat('Error', 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  };

  const searchStudents = async () => {
    try {
      setIsSearching(true);
      const res = await StudentService.getAll<StudentWithDetails>({ search: studentSearch, limit: 5 });
      setStudentsList(res.data.map((s: StudentWithDetails) => ({
        id: s.id,
        display_name: s.person.display_name || `${s.person.first_name} ${s.person.last_name}`,
        admission_no: s.admission_no,
        photo_url: s.person.photo_url,
      })));
    } catch { /* noop */ } finally {
      setIsSearching(false);
    }
  };

  const studentReady = studentMode === 'single' ? !!selectedStudent : selectedStudentIds.length > 0;
  const titleReady = title.trim().length > 0;
  const descReady = desc.trim().length > 0;

  const handleSubmit = async () => {
    setAttemptedSubmit(true);
    if (!studentReady) {
      alertCompat('Pick a student', studentMode === 'single'
        ? 'Search and select who this report is about.'
        : 'Select at least one student from your class.');
      return;
    }
    if (!titleReady || !descReady) {
      alertCompat('Almost there', 'Add a title and description before submitting.');
      return;
    }
    try {
      setSubmitting(true);
      if (studentMode === 'single') {
        await ComplaintService.create({
          title: title.trim(), description: desc.trim(), category: 'disciplinary',
          priority: severity.toLowerCase(),
          raised_for_student_id: selectedStudent!.id,
        });
        closeWizard();
        await fetchComplaints();
        alertCompat('Submitted', 'Report submitted successfully.');
      } else {
        const result = await ComplaintService.createBulk({
          title: title.trim(), description: desc.trim(), category: 'disciplinary',
          priority: severity.toLowerCase(),
          raised_for_student_ids: selectedStudentIds,
        });
        closeWizard();
        await fetchComplaints();
        // Multi-student success: ask for feedback + Play Store review (package from app.json)
        promptAppReviewAfterSuccess(
          'Submitted',
          `Report sent to ${result.count} student(s). Thanks for keeping parents informed.`,
        );
      }
    } catch {
      alertCompat('Error', 'Failed to submit report.');
    } finally {
      setSubmitting(false);
    }
  };

  const goWizardNext = () => {
    if (wizardStep === 1) {
      if (!studentReady) {
        setAttemptedSubmit(true);
        return;
      }
      setWizardStep(2);
      setAttemptedSubmit(false);
      return;
    }
    if (wizardStep === 2) {
      if (!titleReady || !descReady) {
        setAttemptedSubmit(true);
        return;
      }
      setWizardStep(3);
      setAttemptedSubmit(false);
    }
  };

  const goWizardBack = () => {
    if (wizardStep === 1) {
      closeWizard();
      return;
    }
    setWizardStep((s) => (s === 3 ? 2 : 1));
    setAttemptedSubmit(false);
  };

  const applyPreset = (preset: typeof INCIDENT_PRESETS[number]) => {
    setSelectedPreset(preset.key);
    if (preset.title) setTitle(preset.title);
  };

  const counts = useMemo(() => {
    const open = complaints.filter((c) => matchesStatusStatFilter(c.status, 'OPEN')).length;
    const active = complaints.filter((c) => matchesStatusStatFilter(c.status, 'ACTIVE')).length;
    const done = complaints.filter((c) => matchesStatusStatFilter(c.status, 'DONE')).length;
    const high = complaints.filter((c) => isHighPriority(c.priority)).length;
    const disciplinary = complaints.filter((c) => c.category?.toUpperCase() === 'DISCIPLINARY').length;
    const facility = complaints.filter((c) => c.category?.toUpperCase() === 'FACILITY').length;
    return { open, active, done, high, disciplinary, facility, total: complaints.length };
  }, [complaints]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return complaints.filter((c) => {
      if (filterType !== 'ALL' && c.category?.toUpperCase() !== filterType) return false;
      if (statusStatFilter !== 'ALL' && !matchesStatusStatFilter(c.status, statusStatFilter)) return false;
      if (highPriorityOnly && !isHighPriority(c.priority)) return false;
      if (!q) return true;
      const hay = `${c.title || ''} ${c.description || ''} ${c.ticket_no || ''} ${c.raised_by_name || ''} ${c.student_name || ''} ${c.student_admission_no || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [complaints, filterType, searchQuery, statusStatFilter, highPriorityOnly]);

  const openDetail = useCallback((c: UIComplaint) => setDetailItem(c), []);
  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    filterType !== 'ALL' ||
    statusStatFilter !== 'ALL' ||
    highPriorityOnly;

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient
        colors={isDark ? ['#050810', '#0A1210', '#060908'] : ['#F0FDF4', '#ECFDF5', '#F8FAFC']}
        style={StyleSheet.absoluteFillObject}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.55, y: 1 }}
      />

      <TourTarget id="screen.staff-complaints.overview"><StaffHeader title="Complaints & Remarks" showBackButton /></TourTarget>
      {isViewingAsAdmin && <ViewAsBanner name={viewAsName} />}

      <KeyboardAwareScreen
        variant="scroll"
        bottomOffset={28}
        extraScrollPadding={48}
        contentContainerStyle={[ms.scroll, isDesktop && ms.scrollDesktop]}
        showsVerticalScrollIndicator={false}
      >
        <View style={ms.contentShell}>
          <Animated.View
            entering={FadeInDown.delay(40).duration(320)}
            style={[
              ms.pageHeader,
              isDesktop && ms.pageHeaderDesktop,
              isDesktop && (clayCard(isDark, 'md') as any),
            ]}
          >
            <View style={ms.heroLeft}>
              <View style={[
                ms.heroBadge,
                isDesktop && ms.heroBadgeDesktop,
                { backgroundColor: isDark ? 'rgba(16,185,129,0.16)' : 'rgba(5,150,105,0.12)' },
              ]}>
                <Ionicons name="shield-checkmark" size={isDesktop ? 24 : 16} color={isDark ? '#34D399' : EM} />
              </View>
              <View style={{ flex: 1 }}>
                {isDesktop && (
                  <Text style={[ms.heroEyebrow, { color: isDark ? '#34D399' : EM, fontFamily: FONT }]}>
                    STUDENT SUPPORT HUB
                  </Text>
                )}
                <Text style={[
                  ms.pageTitle,
                  isDesktop && ms.pageTitleDesktop,
                  { color: isDark ? '#EEF2FF' : '#06101E', fontFamily: FONT },
                ]}>
                  Student Disciplinary
                </Text>
                <Text style={[
                  ms.pageSub,
                  isDesktop && ms.pageSubDesktop,
                  { color: isDark ? '#64748B' : '#64748B', fontFamily: FONT },
                ]}>
                  Record concerns, track progress, and support every student with clear follow-through.
                </Text>
              </View>
            </View>
            {isDesktop && (
              <PressScale onPress={openWizard}>
                <LinearGradient
                  colors={[EM, EM_SOFT]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={ms.heroCta}
                >
                  <Ionicons name="add-circle-outline" size={20} color="#fff" />
                  <View>
                    <Text style={[ms.heroCtaTitle, { fontFamily: FONT }]}>New report</Text>
                    <Text style={[ms.heroCtaSub, { fontFamily: FONT }]}>Start a guided 3-step form</Text>
                  </View>
                  <Ionicons name="arrow-forward" size={17} color="#fff" />
                </LinearGradient>
              </PressScale>
            )}
          </Animated.View>

          {!loading && complaints.length > 0 && (
            <Animated.View entering={FadeInDown.delay(60).duration(320)} style={[ms.statRow, isDesktop && ms.statRowDesktop]}>
              {([
                { key: 'OPEN' as const, label: 'Open', hint: 'Needs review', count: counts.open, color: '#F59E0B', icon: 'time-outline' as const },
                { key: 'ACTIVE' as const, label: 'Active', hint: 'In follow-up', count: counts.active, color: '#3B82F6', icon: 'pulse-outline' as const },
                { key: 'DONE' as const, label: 'Resolved', hint: 'Completed', count: counts.done, color: EM_SOFT, icon: 'checkmark-circle-outline' as const },
              ]).map((chip) => {
                const active = statusStatFilter === chip.key;
                return (
                  <PressScale key={chip.key} onPress={() => toggleStatusStat(chip.key)} style={{ flex: 1 }}>
                    <View style={[
                      ms.statChipBtn,
                      isDesktop && ms.statChipDesktop,
                      clayCard(isDark, 'sm') as any,
                      active && {
                        borderColor: isDark ? 'rgba(52,211,153,0.45)' : 'rgba(5,150,105,0.40)',
                        backgroundColor: isDark ? 'rgba(16,185,129,0.14)' : 'rgba(5,150,105,0.08)',
                      },
                    ]}>
                      {isDesktop && (
                        <View style={[ms.statIcon, { backgroundColor: `${chip.color}18` }]}>
                          <Ionicons name={chip.icon} size={20} color={chip.color} />
                        </View>
                      )}
                      <View style={isDesktop ? ms.statCopy : undefined}>
                        <Text style={[ms.statNumber, isDesktop && ms.statNumberDesktop, { color: chip.color, fontFamily: FONT }]}>{chip.count}</Text>
                        <Text style={[ms.statLabel, isDesktop && ms.statLabelDesktop, { color: isDark ? '#94A3B8' : '#64748B', fontFamily: FONT }]}>
                          {chip.label}
                        </Text>
                        {isDesktop && (
                          <Text style={[ms.statHint, { color: isDark ? '#475569' : '#94A3B8', fontFamily: FONT }]}>{chip.hint}</Text>
                        )}
                      </View>
                    </View>
                  </PressScale>
                );
              })}
              <PressScale onPress={() => setHighPriorityOnly((v) => !v)} style={{ flex: 1 }}>
                <View style={[
                  ms.statChipBtn,
                  isDesktop && ms.statChipDesktop,
                  clayCard(isDark, 'sm') as any,
                  highPriorityOnly && {
                    borderColor: 'rgba(239,68,68,0.45)',
                    backgroundColor: isDark ? 'rgba(239,68,68,0.12)' : 'rgba(239,68,68,0.08)',
                  },
                ]}>
                  {isDesktop && (
                    <View style={[ms.statIcon, { backgroundColor: 'rgba(239,68,68,0.10)' }]}>
                      <Ionicons name="alert-circle-outline" size={20} color="#EF4444" />
                    </View>
                  )}
                  <View style={isDesktop ? ms.statCopy : undefined}>
                    <Text style={[ms.statNumber, isDesktop && ms.statNumberDesktop, { color: '#EF4444', fontFamily: FONT }]}>{counts.high}</Text>
                    <Text style={[ms.statLabel, isDesktop && ms.statLabelDesktop, { color: isDark ? '#94A3B8' : '#64748B', fontFamily: FONT }]}>High priority</Text>
                    {isDesktop && (
                      <Text style={[ms.statHint, { color: isDark ? '#475569' : '#94A3B8', fontFamily: FONT }]}>Needs attention</Text>
                    )}
                  </View>
                </View>
              </PressScale>
            </Animated.View>
          )}

          <Animated.View
            entering={FadeIn.duration(280)}
            style={[isDesktop && ms.controlsPanel, isDesktop && (clayCard(isDark, 'sm') as any)]}
          >
            <View style={[ms.controlsRow, isDesktop && ms.controlsRowDesktop]}>
              <TourTarget id="screen.staff-complaints.workspace" native><View style={[
                ms.searchWrap,
                isDesktop && ms.searchWrapDesktop,
                clayInset(isDark, searchFocused) as any,
                searchFocused && { borderColor: EM_GLOW },
              ]}>
                <Ionicons name="search-outline" size={18} color={searchFocused ? EM : (isDark ? '#64748B' : '#94A3B8')} />
                <AppTextInput
                  style={[ms.searchInput, { color: isDark ? '#EEF2FF' : '#0F172A', fontFamily: FONT }]}
                  placeholder="Search by student, admission no., ticket, or incident…"
                  placeholderTextColor={isDark ? '#475569' : '#94A3B8'}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                />
                {searchQuery.length > 0 && (
                  <PressScale onPress={() => setSearchQuery('')}>
                    <View style={[ms.searchClear, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.1)' }]}>
                      <Ionicons name="close" size={12} color="#fff" />
                    </View>
                  </PressScale>
                )}
              </View></TourTarget>

              <TourScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={[ms.filterScroller, isDesktop && ms.filterScrollerDesktop]}
                contentContainerStyle={ms.filterContent}
              >
              {FILTER_TABS.map((f) => {
                const isActive = filterType === f.key;
                const count = f.key === 'ALL' ? counts.total
                  : f.key === 'DISCIPLINARY' ? counts.disciplinary
                    : counts.facility;
                return (
                  <PressScale key={f.key} onPress={() => setFilterType(f.key)}>
                    <View style={[
                      ms.filterChip,
                      isActive
                        ? { backgroundColor: isDark ? 'rgba(16,185,129,0.18)' : 'rgba(5,150,105,0.12)', borderColor: isDark ? 'rgba(52,211,153,0.35)' : 'rgba(5,150,105,0.35)' }
                        : { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.55)', borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)' },
                    ]}>
                      <Ionicons
                        name={f.icon}
                        size={13}
                        color={isActive ? (isDark ? '#34D399' : EM) : (isDark ? '#64748B' : '#94A3B8')}
                      />
                      <Text style={[
                        ms.filterText,
                        {
                          color: isActive ? (isDark ? '#34D399' : EM) : (isDark ? '#94A3B8' : '#64748B'),
                          fontFamily: FONT,
                          fontWeight: isActive ? '700' : '600',
                        },
                      ]}>
                        {f.label}
                      </Text>
                      {count > 0 && (
                        <View style={[
                          ms.filterCount,
                          { backgroundColor: isActive ? (isDark ? 'rgba(52,211,153,0.25)' : 'rgba(5,150,105,0.18)') : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.06)') },
                        ]}>
                          <Text style={[
                            ms.filterCountText,
                            { color: isActive ? (isDark ? '#34D399' : EM) : (isDark ? '#94A3B8' : '#64748B'), fontFamily: FONT },
                          ]}>
                            {count}
                          </Text>
                        </View>
                      )}
                    </View>
                  </PressScale>
                );
              })}
              </TourScrollView>
            </View>
          </Animated.View>

          <View style={ms.reportsHeader}>
            <View>
              <Text style={[ms.reportsTitle, { color: isDark ? '#EEF2FF' : '#0F172A', fontFamily: FONT }]}>Reports</Text>
              <Text style={[ms.reportsMeta, { color: isDark ? '#64748B' : '#94A3B8', fontFamily: FONT }]}>
                Showing {filtered.length} of {counts.total}
              </Text>
            </View>
            {hasActiveFilters && (
              <PressScale onPress={clearAllFilters}>
                <View style={[ms.resetButton, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.05)' }]}>
                  <Ionicons name="refresh-outline" size={14} color={isDark ? '#94A3B8' : '#64748B'} />
                  <Text style={[ms.resetText, { color: isDark ? '#94A3B8' : '#64748B', fontFamily: FONT }]}>Reset filters</Text>
                </View>
              </PressScale>
            )}
          </View>

          {loading ? (
              <View>
                <SkeletonCard isDark={isDark} delay={0} />
                <SkeletonCard isDark={isDark} delay={60} />
                <SkeletonCard isDark={isDark} delay={120} />
              </View>
            ) : filtered.length === 0 ? (
              <Animated.View entering={FadeInUp.duration(320)} style={[ms.emptyState, clayCard(isDark, 'md') as any]}>
                <View style={[ms.emptyIcon, { backgroundColor: isDark ? 'rgba(16,185,129,0.12)' : 'rgba(5,150,105,0.10)' }]}>
                  <Ionicons
                    name={searchQuery ? 'search-outline' : 'document-text-outline'}
                    size={28}
                    color={isDark ? '#34D399' : EM}
                  />
                </View>
                <Text style={[ms.emptyTitle, { color: isDark ? '#EEF2FF' : '#0F172A', fontFamily: FONT }]}>
                  {hasActiveFilters ? 'No matching reports' : 'No reports yet'}
                </Text>
                <Text style={[ms.emptyText, { color: isDark ? '#64748B' : '#94A3B8', fontFamily: FONT }]}>
                  {hasActiveFilters
                    ? 'Change or reset the filters to see more results.'
                    : 'File your first behaviour report — it only takes a minute.'}
                </Text>
                {!hasActiveFilters && (
                  <PressScale onPress={openWizard}>
                    <LinearGradient colors={[EM, EM_SOFT]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={ms.emptyCta}>
                      <Ionicons name="add-circle-outline" size={16} color="#fff" />
                      <Text style={[ms.emptyCtaText, { fontFamily: FONT }]}>File New Report</Text>
                    </LinearGradient>
                  </PressScale>
                )}
              </Animated.View>
            ) : (
              <View style={[ms.reportGrid, useReportGrid && ms.reportGridWide]}>
                {filtered.map((item, i) => (
                  <ComplaintCard
                    key={item.id}
                    item={item}
                    index={i}
                    isDark={isDark}
                    wide={useReportGrid}
                    onPress={openDetail}
                  />
                ))}
              </View>
            )}

          <View style={{ height: isDesktop ? 36 : 100 }} />
        </View>
      </KeyboardAwareScreen>

      {!loading && !isDesktop && (
        <Animated.View entering={FadeInUp.delay(200).duration(320)} style={ms.fabWrap} pointerEvents="box-none">
          <PressScale onPress={openWizard}>
            <LinearGradient colors={[EM, EM_SOFT]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={ms.fab}>
              <Ionicons name="add" size={22} color="#fff" />
              <Text style={[ms.fabText, { fontFamily: FONT }]}>New Report</Text>
            </LinearGradient>
          </PressScale>
        </Animated.View>
      )}

      <Modal visible={wizardVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeWizard}>
        <View style={{ flex: 1, backgroundColor: isDark ? '#0A1210' : '#F8FAFC' }}>
          <LinearGradient
            colors={isDark ? ['#050810', '#0A1210'] : ['#F0FDF4', '#F8FAFC']}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={[wz.header, { borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)' }]}>
            <PressScale onPress={goWizardBack}>
              <View style={[wz.headerBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.06)' }]}>
                <Ionicons name={wizardStep === 1 ? 'close' : 'arrow-back'} size={18} color={isDark ? '#94A3B8' : '#64748B'} />
              </View>
            </PressScale>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={[wz.headerTitle, { color: isDark ? '#EEF2FF' : '#0F172A', fontFamily: FONT }]}>New report</Text>
              <Text style={[wz.headerStep, { color: isDark ? '#64748B' : '#94A3B8', fontFamily: FONT }]}>Step {wizardStep} of 3</Text>
            </View>
            <View style={wz.headerBtn} />
          </View>

          <View style={ms.progressRow}>
            {[
              { n: 1, label: 'Who', done: studentReady },
              { n: 2, label: 'What', done: titleReady && descReady },
              { n: 3, label: 'Review', done: wizardStep === 3 },
            ].map((p, i) => (
              <React.Fragment key={p.n}>
                {i > 0 ? <View style={[ms.progressLine, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)' }]} /> : null}
                <View style={ms.progressItem}>
                  <View style={[
                    ms.progressDot,
                    (wizardStep > p.n || p.done)
                      ? { backgroundColor: isDark ? 'rgba(16,185,129,0.22)' : 'rgba(5,150,105,0.14)' }
                      : { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.05)' },
                  ]}>
                    {(wizardStep > p.n || (p.done && wizardStep >= p.n))
                      ? <Ionicons name="checkmark" size={11} color={isDark ? '#34D399' : EM} />
                      : <Text style={[ms.progressNum, { color: isDark ? '#64748B' : '#94A3B8', fontFamily: FONT }]}>{p.n}</Text>}
                  </View>
                  <Text style={[ms.progressLabel, {
                    color: wizardStep >= p.n ? (isDark ? '#34D399' : EM) : (isDark ? '#64748B' : '#94A3B8'),
                    fontFamily: FONT,
                  }]}>{p.label}</Text>
                </View>
              </React.Fragment>
            ))}
          </View>

          <KeyboardAwareScreen
            variant="scroll"
            bottomOffset={88}
            contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 24, maxWidth: formMaxW, alignSelf: 'center', width: '100%' }}
            showsVerticalScrollIndicator={false}
          >
            {wizardStep === 1 && (
              <Animated.View entering={FadeIn.duration(220)} style={[ms.stepBlock, { borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)' }]}>
                <StepHeader step={1} title="Who is this about?" subtitle={studentMode === 'single' ? 'Search one student' : 'Pick from your class'} isDark={isDark} done={studentReady} />
                  <View style={ms.modeGrid}>
                    {([
                      { key: 'single' as const, label: 'One student', desc: 'Search by name or roll', icon: 'person-outline' as const },
                      { key: 'multiple' as const, label: 'Class pick', desc: 'Select several at once', icon: 'people-outline' as const },
                    ]).map((mode) => {
                      const active = studentMode === mode.key;
                      return (
                        <PressScale key={mode.key} onPress={() => switchStudentMode(mode.key)} style={{ flex: 1 }}>
                          <View style={[
                            ms.modeCard,
                            active
                              ? {
                                  backgroundColor: isDark ? 'rgba(16,185,129,0.14)' : 'rgba(5,150,105,0.08)',
                                  borderColor: isDark ? 'rgba(52,211,153,0.40)' : 'rgba(5,150,105,0.35)',
                                }
                              : {
                                  backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#F8FAFC',
                                  borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)',
                                },
                          ]}>
                            <View style={[
                              ms.modeIcon,
                              { backgroundColor: active
                                ? (isDark ? 'rgba(16,185,129,0.22)' : 'rgba(5,150,105,0.14)')
                                : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.05)') },
                            ]}>
                              <Ionicons
                                name={mode.icon}
                                size={16}
                                color={active ? (isDark ? '#34D399' : EM) : (isDark ? '#64748B' : '#94A3B8')}
                              />
                            </View>
                            <Text style={[ms.modeTitle, {
                              color: active ? (isDark ? '#34D399' : EM) : (isDark ? '#E2E8F0' : '#0F172A'),
                              fontFamily: FONT,
                            }]}>{mode.label}</Text>
                            <Text style={[ms.modeDesc, { color: isDark ? '#64748B' : '#94A3B8', fontFamily: FONT }]}>{mode.desc}</Text>
                          </View>
                        </PressScale>
                      );
                    })}
                  </View>

                  {attemptedSubmit && !studentReady ? (
                    <Text style={[ms.inlineError, { fontFamily: FONT }]}>
                      {studentMode === 'single' ? 'Select a student to continue.' : 'Select at least one student.'}
                    </Text>
                  ) : null}

                  {studentMode === 'single' ? (
                    selectedStudent ? (
                      <View style={[ms.selectedChip, {
                        backgroundColor: isDark ? 'rgba(16,185,129,0.12)' : 'rgba(5,150,105,0.08)',
                        borderColor: isDark ? 'rgba(52,211,153,0.30)' : 'rgba(5,150,105,0.28)',
                      }]}>
                        <StudentPhoto
                          photoUrl={selectedStudent.photo_url}
                          displayName={selectedStudent.display_name}
                          size={36}
                          borderRadius={11}
                          style={[
                            ms.selectedAvatar,
                            { backgroundColor: isDark ? 'rgba(16,185,129,0.22)' : 'rgba(5,150,105,0.16)' },
                          ]}
                          fallbackTextStyle={[
                            ms.selectedInitial,
                            { color: isDark ? '#34D399' : EM, fontFamily: FONT },
                          ]}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={[ms.selectedName, { color: isDark ? '#EEF2FF' : '#0F172A', fontFamily: FONT }]}>
                            {selectedStudent.display_name}
                          </Text>
                          <Text style={[ms.selectedAdm, { color: isDark ? '#64748B' : '#64748B', fontFamily: FONT }]}>
                            Roll #{selectedStudent.admission_no}
                          </Text>
                        </View>
                        <TouchableOpacity
                          onPress={() => { setSelectedStudent(null); setStudentSearch(''); }}
                          style={[ms.clearBtn, { backgroundColor: 'rgba(239,68,68,0.12)' }]}
                          hitSlop={8}
                        >
                          <Ionicons name="close" size={14} color="#EF4444" />
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View>
                        <FormField
                          label="Search student"
                          required
                          isDark={isDark}
                          icon="search"
                          placeholder="Name or admission number…"
                          value={studentSearch}
                          onChangeText={setStudentSearch}
                          suffix={isSearching ? <LogoLoader size={26} color={isDark ? '#34D399' : EM} /> : null}
                        />
                        {studentSearch.length > 2 && studentsList.length > 0 && (
                          <View style={[ms.suggestBox, clayCard(isDark, 'sm') as any]}>
                            {studentsList.map((s, i) => (
                              <TouchableOpacity
                                key={s.id}
                                style={[ms.suggestItem, i < studentsList.length - 1 && {
                                  borderBottomWidth: StyleSheet.hairlineWidth,
                                  borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
                                }]}
                                onPress={() => { setSelectedStudent(s); setStudentsList([]); setStudentSearch(''); }}
                              >
                                <StudentPhoto
                                  photoUrl={s.photo_url}
                                  displayName={s.display_name}
                                  size={30}
                                  borderRadius={9}
                                  style={[
                                    ms.suggestAvatar,
                                    { backgroundColor: isDark ? 'rgba(16,185,129,0.12)' : 'rgba(5,150,105,0.08)' },
                                  ]}
                                  fallbackTextStyle={{
                                    color: isDark ? '#34D399' : EM,
                                    fontWeight: '800',
                                    fontSize: 12,
                                  }}
                                />
                                <View style={{ flex: 1 }}>
                                  <Text style={[ms.suggestName, { color: isDark ? '#EEF2FF' : '#0F172A', fontFamily: FONT }]}>{s.display_name}</Text>
                                  <Text style={[ms.suggestAdm, { color: isDark ? '#64748B' : '#94A3B8', fontFamily: FONT }]}>#{s.admission_no}</Text>
                                </View>
                                <Ionicons name="add-circle-outline" size={18} color={isDark ? '#34D399' : EM} />
                              </TouchableOpacity>
                            ))}
                          </View>
                        )}
                        {studentSearch.length > 2 && !isSearching && studentsList.length === 0 ? (
                          <Text style={[ms.helperMuted, { color: isDark ? '#64748B' : '#94A3B8', fontFamily: FONT }]}>
                            No students match “{studentSearch}”
                          </Text>
                        ) : null}
                      </View>
                    )
                  ) : (
                    <View>
                      {classSections.length > 0 ? (
                        <>
                          <Text style={[ms.fieldLabel, { color: isDark ? '#CBD5E1' : '#334155', fontFamily: FONT }]}>Class</Text>
                          <TourScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={ms.classChipRow}>
                            {classSections.map((section) => {
                              const active = selectedClassSectionId === section.class_section_id;
                              return (
                                <PressScale key={section.class_section_id} onPress={() => setSelectedClassSectionId(section.class_section_id)}>
                                  <View style={[
                                    ms.classChip,
                                    active
                                      ? { backgroundColor: isDark ? 'rgba(16,185,129,0.16)' : 'rgba(5,150,105,0.12)', borderColor: isDark ? 'rgba(52,211,153,0.40)' : 'rgba(5,150,105,0.35)' }
                                      : { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F8FAFC', borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)' },
                                  ]}>
                                    <Text style={[ms.classChipText, {
                                      color: active ? (isDark ? '#34D399' : EM) : (isDark ? '#94A3B8' : '#64748B'),
                                      fontFamily: FONT,
                                      fontWeight: active ? '800' : '600',
                                    }]}>
                                      {section.label.replace('-', ' ')}
                                    </Text>
                                  </View>
                                </PressScale>
                              );
                            })}
                          </TourScrollView>
                          <View style={ms.classHeaderRow}>
                            <Text style={[ms.classLabel, { color: isDark ? '#CBD5E1' : '#475569', fontFamily: FONT }]}>
                              {classStudents.length} student{classStudents.length === 1 ? '' : 's'}
                              {selectedStudentIds.length > 0 ? ` · ${selectedStudentIds.length} selected` : ''}
                            </Text>
                            <View style={ms.classActions}>
                              <TouchableOpacity onPress={selectAllClassStudents} style={ms.classActionBtn}>
                                <Text style={[ms.classActionText, { color: isDark ? '#34D399' : EM, fontFamily: FONT }]}>All</Text>
                              </TouchableOpacity>
                              <TouchableOpacity onPress={clearClassSelection} style={ms.classActionBtn}>
                                <Text style={[ms.classActionText, { color: isDark ? '#94A3B8' : '#64748B', fontFamily: FONT }]}>Clear</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        </>
                      ) : null}

                      {loadingClass ? (
                        <View style={ms.classLoading}>
                          <LogoLoader size={32} color={isDark ? '#34D399' : EM} />
                          <Text style={[ms.classLoadingText, { color: isDark ? '#64748B' : '#94A3B8', fontFamily: FONT }]}>
                            {classSections.length === 0 ? 'Loading classes…' : 'Loading students…'}
                          </Text>
                        </View>
                      ) : classSections.length === 0 ? (
                        <View style={ms.classEmpty}>
                          <Ionicons name="school-outline" size={24} color={isDark ? '#334155' : '#CBD5E1'} />
                          <Text style={[ms.classEmptyText, { color: isDark ? '#64748B' : '#94A3B8', fontFamily: FONT }]}>
                            No classes assigned. Switch to One student and search instead.
                          </Text>
                        </View>
                      ) : classStudents.length === 0 ? (
                        <View style={ms.classEmpty}>
                          <Ionicons name="people-outline" size={24} color={isDark ? '#334155' : '#CBD5E1'} />
                          <Text style={[ms.classEmptyText, { color: isDark ? '#64748B' : '#94A3B8', fontFamily: FONT }]}>
                            No students found in this class.
                          </Text>
                        </View>
                      ) : (
                        <TourScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          nestedScrollEnabled
                          contentContainerStyle={ms.studentCardRow}
                          style={ms.studentCardScroll}
                        >
                          {classStudents.map((s) => {
                            const checked = selectedStudentIds.includes(s.id);
                            return (
                              <PressScale key={s.id} onPress={() => toggleStudentSelection(s)}>
                                <View style={[
                                  ms.studentCard,
                                  checked
                                    ? { backgroundColor: isDark ? 'rgba(16,185,129,0.14)' : 'rgba(5,150,105,0.08)', borderColor: isDark ? 'rgba(52,211,153,0.40)' : 'rgba(5,150,105,0.35)' }
                                    : { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F8FAFC', borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)' },
                                ]}>
                                  {checked ? (
                                    <View style={[ms.studentCardBadge, { backgroundColor: isDark ? '#34D399' : EM }]}>
                                      <Ionicons name="checkmark" size={11} color="#fff" />
                                    </View>
                                  ) : null}
                                  <StudentPhoto
                                    photoUrl={s.photo_url}
                                    displayName={s.display_name}
                                    size={40}
                                    borderRadius={12}
                                    style={[ms.studentCardAvatar, {
                                      backgroundColor: checked
                                        ? (isDark ? 'rgba(16,185,129,0.24)' : 'rgba(5,150,105,0.14)')
                                        : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(99,102,241,0.10)'),
                                    }]}
                                    fallbackTextStyle={[ms.studentCardInitial, {
                                      color: checked ? (isDark ? '#34D399' : EM) : (isDark ? '#CBD5E1' : '#6366F1'),
                                    }]}
                                  />
                                  <Text style={[ms.studentCardName, { color: isDark ? '#EEF2FF' : '#0F172A', fontFamily: FONT }]} numberOfLines={2}>
                                    {s.display_name}
                                  </Text>
                                  <Text style={[ms.studentCardAdm, { color: isDark ? '#64748B' : '#94A3B8', fontFamily: FONT }]}>
                                    #{s.admission_no}
                                  </Text>
                                </View>
                              </PressScale>
                            );
                          })}
                        </TourScrollView>
                      )}
                    </View>
                  )}
              </Animated.View>
            )}
            {wizardStep === 2 && (
              <Animated.View entering={FadeIn.duration(220)}>
                <StepHeader step={2} title="What happened?" subtitle="Pick a type or write your own" isDark={isDark} done={titleReady && descReady} />
                <TourScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 14 }}>
                  {INCIDENT_PRESETS.map((preset) => {
                    const active = selectedPreset === preset.key;
                    return (
                      <PressScale key={preset.key} onPress={() => applyPreset(preset)}>
                        <View style={[
                          ms.presetChip,
                          active
                            ? { backgroundColor: isDark ? 'rgba(16,185,129,0.16)' : 'rgba(5,150,105,0.12)', borderColor: isDark ? 'rgba(52,211,153,0.40)' : 'rgba(5,150,105,0.35)' }
                            : { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#fff', borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)' },
                        ]}>
                          <Ionicons name={preset.icon} size={14} color={active ? (isDark ? '#34D399' : EM) : (isDark ? '#64748B' : '#94A3B8')} />
                          <Text style={[ms.presetText, { color: active ? (isDark ? '#34D399' : EM) : (isDark ? '#CBD5E1' : '#475569'), fontFamily: FONT }]}>{preset.label}</Text>
                        </View>
                      </PressScale>
                    );
                  })}
                </TourScrollView>
                <FormField
                  label="Incident title"
                  required
                  isDark={isDark}
                  icon="title"
                  placeholder="e.g. Disruptive behaviour in Class 10A"
                  value={title}
                  onChangeText={setTitle}
                  error={attemptedSubmit && !titleReady ? 'Title is required' : undefined}
                />
                <FormField
                  label="Description"
                  required
                  hint="Time, place, and context help admins act"
                  isDark={isDark}
                  icon="notes"
                  multiline
                  placeholder="What happened, when, and any context…"
                  value={desc}
                  onChangeText={setDesc}
                  error={attemptedSubmit && !descReady ? 'Description is required' : undefined}
                />
              </Animated.View>
            )}
            {wizardStep === 3 && (
              <Animated.View entering={FadeIn.duration(220)}>
                <StepHeader step={3} title="Review & submit" subtitle="Confirm severity and details" isDark={isDark} done />
                <View style={[ms.reviewCard, clayCard(isDark, 'sm') as any]}>
                  <Text style={[ms.reviewLabel, { color: isDark ? '#64748B' : '#94A3B8', fontFamily: FONT }]}>Student(s)</Text>
                  <Text style={[ms.reviewValue, { color: isDark ? '#EEF2FF' : '#0F172A', fontFamily: FONT }]}>
                    {studentMode === 'single'
                      ? selectedStudent?.display_name
                      : `${selectedStudentIds.length} selected`}
                  </Text>
                  <Text style={[ms.reviewLabel, { color: isDark ? '#64748B' : '#94A3B8', fontFamily: FONT, marginTop: 10 }]}>Incident</Text>
                  <Text style={[ms.reviewValue, { color: isDark ? '#EEF2FF' : '#0F172A', fontFamily: FONT }]}>{title}</Text>
                  <Text style={[ms.reviewBody, { color: isDark ? '#94A3B8' : '#64748B', fontFamily: FONT }]} numberOfLines={4}>{desc}</Text>
                </View>
                <Text style={[ms.fieldLabel, { color: isDark ? '#CBD5E1' : '#334155', fontFamily: FONT, marginTop: 4 }]}>Severity</Text>
                <View style={[ms.severityRow, { marginTop: 8 }]}>
                  {SEVERITY_CFG.map((lvl) => {
                    const isActive = severity === lvl.key;
                    return (
                      <PressScale key={lvl.key} onPress={() => setSeverity(lvl.key)} style={{ flex: 1 }}>
                        <View style={[ms.severityChip, {
                          backgroundColor: isActive ? lvl.activeBg : (isDark ? 'rgba(255,255,255,0.03)' : '#F8FAFC'),
                          borderColor: isActive ? lvl.color + '55' : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)'),
                        }]}>
                          <View style={[ms.sevDot, { backgroundColor: lvl.color, opacity: isActive ? 1 : 0.35 }]} />
                          <Text style={[ms.sevText, {
                            color: isActive ? lvl.color : (isDark ? '#94A3B8' : '#64748B'),
                            fontFamily: FONT, fontWeight: isActive ? '700' : '600',
                          }]}>
                            {lvl.key}
                          </Text>
                        </View>
                      </PressScale>
                    );
                  })}
                </View>
              </Animated.View>
            )}
          </KeyboardAwareScreen>

          <View style={[wz.footer, { borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)', backgroundColor: isDark ? '#0A1210' : '#F8FAFC' }]}>
            {wizardStep < 3 ? (
              <PressScale onPress={goWizardNext} style={{ flex: 1 }}>
                <LinearGradient colors={[EM, EM_SOFT]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={ms.submitGrad}>
                  <Text style={[ms.submitText, { fontFamily: FONT }]}>Continue</Text>
                  <Ionicons name="arrow-forward" size={16} color="#fff" />
                </LinearGradient>
              </PressScale>
            ) : (
              <AnimatedPressable
                disabled={submitting}
                onPressIn={() => { submitScale.value = withSpring(0.97, { damping: 16, stiffness: 280 }); }}
                onPressOut={() => { submitScale.value = withSpring(1, { damping: 14, stiffness: 220 }); }}
                onPress={handleSubmit}
                style={[submitAnim, { flex: 1, opacity: submitting ? 0.7 : 1 }]}
              >
                <LinearGradient colors={[EM, EM_SOFT]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={ms.submitGrad}>
                  {submitting ? <LogoLoader color="#fff" /> : (
                    <>
                      <Ionicons name="send" size={15} color="#fff" />
                      <Text style={[ms.submitText, { fontFamily: FONT }]}>
                        {studentMode === 'multiple' && selectedStudentIds.length > 1
                          ? `Submit to ${selectedStudentIds.length} students`
                          : 'Submit report'}
                      </Text>
                    </>
                  )}
                </LinearGradient>
              </AnimatedPressable>
            )}
          </View>
        </View>
      </Modal>

      <DetailSheet
        item={detailItem}
        visible={!!detailItem}
        onClose={() => setDetailItem(null)}
        isDark={isDark}
      />
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────
const ms = StyleSheet.create({
  scroll: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 30 },
  scrollDesktop: { paddingHorizontal: 32, paddingTop: 24 },
  contentShell: { width: '100%', maxWidth: 1440, alignSelf: 'center' },

  pageHeader: { marginBottom: 14 },
  pageHeaderDesktop: {
    minHeight: 126,
    marginBottom: 18,
    paddingHorizontal: 26,
    paddingVertical: 22,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 24,
    overflow: 'hidden',
  },
  heroLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroBadge: {
    width: 40, height: 40, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  heroBadgeDesktop: { width: 58, height: 58, borderRadius: 19 },
  heroEyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.4, marginBottom: 5 },
  pageTitle: { fontSize: 22, fontWeight: '800', letterSpacing: -0.6 },
  pageTitleDesktop: { fontSize: 30, letterSpacing: -1 },
  pageSub: { fontSize: 13, fontWeight: '500', marginTop: 2, lineHeight: 18 },
  pageSubDesktop: { fontSize: 14, lineHeight: 21, maxWidth: 660, marginTop: 5 },
  heroCta: {
    minWidth: 278,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: 18,
  },
  heroCtaTitle: { color: '#fff', fontSize: 15, fontWeight: '800' },
  heroCtaSub: { color: 'rgba(255,255,255,0.76)', fontSize: 11, fontWeight: '500', marginTop: 2 },

  statRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  statRowDesktop: { gap: 14, marginBottom: 18 },
  statChipBtn: {
    alignItems: 'center', justifyContent: 'center', gap: 2,
    paddingVertical: 10, paddingHorizontal: 6, borderRadius: 14, borderWidth: 1, borderColor: 'transparent',
  },
  statChipDesktop: {
    minHeight: 92,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 13,
    paddingVertical: 15,
    paddingHorizontal: 18,
    borderRadius: 18,
  },
  statIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  statCopy: { flex: 1, minWidth: 0 },
  statNumber: { fontSize: 18, fontWeight: '800', letterSpacing: -0.5 },
  statNumberDesktop: { fontSize: 24, lineHeight: 26 },
  statLabel: { fontSize: 10, fontWeight: '600' },
  statLabelDesktop: { fontSize: 13, fontWeight: '800', marginTop: 1 },
  statHint: { fontSize: 10, fontWeight: '500', marginTop: 2 },

  controlsPanel: { padding: 14, borderRadius: 20, marginBottom: 22 },
  controlsRow: {},
  controlsRowDesktop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: Platform.OS === 'web' ? 10 : 12,
    borderRadius: 16, marginBottom: 14,
  },
  searchWrapDesktop: { flex: 1, minWidth: 320, marginBottom: 0, minHeight: 48 },
  searchInput: { flex: 1, fontSize: 14, fontWeight: '500', outlineStyle: 'none' as any, padding: 0 },
  searchClear: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  filterScroller: { marginBottom: 14 },
  filterScrollerDesktop: { flexGrow: 0, marginBottom: 0 },
  filterContent: { gap: 8, paddingHorizontal: 2 },

  sectionLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },

  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 9, borderRadius: 14, borderWidth: 1,
  },
  filterText: { fontSize: 12, letterSpacing: -0.1 },
  filterCount: { minWidth: 20, height: 20, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  filterCountText: { fontSize: 10, fontWeight: '800' },
  reportsHeader: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  reportsTitle: { fontSize: 18, fontWeight: '800', letterSpacing: -0.4 },
  reportsMeta: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  resetButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 11 },
  resetText: { fontSize: 11, fontWeight: '700' },
  reportGrid: { width: '100%' },
  reportGridWide: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16 },

  emptyState: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24, gap: 10, borderRadius: 24 },
  emptyIcon: { width: 64, height: 64, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  emptyTitle: { fontSize: 16, fontWeight: '800', letterSpacing: -0.3 },
  emptyText: { fontSize: 13, fontWeight: '500', textAlign: 'center', lineHeight: 19, maxWidth: 260 },
  emptyCta: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 18, paddingVertical: 12, borderRadius: 14, marginTop: 8,
  },
  emptyCtaText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  formCard: { borderRadius: 22, overflow: 'hidden' },
  formInner: { padding: 16 },

  progressRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, paddingHorizontal: 2 },
  progressItem: { alignItems: 'center', gap: 4, minWidth: 56 },
  progressDot: { width: 22, height: 22, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  progressNum: { fontSize: 11, fontWeight: '800' },
  progressLabel: { fontSize: 11, fontWeight: '700' },
  progressLine: { flex: 1, height: 2, borderRadius: 1, marginHorizontal: 4, marginBottom: 14 },

  stepBlock: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  stepBlockLast: { marginBottom: 16 },

  modeGrid: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  modeCard: {
    borderRadius: 14, borderWidth: 1.5, paddingVertical: 12, paddingHorizontal: 10,
    alignItems: 'flex-start', minHeight: 88,
  },
  modeIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  modeTitle: { fontSize: 13, fontWeight: '800', letterSpacing: -0.2, marginBottom: 2 },
  modeDesc: { fontSize: 11, fontWeight: '500', lineHeight: 15 },

  inlineError: { color: '#EF4444', fontSize: 12, fontWeight: '600', marginBottom: 8 },
  helperMuted: { fontSize: 12, fontWeight: '500', marginTop: -6, marginBottom: 4 },
  fieldLabel: { fontSize: 13, fontWeight: '700', letterSpacing: -0.15, marginBottom: 7 },

  classHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, marginTop: 4 },
  classChipRow: { flexDirection: 'row', gap: 8, paddingRight: 4, paddingBottom: 8 },
  classChip: { paddingVertical: 9, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5 },
  classChipText: { fontSize: 13 },
  classLabel: { fontSize: 12, fontWeight: '700' },
  classActions: { flexDirection: 'row', gap: 10 },
  classActionBtn: { paddingVertical: 4, paddingHorizontal: 2 },
  classActionText: { fontSize: 12, fontWeight: '700' },
  classLoading: { alignItems: 'center', paddingVertical: 18, gap: 8 },
  classLoadingText: { fontSize: 13, fontWeight: '500' },
  classEmpty: { alignItems: 'center', paddingVertical: 18, gap: 8 },
  classEmptyText: { fontSize: 13, fontWeight: '500', textAlign: 'center', lineHeight: 19 },
  studentCardScroll: { marginTop: 2, marginHorizontal: -2 },
  studentCardRow: { gap: 10, paddingHorizontal: 2, paddingVertical: 6, paddingRight: 8 },
  studentCard: {
    width: 108, minHeight: 126, paddingVertical: 12, paddingHorizontal: 10,
    borderRadius: 14, alignItems: 'center', position: 'relative', borderWidth: 1.5,
  },
  studentCardBadge: {
    position: 'absolute', top: 6, right: 6, width: 18, height: 18,
    borderRadius: 9, alignItems: 'center', justifyContent: 'center',
  },
  studentCardAvatar: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },
  studentCardInitial: { fontSize: 16, fontWeight: '800' },
  studentCardName: { fontSize: 11, fontWeight: '700', textAlign: 'center', lineHeight: 15, minHeight: 30 },
  studentCardAdm: { fontSize: 10, fontWeight: '600', marginTop: 2 },

  selectedChip: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, borderWidth: 1.5 },
  selectedAvatar: { width: 36, height: 36, borderRadius: 11, justifyContent: 'center', alignItems: 'center' },
  selectedInitial: { fontSize: 14, fontWeight: '800' },
  selectedName: { fontSize: 14, fontWeight: '700', letterSpacing: -0.2 },
  selectedAdm: { fontSize: 12, fontWeight: '500', marginTop: 1 },
  clearBtn: { width: 28, height: 28, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },

  suggestBox: { marginTop: -6, marginBottom: 8, borderRadius: 14, overflow: 'hidden' },
  suggestItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 11 },
  suggestAvatar: { width: 30, height: 30, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
  suggestName: { fontSize: 13, fontWeight: '600', letterSpacing: -0.2 },
  suggestAdm: { fontSize: 11, fontWeight: '500', marginTop: 1 },

  severityRow: { flexDirection: 'row', gap: 8 },
  severityChip: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, minHeight: 44,
  },
  sevDot: { width: 7, height: 7, borderRadius: 4 },
  sevText: { fontSize: 13, letterSpacing: -0.1 },

  submitGrad: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 15, borderRadius: 14, overflow: 'hidden', position: 'relative',
  },
  submitShine: { position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.28)' },
  submitText: { color: '#fff', fontSize: 15, fontWeight: '700', letterSpacing: -0.2 },

  fabWrap: {
    position: 'absolute', right: 18, bottom: 24,
    ...Platform.select({
      ios: { shadowColor: EM, shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } },
      android: { elevation: 6 },
      default: {},
    }),
  },
  fab: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 14, paddingHorizontal: 18, borderRadius: 16, overflow: 'hidden',
  },
  fabText: { color: '#fff', fontSize: 14, fontWeight: '700', letterSpacing: -0.2 },

  presetChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, borderWidth: 1.5,
  },
  presetText: { fontSize: 12, fontWeight: '700' },
  reviewCard: { padding: 14, borderRadius: 16, marginBottom: 12 },
  reviewLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  reviewValue: { fontSize: 15, fontWeight: '700', marginTop: 4, letterSpacing: -0.2 },
  reviewBody: { fontSize: 13, fontWeight: '500', marginTop: 6, lineHeight: 19 },
});

const wz = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '800', letterSpacing: -0.3 },
  headerStep: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  footer: {
    flexDirection: 'row', paddingHorizontal: 18, paddingVertical: 14, paddingBottom: Platform.OS === 'ios' ? 22 : 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
