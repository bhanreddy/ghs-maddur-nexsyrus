import { TourTarget, TourScrollView } from '@/src/features/app-tour';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import AppTextInput from '@/src/components/AppTextInput';
import PremiumButton from '@/src/components/PremiumButton';
import { clayInset } from '@/src/theme/clayStyles';

import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Pressable,
  StatusBar, Modal, Platform, ScrollView, ActivityIndicator,
  useWindowDimensions, Animated as RNAnimated,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import { promptAppReviewAfterSuccess } from '../../src/utils/openPlayStore';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import AdminHeader from '../../src/components/AdminHeader';
import Animated, {
  FadeIn, FadeInDown, FadeInUp, ZoomIn,
  useSharedValue, useAnimatedStyle, withSpring, Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { ComplaintService, Complaint } from '../../src/services/commonServices';
import { useTheme } from '../../src/hooks/useTheme';
import { Theme } from '../../src/theme/themes';
import LogoLoader from '../../src/components/LogoLoader';
import { StudentService } from '../../src/services/studentService';
import { ClassService, ClassSection } from '../../src/services/classService';
import { Student } from '../../src/types/models';
import { StudentWithDetails } from '../../src/types/schema';
import { useTranslation } from 'react-i18next';
import { t_field } from '../../src/utils/lang';
import StudentPhoto from '../../src/components/StudentPhoto';

// ─────────────────────────────────────────────────────────────────────────────
// DESIGN TOKENS — Mode A clay · rose support accent (matches admin complaints brand)
// ─────────────────────────────────────────────────────────────────────────────
const ROSE = '#F43F5E';
const ROSE_DEEP = '#E11D48';
const ROSE_SOFT = '#FFF1F2';
const ROSE_MID = '#FFE4E6';
const ROSE_EDGE = '#FDA4AF';
const CLAY_BG = '#F4F6FB';
const INK_MUTED = '#64748B';

const CATEGORY_CFG: Record<string, { color: string; bg: string; icon: keyof typeof Ionicons.glyphMap; label: string }> = {
  disciplinary: { color: '#EF4444', bg: 'rgba(239,68,68,0.10)', icon: 'warning-outline', label: 'Disciplinary' },
  facility: { color: '#3B82F6', bg: 'rgba(59,130,246,0.10)', icon: 'business-outline', label: 'Facility' },
  academic: { color: '#8B5CF6', bg: 'rgba(139,92,246,0.10)', icon: 'school-outline', label: 'Academic' },
  general: { color: '#64748B', bg: 'rgba(100,116,139,0.10)', icon: 'chatbubble-ellipses-outline', label: 'General' },
};

const PRIORITY_CFG: Record<string, { color: string; bg: string; border: string }> = {
  high: { color: '#EF4444', bg: 'rgba(239,68,68,0.10)', border: 'rgba(239,68,68,0.22)' },
  medium: { color: '#F59E0B', bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.22)' },
  low: { color: '#3B82F6', bg: 'rgba(59,130,246,0.10)', border: 'rgba(59,130,246,0.22)' },
};

const STATUS_CFG: Record<string, { color: string; bg: string; border: string; icon: keyof typeof MaterialIcons.glyphMap }> = {
  open: { color: '#F59E0B', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.25)', icon: 'hourglass-empty' },
  pending: { color: '#F59E0B', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.25)', icon: 'hourglass-empty' },
  'in progress': { color: '#3B82F6', bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.25)', icon: 'autorenew' },
  resolved: { color: '#10B981', bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.25)', icon: 'check-circle' },
  closed: { color: '#64748B', bg: 'rgba(100,116,139,0.12)', border: 'rgba(100,116,139,0.22)', icon: 'lock' },
  escalated: { color: '#EF4444', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.25)', icon: 'arrow-upward' },
};

type FilterKey = 'ALL' | 'OPEN' | 'IN PROGRESS' | 'CLOSED';

const FILTER_TABS: { key: FilterKey; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'ALL', label: 'All', icon: 'grid-outline' },
  { key: 'OPEN', label: 'Open', icon: 'ellipse-outline' },
  { key: 'IN PROGRESS', label: 'Active', icon: 'sync-outline' },
  { key: 'CLOSED', label: 'Closed', icon: 'checkmark-done-outline' },
];

interface PickStudent {
  id: string;
  display_name: string;
  admission_no: string;
  photo_url?: string | null;
}

const EMPTY_COMPLAINT = {
  title: '',
  description: '',
  category: 'Facility',
  priority: 'medium',
  raised_for_student_id: '',
};

const AnimatedTouch = Animated.createAnimatedComponent(TouchableOpacity);

/** Press scale — transform only, UI-thread spring */
function PressScale({
  onPress, children, disabled, style,
}: {
  onPress?: () => void; children: React.ReactNode; disabled?: boolean; style?: any;
}) {
  const scale = useSharedValue(1);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => { if (!disabled) scale.value = withSpring(0.96, { damping: 18, stiffness: 320 }); }}
      onPressOut={() => { scale.value = withSpring(1, { damping: 14, stiffness: 220 }); }}
    >
      <Animated.View style={[style, aStyle]}>{children}</Animated.View>
    </Pressable>
  );
}

function normalizeStatus(status?: string) {
  return (status || 'open').toLowerCase().trim().replace(/_/g, ' ');
}

function matchesFilter(status: string | undefined, filter: FilterKey) {
  if (filter === 'ALL') return true;
  const s = normalizeStatus(status);
  if (filter === 'OPEN') return s === 'open' || s === 'pending';
  if (filter === 'IN PROGRESS') return s === 'in progress';
  if (filter === 'CLOSED') return s === 'closed' || s === 'resolved';
  return true;
}

function formatTimeAgo(dateString: string) {
  if (!dateString) return '—';
  const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(dateString).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

type ComplaintCardProps = {
  item: Complaint;
  index: number;
  styles: Record<string, any>;
  isDark: boolean;
  resolvingId: string | null;
  onResolve: (id: string) => void;
  onAssign: () => void;
};

const ComplaintCard = React.memo(function ComplaintCard({
  item, index, styles, isDark, resolvingId, onResolve, onAssign,
}: ComplaintCardProps) {
  const catKey = (item.category || 'general').toLowerCase();
  const cat = CATEGORY_CFG[catKey] || CATEGORY_CFG.general;
  const pri = PRIORITY_CFG[(item.priority || 'medium').toLowerCase()] || PRIORITY_CFG.medium;
  const stat = STATUS_CFG[normalizeStatus(item.status)] || STATUS_CFG.open;
  const isHigh = (item.priority || '').toLowerCase() === 'high';
  const isResolved = ['resolved', 'closed'].includes(normalizeStatus(item.status));
  const ticket = item.ticket_no || item.id?.substring(0, 8) || '—';
  const title = t_field(item.title, item.title_te) || 'Untitled';
  const description = t_field(item.description, item.description_te) || '';
  const showDesc = !!description.trim() && description.trim().toLowerCase() !== title.trim().toLowerCase();
  const studentName = item.student_name?.trim() || null;
  const studentAdm = item.student_admission_no ? `#${item.student_admission_no}` : null;
  const reporter = item.raised_by_name || item.raised_by || 'Anonymous';
  const scale = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 50).duration(320).easing(Easing.out(Easing.cubic))}>
      <AnimatedTouch
        activeOpacity={1}
        onPressIn={() => { scale.value = withSpring(0.98, { damping: 18, stiffness: 260 }); }}
        onPressOut={() => { scale.value = withSpring(1, { damping: 16, stiffness: 220 }); }}
        style={pressStyle}
      >
        <View style={[styles.card, isHigh && styles.cardUrgent]}>
          <LinearGradient
            colors={['rgba(255,255,255,0.55)', 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0.7, y: 1 }}
            style={[StyleSheet.absoluteFill, { borderRadius: 22 }]}
            pointerEvents="none"
          />
          <View style={[styles.cardStripe, { backgroundColor: cat.color }]} />
          <View style={styles.cardInner}>
            {/* Student — primary identity */}
            <View style={styles.studentRow}>
              <StudentPhoto
                photoUrl={item.student_photo_url}
                displayName={studentName || title}
                size={48}
                borderRadius={15}
                style={[styles.studentAvatar, { backgroundColor: cat.bg }]}
                fallbackTextStyle={[styles.studentAvatarFallback, { color: cat.color }]}
              />
              <View style={styles.studentMain}>
                <Text style={styles.studentEyebrow}>Student</Text>
                <View style={styles.studentTitleRow}>
                  <Text style={styles.studentName} numberOfLines={1}>
                    {studentName || 'Student not linked'}
                  </Text>
                  <View style={[styles.priorityBadge, { backgroundColor: pri.bg, borderColor: pri.border }]}>
                    <Text style={[styles.priorityText, { color: pri.color }]}>
                      {(item.priority || 'medium').toUpperCase()}
                    </Text>
                  </View>
                </View>
                <View style={styles.studentMetaRow}>
                  {studentAdm ? (
                    <Text style={styles.studentAdm} numberOfLines={1}>{studentAdm}</Text>
                  ) : null}
                  <Text style={styles.ticketInline} numberOfLines={1}>#{ticket}</Text>
                </View>
              </View>
            </View>

            {/* Issue */}
            <View style={styles.issueBlock}>
              <Text style={styles.issueEyebrow}>Issue</Text>
              <Text style={styles.cardTitle} numberOfLines={2}>{title}</Text>
              {showDesc ? (
                <Text style={styles.cardDesc} numberOfLines={2}>{description}</Text>
              ) : null}
            </View>

            <View style={styles.metaRow}>
              <View style={[styles.catPill, { backgroundColor: cat.bg }]}>
                <Ionicons name={cat.icon} size={11} color={cat.color} />
                <Text style={[styles.catPillText, { color: cat.color }]}>{cat.label}</Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: stat.bg, borderColor: stat.border }]}>
                <MaterialIcons name={stat.icon} size={11} color={stat.color} />
                <Text style={[styles.statusText, { color: stat.color }]}>
                  {(item.status || 'open').toUpperCase()}
                </Text>
              </View>
            </View>

            <View style={styles.cardFooter}>
              <View style={styles.metaInfo}>
                <View style={styles.avatarMini}>
                  <Ionicons name="person" size={10} color={ROSE} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.metaLabel}>Reported by</Text>
                  <Text style={styles.fromText} numberOfLines={1}>{reporter}</Text>
                </View>
              </View>
              <View style={styles.timeRow}>
                <Ionicons name="time-outline" size={13} color={isDark ? '#94A3B8' : '#64748B'} />
                <Text style={styles.dateText}>{formatTimeAgo(item.created_at)}</Text>
              </View>
            </View>

            {!isResolved && (
              <View style={styles.actionRow}>
                <PressScale
                  onPress={() => onResolve(item.id)}
                  disabled={resolvingId === item.id}
                  style={styles.resolveBtn}
                >
                  {resolvingId === item.id ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle" size={15} color="#fff" />
                      <Text style={styles.resolveBtnText}>Resolve</Text>
                    </>
                  )}
                </PressScale>
                <PressScale onPress={onAssign} style={styles.assignBtn}>
                  <Ionicons name="person-add-outline" size={14} color={ROSE_DEEP} />
                  <Text style={styles.assignBtnText}>Assign</Text>
                </PressScale>
              </View>
            )}
          </View>
        </View>
      </AnimatedTouch>
    </Animated.View>
  );
});

export default function AdminComplaints() {
  useTranslation();
  const { theme, isDark } = useTheme();
  const styles = useMemo(() => getStyles(theme, isDark), [theme, isDark]);
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const isWide = winW >= 720;

  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<FilterKey>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const [modalVisible, setModalVisible] = useState(false);
  const [newComplaint, setNewComplaint] = useState({ ...EMPTY_COMPLAINT });
  const [studentMode, setStudentMode] = useState<'single' | 'multiple'>('single');
  const [studentSearch, setStudentSearch] = useState('');
  const [selectedStudentPhotoUrl, setSelectedStudentPhotoUrl] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<Student[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [classSections, setClassSections] = useState<ClassSection[]>([]);
  const [selectedClassSectionId, setSelectedClassSectionId] = useState<string | null>(null);
  const [classStudents, setClassStudents] = useState<PickStudent[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [loadingClasses, setLoadingClasses] = useState(false);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [titleFocused, setTitleFocused] = useState(false);
  const [bodyFocused, setBodyFocused] = useState(false);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);

  const fabScale = useRef(new RNAnimated.Value(1)).current;
  const onFabIn = () => RNAnimated.spring(fabScale, { toValue: 0.92, useNativeDriver: true, friction: 6 }).start();
  const onFabOut = () => RNAnimated.spring(fabScale, { toValue: 1, useNativeDriver: true, friction: 5 }).start();

  useEffect(() => { fetchComplaints(); }, []);

  useEffect(() => {
    if (!modalVisible) return;
    loadAllClasses();
  }, [modalVisible]);

  useEffect(() => {
    if (!modalVisible || studentMode !== 'multiple' || !selectedClassSectionId) return;
    loadClassStudents(selectedClassSectionId);
  }, [modalVisible, studentMode, selectedClassSectionId, classSections]);

  const resetStudentPicker = useCallback(() => {
    setStudentMode('single');
    setStudentSearch('');
    setSelectedStudentPhotoUrl(null);
    setSearchResults([]);
    setClassSections([]);
    setSelectedClassSectionId(null);
    setClassStudents([]);
    setSelectedStudentIds([]);
    setNewComplaint((prev) => ({ ...prev, raised_for_student_id: '' }));
  }, []);

  const closeModal = useCallback(() => {
    setModalVisible(false);
    setNewComplaint({ ...EMPTY_COMPLAINT });
    setAttemptedSubmit(false);
    setTitleFocused(false);
    setBodyFocused(false);
    resetStudentPicker();
  }, [resetStudentPicker]);

  const loadAllClasses = async () => {
    setLoadingClasses(true);
    let loadedSections: ClassSection[] = [];
    try {
      const year = await ClassService.getCurrentAcademicYear();
      const sections = await ClassService.getClassSections(year?.id);
      loadedSections = [...sections].sort((a, b) =>
        `${a.class_name}-${a.section_name}`.localeCompare(`${b.class_name}-${b.section_name}`)
      );
      setClassSections(loadedSections);
      setSelectedClassSectionId((prev) =>
        prev && loadedSections.some((section) => section.id === prev)
          ? prev
          : loadedSections[0]?.id ?? null
      );
    } catch {
      loadedSections = [];
      setClassSections([]);
      setSelectedClassSectionId(null);
    } finally {
      if (loadedSections.length === 0) setLoadingClasses(false);
    }
  };

  const loadClassStudents = async (classSectionId: string) => {
    const section = classSections.find((item) => item.id === classSectionId);
    if (!section) return;
    setLoadingStudents(true);
    setSelectedStudentIds([]);
    try {
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
    } catch {
      setClassStudents([]);
    } finally {
      setLoadingStudents(false);
      setLoadingClasses(false);
    }
  };

  const switchStudentMode = (mode: 'single' | 'multiple') => {
    setStudentMode(mode);
    setStudentSearch('');
    setSelectedStudentPhotoUrl(null);
    setSearchResults([]);
    setSelectedStudentIds([]);
    setClassStudents([]);
    setNewComplaint((prev) => ({ ...prev, raised_for_student_id: '' }));
    if (mode === 'multiple' && classSections.length > 0 && !selectedClassSectionId) {
      setSelectedClassSectionId(classSections[0].id);
    }
  };

  const toggleStudentSelection = (student: PickStudent) => {
    setSelectedStudentIds((prev) =>
      prev.includes(student.id) ? prev.filter((id) => id !== student.id) : [...prev, student.id]
    );
  };

  const fetchComplaints = async () => {
    try {
      setLoading(true);
      const data = await ComplaintService.getAll();
      setComplaints(data);
    } catch {
      alertCompat('Error', 'Failed to load complaints');
    } finally {
      setLoading(false);
    }
  };

  const titleOk = newComplaint.title.trim().length > 0;
  const bodyOk = newComplaint.description.trim().length > 0;
  const studentOk = studentMode === 'single'
    ? !!newComplaint.raised_for_student_id
    : selectedStudentIds.length > 0;
  const canSubmit = titleOk && bodyOk && studentOk;

  const handleCreateComplaint = async () => {
    setAttemptedSubmit(true);
    if (!titleOk || !bodyOk) {
      alertCompat('Almost there', 'Add a title and description before filing.');
      return;
    }
    if (studentMode === 'single' && !newComplaint.raised_for_student_id) {
      alertCompat('Pick a student', 'Search and select who this complaint is for.');
      return;
    }
    if (studentMode === 'multiple' && selectedStudentIds.length === 0) {
      alertCompat('Pick students', 'Select at least one student from the class.');
      return;
    }
    try {
      setIsSubmitting(true);
      if (studentMode === 'multiple') {
        const result = await ComplaintService.createBulk({
          title: newComplaint.title.trim(),
          description: newComplaint.description.trim(),
          category: newComplaint.category.toLowerCase(),
          priority: newComplaint.priority.toLowerCase(),
          raised_for_student_ids: selectedStudentIds,
        });
        closeModal();
        fetchComplaints();
        promptAppReviewAfterSuccess(
          'Filed',
          `Complaint created for ${result.count} student(s). Thanks for keeping parents informed.`,
        );
      } else {
        await ComplaintService.create({
          title: newComplaint.title.trim(),
          description: newComplaint.description.trim(),
          category: newComplaint.category.toLowerCase(),
          priority: newComplaint.priority.toLowerCase(),
          raised_for_student_id: newComplaint.raised_for_student_id,
        });
        closeModal();
        fetchComplaints();
        alertCompat('Filed', 'Complaint created successfully.');
      }
    } catch {
      alertCompat('Error', 'Failed to create complaint');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStudentSearch = async (text: string) => {
    setStudentSearch(text);
    if (text.length > 2) {
      setIsSearching(true);
      try {
        setSearchResults(await StudentService.search(text));
      } catch (error) {
        console.error(error);
      } finally {
        setIsSearching(false);
      }
    } else {
      setSearchResults([]);
      setNewComplaint((prev) => ({ ...prev, raised_for_student_id: '' }));
      setSelectedStudentPhotoUrl(null);
    }
  };

  const handleResolve = useCallback(async (id: string) => {
    try {
      setResolvingId(id);
      await ComplaintService.update(id, { status: 'resolved' });
      alertCompat('Resolved', 'Complaint marked as resolved.');
      fetchComplaints();
    } catch {
      alertCompat('Error', 'Failed to resolve complaint');
    } finally {
      setResolvingId(null);
    }
  }, []);

  const handleAssign = useCallback(() => {
    alertCompat('Assign', 'Assignment functionality coming soon.');
  }, []);

  const counts = useMemo(() => {
    const open = complaints.filter((c) => matchesFilter(c.status, 'OPEN')).length;
    const active = complaints.filter((c) => matchesFilter(c.status, 'IN PROGRESS')).length;
    const closed = complaints.filter((c) => matchesFilter(c.status, 'CLOSED')).length;
    const high = complaints.filter((c) => (c.priority || '').toLowerCase() === 'high').length;
    return { open, active, closed, high, total: complaints.length };
  }, [complaints]);

  const filteredData = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return complaints.filter((item) => {
      if (!matchesFilter(item.status, filterType)) return false;
      if (!q) return true;
      const title = (t_field(item.title, item.title_te) || '').toLowerCase();
      const desc = (item.description || '').toLowerCase();
      const ticket = (item.ticket_no || item.id || '').toLowerCase();
      const by = (item.raised_by_name || item.raised_by || '').toLowerCase();
      const student = (item.student_name || '').toLowerCase();
      const adm = (item.student_admission_no || '').toLowerCase();
      return (
        title.includes(q) ||
        desc.includes(q) ||
        ticket.includes(q) ||
        by.includes(q) ||
        student.includes(q) ||
        adm.includes(q)
      );
    });
  }, [complaints, filterType, searchQuery]);

  const renderItem = useCallback(({ item, index }: { item: Complaint; index: number }) => (
    <ComplaintCard
      item={item}
      index={index}
      styles={styles}
      isDark={isDark}
      resolvingId={resolvingId}
      onResolve={handleResolve}
      onAssign={handleAssign}
    />
  ), [styles, isDark, resolvingId, handleResolve, handleAssign]);

  const sheetSubtitle = studentMode === 'multiple'
    ? `${selectedStudentIds.length || 0} student(s) · ${newComplaint.priority} priority`
    : newComplaint.raised_for_student_id
      ? `1 student · ${newComplaint.priority} priority`
      : 'Pick who this is for';

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.colors.background} />
      <TourTarget id="screen.admin-complaints.overview"><AdminHeader title="Complaints Box" showBackButton={true} /></TourTarget>

      {/* Search */}
      <TourTarget id="screen.admin-complaints.workspace" native><View style={[styles.searchContainer, searchFocused && styles.searchFocused]}>
        <Ionicons
          name="search-outline"
          size={17}
          color={searchFocused ? ROSE : '#94A3B8'}
          style={styles.searchIcon}
        />
        <AppTextInput
          style={styles.searchInput}
          placeholder="Search students, tickets, titles…"
          placeholderTextColor="#94A3B8"
          value={searchQuery}
          onChangeText={setSearchQuery}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearBtn} hitSlop={8}>
            <Ionicons name="close" size={12} color="#fff" />
          </TouchableOpacity>
        )}
      </View></TourTarget>

      {/* Status overview — also acts as filters */}
      {!loading && complaints.length > 0 && (
        <Animated.View entering={FadeInDown.duration(340)} style={styles.statsStrip}>
          {([
            { key: 'ALL' as FilterKey, label: 'Total', value: counts.total, color: theme.colors.textStrong },
            { key: 'OPEN' as FilterKey, label: 'Open', value: counts.open, color: '#D97706' },
            { key: 'IN PROGRESS' as FilterKey, label: 'Active', value: counts.active, color: '#2563EB' },
            { key: 'CLOSED' as FilterKey, label: 'Closed', value: counts.closed, color: '#059669' },
          ]).map((stat, i) => {
            const active = filterType === stat.key;
            return (
              <React.Fragment key={stat.key}>
                {i > 0 ? <View style={styles.statDivider} /> : null}
                <Pressable
                  onPress={() => setFilterType(stat.key)}
                  style={[styles.statChip, active && styles.statChipActive]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`Filter ${stat.label}`}
                >
                  <Text style={[styles.statNumber, { color: active ? ROSE_DEEP : stat.color }]}>
                    {stat.value}
                  </Text>
                  <Text style={[styles.statLabel, active && styles.statLabelActive]}>{stat.label}</Text>
                  {stat.key === 'OPEN' && counts.high > 0 ? (
                    <Text style={styles.statHint}>{counts.high} urgent</Text>
                  ) : null}
                </Pressable>
              </React.Fragment>
            );
          })}
        </Animated.View>
      )}

      {loading ? (
        <View style={styles.centerContainer}>
          <LogoLoader size={56} color={ROSE} />
          <Text style={styles.loadingText}>Loading complaints…</Text>
        </View>
      ) : (
        <FlatList
          data={filteredData}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshing={loading}
          onRefresh={fetchComplaints}
          windowSize={7}
          maxToRenderPerBatch={8}
          initialNumToRender={8}
          removeClippedSubviews={Platform.OS === 'android'}
          ListHeaderComponent={
            filteredData.length > 0 ? (
              <Text style={styles.listHeader}>
                {filterType === 'ALL' ? 'Recent reports' : FILTER_TABS.find((t) => t.key === filterType)?.label}
                {' '}
                <Text style={styles.listHeaderCount}>({filteredData.length})</Text>
              </Text>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Animated.View entering={ZoomIn.duration(380)} style={styles.emptyIconWrap}>
                <LinearGradient
                  colors={['rgba(255,255,255,0.5)', 'rgba(255,255,255,0)']}
                  style={StyleSheet.absoluteFill}
                  pointerEvents="none"
                />
                <Ionicons
                  name={searchQuery ? 'search-outline' : 'chatbubbles-outline'}
                  size={32}
                  color={ROSE_EDGE}
                />
              </Animated.View>
              <Text style={styles.emptyTitle}>
                {searchQuery ? 'No matches' : 'Inbox is clear'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {searchQuery
                  ? `Nothing matched “${searchQuery}”`
                  : filterType !== 'ALL'
                    ? `No ${FILTER_TABS.find((t) => t.key === filterType)?.label.toLowerCase()} complaints right now.`
                    : 'When issues land here, you can triage, assign, and resolve them in one place.'}
              </Text>
              {!searchQuery && filterType === 'ALL' && (
                <PressScale onPress={() => setModalVisible(true)} style={styles.emptyCta}>
                  <Text style={styles.emptyCtaText}>File a complaint</Text>
                  <Ionicons name="arrow-forward" size={14} color="#fff" />
                </PressScale>
              )}
            </View>
          }
        />
      )}

      {/* FAB */}
      <RNAnimated.View
        style={[
          styles.fabWrapper,
          { transform: [{ scale: fabScale }], bottom: 28 + Math.max(insets.bottom - 8, 0) },
        ]}
      >
        <TouchableOpacity
          style={styles.fab}
          onPress={() => setModalVisible(true)}
          onPressIn={onFabIn}
          onPressOut={onFabOut}
          activeOpacity={1}
          accessibilityLabel="File a new complaint"
        >
          <LinearGradient
            colors={['rgba(255,255,255,0.28)', 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0.6, y: 1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={styles.fabLabel}>New Complaint</Text>
        </TouchableOpacity>
      </RNAnimated.View>

      {/* Create sheet */}
      <Modal
        animationType="fade"
        transparent
        visible={modalVisible}
        onRequestClose={closeModal}
        statusBarTranslucent
      >
        <KeyboardAvoidingView
          style={[styles.sheetOverlay, isWide && styles.sheetOverlayWide]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={closeModal} accessibilityLabel="Dismiss" />

          <Animated.View
            entering={isWide ? ZoomIn.duration(260).springify().damping(18) : FadeInUp.duration(280).springify().damping(16)}
            style={[
              styles.sheetContent,
              isWide && styles.sheetContentWide,
              { paddingBottom: Math.max(insets.bottom, 14) },
            ]}
          >
            <LinearGradient
              colors={isDark ? ['rgba(244,63,94,0.10)', 'transparent'] : ['rgba(255,241,242,0.95)', 'rgba(255,255,255,0)']}
              style={styles.sheetAura}
              pointerEvents="none"
            />

            {!isWide && <View style={styles.sheetHandle} />}

            <View style={styles.sheetHeader}>
              <View style={styles.sheetTitleRow}>
                <View style={styles.sheetIconBadge}>
                  <Ionicons name="chatbubble-ellipses" size={17} color={ROSE} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sheetTitle}>File a Complaint</Text>
                  <Text style={styles.sheetSubtitle}>{sheetSubtitle}</Text>
                </View>
              </View>
              <PressScale onPress={closeModal} style={styles.closeBtn}>
                <Ionicons name="close" size={18} color={isDark ? '#CBD5E1' : '#475569'} />
              </PressScale>
            </View>

            <TourScrollView
              style={styles.sheetScrollView}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.sheetScroll}
              keyboardShouldPersistTaps="handled"
              bounces={false}
            >
              <View style={styles.fieldBlock}>
                <Text style={styles.label}>Title *</Text>
                <View style={[styles.inputFrame, clayInset(isDark, titleFocused) as any]}>
                  <AppTextInput
                    style={styles.input}
                    placeholder="Brief summary"
                    placeholderTextColor={isDark ? '#475569' : '#94A3B8'}
                    value={newComplaint.title}
                    onChangeText={(text) => setNewComplaint((prev) => ({ ...prev, title: text }))}
                    onFocus={() => setTitleFocused(true)}
                    onBlur={() => setTitleFocused(false)}
                  />
                </View>
                {attemptedSubmit && !titleOk && (
                  <Text style={styles.fieldError}>Add a short title so the team can scan quickly</Text>
                )}
              </View>

              <View style={styles.fieldBlock}>
                <Text style={styles.label}>Description *</Text>
                <View style={[styles.inputFrame, styles.textAreaFrame, clayInset(isDark, bodyFocused) as any]}>
                  <AppTextInput
                    style={[styles.input, styles.textArea]}
                    placeholder="What happened, when, and who is affected…"
                    placeholderTextColor={isDark ? '#475569' : '#94A3B8'}
                    multiline
                    value={newComplaint.description}
                    onChangeText={(text) => setNewComplaint((prev) => ({ ...prev, description: text }))}
                    onFocus={() => setBodyFocused(true)}
                    onBlur={() => setBodyFocused(false)}
                  />
                </View>
                {attemptedSubmit && !bodyOk && (
                  <Text style={styles.fieldError}>Add enough detail to act on this ticket</Text>
                )}
              </View>

              <View style={styles.fieldBlock}>
                <Text style={styles.label}>Category</Text>
                <View style={styles.pillRow}>
                  {['Facility', 'Disciplinary', 'Academic', 'General'].map((cat) => {
                    const active = newComplaint.category === cat;
                    const cfg = CATEGORY_CFG[cat.toLowerCase()] || CATEGORY_CFG.general;
                    return (
                      <PressScale key={cat} onPress={() => setNewComplaint((prev) => ({ ...prev, category: cat }))}>
                        <View style={[styles.pill, active && { backgroundColor: cfg.color, borderColor: cfg.color }]}>
                          <Ionicons name={cfg.icon} size={12} color={active ? '#fff' : cfg.color} />
                          <Text style={[styles.pillText, active && styles.pillTextActive]}>{cat}</Text>
                        </View>
                      </PressScale>
                    );
                  })}
                </View>
              </View>

              <View style={styles.fieldBlock}>
                <Text style={styles.label}>Priority</Text>
                <View style={styles.priorityTrack}>
                  {(['low', 'medium', 'high'] as const).map((prio) => {
                    const active = newComplaint.priority === prio;
                    const pm = PRIORITY_CFG[prio];
                    return (
                      <PressScale
                        key={prio}
                        onPress={() => setNewComplaint((prev) => ({ ...prev, priority: prio }))}
                        style={{ flex: 1 }}
                      >
                        <View style={[styles.priorityChip, active && { backgroundColor: pm.color, borderColor: pm.color }]}>
                          <Text style={[styles.priorityChipText, active && { color: '#fff', fontWeight: '700' }]}>
                            {prio.charAt(0).toUpperCase() + prio.slice(1)}
                          </Text>
                        </View>
                      </PressScale>
                    );
                  })}
                </View>
              </View>

              <View style={styles.fieldBlock}>
                <Text style={styles.label}>Students *</Text>
                <View style={styles.modeRow}>
                  {([
                    { key: 'single' as const, label: 'One student', icon: 'person-outline' as const },
                    { key: 'multiple' as const, label: 'Class pick', icon: 'people-outline' as const },
                  ]).map((mode) => {
                    const active = studentMode === mode.key;
                    return (
                      <PressScale key={mode.key} onPress={() => switchStudentMode(mode.key)} style={{ flex: 1 }}>
                        <View style={[styles.modeChip, active && styles.modeChipActive]}>
                          <Ionicons name={mode.icon} size={14} color={active ? ROSE : '#94A3B8'} />
                          <Text style={[styles.modeChipText, active && styles.modeChipTextActive]}>{mode.label}</Text>
                        </View>
                      </PressScale>
                    );
                  })}
                </View>

                {studentMode === 'single' ? (
                  <View>
                    {newComplaint.raised_for_student_id ? (
                      <View style={styles.selectedStudentChip}>
                        <StudentPhoto
                          photoUrl={selectedStudentPhotoUrl}
                          displayName={studentSearch}
                          size={32}
                          borderRadius={10}
                          style={styles.selectedStudentAvatar}
                          fallbackTextStyle={styles.selectedStudentInitial}
                        />
                        <Text style={styles.selectedStudentName} numberOfLines={1}>{studentSearch}</Text>
                        <TouchableOpacity
                          onPress={() => {
                            setNewComplaint((prev) => ({ ...prev, raised_for_student_id: '' }));
                            setStudentSearch('');
                            setSelectedStudentPhotoUrl(null);
                          }}
                          style={styles.clearStudentBtn}
                        >
                          <Ionicons name="close" size={14} color="#EF4444" />
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <>
                        <View style={[styles.inputFrame, clayInset(isDark) as any]}>
                          <AppTextInput
                            style={styles.input}
                            placeholder="Search name or admission no…"
                            placeholderTextColor={isDark ? '#475569' : '#94A3B8'}
                            value={studentSearch}
                            onChangeText={handleStudentSearch}
                          />
                        </View>
                        {isSearching && <ActivityIndicator size="small" color={ROSE} style={{ marginTop: 10 }} />}
                        {searchResults.length > 0 && (
                          <View style={styles.searchResults}>
                            {searchResults.map((student) => (
                              <TouchableOpacity
                                key={student.id}
                                style={styles.searchItem}
                                onPress={() => {
                                  setNewComplaint((prev) => ({ ...prev, raised_for_student_id: student.id }));
                                  setStudentSearch(`${[student.first_name, student.last_name].filter(Boolean).join(' ')} (${student.admission_no})`);
                                  setSelectedStudentPhotoUrl(
                                    student.photo_url ?? (student as any).person?.photo_url ?? null
                                  );
                                  setSearchResults([]);
                                }}
                              >
                                <StudentPhoto
                                  photoUrl={student.photo_url ?? (student as any).person?.photo_url}
                                  displayName={
                                    student.display_name ??
                                    [student.first_name, student.middle_name, student.last_name].filter(Boolean).join(' ')
                                  }
                                  size={34}
                                  borderRadius={10}
                                  style={styles.searchItemAvatar}
                                  fallbackTextStyle={styles.searchItemInitial}
                                />
                                <View style={{ flex: 1 }}>
                                  <Text style={styles.searchItemText}>{student.first_name} {student.last_name}</Text>
                                  <Text style={styles.searchItemSub}>{student.admission_no}</Text>
                                </View>
                                <Ionicons name="chevron-forward" size={14} color="#CBD5E1" />
                              </TouchableOpacity>
                            ))}
                          </View>
                        )}
                      </>
                    )}
                    {attemptedSubmit && !studentOk && (
                      <Text style={styles.fieldError}>Select a student to continue</Text>
                    )}
                  </View>
                ) : (
                  <View>
                    {loadingClasses ? (
                      <View style={styles.classLoading}>
                        <LogoLoader size={36} color={ROSE} />
                        <Text style={styles.classLoadingText}>Loading classes…</Text>
                      </View>
                    ) : classSections.length === 0 ? (
                      <Text style={styles.classEmptyText}>No classes found for the current academic year.</Text>
                    ) : (
                      <>
                        <Text style={styles.classSectionLabel}>Class</Text>
                        <TourScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.classChipRow}>
                          {classSections.map((section) => {
                            const active = selectedClassSectionId === section.id;
                            return (
                              <PressScale key={section.id} onPress={() => setSelectedClassSectionId(section.id)}>
                                <View style={[styles.classChip, active && styles.classChipActive]}>
                                  <Text style={[styles.classChipText, active && styles.classChipTextActive]}>
                                    {section.class_name} {section.section_name}
                                  </Text>
                                </View>
                              </PressScale>
                            );
                          })}
                        </TourScrollView>

                        <View style={styles.classHeaderRow}>
                          <Text style={styles.classMetaText}>
                            {classStudents.length} student{classStudents.length === 1 ? '' : 's'}
                          </Text>
                          <View style={styles.classActions}>
                            <TouchableOpacity onPress={() => setSelectedStudentIds(classStudents.map((s) => s.id))}>
                              <Text style={styles.classActionText}>Select all</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => setSelectedStudentIds([])}>
                              <Text style={styles.classActionMuted}>Clear</Text>
                            </TouchableOpacity>
                          </View>
                        </View>

                        {loadingStudents ? (
                          <View style={styles.classLoading}>
                            <LogoLoader size={36} color={ROSE} />
                            <Text style={styles.classLoadingText}>Loading students…</Text>
                          </View>
                        ) : classStudents.length === 0 ? (
                          <Text style={styles.classEmptyText}>No students found in this class.</Text>
                        ) : (
                          <TourScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            nestedScrollEnabled
                            contentContainerStyle={styles.studentCardRow}
                          >
                            {classStudents.map((student) => {
                              const checked = selectedStudentIds.includes(student.id);
                              return (
                                <PressScale key={student.id} onPress={() => toggleStudentSelection(student)}>
                                  <View style={[styles.studentCard, checked && styles.studentCardSelected]}>
                                    {checked && (
                                      <View style={styles.studentCardBadge}>
                                        <Ionicons name="checkmark" size={11} color="#fff" />
                                      </View>
                                    )}
                                    <StudentPhoto
                                      photoUrl={student.photo_url}
                                      displayName={student.display_name}
                                      size={44}
                                      borderRadius={14}
                                      style={[styles.studentCardAvatar, checked && styles.studentCardAvatarSelected]}
                                      fallbackTextStyle={[
                                        styles.studentCardInitial,
                                        checked && styles.studentCardInitialSelected,
                                      ]}
                                    />
                                    <Text style={styles.studentCardName} numberOfLines={2}>{student.display_name}</Text>
                                    <Text style={styles.studentCardAdm}>#{student.admission_no}</Text>
                                  </View>
                                </PressScale>
                              );
                            })}
                          </TourScrollView>
                        )}

                        {selectedStudentIds.length > 0 && (
                          <Text style={styles.selectedCount}>
                            {selectedStudentIds.length} student{selectedStudentIds.length === 1 ? '' : 's'} selected
                          </Text>
                        )}
                        {attemptedSubmit && !studentOk && (
                          <Text style={styles.fieldError}>Select at least one student</Text>
                        )}
                      </>
                    )}
                  </View>
                )}
              </View>
            </TourScrollView>

            <View style={styles.stickyFooter}>
              {!canSubmit && attemptedSubmit && (
                <Animated.View entering={FadeIn.duration(160)} style={styles.footerHint}>
                  <Ionicons name="information-circle" size={14} color={ROSE} />
                  <Text style={styles.footerHintText}>
                    {!titleOk ? 'Add a title' : !bodyOk ? 'Add a description' : 'Pick student(s)'}
                  </Text>
                </Animated.View>
              )}
              <PremiumButton
                title={
                  isSubmitting
                    ? 'Filing…'
                    : studentMode === 'multiple' && selectedStudentIds.length > 1
                      ? `Submit to ${selectedStudentIds.length} Students`
                      : 'Submit Complaint'
                }
                onPress={handleCreateComplaint}
                loading={isSubmitting}
                disabled={isSubmitting}
                colors={canSubmit ? [ROSE, ROSE_DEEP] : ['#FDA4AF', '#FB7185']}
                icon={!isSubmitting ? <Ionicons name="send" size={15} color="#fff" style={{ marginLeft: 8 }} /> : undefined}
                style={!canSubmit ? { ...styles.publishBtn, opacity: 0.72 } : styles.publishBtn}
              />
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const getStyles = (theme: Theme, isDark: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 14, fontSize: 13, color: theme.colors.textSecondary, letterSpacing: 0.2 },

  searchContainer: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: isDark ? theme.colors.card : '#fff',
    marginHorizontal: 20, marginTop: 16,
    paddingHorizontal: 14, borderRadius: 16, height: 50,
    borderWidth: 1.5, borderColor: isDark ? theme.colors.border : '#E2E8F0',
    ...(Platform.OS === 'android'
      ? { elevation: 2 }
      : { shadowColor: '#64748B', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8 }),
  },
  searchFocused: {
    borderColor: ROSE_EDGE,
    ...(Platform.OS === 'ios'
      ? { shadowColor: ROSE, shadowOpacity: 0.16, shadowRadius: 12 }
      : { elevation: 4 }),
  },
  searchIcon: { marginRight: 10 },
  searchInput: {
    flex: 1, fontSize: 14, color: theme.colors.textStrong, fontWeight: '500',
    backgroundColor: 'transparent', borderWidth: 0, padding: 0,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' as any } : {}),
  },
  clearBtn: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#94A3B8', justifyContent: 'center', alignItems: 'center',
  },

  statsStrip: {
    flexDirection: 'row',
    backgroundColor: isDark ? theme.colors.card : '#fff',
    marginHorizontal: 20, marginTop: 12,
    borderRadius: 18, paddingVertical: 6, paddingHorizontal: 4,
    borderWidth: 1, borderColor: isDark ? theme.colors.border : 'rgba(148,163,184,0.18)',
    alignItems: 'stretch',
    ...(Platform.OS === 'android' ? { elevation: 2 } : {
      shadowColor: '#64748B', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8,
    }),
  },
  statChip: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, paddingHorizontal: 4, borderRadius: 14,
  },
  statChipActive: {
    backgroundColor: isDark ? 'rgba(244,63,94,0.14)' : ROSE_SOFT,
  },
  statDivider: {
    width: StyleSheet.hairlineWidth, alignSelf: 'center', height: 32,
    backgroundColor: isDark ? theme.colors.border : '#E2E8F0',
  },
  statNumber: { fontSize: 20, fontWeight: '800', letterSpacing: -0.6 },
  statLabel: {
    fontSize: 11, color: isDark ? '#94A3B8' : '#64748B', fontWeight: '700',
    marginTop: 3,
  },
  statLabelActive: { color: ROSE_DEEP },
  statHint: {
    marginTop: 2, fontSize: 9, fontWeight: '700', color: ROSE,
    textTransform: 'uppercase', letterSpacing: 0.3,
  },

  listContent: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 120 },
  listHeader: {
    fontSize: 16, fontWeight: '800', color: theme.colors.textStrong,
    marginBottom: 12, letterSpacing: -0.4,
  },
  listHeaderCount: { fontWeight: '600', color: isDark ? '#94A3B8' : '#64748B' },

  card: {
    backgroundColor: isDark ? theme.colors.card : '#fff',
    borderRadius: 22, marginBottom: 12,
    flexDirection: 'row', overflow: 'hidden',
    borderWidth: 1, borderColor: isDark ? theme.colors.border : 'rgba(148,163,184,0.16)',
    borderBottomWidth: 1.5, borderBottomColor: isDark ? theme.colors.border : 'rgba(100,116,139,0.14)',
    ...(Platform.OS === 'android' ? { elevation: 3 } : {
      shadowColor: '#64748B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.09, shadowRadius: 12,
    }),
  },
  cardUrgent: {
    borderColor: ROSE_EDGE,
    borderBottomColor: ROSE_EDGE,
    ...(Platform.OS === 'ios'
      ? { shadowColor: ROSE, shadowOpacity: 0.14, shadowRadius: 14 }
      : { elevation: 4 }),
  },
  cardStripe: { width: 4 },
  cardInner: { flex: 1, padding: 14, paddingLeft: 12 },

  studentRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  studentAvatar: { alignItems: 'center', justifyContent: 'center' },
  studentAvatarFallback: { fontSize: 16, fontWeight: '800' },
  studentMain: { flex: 1, minWidth: 0, gap: 2 },
  studentEyebrow: {
    fontSize: 10, fontWeight: '800', color: isDark ? '#94A3B8' : '#64748B',
    textTransform: 'uppercase', letterSpacing: 0.55, marginBottom: 1,
  },
  studentTitleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8,
  },
  studentName: {
    flex: 1, fontSize: 17, fontWeight: '800', color: theme.colors.textStrong,
    letterSpacing: -0.4, lineHeight: 22,
  },
  studentMetaRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 1,
  },
  studentAdm: {
    fontSize: 12, fontWeight: '700', color: isDark ? '#94A3B8' : '#475569',
  },
  studentAdmMuted: {
    fontSize: 12, fontWeight: '600', color: isDark ? '#64748B' : '#94A3B8',
  },
  ticketInline: {
    fontSize: 11, fontWeight: '700', color: isDark ? '#94A3B8' : '#64748B',
    letterSpacing: 0.15,
  },

  issueBlock: {
    marginBottom: 10,
    paddingVertical: 10, paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(148,163,184,0.08)',
  },
  issueEyebrow: {
    fontSize: 10, fontWeight: '800', color: isDark ? '#94A3B8' : '#64748B',
    textTransform: 'uppercase', letterSpacing: 0.55, marginBottom: 4,
  },
  cardTitle: {
    fontSize: 14, fontWeight: '700', color: theme.colors.textStrong,
    letterSpacing: -0.2, lineHeight: 19,
  },
  priorityBadge: {
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 9, borderWidth: 1, flexShrink: 0,
  },
  priorityText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  cardDesc: {
    fontSize: 12, color: isDark ? '#94A3B8' : '#475569', lineHeight: 17,
    marginTop: 4,
  },
  metaRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 10, gap: 8,
  },
  catPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8,
  },
  catPillText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 9, borderWidth: 1,
  },
  statusText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.4 },
  cardFooter: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
  },
  metaInfo: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, paddingRight: 8 },
  avatarMini: {
    width: 22, height: 22, borderRadius: 7,
    backgroundColor: ROSE_MID, alignItems: 'center', justifyContent: 'center',
  },
  metaLabel: {
    fontSize: 10, fontWeight: '800', color: isDark ? '#94A3B8' : '#64748B',
    textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 1,
  },
  fromText: { fontSize: 13, color: theme.colors.textStrong, fontWeight: '700' },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dateText: {
    fontSize: 12, color: isDark ? '#94A3B8' : '#475569', fontWeight: '600',
  },

  actionRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  resolveBtn: {
    flex: 1.15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    backgroundColor: '#10B981', paddingVertical: 10, borderRadius: 12, overflow: 'hidden',
    borderBottomWidth: 1.5, borderBottomColor: 'rgba(0,0,0,0.12)',
  },
  resolveBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  assignBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    backgroundColor: ROSE_SOFT, paddingVertical: 10, borderRadius: 12,
    borderWidth: 1.5, borderColor: ROSE_EDGE,
  },
  assignBtnText: { color: ROSE_DEEP, fontSize: 13, fontWeight: '700' },

  emptyContainer: { alignItems: 'center', paddingTop: 56, paddingHorizontal: 28 },
  emptyIconWrap: {
    width: 88, height: 88, borderRadius: 28,
    backgroundColor: ROSE_SOFT,
    justifyContent: 'center', alignItems: 'center', marginBottom: 20,
    overflow: 'hidden',
    borderWidth: 1, borderColor: ROSE_EDGE,
  },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: theme.colors.textStrong, letterSpacing: -0.4 },
  emptySubtitle: {
    fontSize: 14, color: theme.colors.textSecondary, marginTop: 8,
    textAlign: 'center', lineHeight: 21, maxWidth: 300,
  },
  emptyCta: {
    marginTop: 22, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: ROSE, paddingHorizontal: 20, paddingVertical: 12,
    borderRadius: 16, overflow: 'hidden',
  },
  emptyCtaText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  fabWrapper: { position: 'absolute', right: 18 },
  fab: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: ROSE,
    paddingVertical: 15, paddingHorizontal: 20,
    borderRadius: 28, gap: 6, overflow: 'hidden',
    borderBottomWidth: 1.5, borderBottomColor: 'rgba(0,0,0,0.12)',
    ...(Platform.OS === 'android' ? { elevation: 8 } : {
      shadowColor: ROSE, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.38, shadowRadius: 16,
    }),
  },
  fabLabel: { color: '#fff', fontWeight: '800', fontSize: 14, letterSpacing: 0.2 },

  sheetOverlay: {
    flex: 1, backgroundColor: 'rgba(15,23,42,0.52)',
    justifyContent: 'flex-end',
  },
  sheetOverlayWide: { justifyContent: 'center', alignItems: 'center', padding: 24 },
  sheetContent: {
    backgroundColor: isDark ? theme.colors.background : CLAY_BG,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 18, paddingTop: 10,
    maxHeight: '92%', width: '100%', overflow: 'hidden',
    ...(Platform.OS === 'android' ? { elevation: 16 } : {
      shadowColor: '#0F172A', shadowOffset: { width: 0, height: -8 }, shadowOpacity: 0.2, shadowRadius: 24,
    }),
  },
  sheetContentWide: {
    maxWidth: 520, maxHeight: '88%',
    borderRadius: 28,
  },
  sheetAura: { position: 'absolute', top: 0, left: 0, right: 0, height: 140 },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(148,163,184,0.45)',
    alignSelf: 'center', marginBottom: 14,
  },
  sheetHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 8, gap: 12,
  },
  sheetTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  sheetIconBadge: {
    width: 44, height: 44, borderRadius: 16,
    backgroundColor: ROSE_MID,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: ROSE_EDGE,
  },
  sheetTitle: { fontSize: 19, fontWeight: '800', color: theme.colors.textStrong, letterSpacing: -0.5 },
  sheetSubtitle: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 },
  closeBtn: {
    width: 40, height: 40, borderRadius: 14,
    backgroundColor: isDark ? theme.colors.card : 'rgba(255,255,255,0.85)',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: isDark ? theme.colors.border : 'rgba(148,163,184,0.25)',
  },
  sheetScrollView: { flexGrow: 0 },
  sheetScroll: { paddingTop: 8, paddingBottom: 12 },

  fieldBlock: { marginBottom: 14 },
  label: {
    fontSize: 11, fontWeight: '700', color: theme.colors.textTertiary,
    letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8, paddingLeft: 2,
  },
  inputFrame: {
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, overflow: 'hidden',
  },
  textAreaFrame: { paddingVertical: 12 },
  input: {
    fontSize: 15, color: theme.colors.textStrong, fontWeight: '500',
    backgroundColor: 'transparent', borderWidth: 0, padding: 0,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' as any } : {}),
  },
  textArea: { minHeight: 96, textAlignVertical: 'top', lineHeight: 22 },
  fieldError: { fontSize: 12, color: ROSE, marginTop: 6, fontWeight: '600', paddingLeft: 2 },

  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999,
    backgroundColor: isDark ? theme.colors.card : '#fff',
    borderWidth: 1.5, borderColor: isDark ? theme.colors.border : 'rgba(148,163,184,0.28)',
  },
  pillText: { fontSize: 13, color: INK_MUTED, fontWeight: '600' },
  pillTextActive: { color: '#fff', fontWeight: '700' },

  priorityTrack: {
    flexDirection: 'row', gap: 8,
    backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(148,163,184,0.12)',
    borderRadius: 16, padding: 4,
  },
  priorityChip: {
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 11, borderRadius: 12,
    borderWidth: 1.5, borderColor: 'transparent',
  },
  priorityChipText: { fontSize: 13, color: theme.colors.textSecondary, fontWeight: '600' },

  modeRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  modeChip: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 11, borderRadius: 14,
    borderWidth: 1.5, borderColor: isDark ? theme.colors.border : 'rgba(148,163,184,0.28)',
    backgroundColor: isDark ? theme.colors.card : '#fff',
  },
  modeChipActive: { backgroundColor: ROSE_SOFT, borderColor: ROSE_EDGE },
  modeChipText: { fontSize: 12, fontWeight: '600', color: theme.colors.textSecondary },
  modeChipTextActive: { color: ROSE_DEEP, fontWeight: '700' },

  selectedStudentChip: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 12, borderRadius: 14,
    borderWidth: 1.5, borderColor: ROSE_EDGE, backgroundColor: ROSE_SOFT,
  },
  selectedStudentAvatar: {
    width: 30, height: 30, borderRadius: 10,
    backgroundColor: ROSE_MID, alignItems: 'center', justifyContent: 'center',
  },
  selectedStudentInitial: { fontSize: 13, fontWeight: '800', color: ROSE_DEEP },
  selectedStudentName: { flex: 1, fontSize: 14, fontWeight: '600', color: theme.colors.text },
  clearStudentBtn: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center',
  },

  searchResults: {
    backgroundColor: isDark ? theme.colors.card : '#fff',
    borderWidth: 1, borderColor: isDark ? theme.colors.border : 'rgba(148,163,184,0.2)',
    borderRadius: 14, marginTop: 8, overflow: 'hidden',
  },
  searchItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: isDark ? theme.colors.border : '#E2E8F0',
  },
  searchItemAvatar: {
    width: 34, height: 34, borderRadius: 11,
    backgroundColor: ROSE_MID, alignItems: 'center', justifyContent: 'center',
  },
  searchItemInitial: { fontSize: 13, fontWeight: '800', color: ROSE },
  searchItemText: { fontSize: 14, fontWeight: '600', color: theme.colors.text },
  searchItemSub: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 1 },

  classSectionLabel: {
    fontSize: 11, fontWeight: '700', color: theme.colors.textTertiary,
    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8,
  },
  classChipRow: { gap: 8, paddingRight: 8, paddingBottom: 4 },
  classChip: {
    paddingVertical: 9, paddingHorizontal: 14, borderRadius: 999,
    borderWidth: 1.5, borderColor: isDark ? theme.colors.border : 'rgba(148,163,184,0.28)',
    backgroundColor: isDark ? theme.colors.card : '#fff',
  },
  classChipActive: { backgroundColor: ROSE, borderColor: ROSE },
  classChipText: { fontSize: 13, fontWeight: '600', color: theme.colors.textSecondary },
  classChipTextActive: { color: '#fff', fontWeight: '700' },
  classHeaderRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 10, marginBottom: 8,
  },
  classMetaText: { fontSize: 13, fontWeight: '700', color: theme.colors.textSecondary },
  classActions: { flexDirection: 'row', gap: 12 },
  classActionText: { fontSize: 12, fontWeight: '700', color: ROSE },
  classActionMuted: { fontSize: 12, fontWeight: '700', color: theme.colors.textTertiary },
  classLoading: { alignItems: 'center', paddingVertical: 20, gap: 8 },
  classLoadingText: { fontSize: 13, color: theme.colors.textSecondary },
  classEmptyText: {
    fontSize: 13, color: theme.colors.textSecondary, textAlign: 'center', paddingVertical: 16,
  },
  studentCardRow: { gap: 12, paddingVertical: 8, paddingRight: 8 },
  studentCard: {
    width: 128, minHeight: 148, paddingVertical: 14, paddingHorizontal: 12,
    borderRadius: 18, borderWidth: 1.5,
    borderColor: isDark ? theme.colors.border : 'rgba(148,163,184,0.28)',
    backgroundColor: isDark ? theme.colors.card : '#fff',
    alignItems: 'center', position: 'relative',
  },
  studentCardSelected: {
    backgroundColor: ROSE_SOFT, borderColor: ROSE,
  },
  studentCardBadge: {
    position: 'absolute', top: 8, right: 8,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: ROSE, alignItems: 'center', justifyContent: 'center',
  },
  studentCardAvatar: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: ROSE_MID, alignItems: 'center', justifyContent: 'center', marginBottom: 10,
  },
  studentCardAvatarSelected: { backgroundColor: ROSE_EDGE },
  studentCardInitial: { fontSize: 18, fontWeight: '800', color: ROSE },
  studentCardInitialSelected: { color: ROSE_DEEP },
  studentCardName: {
    fontSize: 12, fontWeight: '700', textAlign: 'center',
    lineHeight: 16, minHeight: 32, color: theme.colors.text,
  },
  studentCardAdm: { fontSize: 11, fontWeight: '600', marginTop: 4, color: theme.colors.textSecondary },
  selectedCount: { marginTop: 8, fontSize: 12, fontWeight: '700', color: ROSE },

  stickyFooter: {
    paddingTop: 10, paddingBottom: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: isDark ? theme.colors.border : 'rgba(148,163,184,0.25)',
  },
  footerHint: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginBottom: 8, paddingHorizontal: 4,
  },
  footerHintText: { fontSize: 12, color: ROSE, fontWeight: '600' },
  publishBtn: { borderRadius: 16, overflow: 'hidden' },
});
