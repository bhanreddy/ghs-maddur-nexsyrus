// OPT: Student notices — useStudentQuery for GET /notices + memoized row renderer (replaces useEffect + NoticeService direct fetch pattern).
import React, { useMemo, useCallback, memo } from 'react'; // OPT: Data from hook; memo/useCallback for list perf.
import { View, Text, StyleSheet, FlatList, Platform, Pressable } from 'react-native'; // OPT: Layout + list.
import { Ionicons } from '@expo/vector-icons'; // OPT: Icons.
import { useTranslation } from 'react-i18next'; // OPT: i18n.
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import ScreenLayout from '../../src/components/ScreenLayout'; // OPT: Page shell.
import StaffHeader from '../../src/components/StaffHeader'; // OPT: Header.
import type { Notice } from '../../src/services/commonServices'; // OPT: Row typing only — data comes from useStudentQuery('/notices').
import { useTheme } from '../../src/hooks/useTheme'; // OPT: Theme.
import type { SchoolTheme } from '../../src/theme/types'; // OPT: Align getStyles with useTheme() context shape.
import { t_field } from '../../src/utils/lang'; // OPT: Bilingual fields.
import LogoLoader from '../../src/components/LogoLoader'; // OPT: Loader.
import { useApiQuery } from '../../src/hooks/useApiQuery'; // OPT: Cached GET layer.
import { useAuth } from '../../src/hooks/useAuth'; // OPT: userId for cache partition keying in useApiQuery.
import { ErrorBoundary } from '../../src/components/ErrorBoundary'; // OPT: Same boundary as Screen/_layout export target.

interface UINotice { // OPT: FlatList row model (UI-only shape).
  id: string; // OPT:
  title: string; // OPT:
  title_te?: string; // OPT:
  message: string; // OPT:
  message_te?: string; // OPT:
  date: string; // OPT:
  time: string; // OPT:
  important: boolean; // OPT:
  icon: string; // OPT:
  color: string; // OPT:
}

/** Newest publish/created time first so the latest alert stays at the top regardless of pin. */
const noticeSortKeyMs = (n: Notice): number =>
  new Date(n.published_at || n.publish_at || n.created_at).getTime();

const sortNoticesNewestFirst = (data: Notice[]): Notice[] =>
  [...data].sort((a, b) => noticeSortKeyMs(b) - noticeSortKeyMs(a));

const mapNoticesToUi = (data: Notice[]): UINotice[] => // OPT: Pure mapper extracted for useMemo.
  data.map((n: Notice) => ({
    id: n.id, // OPT:
    title: n.title, // OPT:
    title_te: n.title_te, // OPT:
    message: n.content, // OPT:
    message_te: n.content_te, // OPT:
    date: (n.published_at || n.created_at).split('T')[0], // OPT:
    time: 'All Day', // OPT:
    important: n.is_pinned, // OPT:
    icon: 'notifications-outline', // OPT:
    color: '#3b82f6', // OPT:
  })); // OPT:

/* ─── Premium Calendar Date Pill ─── */
const DateCol = ({ item, styles }: { item: UINotice; styles: ReturnType<typeof getStyles> }) => {
  const parts = useMemo(() => {
    if (!item.date) return null;
    const p = item.date.split('-');
    if (p.length < 3) return null;
    const year = p[0];
    const monthNum = parseInt(p[1], 10);
    const day = parseInt(p[2], 10);
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const month = months[monthNum - 1] || 'DAT';
    return { day, month, year };
  }, [item.date]);

  if (!parts) {
    return (
      <View style={styles.leftCol}>
        <Text style={styles.dateFallbackText}>{item.date}</Text>
        <Text style={styles.timeText}>{item.time}</Text>
      </View>
    );
  }

  return (
    <View style={styles.leftCol}>
      <View style={[styles.calendarPill, item.important && styles.calendarPillImportant]}>
        <Text style={[styles.calendarMonth, item.important && styles.calendarMonthImportant]}>{parts.month}</Text>
        <Text style={[styles.calendarDay, item.important && styles.calendarDayImportant]}>{parts.day}</Text>
        <Text style={styles.calendarYear}>{parts.year}</Text>
      </View>
      <Text style={styles.timeText}>{item.time}</Text>
    </View>
  );
};

const NoticeTimelineRow = memo(function NoticeTimelineRow({ // OPT: Pure timeline row — memoized.
  item, // OPT: One UI notice.
  index,
  styles, // OPT: Themed styles.
  onMessagePress, // OPT: Parent useCallback for Text onPress.
}: {
  item: UINotice; // OPT:
  index: number;
  styles: ReturnType<typeof getStyles>; // OPT:
  onMessagePress: () => void; // OPT: Stable handler from useCallback.
}) {
  const { t } = useTranslation(); // OPT: Subscribe so t_field + labels update on language change.
  const { isDark, theme } = useTheme();

  const accentColor = item.important ? '#EF4444' : theme.colors.primary;
  // Use Slate 50 (light) and deeper red for card backgrounds to let pure white gradient highlights shine
  const cardBg = item.important
    ? (isDark ? 'rgba(239, 68, 68, 0.08)' : '#FEF2F2')
    : (isDark ? 'rgba(255, 255, 255, 0.05)' : '#F1F5F9');
  const cardBorder = item.important
    ? (isDark ? 'rgba(239, 68, 68, 0.22)' : 'rgba(239, 68, 68, 0.16)')
    : (isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.08)');

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 50).springify().damping(16).stiffness(125)}
      style={styles.timelineItem}
    >
      {/* 1. Stacked Calendar Date Column */}
      <DateCol item={item} styles={styles} />

      {/* 2. Sleek Timeline Dot & Line Trace */}
      <View style={styles.timelineConnector}>
        <View style={styles.verticalLine} />
        <View style={[styles.dotContainer, { borderColor: isDark ? '#1E293B' : '#FFFFFF', backgroundColor: isDark ? '#334155' : '#E2E8F0' }]}>
          <View style={[styles.dot, { backgroundColor: accentColor }]} />
        </View>
      </View>

      {/* 3. Claymorphic Card Column */}
      <View style={[
        styles.card,
        {
          backgroundColor: cardBg,
          borderColor: cardBorder,
          borderBottomWidth: isDark ? 1.5 : 4,
          borderBottomColor: item.important
            ? 'rgba(239, 68, 68, 0.3)'
            : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.12)'),
        }
      ]}>
        {/* Soft top-left highlight linear gradient */}
        <LinearGradient
          colors={isDark
            ? ['rgba(255,255,255,0.08)', 'rgba(255,255,255,0)']
            : ['rgba(255,255,255,1)', 'rgba(255,255,255,0)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.5, y: 0.8 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        <View style={styles.cardHeader}>
          <Text style={[styles.cardTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]} numberOfLines={1}>
            {t_field(item.title, item.title_te)}
          </Text>
          {item.important && (
            <View style={[styles.badge, { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.12)' : '#FFF1F2', borderColor: 'rgba(239, 68, 68, 0.2)' }]}>
              <Text style={styles.badgeText}>{t('announcements.important', 'Important')}</Text>
            </View>
          )}
        </View>

        <Text style={[styles.message, { color: isDark ? '#CBD5E1' : '#475569' }]} onPress={onMessagePress}>
          {t_field(item.message, item.message_te)}
        </Text>

        {/* Ambient background decoration icon */}
        <Ionicons
          name={item.icon as 'notifications-outline'}
          size={24}
          color={accentColor + (isDark ? '0A' : '12')}
          style={styles.bgIcon}
        />
      </View>
    </Animated.View>
  ); // OPT: memoized row subtree
});

function AnnouncementsScreenInner() { // OPT: Wrapped by ErrorBoundary in default export.
  const { theme, isDark } = useTheme(); // OPT: Theme.
  const styles = React.useMemo(() => getStyles(theme, isDark), [theme, isDark]); // OPT: Stylesheet memo.
  const { t } = useTranslation(); // OPT: i18n.
  const { user } = useAuth(); // OPT: userId for hook partition in useApiQuery.

  const { data: noticePayload, loading } = useApiQuery<Notice[]>( // OPT: Network-first notices list with TTL.
    '/notices', // OPT: Backend notices collection route.
    'notices:staff', // OPT: Cache bucket for this screen.
    2 * 60 * 1000, // OPT: 2m TTL — aligns with “semi-static” school comms.
    user?.userId, // OPT: Per-login cache partition.
    { enabled: true }
  );

  const notices = useMemo(
    () => mapNoticesToUi(sortNoticesNewestFirst(noticePayload ?? [])),
    [noticePayload]
  ); // OPT: Derive UI rows — sorted so latest is always first (matches API + resilient to cache order).

  const noopMessagePress = useCallback(() => { }, []); // OPT: Stable press handler until navigation is wired.

  const renderItem = useCallback( // OPT: Stable FlatList renderItem.
    ({ item, index }: { item: UINotice; index: number }) => (
      <NoticeTimelineRow item={item} index={index} styles={styles} onMessagePress={noopMessagePress} />
    ), // OPT: Delegate to memo row.
    [styles, noopMessagePress] // OPT: Recreate when styles or handlers change.
  );

  const keyExtractor = useCallback((item: UINotice) => item.id, []); // OPT: Stable key extractor.

  const listProps = useMemo( // OPT: FlatList perf tuning object stable across renders.
    () => ({
      initialNumToRender: 10, // OPT:
      maxToRenderPerBatch: 10, // OPT:
      windowSize: 5, // OPT:
      removeClippedSubviews: true as const, // OPT:
    }),
    [] // OPT: Static tuning.
  );

  const emptyList = useCallback( // OPT: Stable empty component.
    () => <Text style={{ textAlign: 'center', marginTop: 40, color: '#94A3B8', fontWeight: '600' }}>No announcements.</Text>, // OPT:
    [] // OPT:
  );

  return ( // OPT: Screen chrome + conditional list vs loader. Avoid whitespace-only text nodes between View siblings (RN requires Text for raw strings).
    <ScreenLayout>
      <StaffHeader
        showBackButton={true}
        title={t('announcements.title', 'Announcements')}
      />
      <View style={styles.container}>
        {/* Header Introduction Block */}
        <View style={styles.headerSection}>
          <View style={[styles.iconBox, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#EEF2FF', borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(99,102,241,0.08)' }]}>
            <Ionicons name="megaphone" size={20} color={isDark ? '#A5B4FC' : '#4F46E5'} />
          </View>
          <View>
            <Text style={[styles.pageTitle, { color: isDark ? '#F8FAFC' : '#1E293B' }]}>
              {t('announcements.title', 'Notice Board')}
            </Text>
            <Text style={[styles.subtitle, { color: isDark ? '#94A3B8' : '#64748B' }]}>
              {t('announcements.subtitle', 'Latest updates and events')}
            </Text>
          </View>
        </View>

        {loading ? ( // OPT: First paint while hook resolves cache/network.
          <LogoLoader size={60} color={theme.colors.primary} style={{ marginTop: 50 }} />
        ) : (
          <FlatList
            data={notices}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            contentContainerStyle={styles.listContainer}
            showsVerticalScrollIndicator={false}
            {...listProps}
            ListEmptyComponent={emptyList}
          />
        )}
      </View>
    </ScreenLayout>
  ); // OPT:
}

export default function AnnouncementsScreen() { // OPT: Root export wraps inner content with ErrorBoundary.
  return ( // OPT:
    <ErrorBoundary> {/* OPT: Same boundary pattern as Screen/_layout */}
      <AnnouncementsScreenInner /> {/* OPT: */}
    </ErrorBoundary>
  ); // OPT: boundary-wrapped export default
}

const getStyles = (theme: SchoolTheme, isDark: boolean) => {
  const c = theme.colors;
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: 'transparent' },
    headerSection: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 18,
      backgroundColor: isDark ? 'transparent' : '#FFFFFF',
      borderBottomWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.06)' : c.borderLight,
    },
    iconBox: {
      width: 42,
      height: 42,
      borderRadius: 12,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 14,
      borderWidth: 1,
    },
    pageTitle: { fontSize: 18, fontWeight: '800', letterSpacing: -0.2 },
    subtitle: { fontSize: 12.5, marginTop: 2 },
    listContainer: { padding: 20, paddingBottom: 40 },
    timelineItem: { flexDirection: 'row', marginBottom: 28 },

    /* ── Stacked Calendar date layout ── */
    leftCol: { width: 62, alignItems: 'center' },
    dateFallbackText: { fontSize: 12, fontWeight: '700', color: c.textPrimary },
    timeText: { fontSize: 9.5, color: c.textMuted, marginTop: 6, fontWeight: '600' },

    calendarPill: {
      width: 62,
      borderRadius: 16,
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#FFFFFF',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.06)',
      alignItems: 'center',
      overflow: 'hidden',
      paddingBottom: 6,
      shadowColor: '#6B7A99',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0 : 0.08,
      shadowRadius: 12,
      elevation: 3,
    },
    calendarPillImportant: {
      backgroundColor: isDark ? 'rgba(239,68,68,0.08)' : '#FFF1F2',
      borderColor: isDark ? 'rgba(239,68,68,0.2)' : 'rgba(239,68,68,0.12)',
    },
    calendarMonth: {
      width: '100%',
      backgroundColor: theme.colors.primary,
      color: '#FFFFFF',
      fontSize: 9.5,
      fontWeight: '800',
      textAlign: 'center',
      paddingVertical: 4,
      letterSpacing: 0.5,
    },
    calendarMonthImportant: {
      backgroundColor: '#EF4444',
    },
    calendarDay: {
      fontSize: 22,
      fontWeight: '800',
      color: c.textStrong,
      marginTop: 2,
      letterSpacing: -0.5,
    },
    calendarDayImportant: {
      color: '#EF4444',
    },
    calendarYear: {
      fontSize: 9,
      fontWeight: '700',
      color: c.textMuted,
      marginTop: 1,
    },

    /* ── Timeline Connector & Trace Line ── */
    timelineConnector: { width: 20, alignItems: 'center', position: 'relative', marginHorizontal: 14 },
    verticalLine: { position: 'absolute', top: 12, bottom: -46, width: 3, backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)' },
    dotContainer: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 4,
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 2,
      marginTop: 14,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },

    /* ── Claymorphic Cards ── */
    card: {
      flex: 1,
      borderRadius: 24,
      padding: 18,
      borderWidth: 1.2,
      position: 'relative',
      overflow: 'hidden',
      shadowColor: '#6B7A99',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: isDark ? 0 : 0.08,
      shadowRadius: 16,
      elevation: 4,
    },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
    cardTitle: { fontSize: 16.5, fontWeight: '800', flex: 1, marginRight: 8, letterSpacing: 0.1 },
    badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, borderWidth: 1, backgroundColor: isDark ? 'rgba(239,68,68,0.1)' : 'rgba(239,68,68,0.06)' },
    badgeText: { fontSize: 9.5, fontWeight: '800', color: '#EF4444', textTransform: 'uppercase', letterSpacing: 0.5 },
    message: { fontSize: 14.5, lineHeight: 22 },
    bgIcon: { position: 'absolute', right: -6, bottom: -6, transform: [{ scale: 2.5 }], opacity: 0.1 },
  });
};
