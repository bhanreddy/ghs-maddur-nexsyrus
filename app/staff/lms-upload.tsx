import { TourTarget, TourScrollView } from '@/src/features/app-tour';
import React, { useState, useEffect, useMemo, useCallback, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  StatusBar,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import { useRouter } from 'expo-router';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  FadeInDown,
  FadeInUp,
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import KeyboardAwareScreen from '@/components/keyboard/KeyboardAwareScreen';
import StaffHeader from '../../src/components/StaffHeader';
import ViewAsBanner from '../../src/components/ViewAsBanner';
import { useEffectiveStaffId } from '../../src/hooks/useEffectiveStaffId';
import { api } from '../../src/services/apiClient';
import { TeacherService, TeacherClassAssignment } from '../../src/services/commonServices';
import { useTheme } from '../../src/hooks/useTheme';
import ClayInput from '../../src/components/ClayInput';
import { clayCard } from '../../src/theme/clayStyles';
import * as Haptics from '../../src/utils/haptics';

const FONT = Platform.OS === 'ios' ? 'SF Pro Display' : 'sans-serif';
const ACCENT = '#4F46E5';
const ACCENT_SOFT = '#6366F1';
const DESC_MAX = 400;

interface CreateCourseResponse {
  course: { id: string };
}

type FieldErrors = {
  assignment?: string;
  topic?: string;
  subTopic?: string;
  videoUrl?: string;
};

function extractYoutubeId(url: string): string | null {
  const t = url.trim();
  if (!t) return null;
  const patterns = [
    /youtu\.be\/([\w-]{6,})/i,
    /[?&]v=([\w-]{6,})/i,
    /youtube\.com\/shorts\/([\w-]{6,})/i,
    /youtube\.com\/embed\/([\w-]{6,})/i,
    /youtube\.com\/live\/([\w-]{6,})/i,
  ];
  for (const p of patterns) {
    const m = t.match(p);
    if (m?.[1]) return m[1];
  }
  return null;
}

function isValidYoutubeUrl(url: string) {
  return !!extractYoutubeId(url);
}

function PressScale({
  children,
  onPress,
  disabled,
  style,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  style?: any;
}) {
  const s = useSharedValue(1);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Pressable
      disabled={disabled}
      onPressIn={() => {
        if (!disabled) s.value = withTiming(0.97, { duration: 90 });
      }}
      onPressOut={() => {
        s.value = withTiming(1, { duration: 120 });
      }}
      onPress={onPress}
      hitSlop={6}
      style={style}
    >
      <Animated.View style={a}>{children}</Animated.View>
    </Pressable>
  );
}

function ProgressBar({ progress, isDark }: { progress: number; isDark: boolean }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withTiming(Math.max(0, Math.min(1, progress)), {
      duration: 380,
      easing: Easing.out(Easing.cubic),
    });
  }, [progress]);
  const fill = useAnimatedStyle(() => ({ transform: [{ scaleX: p.value }] }));
  return (
    <View
      style={[
        pbStyles.track,
        { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(79,70,229,0.12)' },
      ]}
    >
      <Animated.View
        style={[
          pbStyles.fill,
          { backgroundColor: ACCENT, transformOrigin: 'left' as any },
          fill,
        ]}
      >
        <LinearGradient
          colors={['rgba(255,255,255,0.35)', 'rgba(255,255,255,0)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      </Animated.View>
    </View>
  );
}

const pbStyles = StyleSheet.create({
  track: { height: 7, borderRadius: 4, overflow: 'hidden', width: '100%' },
  fill: { ...StyleSheet.absoluteFillObject, borderRadius: 4 },
});

const AssignmentChip = memo(function AssignmentChip({
  assign,
  isActive,
  onPress,
  isDark,
}: {
  assign: TeacherClassAssignment;
  isActive: boolean;
  onPress: () => void;
  isDark: boolean;
}) {
  return (
    <PressScale onPress={onPress}>
      <View
        style={[
          chipStyles.card,
          {
            backgroundColor: isActive
              ? isDark
                ? 'rgba(79,70,229,0.22)'
                : '#EEF2FF'
              : isDark
                ? 'rgba(255,255,255,0.04)'
                : '#F8FAFC',
            borderColor: isActive
              ? isDark
                ? 'rgba(129,140,248,0.55)'
                : 'rgba(79,70,229,0.35)'
              : isDark
                ? 'rgba(255,255,255,0.06)'
                : 'rgba(148,163,184,0.22)',
            borderBottomWidth: isActive ? 2.5 : 1,
            borderBottomColor: isActive
              ? isDark
                ? ACCENT_SOFT
                : ACCENT
              : isDark
                ? 'rgba(255,255,255,0.06)'
                : 'rgba(148,163,184,0.18)',
          },
          isActive && Platform.OS === 'ios'
            ? {
                shadowColor: ACCENT,
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: 0.16,
                shadowRadius: 10,
              }
            : null,
          isActive && Platform.OS === 'android' ? { elevation: 3 } : null,
        ]}
      >
        {isActive && (
          <LinearGradient
            colors={['rgba(255,255,255,0.4)', 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0.7, y: 1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
        )}
        <View
          style={[
            chipStyles.iconWrap,
            {
              backgroundColor: isActive
                ? isDark
                  ? 'rgba(99,102,241,0.35)'
                  : 'rgba(79,70,229,0.14)'
                : isDark
                  ? 'rgba(255,255,255,0.06)'
                  : 'rgba(15,23,42,0.05)',
            },
          ]}
        >
          <Text
            style={[
              chipStyles.initials,
              {
                color: isActive ? (isDark ? '#A5B4FC' : ACCENT) : isDark ? '#64748B' : '#94A3B8',
                fontFamily: FONT,
              },
            ]}
          >
            {(assign.subject_name || '?').slice(0, 1).toUpperCase()}
          </Text>
        </View>
        <View style={chipStyles.textCol}>
          <Text
            style={[
              chipStyles.classText,
              {
                color: isActive ? (isDark ? '#C7D2FE' : ACCENT) : isDark ? '#94A3B8' : '#475569',
                fontFamily: FONT,
                fontWeight: isActive ? '800' : '700',
              },
            ]}
            numberOfLines={1}
          >
            {assign.class_name}-{assign.section_name}
          </Text>
          <Text
            style={[
              chipStyles.subjectText,
              { color: isDark ? '#64748B' : '#94A3B8', fontFamily: FONT },
            ]}
            numberOfLines={1}
          >
            {assign.subject_name}
          </Text>
        </View>
        {isActive && (
          <View style={[chipStyles.check, { backgroundColor: ACCENT }]}>
            <Ionicons name="checkmark" size={10} color="#fff" />
          </View>
        )}
      </View>
    </PressScale>
  );
});

const chipStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    paddingRight: 28,
    borderRadius: 18,
    borderWidth: 1.5,
    gap: 10,
    minHeight: 56,
    marginRight: 10,
    overflow: 'hidden',
    position: 'relative',
    minWidth: 148,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  initials: { fontSize: 14, fontWeight: '800', letterSpacing: -0.2 },
  textCol: { flexShrink: 1, gap: 2 },
  classText: { fontSize: 14, letterSpacing: -0.2 },
  subjectText: { fontSize: 11, fontWeight: '600', letterSpacing: -0.1 },
  check: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

function SectionLabel({
  step,
  title,
  done,
  isDark,
  compact,
}: {
  step: number;
  title: string;
  done?: boolean;
  isDark: boolean;
  compact?: boolean;
}) {
  return (
    <View style={[secStyles.row, compact && { marginBottom: 0, flex: 1 }]}>
      <View
        style={[
          secStyles.badge,
          {
            backgroundColor: done
              ? isDark
                ? 'rgba(16,185,129,0.22)'
                : '#D1FAE5'
              : isDark
                ? 'rgba(99,102,241,0.22)'
                : '#E0E7FF',
          },
        ]}
      >
        {done ? (
          <Ionicons name="checkmark" size={12} color="#059669" />
        ) : (
          <Text
            style={[
              secStyles.badgeText,
              { color: isDark ? '#A5B4FC' : ACCENT, fontFamily: FONT },
            ]}
          >
            {step}
          </Text>
        )}
      </View>
      <Text
        style={[
          secStyles.title,
          { color: isDark ? '#CBD5E1' : '#334155', fontFamily: FONT },
        ]}
      >
        {title}
      </Text>
    </View>
  );
}

const secStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  badge: {
    width: 24,
    height: 24,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: { fontSize: 12, fontWeight: '800' },
  title: { fontSize: 14, fontWeight: '700', letterSpacing: -0.2 },
});

function SubmitDock({
  onPress,
  loading,
  disabled,
  readyLabel,
  subtitle,
  isDark,
}: {
  onPress: () => void;
  loading: boolean;
  disabled: boolean;
  readyLabel: string;
  subtitle: string;
  isDark: boolean;
}) {
  const blocked = loading || disabled;
  return (
    <View style={dockStyles.wrap}>
      <Text
        style={[
          dockStyles.sub,
          { color: isDark ? '#94A3B8' : '#64748B', fontFamily: FONT },
        ]}
        numberOfLines={1}
      >
        {subtitle}
      </Text>
      <PressScale onPress={onPress} disabled={blocked}>
        <View style={[dockStyles.shadow, blocked && { opacity: 0.55 }]}>
          <LinearGradient
            colors={blocked ? ['#94A3B8', '#64748B'] : [ACCENT_SOFT, ACCENT, '#3730A3']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={dockStyles.btn}
          >
            <LinearGradient
              colors={['rgba(255,255,255,0.22)', 'rgba(255,255,255,0)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Ionicons name={disabled ? 'lock-closed' : 'cloud-upload'} size={18} color="#fff" />
            )}
            <Text style={[dockStyles.text, { fontFamily: FONT }]}>
              {loading ? 'Publishing…' : readyLabel}
            </Text>
          </LinearGradient>
        </View>
      </PressScale>
    </View>
  );
}

const dockStyles = StyleSheet.create({
  wrap: { gap: 8 },
  sub: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: -0.1,
    paddingHorizontal: 8,
  },
  shadow: {
    borderRadius: 18,
    ...Platform.select({
      ios: {
        shadowColor: ACCENT,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.32,
        shadowRadius: 16,
      },
      android: { elevation: 5 },
      default: {},
    }),
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 17,
    borderRadius: 18,
    overflow: 'hidden',
    borderBottomWidth: 1.5,
    borderBottomColor: 'rgba(0,0,0,0.14)',
  },
  text: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: -0.2 },
});

export default function StaffLMSUpload() {
  const { theme, isDark } = useTheme();
  const styles = useMemo(() => getStyles(theme, isDark), [theme, isDark]);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isViewingAsAdmin, viewAsName } = useEffectiveStaffId();

  const [topic, setTopic] = useState('');
  const [subTopic, setSubTopic] = useState('');
  const [assignments, setAssignments] = useState<TeacherClassAssignment[]>([]);
  const [selectedAssignment, setSelectedAssignment] = useState<TeacherClassAssignment | null>(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [pasting, setPasting] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);

  const titleColor = theme.colors.text;
  const labelColor = isDark ? '#94A3B8' : '#64748B';
  const mutedColor = isDark ? '#64748B' : '#94A3B8';

  useEffect(() => {
    fetchMetadata();
  }, []);

  const fetchMetadata = async () => {
    try {
      setFetching(true);
      const data = await TeacherService.getMyClasses();
      // Dedupe identical class+subject pairs that can appear twice from API
      const seen = new Set<string>();
      const unique = data.filter((a) => {
        const key = `${a.class_id}-${a.section_id}-${a.subject_id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      setAssignments(unique);
      if (unique.length > 0) {
        setSelectedAssignment(unique[0]);
        setTopic(unique[0].subject_name);
      }
    } catch {
      alertCompat('Error', 'Could not load your assigned classes');
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    if (selectedAssignment) {
      setTopic(selectedAssignment.subject_name);
      setFieldErrors((e) => ({ ...e, assignment: undefined, topic: undefined }));
    }
  }, [selectedAssignment]);

  const youtubeId = useMemo(() => extractYoutubeId(videoUrl), [videoUrl]);
  const youtubeOk = !!youtubeId;

  useEffect(() => {
    setThumbFailed(false);
  }, [youtubeId]);

  const stepState = useMemo(() => {
    const classDone = !!selectedAssignment;
    const detailsDone = topic.trim().length > 0 && subTopic.trim().length > 0;
    const linkDone = youtubeOk;
    return { classDone, detailsDone, linkDone };
  }, [selectedAssignment, topic, subTopic, youtubeOk]);

  const completedSteps =
    (stepState.classDone ? 1 : 0) +
    (stepState.detailsDone ? 1 : 0) +
    (stepState.linkDone ? 1 : 0);

  const progress = completedSteps / 3;

  const canSubmit = useMemo(
    () =>
      !!selectedAssignment &&
      topic.trim().length > 0 &&
      subTopic.trim().length > 0 &&
      youtubeOk &&
      !loading &&
      assignments.length > 0,
    [selectedAssignment, topic, subTopic, youtubeOk, loading, assignments.length]
  );

  const clearError = useCallback((key: keyof FieldErrors) => {
    setFieldErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  }, []);

  const validate = useCallback((): boolean => {
    const next: FieldErrors = {};
    if (!selectedAssignment) next.assignment = 'Pick a class & subject';
    if (!topic.trim()) next.topic = 'Course title is required';
    if (!subTopic.trim()) next.subTopic = 'Material title is required';
    if (!videoUrl.trim()) next.videoUrl = 'Paste a YouTube link';
    else if (!youtubeOk) next.videoUrl = 'That doesn’t look like a YouTube link';
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }, [selectedAssignment, topic, subTopic, videoUrl, youtubeOk]);

  const handleSelectAssignment = useCallback((assign: TeacherClassAssignment) => {
    setSelectedAssignment(assign);
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, []);

  const handlePasteLink = useCallback(async () => {
    try {
      setPasting(true);
      const text = (await Clipboard.getStringAsync())?.trim() ?? '';
      if (!text) {
        alertCompat('Clipboard empty', 'Copy a YouTube link first, then tap Paste.');
        return;
      }
      setVideoUrl(text);
      clearError('videoUrl');
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      if (!extractYoutubeId(text)) {
        setFieldErrors((e) => ({
          ...e,
          videoUrl: 'Clipboard text isn’t a YouTube link',
        }));
      }
    } catch {
      alertCompat('Error', 'Couldn’t read clipboard');
    } finally {
      setPasting(false);
    }
  }, [clearError]);

  const handleClear = useCallback(() => {
    setSubTopic('');
    setVideoUrl('');
    setDescription('');
    setFieldErrors({});
    if (selectedAssignment) setTopic(selectedAssignment.subject_name);
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [selectedAssignment]);

  const handleUpload = async () => {
    if (!validate()) {
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      return;
    }
    if (!selectedAssignment) return;

    try {
      setLoading(true);
      const newCourse = await api.post<CreateCourseResponse>('/lms/courses', {
        title: topic.trim(),
        description:
          description.trim() ||
          `Course for ${selectedAssignment.class_name}-${selectedAssignment.section_name}`,
        class_id: selectedAssignment.class_id,
        subject_id: selectedAssignment.subject_id,
        is_published: true,
      });
      if (!newCourse?.course) {
        throw new Error('Failed to create course context');
      }

      await api.post(`/lms/courses/${newCourse.course.id}/materials`, {
        title: subTopic.trim(),
        description: description.trim(),
        material_type: 'video',
        content_url: videoUrl.trim(),
        sort_order: 1,
        is_published: true,
      });

      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      alertCompat('Published!', 'Your lesson is live for students.', [
        { text: 'Done', onPress: () => router.back() },
      ]);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      alertCompat('Error', 'Failed to upload content. ' + msg);
    } finally {
      setLoading(false);
    }
  };

  const dockSubtitle = canSubmit
    ? selectedAssignment
      ? `Ready for ${selectedAssignment.class_name}-${selectedAssignment.section_name}`
      : 'Ready to publish'
    : completedSteps === 0
      ? 'Start by picking a class'
      : `${completedSteps} of 3 complete — keep going`;

  const thumbUri = youtubeId
    ? `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`
    : null;

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={theme.colors.background}
      />
      <TourTarget id="screen.staff-lms-upload.overview"><StaffHeader title="Upload LMS Content" showBackButton={true} /></TourTarget>
      {isViewingAsAdmin && <ViewAsBanner name={viewAsName} />}

      {/* Soft ambient glow — static, painted once */}
      <View pointerEvents="none" style={styles.ambientWrap}>
        <View
          style={[
            styles.ambientBlob,
            {
              backgroundColor: isDark ? 'rgba(99,102,241,0.14)' : 'rgba(99,102,241,0.10)',
              top: 40,
              right: -60,
            },
          ]}
        />
        <View
          style={[
            styles.ambientBlob,
            {
              backgroundColor: isDark ? 'rgba(56,189,248,0.08)' : 'rgba(14,165,233,0.07)',
              bottom: 120,
              left: -80,
            },
          ]}
        />
      </View>

      <TourTarget id="screen.staff-lms-upload.workspace" style={{ flex: 1 }}><KeyboardAwareScreen
        variant="scroll"
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        bottomOffset={24}
        extraScrollPadding={24}
      >
        {/* Hero + progress */}
        <Animated.View
          entering={FadeInDown.delay(40).duration(320).easing(Easing.out(Easing.cubic))}
        >
          <View
            style={[
              styles.hero,
              clayCard(isDark, 'sm'),
              { backgroundColor: isDark ? '#1A2332' : '#F4F7FD' },
            ]}
          >
            <LinearGradient
              colors={
                isDark
                  ? ['rgba(255,255,255,0.04)', 'rgba(255,255,255,0)']
                  : ['rgba(255,255,255,0.65)', 'rgba(255,255,255,0)']
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 0.7, y: 1 }}
              style={[StyleSheet.absoluteFill, { borderRadius: 24 }]}
              pointerEvents="none"
            />
            <View style={styles.heroTop}>
              <View
                style={[
                  styles.heroIcon,
                  { backgroundColor: isDark ? 'rgba(99,102,241,0.28)' : '#E0E7FF' },
                ]}
              >
                <Ionicons name="videocam" size={22} color={isDark ? '#A5B4FC' : ACCENT} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.heroTitle, { color: titleColor, fontFamily: FONT }]}>
                  Share a lesson video
                </Text>
                <Text style={[styles.heroSub, { color: labelColor, fontFamily: FONT }]}>
                  Class → titles → YouTube link. Students see it right away.
                </Text>
              </View>
              <View
                style={[
                  styles.pctPill,
                  {
                    backgroundColor:
                      completedSteps === 3
                        ? isDark
                          ? 'rgba(16,185,129,0.22)'
                          : '#D1FAE5'
                        : isDark
                          ? 'rgba(99,102,241,0.22)'
                          : '#E0E7FF',
                  },
                ]}
              >
                <Text
                  style={[
                    styles.pctText,
                    {
                      color:
                        completedSteps === 3
                          ? '#059669'
                          : isDark
                            ? '#C7D2FE'
                            : ACCENT,
                      fontFamily: FONT,
                    },
                  ]}
                >
                  {Math.round(progress * 100)}%
                </Text>
              </View>
            </View>

            <View style={styles.progressBlock}>
              <ProgressBar progress={progress} isDark={isDark} />
              <View style={styles.stepLabels}>
                {(['Class', 'Details', 'Link'] as const).map((label, i) => {
                  const done =
                    i === 0
                      ? stepState.classDone
                      : i === 1
                        ? stepState.detailsDone
                        : stepState.linkDone;
                  return (
                    <Text
                      key={label}
                      style={[
                        styles.stepLabel,
                        {
                          color: done
                            ? isDark
                              ? '#A5B4FC'
                              : ACCENT
                            : mutedColor,
                          fontFamily: FONT,
                          fontWeight: done ? '700' : '600',
                        },
                      ]}
                    >
                      {label}
                    </Text>
                  );
                })}
              </View>
            </View>
          </View>
        </Animated.View>

        {/* Form card */}
        <Animated.View
          entering={FadeInDown.delay(90).duration(340).easing(Easing.out(Easing.cubic))}
        >
          <View
            style={[
              styles.formCard,
              clayCard(isDark, 'lg'),
              { backgroundColor: isDark ? '#1A2332' : '#F4F7FD' },
            ]}
          >
            <LinearGradient
              colors={
                isDark
                  ? ['rgba(255,255,255,0.04)', 'rgba(255,255,255,0)']
                  : ['rgba(255,255,255,0.55)', 'rgba(255,255,255,0)']
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 0.6, y: 0.9 }}
              style={[StyleSheet.absoluteFill, { borderRadius: 32 }]}
              pointerEvents="none"
            />

            <View style={styles.cardTitleRow}>
              <View
                style={[
                  styles.titleIcon,
                  { backgroundColor: isDark ? 'rgba(59,130,246,0.2)' : '#DBEAFE' },
                ]}
              >
                <MaterialIcons
                  name="library-add"
                  size={22}
                  color={isDark ? '#93C5FD' : '#2563EB'}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardTitle, { color: titleColor, fontFamily: FONT }]}>
                  New content
                </Text>
                <Text style={[styles.cardSubtitle, { color: labelColor, fontFamily: FONT }]}>
                  Takes under a minute
                </Text>
              </View>
              {(subTopic.length > 0 || videoUrl.length > 0 || description.length > 0) && (
                <PressScale onPress={handleClear}>
                  <View
                    style={[
                      styles.clearBtn,
                      {
                        backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9',
                        borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0',
                      },
                    ]}
                  >
                    <Ionicons name="refresh" size={14} color={mutedColor} />
                    <Text style={[styles.clearText, { color: mutedColor, fontFamily: FONT }]}>
                      Reset
                    </Text>
                  </View>
                </PressScale>
              )}
            </View>

            {/* 1 — Class */}
            <View style={styles.fieldGroup}>
              <SectionLabel
                step={1}
                title="Class & subject"
                done={stepState.classDone}
                isDark={isDark}
              />

              {fetching ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator color={ACCENT} size="small" />
                  <Text style={[styles.hintText, { color: mutedColor, fontFamily: FONT }]}>
                    Loading your classes…
                  </Text>
                </View>
              ) : assignments.length > 0 ? (
                <TourScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chipsScroll}
                >
                  {assignments.map((assign) => (
                    <AssignmentChip
                      key={assign.assignment_id}
                      assign={assign}
                      isActive={selectedAssignment?.assignment_id === assign.assignment_id}
                      onPress={() => handleSelectAssignment(assign)}
                      isDark={isDark}
                    />
                  ))}
                </TourScrollView>
              ) : (
                <View
                  style={[
                    styles.emptyBox,
                    {
                      backgroundColor: isDark ? 'rgba(239,68,68,0.1)' : '#FEF2F2',
                      borderColor: isDark ? 'rgba(239,68,68,0.25)' : '#FECACA',
                    },
                  ]}
                >
                  <MaterialIcons name="info-outline" size={20} color="#EF4444" />
                  <Text style={[styles.emptyText, { fontFamily: FONT }]}>
                    No classes assigned yet. Ask admin to assign subjects to you.
                  </Text>
                </View>
              )}
              {fieldErrors.assignment ? (
                <Text style={[styles.errorText, { fontFamily: FONT }]}>
                  {fieldErrors.assignment}
                </Text>
              ) : null}

              {selectedAssignment && (
                <Animated.View entering={FadeInUp.duration(220)} style={styles.contextStrip}>
                  <LinearGradient
                    colors={
                      isDark
                        ? ['rgba(99,102,241,0.22)', 'rgba(79,70,229,0.12)']
                        : ['#E0E7FF', '#EEF2FF']
                    }
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.contextInner}
                  >
                    <Ionicons name="bookmark" size={14} color={isDark ? '#A5B4FC' : ACCENT} />
                    <Text
                      style={[
                        styles.contextText,
                        { color: isDark ? '#C7D2FE' : ACCENT, fontFamily: FONT },
                      ]}
                      numberOfLines={1}
                    >
                      Publishing to {selectedAssignment.class_name}-
                      {selectedAssignment.section_name} · {selectedAssignment.subject_name}
                    </Text>
                  </LinearGradient>
                </Animated.View>
              )}
            </View>

            <View style={[styles.divider, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(148,163,184,0.18)' }]} />

            {/* 2 — Details */}
            <View style={styles.fieldGroup}>
              <SectionLabel
                step={2}
                title="Lesson details"
                done={stepState.detailsDone}
                isDark={isDark}
              />

              <ClayInput
                label="Course title *"
                placeholder="e.g. Mathematics"
                value={topic}
                onChangeText={(t) => {
                  setTopic(t);
                  clearError('topic');
                }}
                isDark={isDark}
                icon="subject"
                containerStyle={{ marginBottom: fieldErrors.topic ? 6 : 14 }}
              />
              {fieldErrors.topic ? (
                <Text style={[styles.errorText, { fontFamily: FONT, marginTop: -6, marginBottom: 10 }]}>
                  {fieldErrors.topic}
                </Text>
              ) : null}

              <ClayInput
                label="Material title *"
                placeholder="e.g. Algebra — Quadratic Equations"
                value={subTopic}
                onChangeText={(t) => {
                  setSubTopic(t);
                  clearError('subTopic');
                }}
                isDark={isDark}
                icon="title"
                containerStyle={{ marginBottom: fieldErrors.subTopic ? 6 : 4 }}
              />
              {fieldErrors.subTopic ? (
                <Text style={[styles.errorText, { fontFamily: FONT }]}>
                  {fieldErrors.subTopic}
                </Text>
              ) : (
                <Text style={[styles.hintUnder, { color: mutedColor, fontFamily: FONT }]}>
                  This is the lesson name students see
                </Text>
              )}
            </View>

            <View style={[styles.divider, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(148,163,184,0.18)' }]} />

            {/* 3 — Link */}
            <View style={styles.fieldGroup}>
              <View style={styles.linkHeader}>
                <SectionLabel
                  step={3}
                  title="YouTube video"
                  done={stepState.linkDone}
                  isDark={isDark}
                  compact
                />
                <PressScale onPress={handlePasteLink} disabled={pasting}>
                  <View
                    style={[
                      styles.pasteBtn,
                      {
                        backgroundColor: isDark ? 'rgba(99,102,241,0.18)' : '#EEF2FF',
                        borderColor: isDark ? 'rgba(129,140,248,0.35)' : 'rgba(79,70,229,0.22)',
                      },
                    ]}
                  >
                    {pasting ? (
                      <ActivityIndicator size="small" color={ACCENT} />
                    ) : (
                      <>
                        <Ionicons name="clipboard-outline" size={14} color={isDark ? '#A5B4FC' : ACCENT} />
                        <Text
                          style={[
                            styles.pasteText,
                            { color: isDark ? '#C7D2FE' : ACCENT, fontFamily: FONT },
                          ]}
                        >
                          Paste
                        </Text>
                      </>
                    )}
                  </View>
                </PressScale>
              </View>

              <ClayInput
                label="Video link *"
                placeholder="https://youtube.com/watch?v=…"
                value={videoUrl}
                onChangeText={(t) => {
                  setVideoUrl(t);
                  clearError('videoUrl');
                }}
                isDark={isDark}
                icon="smart-display"
                containerStyle={{ marginBottom: 6 }}
                suffix={
                  videoUrl.trim().length > 0 ? (
                    <View
                      style={[
                        styles.urlBadge,
                        {
                          backgroundColor: youtubeOk
                            ? isDark
                              ? 'rgba(16,185,129,0.2)'
                              : '#D1FAE5'
                            : isDark
                              ? 'rgba(239,68,68,0.18)'
                              : '#FEE2E2',
                        },
                      ]}
                    >
                      <Ionicons
                        name={youtubeOk ? 'checkmark-circle' : 'alert-circle'}
                        size={14}
                        color={youtubeOk ? '#10B981' : '#EF4444'}
                      />
                    </View>
                  ) : undefined
                }
              />
              {fieldErrors.videoUrl ? (
                <Text style={[styles.errorText, { fontFamily: FONT, marginBottom: 10 }]}>
                  {fieldErrors.videoUrl}
                </Text>
              ) : !youtubeOk ? (
                <Text style={[styles.hintUnder, { color: mutedColor, fontFamily: FONT }]}>
                  youtube.com or youtu.be links work
                </Text>
              ) : null}

              {youtubeOk && thumbUri && !thumbFailed && (
                <Animated.View entering={FadeIn.duration(280)} style={styles.previewCard}>
                  <View
                    style={[
                      styles.previewFrame,
                      {
                        backgroundColor: isDark ? '#0F172A' : '#0F172A',
                        borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)',
                      },
                    ]}
                  >
                    <Image
                      source={{ uri: thumbUri }}
                      style={styles.previewImage}
                      contentFit="cover"
                      transition={200}
                      onError={() => setThumbFailed(true)}
                    />
                    <View style={styles.playOverlay}>
                      <View style={styles.playBtn}>
                        <Ionicons name="play" size={22} color="#fff" style={{ marginLeft: 2 }} />
                      </View>
                    </View>
                    <LinearGradient
                      colors={['transparent', 'rgba(0,0,0,0.72)']}
                      style={styles.previewFade}
                      pointerEvents="none"
                    />
                    <View style={styles.previewMeta}>
                      <View style={styles.ytBadge}>
                        <Ionicons name="logo-youtube" size={12} color="#FF0000" />
                        <Text style={[styles.ytBadgeText, { fontFamily: FONT }]}>YouTube</Text>
                      </View>
                      <Text style={[styles.previewTitle, { fontFamily: FONT }]} numberOfLines={1}>
                        {subTopic.trim() || 'Lesson preview'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.previewOk}>
                    <Ionicons name="checkmark-circle" size={14} color="#10B981" />
                    <Text
                      style={[
                        styles.previewOkText,
                        { color: isDark ? '#34D399' : '#059669', fontFamily: FONT },
                      ]}
                    >
                      Link looks good — ready to publish
                    </Text>
                  </View>
                </Animated.View>
              )}
            </View>

            <View style={[styles.divider, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(148,163,184,0.18)' }]} />

            {/* Optional description */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.optionalLabel, { color: labelColor, fontFamily: FONT }]}>
                Description <Text style={{ fontWeight: '500' }}>(optional)</Text>
              </Text>
              <ClayInput
                label=""
                placeholder="A short note for students…"
                value={description}
                onChangeText={(t) => {
                  if (t.length <= DESC_MAX) setDescription(t);
                }}
                isDark={isDark}
                multiline
                icon="edit"
                containerStyle={{ marginBottom: 0 }}
              />
              <View style={styles.reasonMeta}>
                <Text style={[styles.hintText, { color: mutedColor, fontFamily: FONT }]}>
                  Helps students know what to expect
                </Text>
                <Text
                  style={[
                    styles.charCount,
                    {
                      color: description.length > DESC_MAX - 40 ? '#D97706' : mutedColor,
                      fontFamily: FONT,
                    },
                  ]}
                >
                  {description.length}/{DESC_MAX}
                </Text>
              </View>
            </View>
          </View>
        </Animated.View>
      </KeyboardAwareScreen></TourTarget>

      {/* Sticky upload dock — always in thumb zone */}
      <View
        style={[
          styles.dock,
          {
            paddingBottom: Math.max(insets.bottom, 12),
            backgroundColor: isDark ? 'rgba(11,15,25,0.92)' : 'rgba(248,250,252,0.94)',
            borderTopColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(148,163,184,0.2)',
          },
        ]}
      >
        <SubmitDock
          onPress={handleUpload}
          loading={loading}
          disabled={!canSubmit}
          readyLabel={canSubmit ? 'Publish to students' : 'Complete steps to unlock'}
          subtitle={dockSubtitle}
          isDark={isDark}
        />
      </View>
    </View>
  );
}

const getStyles = (theme: any, isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    ambientWrap: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 0,
    },
    ambientBlob: {
      position: 'absolute',
      width: 220,
      height: 220,
      borderRadius: 110,
      opacity: 1,
    },
    scroll: {
      padding: 16,
      paddingBottom: 16,
      gap: 14,
      zIndex: 1,
    },
    hero: {
      padding: 18,
      overflow: 'hidden',
      gap: 16,
    },
    heroTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    heroIcon: {
      width: 46,
      height: 46,
      borderRadius: 15,
      justifyContent: 'center',
      alignItems: 'center',
    },
    heroTitle: {
      fontSize: 17,
      fontWeight: '800',
      letterSpacing: -0.35,
      marginBottom: 2,
    },
    heroSub: {
      fontSize: 12.5,
      fontWeight: '500',
      lineHeight: 17,
      letterSpacing: -0.1,
    },
    pctPill: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 12,
      minWidth: 48,
      alignItems: 'center',
    },
    pctText: {
      fontSize: 13,
      fontWeight: '800',
      letterSpacing: -0.2,
    },
    progressBlock: { gap: 8 },
    stepLabels: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: 2,
    },
    stepLabel: { fontSize: 11, letterSpacing: -0.1 },
    formCard: {
      padding: 22,
      overflow: 'hidden',
    },
    cardTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 20,
    },
    titleIcon: {
      width: 48,
      height: 48,
      borderRadius: 16,
      justifyContent: 'center',
      alignItems: 'center',
    },
    cardTitle: {
      fontSize: 20,
      fontWeight: '800',
      letterSpacing: -0.4,
    },
    cardSubtitle: {
      fontSize: 13,
      fontWeight: '500',
      marginTop: 2,
      letterSpacing: -0.1,
    },
    clearBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 12,
      borderWidth: 1,
    },
    clearText: { fontSize: 12, fontWeight: '700' },
    fieldGroup: {
      marginBottom: 4,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      marginVertical: 18,
    },
    chipsScroll: {
      paddingVertical: 2,
      paddingRight: 8,
    },
    loadingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 12,
    },
    emptyBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: 14,
      borderRadius: 16,
      borderWidth: 1,
    },
    emptyText: {
      flex: 1,
      fontSize: 13,
      fontWeight: '600',
      color: '#EF4444',
      lineHeight: 18,
    },
    contextStrip: {
      marginTop: 12,
    },
    contextInner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 14,
    },
    contextText: {
      flex: 1,
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: -0.1,
    },
    linkHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      marginBottom: 12,
    },
    pasteBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 12,
      borderWidth: 1,
      minWidth: 72,
      justifyContent: 'center',
    },
    pasteText: { fontSize: 12, fontWeight: '700', letterSpacing: -0.1 },
    hintUnder: {
      fontSize: 12,
      fontWeight: '500',
      marginTop: 2,
      marginBottom: 4,
      paddingLeft: 4,
      letterSpacing: -0.1,
    },
    hintText: {
      fontSize: 12,
      fontWeight: '500',
      letterSpacing: -0.1,
    },
    errorText: {
      color: '#EF4444',
      fontSize: 12,
      fontWeight: '600',
      marginTop: 6,
      paddingLeft: 4,
    },
    urlBadge: {
      width: 26,
      height: 26,
      borderRadius: 10,
      justifyContent: 'center',
      alignItems: 'center',
    },
    previewCard: { marginTop: 8, gap: 8 },
    previewFrame: {
      height: 168,
      borderRadius: 18,
      overflow: 'hidden',
      borderWidth: 1,
      position: 'relative',
    },
    previewImage: {
      ...StyleSheet.absoluteFillObject,
    },
    playOverlay: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 2,
    },
    playBtn: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: 'rgba(0,0,0,0.55)',
      borderWidth: 2,
      borderColor: 'rgba(255,255,255,0.85)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    previewFade: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: 72,
      zIndex: 1,
    },
    previewMeta: {
      position: 'absolute',
      left: 12,
      right: 12,
      bottom: 12,
      zIndex: 3,
      gap: 6,
    },
    ytBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      alignSelf: 'flex-start',
      backgroundColor: 'rgba(255,255,255,0.95)',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
    },
    ytBadgeText: {
      fontSize: 10,
      fontWeight: '800',
      color: '#0F172A',
      letterSpacing: -0.1,
    },
    previewTitle: {
      color: '#fff',
      fontSize: 14,
      fontWeight: '700',
      letterSpacing: -0.2,
    },
    previewOk: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingLeft: 4,
    },
    previewOkText: {
      fontSize: 12,
      fontWeight: '600',
      letterSpacing: -0.1,
    },
    optionalLabel: {
      fontSize: 13,
      fontWeight: '700',
      letterSpacing: -0.1,
      marginBottom: 10,
    },
    reasonMeta: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 8,
      paddingHorizontal: 4,
    },
    charCount: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: -0.1,
    },
    dock: {
      paddingHorizontal: 16,
      paddingTop: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      zIndex: 2,
      ...Platform.select({
        ios: {
          shadowColor: '#0F172A',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: isDark ? 0.35 : 0.06,
          shadowRadius: 12,
        },
        android: { elevation: 8 },
        default: {},
      }),
    },
  });
