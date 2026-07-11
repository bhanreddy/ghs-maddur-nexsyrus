// OPT: Student complaints — profile id gates useStudentQuery('/complaints') (replaces useEffect + ComplaintService.getStudentComplaints).
import React, { useState, useEffect, useRef, useMemo, memo, useCallback } from 'react'; // OPT: memo/useCallback for subtree stability; useEffect retained only for FadeSlide animation.
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Animated,
  Easing,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import ScreenLayout from '../../src/components/ScreenLayout';
import StudentHeader from '../../src/components/StudentHeader';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../src/hooks/useAuth'; // OPT: Auth user id for cache partition + hook enablement.
import { useStudentQuery } from '../../src/hooks/useStudentQuery'; // OPT: TTL GET cache for profile + complaints list.
import type { Student, Complaint } from '../../src/types/models'; // OPT: API row typing (raised_for_student_id uses profile.id).
import { useTheme } from '../../src/hooks/useTheme'; // OPT: Theme tokens.
import { Theme } from '../../src/theme/themes';
import { t_field } from '../../src/utils/lang';
import LogoLoader from '../../src/components/LogoLoader'; // OPT: Loading affordance.
import { ErrorBoundary } from '../../src/components/ErrorBoundary'; // OPT: Same boundary export target as Screen/_layout.

// ─── Severity (semantic; paired with theme in UI) ─────────────────────────────
const SEVERITY_ICON: Record<string, string> = {
  High: 'alert-circle',
  Medium: 'warning',
  Low: 'information-circle',
};

// ─── Interfaces ───────────────────────────────────────────────────────────────
interface UIComplaint {
  id: string;
  title: string;
  title_te?: string;
  description: string;
  description_te?: string;
  type: string;
  severity: string;
  filedBy: string;
  date: string;
  status: string;
  icon: string;
  ticketId?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const getDescriptionFromComplaint = (c: any) =>
  c.description ?? c.details ?? c.remark ?? c.complaint_text ?? c.body ?? c.note ?? null;

const getStatusLabel = (status?: string) => {
  if (!status) return 'Open';
  return status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ');
};

const getDisplayDescription = (description?: string, descriptionTe?: string) => {
  const localized = t_field(description || '', descriptionTe || '');
  return localized && localized.trim().length > 0 ? localized : 'No description provided.';
};

function severityColor(severity: string, theme: Theme): string {
  if (severity === 'High') return theme.colors.danger;
  if (severity === 'Medium') return theme.colors.warning;
  return theme.colors.info;
}

function severitySoftBg(severity: string, isDark: boolean): string {
  if (severity === 'High') return isDark ? 'rgba(248,113,113,0.14)' : 'rgba(239,68,68,0.1)';
  if (severity === 'Medium') return isDark ? 'rgba(251,191,36,0.12)' : 'rgba(245,158,11,0.12)';
  return isDark ? 'rgba(96,165,250,0.14)' : 'rgba(59,130,246,0.1)';
}

// ─── Animated Entrance ────────────────────────────────────────────────────────
const FadeSlide = ({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) => {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 600,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 600,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      {children}
    </Animated.View>
  );
};

// ─── Main Screen ──────────────────────────────────────────────────────────────
function ComplaintsScreenInner() { // OPT: Wrapped by ErrorBoundary at default export.
  const { t } = useTranslation(); // OPT: i18n.
  const { user } = useAuth(); // OPT: Login gate + userKey for useStudentQuery.
  const { theme, isDark } = useTheme(); // OPT: Palette + dark flag.
  const styles = useMemo(() => getStyles(theme, isDark), [theme, isDark]); // OPT: Themed stylesheet.

  const { data: profile, loading: profileLoading } = useStudentQuery<Student>( // OPT: Resolve canonical student id for complaint filter param.
    '/students/profile/me', // OPT: Profile endpoint.
    'profile:me', // OPT: Shared cache bucket with other student tabs.
    5 * 60 * 1000, // OPT: 5m TTL — profile rarely changes mid-session.
    user?.userId, // OPT: Per-login cache partition.
    { enabled: !!user?.userId } // OPT: Skip until auth user id exists.
  );

  const complaintsQuery = useMemo( // OPT: Stable query object identity for useStudentQuery fetcher deps.
    () => (profile?.id ? { raised_for_student_id: profile.id } : undefined), // OPT: Server expects student UUID, not auth subject string.
    [profile?.id] // OPT: Rebuild when profile id arrives.
  );

  const { data: complaintsPayload, loading: complaintsLoading } = useStudentQuery<Complaint[]>( // OPT: Same GET shape as ComplaintService.getStudentComplaints.
    '/complaints', // OPT: Complaints collection route.
    'complaints:raised-for-me', // OPT: Screen-local cache suffix.
    2 * 60 * 1000, // OPT: 2m TTL — behaviour records update occasionally.
    user?.userId, // OPT: Partition by login for multi-account devices.
    { enabled: !!user?.userId && !!profile?.id, query: complaintsQuery } // OPT: Dependent query after profile id is known.
  );

  const loading = profileLoading || complaintsLoading; // OPT: Single spinner gate for both GETs.

  const [activeFilter, setActiveFilter] = useState('All'); // OPT: Local UI filter only (no network).
  const filters = ['All', 'High', 'Medium', 'Low']; // OPT: Static severity chips.

  const complaints = useMemo( // OPT: Map API complaints → UI rows (replaces inline loader mapping).
    () =>
      (complaintsPayload ?? []).map((c) => {
        const severity =
          c.priority === 'urgent' || c.priority === 'high'
            ? 'High'
            : c.priority === 'medium'
              ? 'Medium'
              : 'Low';
        const description = getDescriptionFromComplaint(c as any);
        return {
          id: c.id,
          title: c.title || 'Behavior Report',
          title_te: c.title_te,
          description: description ?? '',
          description_te: c.description_te,
          type: c.category?.toUpperCase() || 'OTHER',
          severity,
          filedBy: c.raised_by_name || 'Staff Member',
          date: c.created_at ? new Date(c.created_at).toLocaleDateString() : 'Recent',
          status: getStatusLabel(c.status),
          icon: SEVERITY_ICON[severity] || 'information-circle',
          ticketId: c.ticket_no || c.id?.slice(0, 8).toUpperCase(),
        };
      }),
    [complaintsPayload]
  );

  const handleFilterSelect = useCallback((key: string) => {
    setActiveFilter(key); // OPT: Centralized chip handler keeps child props stable.
  }, []);

  const headerGrad = isDark
    ? ([theme.colors.card, theme.colors.background] as const)
    : ([theme.colors.card, theme.colors.background] as const);
  const heroRingGrad = isDark
    ? ([theme.colors.primaryDark, theme.colors.primary, theme.colors.primaryLight, theme.colors.primaryDark] as const)
    : ([theme.colors.primaryDark, theme.colors.primary, '#818CF8', theme.colors.primaryDark] as const);
  const badgeGrad = isDark
    ? ([theme.colors.primaryLight, theme.colors.primary] as const)
    : ([theme.colors.primary, theme.colors.primaryDark] as const);
  const heroTopShine = isDark
    ? ([`${theme.colors.primary}55`, `${theme.colors.primary}18`, 'transparent'] as const)
    : ([`${theme.colors.primary}35`, `${theme.colors.primary}12`, 'transparent'] as const);

  const criticalCount = complaints.filter((c) => c.severity === 'High').length; // OPT: Hero stat — derived from hook data.
  const warningCount = complaints.filter((c) => c.severity === 'Medium').length; // OPT: Hero stat — derived from hook data.

  const filteredComplaints = useMemo( // OPT: Memoized filter pass avoids re-walking on unrelated renders.
    () => complaints.filter((c) => (activeFilter === 'All' ? true : c.severity === activeFilter)),
    [complaints, activeFilter]
  );

  return (
    <ScreenLayout style={{ backgroundColor: theme.colors.background }}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <LinearGradient colors={[...headerGrad]} style={styles.headerGradient}>
        <StudentHeader
          showBackButton
          title={t('home.regular_complaints') || 'Complaints'}
          style={styles.headerOverride}
          titleStyle={styles.headerTitle}
        />
      </LinearGradient>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.container}>
        <FadeSlide delay={0}>
          <View style={styles.heroWrapper}>
            <LinearGradient
              colors={[...heroRingGrad]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.heroOuterRing}
            >
              <View style={[styles.heroInner, { backgroundColor: theme.colors.card }]}>
                <LinearGradient
                  colors={[...heroTopShine]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.heroTopShine}
                />

                <View style={styles.heroHeader}>
                  <View style={styles.heroTitleBlock}>
                    <View style={styles.heroPill}>
                      <View style={[styles.heroPillDot, { backgroundColor: theme.colors.primary }]} />
                      <Text style={styles.heroPillText}>ACADEMIC YEAR</Text>
                    </View>
                    <Text style={styles.heroTitle}>Behaviour overview</Text>
                    <Text style={styles.heroSubtitle}>At-a-glance counts from your behaviour reports</Text>
                  </View>
                  <View style={styles.heroBadge}>
                    <LinearGradient colors={[...badgeGrad]} style={styles.heroBadgeGrad}>
                      <Ionicons name="shield-checkmark" size={17} color={isDark ? '#0B0F19' : '#FFFFFF'} />
                      <Text style={[styles.heroBadgeText, { color: isDark ? '#0B0F19' : '#FFFFFF' }]}>LIVE</Text>
                    </LinearGradient>
                  </View>
                </View>

                <View style={styles.statsRow}>
                  <PremiumStat
                    label="Total"
                    value={complaints.length}
                    icon="layers-outline"
                    accentColor={theme.colors.primary}
                    theme={theme}
                    styles={styles}
                  />
                  <PremiumStat
                    label="Critical"
                    value={criticalCount}
                    icon="alert-circle-outline"
                    accentColor={theme.colors.danger}
                    neutralWhenZero
                    theme={theme}
                    styles={styles}
                  />
                  <PremiumStat
                    label="Warnings"
                    value={warningCount}
                    icon="warning-outline"
                    accentColor={theme.colors.warning}
                    neutralWhenZero
                    theme={theme}
                    styles={styles}
                  />
                </View>
              </View>
            </LinearGradient>
          </View>
        </FadeSlide>

        <FadeSlide delay={150}>
          <View style={styles.filterSection}>
            <Text style={styles.filterLabel}>
              <Text style={styles.filterLabelAccent}>//</Text> FILTER BY SEVERITY
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {filters.map((f) => (
                <FilterChip
                  key={f}
                  filterKey={f}
                  label={f}
                  active={activeFilter === f}
                  onSelect={handleFilterSelect}
                  theme={theme}
                  isDark={isDark}
                  styles={styles}
                />
              ))}
            </ScrollView>
          </View>
        </FadeSlide>

        <FadeSlide delay={220}>
          <View style={styles.sectionLabel}>
            <Text style={styles.sectionLabelText}>RECENT RECORDS</Text>
            <View style={styles.sectionLine} />
          </View>
        </FadeSlide>

        {loading ? (
          <View style={styles.loaderWrap}>
            <LogoLoader color={theme.colors.primary} />
          </View>
        ) : filteredComplaints.length === 0 ? (
          <FadeSlide delay={300}>
            <View style={styles.emptyState}>
              <LinearGradient
                colors={
                  isDark
                    ? ['rgba(52,211,153,0.14)', 'rgba(52,211,153,0.05)']
                    : ['rgba(16,185,129,0.14)', 'rgba(16,185,129,0.06)']
                }
                style={styles.emptyGlow}
              >
                <Ionicons name="checkmark-circle" size={52} color={theme.colors.success} />
              </LinearGradient>
              <Text style={styles.emptyTitle}>Clean Record</Text>
              <Text style={styles.emptySubtitle}>No complaints found. Keep it up!</Text>
            </View>
          </FadeSlide>
        ) : (
          filteredComplaints.map((item, index) => (
            <FadeSlide key={item.id} delay={280 + index * 90}>
              <ComplaintCard item={item} theme={theme} isDark={isDark} styles={styles} />
            </FadeSlide>
          ))
        )}

        <View style={{ height: 48 }} />
      </ScrollView>
    </ScreenLayout>
  );
}

export default function ComplaintsScreen() { // OPT: Per-screen ErrorBoundary matches requested isolation pattern.
  return (
    <ErrorBoundary>
      <ComplaintsScreenInner />
    </ErrorBoundary>
  );
}

// ─── Premium Stat ─────────────────────────────────────────────────────────────
const PremiumStat = memo(function PremiumStat({
  label,
  value,
  icon,
  accentColor,
  neutralWhenZero,
  theme,
  styles,
}: {
  label: string;
  value: number;
  icon: keyof typeof Ionicons.glyphMap;
  accentColor: string;
  neutralWhenZero?: boolean;
  theme: Theme;
  styles: ReturnType<typeof getStyles>;
}) {
  const muted = Boolean(neutralWhenZero && value === 0);
  const valueColor = muted ? theme.colors.textSecondary : accentColor;
  const labelColor = muted ? theme.colors.textTertiary : theme.colors.textSecondary;
  const iconBg = muted ? `${theme.colors.textTertiary}14` : `${accentColor}24`;
  const displayIcon = muted && neutralWhenZero ? 'checkmark-done-outline' : icon;

  return (
    <View
      style={[styles.statTile, muted && styles.statTileMuted]}
      accessibilityLabel={`${label}: ${value}${muted ? ', none' : ''}`}
    >
      <View style={[styles.statIconWrap, { backgroundColor: iconBg }]}>
        <Ionicons name={displayIcon} size={19} color={valueColor} />
      </View>
      <Text style={[styles.statValue, { color: valueColor }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: labelColor }]}>{label}</Text>
      {muted && neutralWhenZero ? (
        <Text style={styles.statHint}>None</Text>
      ) : null}
    </View>
  );
});

// ─── Filter Chip ──────────────────────────────────────────────────────────────
const FilterChip = memo(function FilterChip({
  filterKey,
  label,
  active,
  onSelect,
  theme,
  isDark,
  styles,
}: {
  filterKey: string;
  label: string;
  active: boolean;
  onSelect: (key: string) => void;
  theme: Theme;
  isDark: boolean;
  styles: ReturnType<typeof getStyles>;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePress = useCallback(() => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.93, duration: 80, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();
    onSelect(filterKey);
  }, [filterKey, onSelect, scale]);

  const chipColor =
    label === 'High'
      ? theme.colors.danger
      : label === 'Medium'
        ? theme.colors.warning
        : label === 'Low'
          ? theme.colors.info
          : theme.colors.primary;

  const activeLabelColor =
    label === 'All'
      ? isDark
        ? '#0B0F19'
        : '#FFFFFF'
      : '#FFFFFF';

  return (
    <Pressable onPress={handlePress}>
      <Animated.View style={{ transform: [{ scale }] }}>
        {active ? (
          <LinearGradient
            colors={
              label === 'All'
                ? [theme.colors.primaryDark, theme.colors.primary]
                : [`${chipColor}E6`, `${chipColor}AA`]
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.chipActive}
          >
            <Text style={[styles.chipTextActive, { color: activeLabelColor }]}>{label}</Text>
          </LinearGradient>
        ) : (
          <View style={styles.chip}>
            <Text style={styles.chipText}>{label}</Text>
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
});

// ─── Complaint Card ───────────────────────────────────────────────────────────
const ComplaintCard = memo(function ComplaintCard({
  item,
  theme,
  isDark,
  styles,
}: {
  item: UIComplaint;
  theme: Theme;
  isDark: boolean;
  styles: ReturnType<typeof getStyles>;
}) {
  useTranslation(); // Subscribe so t_field / getDisplayDescription reflect language changes.
  const pressed = useRef(new Animated.Value(1)).current;
  const sevColor = severityColor(item.severity, theme);
  const softColor = severitySoftBg(item.severity, isDark);

  const onPressIn = useCallback(
    () => Animated.spring(pressed, { toValue: 0.975, useNativeDriver: true }).start(),
    [pressed]
  );
  const onPressOut = useCallback(
    () => Animated.spring(pressed, { toValue: 1, useNativeDriver: true }).start(),
    [pressed]
  );

  return (
    <Animated.View style={[styles.cardShell, { transform: [{ scale: pressed }] }]}>
      <Pressable onPressIn={onPressIn} onPressOut={onPressOut} style={styles.card}>
        <LinearGradient colors={[sevColor, `${sevColor}55`]} style={styles.accentStripe} />

        <View style={styles.cardInner}>
          <View style={styles.cardTop}>
            <View style={styles.ticketRow}>
              <View style={[styles.typeChip, { backgroundColor: softColor }]}>
                <Text style={[styles.typeChipText, { color: sevColor }]}>{item.type}</Text>
              </View>
              {item.ticketId && (
                <Text style={styles.ticketId}>#{item.ticketId?.slice(0, 12)}</Text>
              )}
            </View>
            <View
              style={[
                styles.severityBadge,
                { backgroundColor: softColor, borderColor: `${sevColor}55` },
              ]}
            >
              <Ionicons name={item.icon as keyof typeof Ionicons.glyphMap} size={13} color={sevColor} />
              <Text style={[styles.severityText, { color: sevColor }]}>{item.severity}</Text>
            </View>
          </View>

          <Text style={styles.cardTitle} numberOfLines={2}>
            {t_field(item.title, item.title_te)}
          </Text>

          <Text style={styles.cardDesc} numberOfLines={2} ellipsizeMode="tail">
            {getDisplayDescription(item.description, item.description_te)}
          </Text>

          <View style={styles.cardDivider} />

          <View style={styles.cardFooter}>
            <View style={styles.footerLeft}>
              <View
                style={[
                  styles.avatarDot,
                  {
                    backgroundColor: isDark ? 'rgba(129,140,248,0.18)' : 'rgba(79,70,229,0.12)',
                    borderColor: isDark ? 'rgba(129,140,248,0.35)' : 'rgba(79,70,229,0.25)',
                  },
                ]}
              >
                <Text style={[styles.avatarInitial, { color: theme.colors.primary }]}>{item.filedBy.charAt(0).toUpperCase()}</Text>
              </View>
              <View>
                <Text style={styles.footerByLine}>Reported by</Text>
                <Text style={styles.footerName}>{item.filedBy}</Text>
              </View>
            </View>

            <View style={styles.footerRight}>
              <View style={styles.footerMeta}>
                <Ionicons name="calendar-outline" size={12} color={theme.colors.textTertiary} />
                <Text style={styles.footerDate}>{item.date}</Text>
              </View>
              <View style={[styles.statusPill, { borderColor: `${sevColor}55` }]}>
                <View style={[styles.statusDot, { backgroundColor: sevColor }]} />
                <Text style={[styles.statusText, { color: sevColor }]}>{item.status}</Text>
              </View>
            </View>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
});

// ─── Styles ───────────────────────────────────────────────────────────────────
function getStyles(theme: Theme, isDark: boolean) {
  const shadowCard = isDark
    ? { shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 10 }
    : { shadowColor: theme.colors.textStrong, shadowOpacity: 0.06, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 6 };

  const heroShadow = isDark
    ? {
      shadowColor: theme.colors.primary,
      shadowOffset: { width: 0, height: 16 },
      shadowOpacity: 0.22,
      shadowRadius: 28,
      elevation: 14,
    }
    : {
      shadowColor: theme.colors.primaryDark,
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.12,
      shadowRadius: 24,
      elevation: 8,
    };

  return StyleSheet.create({
    headerGradient: {
      paddingBottom: 4,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    headerOverride: {
      backgroundColor: 'transparent',
    },
    headerTitle: {
      color: theme.colors.textStrong,
      fontWeight: '700',
      letterSpacing: 0.4,
    },
    container: {
      padding: 20,
      paddingTop: 20,
      backgroundColor: 'transparent',
    },

    heroWrapper: {
      marginBottom: 22,
    },
    heroOuterRing: {
      borderRadius: 32,
      padding: 2,
      ...heroShadow,
    },
    heroInner: {
      borderRadius: 30,
      overflow: 'hidden',
      borderWidth: 1.5,
      borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.8)',
      borderBottomWidth: 4,
    },
    heroTopShine: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 72,
    },
    heroHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      paddingHorizontal: 18,
      paddingTop: 14,
      paddingBottom: 10,
      gap: 12,
    },
    heroTitleBlock: {
      flex: 1,
      minWidth: 0,
    },
    heroPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 6,
    },
    heroPillDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    heroPillText: {
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 2,
      color: theme.colors.textTertiary,
    },
    heroTitle: {
      fontSize: 20,
      fontWeight: '800',
      color: theme.colors.textStrong,
      lineHeight: 26,
      letterSpacing: -0.4,
      marginBottom: 2,
    },
    heroSubtitle: {
      fontSize: 12,
      fontWeight: '500',
      color: theme.colors.textSecondary,
      lineHeight: 16,
      letterSpacing: 0.1,
      maxWidth: '92%',
    },
    heroBadge: {
      marginTop: 2,
    },
    heroBadgeGrad: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 11,
      paddingVertical: 7,
      borderRadius: 12,
    },
    heroBadgeText: {
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 1.2,
    },
    statsRow: {
      flexDirection: 'row',
      gap: 10,
      paddingHorizontal: 16,
      paddingBottom: 16,
      paddingTop: 4,
      alignItems: 'stretch',
    },
    statTile: {
      flex: 1,
      minWidth: 0,
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 8,
      borderRadius: 20,
      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : theme.colors.borderLight,
      borderWidth: 1.2,
      borderBottomWidth: 3,
      borderColor: theme.colors.border,
      borderBottomColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.1)',
      gap: 4,
    },
    statTileMuted: {
      borderColor: theme.colors.borderLight,
    },
    statIconWrap: {
      width: 30,
      height: 30,
      borderRadius: 9,
      justifyContent: 'center',
      alignItems: 'center',
    },
    statValue: {
      fontSize: 18,
      fontWeight: '800',
      letterSpacing: -0.8,
    },
    statLabel: {
      fontSize: 9,
      fontWeight: '700',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      textAlign: 'center',
    },
    statHint: {
      fontSize: 10,
      fontWeight: '600',
      color: theme.colors.success,
      marginTop: -2,
    },

    filterSection: {
      marginBottom: 24,
    },
    filterLabel: {
      fontSize: 10,
      fontWeight: '700',
      color: theme.colors.textTertiary,
      letterSpacing: 2.5,
      marginBottom: 12,
      marginLeft: 2,
    },
    filterLabelAccent: {
      color: theme.colors.primary,
    },
    filterRow: {
      flexDirection: 'row',
      gap: 8,
    },
    chip: {
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: 20,
      backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : theme.colors.borderLight,
      borderWidth: 1.2,
      borderBottomWidth: 3,
      borderColor: isDark ? 'rgba(255,255,255,0.12)' : theme.colors.border,
      borderBottomColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(15,23,42,0.1)',
    },
    chipText: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.colors.textSecondary,
    },
    chipActive: {
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: 20,
      borderBottomWidth: 3,
      borderBottomColor: 'rgba(0,0,0,0.15)',
    },
    chipTextActive: {
      fontSize: 13,
      fontWeight: '700',
    },

    sectionLabel: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 16,
    },
    sectionLabelText: {
      fontSize: 10,
      fontWeight: '700',
      color: theme.colors.textTertiary,
      letterSpacing: 2.5,
    },
    sectionLine: {
      flex: 1,
      height: StyleSheet.hairlineWidth,
      backgroundColor: theme.colors.border,
    },

    loaderWrap: {
      paddingVertical: 60,
      alignItems: 'center',
    },

    emptyState: {
      alignItems: 'center',
      paddingVertical: 60,
      gap: 12,
    },
    emptyGlow: {
      width: 100,
      height: 100,
      borderRadius: 50,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 8,
    },
    emptyTitle: {
      fontSize: 20,
      fontWeight: '800',
      color: theme.colors.textStrong,
    },
    emptySubtitle: {
      fontSize: 14,
      color: theme.colors.textSecondary,
      fontWeight: '500',
    },

    cardShell: {
      marginBottom: 18,
      borderRadius: 28,
      ...shadowCard,
    },
    card: {
      backgroundColor: theme.colors.card,
      borderRadius: 28,
      borderWidth: 1.2,
      borderBottomWidth: 4,
      borderColor: theme.colors.border,
      borderBottomColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.1)',
      flexDirection: 'row',
      overflow: 'hidden',
    },
    accentStripe: {
      width: 6,
      borderTopLeftRadius: 28,
      borderBottomLeftRadius: 28,
    },
    cardInner: {
      flex: 1,
      padding: 18,
      paddingLeft: 16,
    },
    cardTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    ticketRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    typeChip: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
    },
    typeChipText: {
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 1,
    },
    ticketId: {
      fontSize: 10,
      color: theme.colors.textTertiary,
      fontWeight: '600',
      letterSpacing: 0.5,
    },
    severityBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 10,
      borderWidth: 1,
    },
    severityText: {
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.3,
    },
    cardTitle: {
      fontSize: 17,
      fontWeight: '800',
      color: theme.colors.textStrong,
      lineHeight: 24,
      marginBottom: 8,
      letterSpacing: -0.2,
    },
    cardDesc: {
      fontSize: 13,
      color: theme.colors.textSecondary,
      lineHeight: 20,
      fontWeight: '400',
      marginBottom: 16,
    },
    cardDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: theme.colors.border,
      marginBottom: 14,
    },
    cardFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    footerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    avatarDot: {
      width: 30,
      height: 30,
      borderRadius: 15,
      borderWidth: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    avatarInitial: {
      fontSize: 13,
      fontWeight: '800',
    },
    footerByLine: {
      fontSize: 10,
      color: theme.colors.textTertiary,
      fontWeight: '500',
      marginBottom: 1,
    },
    footerName: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.colors.textStrong,
    },
    footerRight: {
      alignItems: 'flex-end',
      gap: 6,
    },
    footerMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    footerDate: {
      fontSize: 11,
      color: theme.colors.textTertiary,
      fontWeight: '500',
    },
    statusPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
      borderWidth: 1,
      backgroundColor: 'transparent',
    },
    statusDot: {
      width: 5,
      height: 5,
      borderRadius: 3,
    },
    statusText: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.5,
    },
  });
}
