import { TourTarget, TourScrollView } from '@/src/features/app-tour';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AdminHeader from '../../src/components/AdminHeader';
import AppTextInput from '../../src/components/AppTextInput';
import { useTheme } from '../../src/hooks/useTheme';
import {
  AdminService,
  AppAdoptionStatus,
  AppAdoptionUser,
} from '../../src/services/adminService';

const STATUS_FILTERS: { value: AppAdoptionStatus; label: string }[] = [
  { value: 'all', label: 'All accounts' },
  { value: 'detected', label: 'App detected' },
  { value: 'not_detected', label: 'Not detected' },
];

const ROLE_FILTERS = [
  { value: 'all', label: 'All roles' },
  { value: 'student', label: 'Students' },
  { value: 'parent', label: 'Parents' },
  { value: 'teacher', label: 'Teachers' },
  { value: 'staff', label: 'Staff' },
  { value: 'driver', label: 'Drivers' },
  { value: 'accounts', label: 'Accounts' },
  { value: 'admin', label: 'Admins' },
];

const roleLabel = (role: string) => {
  const labels: Record<string, string> = {
    admin: 'Admin',
    principal: 'Principal',
    student: 'Student',
    parent: 'Parent',
    teacher: 'Teacher',
    staff: 'Staff',
    driver: 'Driver',
    accounts: 'Accounts',
    accountant: 'Accounts',
  };
  return labels[role] || role.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
};

const formatDate = (value?: string | null) => {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleString([], {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const platformIcon = (platform: string): keyof typeof Ionicons.glyphMap => {
  if (platform.toLowerCase() === 'ios') return 'logo-apple';
  if (platform.toLowerCase() === 'android') return 'logo-android';
  return 'phone-portrait-outline';
};

export default function AppAdoptionScreen() {
  const { theme, isDark } = useTheme();
  const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark]);
  const { width } = useWindowDimensions();
  const isWide = width >= 900;
  const requestId = useRef(0);

  const [users, setUsers] = useState<AppAdoptionUser[]>([]);
  const [summary, setSummary] = useState({ total: 0, detected: 0, not_detected: 0 });
  const [meta, setMeta] = useState({ page: 1, limit: 25, total: 0, total_pages: 1 });
  const [status, setStatus] = useState<AppAdoptionStatus>('all');
  const [role, setRole] = useState('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      setSearch(searchInput.trim());
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const loadReport = useCallback(async (refresh = false) => {
    const currentRequest = ++requestId.current;
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError('');

    try {
      const report = await AdminService.getAppAdoption({
        page,
        limit: 25,
        search: search || undefined,
        status,
        role,
      });
      if (currentRequest !== requestId.current) return;
      setUsers(Array.isArray(report?.users) ? report.users : []);
      setSummary(report?.summary || { total: 0, detected: 0, not_detected: 0 });
      setMeta(report?.meta || { page: 1, limit: 25, total: 0, total_pages: 1 });
    } catch (loadError: any) {
      if (currentRequest !== requestId.current) return;
      setUsers([]);
      setError(loadError?.message || 'Could not load app adoption data.');
    } finally {
      if (currentRequest === requestId.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [page, role, search, status]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const chooseStatus = (nextStatus: AppAdoptionStatus) => {
    setPage(1);
    setStatus(nextStatus);
  };

  const chooseRole = (nextRole: string) => {
    setPage(1);
    setRole(nextRole);
  };

  const coverage = summary.total > 0
    ? Math.round((summary.detected / summary.total) * 100)
    : 0;

  const renderUser = ({ item }: { item: AppAdoptionUser }) => {
    const studentLine = [
      item.admission_no ? `Adm. ${item.admission_no}` : null,
      item.class_name ? `Class ${item.class_name}${item.section_name ? ` · ${item.section_name}` : ''}` : null,
    ].filter(Boolean).join('  •  ');
    const contact = item.phone || item.email || 'No contact saved';
    const platforms = (item.platforms || []).filter(Boolean);

    return (
      <View style={[styles.userCard, isWide && styles.userCardWide]}>
        <View style={styles.userTopRow}>
          <View style={[styles.avatar, item.app_detected ? styles.avatarDetected : styles.avatarMissing]}>
            <Text style={[styles.avatarText, { color: item.app_detected ? '#047857' : '#B45309' }]}>
              {(item.display_name || '?').trim().charAt(0).toUpperCase()}
            </Text>
          </View>

          <View style={styles.userIdentity}>
            <Text style={styles.userName} numberOfLines={1}>{item.display_name || 'Unnamed account'}</Text>
            <Text style={styles.contactText} numberOfLines={1}>{contact}</Text>
          </View>

          <View style={[styles.statusBadge, item.app_detected ? styles.detectedBadge : styles.missingBadge]}>
            <View style={[styles.statusDot, { backgroundColor: item.app_detected ? '#10B981' : '#F59E0B' }]} />
            <Text style={[styles.statusBadgeText, { color: item.app_detected ? '#047857' : '#B45309' }]}>
              {item.app_detected ? 'Detected' : 'Not detected'}
            </Text>
          </View>
        </View>

        <View style={styles.roleRow}>
          {(item.roles || []).map((itemRole) => (
            <View key={itemRole} style={styles.roleBadge}>
              <Text style={styles.roleText}>{roleLabel(itemRole)}</Text>
            </View>
          ))}
          {!!studentLine && <Text style={styles.studentMeta} numberOfLines={1}>{studentLine}</Text>}
        </View>

        <View style={styles.divider} />

        {item.app_detected ? (
          <View style={styles.deviceRow}>
            <View style={styles.deviceSummary}>
              <View style={styles.platformIcons}>
                {platforms.length > 0 ? platforms.map((platform) => (
                  <Ionicons
                    key={platform}
                    name={platformIcon(platform)}
                    size={17}
                    color={theme.colors.success}
                  />
                )) : (
                  <Ionicons name="phone-portrait-outline" size={17} color={theme.colors.success} />
                )}
              </View>
              <Text style={styles.deviceText}>
                {item.device_count} active {item.device_count === 1 ? 'device' : 'devices'}
              </Text>
            </View>
            <View style={styles.lastSeenBlock}>
              <Text style={styles.metaLabel}>LAST DETECTED</Text>
              <Text style={styles.metaValue}>{formatDate(item.last_detected_at)}</Text>
            </View>
          </View>
        ) : (
          <View style={styles.notDetectedRow}>
            <Ionicons name="cloud-offline-outline" size={18} color={theme.colors.warning} />
            <Text style={styles.notDetectedText}>No active mobile device has registered for this account.</Text>
          </View>
        )}

        <View style={styles.loginRow}>
          <Ionicons name="log-in-outline" size={15} color={theme.colors.textTertiary} />
          <Text style={styles.loginText}>Last sign-in: {formatDate(item.last_login_at)}</Text>
        </View>
      </View>
    );
  };

  const listHeader = (
    <View style={styles.headerContent}>
      <View style={styles.introRow}>
        <View style={styles.introCopy}>
          <Text style={styles.pageTitle}>App adoption</Text>
          <Text style={styles.pageSubtitle}>
            See which active accounts have opened the mobile app and registered a device.
          </Text>
        </View>
        <View style={styles.coveragePill}>
          <Text style={styles.coverageValue}>{coverage}%</Text>
          <Text style={styles.coverageLabel}>coverage</Text>
        </View>
      </View>

      <View style={styles.notice}>
        <Ionicons name="information-circle-outline" size={19} color={theme.colors.info} />
        <Text style={styles.noticeText}>
          “Not detected” means no active device registration exists. Downloads that were never opened, or users who refused notification permission, cannot be measured.
        </Text>
      </View>

      <View style={styles.statGrid}>
        {[
          { label: 'Active accounts', value: summary.total, icon: 'people-outline' as const, color: '#6366F1' },
          { label: 'App detected', value: summary.detected, icon: 'checkmark-circle-outline' as const, color: '#10B981' },
          { label: 'Not detected', value: summary.not_detected, icon: 'alert-circle-outline' as const, color: '#F59E0B' },
        ].map((stat) => (
          <View key={stat.label} style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: `${stat.color}18` }]}>
              <Ionicons name={stat.icon} size={20} color={stat.color} />
            </View>
            <View>
              <Text style={styles.statValue}>{stat.value}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.filtersCard}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={19} color={theme.colors.textSecondary} />
          <AppTextInput
            value={searchInput}
            onChangeText={setSearchInput}
            placeholder="Search name, phone, email or admission no."
            style={styles.searchInput}
            returnKeyType="search"
          />
          {!!searchInput && (
            <TouchableOpacity onPress={() => setSearchInput('')} accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={19} color={theme.colors.textTertiary} />
            </TouchableOpacity>
          )}
        </View>

        <TourScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {STATUS_FILTERS.map((filter) => {
            const selected = status === filter.value;
            const count = filter.value === 'all'
              ? summary.total
              : filter.value === 'detected'
                ? summary.detected
                : summary.not_detected;
            return (
              <TouchableOpacity
                key={filter.value}
                style={[styles.filterChip, selected && styles.filterChipActive]}
                onPress={() => chooseStatus(filter.value)}
              >
                <Text style={[styles.filterChipText, selected && styles.filterChipTextActive]}>
                  {filter.label} · {count}
                </Text>
              </TouchableOpacity>
            );
          })}
        </TourScrollView>

        <TourScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {ROLE_FILTERS.map((filter) => {
            const selected = role === filter.value;
            return (
              <TouchableOpacity
                key={filter.value}
                style={[styles.roleChip, selected && styles.roleChipActive]}
                onPress={() => chooseRole(filter.value)}
              >
                <Text style={[styles.roleChipText, selected && styles.roleChipTextActive]}>{filter.label}</Text>
              </TouchableOpacity>
            );
          })}
        </TourScrollView>
      </View>

      <View style={styles.resultsHeader}>
        <Text style={styles.resultsTitle}>
          {meta.total} {meta.total === 1 ? 'account' : 'accounts'}
        </Text>
        {(search || role !== 'all' || status !== 'all') && (
          <TouchableOpacity
            onPress={() => {
              setSearchInput('');
              setSearch('');
              setRole('all');
              setStatus('all');
              setPage(1);
            }}
          >
            <Text style={styles.clearText}>Clear filters</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  const emptyState = loading ? (
    <View style={styles.stateBox}>
      <ActivityIndicator size="large" color={theme.colors.primary} />
      <Text style={styles.stateText}>Loading app adoption…</Text>
    </View>
  ) : error ? (
    <View style={styles.stateBox}>
      <Ionicons name="cloud-offline-outline" size={34} color={theme.colors.danger} />
      <Text style={styles.stateTitle}>Report unavailable</Text>
      <Text style={styles.stateText}>{error}</Text>
      <TouchableOpacity style={styles.retryButton} onPress={() => loadReport()}>
        <Text style={styles.retryText}>Try again</Text>
      </TouchableOpacity>
    </View>
  ) : (
    <View style={styles.stateBox}>
      <Ionicons name="search-outline" size={34} color={theme.colors.textTertiary} />
      <Text style={styles.stateTitle}>No matching accounts</Text>
      <Text style={styles.stateText}>Change the status, role, or search filter.</Text>
    </View>
  );

  const footer = meta.total_pages > 1 ? (
    <View style={styles.pagination}>
      <TouchableOpacity
        style={[styles.pageButton, page <= 1 && styles.pageButtonDisabled]}
        disabled={page <= 1}
        onPress={() => setPage((current) => Math.max(1, current - 1))}
      >
        <Ionicons name="chevron-back" size={18} color={page <= 1 ? theme.colors.textTertiary : theme.colors.primary} />
        <Text style={[styles.pageButtonText, page <= 1 && styles.pageButtonTextDisabled]}>Previous</Text>
      </TouchableOpacity>
      <Text style={styles.pageInfo}>Page {meta.page} of {meta.total_pages}</Text>
      <TouchableOpacity
        style={[styles.pageButton, page >= meta.total_pages && styles.pageButtonDisabled]}
        disabled={page >= meta.total_pages}
        onPress={() => setPage((current) => Math.min(meta.total_pages, current + 1))}
      >
        <Text style={[styles.pageButtonText, page >= meta.total_pages && styles.pageButtonTextDisabled]}>Next</Text>
        <Ionicons name="chevron-forward" size={18} color={page >= meta.total_pages ? theme.colors.textTertiary : theme.colors.primary} />
      </TouchableOpacity>
    </View>
  ) : <View style={styles.footerSpace} />;

  return (
    <View style={styles.screen}>
      <TourTarget id="screen.admin-app-adoption.overview"><AdminHeader title="App Adoption" showNotification /></TourTarget>
      <TourTarget id="screen.admin-app-adoption.workspace" native><FlatList
        key={isWide ? 'wide' : 'narrow'}
        data={loading ? [] : users}
        keyExtractor={(item) => item.user_id}
        renderItem={renderUser}
        numColumns={isWide ? 2 : 1}
        columnWrapperStyle={isWide ? styles.columnWrapper : undefined}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={emptyState}
        ListFooterComponent={footer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadReport(true)}
            tintColor={theme.colors.primary}
          />
        }
      /></TourTarget>
    </View>
  );
}

function createStyles(theme: any, isDark: boolean) {
  const cardShadow = isDark ? {} : {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  };

  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background },
    listContent: {
      width: '100%',
      maxWidth: 1180,
      alignSelf: 'center',
      paddingHorizontal: 18,
      paddingBottom: 30,
    },
    headerContent: { paddingTop: 22 },
    introRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 16 },
    introCopy: { flex: 1 },
    pageTitle: { fontSize: 28, fontWeight: '800', color: theme.colors.textStrong, letterSpacing: -0.7 },
    pageSubtitle: { fontSize: 14, lineHeight: 21, color: theme.colors.textSecondary, marginTop: 5 },
    coveragePill: {
      minWidth: 84,
      paddingHorizontal: 16,
      paddingVertical: 11,
      borderRadius: 18,
      backgroundColor: isDark ? 'rgba(16,185,129,0.12)' : '#ECFDF5',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(52,211,153,0.22)' : '#A7F3D0',
      alignItems: 'center',
    },
    coverageValue: { fontSize: 22, fontWeight: '800', color: theme.colors.success },
    coverageLabel: { fontSize: 10, fontWeight: '700', color: theme.colors.success, textTransform: 'uppercase', letterSpacing: 0.6 },
    notice: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      padding: 13,
      borderRadius: 14,
      backgroundColor: isDark ? 'rgba(59,130,246,0.10)' : '#EFF6FF',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(96,165,250,0.18)' : '#BFDBFE',
      marginBottom: 16,
    },
    noticeText: { flex: 1, color: isDark ? '#BFDBFE' : '#1E40AF', fontSize: 12, lineHeight: 18 },
    statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16 },
    statCard: {
      minWidth: 150,
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 15,
      borderRadius: 18,
      backgroundColor: theme.colors.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
      ...cardShadow,
    },
    statIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
    statValue: { color: theme.colors.textStrong, fontWeight: '800', fontSize: 21 },
    statLabel: { color: theme.colors.textSecondary, fontSize: 11, marginTop: 1 },
    filtersCard: {
      padding: 14,
      backgroundColor: theme.colors.card,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.colors.border,
      gap: 12,
      ...cardShadow,
    },
    searchBox: {
      minHeight: 46,
      borderRadius: 14,
      paddingHorizontal: 13,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    searchInput: {
      flex: 1,
      height: 44,
      paddingHorizontal: 10,
      paddingVertical: 0,
      borderWidth: 0,
      backgroundColor: 'transparent',
      color: theme.colors.text,
      fontSize: 14,
    },
    chipRow: { gap: 8, paddingRight: 8 },
    filterChip: {
      paddingHorizontal: 13,
      paddingVertical: 9,
      borderRadius: 999,
      backgroundColor: isDark ? '#111827' : '#F1F5F9',
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    filterChipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
    filterChipText: { fontSize: 12, fontWeight: '700', color: theme.colors.textSecondary },
    filterChipTextActive: { color: '#FFFFFF' },
    roleChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10 },
    roleChipActive: { backgroundColor: isDark ? 'rgba(129,140,248,0.14)' : '#EEF2FF' },
    roleChipText: { color: theme.colors.textSecondary, fontSize: 12, fontWeight: '600' },
    roleChipTextActive: { color: theme.colors.primary },
    resultsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 22, marginBottom: 10 },
    resultsTitle: { fontSize: 15, fontWeight: '800', color: theme.colors.textStrong },
    clearText: { color: theme.colors.primary, fontSize: 12, fontWeight: '700' },
    columnWrapper: { gap: 12 },
    userCard: {
      width: '100%',
      marginBottom: 12,
      padding: 16,
      borderRadius: 20,
      backgroundColor: theme.colors.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
      ...cardShadow,
    },
    userCardWide: { flex: 1, minWidth: 0 },
    userTopRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
    avatar: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
    avatarDetected: { backgroundColor: isDark ? 'rgba(16,185,129,0.14)' : '#D1FAE5' },
    avatarMissing: { backgroundColor: isDark ? 'rgba(245,158,11,0.14)' : '#FEF3C7' },
    avatarText: { fontSize: 17, fontWeight: '800' },
    userIdentity: { flex: 1, minWidth: 0 },
    userName: { color: theme.colors.textStrong, fontSize: 15, fontWeight: '800' },
    contactText: { color: theme.colors.textSecondary, fontSize: 12, marginTop: 3 },
    statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, paddingVertical: 7, borderRadius: 999 },
    detectedBadge: { backgroundColor: isDark ? 'rgba(16,185,129,0.12)' : '#ECFDF5' },
    missingBadge: { backgroundColor: isDark ? 'rgba(245,158,11,0.12)' : '#FFFBEB' },
    statusDot: { width: 6, height: 6, borderRadius: 3 },
    statusBadgeText: { fontSize: 10, fontWeight: '800' },
    roleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 13 },
    roleBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 7, backgroundColor: isDark ? '#1E293B' : '#F1F5F9' },
    roleText: { color: theme.colors.textSecondary, fontSize: 9, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
    studentMeta: { flexShrink: 1, color: theme.colors.textSecondary, fontSize: 11 },
    divider: { height: 1, backgroundColor: theme.colors.border, marginVertical: 13 },
    deviceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    deviceSummary: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    platformIcons: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    deviceText: { color: theme.colors.text, fontSize: 12, fontWeight: '700' },
    lastSeenBlock: { alignItems: 'flex-end', flexShrink: 1 },
    metaLabel: { color: theme.colors.textTertiary, fontSize: 8, fontWeight: '800', letterSpacing: 0.5 },
    metaValue: { color: theme.colors.textSecondary, fontSize: 10, fontWeight: '600', marginTop: 2 },
    notDetectedRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    notDetectedText: { flex: 1, color: theme.colors.textSecondary, fontSize: 11, lineHeight: 17 },
    loginRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
    loginText: { color: theme.colors.textTertiary, fontSize: 10 },
    stateBox: { minHeight: 230, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 9 },
    stateTitle: { color: theme.colors.textStrong, fontSize: 16, fontWeight: '800', textAlign: 'center' },
    stateText: { color: theme.colors.textSecondary, fontSize: 13, lineHeight: 19, textAlign: 'center' },
    retryButton: { marginTop: 5, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12, backgroundColor: theme.colors.primary },
    retryText: { color: '#FFFFFF', fontWeight: '800', fontSize: 12 },
    pagination: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 20 },
    pageButton: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 11, borderWidth: 1, borderColor: theme.colors.border },
    pageButtonDisabled: { opacity: 0.55 },
    pageButtonText: { color: theme.colors.primary, fontWeight: '700', fontSize: 12 },
    pageButtonTextDisabled: { color: theme.colors.textTertiary },
    pageInfo: { color: theme.colors.textSecondary, fontSize: 11, fontWeight: '700' },
    footerSpace: { height: 18 },
  });
}
