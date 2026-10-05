import { TourTarget, TourScrollView } from '@/src/features/app-tour';
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from '@/src/utils/haptics';
import { useTheme } from '@/src/hooks/useTheme';
import { eventService, type EventItem } from '@/src/services/eventService';

export default function AdminEventsDashboardScreen() {
  const router = useRouter();
  const { isDark } = useTheme();

  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'ALL' | 'UPCOMING' | 'ONGOING' | 'APPROVALS' | 'CLOSED'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const loadData = useCallback(async () => {
    try {
      const res = await eventService.listEvents({
        status: activeTab === 'ALL' ? undefined : activeTab === 'APPROVALS' ? 'PENDING_APPROVAL' : activeTab,
        search: searchQuery.trim() || undefined,
      });
      if (res?.data) {
        setEvents(res.data);
      }
    } catch (e) {
      console.warn('[AdminEvents] Failed to load events:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTab, searchQuery]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    loadData();
  };

  // KPIs
  const totalCount = events.length;
  const ongoingCount = events.filter((e) => e.status === 'ONGOING').length;
  const pendingApprovals = events.filter((e) => e.status === 'PENDING_APPROVAL' || e.status === 'AWAITING_APPROVAL').length;
  const avgReadiness = totalCount > 0
    ? Math.round(events.reduce((acc, e) => acc + (e.readiness_score || 0), 0) / totalCount)
    : 0;

  const bg = isDark ? '#090D16' : '#F8FAFC';
  const cardBg = isDark ? '#111827' : '#FFFFFF';
  const textCol = isDark ? '#F9FAFB' : '#0F172A';
  const subCol = isDark ? '#9CA3AF' : '#64748B';
  const borderCol = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ONGOING':
        return { bg: 'rgba(16,185,129,0.15)', text: '#10B981', label: 'LIVE NOW' };
      case 'PUBLISHED':
      case 'SCHEDULED':
        return { bg: 'rgba(59,130,246,0.15)', text: '#3B82F6', label: 'SCHEDULED' };
      case 'PENDING_APPROVAL':
      case 'AWAITING_APPROVAL':
        return { bg: 'rgba(245,158,11,0.15)', text: '#F59E0B', label: 'APPROVAL PENDING' };
      case 'CLOSED':
      case 'COMPLETED':
        return { bg: 'rgba(107,114,128,0.15)', text: '#6B7280', label: 'CONCLUDED' };
      default:
        return { bg: 'rgba(156,163,175,0.15)', text: '#9CA3AF', label: status };
    }
  };

  const getReadinessColor = (score: number) => {
    if (score >= 80) return '#10B981';
    if (score >= 50) return '#F59E0B';
    return '#EF4444';
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: bg }]} edges={['top', 'left', 'right']}>
      {/* Top Header */}
      <View style={[styles.topHeader, { borderBottomColor: borderCol }]}>
        <View style={styles.titleCol}>
          <View style={styles.badgeRow}>
            <LinearGradient
              colors={['#4F46E5', '#06B6D4']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.heroMiniBadge}
            >
              <Ionicons name="sparkles" size={11} color="#FFF" />
              <Text style={styles.heroMiniText}>PAPERLESS OPS</Text>
            </LinearGradient>
          </View>
          <TourTarget id="screen.admin-events.overview" native><Text style={[styles.pageTitle, { color: textCol }]}>Event Operations Hub</Text></TourTarget>
          <Text style={[styles.pageSub, { color: subCol }]}>
            End-to-end planning, consent, QR passes, transport & results
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.createHeaderBtn]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            router.push('/admin/events/create');
          }}
        >
          <LinearGradient
            colors={['#4F46E5', '#06B6D4']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.createHeaderGrad}
          >
            <Ionicons name="add" size={18} color="#FFF" />
            <Text style={styles.createHeaderText}>New Event</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <TourTarget id="screen.admin-events.workspace" native><View style={[styles.navTabsWrap, { borderBottomColor: borderCol }]}>
        <TourScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.navTabsScroll}>
          {[
            { key: 'ALL', label: 'All Events', icon: 'apps-outline' },
            { key: 'UPCOMING', label: 'Upcoming', icon: 'calendar-outline' },
            { key: 'ONGOING', label: 'Live Now', icon: 'radio-outline' },
            { key: 'APPROVALS', label: 'Approvals', icon: 'shield-checkmark-outline', count: pendingApprovals },
            { key: 'CLOSED', label: 'Concluded', icon: 'archive-outline' },
          ].map((tab) => {
            const active = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[
                  styles.navTab,
                  active && { backgroundColor: isDark ? 'rgba(79,70,229,0.3)' : 'rgba(79,70,229,0.12)' },
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setActiveTab(tab.key as any);
                }}
              >
                <Ionicons name={tab.icon as any} size={15} color={active ? '#6366F1' : subCol} />
                <Text style={[styles.navTabText, { color: active ? '#6366F1' : subCol }]}>{tab.label}</Text>
                {!!tab.count && tab.count > 0 && (
                  <View style={styles.tabCountPill}>
                    <Text style={styles.tabCountText}>{tab.count}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </TourScrollView>
      </View></TourTarget>

      <TourScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366F1" />}
      >
        {/* KPI Strip */}
        <View style={styles.kpiRow}>
          <View style={[styles.kpiCard, { backgroundColor: cardBg, borderColor: borderCol }]}>
            <View style={styles.kpiTop}>
              <View style={[styles.kpiIcon, { backgroundColor: 'rgba(79,70,229,0.12)' }]}>
                <Ionicons name="trophy-outline" size={18} color="#6366F1" />
              </View>
              <Text style={[styles.kpiValue, { color: textCol }]}>{totalCount}</Text>
            </View>
            <Text style={[styles.kpiTitle, { color: textCol }]}>Total Events</Text>
            <Text style={[styles.kpiSub, { color: subCol }]}>Scheduled & running</Text>
          </View>

          <View style={[styles.kpiCard, { backgroundColor: cardBg, borderColor: borderCol }]}>
            <View style={styles.kpiTop}>
              <View style={[styles.kpiIcon, { backgroundColor: 'rgba(16,185,129,0.12)' }]}>
                <Ionicons name="pulse-outline" size={18} color="#10B981" />
              </View>
              <Text style={[styles.kpiValue, { color: '#10B981' }]}>{ongoingCount}</Text>
            </View>
            <Text style={[styles.kpiTitle, { color: textCol }]}>Active / Live</Text>
            <Text style={[styles.kpiSub, { color: subCol }]}>On-field check-in active</Text>
          </View>

          <View style={[styles.kpiCard, { backgroundColor: cardBg, borderColor: borderCol }]}>
            <View style={styles.kpiTop}>
              <View style={[styles.kpiIcon, { backgroundColor: 'rgba(245,158,11,0.12)' }]}>
                <Ionicons name="hourglass-outline" size={18} color="#F59E0B" />
              </View>
              <Text style={[styles.kpiValue, { color: '#F59E0B' }]}>{pendingApprovals}</Text>
            </View>
            <Text style={[styles.kpiTitle, { color: textCol }]}>Approvals</Text>
            <Text style={[styles.kpiSub, { color: subCol }]}>Multi-tier signoffs</Text>
          </View>

          <View style={[styles.kpiCard, { backgroundColor: cardBg, borderColor: borderCol }]}>
            <View style={styles.kpiTop}>
              <View style={[styles.kpiIcon, { backgroundColor: 'rgba(6,182,212,0.12)' }]}>
                <Ionicons name="shield-checkmark-outline" size={18} color="#06B6D4" />
              </View>
              <Text style={[styles.kpiValue, { color: getReadinessColor(avgReadiness) }]}>{avgReadiness}%</Text>
            </View>
            <Text style={[styles.kpiTitle, { color: textCol }]}>Avg Readiness</Text>
            <Text style={[styles.kpiSub, { color: subCol }]}>Checklist compliance</Text>
          </View>
        </View>

        {/* Search Bar */}
        <View style={[styles.searchWrap, { backgroundColor: cardBg, borderColor: borderCol }]}>
          <Ionicons name="search-outline" size={18} color={subCol} />
          <TextInput
            placeholder="Search events by title, venue, or category..."
            placeholderTextColor={subCol}
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={[styles.searchInput, { color: textCol }]}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color={subCol} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Events List */}
        {loading ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator size="large" color="#6366F1" />
            <Text style={[styles.loaderText, { color: subCol }]}>Loading operations...</Text>
          </View>
        ) : events.length === 0 ? (
          <View style={[styles.emptyWrap, { backgroundColor: cardBg, borderColor: borderCol }]}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="calendar-clear-outline" size={32} color="#6366F1" />
            </View>
            <Text style={[styles.emptyTitle, { color: textCol }]}>No Events Found</Text>
            <Text style={[styles.emptySub, { color: subCol }]}>
              There are no events matching your selected filter. Start by launching a new event.
            </Text>
            <TouchableOpacity
              style={styles.emptyCreateBtn}
              onPress={() => router.push('/admin/events/create')}
            >
              <Text style={styles.emptyCreateBtnText}>Create Event</Text>
            </TouchableOpacity>
          </View>
        ) : (
          events.map((item) => {
            const statusBadge = getStatusBadge(item.status);
            const readiness = item.readiness_score || 0;
            const readinessCol = getReadinessColor(readiness);
            const modules = item.config?.modules || {};

            return (
              <TouchableOpacity
                key={item.id}
                activeOpacity={0.88}
                style={[styles.eventCard, { backgroundColor: cardBg, borderColor: borderCol }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  router.push(`/admin/events/${item.id}`);
                }}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.titleArea}>
                    <View style={styles.typeBadgeRow}>
                      <Text style={styles.eventTypeText}>{item.event_type?.replace(/_/g, ' ')}</Text>
                      {item.category && <Text style={[styles.categoryDot, { color: subCol }]}>•</Text>}
                      {item.category && <Text style={[styles.categoryText, { color: subCol }]}>{item.category}</Text>}
                    </View>
                    <Text style={[styles.eventTitle, { color: textCol }]}>{item.title}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: statusBadge.bg }]}>
                    <Text style={[styles.statusBadgeText, { color: statusBadge.text }]}>{statusBadge.label}</Text>
                  </View>
                </View>

                {/* Location & Time */}
                <View style={styles.metaRow}>
                  <View style={styles.metaItem}>
                    <Ionicons name="calendar-outline" size={14} color="#6366F1" />
                    <Text style={[styles.metaText, { color: subCol }]}>
                      {new Date(item.start_date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </Text>
                  </View>
                  {item.location && (
                    <View style={styles.metaItem}>
                      <Ionicons name="location-outline" size={14} color="#EC4899" />
                      <Text style={[styles.metaText, { color: subCol }]} numberOfLines={1}>
                        {item.location}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Modules chips */}
                <View style={styles.modulesRow}>
                  {modules.consent && (
                    <View style={styles.modPill}>
                      <Ionicons name="shield-checkmark" size={11} color="#10B981" />
                      <Text style={styles.modText}>Consent</Text>
                    </View>
                  )}
                  {modules.ticketing && (
                    <View style={styles.modPill}>
                      <Ionicons name="qr-code" size={11} color="#6366F1" />
                      <Text style={styles.modText}>QR Entry</Text>
                    </View>
                  )}
                  {modules.transport && (
                    <View style={styles.modPill}>
                      <Ionicons name="bus" size={11} color="#F59E0B" />
                      <Text style={styles.modText}>Transport</Text>
                    </View>
                  )}
                  {modules.competition && (
                    <View style={styles.modPill}>
                      <Ionicons name="trophy" size={11} color="#EC4899" />
                      <Text style={styles.modText}>Scores</Text>
                    </View>
                  )}
                  {modules.budget && (
                    <View style={styles.modPill}>
                      <Ionicons name="wallet" size={11} color="#06B6D4" />
                      <Text style={styles.modText}>Budget</Text>
                    </View>
                  )}
                </View>

                {/* Footer Strip */}
                <View style={[styles.cardFooter, { borderTopColor: borderCol }]}>
                  <View style={styles.readinessWrap}>
                    <Text style={[styles.readinessLabel, { color: subCol }]}>Readiness</Text>
                    <View style={styles.readinessBarOuter}>
                      <View
                        style={[
                          styles.readinessBarInner,
                          { width: `${Math.min(100, Math.max(5, readiness))}%`, backgroundColor: readinessCol },
                        ]}
                      />
                    </View>
                    <Text style={[styles.readinessValue, { color: readinessCol }]}>{readiness}%</Text>
                  </View>

                  <View style={styles.openDetailsBtn}>
                    <Text style={styles.openDetailsText}>Command Center</Text>
                    <Ionicons name="chevron-forward" size={14} color="#6366F1" />
                  </View>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </TourScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  titleCol: { flex: 1 },
  badgeRow: { flexDirection: 'row', marginBottom: 4 },
  heroMiniBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  heroMiniText: { color: '#FFF', fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  pageTitle: { fontSize: 20, fontWeight: '900', letterSpacing: -0.3 },
  pageSub: { fontSize: 12, marginTop: 2 },
  createHeaderBtn: { borderRadius: 12, overflow: 'hidden' },
  createHeaderGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  createHeaderText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  navTabsWrap: { borderBottomWidth: StyleSheet.hairlineWidth },
  navTabsScroll: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  navTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(150,150,150,0.08)',
  },
  navTabText: { fontSize: 13, fontWeight: '700' },
  tabCountPill: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  tabCountText: { color: '#FFF', fontSize: 10, fontWeight: '900' },
  scrollContent: { padding: 16, paddingBottom: 40 },
  kpiRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  kpiCard: {
    width: '48.5%',
    borderRadius: 16,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  kpiTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  kpiIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiValue: { fontSize: 22, fontWeight: '900' },
  kpiTitle: { fontSize: 13, fontWeight: '800' },
  kpiSub: { fontSize: 10, marginTop: 2 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 16,
  },
  searchInput: { flex: 1, fontSize: 13, padding: 0 },
  loaderWrap: { alignItems: 'center', paddingVertical: 40 },
  loaderText: { fontSize: 13, marginTop: 10 },
  emptyWrap: {
    alignItems: 'center',
    padding: 30,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 10,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(99,102,241,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: { fontSize: 16, fontWeight: '800', marginBottom: 6 },
  emptySub: { fontSize: 12, textAlign: 'center', lineHeight: 18, marginBottom: 16 },
  emptyCreateBtn: {
    backgroundColor: '#4F46E5',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
  },
  emptyCreateBtnText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  eventCard: {
    borderRadius: 16,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  titleArea: { flex: 1, marginRight: 8 },
  typeBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  eventTypeText: { color: '#6366F1', fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  categoryDot: { fontSize: 11 },
  categoryText: { fontSize: 11, fontWeight: '600' },
  eventTitle: { fontSize: 15, fontWeight: '800' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  statusBadgeText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.3 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 10 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: { fontSize: 12, fontWeight: '600' },
  modulesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  modPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(150,150,150,0.08)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  modText: { fontSize: 10, fontWeight: '700', color: '#64748B' },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  readinessWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  readinessLabel: { fontSize: 11, fontWeight: '600' },
  readinessBarOuter: {
    width: 60,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(150,150,150,0.15)',
    overflow: 'hidden',
  },
  readinessBarInner: { height: '100%', borderRadius: 3 },
  readinessValue: { fontSize: 11, fontWeight: '800' },
  openDetailsBtn: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  openDetailsText: { color: '#6366F1', fontSize: 12, fontWeight: '700' },
});
