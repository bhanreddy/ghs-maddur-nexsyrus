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
  Modal,
  Alert,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import AdminHeader from '../../../src/components/AdminHeader';
import { useTheme } from '../../../src/hooks/useTheme';
import {
  contentService,
  ContentItemDetail,
  ContentMetricsResponse,
  DailyFeedResponse,
  ContentType,
  ContentStatus,
} from '../../../src/services/contentService';
import * as Haptics from '../../../src/utils/haptics';

type TabKey = 'HUB' | 'THOUGHTS' | 'NEWS' | 'DRAFTS' | 'APPROVALS' | 'SCHEDULED' | 'PUBLISHED' | 'ARCHIVE' | 'ANALYTICS';

export default function AdminContentScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= 900;

  const [activeTab, setActiveTab] = useState<TabKey>('HUB');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Data states
  const [dailyFeed, setDailyFeed] = useState<DailyFeedResponse | null>(null);
  const [metrics, setMetrics] = useState<ContentMetricsResponse | null>(null);
  const [items, setItems] = useState<ContentItemDetail[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Rejection modal
  const [rejectModalItem, setRejectModalItem] = useState<ContentItemDetail | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [feedRes, metricsRes] = await Promise.all([
        contentService.getDailyFeed({ forceFresh: true }).catch(() => null),
        contentService.getAdminMetrics().catch(() => null),
      ]);
      setDailyFeed(feedRes);
      setMetrics(metricsRes);

      // Load specific list based on tab
      let typeFilter: ContentType | undefined = undefined;
      let statusFilter: ContentStatus | undefined = undefined;

      if (activeTab === 'THOUGHTS') {
        typeFilter = 'THOUGHT';
      } else if (activeTab === 'NEWS') {
        typeFilter = 'NEWS';
      } else if (activeTab === 'APPROVALS') {
        statusFilter = 'SUBMITTED';
      } else if (activeTab === 'DRAFTS') {
        statusFilter = 'DRAFT';
      } else if (activeTab === 'PUBLISHED') {
        statusFilter = 'PUBLISHED';
      } else if (activeTab === 'SCHEDULED') {
        statusFilter = 'SCHEDULED';
      } else if (activeTab === 'ARCHIVE') {
        statusFilter = 'ARCHIVED';
      }

      if (activeTab !== 'HUB' && activeTab !== 'ANALYTICS') {
        const listRes = await contentService.listContent({
          type: typeFilter,
          status: statusFilter,
          search: searchQuery || undefined,
          limit: 50,
        });
        setItems(listRes.items || []);
      }
    } catch {
      // Handled
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTab, searchQuery]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void loadData();
  }, [loadData]);

  // Content Actions
  const handlePublishNow = async (item: ContentItemDetail) => {
    try {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setActionLoading(true);
      await contentService.publishContent(item.id);
      Alert.alert('Published', `"${item.title}" is now live for eligible users.`);
      void loadData();
    } catch (err: any) {
      Alert.alert('Publish Failed', err.message || 'An error occurred');
    } finally {
      setActionLoading(false);
    }
  };

  const handleApprove = async (item: ContentItemDetail) => {
    try {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setActionLoading(true);
      await contentService.approveContent(item.id);
      Alert.alert('Approved', `"${item.title}" has been approved.`);
      void loadData();
    } catch (err: any) {
      Alert.alert('Approval Failed', err.message || 'An error occurred');
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmReject = async () => {
    if (!rejectModalItem) return;
    if (!rejectionReason.trim()) {
      Alert.alert('Reason Required', 'Please provide a reason for rejecting this content.');
      return;
    }
    try {
      setActionLoading(true);
      await contentService.rejectContent(rejectModalItem.id, rejectionReason.trim());
      setRejectModalItem(null);
      setRejectionReason('');
      Alert.alert('Rejected', 'Content has been returned to the author with feedback.');
      void loadData();
    } catch (err: any) {
      Alert.alert('Rejection Failed', err.message || 'An error occurred');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnpublish = async (item: ContentItemDetail) => {
    try {
      setActionLoading(true);
      await contentService.unpublishContent(item.id);
      Alert.alert('Unpublished', `"${item.title}" is no longer in today's edition.`);
      void loadData();
    } catch (err: any) {
      Alert.alert('Unpublish Failed', err.message || 'An error occurred');
    } finally {
      setActionLoading(false);
    }
  };

  const handleArchive = async (item: ContentItemDetail) => {
    try {
      setActionLoading(true);
      await contentService.archiveContent(item.id);
      Alert.alert('Archived', 'Content moved to archive.');
      void loadData();
    } catch (err: any) {
      Alert.alert('Archive Failed', err.message || 'An error occurred');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (item: ContentItemDetail) => {
    Alert.alert(
      'Delete Content',
      `Are you sure you want to delete "${item.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setActionLoading(true);
              await contentService.deleteContent(item.id);
              void loadData();
            } catch (err: any) {
              Alert.alert('Delete Failed', err.message || 'An error occurred');
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PUBLISHED':
        return { bg: '#DCFCE7', text: '#15803D' };
      case 'APPROVED':
        return { bg: '#DBEAFE', text: '#1D4ED8' };
      case 'SCHEDULED':
        return { bg: '#FEF3C7', text: '#B45309' };
      case 'SUBMITTED':
      case 'UNDER_REVIEW':
        return { bg: '#EDE9FE', text: '#6D28D9' };
      case 'REJECTED':
        return { bg: '#FEE2E2', text: '#B91C1C' };
      case 'ARCHIVED':
        return { bg: '#F1F5F9', text: '#475569' };
      default:
        return { bg: '#E2E8F0', text: '#334155' };
    }
  };

  return (
    <View style={[styles.root, isDark ? styles.rootDark : styles.rootLight]}>
      <TourTarget id="screen.admin-content.overview"><AdminHeader
        title="Content Engine"
        showBackButton={true}
        rightAction={{
          icon: 'add-circle-outline',
          onPress: () => router.push('/admin/content/editor?type=NEWS' as any),
        }}
      /></TourTarget>

      {/* Top Banner & Quick Action Buttons */}
      <View style={styles.topBar}>
        <View style={styles.topInfo}>
          <Text style={[styles.pageTitle, isDark ? styles.textDark : styles.textLight]}>
            Daily Editorial & Publishing
          </Text>
          <Text style={styles.pageSubtitle}>
            Curate calm morning thoughts and verified educational news across the campus.
          </Text>
        </View>
        <View style={styles.createButtonsRow}>
          <TouchableOpacity
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/admin/content/editor?type=THOUGHT' as any);
            }}
            style={[styles.createBtn, styles.createThoughtBtn]}
          >
            <Ionicons name="bulb-outline" size={16} color="#FFFFFF" />
            <Text style={styles.createBtnText}>New Thought</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/admin/content/editor?type=NEWS' as any);
            }}
            style={[styles.createBtn, styles.createNewsBtn]}
          >
            <Ionicons name="newspaper-outline" size={16} color="#FFFFFF" />
            <Text style={styles.createBtnText}>New Story</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Navigation Tabs */}
      <TourTarget id="screen.admin-content.workspace" native><TourScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabScroll}
        style={styles.tabContainer}
      >
        {(
          [
            { key: 'HUB', label: "Today's Hub", icon: 'today-outline' },
            { key: 'THOUGHTS', label: 'Daily Thoughts', icon: 'bulb-outline' },
            { key: 'NEWS', label: 'Daily News', icon: 'newspaper-outline' },
            { key: 'DRAFTS', label: 'Drafts', icon: 'create-outline' },
            {
              key: 'APPROVALS',
              label: 'Approvals Queue',
              icon: 'checkmark-done-circle-outline',
              badge: metrics?.pending_approvals,
            },
            {
              key: 'SCHEDULED',
              label: 'Scheduled',
              icon: 'time-outline',
              badge: metrics?.scheduled_count,
            },
            { key: 'PUBLISHED', label: 'Published', icon: 'checkmark-circle-outline' },
            { key: 'ARCHIVE', label: 'Archive', icon: 'archive-outline' },
            { key: 'ANALYTICS', label: 'Analytics', icon: 'analytics-outline' },
          ] as Array<{ key: TabKey; label: string; icon: any; badge?: number }>
        ).map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setActiveTab(tab.key);
              }}
              style={[
                styles.tabItem,
                isActive && styles.activeTabItem,
                !isActive && (isDark ? styles.tabDark : styles.tabLight),
              ]}
            >
              <Ionicons
                name={tab.icon}
                size={16}
                color={isActive ? '#FFFFFF' : isDark ? '#94A3B8' : '#475569'}
              />
              <Text
                style={[
                  styles.tabLabel,
                  isActive && styles.activeTabLabel,
                  !isActive && (isDark ? styles.tabLabelDark : styles.tabLabelLight),
                ]}
              >
                {tab.label}
              </Text>
              {Boolean(tab.badge && tab.badge > 0) && (
                <View style={[styles.tabBadge, isActive ? styles.activeTabBadge : null]}>
                  <Text style={styles.tabBadgeText}>{tab.badge}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </TourScrollView></TourTarget>

      {/* Main Body */}
      <TourScrollView
        style={styles.mainScroll}
        contentContainerStyle={styles.scrollPadding}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6D28D9" />
        }
      >
        {loading ? (
          <View style={styles.centerLoader}>
            <ActivityIndicator size="large" color="#6D28D9" />
            <Text style={styles.loaderText}>Loading content records...</Text>
          </View>
        ) : activeTab === 'HUB' ? (
          /* TODAY'S HUB VIEW */
          <View style={styles.hubContainer}>
            {/* KPI Metric Cards */}
            <View style={styles.kpiGrid}>
              <View style={[styles.kpiCard, isDark ? styles.cardDark : styles.cardLight]}>
                <View style={[styles.kpiIconWrap, { backgroundColor: '#EDE9FE' }]}>
                  <Ionicons name="newspaper" size={20} color="#6D28D9" />
                </View>
                <Text style={styles.kpiValue}>{metrics?.total_published ?? 0}</Text>
                <Text style={styles.kpiLabel}>Live Content Items</Text>
              </View>

              <View style={[styles.kpiCard, isDark ? styles.cardDark : styles.cardLight]}>
                <View style={[styles.kpiIconWrap, { backgroundColor: '#DBEAFE' }]}>
                  <Ionicons name="eye" size={20} color="#2563EB" />
                </View>
                <Text style={styles.kpiValue}>{metrics?.total_views ?? 0}</Text>
                <Text style={styles.kpiLabel}>Total Article Views</Text>
              </View>

              <View style={[styles.kpiCard, isDark ? styles.cardDark : styles.cardLight]}>
                <View style={[styles.kpiIconWrap, { backgroundColor: '#FEE2E2' }]}>
                  <Ionicons name="heart" size={20} color="#DC2626" />
                </View>
                <Text style={styles.kpiValue}>{metrics?.total_likes ?? 0}</Text>
                <Text style={styles.kpiLabel}>Student Likes</Text>
              </View>

              <View style={[styles.kpiCard, isDark ? styles.cardDark : styles.cardLight]}>
                <View style={[styles.kpiIconWrap, { backgroundColor: '#FEF3C7' }]}>
                  <Ionicons name="bookmark" size={20} color="#D97706" />
                </View>
                <Text style={styles.kpiValue}>{metrics?.total_bookmarks ?? 0}</Text>
                <Text style={styles.kpiLabel}>Saved Bookmarks</Text>
              </View>
            </View>

            {/* Today's Live Slots */}
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionTitle, isDark ? styles.textDark : styles.textLight]}>
                Today's Active Edition
              </Text>
              <TouchableOpacity
                onPress={() => router.push('/Screen/schoolDaily' as any)}
                style={styles.previewBtn}
              >
                <Ionicons name="phone-portrait-outline" size={14} color="#6D28D9" />
                <Text style={styles.previewBtnText}>Open Mobile App View</Text>
              </TouchableOpacity>
            </View>

            {/* Active Thought Card */}
            <View style={[styles.hubSlotCard, isDark ? styles.cardDark : styles.cardLight]}>
              <View style={styles.slotHeader}>
                <View style={styles.slotTagRow}>
                  <View style={[styles.slotBadge, { backgroundColor: '#F5F3FF' }]}>
                    <Ionicons name="bulb" size={12} color="#7C3AED" />
                    <Text style={styles.slotBadgeText}>TODAY'S THOUGHT</Text>
                  </View>
                  {dailyFeed?.thought ? (
                    <View style={[styles.statusPill, { backgroundColor: '#DCFCE7' }]}>
                      <Text style={[styles.statusText, { color: '#15803D' }]}>LIVE</Text>
                    </View>
                  ) : (
                    <View style={[styles.statusPill, { backgroundColor: '#FEE2E2' }]}>
                      <Text style={[styles.statusText, { color: '#B91C1C' }]}>SLOT EMPTY</Text>
                    </View>
                  )}
                </View>
                {dailyFeed?.thought && (
                  <TouchableOpacity
                    onPress={() =>
                      router.push(`/admin/content/editor?id=${dailyFeed.thought!.id}` as any)
                    }
                    style={styles.editLink}
                  >
                    <Ionicons name="pencil-outline" size={15} color="#6D28D9" />
                    <Text style={styles.editLinkText}>Edit</Text>
                  </TouchableOpacity>
                )}
              </View>

              {dailyFeed?.thought ? (
                <View style={styles.slotContent}>
                  <Text style={[styles.hubQuote, isDark ? styles.textDark : styles.textLight]}>
                    "{dailyFeed.thought.quote}"
                  </Text>
                  <Text style={styles.hubAuthor}>
                    — {dailyFeed.thought.author}{' '}
                    {dailyFeed.thought.author_description
                      ? `(${dailyFeed.thought.author_description})`
                      : ''}
                  </Text>
                </View>
              ) : (
                <View style={styles.slotEmpty}>
                  <Text style={styles.slotEmptyText}>
                    No thought scheduled or published for today.
                  </Text>
                  <TouchableOpacity
                    onPress={() => router.push('/admin/content/editor?type=THOUGHT' as any)}
                    style={styles.slotActionBtn}
                  >
                    <Text style={styles.slotActionBtnText}>Set Today's Thought</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Active News Stories List */}
            <View style={[styles.hubSlotCard, isDark ? styles.cardDark : styles.cardLight]}>
              <View style={styles.slotHeader}>
                <View style={styles.slotTagRow}>
                  <View style={[styles.slotBadge, { backgroundColor: '#EFF6FF' }]}>
                    <Ionicons name="newspaper" size={12} color="#2563EB" />
                    <Text style={[styles.slotBadgeText, { color: '#1D4ED8' }]}>
                      TODAY'S NEWS ({dailyFeed?.news?.length || 0})
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={() => router.push('/admin/content/editor?type=NEWS' as any)}
                  style={styles.editLink}
                >
                  <Ionicons name="add-circle-outline" size={15} color="#2563EB" />
                  <Text style={[styles.editLinkText, { color: '#2563EB' }]}>Add Story</Text>
                </TouchableOpacity>
              </View>

              {dailyFeed?.news && dailyFeed.news.length > 0 ? (
                dailyFeed.news.map((n, idx) => (
                  <View
                    key={n.id}
                    style={[
                      styles.hubNewsRow,
                      idx < dailyFeed.news.length - 1 && styles.borderBottom,
                    ]}
                  >
                    <View style={styles.hubNewsInfo}>
                      <View style={styles.categoryPill}>
                        <Text style={styles.categoryPillText}>{n.category || 'News'}</Text>
                      </View>
                      <Text
                        style={[styles.hubNewsTitle, isDark ? styles.textDark : styles.textLight]}
                        numberOfLines={1}
                      >
                        {n.headline || n.title}
                      </Text>
                      <Text style={styles.hubNewsMeta}>
                        {n.source_name || 'School Desk'} • {n.view_count ?? (n as any).views_count ?? 0} views •{' '}
                        {n.reading_time || 2} min read
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => router.push(`/admin/content/editor?id=${n.id}` as any)}
                      style={styles.editRowBtn}
                    >
                      <Ionicons name="create-outline" size={16} color="#6D28D9" />
                    </TouchableOpacity>
                  </View>
                ))
              ) : (
                <View style={styles.slotEmpty}>
                  <Text style={styles.slotEmptyText}>No news stories published for today yet.</Text>
                  <TouchableOpacity
                    onPress={() => router.push('/admin/content/editor?type=NEWS' as any)}
                    style={[styles.slotActionBtn, { backgroundColor: '#2563EB' }]}
                  >
                    <Text style={styles.slotActionBtnText}>Create News Story</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        ) : activeTab === 'ANALYTICS' ? (
          /* ANALYTICS VIEW */
          <View style={styles.analyticsContainer}>
            <View style={styles.kpiGrid}>
              <View style={[styles.kpiCard, isDark ? styles.cardDark : styles.cardLight]}>
                <Text style={styles.kpiValue}>{metrics?.total_views ?? 0}</Text>
                <Text style={styles.kpiLabel}>Total Views</Text>
              </View>
              <View style={[styles.kpiCard, isDark ? styles.cardDark : styles.cardLight]}>
                <Text style={styles.kpiValue}>{metrics?.unique_viewers ?? 0}</Text>
                <Text style={styles.kpiLabel}>Unique Viewers</Text>
              </View>
              <View style={[styles.kpiCard, isDark ? styles.cardDark : styles.cardLight]}>
                <Text style={styles.kpiValue}>{metrics?.total_likes ?? 0}</Text>
                <Text style={styles.kpiLabel}>Likes</Text>
              </View>
              <View style={[styles.kpiCard, isDark ? styles.cardDark : styles.cardLight]}>
                <Text style={styles.kpiValue}>{metrics?.total_bookmarks ?? 0}</Text>
                <Text style={styles.kpiLabel}>Bookmarks</Text>
              </View>
            </View>

            <View style={[styles.analyticsCard, isDark ? styles.cardDark : styles.cardLight]}>
              <Text style={[styles.sectionTitle, isDark ? styles.textDark : styles.textLight]}>
                Popular News Categories
              </Text>
              {metrics?.popular_categories && metrics.popular_categories.length > 0 ? (
                metrics.popular_categories.map((cat: { category: string; count: any }) => (
                  <View key={cat.category} style={styles.catProgressRow}>
                    <View style={styles.catLabelRow}>
                      <Text
                        style={[styles.catName, isDark ? styles.textDark : styles.textLight]}
                      >
                        {cat.category || 'General'}
                      </Text>
                      <Text style={styles.catCount}>{cat.count} articles</Text>
                    </View>
                    <View style={styles.progressBarBg}>
                      <View
                        style={[
                          styles.progressBarFill,
                          {
                            width: `${Math.min(
                              100,
                              Math.round(
                                (Number(cat.count) /
                                  Math.max(1, Number(metrics?.total_published || 1))) *
                                  100
                              )
                            )}%`,
                          },
                        ]}
                      />
                    </View>
                  </View>
                ))
              ) : (
                <Text style={styles.slotEmptyText}>No category engagement recorded yet.</Text>
              )}
            </View>
          </View>
        ) : (
          /* LIST VIEWS (THOUGHTS, NEWS, APPROVALS, SCHEDULED, ARCHIVE) */
          <View style={styles.listContainer}>
            {/* Search Bar */}
            <View style={[styles.searchBar, isDark ? styles.searchDark : styles.searchLight]}>
              <Ionicons name="search-outline" size={18} color="#94A3B8" />
              <TextInput
                style={[styles.searchInput, isDark ? styles.textDark : styles.textLight]}
                placeholder="Search by title, author, or keyword..."
                placeholderTextColor="#94A3B8"
                value={searchQuery}
                onChangeText={setSearchQuery}
                onSubmitEditing={() => loadData()}
              />
              {Boolean(searchQuery) && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Ionicons name="close-circle" size={18} color="#94A3B8" />
                </TouchableOpacity>
              )}
            </View>

            {items.length > 0 ? (
              items.map((item) => {
                const statusStyle = getStatusColor(item.status);
                return (
                  <View
                    key={item.id}
                    style={[styles.contentRowCard, isDark ? styles.cardDark : styles.cardLight]}
                  >
                    <View style={styles.rowMain}>
                      <View style={styles.rowBadgeLine}>
                        <View
                          style={[styles.typeBadge, { backgroundColor: item.type === 'THOUGHT' ? '#F5F3FF' : '#EFF6FF' }]}
                        >
                          <Text
                            style={[
                              styles.typeBadgeText,
                              { color: item.type === 'THOUGHT' ? '#7C3AED' : '#2563EB' },
                            ]}
                          >
                            {item.type}
                          </Text>
                        </View>
                        <View style={[styles.statusPill, { backgroundColor: statusStyle.bg }]}>
                          <Text style={[styles.statusText, { color: statusStyle.text }]}>
                            {item.status}
                          </Text>
                        </View>
                        {item.is_featured && (
                          <View style={[styles.statusPill, { backgroundColor: '#FEF3C7' }]}>
                            <Text style={[styles.statusText, { color: '#B45309' }]}>FEATURED</Text>
                          </View>
                        )}
                        <Text style={styles.rowDate}>
                          {item.published_at
                            ? `Published: ${new Date(item.published_at).toLocaleDateString()}`
                            : item.scheduled_at
                            ? `Scheduled: ${new Date(item.scheduled_at).toLocaleString()}`
                            : `Created: ${new Date(item.created_at).toLocaleDateString()}`}
                        </Text>
                      </View>

                      <Text
                        style={[styles.rowTitle, isDark ? styles.textDark : styles.textLight]}
                        numberOfLines={2}
                      >
                        {item.title}
                      </Text>

                      {item.summary ? (
                        <Text style={styles.rowSummary} numberOfLines={2}>
                          {item.summary}
                        </Text>
                      ) : null}

                      {item.rejection_reason && (
                        <View style={styles.rejectionNotice}>
                          <Ionicons name="alert-circle-outline" size={14} color="#DC2626" />
                          <Text style={styles.rejectionNoticeText}>
                            Rejection Note: {item.rejection_reason}
                          </Text>
                        </View>
                      )}
                    </View>

                    {/* Action Buttons */}
                    <View style={styles.rowActions}>
                      <TouchableOpacity
                        onPress={() => router.push(`/admin/content/editor?id=${item.id}` as any)}
                        style={styles.actionPill}
                      >
                        <Ionicons name="pencil" size={14} color="#6D28D9" />
                        <Text style={styles.actionPillText}>Edit</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() => router.push(`/admin/content/versions?id=${item.id}` as any)}
                        style={styles.actionPill}
                      >
                        <Ionicons name="git-branch-outline" size={14} color="#475569" />
                        <Text style={[styles.actionPillText, { color: '#475569' }]}>History</Text>
                      </TouchableOpacity>

                      {item.status === 'SUBMITTED' && (
                        <>
                          <TouchableOpacity
                            onPress={() => handleApprove(item)}
                            style={[styles.actionPill, { backgroundColor: '#DCFCE7' }]}
                          >
                            <Ionicons name="checkmark" size={14} color="#15803D" />
                            <Text style={[styles.actionPillText, { color: '#15803D' }]}>Approve</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            onPress={() => setRejectModalItem(item)}
                            style={[styles.actionPill, { backgroundColor: '#FEE2E2' }]}
                          >
                            <Ionicons name="close" size={14} color="#B91C1C" />
                            <Text style={[styles.actionPillText, { color: '#B91C1C' }]}>Reject</Text>
                          </TouchableOpacity>
                        </>
                      )}

                      {(item.status === 'APPROVED' || item.status === 'SCHEDULED' || item.status === 'DRAFT') && (
                        <TouchableOpacity
                          onPress={() => handlePublishNow(item)}
                          style={[styles.actionPill, { backgroundColor: '#6D28D9' }]}
                        >
                          <Ionicons name="paper-plane" size={14} color="#FFFFFF" />
                          <Text style={[styles.actionPillText, { color: '#FFFFFF' }]}>Publish</Text>
                        </TouchableOpacity>
                      )}

                      {item.status === 'PUBLISHED' && (
                        <>
                          <TouchableOpacity
                            onPress={() => handleUnpublish(item)}
                            style={styles.actionPill}
                          >
                            <Ionicons name="eye-off-outline" size={14} color="#B45309" />
                            <Text style={[styles.actionPillText, { color: '#B45309' }]}>Unpublish</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => handleArchive(item)}
                            style={styles.actionPill}
                          >
                            <Ionicons name="archive-outline" size={14} color="#64748B" />
                            <Text style={[styles.actionPillText, { color: '#64748B' }]}>Archive</Text>
                          </TouchableOpacity>
                        </>
                      )}

                      <TouchableOpacity
                        onPress={() => handleDelete(item)}
                        style={[styles.actionPill, { backgroundColor: '#FEE2E2' }]}
                      >
                        <Ionicons name="trash-outline" size={14} color="#DC2626" />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            ) : (
              <View style={styles.centerLoader}>
                <Ionicons name="file-tray-outline" size={48} color="#94A3B8" />
                <Text style={[styles.emptyTitle, isDark ? styles.textDark : styles.textLight]}>
                  No content found
                </Text>
                <Text style={styles.emptySubtitle}>
                  Try clearing search filters or create a new edition item above.
                </Text>
              </View>
            )}
          </View>
        )}
      </TourScrollView>

      {/* Rejection Modal */}
      <Modal visible={Boolean(rejectModalItem)} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, isDark ? styles.modalDark : styles.modalLight]}>
            <View style={styles.modalHeader}>
              <Ionicons name="alert-circle-outline" size={24} color="#DC2626" />
              <Text style={[styles.modalTitle, isDark ? styles.textDark : styles.textLight]}>
                Reject Content Submission
              </Text>
            </View>

            <Text style={styles.modalPrompt}>
              Provide specific editorial feedback for "{rejectModalItem?.title}". The author will be
              able to make revisions and resubmit.
            </Text>

            <TextInput
              style={[styles.modalInput, isDark ? styles.inputDark : styles.inputLight]}
              placeholder="e.g. Please verify the quote author, fix typo in summary..."
              placeholderTextColor="#94A3B8"
              multiline
              numberOfLines={4}
              value={rejectionReason}
              onChangeText={setRejectionReason}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                onPress={() => {
                  setRejectModalItem(null);
                  setRejectionReason('');
                }}
                style={styles.modalCancelBtn}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleConfirmReject}
                style={styles.modalRejectBtn}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalRejectText}>Return with Reason</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  rootLight: {
    backgroundColor: '#F8FAFC',
  },
  rootDark: {
    backgroundColor: '#0A0F1D',
  },
  topBar: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
  },
  topInfo: {
    flex: 1,
    minWidth: 250,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  pageSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  createButtonsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 6,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
      web: {
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
      },
    }),
  },
  createThoughtBtn: {
    backgroundColor: '#7C3AED',
  },
  createNewsBtn: {
    backgroundColor: '#2563EB',
  },
  createBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  tabContainer: {
    maxHeight: 52,
    marginTop: 10,
  },
  tabScroll: {
    paddingHorizontal: 20,
    gap: 8,
    alignItems: 'center',
  },
  tabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
    borderWidth: 1,
  },
  activeTabItem: {
    backgroundColor: '#6D28D9',
    borderColor: '#6D28D9',
  },
  tabLight: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
  },
  tabDark: {
    backgroundColor: '#1E293B',
    borderColor: '#334155',
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  activeTabLabel: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  tabLabelLight: {
    color: '#475569',
  },
  tabLabelDark: {
    color: '#94A3B8',
  },
  tabBadge: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  activeTabBadge: {
    backgroundColor: '#5B21B6',
  },
  tabBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  mainScroll: {
    flex: 1,
  },
  scrollPadding: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 60,
  },
  centerLoader: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  loaderText: {
    marginTop: 10,
    color: '#64748B',
    fontSize: 13,
  },
  hubContainer: {
    gap: 16,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  kpiCard: {
    flex: 1,
    minWidth: 140,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  kpiIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  kpiValue: {
    fontSize: 24,
    fontWeight: '800',
    color: '#6D28D9',
    letterSpacing: -0.5,
  },
  kpiLabel: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '500',
  },
  cardLight: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
  },
  cardDark: {
    backgroundColor: '#151D30',
    borderColor: '#1E293B',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  previewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  previewBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6D28D9',
  },
  hubSlotCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
  },
  slotHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  slotTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  slotBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  slotBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#7C3AED',
    letterSpacing: 0.5,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '800',
  },
  editLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  editLinkText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6D28D9',
  },
  slotContent: {
    marginTop: 4,
  },
  hubQuote: {
    fontSize: 16,
    fontStyle: 'italic',
    lineHeight: 24,
    fontWeight: '500',
  },
  hubAuthor: {
    fontSize: 12,
    color: '#7C3AED',
    fontWeight: '600',
    marginTop: 8,
  },
  slotEmpty: {
    paddingVertical: 14,
    alignItems: 'flex-start',
    gap: 8,
  },
  slotEmptyText: {
    fontSize: 13,
    color: '#94A3B8',
  },
  slotActionBtn: {
    backgroundColor: '#7C3AED',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  slotActionBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  hubNewsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  borderBottom: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  hubNewsInfo: {
    flex: 1,
    marginRight: 10,
  },
  categoryPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#EDE9FE',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginBottom: 4,
  },
  categoryPillText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#6D28D9',
    textTransform: 'uppercase',
  },
  hubNewsTitle: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  hubNewsMeta: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  editRowBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#F5F3FF',
  },
  listContainer: {
    gap: 12,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 4,
    gap: 8,
  },
  searchLight: {
    backgroundColor: '#FFFFFF',
    borderColor: '#CBD5E1',
  },
  searchDark: {
    backgroundColor: '#151D30',
    borderColor: '#1E293B',
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
  },
  contentRowCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
  },
  rowMain: {
    flex: 1,
    minWidth: 260,
  },
  rowBadgeLine: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  typeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  rowDate: {
    fontSize: 11,
    color: '#94A3B8',
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 21,
  },
  rowSummary: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 4,
    lineHeight: 18,
  },
  rejectionNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 6,
    marginTop: 8,
  },
  rejectionNoticeText: {
    fontSize: 11,
    color: '#DC2626',
    fontWeight: '600',
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  actionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  actionPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6D28D9',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 10,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 4,
    textAlign: 'center',
  },
  analyticsContainer: {
    gap: 16,
  },
  analyticsCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
  },
  catProgressRow: {
    marginTop: 12,
  },
  catLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  catName: {
    fontSize: 13,
    fontWeight: '600',
  },
  catCount: {
    fontSize: 12,
    color: '#64748B',
  },
  progressBarBg: {
    height: 8,
    backgroundColor: '#E2E8F0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#6D28D9',
    borderRadius: 4,
  },
  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 480,
    borderRadius: 18,
    padding: 20,
  },
  modalLight: {
    backgroundColor: '#FFFFFF',
  },
  modalDark: {
    backgroundColor: '#1E293B',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  modalPrompt: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
    marginBottom: 12,
  },
  modalInput: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    fontSize: 13,
    textAlignVertical: 'top',
    height: 90,
  },
  inputLight: {
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
    color: '#0F172A',
  },
  inputDark: {
    borderColor: '#475569',
    backgroundColor: '#0F172A',
    color: '#F8FAFC',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 16,
  },
  modalCancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  modalCancelText: {
    color: '#64748B',
    fontWeight: '600',
    fontSize: 13,
  },
  modalRejectBtn: {
    backgroundColor: '#DC2626',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  modalRejectText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  textLight: {
    color: '#0F172A',
  },
  textDark: {
    color: '#F8FAFC',
  },
});
