import { TourTarget } from '@/src/features/app-tour';
import React, { useMemo, useCallback, useState, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Platform,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeIn, Layout } from 'react-native-reanimated';
import ScreenLayout from '../../src/components/ScreenLayout';
import StudentHeader from '../../src/components/StudentHeader';
import type { Notice } from '../../src/services/commonServices';
import { useTheme } from '../../src/hooks/useTheme';
import type { SchoolTheme } from '../../src/hooks/useTheme';
import { t_field } from '../../src/utils/lang';
import LogoLoader from '../../src/components/LogoLoader';
import { useStudentQuery } from '../../src/hooks/useStudentQuery';
import { useAuth } from '../../src/hooks/useAuth';
import { ErrorBoundary } from '../../src/components/ErrorBoundary';
import ReadAloudButton from '../../src/components/ReadAloudButton';
import { readAloudService } from '../../src/services/readAloudService';
import { useFocusEffect } from 'expo-router';
import * as Haptics from '../../src/utils/haptics';
import { schoolColorWithAlpha } from '../../src/constants/schoolConfig';

type FilterId = 'all' | 'important';

interface UINotice {
  id: string;
  title: string;
  title_te?: string;
  message: string;
  message_te?: string;
  date: string;
  time: string;
  important: boolean;
  authorName?: string;
  priority?: Notice['priority'];
}

type ListRow =
  | { kind: 'month'; id: string; label: string }
  | { kind: 'notice'; id: string; item: UINotice; isLast: boolean };

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const COLLAPSED_LINES = 3;

const noticeSortKeyMs = (n: Notice): number =>
  new Date(n.published_at || n.publish_at || n.created_at).getTime();

const sortNoticesNewestFirst = (data: Notice[]): Notice[] =>
  [...data].sort((a, b) => noticeSortKeyMs(b) - noticeSortKeyMs(a));

const ymdFromIso = (iso?: string): string => {
  if (!iso) return '';
  const stamp = iso.split('T')[0];
  return stamp || '';
};

const formatClock = (iso?: string, allDayLabel = 'All day'): string => {
  if (!iso || !iso.includes('T')) return allDayLabel;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return allDayLabel;
  const hours = date.getHours();
  const minutes = date.getMinutes();
  if (hours === 0 && minutes === 0) return allDayLabel;
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
};

const mapNoticesToUi = (data: Notice[], allDayLabel: string): UINotice[] =>
  data.map((n) => {
    const iso = n.published_at || n.publish_at || n.created_at;
    return {
      id: n.id,
      title: n.title,
      title_te: n.title_te,
      message: n.content,
      message_te: n.content_te,
      date: ymdFromIso(iso),
      time: formatClock(iso, allDayLabel),
      important: Boolean(n.is_pinned || n.priority === 'urgent' || n.priority === 'high'),
      authorName: n.author_name,
      priority: n.priority,
    };
  });

const startOfLocalDay = (value: Date) => {
  const copy = new Date(value);
  copy.setHours(0, 0, 0, 0);
  return copy;
};

const relativeDayKey = (ymd: string): 'today' | 'yesterday' | null => {
  if (!ymd || ymd.includes('/')) return null;
  const parts = ymd.split('-');
  if (parts.length !== 3) return null;
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!year || !month || !day) return null;
  const target = startOfLocalDay(new Date(year, month - 1, day));
  const today = startOfLocalDay(new Date());
  const diffDays = Math.round((today.getTime() - target.getTime()) / 86400000);
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  return null;
};

const formatMonthLabel = (ymd: string, locale: string): string => {
  const parts = ymd.split('-');
  if (parts.length < 2) return ymd;
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  if (!year || !month) return ymd;
  try {
    return new Date(year, month - 1, 1).toLocaleDateString(locale.startsWith('te') ? 'te-IN' : 'en-IN', {
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return `${MONTHS[month - 1] || ''} ${year}`.trim();
  }
};

const buildListRows = (notices: UINotice[], locale: string): ListRow[] => {
  const rows: ListRow[] = [];
  let lastMonth = '';
  notices.forEach((item, index) => {
    const monthKey = item.date.slice(0, 7);
    if (monthKey && monthKey !== lastMonth) {
      lastMonth = monthKey;
      rows.push({
        kind: 'month',
        id: `month-${monthKey}`,
        label: formatMonthLabel(item.date, locale),
      });
    }
    rows.push({
      kind: 'notice',
      id: item.id,
      item,
      isLast: index === notices.length - 1,
    });
  });
  return rows;
};

const DateCol = memo(function DateCol({
  item,
  styles,
  todayLabel,
  yesterdayLabel,
}: {
  item: UINotice;
  styles: ReturnType<typeof getStyles>;
  todayLabel: string;
  yesterdayLabel: string;
}) {
  const parts = useMemo(() => {
    if (!item.date || item.date.includes('/')) return null;
    const p = item.date.split('-');
    if (p.length !== 3) return null;
    const year = parseInt(p[0], 10);
    const monthNum = parseInt(p[1], 10);
    const day = parseInt(p[2], 10);
    if (!year || !monthNum || !day) return null;
    return {
      day,
      month: MONTHS[monthNum - 1] || 'DAT',
      year,
      relative: relativeDayKey(item.date),
    };
  }, [item.date]);

  if (!parts) {
    return (
      <View style={styles.leftCol}>
        <Text style={styles.dateFallbackText}>{item.date}</Text>
      </View>
    );
  }

  const relative = parts.relative === 'today' ? todayLabel : parts.relative === 'yesterday' ? yesterdayLabel : null;

  return (
    <View
      style={[styles.leftCol, item.important && styles.leftColImportant]}
      accessibilityLabel={`${relative || `${parts.month} ${parts.day}, ${parts.year}`}, ${item.time}`}
    >{[
      relative ? (
        <Text key="relative" style={[styles.dateRelative, item.important && styles.dateRelativeImportant]}>
          {relative}
        </Text>
      ) : null,
      <View
        key="pill"
        style={styles.calendarPill}
      >{[
        <Text
          key="month"
          style={[styles.calendarMonth, item.important && styles.calendarMonthImportant]}
        >
          {parts.month}
        </Text>,
        <Text
          key="day"
          style={[styles.calendarDay, item.important && styles.calendarDayImportant]}
        >
          {parts.day}
        </Text>,
        <Text key="year" style={styles.calendarYear}>{parts.year}</Text>,
      ]}</View>,
    ]}</View>
  );
});

const MonthHeader = memo(function MonthHeader({
  label,
  styles,
}: {
  label: string;
  styles: ReturnType<typeof getStyles>;
}) {
  const { theme, isDark } = useTheme();
  return (
    <View style={styles.monthRow}>{[
      <View key="icon" style={styles.monthIcon}>
        <Ionicons
          name="calendar-clear-outline"
          size={13}
          color={isDark ? theme.colors.primaryLight : theme.colors.primary}
        />
      </View>,
      <Text key="label" style={styles.monthLabel}>{label}</Text>,
      <View key="rule-end" style={styles.monthRule} />,
    ]}</View>
  );
});

const NoticeTimelineRow = memo(function NoticeTimelineRow({
  item,
  index,
  isLast,
  styles,
}: {
  item: UINotice;
  index: number;
  isLast: boolean;
  styles: ReturnType<typeof getStyles>;
}) {
  const { t } = useTranslation();
  const { isDark, theme } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(false);

  const localizedTitle = t_field(item.title, item.title_te);
  const localizedMessage = t_field(item.message, item.message_te);
  const bodyDuplicatesTitle =
    localizedMessage.trim().length > 0 &&
    localizedMessage.trim().toLowerCase() === localizedTitle.trim().toLowerCase();
  const showBody = localizedMessage.trim().length > 0 && !bodyDuplicatesTitle;
  const speechParts = useMemo(
    () => [localizedTitle, bodyDuplicatesTitle ? undefined : localizedMessage],
    [localizedMessage, localizedTitle, bodyDuplicatesTitle]
  );

  const accentColor = item.important ? theme.colors.danger : theme.colors.primary;
  const cardBg = item.important
    ? (isDark ? 'rgba(239, 68, 68, 0.10)' : '#FFF7F7')
    : (isDark ? theme.colors.surface : '#FFFFFF');
  const cardBorder = item.important
    ? (isDark ? 'rgba(239, 68, 68, 0.28)' : 'rgba(239, 68, 68, 0.16)')
    : (isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.06)');

  const onToggle = useCallback(() => {
    if (!showBody || !canExpand) return;
    Haptics.selectionAsync();
    setExpanded((prev) => !prev);
  }, [canExpand, showBody]);

  const onBodyLayout = useCallback((event: { nativeEvent: { lines: { text: string }[] } }) => {
    if (expanded) return;
    if (event.nativeEvent.lines.length >= COLLAPSED_LINES) setCanExpand(true);
  }, [expanded]);

  return (
    <Animated.View
      entering={FadeInDown.delay(Math.min(index, 8) * 45).springify().damping(16).stiffness(125)}
      layout={Layout.springify().damping(18)}
      style={[styles.timelineItem, isLast && styles.timelineItemLast]}
    >
      <Pressable
        onPress={onToggle}
        disabled={!showBody || !canExpand}
        accessibilityRole={canExpand ? 'button' : undefined}
        accessibilityLabel={`${localizedTitle}. ${localizedMessage}`}
        accessibilityHint={canExpand ? t('announcements.readMore', 'Read more') : undefined}
        accessibilityState={{ expanded }}
        style={({ pressed }) => [
          styles.card,
          {
            backgroundColor: cardBg,
            borderColor: cardBorder,
            borderBottomColor: item.important
              ? 'rgba(239, 68, 68, 0.28)'
              : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.10)'),
            transform: [{ scale: pressed && canExpand ? 0.985 : 1 }],
          },
          Platform.OS === 'web' ? ({ cursor: canExpand ? 'pointer' : 'auto' } as const) : null,
        ]}
      >{[
        <LinearGradient
          key="sheen"
          colors={isDark
            ? ['rgba(255,255,255,0.08)', 'rgba(255,255,255,0)']
            : ['rgba(255,255,255,0.95)', 'rgba(255,255,255,0)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.55, y: 0.9 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />,
        item.important ? <View key="rail-accent" style={styles.importantRail} /> : null,
        <View key="header" style={styles.cardHeader}>{[
          <DateCol
            key="date"
            item={item}
            styles={styles}
            todayLabel={t('announcements.today', 'Today')}
            yesterdayLabel={t('announcements.yesterday', 'Yesterday')}
          />,
          <View key="heading" style={styles.cardHeading}>{[
            item.important ? (
              <View key="badge" style={styles.badge}>
                <Ionicons name="alert-circle" size={11} color={theme.colors.danger} />
                <Text style={styles.badgeText}>{t('announcements.important', 'Important')}</Text>
              </View>
            ) : null,
            <Text
              key="title"
              style={[styles.cardTitle, { color: isDark ? '#F8FAFC' : '#0F172A' }]}
              numberOfLines={expanded ? 4 : 2}
            >
              {localizedTitle}
            </Text>,
          ]}</View>,
          <ReadAloudButton
            key="speech"
            id={`announcement-${item.id}`}
            text={speechParts}
            color={accentColor}
            size={32}
          />,
        ]}</View>,
        showBody ? (
          <Text
            key="message"
            style={[styles.message, { color: isDark ? '#CBD5E1' : '#475569' }]}
            numberOfLines={expanded ? undefined : COLLAPSED_LINES}
            onTextLayout={onBodyLayout}
          >
            {localizedMessage}
          </Text>
        ) : null,
        (canExpand && showBody) || item.authorName ? (
          <View key="footer" style={styles.cardFooter}>{[
            item.authorName ? (
              <View key="author-wrap" style={styles.authorWrap}>
                <View style={styles.authorIcon}>
                  <Ionicons name="school-outline" size={12} color={theme.colors.textMuted} />
                </View>
                <Text style={styles.authorText} numberOfLines={1}>
                  {t('announcements.from', { name: item.authorName, defaultValue: `From ${item.authorName}` })}
                </Text>
              </View>
            ) : <View key="spacer" style={styles.footerSpacer} />,
            canExpand && showBody ? (
              <View key="more-wrap" style={styles.readMoreWrap}>
                <Text style={[styles.readMore, { color: accentColor }]}>
                  {expanded
                    ? t('announcements.showLess', 'Show less')
                    : t('announcements.readMore', 'Read more')}
                </Text>
                <Ionicons
                  name={expanded ? 'chevron-up' : 'chevron-down'}
                  size={13}
                  color={accentColor}
                />
              </View>
            ) : null,
          ]}</View>
        ) : null,
        <View key="time" style={styles.timeRow}>
          <Ionicons name="time-outline" size={12} color={theme.colors.textMuted} />
          <Text style={styles.timeText}>{item.time}</Text>
        </View>,
        <Ionicons
          key="watermark"
          name={item.important ? 'alert-circle' : 'notifications'}
          size={28}
          color={accentColor}
          style={styles.bgIcon}
        />,
      ]}</Pressable>
    </Animated.View>
  );
});

function AnnouncementsScreenInner() {
  const { theme, isDark } = useTheme();
  const styles = React.useMemo(() => getStyles(theme, isDark), [theme, isDark]);
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [filter, setFilter] = useState<FilterId>('all');

  useFocusEffect(useCallback(() => () => {
    void readAloudService.stop();
  }, []));

  const { data: noticePayload, loading, isRefreshing, error, refetch } = useStudentQuery<Notice[]>(
    '/notices',
    'notices:students',
    2 * 60 * 1000,
    user?.userId,
    { enabled: true, query: { audience: 'students' } }
  );

  const allDayLabel = t('announcements.allDay', 'All day');
  const notices = useMemo(
    () => mapNoticesToUi(sortNoticesNewestFirst(noticePayload ?? []), allDayLabel),
    [noticePayload, allDayLabel]
  );

  const importantCount = useMemo(
    () => notices.filter((item) => item.important).length,
    [notices]
  );

  const visibleNotices = useMemo(
    () => (filter === 'important' ? notices.filter((item) => item.important) : notices),
    [filter, notices]
  );

  const rows = useMemo(
    () => buildListRows(visibleNotices, i18n.language),
    [visibleNotices, i18n.language]
  );

  const onRefresh = useCallback(() => {
    void refetch();
  }, [refetch]);

  const onSelectFilter = useCallback((next: FilterId) => {
    if (next === filter) return;
    Haptics.selectionAsync();
    setFilter(next);
  }, [filter]);

  const renderItem = useCallback(
    ({ item, index }: { item: ListRow; index: number }) => {
      if (item.kind === 'month') {
        return <MonthHeader label={item.label} styles={styles} />;
      }
      return (
        <NoticeTimelineRow
          item={item.item}
          index={index}
          isLast={item.isLast}
          styles={styles}
        />
      );
    },
    [styles]
  );

  const keyExtractor = useCallback((item: ListRow) => item.id, []);

  const emptyList = useCallback(() => (
    <Animated.View entering={FadeIn.duration(280)} style={styles.emptyWrap}>{[
      <View key="icon" style={styles.emptyIconWell}>
        <Ionicons
          name={filter === 'important' ? 'bookmark-outline' : 'megaphone-outline'}
          size={28}
          color={theme.colors.primary}
        />
      </View>,
      <Text key="title" style={styles.emptyTitle}>
        {t('announcements.emptyTitle', "You're all caught up")}
      </Text>,
      <Text key="sub" style={styles.emptySubtitle}>
        {filter === 'important'
          ? t('announcements.emptyImportant', 'No important notices right now.')
          : t('announcements.emptySubtitle', 'New school notices will appear here.')}
      </Text>,
      error ? (
        <Pressable key="retry" onPress={onRefresh} style={styles.retryBtn}>
          <Text style={styles.retryText}>{t('announcements.retry', 'Try again')}</Text>
        </Pressable>
      ) : null,
    ]}</Animated.View>
  ), [error, filter, onRefresh, styles, t, theme.colors.primary]);

  const filters: { id: FilterId; label: string; count: number }[] = [
    { id: 'all', label: t('announcements.all', 'All'), count: notices.length },
    { id: 'important', label: t('announcements.pinned', 'Important'), count: importantCount },
  ];

  return (
    <ScreenLayout>{[
      <StudentHeader
        key="screen-hdr"
        showBackButton={true}
        title={t('announcements.title', 'Announcements')}
      />,
      <View key="screen-body" style={styles.container}>{[
        <View key="hero" style={styles.heroCard}>{[
          <LinearGradient
            key="hero-bg"
            colors={isDark
              ? [theme.colors.primaryDark, '#17152E']
              : [theme.colors.primaryDark, theme.colors.primary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />,
          <View key="glow-one" style={styles.heroGlowOne} />,
          <View key="glow-two" style={styles.heroGlowTwo} />,
          <View key="hero-top" style={styles.heroTop}>{[
            <View key="hero-icon" style={styles.heroIcon}>
              <Ionicons name="megaphone" size={20} color="#FFFFFF" />
            </View>,
            <View key="hero-copy" style={styles.heroCopy}>{[
              <Text key="board" style={styles.pageTitle}>
                {t('announcements.board', 'Notice board')}
              </Text>,
              <Text key="sub" style={styles.subtitle}>
                {t('announcements.subtitle', "What's happening at school")}
              </Text>,
            ]}</View>,
          ]}</View>,
          <View key="hero-stats" style={styles.heroStats}>{[
            <View key="all-stat" style={styles.heroStat}>{[
              <View key="all-stat-icon" style={styles.heroStatIcon}>
                <Ionicons name="notifications-outline" size={14} color="#FFFFFF" />
              </View>,
              <Text key="all-stat-text" style={styles.heroStatText}>
                {t('announcements.updates', { count: notices.length, defaultValue: `${notices.length} updates` })}
              </Text>,
            ]}</View>,
            <View key="stat-divider" style={styles.heroStatDivider} />,
            <View key="important-stat" style={styles.heroStat}>{[
              <View key="important-stat-icon" style={styles.heroStatIcon}>
                <Ionicons name="alert-circle-outline" size={14} color="#FFFFFF" />
              </View>,
              <Text key="important-stat-text" style={styles.heroStatText}>
                {t('announcements.pinnedCount', {
                  count: importantCount,
                  defaultValue: `${importantCount} important`,
                })}
              </Text>,
            ]}</View>,
          ]}</View>,
        ]}</View>,
        <View key="filters" style={styles.filterRow}>
          {filters.map((chip) => {
            const active = filter === chip.id;
            return (
              <Pressable
                key={chip.id}
                onPress={() => onSelectFilter(chip.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${chip.label}, ${chip.count}`}
                style={({ pressed }) => [
                  styles.filterChip,
                  active && styles.filterChipActive,
                  pressed && styles.filterChipPressed,
                ]}
              >{[
                <Ionicons
                  key="icon"
                  name={chip.id === 'all' ? 'albums-outline' : 'alert-circle-outline'}
                  size={16}
                  color={active
                    ? (isDark ? '#FFFFFF' : theme.colors.primaryDark)
                    : theme.colors.textMuted}
                />,
                <Text
                  key="label"
                  style={[styles.filterChipText, active && styles.filterChipTextActive]}
                >
                  {chip.label}
                </Text>,
                <View
                  key="count"
                  style={[styles.filterCount, active && styles.filterCountActive]}
                >
                  <Text style={[styles.filterCountText, active && styles.filterCountTextActive]}>
                    {chip.count}
                  </Text>
                </View>,
              ]}</Pressable>
            );
          })}
        </View>,
        error && notices.length > 0 ? (
          <Pressable key="error-banner" onPress={onRefresh} style={styles.errorBanner}>
            <Ionicons name="cloud-offline-outline" size={15} color={theme.colors.warning} />
            <Text style={styles.errorBannerText}>
              {t('announcements.offlineHint', 'Showing saved updates. Tap to refresh.')}
            </Text>
            <Ionicons name="refresh" size={15} color={theme.colors.warning} />
          </Pressable>
        ) : null,
        loading ? (
          <LogoLoader key="loader" size={60} color={theme.colors.primary} style={styles.loader} />
        ) : (
          <FlatList
            key="list"
            data={rows}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            contentContainerStyle={styles.listContainer}
            showsVerticalScrollIndicator={false}
            initialNumToRender={10}
            maxToRenderPerBatch={10}
            windowSize={5}
            removeClippedSubviews={Platform.OS === 'android'}
            ListEmptyComponent={emptyList}
            refreshControl={(
              <RefreshControl
                refreshing={Boolean(isRefreshing)}
                onRefresh={onRefresh}
                tintColor={theme.colors.primary}
                colors={[theme.colors.primary]}
              />
            )}
          />
        ),
      ]}</View>,
    ]}</ScreenLayout>
  );
}

export default function AnnouncementsScreen() {
  return <TourTarget id="screen.screen-announcements.overview" style={{ flex: 1 }}><TourTarget id="screen.screen-announcements.workspace" style={{ flex: 1 }}><ErrorBoundary><AnnouncementsScreenInner /></ErrorBoundary></TourTarget></TourTarget>;
}

const getStyles = (theme: SchoolTheme, isDark: boolean) => {
  const c = theme.colors;
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: 'transparent' },
    heroCard: {
      marginHorizontal: 16,
      marginTop: 14,
      marginBottom: 12,
      padding: 18,
      borderRadius: 24,
      overflow: 'hidden',
      width: '92%',
      maxWidth: 640,
      alignSelf: 'center',
      ...Platform.select({
        ios: {
          shadowColor: c.primaryDark,
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: isDark ? 0.18 : 0.24,
          shadowRadius: 20,
        },
        android: { elevation: 5 },
        web: {
          boxShadow: `0 16px 32px -18px ${schoolColorWithAlpha(c.primaryDark, 0.72)}`,
        } as object,
      }),
    },
    heroGlowOne: {
      position: 'absolute',
      width: 130,
      height: 130,
      borderRadius: 65,
      right: -38,
      top: -74,
      backgroundColor: 'rgba(255,255,255,0.14)',
    },
    heroGlowTwo: {
      position: 'absolute',
      width: 88,
      height: 88,
      borderRadius: 44,
      left: -44,
      bottom: -56,
      backgroundColor: 'rgba(255,255,255,0.08)',
    },
    heroTop: {
      flexDirection: 'row',
      alignItems: 'center',
      zIndex: 1,
    },
    heroIcon: {
      width: 46,
      height: 46,
      borderRadius: 15,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 12,
      backgroundColor: 'rgba(255,255,255,0.17)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.22)',
    },
    heroCopy: { flex: 1, minWidth: 0 },
    pageTitle: {
      fontSize: 18,
      fontWeight: '800',
      letterSpacing: -0.35,
      color: '#FFFFFF',
    },
    subtitle: {
      fontSize: 12.5,
      marginTop: 3,
      color: 'rgba(255,255,255,0.78)',
      fontWeight: '500',
    },
    heroStats: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 16,
      paddingTop: 13,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: 'rgba(255,255,255,0.24)',
      zIndex: 1,
    },
    heroStat: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      minWidth: 0,
    },
    heroStatIcon: {
      width: 24,
      height: 24,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 7,
      backgroundColor: 'rgba(255,255,255,0.14)',
    },
    heroStatText: {
      flexShrink: 1,
      fontSize: 11.5,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    heroStatDivider: {
      width: StyleSheet.hairlineWidth,
      height: 22,
      marginHorizontal: 12,
      backgroundColor: 'rgba(255,255,255,0.24)',
    },
    filterRow: {
      flexDirection: 'row',
      padding: 4,
      marginHorizontal: 16,
      marginBottom: 6,
      gap: 4,
      borderRadius: 16,
      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(15,23,42,0.045)',
      width: '92%',
      maxWidth: 640,
      alignSelf: 'center',
    },
    filterChip: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 42,
      paddingHorizontal: 10,
      borderRadius: 12,
      gap: 7,
    },
    filterChipActive: {
      backgroundColor: isDark ? schoolColorWithAlpha(c.primary, 0.35) : '#FFFFFF',
      ...Platform.select({
        ios: {
          shadowColor: '#0F172A',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: isDark ? 0 : 0.08,
          shadowRadius: 6,
        },
        android: { elevation: 1 },
        web: {
          boxShadow: isDark ? 'none' : '0 3px 9px rgba(15,23,42,0.08)',
        } as object,
      }),
    },
    filterChipPressed: { opacity: 0.82 },
    filterChipText: {
      fontSize: 13,
      fontWeight: '700',
      color: isDark ? '#CBD5E1' : '#475569',
    },
    filterChipTextActive: {
      color: isDark ? '#F8FAFC' : c.primaryDark,
    },
    filterCount: {
      minWidth: 23,
      height: 23,
      paddingHorizontal: 6,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.06)',
    },
    filterCountActive: {
      backgroundColor: isDark ? c.primary : c.primary,
    },
    filterCountText: {
      fontSize: 11,
      fontWeight: '800',
      color: isDark ? '#E2E8F0' : '#334155',
    },
    filterCountTextActive: { color: '#FFFFFF' },
    errorBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: 16,
      marginTop: 2,
      marginBottom: 4,
      paddingHorizontal: 12,
      minHeight: 38,
      borderRadius: 12,
      backgroundColor: isDark ? 'rgba(245,158,11,0.10)' : '#FFFBEB',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(245,158,11,0.18)' : '#FDE68A',
      width: '92%',
      maxWidth: 640,
      alignSelf: 'center',
    },
    errorBannerText: {
      flex: 1,
      marginHorizontal: 8,
      color: isDark ? '#FDE68A' : '#92400E',
      fontSize: 11.5,
      fontWeight: '600',
    },
    loader: { marginTop: 56, alignSelf: 'center' },
    listContainer: {
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: 48,
      flexGrow: 1,
      width: '100%',
      maxWidth: 640,
      alignSelf: 'center',
    },
    monthRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
      marginTop: 6,
      gap: 8,
    },
    monthIcon: {
      width: 26,
      height: 26,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: schoolColorWithAlpha(c.primary, isDark ? 0.18 : 0.09),
    },
    monthRule: {
      flex: 1,
      height: StyleSheet.hairlineWidth,
      backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.1)',
    },
    monthLabel: {
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      color: isDark ? '#94A3B8' : '#64748B',
    },
    timelineItem: { marginBottom: 12 },
    timelineItemLast: { marginBottom: 6 },
    leftCol: {
      width: 56,
      minHeight: 66,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 6,
      backgroundColor: schoolColorWithAlpha(c.primary, isDark ? 0.15 : 0.08),
      borderWidth: 1,
      borderColor: schoolColorWithAlpha(c.primary, isDark ? 0.22 : 0.11),
    },
    leftColImportant: {
      backgroundColor: isDark ? 'rgba(239,68,68,0.12)' : '#FFF1F2',
      borderColor: isDark ? 'rgba(248,113,113,0.24)' : '#FFE4E6',
    },
    dateFallbackText: { fontSize: 12, fontWeight: '700', color: c.textPrimary },
    dateRelative: {
      marginBottom: 1,
      fontSize: 8,
      lineHeight: 10,
      fontWeight: '800',
      textTransform: 'uppercase',
      color: isDark ? c.primaryLight : c.primary,
    },
    dateRelativeImportant: { color: c.danger },
    timeText: {
      fontSize: 10.5,
      color: c.textMuted,
      fontWeight: '700',
    },
    calendarPill: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    calendarMonth: {
      color: isDark ? c.primaryLight : c.primaryDark,
      fontSize: 9,
      lineHeight: 11,
      fontWeight: '900',
      letterSpacing: 0.8,
    },
    calendarMonthImportant: { color: c.danger },
    calendarDay: {
      fontSize: 23,
      lineHeight: 25,
      fontWeight: '900',
      color: c.textStrong,
      letterSpacing: -0.8,
    },
    calendarDayImportant: { color: c.danger },
    calendarYear: {
      fontSize: 8,
      lineHeight: 10,
      fontWeight: '700',
      color: c.textMuted,
    },
    card: {
      borderRadius: 20,
      padding: 16,
      paddingLeft: 18,
      borderWidth: 1,
      position: 'relative',
      overflow: 'hidden',
      ...Platform.select({
        ios: {
          shadowColor: '#334155',
          shadowOffset: { width: 0, height: 7 },
          shadowOpacity: isDark ? 0 : 0.09,
          shadowRadius: 15,
        },
        android: { elevation: 3 },
        web: {
          boxShadow: isDark ? 'none' : '0 12px 28px -18px rgba(15,23,42,0.34)',
        } as object,
      }),
    },
    importantRail: {
      position: 'absolute',
      left: 0,
      top: 18,
      bottom: 18,
      width: 4,
      borderTopRightRadius: 4,
      borderBottomRightRadius: 4,
      backgroundColor: c.danger,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
      zIndex: 1,
    },
    cardHeading: {
      flex: 1,
      minWidth: 0,
      alignSelf: 'stretch',
      justifyContent: 'center',
      marginLeft: 12,
      marginRight: 5,
    },
    cardTitle: {
      fontSize: 16,
      fontWeight: '800',
      letterSpacing: -0.2,
      lineHeight: 22,
    },
    badge: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: 7,
      borderWidth: 1,
      marginBottom: 4,
      backgroundColor: isDark ? 'rgba(239,68,68,0.14)' : '#FFF1F2',
      borderColor: 'rgba(239, 68, 68, 0.22)',
      zIndex: 1,
    },
    badgeText: {
      fontSize: 9.5,
      fontWeight: '800',
      color: '#EF4444',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    message: { fontSize: 14, lineHeight: 21.5, zIndex: 1, fontWeight: '500' },
    cardFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 12,
      paddingTop: 11,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)',
      zIndex: 1,
      gap: 8,
    },
    footerSpacer: { flex: 1 },
    authorWrap: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
    },
    authorIcon: {
      width: 22,
      height: 22,
      borderRadius: 7,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 6,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.045)',
    },
    authorText: {
      flex: 1,
      fontSize: 11.5,
      fontWeight: '600',
      color: c.textMuted,
    },
    readMoreWrap: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    readMore: { fontSize: 12, fontWeight: '800' },
    timeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-end',
      marginTop: 8,
      gap: 4,
      zIndex: 1,
    },
    bgIcon: {
      position: 'absolute',
      right: 6,
      bottom: 8,
      transform: [{ scale: 2.5 }],
      opacity: isDark ? 0.055 : 0.045,
    },
    emptyWrap: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: 56,
      paddingHorizontal: 28,
    },
    emptyIconWell: {
      width: 64,
      height: 64,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
      backgroundColor: schoolColorWithAlpha(c.primary, isDark ? 0.16 : 0.1),
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: c.textStrong,
      textAlign: 'center',
      letterSpacing: -0.3,
    },
    emptySubtitle: {
      marginTop: 6,
      fontSize: 14,
      lineHeight: 20,
      color: c.textSecondary,
      textAlign: 'center',
    },
    retryBtn: {
      marginTop: 16,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 14,
      backgroundColor: c.primary,
    },
    retryText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
  });
};
