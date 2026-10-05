import { TourTarget, TourScrollView } from '@/src/features/app-tour';
import React, { useState, useEffect, useCallback, memo } from 'react';
import AppTextInput from '@/src/components/AppTextInput';
import { styles as ds } from '@/src/theme/styles';
import { clay, clayCard, clayInset } from '@/src/theme/clayStyles';

import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Pressable,
  RefreshControl,
  Platform,
  ScrollView,
  Modal,
  Alert,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../src/hooks/useTheme';
import { Theme, Radii, Spacing, Typography } from '../../src/theme/themes';
import AdminHeader from '../../src/components/AdminHeader';
import StudentPhoto from '../../src/components/StudentPhoto';
import Animated, {
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  useAnimatedScrollHandler,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { StudentService } from '../../src/services/studentService';
import { ClassService, ClassInfo, Section } from '../../src/services/classService';
import { useLocalSearchParams, useRouter } from 'expo-router';
import LogoLoader from '../../src/components/LogoLoader';
import { exportStudentCsv } from '../../src/utils/studentExport';
import { SCHOOL_NAME } from '../../src/constants/school';
import HardDeleteStudentModal from '../../src/components/accounts/HardDeleteStudentModal';
import { alertCompat } from '../../src/utils/crossPlatformAlert';

type AdmissionNumberFilter = 'dummy' | 'permanent';
type StudentFilterType = 'class' | 'section' | 'status' | 'admission_type' | 'sort';

const AVATAR_TINTS = [
  { bg: '#EEF2FF', fg: '#4F46E5' },
  { bg: '#ECFDF5', fg: '#059669' },
  { bg: '#FFF7ED', fg: '#C2410C' },
  { bg: '#FDF2F8', fg: '#DB2777' },
  { bg: '#F0F9FF', fg: '#0284C7' },
  { bg: '#F5F3FF', fg: '#7C3AED' },
] as const;

/** Title-case ALL-CAPS roster names for faster scanning. */
function formatDisplayName(name: string): string {
  const trimmed = (name || '').trim();
  if (!trimmed) return trimmed;
  const letters = trimmed.replace(/[^A-Za-z]/g, '');
  if (!letters) return trimmed;
  const upperRatio = [...letters].filter((c) => c === c.toUpperCase()).length / letters.length;
  if (upperRatio < 0.75) return trimmed;
  return trimmed
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

function avatarTintFor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_TINTS[Math.abs(hash) % AVATAR_TINTS.length];
}

function statusTone(status: string | undefined, isActive: boolean) {
  if (isActive || status === 'active') {
    return { bg: '#ECFDF5', fg: '#059669', label: 'Active' };
  }
  if (status === 'graduated') {
    return { bg: '#FFFBEB', fg: '#B45309', label: 'Passed Out' };
  }
  if (status === 'withdrawn') {
    return { bg: '#F1F5F9', fg: '#475569', label: 'Withdrawn' };
  }
  const label = status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown';
  return { bg: '#FEF2F2', fg: '#DC2626', label };
}

function PressScale({
  onPress,
  children,
  disabled,
  style,
  hitSlop,
  accessibilityLabel,
  accessibilityHint,
  hoverLift,
  onHoverChange,
}: {
  onPress?: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  style?: any;
  hitSlop?: number | { top?: number; bottom?: number; left?: number; right?: number };
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /** Soft lift on pointer hover (web roster cards). */
  hoverLift?: boolean;
  onHoverChange?: (hovered: boolean) => void;
}) {
  const scale = useSharedValue(1);
  const translateY = useSharedValue(0);
  const hoveredSV = useSharedValue(0);
  const aStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
  }));

  const restScale = () => (hoverLift && hoveredSV.value ? 1.01 : 1);
  const restY = () => (hoverLift && hoveredSV.value ? -3 : 0);

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      hitSlop={hitSlop}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      onHoverIn={() => {
        if (disabled) return;
        onHoverChange?.(true);
        if (!hoverLift) return;
        hoveredSV.value = 1;
        scale.value = withTiming(1.01, { duration: 160 });
        translateY.value = withTiming(-3, { duration: 160 });
      }}
      onHoverOut={() => {
        onHoverChange?.(false);
        if (!hoverLift) return;
        hoveredSV.value = 0;
        scale.value = withTiming(1, { duration: 160 });
        translateY.value = withTiming(0, { duration: 160 });
      }}
      onPressIn={() => {
        if (!disabled) {
          scale.value = withSpring(0.97, { damping: 18, stiffness: 320 });
          if (hoverLift) translateY.value = withSpring(0, { damping: 18, stiffness: 320 });
        }
      }}
      onPressOut={() => {
        scale.value = withSpring(restScale(), { damping: 14, stiffness: 220 });
        if (hoverLift) {
          translateY.value = withSpring(restY(), { damping: 14, stiffness: 220 });
        }
      }}
    >
      <Animated.View style={[style, aStyle]}>{children}</Animated.View>
    </Pressable>
  );
}

type StudentRowProps = {
  item: any;
  isArchive: boolean;
  isDark: boolean;
  isWide: boolean;
  textSecondary: string;
  onPress: (id: string) => void;
  onMore: (item: any) => void;
};

const StudentRow = memo(function StudentRow({
  item,
  isArchive,
  isDark,
  isWide,
  textSecondary,
  onPress,
  onMore,
}: StudentRowProps) {
  const [hovered, setHovered] = useState(false);
  const fullNameRaw =
    item.display_name || [item.first_name, item.last_name].filter(Boolean).join(' ') || 'Student';
  const fullName = formatDisplayName(fullNameRaw);
  const enrollment = item.current_enrollment || {};
  const isActive = item.status === 'active' || item.status_id === 1;
  const tone = statusTone(item.status, isActive);
  const tint = avatarTintFor(item.id || fullNameRaw);
  const photoUrl = item.photo_url || item.person?.photo_url || null;
  const classLabel = enrollment.class_name || enrollment.class_code || '—';
  const sectionLabel = enrollment.section_name || '—';
  const yearLabel = isArchive ? item.exit_academic_year : enrollment.academic_year;
  const classSection = [classLabel, sectionLabel]
    .filter((entry) => entry && entry !== '—')
    .join(' · ') || 'Not assigned';
  const admissionNumber = item.admission_no || '—';
  const rollLabel = enrollment.roll_number != null ? `Roll ${enrollment.roll_number}` : 'Roll —';
  const isDummyAdmission = /^Dummy\d+$/i.test(admissionNumber);

  return (
    <PressScale
      onPress={() => onPress(item.id)}
      hoverLift
      onHoverChange={setHovered}
      accessibilityLabel={`${fullName}, ${classSection}, admission ${admissionNumber}`}
      accessibilityHint="Opens the complete student record"
      style={[rowStyles.wrap, !isWide && rowStyles.wrapMobile]}
    >
      <View
        style={[
          rowStyles.row,
          isWide ? rowStyles.rowWide : rowStyles.rowMobile,
          isDark && rowStyles.rowDark,
          hovered && (isDark ? rowStyles.rowHoveredDark : rowStyles.rowHovered),
        ]}
      >
        <View
          style={[
            rowStyles.accentRail,
            { backgroundColor: tint.fg, opacity: hovered ? 1 : 0.72 },
          ]}
        />
        <StudentPhoto
          photoUrl={photoUrl}
          displayName={fullName}
          size={isWide ? 50 : 52}
          borderRadius={17}
          style={{
            backgroundColor: tint.bg,
            marginRight: isWide ? 14 : 12,
            marginTop: isWide ? 0 : 2,
            borderWidth: 2,
            borderColor: isDark ? 'rgba(255,255,255,0.08)' : `${tint.fg}18`,
          }}
          fallbackTextStyle={{ color: tint.fg, fontSize: 18, fontWeight: '800' }}
        />
        <View style={[rowStyles.info, isWide && rowStyles.infoWide]}>
          {!isWide ? (
            <>
              <View style={rowStyles.mobileTitleRow}>
                <Text style={[rowStyles.name, rowStyles.nameMobile, isDark && rowStyles.nameDark]} numberOfLines={1}>
                  {fullName}
                </Text>
                <View style={[rowStyles.badge, rowStyles.mobileBadge, { backgroundColor: tone.bg }]}>
                  <View style={[rowStyles.statusDot, { backgroundColor: tone.fg }]} />
                  <Text style={[rowStyles.badgeText, { color: tone.fg }]}>{tone.label}</Text>
                </View>
              </View>
              <View style={rowStyles.mobileAdmissionRow}>
                <Text style={[rowStyles.mobileAdmissionLabel, { color: textSecondary }]}>ADMISSION</Text>
                <Text style={[rowStyles.mobileAdmissionValue, isDark && rowStyles.detailValueDark]} numberOfLines={1}>
                  {admissionNumber}
                </Text>
                {isDummyAdmission ? (
                  <View style={[rowStyles.temporaryBadge, isDark && rowStyles.temporaryBadgeDark]}>
                    <Text style={rowStyles.temporaryBadgeText}>Temporary</Text>
                  </View>
                ) : null}
              </View>
              <View style={rowStyles.mobileFacts}>
                <View style={[rowStyles.mobileFact, isDark && rowStyles.mobileFactDark]}>
                  <Ionicons name="school-outline" size={13} color={tint.fg} />
                  <Text style={[rowStyles.mobileFactText, isDark && rowStyles.mobileFactTextDark]} numberOfLines={1}>
                    {classSection}
                  </Text>
                </View>
                <View style={[rowStyles.mobileFact, isDark && rowStyles.mobileFactDark]}>
                  <Ionicons name="list-outline" size={13} color={tint.fg} />
                  <Text style={[rowStyles.mobileFactText, isDark && rowStyles.mobileFactTextDark]} numberOfLines={1}>
                    {rollLabel}
                  </Text>
                </View>
                {yearLabel ? (
                  <View style={[rowStyles.mobileFact, rowStyles.mobileYearFact, isDark && rowStyles.mobileFactDark]}>
                    <Ionicons name="calendar-outline" size={13} color={tint.fg} />
                    <Text style={[rowStyles.mobileFactText, isDark && rowStyles.mobileFactTextDark]} numberOfLines={1}>
                      {yearLabel}
                    </Text>
                  </View>
                ) : null}
              </View>
            </>
          ) : (
            <>
              <Text style={[rowStyles.name, isDark && rowStyles.nameDark]} numberOfLines={1}>
                {fullName}
              </Text>
              <View style={rowStyles.desktopAdmissionHint}>
                <Ionicons name="id-card-outline" size={12} color={textSecondary} />
                <Text style={[rowStyles.metaMuted, { color: textSecondary }]} numberOfLines={1}>
                  Student record
                </Text>
              </View>
            </>
          )}
        </View>

        {isWide ? (
          <View style={rowStyles.desktopDetails}>
            <View style={[rowStyles.detailCell, isDark && rowStyles.detailCellDark]}>
              <Text style={[rowStyles.detailLabel, { color: textSecondary }]}>CLASS & SECTION</Text>
              <Text style={[rowStyles.detailValue, isDark && rowStyles.detailValueDark]} numberOfLines={1}>
                {classSection}
              </Text>
            </View>
            <View style={[rowStyles.detailCell, isDark && rowStyles.detailCellDark]}>
              <Text style={[rowStyles.detailLabel, { color: textSecondary }]}>ADMISSION NUMBER</Text>
              <View style={rowStyles.admissionRow}>
                <Text style={[rowStyles.detailValue, isDark && rowStyles.detailValueDark]} numberOfLines={1}>
                  {admissionNumber}
                </Text>
                {isDummyAdmission ? (
                  <View style={[rowStyles.temporaryBadge, isDark && rowStyles.temporaryBadgeDark]}>
                    <Text style={rowStyles.temporaryBadgeText}>Temporary</Text>
                  </View>
                ) : null}
              </View>
            </View>
            <View style={[rowStyles.detailCell, isDark && rowStyles.detailCellDark]}>
              <Text style={[rowStyles.detailLabel, { color: textSecondary }]}>ROLL / ACADEMIC YEAR</Text>
              <Text style={[rowStyles.detailValue, isDark && rowStyles.detailValueDark]} numberOfLines={1}>
                {rollLabel}{yearLabel ? ` · ${yearLabel}` : ''}
              </Text>
            </View>
          </View>
        ) : null}

        <View style={[rowStyles.trailing, !isWide && rowStyles.trailingMobile]}>
          {isWide ? (
            <View style={[rowStyles.badge, { backgroundColor: tone.bg }]}>
              <View style={[rowStyles.statusDot, { backgroundColor: tone.fg }]} />
              <Text style={[rowStyles.badgeText, { color: tone.fg }]}>{tone.label}</Text>
            </View>
          ) : null}
          {!isArchive ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`More actions for ${fullName}`}
              hitSlop={8}
              onPress={(e) => {
                (e as any)?.stopPropagation?.();
                onMore(item);
              }}
              style={({ pressed }) => [
                rowStyles.moreBtn,
                !isWide && rowStyles.moreBtnMobile,
                pressed && rowStyles.moreBtnPressed,
              ]}
            >
              <Ionicons name="ellipsis-horizontal" size={18} color={textSecondary} />
            </Pressable>
          ) : (
            <View style={rowStyles.chevronBtn}>
              <Ionicons name="chevron-forward" size={18} color={textSecondary} />
            </View>
          )}
          {!isWide && !isArchive ? (
            <View style={rowStyles.mobileChevron}>
              <Ionicons name="chevron-forward" size={16} color={textSecondary} />
            </View>
          ) : null}
        </View>
      </View>
    </PressScale>
  );
});

const rowStyles = StyleSheet.create({
  wrap: {
    marginBottom: 10,
    ...Platform.select({
      web: { cursor: 'pointer' } as any,
      default: {},
    }),
  },
  wrapMobile: {
    marginHorizontal: 12,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.22)',
    borderBottomWidth: 1.5,
    borderBottomColor: 'rgba(76,90,120,0.10)',
    minHeight: 86,
    overflow: 'hidden',
    ...Platform.select({
      web: {
        boxShadow: '0 5px 18px rgba(15,23,42,0.055)',
      } as any,
      ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.06, shadowRadius: 14 },
      default: { elevation: 2 },
    }),
  },
  rowWide: {
    paddingVertical: 12,
    paddingHorizontal: 18,
  },
  rowMobile: {
    alignItems: 'flex-start',
    minHeight: 140,
    paddingTop: 14,
    paddingBottom: 13,
    paddingLeft: 16,
    paddingRight: 11,
  },
  rowDark: {
    backgroundColor: '#151B2B',
    borderColor: 'rgba(255,255,255,0.06)',
    borderBottomColor: 'rgba(0,0,0,0.35)',
  },
  rowHovered: {
    backgroundColor: '#F8FAFF',
    borderColor: 'rgba(79,70,229,0.32)',
    borderBottomColor: 'rgba(79,70,229,0.18)',
    ...Platform.select({
      web: {
        boxShadow:
          '0 12px 28px rgba(15,23,42,0.10), 0 2px 8px rgba(79,70,229,0.10)',
      } as any,
      ios: { shadowOpacity: 0.12, shadowRadius: 18 },
      default: { elevation: 4 },
    }),
  },
  rowHoveredDark: {
    backgroundColor: '#1A2236',
    borderColor: 'rgba(129,140,248,0.34)',
    borderBottomColor: 'rgba(129,140,248,0.16)',
  },
  accentRail: {
    position: 'absolute',
    left: 0,
    top: 16,
    bottom: 16,
    width: 3,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
    opacity: 0.72,
  },
  info: {
    flex: 1,
    minWidth: 0,
    marginRight: 12,
  },
  infoWide: {
    flex: 0.85,
    maxWidth: 280,
  },
  name: {
    fontSize: 15.5,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.2,
    marginBottom: 4,
  },
  nameMobile: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    lineHeight: 20,
    marginBottom: 0,
    marginRight: 7,
  },
  nameDark: {
    color: '#F1F5F9',
  },
  metaMuted: {
    fontSize: 11,
    fontWeight: '400',
    lineHeight: 15,
    opacity: 0.85,
    flexShrink: 1,
  },
  desktopAdmissionHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  mobileTitleRow: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },
  mobileAdmissionRow: {
    minHeight: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 9,
  },
  mobileAdmissionLabel: {
    fontSize: 8.5,
    lineHeight: 12,
    letterSpacing: 0.65,
    fontWeight: '800',
  },
  mobileAdmissionValue: {
    color: '#334155',
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: '800',
    flexShrink: 1,
  },
  mobileFacts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  mobileFact: {
    maxWidth: '100%',
    minHeight: 28,
    paddingHorizontal: 8,
    borderRadius: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.14)',
  },
  mobileYearFact: {
    flexShrink: 1,
  },
  mobileFactDark: {
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderColor: 'rgba(255,255,255,0.06)',
  },
  mobileFactText: {
    flexShrink: 1,
    color: '#475569',
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: '700',
  },
  mobileFactTextDark: {
    color: '#CBD5E1',
  },
  desktopDetails: {
    flex: 2.35,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
  },
  detailCell: {
    flex: 1,
    minWidth: 0,
    minHeight: 54,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.12)',
  },
  detailCellDark: {
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderColor: 'rgba(255,255,255,0.05)',
  },
  detailLabel: {
    fontSize: 9.5,
    lineHeight: 13,
    fontWeight: '800',
    letterSpacing: 0.55,
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: '600',
    color: '#334155',
  },
  detailValueDark: {
    color: '#CBD5E1',
  },
  admissionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minWidth: 0,
  },
  temporaryBadge: {
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
    backgroundColor: '#FFF7ED',
  },
  temporaryBadgeDark: {
    backgroundColor: 'rgba(217,119,6,0.16)',
  },
  temporaryBadgeText: {
    color: '#C2410C',
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '800',
  },
  trailing: {
    width: 84,
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 6,
  },
  trailingMobile: {
    width: 34,
    alignSelf: 'stretch',
    justifyContent: 'space-between',
    gap: 0,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  mobileBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 999,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  moreBtn: {
    width: 34,
    height: 30,
    borderRadius: 10,
    backgroundColor: 'rgba(148,163,184,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreBtnMobile: {
    width: 34,
    height: 34,
    borderRadius: 11,
  },
  moreBtnPressed: { opacity: 0.7, transform: [{ scale: 0.96 }] },
  chevronBtn: {
    width: 32,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mobileChevron: {
    width: 30,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(148,163,184,0.07)',
  },
});

export default function AdminStudentsScreen() {
  const { theme, isDark } = useTheme();
  const { width: viewportWidth } = useWindowDimensions();
  const isWide = viewportWidth >= 900;
  const styles = React.useMemo(() => getStyles(theme), [theme]);
  const router = useRouter();
  const { view } = useLocalSearchParams<{ view?: string }>();
  const isArchive = view === 'archive';

  // List & Pagination State
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, total_pages: 1 });

  // Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [selectedAdmissionType, setSelectedAdmissionType] = useState<AdmissionNumberFilter | null>(null);
  const [sortBy, setSortBy] = useState<'name' | 'roll_number' | 'admission_no'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Reference Data
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [statuses, setStatuses] = useState<{ id: number; name: string; code: string; }[]>([]);

  // UI State
  const [filterModal, setFilterModal] = useState<{ visible: boolean; type: StudentFilterType | null; }>({
    visible: false,
    type: null
  });
  const [searchFocused, setSearchFocused] = useState(false);
  const [rowActionTarget, setRowActionTarget] = useState<any | null>(null);

  // Export State
  const [exportModal, setExportModal] = useState(false);
  const [exportClass, setExportClass] = useState<string | null>(null);
  const [exportSection, setExportSection] = useState<string | null>(null);
  const [exportPicker, setExportPicker] = useState<'class' | 'section' | null>(null);
  const [exporting, setExporting] = useState(false);

  // Permanent-delete State
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string; subtitle: string } | null>(null);
  const requestIdRef = React.useRef(0);

  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    }
  });

  // Initial load: Reference data
  useEffect(() => {
    const loadRefs = async () => {
      try {
        const [cls, sec, sts] = await Promise.all([
          ClassService.getClasses(),
          ClassService.getSections(),
          StudentService.getStatuses()]
        );
        setClasses(cls);
        setSections(sec);
        setStatuses(sts);
      } catch {
        // The roster remains usable; filter reference data can be retried on remount.
      }
    };
    loadRefs();
  }, []);

  // Main data fetching
  const fetchStudents = useCallback(async (isRefreshing = false) => {
    const requestId = ++requestIdRef.current;
    try {
      if (!isRefreshing) setLoading(true);
      setLoadError('');

      const params = {
        page,
        limit: 15,
        search: debouncedSearchQuery || undefined,
        class_id: selectedClass || undefined,
        section_id: selectedSection || undefined,
        status_id: selectedStatus || undefined,
        admission_type: selectedAdmissionType || undefined,
        lifecycle: selectedStatus ? undefined : (isArchive ? 'archived' as const : 'active' as const),
        sort_by: sortBy,
        sort_order: sortOrder
      };

      const response = await StudentService.getAll(params);
      if (requestId !== requestIdRef.current) return;
      setStudents(response.data || []);
      if (response.meta) {
        setPagination({
          total: response.meta.total,
          total_pages: response.meta.total_pages
        });
      }
    } catch (error: any) {
      if (requestId !== requestIdRef.current) return;
      setLoadError(error?.message || 'Could not load the student roster.');
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [
    debouncedSearchQuery,
    isArchive,
    page,
    selectedAdmissionType,
    selectedClass,
    selectedSection,
    selectedStatus,
    sortBy,
    sortOrder,
  ]);

  // Effect for filtering/pagination
  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  useEffect(() => {
    setSelectedStatus(null);
    setPage(1);
  }, [isArchive]);

  // Debounce typing so the roster does not blank or request on every keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      setDebouncedSearchQuery(searchQuery.trim());
    }, 350);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchStudents(true);
  };

  const handleOpenFilter = (type: StudentFilterType) => {
    setFilterModal({ visible: true, type });
  };

  const handleSelectFilter = (value: any) => {
    if (filterModal.type === 'class') {
      const nextClass = value === selectedClass ? null : value;
      setSelectedClass(nextClass);
      if (nextClass !== selectedClass) setSelectedSection(null);
    } else if (filterModal.type === 'section') {
      setSelectedSection(value === selectedSection ? null : value);
    } else if (filterModal.type === 'status') {
      setSelectedStatus(value === selectedStatus ? null : value);
    } else if (filterModal.type === 'admission_type') {
      setSelectedAdmissionType(value === selectedAdmissionType ? null : value);
    } else if (filterModal.type === 'sort') {
      if (sortBy === value) {
        setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
      } else {
        setSortBy(value);
        setSortOrder('asc');
      }
    }
    setPage(1);
    setFilterModal({ visible: false, type: null });
  };

  const openExportModal = () => {
    // Seed the export dialog with any filters already applied on the list.
    setExportClass(selectedClass);
    setExportSection(selectedSection);
    setExportModal(true);
  };

  const handleExport = async () => {
    if (exporting) return;
    try {
      setExporting(true);

      const rows = await StudentService.getAllPages<any>({
        search: searchQuery || undefined,
        class_id: exportClass || undefined,
        section_id: exportSection || undefined,
        status_id: selectedStatus || undefined,
        admission_type: selectedAdmissionType || undefined,
        lifecycle: selectedStatus ? undefined : (isArchive ? 'archived' : 'active'),
        sort_by: sortBy,
        sort_order: sortOrder
      });

      if (!rows || rows.length === 0) {
        Alert.alert('No students', 'No students match the selected filters.');
        return;
      }

      const classLabel = exportClass ? classes.find((c) => c.id === exportClass)?.name : null;
      const sectionLabel = exportSection ? sections.find((s) => s.id === exportSection)?.name : null;
      const admissionTypeLabel = selectedAdmissionType === 'dummy'
        ? 'Temporary / Dummy admissions'
        : selectedAdmissionType === 'permanent'
          ? 'Permanent / Numeric admissions'
          : null;
      const filterNote = [
        classLabel ? `Class ${classLabel}` : null,
        sectionLabel ? `Section ${sectionLabel}` : null,
        admissionTypeLabel].
        filter(Boolean).join(' · ') || 'All classes';

      const fileName = await exportStudentCsv(rows, {
        schoolName: SCHOOL_NAME,
        filterNote,
        dateIso: new Date().toISOString().slice(0, 10)
      });

      setExportModal(false);
      if (Platform.OS !== 'web') {
        Alert.alert('Export ready', `Exported ${rows.length} students to ${fileName}.`);
      }
    } catch (err: any) {
      Alert.alert('Export failed', err?.message || 'Could not export students. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const handleDelete = useCallback((item: any) => {
    const name = formatDisplayName(
      item.display_name || [item.first_name, item.last_name].filter(Boolean).join(' ') || 'Student'
    );
    const e = item.current_enrollment || {};
    const subtitle = [
      e.class_name || e.class_code,
      e.section_name,
      e.roll_number ? `Roll ${e.roll_number}` : null].
      filter(Boolean).join(' · ');
    setDeleteTarget({ id: item.id, name, subtitle });
  }, []);

  const handleOpenStudent = useCallback((id: string) => {
    router.push({ pathname: '/admin/addStudent', params: { id } });
  }, [router]);

  const clearFilters = useCallback(() => {
    setSearchQuery('');
    setDebouncedSearchQuery('');
    setSelectedClass(null);
    setSelectedSection(null);
    setSelectedStatus(null);
    setSelectedAdmissionType(null);
    setSortBy('name');
    setSortOrder('asc');
    setPage(1);
  }, []);

  const renderItem = useCallback(({ item }: { item: any }) => (
    <StudentRow
      item={item}
      isArchive={isArchive}
      isDark={isDark}
      isWide={isWide}
      textSecondary={theme.colors.textSecondary}
      onPress={handleOpenStudent}
      onMore={setRowActionTarget}
    />
  ), [isArchive, isDark, isWide, theme.colors.textSecondary, handleOpenStudent]);

  const currentFilterLabel = () => {
    if (filterModal.type === 'class') return 'Class';
    if (filterModal.type === 'section') return 'Section';
    if (filterModal.type === 'status') return 'Status';
    if (filterModal.type === 'admission_type') return 'Admission Type';
    if (filterModal.type === 'sort') return 'Sort By';
    return '';
  };

  const currentFilterOptions = (): any[] => {
    if (filterModal.type === 'class') return [{ id: null, name: 'All Classes' }, ...classes];
    if (filterModal.type === 'section') return [{ id: null, name: 'All Sections' }, ...sections];
    if (filterModal.type === 'admission_type') return [
      { id: null, name: 'All Admission Types' },
      { id: 'dummy', name: 'Temporary / Dummy' },
      { id: 'permanent', name: 'Permanent / Numeric' },
    ];
    if (filterModal.type === 'status') {
      const availableStatuses = isArchive
        ? statuses.filter((status) => status.code === 'graduated' || status.code === 'withdrawn')
        : statuses.filter((status) => status.code === 'active');
      return [{ id: null, name: isArchive ? 'Passed Out & Withdrawn' : 'Active Students' }, ...availableStatuses];
    }
    if (filterModal.type === 'sort') return [
      { id: 'name', name: 'Name' },
      { id: 'roll_number', name: 'Roll Number' },
      { id: 'admission_no', name: 'Admission No' }];

    return [];
  };

  const getSelectedValue = () => {
    if (filterModal.type === 'class') return selectedClass;
    if (filterModal.type === 'section') return selectedSection;
    if (filterModal.type === 'status') return selectedStatus;
    if (filterModal.type === 'admission_type') return selectedAdmissionType;
    if (filterModal.type === 'sort') return sortBy;
    return null;
  };

  const selectedClassName = selectedClass
    ? classes.find((c) => c.id === selectedClass)?.name
    : null;
  const selectedSectionName = selectedSection
    ? sections.find((s) => s.id === selectedSection)?.name
    : null;
  const showClassCountCard = Boolean(selectedClass && selectedSection);
  const hasCustomSort = sortBy !== 'name' || sortOrder !== 'asc';
  const activeFilterCount = [
    selectedClass,
    selectedSection,
    selectedStatus,
    selectedAdmissionType,
    hasCustomSort ? 'sort' : null,
  ].filter(Boolean).length;
  const hasAdjustedView = Boolean(searchQuery || activeFilterCount > 0);
  const firstVisibleResult = pagination.total === 0 ? 0 : (page - 1) * 15 + 1;
  const lastVisibleResult = Math.min(page * 15, pagination.total);
  const actionTargetName = rowActionTarget
    ? formatDisplayName(
      rowActionTarget.display_name
      || [rowActionTarget.first_name, rowActionTarget.last_name].filter(Boolean).join(' ')
      || 'Student',
    )
    : '';

  return (
    <View style={styles.container}>
      <TourTarget id="screen.admin-students.overview"><AdminHeader
        title={isArchive ? 'Student Archive' : 'Students'}
        showNotification={!isArchive}
        showBackButton={isArchive}
        scrollY={scrollY}
        rightAction={!isArchive ? {
          icon: 'cloud-upload-outline',
          onPress: () => router.push('/admin/bulk-student-update'),
        } : undefined}
      /></TourTarget>
      <View style={[styles.headerArea, !isWide && styles.headerAreaCompact]}>
        <LinearGradient
          colors={isDark ? ['#1B2033', '#171D2B'] : ['#F7F7FF', '#FFFFFF', '#F4FAFF']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.overviewCard, !isWide && styles.overviewCardCompact]}
        >
          <View style={styles.overviewAccent} />
          <View style={[styles.overviewIcon, !isWide && styles.overviewIconCompact]}>
            <Ionicons name={isArchive ? 'archive' : 'people'} size={22} color={theme.colors.primary} />
          </View>
          <View style={styles.overviewCopy}>
            <Text style={styles.overviewEyebrow}>
              {isArchive ? 'STUDENT RECORDS' : 'STUDENT DIRECTORY'}
            </Text>
            <View style={styles.metaLeft}>
              <Text style={styles.metaCount}>{loading && students.length === 0 ? '…' : pagination.total}</Text>
              <Text style={styles.metaLabel}>
                {isArchive ? 'archived' : 'active'}{pagination.total === 1 ? ' student' : ' students'}
              </Text>
            </View>
            {isWide ? (
              <Text style={styles.overviewSubtitle} numberOfLines={1}>
                {isArchive
                  ? 'Review passed-out and withdrawn student records.'
                  : 'Search, review and manage the current school roster.'}
              </Text>
            ) : null}
          </View>
          <View style={[styles.overviewActions, !isWide && styles.overviewActionsCompact]}>
            {!isArchive && isWide ? (
              <PressScale
                onPress={() => router.push('/admin/bulk-student-update')}
                style={styles.bulkUpdateButton}
                accessibilityLabel="Bulk update student details"
                accessibilityHint="Upload an Excel file to update one student field across the roster"
              >
                <Ionicons name="cloud-upload-outline" size={16} color={theme.colors.primary} />
                <Text style={styles.bulkUpdateButtonText}>Bulk update</Text>
              </PressScale>
            ) : null}
            {!isArchive && isWide ? (
              <PressScale onPress={() => router.push('/admin/addStudent')} style={styles.addStudentButton}>
                <LinearGradient
                  colors={[theme.colors.primary, theme.colors.primaryDark]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                  pointerEvents="none"
                />
                <Ionicons name="person-add-outline" size={16} color="#fff" />
                <Text style={styles.addStudentButtonText}>Add student</Text>
              </PressScale>
            ) : null}
            <PressScale
              onPress={() => {
                if (isArchive) router.replace('/admin/students');
                else router.push({ pathname: '/admin/students', params: { view: 'archive' } });
              }}
              style={[
                styles.archiveLink,
                !isWide && styles.archiveLinkCompact,
                isArchive && styles.archiveLinkActive,
              ]}
            >
              <Ionicons
                name={isArchive ? 'people-outline' : 'archive-outline'}
                size={15}
                color={isArchive ? theme.colors.info : '#C2410C'}
              />
              <Text style={[styles.archiveLinkText, isArchive && styles.archiveLinkTextActive]}>
                {isArchive ? 'Active roster' : 'Archive'}
              </Text>
              <Ionicons
                name="chevron-forward"
                size={14}
                color={isArchive ? theme.colors.info : '#C2410C'}
              />
            </PressScale>
          </View>
        </LinearGradient>

        <View style={[styles.discoveryPanel, !isWide && styles.discoveryPanelCompact]}>
          <TourTarget id="screen.admin-students.workspace" native><View style={[styles.searchBox, !isWide && styles.searchBoxCompact, ds.searchBarWrapper, clayInset(isDark, searchFocused)]}>
            <View style={[styles.searchIconWrap, searchFocused && styles.searchIconWrapFocused]}>
              <Ionicons name="search" size={17} color={searchFocused ? theme.colors.primary : theme.colors.textSecondary} />
            </View>
            <TourTarget id="admin.students.search" native event="admin.students.search"><AppTextInput
              accessibilityLabel="Search students"
              style={[ds.inputInChrome, styles.searchInput]}
              placeholder={isWide
                ? isArchive
                  ? 'Search archived students by name or admission number'
                  : 'Search students by name or admission number'
                : 'Search name or admission number'}
              placeholderTextColor={theme.colors.textSecondary}
              value={searchQuery}
              onChangeText={setSearchQuery}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              returnKeyType="search"
            /></TourTarget>
            {searchQuery ? (
              <PressScale hitSlop={8} onPress={() => setSearchQuery('')} style={styles.searchClearButton}>
                <Ionicons name="close" size={16} color={theme.colors.textSecondary} />
              </PressScale>
            ) : null}
          </View></TourTarget>

          <TourTarget id="admin.students.filters" native><View style={[styles.filterRow, !isWide && styles.filterRowCompact]}>
            <TourScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.filterScroller}
              contentContainerStyle={styles.filterScroll}
            >
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Filter by class"
                style={[styles.filterChip, !isWide && styles.filterChipMobile, selectedClass && styles.filterChipActive]}
                onPress={() => handleOpenFilter('class')}
              >
                <Ionicons name="school-outline" size={13} color={selectedClass ? theme.colors.primary : theme.colors.textSecondary} />
                <Text style={[styles.filterChipText, selectedClass && styles.filterChipTextActive]}>
                  {selectedClass ? classes.find((c) => c.id === selectedClass)?.name : 'Class'}
                </Text>
                <Ionicons name="chevron-down" size={13} color={selectedClass ? theme.colors.primary : theme.colors.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Filter by section"
                style={[styles.filterChip, !isWide && styles.filterChipMobile, selectedSection && styles.filterChipActive]}
                onPress={() => handleOpenFilter('section')}
              >
                <Ionicons name="grid-outline" size={13} color={selectedSection ? theme.colors.primary : theme.colors.textSecondary} />
                <Text style={[styles.filterChipText, selectedSection && styles.filterChipTextActive]}>
                  {selectedSection ? sections.find((s) => s.id === selectedSection)?.name : 'Section'}
                </Text>
                <Ionicons name="chevron-down" size={13} color={selectedSection ? theme.colors.primary : theme.colors.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Filter by admission number type"
                style={[styles.filterChip, !isWide && styles.filterChipMobile, selectedAdmissionType && styles.filterChipActive]}
                onPress={() => handleOpenFilter('admission_type')}
              >
                <Ionicons
                  name={selectedAdmissionType === 'dummy' ? 'time-outline' : 'card-outline'}
                  size={13}
                  color={selectedAdmissionType ? theme.colors.primary : theme.colors.textSecondary}
                />
                <Text style={[styles.filterChipText, selectedAdmissionType && styles.filterChipTextActive]}>
                  {selectedAdmissionType === 'dummy'
                    ? 'Temporary'
                    : selectedAdmissionType === 'permanent'
                      ? 'Permanent'
                      : 'Admission type'}
                </Text>
                <Ionicons name="chevron-down" size={13} color={selectedAdmissionType ? theme.colors.primary : theme.colors.textSecondary} />
              </TouchableOpacity>
              {isArchive ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Filter by student status"
                  style={[styles.filterChip, !isWide && styles.filterChipMobile, selectedStatus && styles.filterChipActive]}
                  onPress={() => handleOpenFilter('status')}
                >
                  <Ionicons name="flag-outline" size={13} color={selectedStatus ? theme.colors.primary : theme.colors.textSecondary} />
                  <Text style={[styles.filterChipText, selectedStatus && styles.filterChipTextActive]}>
                    {selectedStatus ? statuses.find((s) => String(s.id) === String(selectedStatus))?.name : 'Status'}
                  </Text>
                  <Ionicons name="chevron-down" size={13} color={selectedStatus ? theme.colors.primary : theme.colors.textSecondary} />
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Sort student list"
                style={[styles.filterChip, !isWide && styles.filterChipMobile, hasCustomSort && styles.filterChipActive]}
                onPress={() => handleOpenFilter('sort')}
              >
                <Ionicons name="swap-vertical" size={13} color={hasCustomSort ? theme.colors.primary : theme.colors.textSecondary} />
                <Text style={[styles.filterChipText, hasCustomSort && styles.filterChipTextActive]}>
                  {sortBy === 'name' ? 'Sort: Name' : ({ roll_number: 'Sort: Roll', admission_no: 'Sort: Admission' } as const)[sortBy]}
                </Text>
                <Ionicons name={sortOrder === 'asc' ? 'chevron-up' : 'chevron-down'} size={13} color={hasCustomSort ? theme.colors.primary : theme.colors.textSecondary} />
              </TouchableOpacity>
              {isWide ? (
                <TouchableOpacity style={[styles.filterChip, styles.exportChip]} onPress={openExportModal}>
                  <Ionicons name="download-outline" size={14} color={theme.colors.primary} />
                  <Text style={[styles.filterChipText, styles.filterChipTextActive]}>Export</Text>
                </TouchableOpacity>
              ) : null}
            </TourScrollView>
            {!isWide ? (
              <PressScale
                onPress={openExportModal}
                accessibilityLabel="Export student list"
                style={styles.mobileExportButton}
              >
                <Ionicons name="download-outline" size={17} color={theme.colors.primary} />
                <Text style={styles.mobileExportButtonText}>Export</Text>
              </PressScale>
            ) : null}
          </View></TourTarget>

          <View style={[styles.resultSummaryRow, !isWide && styles.resultSummaryRowCompact]}>
            <View style={styles.resultSummaryCopy}>
              {loading && students.length > 0 ? (
                <ActivityIndicator size="small" color={theme.colors.primary} />
              ) : (
                <Ionicons name="list-outline" size={15} color={theme.colors.textSecondary} />
              )}
              <Text style={styles.resultSummaryText}>
                {loading && students.length > 0
                  ? 'Updating roster…'
                  : `Showing ${firstVisibleResult}–${lastVisibleResult} of ${pagination.total}`}
              </Text>
            </View>
            {showClassCountCard ? (
              <View style={styles.classSummaryPill}>
                <Ionicons name="people" size={13} color={theme.colors.primary} />
                <Text style={styles.classSummaryText} numberOfLines={1}>
                  {selectedClassName} · {selectedSectionName}: {pagination.total}
                </Text>
              </View>
            ) : null}
            {hasAdjustedView ? (
              <PressScale onPress={clearFilters} style={styles.resetButton}>
                <Ionicons name="refresh" size={13} color={theme.colors.primary} />
                <Text style={styles.resetButtonText}>Reset{activeFilterCount ? ` (${activeFilterCount})` : ''}</Text>
              </PressScale>
            ) : null}
          </View>

          {loadError ? (
            <Pressable onPress={() => fetchStudents()} style={styles.errorBanner}>
              <Ionicons name="warning-outline" size={16} color="#DC2626" />
              <Text style={styles.errorBannerText} numberOfLines={2}>{loadError}</Text>
              <Text style={styles.errorRetryText}>Retry</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      {loading && !refreshing && students.length === 0 && !loadError ?
        <View style={styles.initialLoading}>
          <LogoLoader size={54} color={theme.colors.primary} />
          <Text style={styles.initialLoadingTitle}>Loading student roster</Text>
          <Text style={styles.initialLoadingSubtitle}>Fetching the latest enrollment records…</Text>
        </View> :

        <Animated.FlatList
          onScroll={onScroll}
          scrollEventThrottle={16}
          data={students}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          windowSize={7}
          maxToRenderPerBatch={8}
          initialNumToRender={10}
          removeClippedSubviews={Platform.OS !== 'web'}
          contentContainerStyle={[styles.listContent, !isWide && styles.listContentCompact]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
          ListEmptyComponent={
            <Animated.View entering={FadeIn.duration(280)} style={styles.emptyState}>
              <View style={[styles.emptyIcon, clayCard(isDark, 'sm')]}>
                <Ionicons name="people-outline" size={36} color={theme.colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>
                {loadError ? 'Couldn’t load students' : isArchive ? 'No archived students' : 'No students found'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {loadError
                  ? 'Check your connection and retry the roster request.'
                  : isArchive
                  ? 'Passed-out and withdrawn records will appear here.'
                  : hasAdjustedView
                    ? 'Try clearing filters or refining your search.'
                    : 'Add your first student to build the roster.'}
              </Text>
              {loadError ? (
                <PressScale onPress={() => fetchStudents()} style={styles.emptySecondaryCta}>
                  <Ionicons name="refresh" size={17} color={theme.colors.primary} />
                  <Text style={styles.emptySecondaryCtaText}>Try again</Text>
                </PressScale>
              ) : hasAdjustedView ? (
                <PressScale onPress={clearFilters} style={styles.emptySecondaryCta}>
                  <Ionicons name="close-circle-outline" size={17} color={theme.colors.primary} />
                  <Text style={styles.emptySecondaryCtaText}>Clear search and filters</Text>
                </PressScale>
              ) : !isArchive ? (
                <PressScale
                  onPress={() => router.push('/admin/addStudent')}
                  style={styles.emptyCta}
                >
                  <Ionicons name="add" size={18} color="#fff" />
                  <Text style={styles.emptyCtaText}>Add student</Text>
                </PressScale>
              ) : null}
            </Animated.View>
          }
          ListFooterComponent={students.length > 0 ? () =>
            <View style={styles.pagination}>
              <TouchableOpacity
                disabled={page === 1}
                onPress={() => setPage((p) => Math.max(1, p - 1))}
                style={[styles.pageButton, page === 1 && { opacity: 0.5 }]}>

                <Ionicons name="chevron-back" size={18} color={theme.colors.text} />
                {isWide ? <Text style={styles.pageButtonText}>Previous</Text> : null}
              </TouchableOpacity>
              <View style={styles.pageInfoBlock}>
                <Text style={styles.pageInfo}>Page {page} of {pagination.total_pages || 1}</Text>
                <Text style={styles.pageInfoMeta}>{pagination.total} total</Text>
              </View>
              <TouchableOpacity
                disabled={page >= pagination.total_pages}
                onPress={() => setPage((p) => p + 1)}
                style={[styles.pageButton, page >= pagination.total_pages && { opacity: 0.5 }]}>

                {isWide ? <Text style={styles.pageButtonText}>Next</Text> : null}
                <Ionicons name="chevron-forward" size={18} color={theme.colors.text} />
              </TouchableOpacity>
            </View> :
            null} />

      }
      {/* Filter Modal */}
      <Modal
        visible={filterModal.visible}
        transparent
        animationType={isWide ? 'fade' : 'slide'}
        onRequestClose={() => setFilterModal({ visible: false, type: null })}>

        <TouchableOpacity
          style={[styles.modalOverlay, !isWide && styles.modalOverlayMobile]}
          activeOpacity={1}
          onPress={() => setFilterModal({ visible: false, type: null })}>

          <View style={[styles.modalContent, !isWide && styles.modalContentMobile]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select {currentFilterLabel()}</Text>
              <TouchableOpacity onPress={() => setFilterModal({ visible: false, type: null })}>
                <Ionicons name="close" size={24} color={theme.colors.text} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={currentFilterOptions()}
              keyExtractor={(item) => String(item.id)}
              renderItem={({ item }) =>
                <TouchableOpacity
                  style={[
                    styles.optionItem,
                    String(getSelectedValue()) === String(item.id) && styles.optionItemSelected]
                  }
                  onPress={() => handleSelectFilter(item.id)}>

                  <Text style={[
                    styles.optionText,
                    String(getSelectedValue()) === String(item.id) && styles.optionTextSelected]
                  }>
                    {item.name}
                  </Text>
                  {String(getSelectedValue()) === String(item.id) &&
                    <Ionicons name="checkmark" size={20} color={theme.colors.primary} />
                  }
                </TouchableOpacity>
              } />

          </View>
        </TouchableOpacity>
      </Modal>
      {/* Export Modal */}
      <Modal
        visible={exportModal}
        transparent
        animationType={isWide ? 'fade' : 'slide'}
        onRequestClose={() => !exporting && setExportModal(false)}>

        <TouchableOpacity
          style={[styles.modalOverlay, !isWide && styles.modalOverlayMobile]}
          activeOpacity={1}
          onPress={() => !exporting && setExportModal(false)}>

          <TouchableOpacity style={[styles.modalContent, !isWide && styles.modalContentMobile]} activeOpacity={1}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Export to Excel</Text>
              <TouchableOpacity onPress={() => !exporting && setExportModal(false)}>
                <Ionicons name="close" size={24} color={theme.colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.exportHint}>
              Choose a class and section, or leave them as “All”. The current admission-type filter is also applied.
            </Text>

            <Text style={styles.exportLabel}>Class</Text>
            <TouchableOpacity
              style={styles.exportSelect}
              onPress={() => setExportPicker(exportPicker === 'class' ? null : 'class')}>

              <Text style={styles.exportSelectText}>
                {exportClass ? classes.find((c) => c.id === exportClass)?.name : 'All Classes'}
              </Text>
              <Ionicons name={exportPicker === 'class' ? 'chevron-up' : 'chevron-down'} size={18} color={theme.colors.textSecondary} />
            </TouchableOpacity>
            {exportPicker === 'class' &&
              <View style={styles.exportDropdown}>
                <TourScrollView style={{ maxHeight: 180 }} nestedScrollEnabled>
                  {[{ id: null, name: 'All Classes' }, ...classes].map((c) =>
                    <TouchableOpacity
                      key={String(c.id)}
                      style={styles.exportOption}
                      onPress={() => {
                        setExportClass(c.id as string | null);
                        setExportPicker(null);
                      }}>

                      <Text style={[styles.optionText, String(exportClass) === String(c.id) && styles.optionTextSelected]}>{c.name}</Text>
                      {String(exportClass) === String(c.id) &&
                        <Ionicons name="checkmark" size={18} color={theme.colors.primary} />
                      }
                    </TouchableOpacity>
                  )}
                </TourScrollView>
              </View>
            }

            <Text style={styles.exportLabel}>Section</Text>
            <TouchableOpacity
              style={styles.exportSelect}
              onPress={() => setExportPicker(exportPicker === 'section' ? null : 'section')}>

              <Text style={styles.exportSelectText}>
                {exportSection ? sections.find((s) => s.id === exportSection)?.name : 'All Sections'}
              </Text>
              <Ionicons name={exportPicker === 'section' ? 'chevron-up' : 'chevron-down'} size={18} color={theme.colors.textSecondary} />
            </TouchableOpacity>
            {exportPicker === 'section' &&
              <View style={styles.exportDropdown}>
                <TourScrollView style={{ maxHeight: 180 }} nestedScrollEnabled>
                  {[{ id: null, name: 'All Sections' }, ...sections].map((s) =>
                    <TouchableOpacity
                      key={String(s.id)}
                      style={styles.exportOption}
                      onPress={() => {
                        setExportSection(s.id as string | null);
                        setExportPicker(null);
                      }}>

                      <Text style={[styles.optionText, String(exportSection) === String(s.id) && styles.optionTextSelected]}>{s.name}</Text>
                      {String(exportSection) === String(s.id) &&
                        <Ionicons name="checkmark" size={18} color={theme.colors.primary} />
                      }
                    </TouchableOpacity>
                  )}
                </TourScrollView>
              </View>
            }

            <TouchableOpacity
              style={[styles.exportButton, exporting && { opacity: 0.7 }]}
              onPress={handleExport}
              disabled={exporting}>

              {exporting ?
                <ActivityIndicator color="#fff" /> :
                <>
                  <Ionicons name="download-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
                  <Text style={styles.exportButtonText}>Download Excel</Text>
                </>
              }
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
      {/* Row actions keep destructive controls out of the primary roster scan path. */}
      <Modal
        visible={!!rowActionTarget}
        transparent
        animationType={isWide ? 'fade' : 'slide'}
        onRequestClose={() => setRowActionTarget(null)}
      >
        <Pressable
          style={[styles.modalOverlay, !isWide && styles.modalOverlayMobile]}
          onPress={() => setRowActionTarget(null)}
        >
          <Pressable
            style={[styles.actionSheet, !isWide && styles.actionSheetMobile, isDark && styles.actionSheetDark]}
            onPress={(event) => event.stopPropagation()}
          >
            {rowActionTarget ? (
              <>
                <View style={styles.actionSheetHeader}>
                  <StudentPhoto
                    photoUrl={rowActionTarget.photo_url || rowActionTarget.person?.photo_url || null}
                    displayName={actionTargetName}
                    size={46}
                    borderRadius={14}
                    style={{
                      backgroundColor: avatarTintFor(rowActionTarget.id || actionTargetName).bg,
                      marginRight: 12,
                    }}
                    fallbackTextStyle={{
                      color: avatarTintFor(rowActionTarget.id || actionTargetName).fg,
                      fontSize: 17,
                      fontWeight: '800',
                    }}
                  />
                  <View style={styles.actionSheetHeaderCopy}>
                    <Text style={styles.actionSheetName} numberOfLines={1}>{actionTargetName}</Text>
                    <Text style={styles.actionSheetMeta} numberOfLines={1}>
                      Admission {rowActionTarget.admission_no || '—'}
                    </Text>
                  </View>
                  <PressScale hitSlop={8} onPress={() => setRowActionTarget(null)} style={styles.actionSheetClose}>
                    <Ionicons name="close" size={18} color={theme.colors.textSecondary} />
                  </PressScale>
                </View>

                <Pressable
                  style={({ pressed }) => [styles.actionItem, pressed && styles.actionItemPressed]}
                  onPress={() => {
                    const studentId = rowActionTarget.id;
                    setRowActionTarget(null);
                    handleOpenStudent(studentId);
                  }}
                >
                  <View style={styles.actionItemIcon}>
                    <Ionicons name="create-outline" size={18} color={theme.colors.primary} />
                  </View>
                  <View style={styles.actionItemCopy}>
                    <Text style={styles.actionItemTitle}>View and edit student</Text>
                    <Text style={styles.actionItemSubtitle}>Open the complete admission record</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={17} color={theme.colors.textSecondary} />
                </Pressable>

                <View style={styles.actionDivider} />

                <Pressable
                  style={({ pressed }) => [styles.actionItem, pressed && styles.actionItemPressed]}
                  onPress={() => {
                    const target = rowActionTarget;
                    setRowActionTarget(null);
                    handleDelete(target);
                  }}
                >
                  <View style={[styles.actionItemIcon, styles.actionItemDangerIcon]}>
                    <Ionicons name="trash-outline" size={18} color="#DC2626" />
                  </View>
                  <View style={styles.actionItemCopy}>
                    <Text style={styles.actionItemDangerTitle}>Delete permanently</Text>
                    <Text style={styles.actionItemSubtitle}>Requires confirmation before anything is removed</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={17} color="#DC2626" />
                </Pressable>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
      {/* Permanent Delete Modal (same 3-step flow as the accounts dept) */}
      <HardDeleteStudentModal
        visible={!!deleteTarget}
        studentId={deleteTarget?.id ?? null}
        studentName={deleteTarget?.name ?? ''}
        studentSubtitle={deleteTarget?.subtitle}
        onClose={() => setDeleteTarget(null)}
        onDeleted={() => {
          const nm = deleteTarget?.name;
          setDeleteTarget(null);
          fetchStudents();
          alertCompat('Deleted', `${nm ?? 'Student'} and all associated data were permanently deleted.`);
        }} />

      {!isArchive && !isWide && (
        <PressScale
          onPress={() => router.push('/admin/addStudent')}
          style={[styles.fab, clay(isDark, 'lg')]}
        >
          <LinearGradient
            colors={['rgba(255,255,255,0.22)', 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0.6, y: 0.9 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <Ionicons name="add" size={28} color="#fff" />
          <Text style={styles.fabText}>Add student</Text>
        </PressScale>
      )}
    </View>);

}

const getStyles = (theme: Theme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  headerArea: {
    width: '100%',
    maxWidth: 1440,
    alignSelf: 'center',
    paddingHorizontal: Spacing.md,
    paddingTop: Platform.OS === 'web' ? 88 : 102,
    paddingBottom: Spacing.xs,
  },
  headerAreaCompact: {
    paddingHorizontal: 12,
    paddingTop: Platform.OS === 'web' ? 80 : 94,
    paddingBottom: 4,
  },
  overviewCard: {
    minHeight: 104,
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 18,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    marginBottom: 12,
    ...Platform.select({
      web: { boxShadow: '0 8px 24px rgba(15,23,42,0.055)' } as any,
      ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.055, shadowRadius: 20 },
      default: { elevation: 2 },
    }),
  },
  overviewCardCompact: {
    minHeight: 78,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  overviewAccent: {
    position: 'absolute',
    left: 0,
    top: 18,
    bottom: 18,
    width: 4,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
    backgroundColor: theme.colors.primary,
  },
  overviewIcon: {
    width: 52,
    height: 52,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    backgroundColor: theme.colors.primary + '12',
    borderWidth: 1,
    borderColor: theme.colors.primary + '20',
  },
  overviewIconCompact: {
    width: 42,
    height: 42,
    borderRadius: 14,
    marginRight: 10,
  },
  overviewCopy: {
    flex: 1,
    minWidth: 0,
  },
  overviewEyebrow: {
    fontSize: 9.5,
    lineHeight: 13,
    fontWeight: '800',
    letterSpacing: 0.9,
    color: theme.colors.primary,
    marginBottom: 2,
  },
  overviewSubtitle: {
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: '500',
    color: theme.colors.textSecondary,
    marginTop: 2,
    maxWidth: 540,
  },
  overviewActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
    marginLeft: 16,
  },
  overviewActionsCompact: {
    marginLeft: 8,
    gap: 6,
  },
  addStudentButton: {
    minHeight: 40,
    borderRadius: 13,
    paddingHorizontal: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    overflow: 'hidden',
    ...Platform.select({
      web: { boxShadow: '0 7px 16px rgba(79,70,229,0.20)' } as any,
      ios: { shadowColor: '#4F46E5', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.2, shadowRadius: 12 },
      default: { elevation: 4 },
    }),
  },
  addStudentButtonText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '800',
  },
  bulkUpdateButton: {
    minHeight: 40,
    borderRadius: 13,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: theme.colors.primary + '0D',
    borderWidth: 1,
    borderColor: theme.colors.primary + '2E',
  },
  bulkUpdateButtonText: {
    color: theme.colors.primary,
    fontSize: 12.5,
    fontWeight: '800',
  },
  discoveryPanel: {
    borderRadius: Radii.xl,
    padding: 12,
    paddingBottom: 10,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...Platform.select({
      web: { boxShadow: '0 5px 18px rgba(15,23,42,0.035)' } as any,
      ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.035, shadowRadius: 14 },
      default: { elevation: 1 },
    }),
  },
  discoveryPanelCompact: {
    padding: 10,
    paddingBottom: 9,
    borderRadius: 18,
  },
  metaLeft: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexShrink: 1,
  },
  metaCount: {
    fontSize: 27,
    lineHeight: 31,
    fontWeight: '800',
    color: theme.colors.textStrong,
    letterSpacing: -0.5,
    marginRight: 6,
  },
  metaLabel: {
    fontSize: 12.5,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  archiveLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 40,
    paddingHorizontal: 13,
    borderRadius: Radii.pill,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  archiveLinkCompact: {
    minHeight: 38,
    paddingHorizontal: 10,
  },
  archiveLinkActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  archiveLinkText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#C2410C',
  },
  archiveLinkTextActive: {
    color: '#1D4ED8',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radii.lg,
    paddingHorizontal: 8,
    height: 48,
    marginBottom: 12,
  },
  searchBoxCompact: {
    height: 46,
    marginBottom: 10,
  },
  searchIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.textSecondary + '0D',
  },
  searchIconWrapFocused: {
    backgroundColor: theme.colors.primary + '12',
  },
  searchInput: {
    flex: 1,
    marginLeft: 7,
    color: theme.colors.text,
    fontSize: 15,
  },
  searchClearButton: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.textSecondary + '0D',
  },
  filterRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  filterRowCompact: {
    alignItems: 'center',
    gap: 8,
    marginBottom: 7,
  },
  filterScroller: {
    flex: 1,
    minWidth: 0,
  },
  filterScroll: {
    paddingRight: 8,
    alignItems: 'center',
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: theme.colors.card,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radii.pill,
    marginRight: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    minHeight: 36,
  },
  filterChipMobile: {
    minHeight: 40,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  filterChipActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primary + '12'
  },
  filterChipText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    fontWeight: '600'
  },
  filterChipTextActive: {
    color: theme.colors.primary,
    fontWeight: '700'
  },
  exportChip: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primary + '12'
  },
  mobileExportButton: {
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 11,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: theme.colors.primary + '42',
    backgroundColor: theme.colors.primary + '0D',
  },
  mobileExportButtonText: {
    color: theme.colors.primary,
    fontSize: 11.5,
    fontWeight: '800',
  },
  resultSummaryRow: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
  },
  resultSummaryRowCompact: {
    flexWrap: 'wrap',
    rowGap: 6,
    paddingTop: 7,
  },
  resultSummaryCopy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    minWidth: 0,
  },
  resultSummaryText: {
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  classSummaryPill: {
    flexShrink: 1,
    maxWidth: 320,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: Radii.pill,
    backgroundColor: theme.colors.primary + '0D',
  },
  classSummaryText: {
    flexShrink: 1,
    fontSize: 10.5,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: theme.colors.primary + '0D',
  },
  resetButtonText: {
    color: theme.colors.primary,
    fontSize: 10.5,
    fontWeight: '800',
  },
  errorBanner: {
    marginTop: 9,
    minHeight: 38,
    borderRadius: 11,
    paddingHorizontal: 11,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorBannerText: {
    flex: 1,
    color: '#991B1B',
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: '600',
  },
  errorRetryText: {
    color: '#DC2626',
    fontSize: 11,
    fontWeight: '800',
  },
  exportHint: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginBottom: 16,
    lineHeight: 18
  },
  exportLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 6,
    marginTop: 4
  },
  exportSelect: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: Radii.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12
  },
  exportSelectText: {
    fontSize: 15,
    color: theme.colors.text,
    fontWeight: '500'
  },
  exportDropdown: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: Radii.md,
    marginTop: -6,
    marginBottom: 12,
    backgroundColor: theme.colors.background,
    overflow: 'hidden'
  },
  exportOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14
  },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primary,
    borderRadius: Radii.lg,
    paddingVertical: 15,
    marginTop: 8
  },
  exportButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700'
  },
  listContent: {
    width: '100%',
    maxWidth: 1440,
    alignSelf: 'center',
    paddingHorizontal: Spacing.md,
    paddingTop: 6,
    paddingBottom: 120
  },
  listContentCompact: {
    paddingHorizontal: 0,
    paddingTop: 8,
    paddingBottom: 112,
  },
  initialLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  initialLoadingTitle: {
    marginTop: 14,
    color: theme.colors.textStrong,
    fontSize: 14,
    fontWeight: '700',
  },
  initialLoadingSubtitle: {
    marginTop: 4,
    color: theme.colors.textSecondary,
    fontSize: 11.5,
    textAlign: 'center',
  },
  emptyState: {
    paddingTop: 48,
    paddingHorizontal: 28,
    alignItems: 'center',
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    ...Typography.title,
    color: theme.colors.textStrong,
    marginBottom: 6,
    textAlign: 'center',
  },
  emptySubtitle: {
    ...Typography.caption,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 280,
  },
  emptyCta: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: Radii.lg,
  },
  emptyCtaText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  emptySecondaryCta: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: Radii.lg,
    backgroundColor: theme.colors.primary + '0D',
    borderWidth: 1,
    borderColor: theme.colors.primary + '24',
  },
  emptySecondaryCtaText: {
    color: theme.colors.primary,
    fontSize: 12.5,
    fontWeight: '700',
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
    paddingBottom: 20
  },
  pageButton: {
    minWidth: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 12,
    flexDirection: 'row',
    gap: 5,
    justifyContent: 'center',
    alignItems: 'center'
  },
  pageButtonText: {
    color: theme.colors.text,
    fontSize: 11.5,
    fontWeight: '700',
  },
  pageInfoBlock: {
    marginHorizontal: 18,
    alignItems: 'center',
    minWidth: 86,
  },
  pageInfo: {
    fontSize: 12.5,
    color: theme.colors.text,
    fontWeight: '700',
    textAlign: 'center'
  },
  pageInfoMeta: {
    marginTop: 2,
    fontSize: 9.5,
    color: theme.colors.textSecondary,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalOverlayMobile: {
    justifyContent: 'flex-end',
    padding: 0,
  },
  modalContent: {
    backgroundColor: theme.colors.card,
    borderRadius: Radii.xxl,
    width: '100%',
    maxWidth: 480,
    maxHeight: '70%',
    padding: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.2,
        shadowRadius: 20
      },
      android: { elevation: 10 },
      web: { boxShadow: '0 22px 60px rgba(15,23,42,0.20)' } as any,
    })
  },
  modalContentMobile: {
    maxWidth: '100%',
    maxHeight: '82%',
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    padding: 18,
    paddingBottom: 28,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text
  },
  optionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderRadius: Radii.md
  },
  optionItemSelected: {
    backgroundColor: theme.colors.primary + '10'
  },
  optionText: {
    fontSize: 16,
    color: theme.colors.textSecondary
  },
  optionTextSelected: {
    color: theme.colors.primary,
    fontWeight: '600'
  },
  actionSheet: {
    width: '100%',
    maxWidth: 460,
    borderRadius: Radii.xxl,
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...Platform.select({
      web: { boxShadow: '0 22px 60px rgba(15,23,42,0.22)' } as any,
      ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 18 }, shadowOpacity: 0.2, shadowRadius: 30 },
      default: { elevation: 12 },
    }),
  },
  actionSheetMobile: {
    maxWidth: '100%',
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    padding: 16,
    paddingBottom: 26,
  },
  actionSheetDark: {
    backgroundColor: '#151B2B',
    borderColor: 'rgba(255,255,255,0.07)',
  },
  actionSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 14,
    marginBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  actionSheetHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  actionSheetName: {
    color: theme.colors.textStrong,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
  },
  actionSheetMeta: {
    color: theme.colors.textSecondary,
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: '600',
    marginTop: 2,
  },
  actionSheetClose: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.textSecondary + '0D',
  },
  actionItem: {
    minHeight: 62,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionItemPressed: {
    backgroundColor: theme.colors.primary + '0A',
  },
  actionItemIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
    backgroundColor: theme.colors.primary + '10',
  },
  actionItemDangerIcon: {
    backgroundColor: '#FEF2F2',
  },
  actionItemCopy: {
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },
  actionItemTitle: {
    color: theme.colors.textStrong,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  actionItemDangerTitle: {
    color: '#DC2626',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  actionItemSubtitle: {
    color: theme.colors.textSecondary,
    fontSize: 10.5,
    lineHeight: 15,
    fontWeight: '500',
    marginTop: 1,
  },
  actionDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.border,
    marginHorizontal: 10,
  },
  fab: {
    position: 'absolute',
    bottom: 28,
    right: 16,
    width: 132,
    height: 52,
    borderRadius: 18,
    backgroundColor: theme.colors.primary,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    borderBottomWidth: 1.5,
    borderBottomColor: 'rgba(0,0,0,0.14)',
  },
  fabText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
});
