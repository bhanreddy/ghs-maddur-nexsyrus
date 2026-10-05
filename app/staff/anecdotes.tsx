import { TourTarget, TourScrollView } from '@/src/features/app-tour';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  Modal,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import StaffHeader from '../../src/components/StaffHeader';
import { useTheme } from '../../src/hooks/useTheme';
import { clayCard, clayInset } from '../../src/theme/clayStyles';
import * as Haptics from '../../src/utils/haptics';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import { AnecdoteService, Anecdote, AnecdoteCategory } from '../../src/services/anecdoteService';
import { AnecdoteOfflineQueue, QueuedAnecdote } from '../../src/services/anecdoteOfflineQueue';
import { AnecdoteQuickModal, AnecdoteDraft, StudentOption } from '../../src/components/anecdote/AnecdoteQuickModal';
import { StudentIntelligenceTimeline } from '../../src/components/anecdote/StudentIntelligenceTimeline';
import StudentPhoto from '../../src/components/StudentPhoto';
import {
  CATEGORY_FALLBACKS,
  OBSERVATION_PROMPTS,
  contextLabel,
  dayGroupLabel,
  formatRelativeTime,
  isSameDay,
  isWithinDays,
  severityMeta,
  typeMeta,
} from '../../src/features/anecdote/anecdoteUi';

export default function StaffAnecdotesScreen() {
  const router = useRouter();
  const { theme, isDark } = useTheme();
  const { width: winW } = useWindowDimensions();
  const isWide = winW >= 900;

  const [anecdotes, setAnecdotes] = useState<Anecdote[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [pendingQueue, setPendingQueue] = useState<QueuedAnecdote[]>([]);
  const [categories, setCategories] = useState<AnecdoteCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');

  const [quickModalVisible, setQuickModalVisible] = useState(false);
  const [draft, setDraft] = useState<AnecdoteDraft | null>(null);
  const [preselectedStudent, setPreselectedStudent] = useState<StudentOption | null>(null);
  const [selectedStudentForTimeline, setSelectedStudentForTimeline] = useState<{ id: string; name: string } | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoadError(null);
      const [list, queue, taxonomy] = await Promise.all([
        AnecdoteService.getAnecdotes({ limit: 60 }),
        AnecdoteOfflineQueue.getPendingObservations(),
        AnecdoteService.getTaxonomy().catch(() => ({ categories: [] })),
      ]);
      setAnecdotes(list?.items || []);
      setTotalCount(list?.total || list?.items?.length || 0);
      setPendingQueue((queue || []).filter((item) => item.status !== 'synced'));
      setCategories(taxonomy?.categories || []);
    } catch (err: any) {
      setLoadError(err?.message || 'Could not load observations right now.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadData();
  };

  const openRecorder = (nextDraft?: AnecdoteDraft | null, student?: StudentOption | null) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setDraft(nextDraft || null);
    setPreselectedStudent(student || null);
    setQuickModalVisible(true);
  };

  const handleSyncQueue = async () => {
    if (pendingQueue.length === 0) return;
    setIsSyncing(true);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const res = await AnecdoteOfflineQueue.syncPendingObservations();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      alertCompat('Synced', `${res.synced} offline observation${res.synced === 1 ? '' : 's'} uploaded.`);
      loadData();
    } catch {
      alertCompat('Still offline', 'We will retry automatically when the connection returns.');
    } finally {
      setIsSyncing(false);
    }
  };

  const categoryTabs = useMemo(() => {
    if (categories.length > 0) {
      return [
        CATEGORY_FALLBACKS[0],
        ...categories.map((cat) => ({
          key: cat.code,
          code: cat.code,
          label: cat.name.replace('Social & Emotional', 'Social'),
          icon: cat.icon || 'pricetag-outline',
          color: cat.color || '#6366F1',
        })),
      ];
    }
    return CATEGORY_FALLBACKS;
  }, [categories]);

  const filteredAnecdotes = useMemo(() => {
    let res = [...anecdotes];
    if (selectedCategory !== 'ALL') {
      res = res.filter(
        (item) => item.category_code === selectedCategory || item.category_name === selectedCategory,
      );
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      res = res.filter((item) =>
        [
          item.student_name,
          item.student_admission_no,
          item.admission_no,
          item.class_name,
          item.section_name,
          item.observation_text,
          item.category_name,
          item.created_by_name,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(q)),
      );
    }
    return res;
  }, [anecdotes, selectedCategory, searchQuery]);

  const groupedFeed = useMemo(() => {
    const groups: { label: string; items: Anecdote[] }[] = [];
    for (const item of filteredAnecdotes) {
      const label = dayGroupLabel(item.observed_at || item.created_at);
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.items.push(item);
      else groups.push({ label, items: [item] });
    }
    return groups;
  }, [filteredAnecdotes]);

  const stats = useMemo(() => {
    const today = anecdotes.filter((item) => isSameDay(item.observed_at || item.created_at)).length;
    const week = anecdotes.filter((item) => isWithinDays(item.observed_at || item.created_at, 7)).length;
    const strengths = anecdotes.filter((item) => item.severity === 'LEVEL_1_POSITIVE' || item.observation_type === 'ACHIEVEMENT').length;
    const watch = anecdotes.filter(
      (item) => item.severity === 'LEVEL_2_WATCH' || item.severity === 'LEVEL_3_ATTENTION' || item.severity === 'LEVEL_4_CRITICAL',
    ).length;
    return { today, week, strengths, watch, total: totalCount || anecdotes.length };
  }, [anecdotes, totalCount]);

  const primaryColor = theme.colors.primary || '#6366F1';
  const cardStyle = clayCard(isDark, 'md');
  const insetStyle = clayInset(isDark, false);
  const emptyBecauseFilter = anecdotes.length > 0 && filteredAnecdotes.length === 0;

  const studentClassLine = (item: Anecdote) =>
    [item.class_name, item.section_name].filter(Boolean).join(' ') ||
    (item.student_admission_no || item.admission_no ? `Adm ${item.student_admission_no || item.admission_no}` : '');

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#080B14' : '#F1F5F9' }]}>
      <TourTarget id="screen.staff-anecdotes.overview"><StaffHeader title="Anecdotes & Intelligence" /></TourTarget>

      <TourScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, isWide && styles.scrollWide]}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={primaryColor} />}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {pendingQueue.length > 0 && (
          <View style={[styles.offlineBanner, { backgroundColor: isDark ? '#312E81' : '#EEF2FF' }]}>
            <View style={styles.offlineBannerLeft}>
              <Ionicons name="cloud-offline-outline" size={20} color="#6366F1" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.offlineBannerTitle, { color: isDark ? '#E0E7FF' : '#312E81' }]}>
                  {pendingQueue.length} saved on this device
                </Text>
                <Text style={[styles.offlineBannerSubtitle, { color: isDark ? '#A5B4FC' : '#4338CA' }]}>
                  Sync when you have a connection so the whole team can see them.
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={handleSyncQueue} disabled={isSyncing} style={[styles.syncBtn, { backgroundColor: primaryColor }]}>
              {isSyncing ? <ActivityIndicator size="small" color="#FFF" /> : (
                <>
                  <Ionicons name="sync-outline" size={14} color="#FFF" />
                  <Text style={styles.syncBtnText}>Sync now</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        <View style={[cardStyle, styles.heroCard]}>
          <View style={styles.heroCopy}>
            <Text style={[styles.heroKicker, { color: primaryColor }]}>Observation Hub</Text>
            <Text style={[styles.heroTitle, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>
              Notice something. Capture it in 20 seconds.
            </Text>
            <Text style={[styles.heroSubtitle, { color: isDark ? '#94A3B8' : '#64748B' }]}>
              Strengths, concerns, and small classroom moments become a living picture of each child.
            </Text>
          </View>
          <TouchableOpacity onPress={() => openRecorder()} style={styles.newObservationBtn} activeOpacity={0.9}>
            <LinearGradient colors={['#6366F1', '#4F46E5']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.newObservationGradient}>
              <Ionicons name="add" size={20} color="#FFF" />
              <Text style={styles.newObservationText}>Record observation</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        <View style={styles.metricsRow}>
          <View style={[cardStyle, styles.metricCard]}>
            <Text style={[styles.metricNumber, { color: primaryColor }]}>{stats.today}</Text>
            <Text style={[styles.metricLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>Today</Text>
          </View>
          <View style={[cardStyle, styles.metricCard]}>
            <Text style={[styles.metricNumber, { color: '#2563EB' }]}>{stats.week}</Text>
            <Text style={[styles.metricLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>This week</Text>
          </View>
          <View style={[cardStyle, styles.metricCard]}>
            <Text style={[styles.metricNumber, { color: '#059669' }]}>{stats.strengths}</Text>
            <Text style={[styles.metricLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>Strengths</Text>
          </View>
          <View style={[cardStyle, styles.metricCard]}>
            <Text style={[styles.metricNumber, { color: '#EA580C' }]}>{stats.watch}</Text>
            <Text style={[styles.metricLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>Watch</Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={() => router.push('/staff/student-intelligence' as any)}
          style={[cardStyle, styles.cockpitCard]}
          activeOpacity={0.85}
        >
          <View style={[styles.cockpitIcon, { backgroundColor: isDark ? '#064E3B' : '#ECFDF5' }]}>
            <Ionicons name="pulse" size={18} color="#10B981" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cockpitTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>Student Intelligence Cockpit</Text>
            <Text style={[styles.cockpitSub, { color: isDark ? '#94A3B8' : '#64748B' }]}>
              See who is Stable, Watch, Attention, or showing Strengths.
            </Text>
          </View>
          <Ionicons name="arrow-forward" size={16} color={isDark ? '#94A3B8' : '#64748B'} />
        </TouchableOpacity>

        <TourTarget id="screen.staff-anecdotes.workspace" native><View style={[insetStyle, styles.searchBar]}>
          <Ionicons name="search-outline" size={18} color={isDark ? '#94A3B8' : '#64748B'} />
          <TextInput
            style={[styles.searchInput, { color: isDark ? '#F8FAFC' : '#0F172A' }]}
            placeholder="Search a student, class, or word from a note"
            placeholderTextColor={isDark ? '#64748B' : '#94A3B8'}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={16} color={isDark ? '#94A3B8' : '#64748B'} />
            </TouchableOpacity>
          ) : null}
        </View></TourTarget>

        <TourScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryChipsScroll}>
          {categoryTabs.map((cat) => {
            const active = selectedCategory === cat.key;
            const count =
              cat.key === 'ALL'
                ? anecdotes.length
                : anecdotes.filter((item) => item.category_code === cat.code || item.category_name === cat.label).length;
            return (
              <TouchableOpacity
                key={cat.key}
                onPress={() => {
                  setSelectedCategory(cat.key);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                style={[
                  styles.categoryChip,
                  {
                    backgroundColor: active ? cat.color || primaryColor : isDark ? '#1E293B' : '#FFF',
                    borderColor: active ? cat.color || primaryColor : isDark ? '#334155' : '#E2E8F0',
                  },
                ]}
              >
                <Ionicons name={cat.icon as any} size={13} color={active ? '#FFF' : cat.color || (isDark ? '#CBD5E1' : '#475569')} />
                <Text style={[styles.categoryChipText, { color: active ? '#FFF' : isDark ? '#CBD5E1' : '#475569', fontWeight: active ? '800' : '600' }]}>
                  {cat.label}
                </Text>
                <View style={[styles.countPill, { backgroundColor: active ? 'rgba(255,255,255,0.2)' : isDark ? '#0F172A' : '#F1F5F9' }]}>
                  <Text style={[styles.countPillText, { color: active ? '#FFF' : isDark ? '#94A3B8' : '#64748B' }]}>{count}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </TourScrollView>

        {loadError ? (
          <View style={[cardStyle, styles.emptyCard]}>
            <Ionicons name="cloud-offline-outline" size={42} color="#EF4444" />
            <Text style={[styles.emptyTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>Could not load observations</Text>
            <Text style={[styles.emptySubtitle, { color: isDark ? '#94A3B8' : '#64748B' }]}>{loadError}</Text>
            <TouchableOpacity onPress={loadData} style={[styles.retryBtn, { backgroundColor: primaryColor }]}>
              <Text style={styles.retryBtnText}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={primaryColor} />
            <Text style={[styles.loadingText, { color: isDark ? '#94A3B8' : '#64748B' }]}>Gathering today’s observations…</Text>
          </View>
        ) : filteredAnecdotes.length === 0 ? (
          <View style={[cardStyle, styles.emptyCard]}>
            <View style={[styles.emptyIconWrap, { backgroundColor: isDark ? '#1E1B4B' : '#EEF2FF' }]}>
              <Ionicons name={emptyBecauseFilter ? 'filter-outline' : 'sparkles'} size={28} color={primaryColor} />
            </View>
            <Text style={[styles.emptyTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>
              {emptyBecauseFilter ? 'Nothing matches that search' : 'No observations yet'}
            </Text>
            <Text style={[styles.emptySubtitle, { color: isDark ? '#94A3B8' : '#64748B' }]}>
              {emptyBecauseFilter
                ? 'Try another student, category, or clear the search to see the full feed.'
                : 'Start with one sentence. The hub will file it, tag it, and keep it next to the student.'}
            </Text>
            {emptyBecauseFilter ? (
              <TouchableOpacity
                onPress={() => {
                  setSearchQuery('');
                  setSelectedCategory('ALL');
                }}
                style={[styles.retryBtn, { backgroundColor: primaryColor }]}
              >
                <Text style={styles.retryBtnText}>Clear filters</Text>
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity onPress={() => openRecorder()} style={styles.emptyCta}>
                  <LinearGradient colors={['#6366F1', '#4F46E5']} style={styles.newObservationGradient}>
                    <Ionicons name="add" size={18} color="#FFF" />
                    <Text style={styles.newObservationText}>Record the first one</Text>
                  </LinearGradient>
                </TouchableOpacity>
                <Text style={[styles.promptHeading, { color: isDark ? '#64748B' : '#94A3B8' }]}>OR START FROM A MOMENT</Text>
                <View style={styles.promptGrid}>
                  {OBSERVATION_PROMPTS.slice(0, 4).map((prompt) => (
                    <TouchableOpacity
                      key={prompt.id}
                      onPress={() => openRecorder({ text: prompt.text })}
                      style={[styles.promptCard, { backgroundColor: isDark ? '#1E293B' : '#FFF', borderColor: `${prompt.color}33` }]}
                    >
                      <Ionicons name={prompt.icon} size={16} color={prompt.color} />
                      <Text style={[styles.promptCardText, { color: isDark ? '#E2E8F0' : '#1E293B' }]}>{prompt.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
          </View>
        ) : (
          <View style={styles.feed}>
            {groupedFeed.map((group) => (
              <View key={group.label} style={styles.groupBlock}>
                <Text style={[styles.groupLabel, { color: isDark ? '#94A3B8' : '#64748B' }]}>{group.label}</Text>
                {group.items.map((item) => {
                  const sev = severityMeta(item.severity);
                  const type = typeMeta(item.observation_type);
                  const expanded = expandedId === item.id;
                  const text = item.observation_text || '';
                  const long = text.length > 160;

                  return (
                    <View key={item.id} style={[cardStyle, styles.anecdoteCard]}>
                      <View style={[styles.severityRail, { backgroundColor: sev.color }]} />
                      <View style={styles.anecdoteBody}>
                        <View style={styles.anecdoteHeader}>
                          <TouchableOpacity
                            onPress={() => setSelectedStudentForTimeline({ id: item.student_id, name: item.student_name || 'Student' })}
                            style={styles.studentTouch}
                          >
                            <StudentPhoto photoUrl={item.student_photo_url} displayName={item.student_name} size={42} />
                            <View style={{ marginLeft: 10, flex: 1 }}>
                              <Text style={[styles.studentName, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>
                                {item.student_name || 'Student'}
                              </Text>
                              <Text style={[styles.studentMeta, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                                {[studentClassLine(item), formatRelativeTime(item.observed_at || item.created_at)]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </Text>
                            </View>
                          </TouchableOpacity>
                          <View style={[styles.severityBadge, { backgroundColor: `${sev.color}18` }]}>
                            <Text style={[styles.severityBadgeText, { color: sev.color }]}>{sev.label}</Text>
                          </View>
                        </View>

                        <TouchableOpacity activeOpacity={0.8} onPress={() => setExpandedId(expanded ? null : item.id)}>
                          <Text
                            style={[styles.observationText, { color: isDark ? '#E2E8F0' : '#1E293B' }]}
                            numberOfLines={expanded ? undefined : 3}
                          >
                            {text}
                          </Text>
                          {long ? (
                            <Text style={[styles.readMore, { color: primaryColor }]}>{expanded ? 'Show less' : 'Read more'}</Text>
                          ) : null}
                        </TouchableOpacity>

                        <View style={styles.badgesRow}>
                          {item.category_name ? (
                            <View style={[styles.badge, { backgroundColor: `${item.category_color || primaryColor}18` }]}>
                              <Text style={[styles.badgeText, { color: item.category_color || primaryColor }]}>{item.category_name}</Text>
                            </View>
                          ) : null}
                          <View style={[styles.badge, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}>
                            <Ionicons name={type.icon as any} size={11} color={type.color} />
                            <Text style={[styles.badgeText, { color: isDark ? '#CBD5E1' : '#475569' }]}>{type.label}</Text>
                          </View>
                          {item.context ? (
                            <View style={[styles.badge, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}>
                              <Ionicons name="location-outline" size={11} color={isDark ? '#94A3B8' : '#64748B'} />
                              <Text style={[styles.badgeText, { color: isDark ? '#94A3B8' : '#64748B' }]}>{contextLabel(item.context)}</Text>
                            </View>
                          ) : null}
                          {item.created_by_name ? (
                            <View style={[styles.badge, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' }]}>
                              <Text style={[styles.badgeText, { color: isDark ? '#94A3B8' : '#64748B' }]}>by {item.created_by_name}</Text>
                            </View>
                          ) : null}
                        </View>

                        <View style={[styles.cardFooter, { borderTopColor: isDark ? '#1E293B' : '#F1F5F9' }]}>
                          <TouchableOpacity
                            onPress={() => setSelectedStudentForTimeline({ id: item.student_id, name: item.student_name || 'Student' })}
                            style={styles.footerActionBtn}
                          >
                            <Ionicons name="time-outline" size={15} color={primaryColor} />
                            <Text style={[styles.footerActionText, { color: primaryColor }]}>Timeline</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() =>
                              router.push({ pathname: '/staff/student-intelligence', params: { studentId: item.student_id } } as any)
                            }
                            style={styles.footerActionBtn}
                          >
                            <Ionicons name="pulse-outline" size={15} color="#10B981" />
                            <Text style={[styles.footerActionText, { color: '#10B981' }]}>Profile</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() =>
                              openRecorder(null, {
                                id: item.student_id,
                                display_name: item.student_name || 'Student',
                                admission_no: item.student_admission_no || item.admission_no,
                                photo_url: item.student_photo_url,
                                class_name: studentClassLine(item),
                              })
                            }
                            style={styles.footerActionBtn}
                          >
                            <Ionicons name="add-circle-outline" size={15} color="#8B5CF6" />
                            <Text style={[styles.footerActionText, { color: '#8B5CF6' }]}>Add another</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
        )}
        <View style={{ height: 72 }} />
      </TourScrollView>

      {!isWide ? (
        <TouchableOpacity onPress={() => openRecorder()} style={styles.fab} activeOpacity={0.9}>
          <LinearGradient colors={['#6366F1', '#4F46E5']} style={styles.fabGradient}>
            <Ionicons name="add" size={26} color="#FFF" />
          </LinearGradient>
        </TouchableOpacity>
      ) : null}

      <AnecdoteQuickModal
        visible={quickModalVisible}
        initialDraft={draft}
        preselectedStudent={preselectedStudent}
        onClose={() => {
          setQuickModalVisible(false);
          setDraft(null);
          setPreselectedStudent(null);
        }}
        onSuccess={(created, student) => {
          if (created && !created.is_offline) {
            setAnecdotes((prev) => [
              {
                ...created,
                student_name: created.student_name || student?.display_name,
                student_photo_url: created.student_photo_url || student?.photo_url,
                student_admission_no: created.student_admission_no || student?.admission_no,
                admission_no: created.admission_no || student?.admission_no,
                class_name: created.class_name || student?.class_name,
              } as Anecdote,
              ...prev.filter((row) => row.id !== created.id),
            ]);
          }
          loadData();
        }}
      />

      <Modal
        visible={Boolean(selectedStudentForTimeline)}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedStudentForTimeline(null)}
      >
        <View style={styles.timelineOverlay}>
          <View style={[styles.timelineSheet, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }]}>
            <View style={styles.timelineHeader}>
              <View>
                <Text style={[styles.timelineHeaderTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>
                  {selectedStudentForTimeline?.name}
                </Text>
                <Text style={[styles.timelineHeaderSub, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                  Unified intelligence timeline
                </Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedStudentForTimeline(null)} style={styles.closeTimelineBtn}>
                <Ionicons name="close" size={24} color={isDark ? '#94A3B8' : '#64748B'} />
              </TouchableOpacity>
            </View>
            <View style={{ flex: 1, paddingHorizontal: 16 }}>
              {selectedStudentForTimeline ? (
                <StudentIntelligenceTimeline studentId={selectedStudentForTimeline.id} />
              ) : null}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16 },
  scrollWide: { maxWidth: 920, width: '100%', alignSelf: 'center' },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    marginBottom: 14,
  },
  offlineBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  offlineBannerTitle: { fontSize: 13, fontWeight: '800' },
  offlineBannerSubtitle: { fontSize: 11, marginTop: 2, lineHeight: 15 },
  syncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  syncBtnText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  heroCard: { padding: 18, marginBottom: 12 },
  heroCopy: { marginBottom: 14 },
  heroKicker: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6 },
  heroTitle: { fontSize: 22, fontWeight: '800', lineHeight: 28 },
  heroSubtitle: { fontSize: 13, marginTop: 6, lineHeight: 19 },
  newObservationBtn: { borderRadius: 16, overflow: 'hidden', alignSelf: 'flex-start' },
  newObservationGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
  },
  newObservationText: { color: '#FFF', fontSize: 14, fontWeight: '800' },
  metricsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  metricCard: { flex: 1, paddingVertical: 12, paddingHorizontal: 8, alignItems: 'center' },
  metricNumber: { fontSize: 20, fontWeight: '800' },
  metricLabel: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  cockpitCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    marginBottom: 14,
  },
  cockpitIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cockpitTitle: { fontSize: 14, fontWeight: '800' },
  cockpitSub: { fontSize: 12, marginTop: 2, lineHeight: 16 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 12,
  },
  searchInput: { flex: 1, fontSize: 14, outlineStyle: 'none' } as any,
  categoryChipsScroll: { paddingBottom: 14, paddingRight: 8 },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 12,
    paddingRight: 8,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
  categoryChipText: { fontSize: 12 },
  countPill: { borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1 },
  countPillText: { fontSize: 10, fontWeight: '700' },
  loadingContainer: { paddingVertical: 48, alignItems: 'center', gap: 12 },
  loadingText: { fontSize: 13 },
  emptyCard: { padding: 28, alignItems: 'center', justifyContent: 'center' },
  emptyIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  emptySubtitle: { fontSize: 13, textAlign: 'center', marginTop: 8, lineHeight: 19, maxWidth: 420 },
  emptyCta: { marginTop: 16, borderRadius: 16, overflow: 'hidden' },
  retryBtn: { marginTop: 16, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
  retryBtnText: { color: '#FFF', fontWeight: '800' },
  promptHeading: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6, marginTop: 20, marginBottom: 10 },
  promptGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  promptCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
  },
  promptCardText: { fontSize: 13, fontWeight: '700' },
  feed: { gap: 8 },
  groupBlock: { gap: 10, marginBottom: 8 },
  groupLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.7, textTransform: 'uppercase', marginLeft: 4 },
  anecdoteCard: { padding: 0, overflow: 'hidden', flexDirection: 'row' },
  severityRail: { width: 4 },
  anecdoteBody: { flex: 1, padding: 14 },
  anecdoteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    gap: 8,
  },
  studentTouch: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  studentName: { fontSize: 14, fontWeight: '800' },
  studentMeta: { fontSize: 11, marginTop: 2 },
  severityBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  severityBadgeText: { fontSize: 11, fontWeight: '800' },
  observationText: { fontSize: 14, lineHeight: 21, marginBottom: 4 },
  readMore: { fontSize: 12, fontWeight: '700', marginBottom: 8 },
  badgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6, marginBottom: 10 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeText: { fontSize: 11, fontWeight: '600' },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
  },
  footerActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  footerActionText: { fontSize: 12, fontWeight: '700' },
  fab: {
    position: 'absolute',
    right: 18,
    bottom: 22,
    borderRadius: 28,
    overflow: 'hidden',
    shadowColor: '#4338CA',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  fabGradient: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  timelineOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  timelineSheet: {
    height: '82%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  timelineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  timelineHeaderTitle: { fontSize: 18, fontWeight: '800' },
  timelineHeaderSub: { fontSize: 12, marginTop: 2 },
  closeTimelineBtn: { padding: 6 },
});
