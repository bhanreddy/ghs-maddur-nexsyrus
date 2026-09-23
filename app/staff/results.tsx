import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import AppTextInput from '@/src/components/AppTextInput';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  AccessibilityInfo,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
  ViewStyle,
  useWindowDimensions,
} from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import KeyboardAwareScreen from '@/components/keyboard/KeyboardAwareScreen';
import { styles as themeInputStyles } from '@/src/theme/styles';
import { clayTokens } from '@/src/styles/clayTokens';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  FadeOutDown,
  FadeInDown,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
  Easing,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from '../../src/utils/haptics';
import StaffHeader from '../../src/components/StaffHeader';
import { STAFF_TAB_BAR_HEIGHT, staffTabBarReserve } from '../../src/components/StaffFooter';
import ViewAsBanner from '../../src/components/ViewAsBanner';
import { useEffectiveStaffId } from '../../src/hooks/useEffectiveStaffId';
import { StudentService } from '../../src/services/studentService';
import { ResultService, TeacherService, TeacherClassAssignment } from '@/src/services/commonServices';
import { StudentWithDetails } from '@/src/types/schema';
import { useTheme } from '../../src/hooks/useTheme';
import { Spacing, Theme } from '../../src/theme/themes';
import LogoLoader from '../../src/components/LogoLoader';
import StudentPhoto from '../../src/components/StudentPhoto';
import {
  AssessmentSchema,
  ComponentAssessmentInput,
  ComponentField,
  ResultRankingMethod,
  DEFAULT_CONSOLIDATED_MAX,
  EMPTY_COMPONENT_MARKS,
  calculateComponentAssessment,
  calculateConsolidatedAssessment,
  componentTotalMax,
  hasAnyComponentMark,
  isAbsentAssessmentInput,
  isComponentAssessmentAbsent,
  isComponentAssessmentComplete,
  isValidAssessmentInput,
  numericOrNullComponentMark,
  normalizeAssessmentInput,
  parseComponentMaximums,
  rankAssessmentScores,
  stringifyComponentMaximums,
  updateComponentAssessmentInput,
} from '../../src/utils/assessmentGrading';
import { SchoolSettingsService } from '../../src/services/schoolSettingsService';

// ─────────────────────────────────────────────────────────────────────────────
// Types & Constants
// ─────────────────────────────────────────────────────────────────────────────

import { ExamCategory, EXAM_CATEGORIES } from '@/src/constants/examCategories';

const EXTRA_SUB_EXAMS_KEY = 'staffExtraSubExams';
const ASSESSMENT_DRAFTS_KEY = 'staffAssessmentDraftsV1';

interface AssessmentDraft {
  consolidatedMaxMarks: string;
  componentMaximums: Record<ComponentField, string>;
  consolidatedByStudent: Record<string, string>;
  componentByStudent: Record<string, ComponentAssessmentInput>;
}

interface PersistedAssessmentState {
  schemas: Record<string, AssessmentSchema>;
  drafts: Record<string, AssessmentDraft>;
}

const emptyAssessmentDraft = (consolidatedMaximum = DEFAULT_CONSOLIDATED_MAX): AssessmentDraft => ({
  consolidatedMaxMarks: String(consolidatedMaximum),
  componentMaximums: stringifyComponentMaximums(),
  consolidatedByStudent: {},
  componentByStudent: {},
});

const COMPONENT_FIELDS: { field: ComponentField; label: string; shortLabel: string }[] = [
  { field: 'participation', label: "Children's Participation Responses", shortLabel: 'Participation' },
  { field: 'writtenWork', label: 'Written Work', shortLabel: 'Written' },
  { field: 'projectWork', label: 'Project Work', shortLabel: 'Project' },
  { field: 'slipTest', label: 'Slip Test', shortLabel: 'Slip Test' },
];

function clayInset(isDark: boolean): any {
  if (Platform.OS === 'web') {
    const innerLo = isDark ? 'rgba(0,0,0,0.4)' : 'rgba(166,180,200,0.45)';
    const innerHi = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.95)';
    return {
      boxShadow: `inset 4px 4px 8px ${innerLo}, inset -4px -4px 8px ${innerHi}`,
    } as ViewStyle;
  }
  return {
    borderWidth: 1,
    borderColor: isDark ? 'rgba(0,0,0,0.22)' : 'rgba(148,163,184,0.20)',
  };
}

function PressScale({
  children,
  onPress,
  disabled = false,
  style,
  accessibilityLabel,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  style?: ViewStyle;
  accessibilityLabel?: string;
}) {
  const [focused, setFocused] = useState(false);
  const reduceMotion = useReducedMotion();
  const pressScale = useSharedValue(1);
  const hoverScale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: reduceMotion ? 0 : (1 - hoverScale.value) * 160 },
      { scale: pressScale.value * hoverScale.value },
    ],
  }));

  const handlePress = () => {
    if (!onPress || disabled) return;
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress();
  };

  return (
    <Pressable
      disabled={disabled}
      onPress={handlePress}
      onPressIn={() => {
        if (!disabled && !reduceMotion) pressScale.value = withTiming(0.982, { duration: 85 });
      }}
      onPressOut={() => {
        pressScale.value = reduceMotion
          ? 1
          : withSpring(1, { damping: 20, stiffness: 340, mass: 0.55 });
      }}
      onHoverIn={() => {
        if (!disabled && !reduceMotion && Platform.OS === 'web') {
          hoverScale.value = withTiming(1.008, { duration: 150 });
        }
      }}
      onHoverOut={() => {
        hoverScale.value = reduceMotion ? 1 : withTiming(1, { duration: 150 });
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      style={[
        Platform.OS === 'web' && ({ cursor: disabled ? 'not-allowed' : 'pointer' } as object),
        Platform.OS === 'web' && focused && webFocusRing,
      ]}
    >
      <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>
    </Pressable>
  );
}

const webFocusRing = {
  outlineColor: '#6366F1',
  outlineOffset: 3,
  outlineStyle: 'solid',
  outlineWidth: 2,
  borderRadius: 18,
} as object;

interface ResultsFilterOption {
  id: string;
  label: string;
}

function ResultsFilterDropdown({
  label,
  value,
  options,
  accent,
  onChange,
  mutedText,
  isDark,
  disabled = false,
  compact = false,
  halfWidth = false,
  dense = false,
  emptyText = 'No options available',
  footerAction,
}: {
  label: string;
  value: string | null;
  options: ResultsFilterOption[];
  accent: string;
  onChange: (id: string) => void;
  mutedText: string;
  isDark: boolean;
  disabled?: boolean;
  compact?: boolean;
  halfWidth?: boolean;
  dense?: boolean;
  emptyText?: string;
  footerAction?: { label: string; onPress: () => void };
}) {
  const [open, setOpen] = useState(false);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isCompact = width < 600;
  const selectedOption = options.find((option) => option.id === value);
  const displayValue = selectedOption?.label ?? emptyText;

  return (
    <View
      style={[
        filterDropdownStyles.wrap,
        compact && filterDropdownStyles.wrapCompact,
        halfWidth && filterDropdownStyles.wrapHalf,
        dense && filterDropdownStyles.wrapDense,
      ]}
    >
      {dense ? null : (
        <Text style={[filterDropdownStyles.label, { color: mutedText }]}>{label}</Text>
      )}
      <Pressable
        disabled={disabled}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${displayValue}`}
        accessibilityState={{ disabled, expanded: open }}
        style={({ hovered, pressed }) => [
          filterDropdownStyles.trigger,
          isDark && filterDropdownStyles.triggerDark,
          dense && filterDropdownStyles.triggerDense,
          value && { borderColor: `${accent}66` },
          (hovered || pressed) && !disabled && { borderColor: accent },
          disabled && filterDropdownStyles.disabled,
        ]}
      >
        <Text
          numberOfLines={1}
          style={[
            filterDropdownStyles.triggerText,
            { color: selectedOption ? (isDark ? '#F8FAFC' : '#1E293B') : mutedText },
          ]}
        >
          {displayValue}
        </Text>
        <Ionicons name="chevron-down" size={17} color={disabled ? mutedText : accent} />
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType={isCompact ? 'slide' : 'fade'}
        statusBarTranslucent
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          style={[
            filterDropdownStyles.overlay,
            isCompact && filterDropdownStyles.overlayCompact,
            isCompact && { paddingBottom: Math.max(insets.bottom, 12) },
          ]}
          onPress={() => setOpen(false)}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            accessibilityViewIsModal
            style={[
              filterDropdownStyles.menu,
              isCompact && filterDropdownStyles.menuCompact,
              isDark && filterDropdownStyles.menuDark,
            ]}
          >
            <View style={[filterDropdownStyles.menuHeader, isDark && filterDropdownStyles.menuDividerDark]}>
              <View>
                <Text style={[filterDropdownStyles.menuEyebrow, { color: accent }]}>FILTER</Text>
                <Text style={[filterDropdownStyles.menuTitle, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>Select {label.toLowerCase()}</Text>
              </View>
              <Pressable onPress={() => setOpen(false)} hitSlop={8} accessibilityLabel={`Close ${label} menu`}>
                <Ionicons name="close" size={21} color={mutedText} />
              </Pressable>
            </View>

            <ScrollView style={filterDropdownStyles.optionList} keyboardShouldPersistTaps="handled">
              {options.map((option) => {
                const active = option.id === value;
                return (
                  <Pressable
                    key={option.id}
                    accessibilityRole="menuitem"
                    accessibilityState={{ selected: active }}
                    onPress={() => {
                      if (Platform.OS !== 'web') void Haptics.selectionAsync();
                      onChange(option.id);
                      setOpen(false);
                    }}
                    style={({ hovered, pressed }) => [
                      filterDropdownStyles.option,
                      isDark && filterDropdownStyles.optionDark,
                      active && { backgroundColor: `${accent}${isDark ? '24' : '14'}` },
                      (hovered || pressed) && { borderColor: `${accent}66` },
                    ]}
                  >
                    <Text
                      style={[
                        filterDropdownStyles.optionText,
                        { color: active ? accent : (isDark ? '#E2E8F0' : '#334155') },
                        active && filterDropdownStyles.optionTextActive,
                      ]}
                    >
                      {option.label}
                    </Text>
                    {active ? (
                      <View style={[filterDropdownStyles.checkCircle, { backgroundColor: accent }]}>
                        <Ionicons name="checkmark" size={13} color="#FFFFFF" />
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>

            {footerAction ? (
              <Pressable
                onPress={() => {
                  if (Platform.OS !== 'web') void Haptics.selectionAsync();
                  setOpen(false);
                  footerAction.onPress();
                }}
                style={[filterDropdownStyles.footerAction, isDark && filterDropdownStyles.menuDividerDark]}
              >
                <Ionicons name="add-circle-outline" size={19} color={accent} />
                <Text style={[filterDropdownStyles.footerActionText, { color: accent }]}>{footerAction.label}</Text>
              </Pressable>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const filterDropdownStyles = StyleSheet.create({
  wrap: {
    flexGrow: 1,
    flexBasis: 170,
    minWidth: 150,
    gap: 6,
  },
  wrapCompact: {
    width: '100%',
    minWidth: '100%',
    flexBasis: '100%',
  },
  wrapHalf: {
    minWidth: 140,
    flexBasis: '46%',
  },
  wrapDense: {
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 0,
  },
  label: {
    paddingLeft: 2,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  trigger: {
    minHeight: 48,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    borderRadius: clayTokens.radii.input,
    borderWidth: 1.5,
    borderColor: 'rgba(76,90,120,0.12)',
    backgroundColor: clayTokens.colors.inset.light,
    borderBottomWidth: 1.5,
    borderBottomColor: 'rgba(76,90,120,0.10)',
  },
  triggerDense: {
    minHeight: 40,
    paddingHorizontal: 10,
    borderRadius: 14,
  },
  triggerDark: {
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  triggerText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  disabled: {
    opacity: 0.5,
  },
  overlay: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,23,42,0.42)',
  },
  overlayCompact: {
    padding: 12,
    justifyContent: 'flex-end',
  },
  menu: {
    width: '100%',
    maxWidth: 380,
    maxHeight: '72%',
    overflow: 'hidden',
    borderRadius: 22,
    backgroundColor: '#F8FAFC',
    ...Platform.select({
      web: { boxShadow: '0 22px 60px rgba(15,23,42,0.24)' } as ViewStyle,
      default: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.25,
        shadowRadius: 24,
        elevation: 16,
      },
    }),
  },
  menuDark: {
    backgroundColor: '#182131',
  },
  menuCompact: {
    maxWidth: 560,
    maxHeight: '82%',
    borderRadius: 24,
  },
  menuHeader: {
    paddingHorizontal: 18,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(148,163,184,0.18)',
  },
  menuDividerDark: {
    borderColor: 'rgba(255,255,255,0.08)',
  },
  menuEyebrow: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 3,
  },
  menuTitle: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.25,
  },
  optionList: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  option: {
    minHeight: 46,
    paddingHorizontal: 12,
    marginVertical: 2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  optionDark: {
    backgroundColor: 'rgba(255,255,255,0.025)',
  },
  optionText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  optionTextActive: {
    fontWeight: '800',
  },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerAction: {
    minHeight: 52,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(148,163,184,0.18)',
  },
  footerActionText: {
    fontSize: 14,
    fontWeight: '800',
  },
});

function SchemaToggle({
  value,
  onChange,
  accent,
  mutedText,
  isDark,
}: {
  value: AssessmentSchema;
  onChange: (schema: AssessmentSchema) => void;
  accent: string;
  mutedText: string;
  isDark: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const options = [
    { key: 'component' as const, label: 'Components', icon: 'grid-outline' as const },
    { key: 'consolidated' as const, label: 'Consolidated', icon: 'document-text-outline' as const },
  ];
  const [trackW, setTrackW] = useState(0);
  const translateX = useSharedValue(0);
  const activeIndex = value === 'component' ? 0 : 1;
  const segmentW = trackW > 0 ? trackW / options.length : 0;

  useEffect(() => {
    if (segmentW > 0) {
      translateX.value = reduceMotion
        ? activeIndex * segmentW
        : withSpring(activeIndex * segmentW, { damping: 20, stiffness: 220, mass: 0.7 });
    }
  }, [activeIndex, reduceMotion, segmentW, translateX]);

  const indicatorStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }));

  return (
    <View
      onLayout={(event) => setTrackW(Math.max(0, event.nativeEvent.layout.width - 8))}
      style={[schemaToggleStyles.track, isDark && schemaToggleStyles.trackDark]}
      accessibilityRole="tablist"
    >
      {segmentW > 0 ? (
        <Animated.View
          style={[
            schemaToggleStyles.indicator,
            { width: segmentW, backgroundColor: accent },
            indicatorStyle,
          ]}
        />
      ) : null}
      {options.map((option) => {
        const active = value === option.key;
        return (
          <Pressable
            key={option.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => {
              if (Platform.OS !== 'web') void Haptics.selectionAsync();
              onChange(option.key);
            }}
            style={schemaToggleStyles.option}
          >
            <Ionicons name={option.icon} size={15} color={active ? '#FFFFFF' : mutedText} />
            <Text style={[schemaToggleStyles.label, { color: active ? '#FFFFFF' : mutedText }]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const schemaToggleStyles = StyleSheet.create({
  track: {
    flex: 1,
    minWidth: 210,
    flexDirection: 'row',
    minHeight: 44,
    padding: 4,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: 'rgba(148,163,184,0.14)',
  },
  trackDark: {
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  indicator: {
    position: 'absolute',
    top: 4,
    left: 4,
    bottom: 4,
    borderRadius: 11,
  },
  option: {
    flex: 1,
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    zIndex: 1,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
  },
});

function ProgressTrack({ progress, accent }: { progress: number; accent: string }) {
  const reduceMotion = useReducedMotion();
  const clamped = Math.max(0, Math.min(1, progress));
  const animatedProgress = useSharedValue(clamped);

  useEffect(() => {
    animatedProgress.value = reduceMotion
      ? clamped
      : withTiming(clamped, { duration: 320, easing: Easing.out(Easing.cubic) });
  }, [animatedProgress, clamped, reduceMotion]);

  const fillStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: animatedProgress.value }],
  }));

  return (
    <View
      style={progressStyles.track}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
    >
      <Animated.View
        style={[
          progressStyles.fill,
          { backgroundColor: accent },
          fillStyle,
        ]}
      />
    </View>
  );
}

const progressStyles = StyleSheet.create({
  track: {
    height: 8,
    borderRadius: 99,
    backgroundColor: 'rgba(76,90,120,0.12)',
    overflow: 'hidden',
  },
  fill: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 99,
    transformOrigin: 'left center',
  },
});

function useShimmer() {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) {
      cancelAnimation(progress);
      progress.value = 0.5;
      return;
    }
    progress.value = withRepeat(
      withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.ease) }),
      -1,
      false,
    );
    return () => cancelAnimation(progress);
  }, [progress, reduceMotion]);
  return progress;
}

function SkeletonBlock({
  shimmer,
  width,
  height,
  radius = 12,
}: {
  shimmer: SharedValue<number>;
  width: number | `${number}%`;
  height: number;
  radius?: number;
}) {
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 0.45 + 0.35 * Math.sin(shimmer.value * Math.PI),
  }));
  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: 'rgba(76,90,120,0.14)',
        },
        animatedStyle,
      ]}
    />
  );
}

function StudentsSkeleton() {
  const shimmer = useShimmer();
  const { width } = useWindowDimensions();
  const compact = width < 430;
  return (
    <View style={{ paddingHorizontal: 12, paddingBottom: 8, gap: 10 }}>
      {[0, 1, 2].map((index) => (
        <View key={index} style={skeletonCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <SkeletonBlock shimmer={shimmer} width={44} height={44} radius={14} />
            <View style={{ flex: 1, gap: 8 }}>
              <SkeletonBlock shimmer={shimmer} width={compact ? '72%' : 168} height={14} radius={8} />
              <SkeletonBlock shimmer={shimmer} width={88} height={10} radius={6} />
            </View>
            <SkeletonBlock shimmer={shimmer} width={compact ? 64 : 84} height={48} radius={14} />
          </View>
        </View>
      ))}
    </View>
  );
}

const skeletonCard: ViewStyle = {
  padding: 14,
  borderRadius: clayTokens.radii.card,
  borderWidth: 1,
  borderColor: 'rgba(148,163,184,0.14)',
  backgroundColor: 'rgba(255,255,255,0.35)',
};

type RosterFilter = 'all' | 'remaining' | 'entered' | 'absent';
type MarksInputKey = `${string}:${ComponentField | 'consolidated'}`;

function MarkField({
  value,
  max,
  label,
  accessibilityLabel,
  accent,
  isDark,
  filled,
  onChangeText,
  onSubmitEditing,
  onFocus,
  inputRef,
  compact = false,
}: {
  value: string;
  max: number | string;
  label?: string;
  accessibilityLabel: string;
  accent: string;
  isDark: boolean;
  filled: boolean;
  onChangeText: (text: string) => void;
  onSubmitEditing: () => void;
  onFocus: () => void;
  inputRef: (node: TextInput | null) => void;
  compact?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const fieldAbsent = isAbsentAssessmentInput(value);
  return (
    <View style={{ flexGrow: 1, flexBasis: compact ? '46%' : 72, minWidth: compact ? 118 : 72 }}>
      {label ? (
        <View style={markFieldStyles.labelRow}>
          <Text style={markFieldStyles.label} numberOfLines={1}>{label}</Text>
          <Text style={markFieldStyles.max}>/{max}</Text>
          <Pressable
            onPress={() => onChangeText(fieldAbsent ? '' : 'A')}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={fieldAbsent ? `Clear absent for ${label}` : `Mark ${label} absent`}
            accessibilityState={{ selected: fieldAbsent }}
          >
            <Text style={[markFieldStyles.abChip, fieldAbsent && markFieldStyles.abChipActive]}>
              AB
            </Text>
          </Pressable>
        </View>
      ) : null}
      <AppTextInput
        ref={inputRef}
        accessibilityLabel={accessibilityLabel}
        style={[
          markFieldStyles.input,
          compact && markFieldStyles.inputCompact,
          isDark && markFieldStyles.inputDark,
          filled && !fieldAbsent && { borderColor: `${accent}88`, backgroundColor: isDark ? `${accent}22` : `${accent}14` },
          fieldAbsent && markFieldStyles.inputAbsent,
          focused && { borderColor: fieldAbsent ? clayTokens.colors.absent.bg : accent },
        ]}
        placeholder="—"
        placeholderTextColor="#9AA3B8"
        keyboardType={Platform.OS === 'web' ? 'default' : 'decimal-pad'}
        inputMode="decimal"
        autoCapitalize="characters"
        maxLength={6}
        value={fieldAbsent ? 'AB' : value}
        selectTextOnFocus
        returnKeyType="next"
        blurOnSubmit={false}
        accessibilityHint="Enter marks, or tap AB if this component was missed"
        onChangeText={onChangeText}
        onSubmitEditing={onSubmitEditing}
        onFocus={() => {
          setFocused(true);
          onFocus();
        }}
        onBlur={() => setFocused(false)}
      />
    </View>
  );
}

const markFieldStyles = StyleSheet.create({
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    paddingHorizontal: 2,
    gap: 6,
  },
  label: {
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    color: clayTokens.colors.text.muted,
    letterSpacing: 0.2,
  },
  max: {
    fontSize: 11,
    fontWeight: '800',
    color: clayTokens.colors.text.muted,
  },
  abChip: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
    color: clayTokens.colors.text.muted,
    paddingHorizontal: 6,
    paddingVertical: 2,
    overflow: 'hidden',
    borderRadius: 8,
  },
  abChipActive: {
    color: clayTokens.colors.absent.bg,
    backgroundColor: clayTokens.colors.brand.roseSoft,
  },
  input: {
    height: 52,
    paddingVertical: 0,
    borderWidth: 1.5,
    borderColor: 'rgba(76,90,120,0.16)',
    borderRadius: clayTokens.radii.input,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.4,
    color: clayTokens.colors.text.primary,
    backgroundColor: clayTokens.colors.inset.light,
    borderBottomWidth: 1.5,
    borderBottomColor: 'rgba(76,90,120,0.12)',
  },
  inputCompact: {
    height: 48,
    fontSize: 18,
  },
  inputDark: {
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: clayTokens.colors.inset.dark,
    color: '#F8FAFC',
    borderBottomColor: 'rgba(0,0,0,0.35)',
  },
  inputAbsent: {
    borderColor: 'rgba(210,65,81,0.45)',
    backgroundColor: clayTokens.colors.brand.roseSoft,
    color: clayTokens.colors.absent.bg,
  },
});

const StudentAssessmentCard = React.memo(function StudentAssessmentCard({
  student,
  assessmentSchema,
  componentMarks,
  consolidatedValue,
  consolidatedMax,
  componentMaximums,
  result,
  rank,
  attendance,
  rankingMethod,
  entered,
  isAbsent,
  accent,
  isDark,
  styles,
  onComponentMarkChange,
  onConsolidatedMarkChange,
  onToggleAbsent,
  onFocusField,
  onSubmitField,
  registerInput,
}: {
  student: StudentWithDetails;
  assessmentSchema: AssessmentSchema;
  componentMarks: ComponentAssessmentInput;
  consolidatedValue: string;
  consolidatedMax: string;
  componentMaximums: Record<ComponentField, number>;
  result: { obtained: number; maximum: number; percentage: number; grade: string; gpa: number; rank: number };
  rank: number | undefined;
  attendance: number | null | undefined;
  rankingMethod: ResultRankingMethod;
  entered: boolean;
  isAbsent: boolean;
  accent: string;
  isDark: boolean;
  styles: Record<string, any>;
  onComponentMarkChange: (studentId: string, field: ComponentField, text: string) => void;
  onConsolidatedMarkChange: (studentId: string, text: string) => void;
  onToggleAbsent: (studentId: string) => void;
  onFocusField: (studentId: string, field: ComponentField | 'consolidated') => void;
  onSubmitField: (studentId: string, field: ComponentField | 'consolidated') => void;
  registerInput: (key: MarksInputKey, node: TextInput | null) => void;
}) {
  const displayName = student.person.display_name ??
    `${student.person.first_name} ${student.person.last_name}`;
  const componentResult = calculateComponentAssessment(componentMarks, componentMaximums);

  return (
    <View style={[styles.assessmentStudentCard, isAbsent && styles.assessmentStudentCardAbsent]}>
      <View style={styles.assessmentStudentHeader}>
        <View style={styles.studentAvatar}>
          <StudentPhoto
            photoUrl={student.person.photo_url}
            displayName={displayName}
            size={40}
            borderRadius={12}
            fallbackTextStyle={styles.studentAvatarText}
          />
        </View>
        <View style={styles.studentInfo}>
          <Text style={styles.studentName} numberOfLines={1}>{displayName}</Text>
          <Text style={styles.studentRoll}>#{student.admission_no}</Text>
        </View>
        {entered && !isAbsent ? (
          <View style={[styles.gradeBadge, { backgroundColor: `${accent}18` }]}>
            <Text style={[styles.gradeBadgeText, { color: accent }]}>{result.grade}</Text>
          </View>
        ) : null}
        <PressScale
          onPress={() => onToggleAbsent(student.id)}
          accessibilityLabel={isAbsent ? `Clear absent for ${displayName}` : `Mark ${displayName} absent`}
        >
          <View style={[styles.absentChip, isAbsent && styles.absentChipActive]}>
            <Ionicons
              name={isAbsent ? 'close-circle' : 'remove-circle-outline'}
              size={14}
              color={isAbsent ? '#FFFFFF' : clayTokens.colors.absent.bg}
            />
            <Text style={[styles.absentChipText, isAbsent && styles.absentChipTextActive]}>
              {isAbsent ? 'Absent' : 'Absent'}
            </Text>
          </View>
        </PressScale>
      </View>

      {assessmentSchema === 'component' ? (
        <View style={styles.componentGrid}>
          {COMPONENT_FIELDS.map(({ field, label, shortLabel }) => (
            <MarkField
              key={field}
              compact
              value={componentMarks[field]}
              max={componentMaximums[field]}
              label={shortLabel}
              accessibilityLabel={`${label}, maximum ${componentMaximums[field]}`}
              accent={accent}
              isDark={isDark}
              filled={componentMarks[field] !== ''}
              onChangeText={(text) => onComponentMarkChange(student.id, field, text)}
              onSubmitEditing={() => onSubmitField(student.id, field)}
              onFocus={() => onFocusField(student.id, field)}
              inputRef={(node) => registerInput(`${student.id}:${field}`, node)}
            />
          ))}
        </View>
      ) : (
        <View style={styles.consolidatedEntryRow}>
          <View style={styles.consolidatedCopy}>
            <Text style={styles.consolidatedLabel}>Marks obtained</Text>
            <Text style={styles.consolidatedHint}>Out of {consolidatedMax || DEFAULT_CONSOLIDATED_MAX}</Text>
          </View>
          <MarkField
            value={consolidatedValue}
            max={consolidatedMax || DEFAULT_CONSOLIDATED_MAX}
            accessibilityLabel={`Marks obtained by ${displayName}`}
            accent={accent}
            isDark={isDark}
            filled={consolidatedValue !== ''}
            onChangeText={(text) => onConsolidatedMarkChange(student.id, text)}
            onSubmitEditing={() => onSubmitField(student.id, 'consolidated')}
            onFocus={() => onFocusField(student.id, 'consolidated')}
            inputRef={(node) => registerInput(`${student.id}:consolidated`, node)}
          />
        </View>
      )}

      {entered ? (
        <View style={styles.liveTotalsRow}>
          <Text style={styles.liveTotalStrong}>
            {isAbsent
              ? 'Absent'
              : `${result.obtained}/${result.maximum}`}
          </Text>
          {!isAbsent ? (
            <>
              <View style={styles.liveDot} />
              <Text style={styles.liveTotalMuted}>{result.percentage.toFixed(1)}%</Text>
              <View style={styles.liveDot} />
              <Text style={styles.liveTotalMuted}>
                {assessmentSchema === 'component' ? `GPA ${result.gpa.toFixed(1)}` : result.grade}
              </Text>
              {assessmentSchema === 'component' ? (
                <>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveTotalMuted}>{componentResult.weightage.toFixed(1)}/20</Text>
                </>
              ) : null}
            </>
          ) : null}
          <View style={styles.liveDot} />
          <Text style={[styles.liveTotalStrong, { color: accent }]}>#{rank ?? '—'}</Text>
          {rankingMethod === 'attendance_tiebreak' ? (
            <>
              <View style={styles.liveDot} />
              <Text style={styles.liveTotalMuted}>
                {attendance == null ? 'Att —' : `${Number(attendance).toFixed(0)}% att`}
              </Text>
            </>
          ) : null}
        </View>
      ) : (
        <Text style={styles.pendingHint}>Next: fill marks, tap AB on a missed part, or Absent for the whole exam</Text>
      )}
    </View>
  );
});

function parseExamIndex(name: string, prefix: string): number | null {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = name.match(new RegExp(`^${escaped}-(\\d+)$`));
  return match ? parseInt(match[1], 10) : null;
}

function formatExamName(prefix: string, index: number): string {
  return `${prefix}-${index}`;
}

function sortSubExams(exams: string[], prefix: string): string[] {
  return [...exams].sort((a, b) => {
    const indexA = parseExamIndex(a, prefix);
    const indexB = parseExamIndex(b, prefix);
    if (indexA != null && indexB != null) return indexA - indexB;
    return a.localeCompare(b);
  });
}

function mergeSubExams(
  category: ExamCategory,
  extra: string[],
  fromDb: string[]
): string[] {
  const base = category.subExams ?? [];
  const merged = new Set([...base, ...extra, ...fromDb]);
  return sortSubExams([...merged], category.examPrefix);
}

function getNextExamName(category: ExamCategory, currentExams: string[]): string {
  let maxIndex = 0;
  for (const name of currentExams) {
    const index = parseExamIndex(name, category.examPrefix);
    if (index != null && index > maxIndex) maxIndex = index;
  }
  return formatExamName(category.examPrefix, maxIndex + 1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers: derive unique class-sections from flat assignment list
// ─────────────────────────────────────────────────────────────────────────────

interface ClassSectionGroup {
  class_section_id: string;
  class_id: string;
  section_id: string;
  label: string; // e.g. "10-A"
}

function getUniqueClassSections(
  assignments: TeacherClassAssignment[])
  : ClassSectionGroup[] {
  const seen = new Set<string>();
  const result: ClassSectionGroup[] = [];
  for (const a of assignments) {
    if (!seen.has(a.class_section_id)) {
      seen.add(a.class_section_id);
      result.push({
        class_section_id: a.class_section_id,
        class_id: a.class_id,
        section_id: a.section_id,
        label: `${a.class_name}-${a.section_name}`
      });
    }
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function UploadMarks() {
  const { theme, isDark } = useTheme();
  const { isViewingAsAdmin, viewAsName } = useEffectiveStaffId();
  const { width: viewportWidth } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const isPhone = viewportWidth < 600;
  const studentColumns = viewportWidth >= 1080 ? 2 : 1;
  const dashboardColumns = viewportWidth >= 1180 ? 3 : viewportWidth >= 720 ? 2 : 1;
  const styles = React.useMemo(
    () => getStyles(theme, isDark, dashboardColumns, isPhone, studentColumns),
    [theme, isDark, dashboardColumns, isPhone, studentColumns]
  );

  // ── view state ──────────────────────────────────────────────────────────────
  const [selectedCategory, setSelectedCategory] = useState<ExamCategory | null>(null);
  const [selectedSubExam, setSelectedSubExam] = useState('');
  const [extraSubExams, setExtraSubExams] = useState<Record<string, string[]>>({});
  const [dbSubExams, setDbSubExams] = useState<string[]>([]);
  const [assessmentSchemas, setAssessmentSchemas] = useState<Record<string, AssessmentSchema>>({});
  const [assessmentDrafts, setAssessmentDrafts] = useState<Record<string, AssessmentDraft>>({});
  const [assessmentStorageReady, setAssessmentStorageReady] = useState(false);
  const [rankingMethod, setRankingMethod] = useState<ResultRankingMethod>('competition');
  const [attendanceByStudent, setAttendanceByStudent] = useState<Record<string, number | null>>({});
  const [studentQuery, setStudentQuery] = useState('');
  const [rosterFilter, setRosterFilter] = useState<RosterFilter>('all');
  const [setupCollapsed, setSetupCollapsed] = useState(false);
  const [focusedStudentId, setFocusedStudentId] = useState<string | null>(null);
  const inputRefs = useRef<Partial<Record<MarksInputKey, TextInput | null>>>({});

  // ── assignment / filter state ────────────────────────────────────────────────
  const [assignments, setAssignments] = useState<TeacherClassAssignment[]>([]);

  /**
   * TWO-LEVEL FILTER
   * Level 1 – Class-Section (unique, derived from assignments)
   * Level 2 – Subject (filtered by selected class_section_id)
   * Together they resolve a single TeacherClassAssignment → selectedAssignment
   */
  const [selectedClassSectionId, setSelectedClassSectionId] = useState<string | null>(null);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);

  // Derived: unique class-sections
  const classSections = useMemo(
    () => getUniqueClassSections(assignments),
    [assignments]
  );

  // Derived: subjects available for the chosen class-section
  const availableSubjects = useMemo(
    () =>
      assignments.filter(
        (a) => a.class_section_id === selectedClassSectionId
      ),
    [assignments, selectedClassSectionId]
  );

  // Derived: resolved assignment (the single row we actually use for API calls)
  const selectedAssignment: TeacherClassAssignment | null = useMemo(
    () =>
      assignments.find(
        (a) =>
          a.class_section_id === selectedClassSectionId &&
          a.subject_id === selectedSubjectId
      ) ?? null,
    [assignments, selectedClassSectionId, selectedSubjectId]
  );

  // ── data state ───────────────────────────────────────────────────────────────
  const [students, setStudents] = useState<StudentWithDetails[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [marksLoading, setMarksLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const studentsRequestId = useRef(0);
  const marksRequestId = useRef(0);
  const dataLoading = studentsLoading || marksLoading;

  const activeSubExams = useMemo(() => {
    if (!selectedCategory) return [];
    return mergeSubExams(
      selectedCategory,
      extraSubExams[selectedCategory.key] ?? [],
      dbSubExams
    );
  }, [selectedCategory, extraSubExams, dbSubExams]);

  const schemaInstanceKey = useMemo(() => {
    if (!selectedCategory || !selectedClassSectionId || !selectedSubExam) return '';
    return `${selectedClassSectionId}:${selectedCategory.key}:${selectedSubExam}`;
  }, [selectedCategory, selectedClassSectionId, selectedSubExam]);

  const draftKey = useMemo(() => {
    if (!schemaInstanceKey || !selectedSubjectId) return '';
    return `${schemaInstanceKey}:${selectedSubjectId}`;
  }, [schemaInstanceKey, selectedSubjectId]);

  const assessmentSchema = assessmentSchemas[schemaInstanceKey] ?? 'consolidated';
  const defaultConsolidatedMaximum = selectedCategory?.key === 'sa_results'
    ? 80
    : DEFAULT_CONSOLIDATED_MAX;
  const currentDraft = useMemo(() => {
    const raw = assessmentDrafts[draftKey] ?? emptyAssessmentDraft(defaultConsolidatedMaximum);
    return {
      ...raw,
      componentMaximums: {
        ...stringifyComponentMaximums(),
        ...(raw.componentMaximums ?? {}),
      },
    };
  }, [assessmentDrafts, defaultConsolidatedMaximum, draftKey]);
  const componentMaximums = useMemo(
    () => parseComponentMaximums(currentDraft.componentMaximums),
    [currentDraft.componentMaximums],
  );
  const componentTotal = componentTotalMax(componentMaximums);

  const filledCount = useMemo(() => {
    if (assessmentSchema === 'component') {
      return Object.values(currentDraft.componentByStudent).filter(
        (entry) => isComponentAssessmentAbsent(entry) || isComponentAssessmentComplete(entry),
      ).length;
    }
    return Object.values(currentDraft.consolidatedByStudent).filter((value) => value !== '').length;
  }, [assessmentSchema, currentDraft]);

  const fillPercent = students.length === 0 ? 0 : filledCount / students.length;
  const remainingCount = Math.max(0, students.length - filledCount);
  const absentCount = useMemo(() => {
    return students.filter((student) => {
      if (assessmentSchema === 'component') {
        return isComponentAssessmentAbsent(currentDraft.componentByStudent[student.id] ?? EMPTY_COMPONENT_MARKS);
      }
      return isAbsentAssessmentInput(currentDraft.consolidatedByStudent[student.id]);
    }).length;
  }, [assessmentSchema, currentDraft, students]);
  const contextLabel = selectedAssignment
    ? `${selectedAssignment.class_name}-${selectedAssignment.section_name} · ${selectedAssignment.subject_name} · ${selectedSubExam}`
    : 'Choose class, subject and exam';

  const visibleStudents = useMemo(() => {
    const query = studentQuery.trim().toLowerCase();
    return students.filter((student) => {
      const displayName = (student.person.display_name ??
        `${student.person.first_name} ${student.person.last_name}`).toLowerCase();
      const roll = String(student.admission_no ?? '').toLowerCase();
      if (query && !displayName.includes(query) && !roll.includes(query)) return false;

      const componentMarks = currentDraft.componentByStudent[student.id] ?? EMPTY_COMPONENT_MARKS;
      const isAbsent = assessmentSchema === 'component'
        ? isComponentAssessmentAbsent(componentMarks)
        : isAbsentAssessmentInput(currentDraft.consolidatedByStudent[student.id]);
      const entered = assessmentSchema === 'component'
        ? isAbsent || isComponentAssessmentComplete(componentMarks)
        : (currentDraft.consolidatedByStudent[student.id] ?? '') !== '';

      if (rosterFilter === 'remaining') return !entered;
      if (rosterFilter === 'entered') return entered;
      if (rosterFilter === 'absent') return isAbsent;
      return true;
    });
  }, [assessmentSchema, currentDraft, rosterFilter, studentQuery, students]);

  const studentResults = useMemo(() => {
    return students.reduce<Record<string, ReturnType<typeof calculateConsolidatedAssessment> & { rank: number }>>(
      (acc, student) => {
        const result = assessmentSchema === 'component'
          ? calculateComponentAssessment(
              currentDraft.componentByStudent[student.id] ?? EMPTY_COMPONENT_MARKS,
              componentMaximums,
            )
          : calculateConsolidatedAssessment(
              currentDraft.consolidatedByStudent[student.id] ?? '',
              currentDraft.consolidatedMaxMarks,
            );
        acc[student.id] = { ...result, rank: 0 };
        return acc;
      },
      {},
    );
  }, [assessmentSchema, componentMaximums, currentDraft, students]);

  const studentRanks = useMemo(() => {
    const entered = students.flatMap((student) => {
      const isEntered = assessmentSchema === 'component'
        ? isComponentAssessmentAbsent(currentDraft.componentByStudent[student.id] ?? EMPTY_COMPONENT_MARKS) ||
          isComponentAssessmentComplete(currentDraft.componentByStudent[student.id] ?? EMPTY_COMPONENT_MARKS)
        : (currentDraft.consolidatedByStudent[student.id] ?? '') !== '';
      return isEntered ? [{
        id: student.id,
        score: studentResults[student.id].percentage,
        attendancePercentage: attendanceByStudent[student.id],
      }] : [];
    });
    return rankAssessmentScores(entered, rankingMethod);
  }, [assessmentSchema, attendanceByStudent, currentDraft, rankingMethod, studentResults, students]);

  const accentColor = selectedCategory?.color ?? '#7C6FFF';

  const getDisplaySubExams = useCallback(
    (cat: ExamCategory) => mergeSubExams(cat, extraSubExams[cat.key] ?? [], []),
    [extraSubExams]
  );

  // ── effects ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    AsyncStorage.getItem(EXTRA_SUB_EXAMS_KEY).then((raw) => {
      if (!raw) return;
      try {
        setExtraSubExams(JSON.parse(raw));
      } catch {
        // ignore corrupt storage
      }
    });
  }, []);

  useEffect(() => {
    SchoolSettingsService.getSettings()
      .then((settings) => {
        const saved = settings.result_ranking_method;
        setRankingMethod(saved === 'attendance_tiebreak' || saved === 'dense' ? saved : 'competition');
      })
      .catch(() => {
        // Backend and client both default safely to competition ranking.
      });
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(ASSESSMENT_DRAFTS_KEY)
      .then((raw) => {
        if (!raw) return;
        const parsed = JSON.parse(raw) as PersistedAssessmentState;
        setAssessmentSchemas(parsed.schemas ?? {});
        setAssessmentDrafts(parsed.drafts ?? {});
      })
      .catch(() => {
        // A corrupt local draft must never block marks entry.
      })
      .finally(() => setAssessmentStorageReady(true));
  }, []);

  useEffect(() => {
    if (!assessmentStorageReady) return;
    const snapshot: PersistedAssessmentState = {
      schemas: assessmentSchemas,
      drafts: assessmentDrafts,
    };
    const persistenceTimer = setTimeout(() => {
      AsyncStorage.setItem(ASSESSMENT_DRAFTS_KEY, JSON.stringify(snapshot)).catch(() => {
        // Server persistence remains available even if local storage is full.
      });
    }, 350);
    return () => clearTimeout(persistenceTimer);
  }, [assessmentDrafts, assessmentSchemas, assessmentStorageReady]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSubscription = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hideSubscription = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!selectedCategory) {
      setDbSubExams([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const exams = await ResultService.getExams();
        if (cancelled) return;
        const names = exams
          .filter((exam) => exam.exam_type === selectedCategory.key)
          .map((exam) => exam.name);
        setDbSubExams(names);
      } catch {
        if (!cancelled) setDbSubExams([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedCategory]);

  useEffect(() => {
    if (!selectedCategory || activeSubExams.length === 0) return;
    if (!activeSubExams.includes(selectedSubExam)) {
      setSelectedSubExam(activeSubExams[0]);
    }
  }, [activeSubExams, selectedCategory, selectedSubExam]);

  useEffect(() => {
    setSetupCollapsed(false);
    setStudentQuery('');
    setRosterFilter('all');
    setFocusedStudentId(null);
  }, [selectedCategory?.key]);

  useEffect(() => {
    if (!studentsLoading && students.length > 0 && selectedAssignment && selectedSubExam) {
      setSetupCollapsed(true);
    }
  }, [selectedAssignment, selectedSubExam, students.length, studentsLoading]);

  // 1. Load assignments on mount
  useEffect(() => {
    fetchAssignments();
  }, []);

  // 2. Auto-select first class-section when assignments load
  useEffect(() => {
    if (classSections.length > 0 && !selectedClassSectionId) {
      setSelectedClassSectionId(classSections[0].class_section_id);
    }
  }, [classSections, selectedClassSectionId]);

  // 3. Auto-select first subject when class-section changes
  useEffect(() => {
    if (availableSubjects.length > 0) {
      setSelectedSubjectId(availableSubjects[0].subject_id);
    } else {
      setSelectedSubjectId(null);
    }
  }, [selectedClassSectionId, availableSubjects]);

  // ── data fetchers ─────────────────────────────────────────────────────────────

  const fetchAssignments = async () => {
    try {
      const data = await TeacherService.getMyClasses();
      setAssignments(data);
    } catch {
      alertCompat('Error', 'Could not load your assigned classes.');
    }
  };

  const fetchExistingMarks = useCallback(async () => {
    if (!selectedAssignment || !selectedCategory || !selectedSubExam) return;
    const requestId = ++marksRequestId.current;
    try {
      setMarksLoading(true);
      const data = await ResultService.getMarks({
        class_section_id: selectedAssignment.class_section_id,
        exam_category: selectedCategory.key,
        sub_exam: selectedSubExam,
        subject_id: selectedAssignment.subject_id
      });
      if (requestId !== marksRequestId.current) return;
      const serverSchema = data.assessment_schema ?? 'consolidated';
      setAttendanceByStudent(Object.fromEntries(
        (data.attendance ?? []).map((row) => [
          row.student_id,
          row.attendance_percentage == null ? null : Number(row.attendance_percentage),
        ]),
      ));
      setAssessmentSchemas((previous) => ({
        ...previous,
        [schemaInstanceKey]: previous[schemaInstanceKey] ?? serverSchema,
      }));
      setAssessmentDrafts((previous) => {
        const existing = previous[draftKey] ?? emptyAssessmentDraft(defaultConsolidatedMaximum);
        const consolidatedByStudent = { ...existing.consolidatedByStudent };
        const componentByStudent = { ...existing.componentByStudent };

        data.marks?.forEach((mark) => {
          if (mark.is_absent) {
            consolidatedByStudent[mark.student_id] = 'A';
            componentByStudent[mark.student_id] = {
              participation: 'A',
              writtenWork: 'A',
              projectWork: 'A',
              slipTest: 'A',
            };
          } else if (mark.consolidated_marks_obtained != null) {
            consolidatedByStudent[mark.student_id] = String(mark.consolidated_marks_obtained);
          } else if (serverSchema === 'consolidated' && mark.marks_obtained != null) {
            consolidatedByStudent[mark.student_id] = String(mark.marks_obtained);
          }

          if (!mark.is_absent && (
            mark.participation_marks != null ||
            mark.written_work_marks != null ||
            mark.project_work_marks != null ||
            mark.slip_test_marks != null
          )) {
            const hasAnyComponentValue = [
              mark.participation_marks,
              mark.written_work_marks,
              mark.project_work_marks,
              mark.slip_test_marks,
            ].some((value) => value != null);
            const fromServer = (value: number | null | undefined) => {
              if (value != null) return String(value);
              return hasAnyComponentValue ? 'A' : '';
            };
            componentByStudent[mark.student_id] = {
              participation: fromServer(mark.participation_marks),
              writtenWork: fromServer(mark.written_work_marks),
              projectWork: fromServer(mark.project_work_marks),
              slipTest: fromServer(mark.slip_test_marks),
            };
          }
        });

        return {
          ...previous,
          [draftKey]: {
            consolidatedMaxMarks: String(data.consolidated_max_marks ?? DEFAULT_CONSOLIDATED_MAX),
            componentMaximums: stringifyComponentMaximums(parseComponentMaximums({
              participation: data.component_maximums?.participation,
              writtenWork: data.component_maximums?.written_work,
              projectWork: data.component_maximums?.project_work,
              slipTest: data.component_maximums?.slip_test,
            })),
            consolidatedByStudent,
            componentByStudent,
          },
        };
      });
    } catch {
    } finally {
      if (requestId === marksRequestId.current) setMarksLoading(false);
    }
  }, [defaultConsolidatedMaximum, draftKey, schemaInstanceKey, selectedAssignment, selectedCategory, selectedSubExam]);

  const fetchStudents = useCallback(async () => {
    if (!selectedAssignment) return;
    const requestId = ++studentsRequestId.current;
    try {
      setStudentsLoading(true);
      setStudents([]);
      const response = await StudentService.getAll<StudentWithDetails>({
        class_id: selectedAssignment.class_id,
        section_id: selectedAssignment.section_id,
        limit: 100,
        sort_by: 'roll_number',
        sort_order: 'asc',
      });
      if (requestId !== studentsRequestId.current) return;
      setStudents(response.data);
    } catch {
      alertCompat('Error', 'Failed to fetch students');
    } finally {
      if (requestId === studentsRequestId.current) setStudentsLoading(false);
    }
  }, [selectedAssignment]);

  // 4. Fetch students when resolved assignment changes
  useEffect(() => {
    if (selectedCategory && selectedAssignment) {
      fetchStudents();
    } else {
      studentsRequestId.current += 1;
      setStudentsLoading(false);
      setStudents([]);
    }
  }, [fetchStudents, selectedAssignment, selectedCategory]);

  // 5. Fetch existing marks when sub-exam or assignment changes
  useEffect(() => {
    if (assessmentStorageReady && selectedCategory && selectedAssignment && selectedSubExam) {
      fetchExistingMarks();
    } else {
      marksRequestId.current += 1;
      setMarksLoading(false);
    }
  }, [assessmentStorageReady, fetchExistingMarks, selectedAssignment, selectedCategory, selectedSubExam]);

  // ── handlers ──────────────────────────────────────────────────────────────────

  const handleBackToDashboard = () => {
    setSelectedCategory(null);
  };

  const updateCurrentDraft = useCallback((updater: (draft: AssessmentDraft) => AssessmentDraft) => {
    if (!draftKey) return;
    setAssessmentDrafts((previous) => ({
      ...previous,
      [draftKey]: updater(previous[draftKey] ?? emptyAssessmentDraft(defaultConsolidatedMaximum)),
    }));
  }, [defaultConsolidatedMaximum, draftKey]);

  const handleSchemaChange = (schema: AssessmentSchema) => {
    if (!schemaInstanceKey) return;
    setAssessmentSchemas((previous) => ({ ...previous, [schemaInstanceKey]: schema }));
  };

  const handleMaxMarksChange = (text: string) => {
    if (!/^\d{0,3}$/.test(text)) return;
    const maximum = Number(text);
    if (text !== '' && (maximum < 1 || maximum > 999)) return;
    updateCurrentDraft((draft) => ({ ...draft, consolidatedMaxMarks: text }));
  };

  const handleComponentMaximumChange = (field: ComponentField, text: string) => {
    if (!/^\d{0,3}$/.test(text)) return;
    const maximum = Number(text);
    if (text !== '' && (maximum < 1 || maximum > 999)) return;
    updateCurrentDraft((draft) => {
      const componentByStudent = { ...draft.componentByStudent };
      if (text !== '') {
        Object.entries(componentByStudent).forEach(([studentId, entry]) => {
          if (entry[field] !== '' && Number(entry[field]) > maximum) {
            componentByStudent[studentId] = { ...entry, [field]: String(maximum) };
          }
        });
      }
      return {
        ...draft,
        componentMaximums: {
          ...stringifyComponentMaximums(),
          ...draft.componentMaximums,
          [field]: text,
        },
        componentByStudent,
      };
    });
  };

  const handleConsolidatedMarkChange = useCallback((studentId: string, text: string) => {
    const normalizedText = normalizeAssessmentInput(text);
    updateCurrentDraft((draft) => {
      const maximum = Number(draft.consolidatedMaxMarks || DEFAULT_CONSOLIDATED_MAX);
      if (!isValidAssessmentInput(normalizedText, maximum)) return draft;
      return {
        ...draft,
        consolidatedByStudent: { ...draft.consolidatedByStudent, [studentId]: normalizedText },
      };
    });
  }, [updateCurrentDraft]);

  const handleComponentMarkChange = useCallback((studentId: string, field: ComponentField, text: string) => {
    const normalizedText = normalizeAssessmentInput(text);
    updateCurrentDraft((draft) => {
      const maximums = parseComponentMaximums(draft.componentMaximums);
      if (!isValidAssessmentInput(normalizedText, maximums[field])) return draft;
      return {
        ...draft,
        componentByStudent: {
          ...draft.componentByStudent,
          [studentId]: updateComponentAssessmentInput(
            draft.componentByStudent[studentId] ?? EMPTY_COMPONENT_MARKS,
            field,
            normalizedText,
          ),
        },
      };
    });
  }, [updateCurrentDraft]);

  const handleToggleAbsent = useCallback((studentId: string) => {
    if (assessmentSchema === 'component') {
      updateCurrentDraft((draft) => {
        const current = draft.componentByStudent[studentId] ?? EMPTY_COMPONENT_MARKS;
        const nextAbsent = !isComponentAssessmentAbsent(current);
        return {
          ...draft,
          componentByStudent: {
            ...draft.componentByStudent,
            [studentId]: nextAbsent
              ? { participation: 'A', writtenWork: 'A', projectWork: 'A', slipTest: 'A' }
              : EMPTY_COMPONENT_MARKS,
          },
        };
      });
    } else {
      updateCurrentDraft((draft) => {
        const current = draft.consolidatedByStudent[studentId] ?? '';
        const next = isAbsentAssessmentInput(current) ? '' : 'A';
        const maximum = Number(draft.consolidatedMaxMarks || DEFAULT_CONSOLIDATED_MAX);
        if (!isValidAssessmentInput(next, maximum)) return draft;
        return {
          ...draft,
          consolidatedByStudent: { ...draft.consolidatedByStudent, [studentId]: next },
        };
      });
    }
    if (Platform.OS !== 'web') void Haptics.selectionAsync();
  }, [assessmentSchema, updateCurrentDraft]);

  const registerInput = useCallback((key: MarksInputKey, node: TextInput | null) => {
    inputRefs.current[key] = node;
  }, []);

  const fieldOrder = useMemo<(ComponentField | 'consolidated')[]>(
    () => (assessmentSchema === 'component'
      ? COMPONENT_FIELDS.map((item) => item.field)
      : ['consolidated']),
    [assessmentSchema],
  );

  const focusField = useCallback((studentId: string, field: ComponentField | 'consolidated') => {
    setFocusedStudentId(studentId);
  }, []);

  const submitField = useCallback((studentId: string, field: ComponentField | 'consolidated') => {
    const fieldIndex = fieldOrder.indexOf(field);
    const nextField = fieldOrder[fieldIndex + 1];
    if (nextField) {
      const nextNode = inputRefs.current[`${studentId}:${nextField}`];
      if (nextNode) {
        nextNode.focus();
        return;
      }
    }
    const startIndex = visibleStudents.findIndex((student) => student.id === studentId) + 1;
    for (let index = startIndex; index < visibleStudents.length; index += 1) {
      const nextNode = inputRefs.current[`${visibleStudents[index].id}:${fieldOrder[0]}`];
      if (nextNode) {
        nextNode.focus();
        return;
      }
    }
    Keyboard.dismiss();
  }, [fieldOrder, visibleStudents]);

  const focusNextStudent = useCallback(() => {
    const currentIndex = focusedStudentId
      ? visibleStudents.findIndex((student) => student.id === focusedStudentId)
      : -1;
    const total = visibleStudents.length;
    for (let offset = 1; offset <= total; offset += 1) {
      const nextStudent = visibleStudents[(currentIndex + offset) % total];
      if (!nextStudent) continue;
      const nextNode = inputRefs.current[`${nextStudent.id}:${fieldOrder[0]}`];
      if (nextNode) {
        nextNode.focus();
        return;
      }
    }
  }, [fieldOrder, focusedStudentId, visibleStudents]);

  const handleAddSubExam = async () => {
    if (!selectedCategory) return;
    const nextExam = getNextExamName(selectedCategory, activeSubExams);
    const categoryKey = selectedCategory.key;
    const updatedExtras = {
      ...extraSubExams,
      [categoryKey]: [...(extraSubExams[categoryKey] ?? []), nextExam]
    };
    setExtraSubExams(updatedExtras);
    setSelectedSubExam(nextExam);
    try {
      await AsyncStorage.setItem(EXTRA_SUB_EXAMS_KEY, JSON.stringify(updatedExtras));
    } catch {
      // non-blocking if storage fails
    }
  };

  const handleSubmit = async () => {
    if (!selectedCategory || !selectedAssignment) return;
    const partialComponentEntry = assessmentSchema === 'component' && Object.values(currentDraft.componentByStudent)
      .some((entry) =>
        hasAnyComponentMark(entry) &&
        !isComponentAssessmentAbsent(entry) &&
        !isComponentAssessmentComplete(entry),
      );
    if (partialComponentEntry) {
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      alertCompat('Incomplete components', 'Complete all four component fields for each student you started.');
      return;
    }

    const filledMarks = students.flatMap((student) => {
      if (assessmentSchema === 'component') {
        const components = currentDraft.componentByStudent[student.id] ?? EMPTY_COMPONENT_MARKS;
        if (isComponentAssessmentAbsent(components)) {
          return [{ student_id: student.id, marks: null, is_absent: true }];
        }
        if (!isComponentAssessmentComplete(components)) return [];
        const result = calculateComponentAssessment(components, componentMaximums);
        return [{
          student_id: student.id,
          marks: result.obtained,
          is_absent: false,
          participation_marks: numericOrNullComponentMark(components.participation),
          written_work_marks: numericOrNullComponentMark(components.writtenWork),
          project_work_marks: numericOrNullComponentMark(components.projectWork),
          slip_test_marks: numericOrNullComponentMark(components.slipTest),
        }];
      }
      const marks = currentDraft.consolidatedByStudent[student.id] ?? '';
      return marks === '' ? [] : [{
        student_id: student.id,
        marks: isAbsentAssessmentInput(marks) ? null : Number(marks),
        is_absent: isAbsentAssessmentInput(marks),
      }];
    });
    if (filledMarks.length === 0) {
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      alertCompat('Warning', 'No marks entered.');
      return;
    }
    alertCompat(
      'Confirm Upload',
      `Upload ${selectedCategory.title} – ${selectedSubExam} marks for ${selectedAssignment.class_name}-${selectedAssignment.section_name} (${selectedAssignment.subject_name})?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Upload',
          onPress: async () => {
            try {
              setUploading(true);
              const uploadResult = await ResultService.upload({
                class_section_id: selectedAssignment.class_section_id,
                exam_category: selectedCategory.key,
                sub_exam: selectedSubExam,
                subject_id: selectedAssignment.subject_id,
                assessment_schema: assessmentSchema,
                max_marks: assessmentSchema === 'component'
                  ? componentTotal
                  : Number(currentDraft.consolidatedMaxMarks),
                component_maximums: assessmentSchema === 'component'
                  ? {
                      participation: componentMaximums.participation,
                      written_work: componentMaximums.writtenWork,
                      project_work: componentMaximums.projectWork,
                      slip_test: componentMaximums.slipTest,
                    }
                  : undefined,
                results: filledMarks
              });
              if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              void AccessibilityInfo.announceForAccessibility(
                `${uploadResult.uploaded_count} results uploaded successfully.`
              );
              if (uploadResult.failed_count > 0) {
                const firstFailure = uploadResult.results.find((result) => result.error)?.error;
                alertCompat(
                  'Partially uploaded',
                  `${uploadResult.uploaded_count} mark(s) saved and ${uploadResult.failed_count} failed.${firstFailure ? ` ${firstFailure}` : ''}`
                );
              } else {
                alertCompat('Success', 'Marks uploaded successfully!');
              }
            } catch (error: any) {
              if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              alertCompat('Could not upload marks', error?.message || 'Failed to upload marks');
            } finally {
              setUploading(false);
            }
          }
        }]

    );
  };

  // ── renders ───────────────────────────────────────────────────────────────────

  const renderDashboard = () =>
    <ScrollView
      contentContainerStyle={styles.dashboardContent}
      showsVerticalScrollIndicator={false}
      contentInsetAdjustmentBehavior="automatic"
    >
      <View style={styles.headerSection}>
        <LinearGradient
          colors={isDark ? ['rgba(255,255,255,0.06)', 'rgba(255,255,255,0)'] : ['rgba(255,255,255,0.75)', 'rgba(255,255,255,0)']}
          style={styles.cardSheen}
        />
        <View style={styles.heroIcon}>
          <Ionicons name="create-outline" size={24} color={theme.colors.primary} />
        </View>
        <View style={styles.heroCopy}>
          <Text style={styles.eyebrow}>RESULTS &amp; ASSESSMENTS</Text>
          <Text style={styles.pageTitle}>Enter marks faster</Text>
          <Text style={styles.pageSubtitle}>
            Pick a category, then type through the class. Absent is one tap. Upload stays in reach.
          </Text>
        </View>
        {!isPhone ? (
          <View style={styles.heroMeta}>
            <Text style={styles.heroMetaValue}>{EXAM_CATEGORIES.length}</Text>
            <Text style={styles.heroMetaLabel}>categories</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.sectionHeading}>
        <Text style={styles.sectionTitle}>Assessment categories</Text>
        <Text style={styles.sectionHint}>Choose one to continue</Text>
      </View>

      <View style={styles.gridContainer}>
        {EXAM_CATEGORIES.map((cat, index) =>
          <Animated.View
            key={cat.key}
            entering={reduceMotion ? undefined : FadeInDown.delay(index * 45).duration(260)}
            style={[
              styles.cardContainer,
              dashboardColumns === 3 && index >= 3 && styles.cardContainerWide,
              dashboardColumns === 2 && index === EXAM_CATEGORIES.length - 1 && styles.cardContainerCentered,
            ]}>

            <PressScale
              style={{ width: '100%' }}
              accessibilityLabel={`Open ${cat.title}`}
              onPress={() => {
                setSelectedCategory(cat);
                const exams = getDisplaySubExams(cat);
                if (exams.length) setSelectedSubExam(exams[0]);
              }}
            >
              <View style={styles.card}>
                <View style={[styles.cardAccent, { backgroundColor: cat.color }]} />
                {isPhone ? (
                  <View style={styles.mobileCardRow}>
                    <View style={[styles.iconBox, { backgroundColor: cat.color + (isDark ? '22' : '14') }]}>
                      <Ionicons name={cat.icon} size={23} color={cat.color} />
                    </View>
                    <View style={styles.mobileCardCopy}>
                      <Text style={styles.cardTitle}>{cat.title}</Text>
                      <Text style={styles.cardSubtitle} numberOfLines={2}>{cat.description}</Text>
                      <Text style={[styles.mobileExamCount, { color: cat.color }]}>
                        {getDisplaySubExams(cat).length} exams available
                      </Text>
                    </View>
                    <View style={[styles.arrowBox, { backgroundColor: cat.color + (isDark ? '22' : '12') }]}>
                      <Ionicons name="chevron-forward" size={18} color={cat.color} />
                    </View>
                  </View>
                ) : (
                  <>
                    <View style={styles.cardTopRow}>
                      <View style={[styles.iconBox, { backgroundColor: cat.color + (isDark ? '22' : '14') }]}>
                    <Ionicons name={cat.icon} size={23} color={cat.color} />
                  </View>
                      <View style={[styles.examCountPill, { backgroundColor: cat.color + (isDark ? '22' : '10') }]}>
                        <Text style={[styles.examCountText, { color: cat.color }]}>
                      {getDisplaySubExams(cat).length} exams
                    </Text>
                  </View>
                </View>

                <View style={styles.textContainer}>
                  <Text style={styles.cardTitle}>{cat.title}</Text>
                  <Text style={styles.cardSubtitle}>{cat.description}</Text>
                  {cat.subExams &&
                  <View style={styles.badgeRow}>
                    {getDisplaySubExams(cat).slice(0, 4).map((sub) =>
                          <View key={sub} style={[styles.badge, { borderColor: cat.color + '3D' }]}>
                        <Text style={[styles.badgeText, { color: cat.color }]}>{sub}</Text>
                      </View>
                    )}
                    {getDisplaySubExams(cat).length > 4 &&
                      <Text style={[styles.badgeMore, { color: cat.color }]}>
                        +{getDisplaySubExams(cat).length - 4}
                      </Text>
                    }
                  </View>
                  }
                </View>

                <View style={styles.cardActionRow}>
                  <Text style={[styles.cardActionText, { color: cat.color }]}>Enter marks</Text>
                      <View style={[styles.arrowBox, { backgroundColor: cat.color + (isDark ? '22' : '12') }]}>
                    <Ionicons name="arrow-forward" size={17} color={cat.color} />
                  </View>
                </View>
                  </>
                )}
              </View>
            </PressScale>
          </Animated.View>
        )}
      </View>
    </ScrollView>;

  const renderFilterSection = () => {
    if (assignments.length === 0) {
      return (
        <View style={styles.emptyFilterBanner}>
          <Ionicons name="warning-outline" size={16} color="#DC2626" />
          <Text style={styles.emptyFilterText}>No classes are assigned to you in the timetable.</Text>
        </View>
      );
    }

    const maxSummary = assessmentSchema === 'component'
      ? COMPONENT_FIELDS.map(({ field }) => currentDraft.componentMaximums[field]).join(' · ')
      : currentDraft.consolidatedMaxMarks;

    return (
      <View style={styles.filterStack}>
        <View style={styles.filterDropdownRow}>
          <ResultsFilterDropdown
            label="Class"
            value={selectedClassSectionId}
            options={classSections.map((classSection) => ({
              id: classSection.class_section_id,
              label: classSection.label,
            }))}
            accent={accentColor}
            mutedText={theme.colors.textSecondary}
            isDark={isDark}
            halfWidth={!setupCollapsed && isPhone}
            dense={setupCollapsed}
            onChange={setSelectedClassSectionId}
          />
          <ResultsFilterDropdown
            label="Subject"
            value={selectedSubjectId}
            options={availableSubjects.map((assignment) => ({
              id: assignment.subject_id,
              label: assignment.subject_name,
            }))}
            accent={accentColor}
            mutedText={theme.colors.textSecondary}
            isDark={isDark}
            halfWidth={!setupCollapsed && isPhone}
            dense={setupCollapsed}
            disabled={availableSubjects.length === 0}
            emptyText="No subjects for this class"
            onChange={setSelectedSubjectId}
          />
          <ResultsFilterDropdown
            label="Exam"
            value={selectedSubExam || null}
            options={activeSubExams.map((exam) => ({ id: exam, label: exam }))}
            accent={accentColor}
            mutedText={theme.colors.textSecondary}
            isDark={isDark}
            compact={!setupCollapsed && isPhone}
            dense={setupCollapsed}
            disabled={activeSubExams.length === 0}
            emptyText="No exams available"
            onChange={setSelectedSubExam}
            footerAction={selectedCategory ? {
              label: `Add ${getNextExamName(selectedCategory, activeSubExams)}`,
              onPress: handleAddSubExam,
            } : undefined}
          />
        </View>

        {setupCollapsed ? (
          <PressScale onPress={() => setSetupCollapsed(false)} accessibilityLabel="Edit marking scheme">
            <View style={styles.setupSummary}>
              <View style={styles.setupSummaryCopy}>
                <Text style={styles.setupSummaryLabel}>
                  {assessmentSchema === 'component' ? 'Components' : 'Consolidated'} · Max {maxSummary}
                </Text>
                <Text style={[styles.setupSummaryTotal, { color: accentColor }]}>
                  Total {assessmentSchema === 'component' ? componentTotal : currentDraft.consolidatedMaxMarks}
                </Text>
              </View>
              <Text style={[styles.setupSummaryAction, { color: accentColor }]}>Edit</Text>
            </View>
          </PressScale>
        ) : (
          <>
            <View style={styles.schemaRow}>
              <SchemaToggle
                value={assessmentSchema}
                onChange={handleSchemaChange}
                accent={accentColor}
                mutedText={theme.colors.textSecondary}
                isDark={isDark}
              />
              {assessmentSchema === 'consolidated' ? (
                <View style={styles.maxMarksCompact}>
                  <Text style={styles.maxMarksCompactLabel}>Max</Text>
                  <AppTextInput
                    style={styles.maxMarksInput}
                    value={currentDraft.consolidatedMaxMarks}
                    onChangeText={handleMaxMarksChange}
                    keyboardType="numeric"
                    maxLength={3}
                    selectTextOnFocus
                    accessibilityLabel="Maximum marks"
                  />
                </View>
              ) : null}
              {students.length > 0 ? (
                <PressScale onPress={() => setSetupCollapsed(true)} accessibilityLabel="Hide setup">
                  <View style={styles.doneSetupBtn}>
                    <Text style={[styles.doneSetupText, { color: accentColor }]}>Done</Text>
                  </View>
                </PressScale>
              ) : null}
            </View>
            {assessmentSchema === 'component' ? (
              <View style={styles.componentMaxPanel}>
                <View style={styles.componentMaxHeader}>
                  <Text style={styles.componentMaxTitle}>Maximum marks</Text>
                  <Text style={[styles.componentMaxTotal, { color: accentColor }]}>Total {componentTotal}</Text>
                </View>
                <View style={styles.componentMaxGrid}>
                  {COMPONENT_FIELDS.map(({ field, shortLabel }) => (
                    <View key={field} style={styles.componentMaxItem}>
                      <Text style={styles.componentMaxLabel} numberOfLines={1}>{shortLabel}</Text>
                      <AppTextInput
                        style={styles.componentMaxInput}
                        value={currentDraft.componentMaximums[field]}
                        onChangeText={(text) => handleComponentMaximumChange(field, text)}
                        keyboardType="numeric"
                        maxLength={3}
                        selectTextOnFocus
                        accessibilityLabel={`Maximum marks for ${shortLabel}`}
                      />
                    </View>
                  ))}
                </View>
                <Text style={styles.schemaHint}>
                  Use the number pad for marks. Tap AB on Slip Test (or any part) if that part was missed — the other marks still count. Use Absent only if they missed the whole exam.
                </Text>
              </View>
            ) : (
              <Text style={styles.schemaHint}>
                Type the final score, then Next. Use Absent only if they missed the whole exam.
              </Text>
            )}
          </>
        )}
      </View>
    );
  };

  const renderStudentAssessmentCard = (student: StudentWithDetails) => {
    const result = studentResults[student.id];
    if (!result) return null;
    const componentMarks = currentDraft.componentByStudent[student.id] ?? EMPTY_COMPONENT_MARKS;
    const isAbsent = assessmentSchema === 'component'
      ? isComponentAssessmentAbsent(componentMarks)
      : isAbsentAssessmentInput(currentDraft.consolidatedByStudent[student.id]);
    const entered = assessmentSchema === 'component'
      ? isAbsent || isComponentAssessmentComplete(componentMarks)
      : (currentDraft.consolidatedByStudent[student.id] ?? '') !== '';

    return (
      <StudentAssessmentCard
        key={student.id}
        student={student}
        assessmentSchema={assessmentSchema}
        componentMarks={componentMarks}
        consolidatedValue={currentDraft.consolidatedByStudent[student.id] ?? ''}
        consolidatedMax={currentDraft.consolidatedMaxMarks}
        componentMaximums={componentMaximums}
        result={result}
        rank={studentRanks[student.id]}
        attendance={attendanceByStudent[student.id]}
        rankingMethod={rankingMethod}
        entered={entered}
        isAbsent={isAbsent}
        accent={accentColor}
        isDark={isDark}
        styles={styles}
        onComponentMarkChange={handleComponentMarkChange}
        onConsolidatedMarkChange={handleConsolidatedMarkChange}
        onToggleAbsent={handleToggleAbsent}
        onFocusField={focusField}
        onSubmitField={submitField}
        registerInput={registerInput}
      />
    );
  };

  const uploadLabel = filledCount === 0
    ? 'Upload results'
    : `Upload ${filledCount}`;
  const canUpload = !dataLoading && !uploading && !!selectedAssignment && filledCount > 0;
  const rosterChips: { key: RosterFilter; label: string }[] = [
    { key: 'all', label: `All ${students.length}` },
    { key: 'remaining', label: `Left ${remainingCount}` },
    { key: 'entered', label: `Done ${filledCount}` },
    { key: 'absent', label: `Absent ${absentCount}` },
  ];
  const focusedStudent = students.find((student) => student.id === focusedStudentId);
  const focusedName = focusedStudent
    ? (focusedStudent.person.display_name ?? `${focusedStudent.person.first_name} ${focusedStudent.person.last_name}`)
    : null;

  const renderUploadForm = () =>
    <>
      <KeyboardAwareScreen
        variant="scroll"
        contentContainerStyle={styles.uploadScroll}
        showsVerticalScrollIndicator={false}
        bottomOffset={keyboardVisible ? 88 : 136}>

        <Animated.View entering={reduceMotion ? undefined : FadeInDown.duration(260)} style={styles.workspace}>
          <LinearGradient
            colors={isDark ? ['rgba(255,255,255,0.06)', 'rgba(255,255,255,0)'] : ['rgba(255,255,255,0.75)', 'rgba(255,255,255,0)']}
            style={styles.cardSheen}
          />

          <View style={styles.workspaceToolbar}>
            <PressScale onPress={handleBackToDashboard} accessibilityLabel="All exams">
              <View style={styles.allExamsBtn}>
                <Ionicons name="grid-outline" size={14} color={accentColor} />
                <Text style={[styles.allExamsText, { color: accentColor }]}>All exams</Text>
              </View>
            </PressScale>
            <Text style={styles.toolbarContext} numberOfLines={1}>{contextLabel}</Text>
          </View>

          {renderFilterSection()}

          <View style={styles.studentsBlock}>
            <View style={styles.studentsCardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.studentsTitle}>Enter marks</Text>
                <Text style={styles.studentsSubtitle}>
                  {students.length === 0
                    ? 'Students appear once a class is selected'
                    : `${remainingCount} left · ${filledCount} ready to upload`}
                </Text>
              </View>
              {dataLoading && students.length > 0 ? (
                <View style={styles.syncPill} accessibilityLiveRegion="polite">
                  <LogoLoader size={16} color={accentColor} />
                  <Text style={styles.syncText}>Syncing</Text>
                </View>
              ) : (
                <View style={styles.marksCapPill}>
                  <Text style={[styles.marksCapText, { color: accentColor }]}>
                    /{assessmentSchema === 'component' ? componentTotal : currentDraft.consolidatedMaxMarks}
                  </Text>
                </View>
              )}
            </View>

            {students.length > 0 ? (
              <>
                <View style={styles.searchRow}>
                  <Ionicons name="search" size={16} color={theme.colors.textSecondary} />
                  <AppTextInput
                    style={themeInputStyles.inputInChrome}
                    value={studentQuery}
                    onChangeText={setStudentQuery}
                    placeholder="Jump to name or roll"
                    placeholderTextColor={theme.colors.textTertiary}
                    returnKeyType="search"
                    accessibilityLabel="Search students"
                  />
                  {studentQuery.length > 0 ? (
                    <PressScale onPress={() => setStudentQuery('')} accessibilityLabel="Clear search">
                      <Ionicons name="close-circle" size={18} color={theme.colors.textTertiary} />
                    </PressScale>
                  ) : null}
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.rosterChipRow}
                >
                  {rosterChips.map((chip) => {
                    const active = rosterFilter === chip.key;
                    return (
                      <PressScale
                        key={chip.key}
                        onPress={() => setRosterFilter(chip.key)}
                        accessibilityLabel={chip.label}
                      >
                        <View style={[styles.rosterChip, active && { backgroundColor: accentColor }]}>
                          <Text style={[styles.rosterChipText, active && styles.rosterChipTextActive]}>
                            {chip.label}
                          </Text>
                        </View>
                      </PressScale>
                    );
                  })}
                </ScrollView>
              </>
            ) : null}

            {studentsLoading ? (
              <StudentsSkeleton />
            ) : visibleStudents.length > 0 ? (
              <View style={styles.studentGrid}>
                {visibleStudents.map(renderStudentAssessmentCard)}
              </View>
            ) : students.length > 0 ? (
              <View style={styles.emptyStudents}>
                <View style={styles.emptyIcon}>
                  <Ionicons name="filter-outline" size={28} color={accentColor} />
                </View>
                <Text style={styles.emptyStudentsText}>
                  {studentQuery ? `No match for “${studentQuery}”` : 'Nothing in this filter'}
                </Text>
                <Text style={styles.emptyStudentsSubtext}>
                  {rosterFilter === 'remaining'
                    ? 'Every student in this exam already has marks.'
                    : 'Try All, or search by name or admission number.'}
                </Text>
                <PressScale onPress={() => { setRosterFilter('all'); setStudentQuery(''); }}>
                  <View style={[styles.emptyAction, { backgroundColor: accentColor }]}>
                    <Text style={styles.emptyActionText}>Show all students</Text>
                  </View>
                </PressScale>
              </View>
            ) : (
              <View style={styles.emptyStudents}>
                <View style={styles.emptyIcon}>
                  <Ionicons name="people-outline" size={28} color={accentColor} />
                </View>
                <Text style={styles.emptyStudentsText}>No students found</Text>
                <Text style={styles.emptyStudentsSubtext}>
                  {selectedAssignment
                    ? `No students in ${selectedAssignment.class_name}-${selectedAssignment.section_name}`
                    : 'Select a class and subject above'}
                </Text>
              </View>
            )}
          </View>
        </Animated.View>
      </KeyboardAwareScreen>

      {keyboardVisible && Platform.OS !== 'web' ? (
        <KeyboardStickyView>
          <View style={[styles.keyboardAccessory, isDark && styles.keyboardAccessoryDark]}>
            <PressScale
              disabled={!focusedStudentId}
              onPress={() => focusedStudentId && handleToggleAbsent(focusedStudentId)}
              accessibilityLabel="Mark focused student absent"
            >
              <View style={styles.accessoryGhost}>
                <Text style={styles.accessoryGhostText}>Absent</Text>
              </View>
            </PressScale>
            <Text style={styles.accessoryMeta} numberOfLines={1}>
              {focusedName ?? `${filledCount}/${students.length}`}
            </Text>
            <PressScale onPress={focusNextStudent} accessibilityLabel="Next student">
              <View style={[styles.accessoryNext, { backgroundColor: accentColor }]}>
                <Text style={styles.accessoryNextText}>Next</Text>
                <Ionicons name="arrow-forward" size={14} color="#FFFFFF" />
              </View>
            </PressScale>
          </View>
        </KeyboardStickyView>
      ) : (
        <Animated.View
          entering={reduceMotion ? undefined : FadeInDown.duration(220)}
          exiting={reduceMotion ? undefined : FadeOutDown.duration(160)}
          style={styles.ctaDockWrap}
          pointerEvents="box-none"
        >
          <View style={[styles.ctaDock, isDark && styles.ctaDockDark]}>
            <LinearGradient
              colors={['rgba(255,255,255,0.22)', 'rgba(255,255,255,0.04)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <View style={styles.ctaProgressBlock}>
              <View style={styles.ctaProgressRow}>
                <Text style={styles.ctaProgressLabel} numberOfLines={1}>
                  {students.length === 0 ? 'Select a class' : `${remainingCount} left`}
                </Text>
                <Text style={[styles.ctaProgressPct, { color: accentColor }]}>
                  {Math.round(fillPercent * 100)}%
                </Text>
              </View>
              <ProgressTrack progress={fillPercent} accent={accentColor} />
            </View>
            <View style={styles.ctaActionWrap}>
              <PressScale onPress={handleSubmit} disabled={!canUpload} accessibilityLabel={uploadLabel}>
                <View style={[styles.ctaButton, { backgroundColor: canUpload ? accentColor : theme.colors.primaryLight, opacity: canUpload ? 1 : 0.45 }]}>
                  <LinearGradient
                    colors={['rgba(255,255,255,0.18)', 'rgba(255,255,255,0)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={StyleSheet.absoluteFill}
                    pointerEvents="none"
                  />
                  {uploading ? (
                    <LogoLoader size={26} color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="cloud-upload-outline" size={18} color="#fff" />
                      <Text style={styles.submitText}>{uploadLabel}</Text>
                    </>
                  )}
                </View>
              </PressScale>
            </View>
          </View>
        </Animated.View>
      )}
    </>;

  // ── Main Render ───────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={[styles.orb1, { backgroundColor: isDark ? 'rgba(124,111,255,0.14)' : 'rgba(124,111,255,0.10)' }]} pointerEvents="none" />
      <View style={[styles.orb2, { backgroundColor: isDark ? 'rgba(59,130,246,0.10)' : 'rgba(59,130,246,0.08)' }]} pointerEvents="none" />

      <StaffHeader
        title={selectedCategory?.title ?? 'Upload Marks'}
        showBackButton={true} />
      {isViewingAsAdmin && <ViewAsBanner name={viewAsName} />}

      {selectedCategory ? renderUploadForm() : renderDashboard()}
    </View>);

}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const getStyles = (
  theme: Theme,
  isDark: boolean,
  dashboardColumns: number,
  isPhone: boolean,
  studentColumns: number,
) => {
  const pageBg = isDark ? clayTokens.colors.page.dark : clayTokens.colors.page.light;
  const cardBg = isDark ? clayTokens.colors.card.dark : clayTokens.colors.raised.light;
  const dashboardCardWidth = dashboardColumns === 3 ? '32%' : dashboardColumns === 2 ? '48.6%' : '100%';

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: pageBg,
    },
    orb1: {
      position: 'absolute',
      top: 80,
      right: -60,
      width: 220,
      height: 220,
      borderRadius: 110,
      opacity: 0.9,
    },
    orb2: {
      position: 'absolute',
      top: 280,
      left: -80,
      width: 180,
      height: 180,
      borderRadius: 90,
      opacity: 0.85,
    },
    cardSheen: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 80,
      borderTopLeftRadius: 26,
      borderTopRightRadius: 26,
    },

    // ── Dashboard ────────────────────────────────────────────────────────────
    dashboardContent: {
      width: '100%',
      maxWidth: 1240,
      alignSelf: 'center',
      paddingHorizontal: isPhone ? 14 : 24,
      paddingTop: isPhone ? 14 : 24,
      // Clear the floating bottom tab bar so the last category card isn't covered.
      paddingBottom: staffTabBarReserve(Spacing),
    },
    headerSection: {
      marginBottom: isPhone ? 22 : 28,
      padding: isPhone ? 18 : 24,
      minHeight: isPhone ? undefined : 136,
      flexDirection: 'row',
      alignItems: isPhone ? 'flex-start' : 'center',
      gap: isPhone ? 14 : 18,
      backgroundColor: isDark ? clayTokens.colors.card.dark : clayTokens.colors.raised.light,
      borderRadius: clayTokens.radii.card,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.8)',
      borderBottomWidth: 1.5,
      borderBottomColor: isDark ? 'rgba(0,0,0,0.35)' : 'rgba(76,90,120,0.10)',
      shadowColor: '#6B7A99',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: isDark ? 0.28 : 0.14,
      shadowRadius: 16,
      elevation: 3,
      overflow: 'hidden',
    },
    heroIcon: {
      width: isPhone ? 44 : 52,
      height: isPhone ? 44 : 52,
      borderRadius: isPhone ? 14 : 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(129,140,248,0.14)' : '#EEF2FF',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(129,140,248,0.22)' : '#E0E7FF',
    },
    heroCopy: {
      flex: 1,
      minWidth: 0,
    },
    eyebrow: {
      marginBottom: 6,
      color: theme.colors.primary,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1.2,
    },
    pageTitle: {
      fontSize: isPhone ? 21 : 27,
      lineHeight: isPhone ? 27 : 34,
      fontWeight: '800',
      color: theme.colors.textStrong,
      letterSpacing: -0.6,
    },
    pageSubtitle: {
      maxWidth: 620,
      fontSize: isPhone ? 13 : 14,
      color: theme.colors.textSecondary,
      marginTop: 7,
      lineHeight: isPhone ? 19 : 21,
    },
    heroMeta: {
      minWidth: 92,
      paddingHorizontal: 16,
      paddingVertical: 12,
      alignItems: 'center',
      borderRadius: 16,
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F8FAFC',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.07)' : '#E2E8F0',
    },
    heroMetaValue: {
      color: theme.colors.textStrong,
      fontSize: 22,
      lineHeight: 26,
      fontWeight: '900',
    },
    heroMetaLabel: {
      marginTop: 2,
      color: theme.colors.textSecondary,
      fontSize: 11,
      fontWeight: '700',
    },
    sectionHeading: {
      marginBottom: 14,
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: 12,
    },
    sectionTitle: {
      color: theme.colors.textStrong,
      fontSize: isPhone ? 16 : 18,
      fontWeight: '800',
      letterSpacing: -0.3,
    },
    sectionHint: {
      color: theme.colors.textSecondary,
      fontSize: 12,
      fontWeight: '600',
    },
    gridContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 16,
    },
    cardContainer: {
      width: dashboardCardWidth,
    },
    cardContainerWide: {
      width: '48.6%',
    },
    cardContainerCentered: {
      marginLeft: '25.7%',
    },
    card: {
      minHeight: isPhone ? 118 : 218,
      padding: isPhone ? 14 : 18,
      backgroundColor: isDark ? clayTokens.colors.card.dark : clayTokens.colors.card.light,
      borderRadius: clayTokens.radii.card,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.75)',
      borderBottomWidth: 1.5,
      borderBottomColor: isDark ? 'rgba(0,0,0,0.28)' : 'rgba(76,90,120,0.10)',
      shadowColor: '#6B7A99',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: isDark ? 0.24 : 0.12,
      shadowRadius: 14,
      elevation: 3,
      overflow: 'hidden',
    },
    cardAccent: {
      position: 'absolute',
      top: isPhone ? 14 : 0,
      bottom: isPhone ? 14 : undefined,
      left: isPhone ? 0 : 18,
      right: isPhone ? undefined : 18,
      width: isPhone ? 3 : undefined,
      height: isPhone ? undefined : 3,
      borderTopRightRadius: 3,
      borderBottomRightRadius: 3,
      borderBottomLeftRadius: isPhone ? 0 : 3,
    },
    cardTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 16,
    },
    iconBox: {
      width: isPhone ? 46 : 48,
      height: isPhone ? 46 : 48,
      borderRadius: 15,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(148,163,184,0.12)',
    },
    examCountPill: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
    },
    examCountText: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.2,
    },
    textContainer: {
      flex: 1,
    },
    cardTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: theme.colors.textStrong,
      marginBottom: 4,
      letterSpacing: -0.2,
    },
    cardSubtitle: {
      fontSize: 13,
      color: theme.colors.textSecondary,
      lineHeight: 18,
    },
    badgeRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: 12,
    },
    badge: {
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 4,
      backgroundColor: isDark ? 'rgba(255,255,255,0.035)' : '#F8FAFC',
    },
    badgeText: {
      fontSize: 11,
      fontWeight: '700',
    },
    badgeMore: {
      fontSize: 11,
      fontWeight: '700',
      alignSelf: 'center',
    },
    arrowBox: {
      width: 30,
      height: 30,
      borderRadius: 10,
      justifyContent: 'center',
      alignItems: 'center',
    },
    cardActionRow: {
      marginTop: 16,
      paddingTop: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderTopWidth: 1,
      borderTopColor: isDark ? 'rgba(255,255,255,0.07)' : '#F1F5F9',
    },
    cardActionText: {
      fontSize: 12,
      fontWeight: '800',
    },
    mobileCardRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    mobileCardCopy: {
      flex: 1,
      minWidth: 0,
    },
    mobileExamCount: {
      marginTop: 7,
      fontSize: 11,
      fontWeight: '800',
    },

    // ── Upload flow ──────────────────────────────────────────────────────────
    uploadScroll: {
      width: '100%',
      maxWidth: 1180,
      alignSelf: 'center',
      paddingHorizontal: isPhone ? 12 : 20,
      paddingTop: isPhone ? 10 : 16,
      paddingBottom: STAFF_TAB_BAR_HEIGHT + 148,
    },
    workspace: {
      backgroundColor: cardBg,
      borderRadius: clayTokens.radii.card,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.8)',
      borderBottomWidth: 1.5,
      borderBottomColor: isDark ? 'rgba(0,0,0,0.32)' : 'rgba(76,90,120,0.10)',
      shadowColor: '#6B7A99',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: isDark ? 0.28 : 0.14,
      shadowRadius: 16,
      elevation: 4,
      overflow: 'hidden',
      paddingBottom: 12,
    },
    workspaceToolbar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 14,
      paddingTop: 14,
      paddingBottom: 10,
    },
    allExamsBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      minHeight: 40,
      paddingHorizontal: 12,
      borderRadius: clayTokens.radii.button,
      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : clayTokens.colors.inset.light,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(148,163,184,0.18)',
    },
    allExamsText: {
      fontSize: 13,
      fontWeight: '700',
    },
    toolbarContext: {
      flex: 1,
      fontSize: 13,
      fontWeight: '700',
      color: theme.colors.text,
      letterSpacing: -0.1,
    },
    toolbarMeta: {
      minWidth: 44,
      alignItems: 'flex-end',
    },
    toolbarCount: {
      fontSize: 13,
      fontWeight: '800',
      color: theme.colors.textSecondary,
      fontVariant: ['tabular-nums'],
    },
    filterStack: {
      gap: 10,
      paddingHorizontal: 14,
      paddingBottom: 4,
    },
    filterDropdownRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'flex-end',
      gap: 10,
    },
    emptyFilterBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginHorizontal: 14,
      marginBottom: 8,
      padding: 14,
      backgroundColor: isDark ? 'rgba(239,68,68,0.12)' : '#FEF2F2',
      borderRadius: 16,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(239,68,68,0.25)' : '#FECACA',
    },
    emptyFilterText: {
      color: '#DC2626',
      fontSize: 14,
      fontWeight: '600',
      flex: 1,
    },
    schemaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 10,
      marginTop: 6,
    },
    schemaHint: {
      color: theme.colors.textTertiary,
      fontSize: 12,
      lineHeight: 17,
      paddingHorizontal: 2,
    },
    setupSummary: {
      minHeight: 44,
      paddingHorizontal: 12,
      borderRadius: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : clayTokens.colors.inset.light,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(148,163,184,0.16)',
    },
    setupSummaryCopy: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    setupSummaryLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.colors.text,
    },
    setupSummaryTotal: {
      fontSize: 11,
      fontWeight: '800',
    },
    setupSummaryAction: {
      fontSize: 13,
      fontWeight: '800',
    },
    doneSetupBtn: {
      minHeight: 40,
      paddingHorizontal: 12,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : clayTokens.colors.inset.light,
    },
    doneSetupText: {
      fontSize: 13,
      fontWeight: '800',
    },
    searchRow: {
      marginHorizontal: 12,
      marginBottom: 10,
      minHeight: 46,
      paddingHorizontal: 12,
      borderRadius: clayTokens.radii.input,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : clayTokens.colors.inset.light,
      borderWidth: 1.5,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(76,90,120,0.12)',
    },
    rosterChipRow: {
      paddingHorizontal: 12,
      paddingBottom: 10,
      gap: 8,
    },
    rosterChip: {
      height: 34,
      paddingHorizontal: 12,
      borderRadius: clayTokens.radii.chip,
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(79,110,247,0.08)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(79,110,247,0.18)',
    },
    rosterChipText: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.colors.text,
    },
    rosterChipTextActive: {
      color: '#FFFFFF',
    },
    componentMaxPanel: {
      gap: 10,
      padding: 12,
      borderRadius: clayTokens.radii.button,
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : clayTokens.colors.inset.light,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(148,163,184,0.16)',
    },
    componentMaxHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    componentMaxTitle: {
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
      color: theme.colors.textSecondary,
    },
    componentMaxTotal: {
      fontSize: 13,
      fontWeight: '800',
      letterSpacing: -0.2,
    },
    componentMaxGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    componentMaxItem: {
      flexGrow: 1,
      flexBasis: isPhone ? '46%' : '22%',
      minWidth: isPhone ? 120 : 72,
      gap: 6,
    },
    componentMaxLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: theme.colors.textSecondary,
      paddingHorizontal: 2,
    },
    componentMaxInput: {
      borderWidth: 1.5,
      borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(148,163,184,0.22)',
      borderRadius: 14,
      height: 44,
      textAlign: 'center',
      fontSize: 16,
      fontWeight: '800',
      color: theme.colors.text,
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F8FAFC',
    },
    maxMarksCompact: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    maxMarksCompactLabel: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      color: theme.colors.textSecondary,
    },
    maxMarksInput: {
      borderWidth: 1.5,
      borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(148,163,184,0.22)',
      borderRadius: 14,
      width: 64,
      height: 44,
      textAlign: 'center',
      fontSize: 16,
      fontWeight: '800',
      color: theme.colors.text,
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F8FAFC',
    },
    studentsBlock: {
      marginTop: 10,
      borderTopWidth: 1,
      borderTopColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(148,163,184,0.14)',
    },
    studentGrid: {
      paddingHorizontal: 12,
      paddingBottom: 4,
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
    },
        studentsCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingTop: 14,
      paddingBottom: 10,
    },
    studentsTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: theme.colors.text,
      letterSpacing: -0.3,
    },
    studentsSubtitle: {
      fontSize: 13,
      color: theme.colors.textSecondary,
      marginTop: 4,
      fontWeight: '600',
    },
    marksCapPill: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 12,
      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.7)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(148,163,184,0.18)',
    },
    marksCapText: {
      fontSize: 16,
      fontWeight: '900',
    },
    syncPill: {
      minHeight: 36,
      paddingHorizontal: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderRadius: 12,
      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F8FAFC',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0',
    },
    syncText: {
      color: theme.colors.textSecondary,
      fontSize: 11,
      fontWeight: '700',
    },
    loadingContainer: {
      alignItems: 'center',
      paddingVertical: 48,
      gap: 14,
    },
    loadingText: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      fontWeight: '600',
    },
    studentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 16,
      paddingHorizontal: 20,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(148,163,184,0.12)',
      gap: 14,
    },
    studentRowLast: {
      borderBottomWidth: 0,
    },
    studentAvatar: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: isDark ? 'rgba(139,92,246,0.16)' : 'rgba(255,255,255,0.7)',
      justifyContent: 'center',
      alignItems: 'center',
      overflow: 'hidden',
    },
    studentAvatarText: {
      fontSize: 16,
      fontWeight: '900',
      color: '#7C3AED',
    },
    studentInfo: {
      flex: 1,
      minWidth: 0,
    },
    studentName: {
      fontSize: 15,
      fontWeight: '800',
      color: theme.colors.text,
      letterSpacing: -0.1,
    },
    studentRoll: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      marginTop: 3,
      fontWeight: '600',
    },
    markInput: {
      borderWidth: 1.5,
      borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(148,163,184,0.25)',
      borderRadius: 14,
      width: 68,
      height: 48,
      textAlign: 'center',
      fontSize: 18,
      fontWeight: '800',
      color: theme.colors.text,
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#EFF2F9',
      ...clayInset(isDark),
    },
    markInputFilled: {
      borderColor: 'rgba(139,92,246,0.5)',
      backgroundColor: isDark ? 'rgba(139,92,246,0.14)' : '#F5F3FF',
      color: '#7C3AED',
    },
    assessmentStudentCard: {
      width: studentColumns === 2 ? '49.35%' : '100%',
      padding: isPhone ? 12 : 14,
      borderRadius: clayTokens.radii.card,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(76,90,120,0.10)',
      backgroundColor: isDark ? 'rgba(255,255,255,0.025)' : clayTokens.colors.card.light,
      borderBottomWidth: 1.5,
      borderBottomColor: isDark ? 'rgba(0,0,0,0.28)' : 'rgba(76,90,120,0.10)',
    },
    assessmentStudentCardAbsent: {
      backgroundColor: isDark ? 'rgba(210,65,81,0.10)' : clayTokens.colors.brand.roseSoft,
      borderColor: isDark ? 'rgba(210,65,81,0.28)' : 'rgba(210,65,81,0.18)',
    },
    assessmentStudentHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 12,
    },
    gradeBadge: {
      minWidth: 42,
      height: 34,
      paddingHorizontal: 8,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    gradeBadgeText: {
      fontSize: 14,
      fontWeight: '800',
      letterSpacing: -0.3,
    },
    absentChip: {
      minHeight: 34,
      paddingHorizontal: 10,
      borderRadius: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: isDark ? 'rgba(210,65,81,0.12)' : clayTokens.colors.brand.roseSoft,
    },
    absentChipActive: {
      backgroundColor: clayTokens.colors.absent.bg,
    },
    absentChipText: {
      fontSize: 12,
      fontWeight: '800',
      color: clayTokens.colors.absent.bg,
    },
    absentChipTextActive: {
      color: '#FFFFFF',
    },
    absentHint: {
      fontSize: 12,
      fontWeight: '600',
      color: clayTokens.colors.absent.bg,
      paddingHorizontal: 2,
      marginBottom: 2,
    },
    pendingHint: {
      marginTop: 10,
      fontSize: 12,
      fontWeight: '600',
      color: theme.colors.textTertiary,
      paddingHorizontal: 2,
    },
    liveTotalsRow: {
      marginTop: 12,
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 2,
    },
    liveTotalStrong: {
      fontSize: 13,
      fontWeight: '800',
      color: theme.colors.text,
      letterSpacing: -0.2,
    },
    liveTotalMuted: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.colors.textSecondary,
    },
    liveDot: {
      width: 3,
      height: 3,
      borderRadius: 2,
      backgroundColor: 'rgba(76,90,120,0.28)',
    },
    emptyAction: {
      marginTop: 8,
      minHeight: 44,
      paddingHorizontal: 16,
      borderRadius: clayTokens.radii.button,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyActionText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '700',
    },
    componentGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    componentField: {
      flexGrow: 1,
      flexBasis: '46%',
      minWidth: 125,
    },
    componentLabelRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 6,
      paddingHorizontal: 3,
    },
    componentLabel: {
      flex: 1,
      color: theme.colors.textSecondary,
      fontSize: 11,
      fontWeight: '700',
    },
    componentMaximum: {
      color: theme.colors.textTertiary,
      fontSize: 11,
      fontWeight: '800',
      marginLeft: 4,
    },
    componentInput: {
      height: 48,
      borderWidth: 1.5,
      borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(148,163,184,0.25)',
      borderRadius: 14,
      textAlign: 'center',
      fontSize: 17,
      fontWeight: '800',
      color: theme.colors.text,
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#EFF2F9',
      ...clayInset(isDark),
    },
    consolidatedEntryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
      paddingHorizontal: 4,
    },
    consolidatedCopy: {
      flex: 1,
    },
    consolidatedLabel: {
      color: theme.colors.text,
      fontSize: 14,
      fontWeight: '800',
    },
    consolidatedHint: {
      color: theme.colors.textTertiary,
      fontSize: 12,
      marginTop: 3,
    },
    consolidatedInput: {
      width: 92,
      height: 54,
      borderWidth: 1.5,
      borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(148,163,184,0.25)',
      borderRadius: 16,
      textAlign: 'center',
      fontSize: 20,
      fontWeight: '900',
      color: theme.colors.text,
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#EFF2F9',
      ...clayInset(isDark),
    },
    metricsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 16,
      paddingTop: 14,
      borderTopWidth: 1,
      borderTopColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(148,163,184,0.14)',
    },
    metricItem: {
      flexGrow: 1,
      minWidth: isPhone ? 82 : 72,
      paddingHorizontal: 8,
      paddingVertical: 8,
      borderRadius: 12,
      backgroundColor: isDark ? 'rgba(255,255,255,0.035)' : 'rgba(241,245,249,0.9)',
      alignItems: 'center',
    },
    metricLabel: {
      color: theme.colors.textTertiary,
      fontSize: 9,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    metricValue: {
      color: theme.colors.text,
      fontSize: 13,
      fontWeight: '900',
      marginTop: 4,
    },
    emptyStudents: {
      alignItems: 'center',
      paddingVertical: 28,
      paddingHorizontal: 24,
      gap: 10,
    },
    emptyIcon: {
      width: 56,
      height: 56,
      borderRadius: 18,
      backgroundColor: isDark ? 'rgba(124,111,255,0.10)' : 'rgba(255,255,255,0.7)',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 2,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(148,163,184,0.18)',
    },
    emptyStudentsText: {
      fontSize: 17,
      fontWeight: '800',
      color: theme.colors.textSecondary,
    },
    emptyStudentsSubtext: {
      fontSize: 14,
      color: theme.colors.textTertiary,
      textAlign: 'center',
      lineHeight: 20,
    },

    // ── Submit ───────────────────────────────────────────────────────────────
    ctaDockWrap: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: STAFF_TAB_BAR_HEIGHT + Spacing.xl + 8,
      alignItems: 'center',
      paddingHorizontal: 16,
    },
    ctaDock: {
      width: '100%',
      maxWidth: 440,
      padding: isPhone ? 10 : 12,
      gap: isPhone ? 12 : 10,
      flexDirection: isPhone ? 'row' : 'column',
      alignItems: isPhone ? 'center' : 'stretch',
      backgroundColor: isDark ? 'rgba(21,29,45,0.92)' : 'rgba(255,255,255,0.72)',
      borderRadius: 22,
      borderWidth: 1.5,
      borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.85)',
      overflow: 'hidden',
      shadowColor: '#6B7A99',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: isDark ? 0.32 : 0.16,
      shadowRadius: 16,
      elevation: 6,
    },
    ctaDockDark: {
      backgroundColor: 'rgba(21,29,45,0.94)',
    },
    keyboardAccessory: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: 'rgba(244,247,253,0.96)',
      borderTopWidth: StyleSheet.hairlineWidth * 2,
      borderTopColor: 'rgba(255,255,255,0.8)',
    },
    keyboardAccessoryDark: {
      backgroundColor: 'rgba(21,29,45,0.96)',
      borderTopColor: 'rgba(255,255,255,0.08)',
    },
    accessoryGhost: {
      minHeight: 40,
      paddingHorizontal: 12,
      borderRadius: 12,
      justifyContent: 'center',
      backgroundColor: clayTokens.colors.brand.roseSoft,
    },
    accessoryGhostText: {
      fontSize: 13,
      fontWeight: '800',
      color: clayTokens.colors.absent.bg,
    },
    accessoryMeta: {
      flex: 1,
      fontSize: 13,
      fontWeight: '700',
      color: theme.colors.textSecondary,
    },
    accessoryNext: {
      minHeight: 40,
      paddingHorizontal: 14,
      borderRadius: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    accessoryNextText: {
      color: '#FFFFFF',
      fontSize: 13,
      fontWeight: '800',
    },
    ctaProgressBlock: {
      flex: isPhone ? 1 : undefined,
      alignSelf: 'stretch',
      justifyContent: 'center',
      gap: 8,
      minWidth: 0,
    },
    ctaActionWrap: {
      width: isPhone ? 166 : '100%',
    },
    ctaProgressRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 4,
    },
    ctaProgressLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: theme.colors.textSecondary,
    },
    ctaProgressPct: {
      fontSize: 13,
      fontWeight: '800',
      fontVariant: ['tabular-nums'],
    },
    ctaButton: {
      height: isPhone ? 48 : 52,
      borderRadius: 16,
      overflow: 'hidden',
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 8,
      borderBottomWidth: 1.5,
      borderBottomColor: 'rgba(0,0,0,0.14)',
    },
    submitText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '700',
      letterSpacing: 0.2,
    },
  });
};
