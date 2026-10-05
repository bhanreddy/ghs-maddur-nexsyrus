import { TourTarget, TourScrollView } from '@/src/features/app-tour';
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import AppTextInput from '@/src/components/AppTextInput';
import { styles as ds } from '@/src/theme/styles';
import PremiumButton from '@/src/components/PremiumButton';
import { clayInset } from '@/src/theme/clayStyles';

import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Pressable,
  StatusBar, ScrollView, Platform, useWindowDimensions,
  Animated as RNAnimated,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import AdminHeader from '../../src/components/AdminHeader';
import Animated, {
  FadeIn, FadeInDown, FadeInUp, ZoomIn,
  useSharedValue, useAnimatedStyle, withSpring, interpolateColor,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { NoticeService, Notice, CreateNoticeRequest, NoticeAudience } from '../../src/services/commonServices';
import { ClassService, ClassInfo } from '../../src/services/classService';
import { Modal } from 'react-native';
import { useTheme } from '../../src/hooks/useTheme';
import type { SchoolTheme } from '../../src/theme/types';
import LogoLoader from '../../src/components/LogoLoader';
import { useTranslation } from 'react-i18next';
import { t_field } from '../../src/utils/lang';
import { Colors } from '../../src/constants/Colors';
import { ADMIN_THEME } from '../../src/constants/adminTheme';
import { schoolColorWithAlpha } from '../../src/constants/schoolConfig';

type ThemeColors = SchoolTheme['colors'];

const displayTitle = (raw: string) => {
  const t = raw.trim();
  if (!t) return t;
  // Soft title-case for inconsistent stored casing (Holiday / holiday / HOLIDAY)
  if (t === t.toUpperCase() || t === t.toLowerCase()) {
    return t.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  }
  return t.charAt(0).toUpperCase() + t.slice(1);
};

type PriorityMeta = {
  bg: string; text: string; border: string; dot: string;
  icon: 'alert-circle' | 'warning' | 'information' | 'remove-circle';
  label: string; hint: string;
};

const buildPriorityMeta = (c: ThemeColors): Record<'high' | 'medium' | 'low' | 'normal', PriorityMeta> => ({
  high: {
    bg: c.alertBgDanger, text: c.alertTextDanger, border: c.alertBorderDanger, dot: c.danger,
    icon: 'alert-circle', label: 'HIGH', hint: 'Urgent — read now',
  },
  medium: {
    bg: c.alertBg, text: c.alertText, border: c.alertBorder, dot: c.warning,
    icon: 'warning', label: 'MEDIUM', hint: 'Important update',
  },
  low: {
    bg: c.alertBgInfo, text: c.alertTextInfo, border: c.alertBorderInfo, dot: c.info,
    icon: 'information', label: 'LOW', hint: 'FYI / soft reminder',
  },
  normal: {
    bg: c.borderLight, text: c.textMuted, border: c.border, dot: c.textTertiary,
    icon: 'remove-circle', label: 'NORMAL', hint: '',
  },
});

type AudienceMeta = { icon: string; color: string; bg: string; soft: string; lib: 'ion' | 'fa5'; desc: string };

const buildAudienceMeta = (c: ThemeColors): Record<string, AudienceMeta> => ({
  all: {
    icon: 'globe-outline', color: c.primary, bg: c.primary,
    soft: schoolColorWithAlpha(c.primary, 0.12), lib: 'ion', desc: 'Everyone',
  },
  students: {
    icon: 'graduation-cap', color: c.info, bg: c.info,
    soft: schoolColorWithAlpha(c.info, 0.12), lib: 'fa5', desc: 'All students',
  },
  staff: {
    icon: 'briefcase-outline', color: c.warning, bg: c.warning,
    soft: schoolColorWithAlpha(c.warning, 0.16), lib: 'ion', desc: 'Teachers & staff',
  },
  parents: {
    icon: 'people-outline', color: c.secondary, bg: c.secondary,
    soft: schoolColorWithAlpha(c.secondary, 0.14), lib: 'ion', desc: 'Parent portal',
  },
  class: {
    icon: 'layers-outline', color: c.primary, bg: c.primary,
    soft: c.navPill, lib: 'ion', desc: 'One class only',
  },
});

const AUDIENCE_OPTIONS: NoticeAudience[] = ['all', 'students', 'staff', 'parents', 'class'];

const audienceLabel = (a: NoticeAudience) =>
  a === 'all' ? 'All'
    : a === 'students' ? 'Students'
    : a === 'staff' ? 'Staff'
    : a === 'parents' ? 'Parents'
    : 'Class';

/** Resolve display list — prefer audiences[], fall back to legacy audience. */
const noticeAudiences = (n: Notice): NoticeAudience[] => {
  if (Array.isArray(n.audiences) && n.audiences.length > 0) return n.audiences;
  return [n.audience || 'all'];
};

const audiencesHint = (selected: NoticeAudience[], audienceMeta: Record<string, AudienceMeta>) => {
  if (!selected.length || selected.includes('all')) return audienceMeta.all.desc;
  if (selected.length === 1) return audienceMeta[selected[0]]?.desc ?? '';
  return selected.map(audienceLabel).join(' · ');
};

const TITLE_MAX = 80;
const BODY_MAX = 500;

// Soft pulse — used sparingly (pinned / high priority only)
const PulseDot = ({ color, size = 6 }: { color: string; size?: number }) => {
  const scale = useRef(new RNAnimated.Value(1)).current;
  useEffect(() => {
    const anim = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(scale, { toValue: 1.85, duration: 900, useNativeDriver: true }),
        RNAnimated.timing(scale, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [scale]);
  return (
    <View style={{ width: size + 4, height: size + 4, justifyContent: 'center', alignItems: 'center' }}>
      <RNAnimated.View style={{
        position: 'absolute',
        width: size + 4, height: size + 4,
        borderRadius: (size + 4) / 2,
        backgroundColor: color, opacity: 0.22,
        transform: [{ scale }],
      }} />
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
    </View>
  );
};

const AudienceIcon = ({
  type, size = 12, color, audienceMeta,
}: {
  type: string; size?: number; color: string; audienceMeta: Record<string, AudienceMeta>;
}) => {
  const m = audienceMeta[type] ?? audienceMeta.all;
  if (m.lib === 'fa5') return <FontAwesome5 name={m.icon as any} size={size} color={color} />;
  return <Ionicons name={m.icon as any} size={size} color={color} />;
};

/** Springy clay toggle — UI-thread only */
function ClayToggle({
  value, onChange, activeColor, inactiveColor,
}: {
  value: boolean; onChange: (v: boolean) => void; activeColor: string; inactiveColor: string;
}) {
  const p = useSharedValue(value ? 1 : 0);
  useEffect(() => {
    p.value = withSpring(value ? 1 : 0, { damping: 16, stiffness: 220 });
  }, [value, p]);
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: p.value * 22 }] }));
  const track = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(p.value, [0, 1], [inactiveColor, activeColor]),
  }));
  return (
    <Pressable onPress={() => onChange(!value)} hitSlop={10} accessibilityRole="switch" accessibilityState={{ checked: value }}>
      <Animated.View style={[{ width: 52, height: 30, borderRadius: 15, padding: 3 }, track]}>
        <Animated.View style={[{
          width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.white,
          ...(Platform.OS === 'android'
            ? { elevation: 2 }
            : { shadowColor: Colors.black, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.18, shadowRadius: 2 }),
        }, knob]} />
      </Animated.View>
    </Pressable>
  );
}

/** Press scale wrapper — transform only; outer view keeps flex layout intact */
function PressScale({
  onPress, children, disabled, style,
}: {
  onPress?: () => void; children: React.ReactNode; disabled?: boolean; style?: any;
}) {
  const scale = useSharedValue(1);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={[style, aStyle]}>
      <Pressable
        disabled={disabled}
        onPress={onPress}
        onPressIn={() => { if (!disabled) scale.value = withSpring(0.96, { damping: 18, stiffness: 320 }); }}
        onPressOut={() => { scale.value = withSpring(1, { damping: 14, stiffness: 220 }); }}
        style={style?.flex === 1 ? { flex: 1 } : undefined}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function AdminNotices() {
  useTranslation();
  const { theme, isDark } = useTheme();
  const c = theme.colors;
  const styles = useMemo(() => getStyles(theme, isDark), [theme, isDark]);
  const priorityMeta = useMemo(() => buildPriorityMeta(c), [c]);
  const audienceMeta = useMemo(() => buildAudienceMeta(c), [c]);
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const isWide = winW >= 720;

  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);

  const [modalVisible, setModalVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [selectedAudiences, setSelectedAudiences] = useState<NoticeAudience[]>(['all']);
  const [audienceFilter, setAudienceFilter] = useState<NoticeAudience | 'all_filter'>('all_filter');
  const [priority, setPriority] = useState('medium');
  const [targetClassId, setTargetClassId] = useState('');
  const [isPinned, setIsPinned] = useState(false);
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [creating, setCreating] = useState(false);
  const [titleFocused, setTitleFocused] = useState(false);
  const [bodyFocused, setBodyFocused] = useState(false);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);

  const toggleAudience = useCallback((a: NoticeAudience) => {
    setSelectedAudiences((prev) => {
      if (a === 'all') return ['all'];
      const withoutAll = prev.filter((x) => x !== 'all');
      if (withoutAll.includes(a)) {
        const next = withoutAll.filter((x) => x !== a);
        return next.length ? next : ['all'];
      }
      return [...withoutAll, a];
    });
  }, []);

  // Drop class target when Class is no longer in the selection
  useEffect(() => {
    if (!selectedAudiences.includes('class') && targetClassId) {
      setTargetClassId('');
    }
  }, [selectedAudiences, targetClassId]);

  const fabScale = useRef(new RNAnimated.Value(1)).current;
  const onFabIn = () => RNAnimated.spring(fabScale, { toValue: 0.92, useNativeDriver: true, friction: 6 }).start();
  const onFabOut = () => RNAnimated.spring(fabScale, { toValue: 1, useNativeDriver: true, friction: 5 }).start();

  useEffect(() => { fetchNotices(); fetchClasses(); }, []);

  const fetchClasses = async () => {
    try { setClasses(await ClassService.getClasses()); } catch { /* ignore */ }
  };

  const fetchNotices = async () => {
    try {
      setLoading(true);
      setNotices(await NoticeService.getAll());
    } catch {
      alertCompat('Error', 'Failed to load notices');
    } finally {
      setLoading(false);
    }
  };

  const formatTimeAgo = (dateString: string) => {
    if (!dateString) return '';
    const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
    if (seconds < 60) return `${Math.floor(seconds)}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d ago`;
    if (seconds < 31536000) return `${Math.floor(seconds / 2592000)}mo ago`;
    return `${Math.floor(seconds / 31536000)}y ago`;
  };

  const filteredNotices = notices.filter((n) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      !q ||
      n.title.toLowerCase().includes(q) ||
      n.content.toLowerCase().includes(q);
    if (!matchesSearch) return false;
    if (audienceFilter === 'all_filter') return true;
    const targets = noticeAudiences(n);
    return targets.includes('all') || targets.includes(audienceFilter);
  });

  const sortedNotices = [...filteredNotices].sort((a, b) =>
    (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0)
  );

  const titleOk = title.trim().length > 0;
  const bodyOk = content.trim().length > 0;
  const needsClass = selectedAudiences.includes('class');
  const classOk = !needsClass || !!targetClassId;
  const canPublish = titleOk && bodyOk && classOk;

  const closeModal = useCallback(() => {
    setModalVisible(false);
    setAttemptedSubmit(false);
    resetForm();
  }, []);

  const handleCreate = async () => {
    setAttemptedSubmit(true);
    if (!titleOk || !bodyOk) {
      alertCompat('Almost there', 'Add a title and body before publishing.');
      return;
    }
    if (!classOk) {
      alertCompat('Pick a class', 'Select which class should see this notice.');
      return;
    }
    try {
      setCreating(true);
      const audiences = selectedAudiences.includes('all')
        ? (['all'] as NoticeAudience[])
        : selectedAudiences;
      const payload: CreateNoticeRequest = {
        title: title.trim(),
        content: content.trim(),
        audience: audiences[0],
        audiences,
        priority,
        is_pinned: isPinned,
        target_class_id: audiences.includes('class') ? targetClassId : undefined,
      };
      await NoticeService.create(payload);
      alertCompat('Published', 'Your notice is live on the board.');
      closeModal();
      fetchNotices();
    } catch (error: any) {
      alertCompat('Error', error.response?.data?.error || 'Failed to create notice');
    } finally {
      setCreating(false);
    }
  };

  const resetForm = () => {
    setTitle(''); setContent(''); setSelectedAudiences(['all']);
    setPriority('medium'); setTargetClassId(''); setIsPinned(false);
    setTitleFocused(false); setBodyFocused(false);
  };

  const pinnedCount = notices.filter(n => n.is_pinned).length;
  const highCount = notices.filter(n => (n.priority || '').toLowerCase() === 'high').length;

  const renderItem = useCallback(({ item, index }: { item: Notice; index: number }) => {
    const pKey = (item.priority || 'normal').toLowerCase() as keyof typeof priorityMeta;
    const pm = priorityMeta[pKey] ?? priorityMeta.normal;
    const targets = noticeAudiences(item);
    const pinned = !!item.is_pinned;
    const title = displayTitle(t_field(item.title, item.title_te));

    return (
      <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 40).duration(320).springify().damping(18)}>
        <PressScale>
          <View style={[styles.card, pinned && styles.cardPinned]}>
            <View style={[styles.cardStripe, { backgroundColor: pinned ? c.primary : pm.dot }]} />
            <View style={styles.cardInner}>
              <View style={styles.cardTop}>
                <View style={styles.titleRow}>
                  {pinned ? (
                    <View style={styles.pinBadge}>
                      <Ionicons name="pin" size={10} color={c.primary} />
                      <Text style={styles.pinText}>Pinned</Text>
                    </View>
                  ) : null}
                  <Text style={styles.cardTitle} numberOfLines={1}>{title}</Text>
                </View>
                <View style={[styles.priorityBadge, { backgroundColor: pm.bg, borderColor: pm.border }]}>
                  {pKey === 'high' ? <PulseDot color={pm.dot} size={5} /> : (
                    <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: pm.dot }} />
                  )}
                  <Text style={[styles.priorityText, { color: pm.text }]}>{pm.label}</Text>
                </View>
              </View>

              <Text style={styles.cardContent} numberOfLines={2}>{t_field(item.content, item.content_te)}</Text>

              <View style={styles.cardFooter}>
                <View style={styles.audiencePillRow}>
                  {targets.map((a) => {
                    const am = audienceMeta[a] ?? audienceMeta.all;
                    const label = a === 'class' && item.target_class_name
                      ? item.target_class_name
                      : audienceLabel(a);
                    return (
                      <View key={a} style={[styles.audiencePill, { backgroundColor: am.soft }]}>
                        <AudienceIcon type={a} size={10} color={am.color} audienceMeta={audienceMeta} />
                        <Text style={[styles.audienceText, { color: am.color }]}>{label}</Text>
                      </View>
                    );
                  })}
                </View>
                <Text style={styles.dateText}>{formatTimeAgo(item.published_at || item.created_at)}</Text>
              </View>
            </View>
          </View>
        </PressScale>
      </Animated.View>
    );
  }, [styles, c.primary, priorityMeta, audienceMeta]);

  const priorityHint = priorityMeta[priority as keyof typeof priorityMeta]?.hint ?? '';
  const audienceHint = audiencesHint(selectedAudiences, audienceMeta);

  // ── RENDER ───────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.colors.background} />
      <TourTarget id="screen.admin-notices.overview"><AdminHeader title="Notices" showBackButton={true} hideAppSearch /></TourTarget>

      {/* Toolbar: search + compact stats */}
      <TourTarget id="screen.admin-notices.workspace" native><View style={styles.toolbar}>
        <View style={[styles.searchContainer, ds.searchBarWrapper, searchFocused && styles.searchFocused]}>
          <Ionicons
            name="search-outline" size={16}
            color={searchFocused ? c.primary : c.textMuted}
            style={styles.searchIcon}
          />
          <AppTextInput
            style={[ds.inputInChrome, styles.searchInput]}
            placeholder="Filter by title or message…"
            placeholderTextColor={c.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearBtn} hitSlop={8}>
              <Ionicons name="close" size={12} color={Colors.white} />
            </TouchableOpacity>
          )}
        </View>

        {!loading && notices.length > 0 ? (
          <View style={styles.statsRow}>
            <View style={styles.statPill}>
              <Text style={styles.statPillNum}>{notices.length}</Text>
              <Text style={styles.statPillLabel}>Total</Text>
            </View>
            <View style={[styles.statPill, styles.statPillPinned]}>
              <Ionicons name="pin" size={11} color={c.primary} />
              <Text style={[styles.statPillNum, { color: c.primary }]}>{pinnedCount}</Text>
              <Text style={[styles.statPillLabel, { color: c.primary }]}>Pinned</Text>
            </View>
            {highCount > 0 ? (
              <View style={[styles.statPill, styles.statPillUrgent]}>
                <View style={[styles.statUrgentDot, { backgroundColor: c.danger }]} />
                <Text style={[styles.statPillNum, { color: c.danger }]}>{highCount}</Text>
                <Text style={[styles.statPillLabel, { color: c.danger }]}>Urgent</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View></TourTarget>

      {/* Audience filter — single segmented track */}
      <View style={styles.filterWrap}>
        <TourScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
          style={styles.filterScroll}
        >
          {([
            { key: 'all_filter' as const, label: 'All', type: null as NoticeAudience | null },
            { key: 'students' as const, label: 'Students', type: 'students' as NoticeAudience },
            { key: 'staff' as const, label: 'Staff', type: 'staff' as NoticeAudience },
            { key: 'parents' as const, label: 'Parents', type: 'parents' as NoticeAudience },
            { key: 'class' as const, label: 'Class', type: 'class' as NoticeAudience },
          ]).map((tab) => {
            const active = audienceFilter === tab.key;
            return (
              <Pressable
                key={tab.key}
                onPress={() => setAudienceFilter(tab.key)}
                style={[styles.filterTab, active && styles.filterTabActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                {tab.type ? (
                  <AudienceIcon
                    type={tab.type}
                    size={12}
                    color={active ? c.primary : c.textMuted}
                    audienceMeta={audienceMeta}
                  />
                ) : null}
                <Text style={[styles.filterTabText, active && styles.filterTabTextActive]}>
                  {tab.label}
                </Text>
                {active ? <View style={styles.filterTabUnderline} /> : null}
              </Pressable>
            );
          })}
        </TourScrollView>
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.centerContainer}>
          <LogoLoader size={56} color={c.primary} />
          <Text style={styles.loadingText}>Loading notices...</Text>
        </View>
      ) : (
        <FlatList
          data={sortedNotices}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshing={loading}
          onRefresh={fetchNotices}
          windowSize={7}
          maxToRenderPerBatch={8}
          initialNumToRender={8}
          removeClippedSubviews={Platform.OS === 'android'}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Animated.View entering={ZoomIn.duration(380)} style={styles.emptyIconWrap}>
                <Ionicons name="megaphone-outline" size={28} color={c.alertBorder} />
              </Animated.View>
              <Text style={styles.emptyTitle}>
                {searchQuery || audienceFilter !== 'all_filter' ? 'No matches' : 'No notices yet'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {searchQuery
                  ? `Nothing matched “${searchQuery}”`
                  : audienceFilter !== 'all_filter'
                    ? `No notices for ${audienceLabel(audienceFilter as NoticeAudience)}`
                    : 'Post an announcement for students, staff, or parents.'}
              </Text>
              {!searchQuery && audienceFilter === 'all_filter' && (
                <PressScale onPress={() => setModalVisible(true)} style={styles.emptyCta}>
                  <Text style={styles.emptyCtaText}>Post first notice</Text>
                  <Ionicons name="arrow-forward" size={14} color={Colors.white} />
                </PressScale>
              )}
            </View>
          }
        />
      )}

      {/* FAB — hidden while composing (one primary action) */}
      {!modalVisible && (
        <RNAnimated.View style={[styles.fabWrapper, { transform: [{ scale: fabScale }], bottom: 24 + Math.max(insets.bottom - 8, 0) }]}>
          <TouchableOpacity
            style={styles.fab}
            onPress={() => setModalVisible(true)}
            onPressIn={onFabIn}
            onPressOut={onFabOut}
            activeOpacity={1}
            accessibilityLabel="Post a notice"
          >
            <Ionicons name="add" size={20} color={Colors.white} />
            <Text style={styles.fabLabel}>Post Notice</Text>
          </TouchableOpacity>
        </RNAnimated.View>
      )}

      {/* ══════════════════════════════════════════════════════════
          CREATE MODAL — compact single-surface composer
      ══════════════════════════════════════════════════════════ */}
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
              colors={[
                isDark ? schoolColorWithAlpha(c.primary, 0.12) : schoolColorWithAlpha(c.alertBg, 0.95),
                'transparent',
              ]}
              style={styles.sheetAura}
              pointerEvents="none"
            />

            {!isWide && <View style={styles.sheetHandle} />}

            <View style={styles.sheetHeader}>
              <View style={styles.sheetTitleRow}>
                <View style={styles.sheetIconBadge}>
                  <Ionicons name="megaphone" size={17} color={c.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sheetTitle}>Post a Notice</Text>
                  <Text style={styles.sheetSubtitle}>{audienceHint} · {priorityHint}</Text>
                </View>
              </View>
              <PressScale onPress={closeModal} style={styles.closeBtn}>
                <Ionicons name="close" size={18} color={c.textMuted} />
              </PressScale>
            </View>

            <TourScrollView
              style={styles.sheetScrollView}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.sheetScroll}
              keyboardShouldPersistTaps="handled"
              bounces={false}
            >
              {/* Title */}
              <View style={styles.fieldBlock}>
                <View style={styles.labelRow}>
                  <Text style={[styles.label, { marginBottom: 0 }]}>Headline</Text>
                  <Text style={[styles.charCount, { marginBottom: 0 }, title.length > TITLE_MAX * 0.9 && { color: c.primary }]}>
                    {title.length}/{TITLE_MAX}
                  </Text>
                </View>
                <View style={[styles.inputFrame, clayInset(isDark, titleFocused) as any, titleFocused && styles.inputFocused]}>
                  <AppTextInput
                    style={styles.input}
                    placeholder="What’s happening?"
                    placeholderTextColor={c.textMuted}
                    value={title}
                    onChangeText={(t) => setTitle(t.slice(0, TITLE_MAX))}
                    onFocus={() => setTitleFocused(true)}
                    onBlur={() => setTitleFocused(false)}
                    returnKeyType="next"
                  />
                </View>
                {attemptedSubmit && !titleOk && (
                  <Text style={styles.fieldError}>Add a headline so people can scan the board</Text>
                )}
              </View>

              {/* Body */}
              <View style={styles.fieldBlock}>
                <View style={styles.labelRow}>
                  <Text style={[styles.label, { marginBottom: 0 }]}>Details</Text>
                  <Text style={[styles.charCount, { marginBottom: 0 }, content.length > BODY_MAX * 0.9 && { color: c.primary }]}>
                    {content.length}/{BODY_MAX}
                  </Text>
                </View>
                <View style={[styles.inputFrame, styles.textAreaFrame, clayInset(isDark, bodyFocused) as any, bodyFocused && styles.inputFocused]}>
                  <AppTextInput
                    style={[styles.input, styles.textArea]}
                    placeholder="Who, what, when…"
                    placeholderTextColor={c.textMuted}
                    value={content}
                    onChangeText={(t) => setContent(t.slice(0, BODY_MAX))}
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                    onFocus={() => setBodyFocused(true)}
                    onBlur={() => setBodyFocused(false)}
                  />
                </View>
                {attemptedSubmit && !bodyOk && (
                  <Text style={styles.fieldError}>Add a short body with the key details</Text>
                )}
              </View>

              <View style={styles.divider} />

              {/* Audience — multi-select chips */}
              <View style={styles.fieldBlock}>
                <View style={styles.labelRow}>
                  <Text style={[styles.label, { marginBottom: 0 }]}>Audience</Text>
                  <Text style={styles.multiHint}>Tap to select multiple</Text>
                </View>
                <View style={styles.audienceTrack}>
                  {AUDIENCE_OPTIONS.map((a) => {
                    const active = selectedAudiences.includes(a);
                    return (
                      <PressScale key={a} onPress={() => toggleAudience(a)} style={styles.audienceSeg}>
                        <View style={[styles.audienceChip, active && styles.audienceChipActive]}>
                          <AudienceIcon
                            type={a}
                            size={14}
                            color={active ? Colors.white : c.textMuted}
                            audienceMeta={audienceMeta}
                          />
                          <Text
                            style={[styles.chipText, active && styles.chipTextActive]}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            minimumFontScale={0.85}
                          >
                            {audienceLabel(a)}
                          </Text>
                        </View>
                      </PressScale>
                    );
                  })}
                </View>

                {needsClass && (
                  <Animated.View entering={FadeInDown.duration(220)} style={{ marginTop: 10 }}>
                    <TourScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.classRow}>
                      {classes.map((cls) => {
                        const active = targetClassId === cls.id;
                        return (
                          <PressScale key={cls.id} onPress={() => setTargetClassId(cls.id)}>
                            <View style={[styles.classChip, active && styles.classChipActive]}>
                              <Text style={[styles.classChipText, active && styles.classChipTextActive]}>
                                {cls.name}
                              </Text>
                            </View>
                          </PressScale>
                        );
                      })}
                    </TourScrollView>
                    {attemptedSubmit && !classOk && (
                      <Text style={styles.fieldError}>Pick a class to continue</Text>
                    )}
                  </Animated.View>
                )}
              </View>

              {/* Priority — selected state uses brand primary; color dots carry meaning */}
              <View style={styles.fieldBlock}>
                <Text style={styles.label}>Priority</Text>
                <View style={styles.priorityTrack}>
                  {(['low', 'medium', 'high'] as const).map((p) => {
                    const pm = priorityMeta[p];
                    const active = priority === p;
                    return (
                      <PressScale key={p} onPress={() => setPriority(p)} style={styles.prioritySeg}>
                        <View style={[styles.priorityChip, active && styles.priorityChipActive]}>
                          <View style={[styles.priorityDot, { backgroundColor: active ? Colors.white : pm.dot }]} />
                          <Text style={[
                            styles.priorityChipText,
                            active && styles.priorityChipTextActive,
                          ]}>
                            {p.charAt(0).toUpperCase() + p.slice(1)}
                          </Text>
                        </View>
                      </PressScale>
                    );
                  })}
                </View>
              </View>

              {/* Pin — compact inline row */}
              <Pressable
                onPress={() => setIsPinned(!isPinned)}
                style={[styles.pinRow, isPinned && styles.pinRowActive]}
              >
                <View style={styles.pinRowLeft}>
                  <View style={[styles.pinIconBox, isPinned && styles.pinIconBoxActive]}>
                    <Ionicons name="pin" size={14} color={isPinned ? Colors.white : c.textMuted} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pinLabel}>Pin to top</Text>
                    <Text style={styles.pinSubLabel}>Stays above other notices</Text>
                  </View>
                </View>
                <ClayToggle
                  value={isPinned}
                  onChange={setIsPinned}
                  activeColor={c.primary}
                  inactiveColor={schoolColorWithAlpha(c.textMuted, 0.35)}
                />
              </Pressable>
            </TourScrollView>

            <View style={styles.stickyFooter}>
              {!canPublish && attemptedSubmit && (
                <Animated.View entering={FadeIn.duration(160)} style={styles.footerHint}>
                  <Ionicons name="information-circle" size={14} color={c.primary} />
                  <Text style={styles.footerHintText}>
                    {!titleOk ? 'Add a headline' : !bodyOk ? 'Add details' : 'Pick a class'}
                  </Text>
                </Animated.View>
              )}
              <PremiumButton
                title={creating ? 'Publishing…' : 'Publish Notice'}
                onPress={handleCreate}
                loading={creating}
                disabled={creating}
                height={48}
                colors={canPublish
                  ? [c.primary, c.primaryDark]
                  : [schoolColorWithAlpha(c.primary, 0.45), schoolColorWithAlpha(c.primaryLight, 0.55)]}
                icon={!creating ? <Ionicons name="send" size={14} color={Colors.white} style={{ marginLeft: 8 }} /> : undefined}
                style={!canPublish ? { ...styles.publishBtn, opacity: 0.72 } : styles.publishBtn}
              />
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────────────────
const getStyles = (theme: SchoolTheme, isDark: boolean) => {
  const c = theme.colors;
  const soft = ADMIN_THEME.colors.background.subtle;
  const mid = schoolColorWithAlpha(c.primary, isDark ? 0.22 : 0.12);
  const edge = c.alertBorder;
  const overlay = schoolColorWithAlpha(Colors.textStrong, 0.55);
  const track = isDark ? schoolColorWithAlpha(Colors.black, 0.25) : c.borderLight;
  const inverse = ADMIN_THEME.colors.text.inverse;

  return StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 14, fontSize: 13, color: c.textSecondary, letterSpacing: 0.2 },

  toolbar: {
    marginHorizontal: 16,
    marginTop: 12,
    gap: 8,
  },
  searchContainer: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: c.card,
    paddingHorizontal: 12, borderRadius: 12, height: 42,
    borderWidth: 1, borderColor: c.border,
  },
  searchFocused: {
    borderColor: edge,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 14, color: c.textStrong, fontWeight: '500' },
  clearBtn: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: c.textMuted, justifyContent: 'center', alignItems: 'center',
  },

  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: isDark ? schoolColorWithAlpha(c.primary, 0.12) : c.borderLight,
  },
  statPillPinned: {
    backgroundColor: mid,
  },
  statPillUrgent: {
    backgroundColor: c.alertBgDanger,
  },
  statUrgentDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statPillNum: {
    fontSize: 13,
    fontWeight: '800',
    color: c.textStrong,
    letterSpacing: -0.2,
  },
  statPillLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: c.textSecondary,
  },

  listContent: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 110 },

  card: {
    backgroundColor: c.card,
    borderRadius: 14, marginBottom: 8,
    flexDirection: 'row', overflow: 'hidden',
    borderWidth: 1, borderColor: schoolColorWithAlpha(c.border, 0.9),
  },
  cardPinned: {
    borderColor: edge,
    backgroundColor: isDark ? c.card : soft,
  },
  cardStripe: { width: 3 },
  cardInner: { flex: 1, paddingVertical: 12, paddingHorizontal: 12 },
  cardTop: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 4, gap: 8,
  },
  titleRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  pinBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: mid, paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 6, flexShrink: 0,
  },
  pinText: { fontSize: 9, fontWeight: '700', color: c.primary, letterSpacing: 0.2 },
  cardTitle: {
    flex: 1, fontSize: 14.5, fontWeight: '700', color: c.textStrong,
    letterSpacing: -0.2, lineHeight: 20,
  },
  priorityBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 7, paddingVertical: 3,
    borderRadius: 8, borderWidth: 1, flexShrink: 0,
  },
  priorityText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.4 },
  cardContent: {
    fontSize: 13, color: c.textSecondary,
    lineHeight: 18, marginBottom: 8,
  },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  audiencePillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, flex: 1 },
  audiencePill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
  },
  audienceText: { fontSize: 11, fontWeight: '600' },
  timeRow: { flexDirection: 'row', alignItems: 'center', flexShrink: 0 },
  dateText: { fontSize: 11, color: c.textTertiary, fontWeight: '500', flexShrink: 0 },

  filterWrap: {
    marginTop: 10,
    marginHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.border,
  },
  filterScroll: { flexGrow: 0 },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 2,
    paddingRight: 4,
  },
  filterTab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 12,
    position: 'relative',
  },
  filterTabActive: {
    backgroundColor: 'transparent',
  },
  filterTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: c.textMuted,
  },
  filterTabTextActive: {
    color: c.primary,
    fontWeight: '700',
  },
  filterTabUnderline: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 0,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: c.primary,
  },
  multiHint: { fontSize: 11, fontWeight: '600', color: c.textTertiary, marginBottom: 0 },

  emptyContainer: { alignItems: 'center', paddingTop: 56, paddingHorizontal: 28 },
  emptyIconWrap: {
    width: 72, height: 72, borderRadius: 20,
    backgroundColor: soft,
    justifyContent: 'center', alignItems: 'center', marginBottom: 16,
    overflow: 'hidden',
    borderWidth: 1, borderColor: edge,
  },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: c.textStrong, letterSpacing: -0.3 },
  emptySubtitle: {
    fontSize: 14, color: c.textSecondary, marginTop: 6,
    textAlign: 'center', lineHeight: 20, maxWidth: 300,
  },
  emptyCta: {
    marginTop: 18, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: c.primary, paddingHorizontal: 18, paddingVertical: 11,
    borderRadius: 12, overflow: 'hidden',
  },
  emptyCtaText: { color: inverse, fontWeight: '700', fontSize: 14 },

  fabWrapper: { position: 'absolute', right: 16 },
  fab: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: c.primary,
    paddingVertical: 12, paddingHorizontal: 16,
    borderRadius: 14, gap: 6, overflow: 'hidden',
    ...(Platform.OS === 'android' ? { elevation: 6 } : {
      shadowColor: c.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.28, shadowRadius: 12,
    }),
  },
  fabLabel: { color: inverse, fontWeight: '700', fontSize: 13.5, letterSpacing: 0.15 },

  // ── Sheet ─────────────────────────────────────────────────
  sheetOverlay: {
    flex: 1, backgroundColor: overlay,
    justifyContent: 'flex-end',
  },
  sheetOverlayWide: {
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  sheetContent: {
    backgroundColor: c.card,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: 20, paddingTop: 10,
    maxHeight: '90%',
    width: '100%',
    overflow: 'hidden',
    ...(Platform.OS === 'android' ? { elevation: 16 } : {
      shadowColor: Colors.textStrong, shadowOffset: { width: 0, height: -8 }, shadowOpacity: 0.22, shadowRadius: 28,
    }),
  },
  sheetContentWide: {
    maxWidth: 480, maxHeight: '84%',
    borderRadius: 28,
  },
  sheetAura: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 100,
  },
  sheetHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: schoolColorWithAlpha(c.textMuted, isDark ? 0.35 : 0.4),
    alignSelf: 'center', marginBottom: 12,
  },
  sheetHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 14, gap: 10,
  },
  sheetTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  sheetIconBadge: {
    width: 40, height: 40, borderRadius: 14,
    backgroundColor: mid,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: edge,
  },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: c.textStrong, letterSpacing: -0.4 },
  sheetSubtitle: { fontSize: 12, color: c.textSecondary, marginTop: 2 },
  closeBtn: {
    width: 40, height: 40, borderRadius: 14,
    backgroundColor: isDark ? c.background : c.borderLight,
    justifyContent: 'center', alignItems: 'center',
  },
  sheetScrollView: { flexGrow: 0, flexShrink: 1 },
  sheetScroll: { paddingBottom: 8 },

  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: c.border,
    marginVertical: 4, marginBottom: 14,
  },

  fieldBlock: { marginBottom: 14 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 },
  label: {
    fontSize: 11, fontWeight: '700', color: c.textTertiary,
    letterSpacing: 0.7, textTransform: 'uppercase', marginBottom: 7, paddingLeft: 1,
  },
  charCount: { fontSize: 11, fontWeight: '600', color: c.textTertiary, marginBottom: 7 },
  inputFrame: {
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12,
    overflow: 'hidden',
    backgroundColor: isDark ? c.background : c.borderLight,
    borderWidth: 1.5,
    borderColor: schoolColorWithAlpha(c.border, 0.7),
  },
  inputFocused: {
    borderColor: edge,
    backgroundColor: isDark ? c.surface : c.background,
  },
  textAreaFrame: { paddingVertical: 12 },
  input: {
    fontSize: 15, color: c.textStrong, fontWeight: '500',
    backgroundColor: 'transparent', borderWidth: 0, padding: 0,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' as any } : {}),
  },
  textArea: { minHeight: 80, textAlignVertical: 'top', lineHeight: 22 },
  fieldError: {
    fontSize: 12, color: c.primary, marginTop: 6, fontWeight: '600', paddingLeft: 2,
  },

  audienceTrack: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: track,
    borderRadius: 14, padding: 4, gap: 4,
  },
  audienceSeg: { flex: 1, minWidth: 0 },
  audienceChip: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    minHeight: 52,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 11,
  },
  audienceChipActive: {
    backgroundColor: c.primary,
    ...(Platform.OS === 'android' ? { elevation: 2 } : {
      shadowColor: c.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.28, shadowRadius: 4,
    }),
  },
  chipText: {
    fontSize: 11, color: c.textMuted, fontWeight: '600',
    textAlign: 'center', lineHeight: 13,
    ...(Platform.OS === 'web' ? { whiteSpace: 'nowrap' as any } : {}),
  },
  chipTextActive: { color: inverse, fontWeight: '700' },

  classRow: { gap: 8, paddingVertical: 2 },
  classChip: {
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999,
    backgroundColor: isDark ? c.background : c.borderLight,
    borderWidth: 1.5, borderColor: 'transparent',
  },
  classChipActive: { backgroundColor: c.primary, borderColor: c.primary },
  classChipText: { fontSize: 13, color: c.textSecondary, fontWeight: '600' },
  classChipTextActive: { color: inverse, fontWeight: '700' },

  priorityTrack: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 4,
    backgroundColor: track,
    borderRadius: 14, padding: 4,
  },
  prioritySeg: { flex: 1, minWidth: 0 },
  priorityChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    minHeight: 44,
    paddingVertical: 10,
    borderRadius: 11,
  },
  priorityChipActive: {
    backgroundColor: c.primary,
    ...(Platform.OS === 'android' ? { elevation: 2 } : {
      shadowColor: c.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.28, shadowRadius: 4,
    }),
  },
  priorityDot: { width: 7, height: 7, borderRadius: 3.5 },
  priorityChipText: { fontSize: 13, color: c.textSecondary, fontWeight: '600' },
  priorityChipTextActive: { color: inverse, fontWeight: '700' },

  pinRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: isDark ? c.background : c.borderLight,
    borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12,
    borderWidth: 1.5, borderColor: c.border,
    marginBottom: 4,
  },
  pinRowActive: { backgroundColor: soft, borderColor: edge },
  pinRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, paddingRight: 8 },
  pinIconBox: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: isDark ? c.card : c.border,
    justifyContent: 'center', alignItems: 'center',
  },
  pinIconBoxActive: { backgroundColor: c.primary },
  pinLabel: { fontSize: 13, fontWeight: '700', color: c.textStrong },
  pinSubLabel: { fontSize: 11, color: c.textSecondary, marginTop: 1 },

  stickyFooter: {
    paddingTop: 12, paddingBottom: 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.border,
  },
  footerHint: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginBottom: 8, paddingHorizontal: 2,
  },
  footerHintText: { fontSize: 12, color: c.primary, fontWeight: '600' },
  publishBtn: {
    borderRadius: 14, overflow: 'hidden',
    ...(Platform.OS === 'android' ? { elevation: 4 } : {
      shadowColor: c.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.22, shadowRadius: 10,
    }),
  },
});
};