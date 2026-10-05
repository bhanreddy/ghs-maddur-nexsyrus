import { TourTarget, TourScrollView } from '@/src/features/app-tour';
import React, { useState, useEffect, useCallback, useMemo, useSyncExternalStore } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Modal,
  Image,
  Share,
  Platform,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { readAloudService } from '../../src/services/readAloudService';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import ScreenLayout from '../../src/components/ScreenLayout';
import StudentHeader from '../../src/components/StudentHeader';
import {
  contentService,
  DailyFeedResponse,
  ContentNewsDetail,
  ContentThoughtDetail,
} from '../../src/services/contentService';
import { ThoughtCard } from '../../src/components/content/ThoughtCard';
import { NewsCard } from '../../src/components/content/NewsCard';
import { DailyFeedSkeleton } from '../../src/components/content/DailyFeedSkeleton';
import { clayTokens } from '../../src/styles/clayTokens';
import { useAuth } from '../../src/hooks/useAuth';
import { useTheme } from '../../src/hooks/useTheme';
import { useTranslation } from 'react-i18next';
import * as Haptics from '../../src/utils/haptics';

const NEWS_CATEGORIES = [
  'All',
  'Campus',
  'Education',
  'Science',
  'Technology',
  'Sports',
  'Environment',
  'National',
  'International',
];

export default function SchoolDailyScreen() {
  const { isDark } = useTheme();
  const { user } = useAuth();
  const { t } = useTranslation();
  const feedUserId = user?.userId || user?.id;

  const [activeTab, setActiveTab] = useState<'feed' | 'saved'>('feed');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [feed, setFeed] = useState<DailyFeedResponse | null>(null);
  const [savedArticles, setSavedArticles] = useState<ContentNewsDetail[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [isOfflineCached, setIsOfflineCached] = useState<boolean>(false);
  const [cachedTimeAgo, setCachedTimeAgo] = useState<string>('');

  // Reader Modal State
  const [selectedArticle, setSelectedArticle] = useState<ContentNewsDetail | null>(null);
  const articleAudioId = `school-daily:${selectedArticle?.id ?? 'none'}`;
  const audio = useSyncExternalStore(readAloudService.subscribe, readAloudService.getSnapshot, readAloudService.getSnapshot);
  const isSpeaking = audio.activeId === articleAudioId && audio.status !== 'idle';
  useEffect(() => () => { void readAloudService.stop(articleAudioId); }, [articleAudioId]);
  const [articleLiked, setArticleLiked] = useState<boolean>(false);
  const [articleBookmarked, setArticleBookmarked] = useState<boolean>(false);

  // Initial load
  const loadFeed = useCallback(async (forceFresh: boolean = false) => {
    try {
      if (!forceFresh) setLoading(true);
      const data = await contentService.getDailyFeed({
        userId: feedUserId || undefined,
        forceFresh,
      });
      if (data) {
        setFeed(data);
        if (data.metadata?.cachedAt) {
          const diffMinutes = Math.floor(
            (Date.now() - new Date(data.metadata.cachedAt).getTime()) / 60000
          );
          if (diffMinutes > 1) {
            setIsOfflineCached(true);
            setCachedTimeAgo(`${diffMinutes}m ago`);
          } else {
            setIsOfflineCached(false);
          }
        } else {
          setIsOfflineCached(false);
        }
      }
    } catch {
      // Offline fallback is handled inside getDailyFeed
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [feedUserId]);

  const loadSaved = useCallback(async () => {
    try {
      const items = await contentService.getUserBookmarks();
      // Map bookmark items to news items
      const newsItems: ContentNewsDetail[] = items
        .filter((b: any) => b.type === 'NEWS')
        .map((b: any) => ({
          ...b,
          type: 'NEWS',
          headline: b.headline || b.title,
          is_bookmarked: true,
        }));
      setSavedArticles(newsItems);
    } catch {
      // Fallback
    }
  }, []);

  useEffect(() => {
    void loadFeed();
  }, [loadFeed]);

  useEffect(() => {
    if (activeTab === 'saved') {
      void loadSaved();
    }
  }, [activeTab, loadSaved]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    if (activeTab === 'feed') {
      void loadFeed(true);
    } else {
      void loadSaved();
      setRefreshing(false);
    }
  }, [activeTab, loadFeed, loadSaved]);

  // Open News Reader
  const handleOpenArticle = useCallback(async (item: ContentNewsDetail) => {
    setSelectedArticle(item);
    setArticleLiked(false);
    setArticleBookmarked(Boolean(item.is_bookmarked));
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Track View Engagement
    void contentService.recordEngagement({
      contentId: item.id,
      eventType: 'VIEW',
    });
  }, []);

  // Audio Read Aloud
  const toggleSpeech = useCallback(() => {
    if (!selectedArticle) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    void readAloudService.toggle(articleAudioId, [selectedArticle.headline || selectedArticle.title, selectedArticle.summary, selectedArticle.body]);
  }, [articleAudioId, selectedArticle]);

  // Share Article
  const handleShare = useCallback(async (item: ContentNewsDetail) => {
    try {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await Share.share({
        title: item.headline || item.title,
        message: `${item.headline || item.title}\n\n${item.summary || ''}\n\nRead more on SchoolIMS Daily`,
        url: item.source_url || undefined,
      });
      void contentService.recordEngagement({
        contentId: item.id,
        eventType: 'SHARE',
      });
    } catch {
      // Ignore dismiss
    }
  }, []);

  // Like Article
  const handleLike = useCallback(async (item: ContentNewsDetail) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setArticleLiked((prev) => !prev);
    try {
      await contentService.toggleLike(item.id);
    } catch {
      void contentService.recordEngagement({
        contentId: item.id,
        eventType: 'LIKE',
      });
    }
  }, []);

  // Bookmark Toggle
  const handleBookmark = useCallback(async (item: ContentNewsDetail) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const nextState = !articleBookmarked;
    setArticleBookmarked(nextState);
    await contentService.toggleBookmark(item.id);
  }, [articleBookmarked]);

  // Filtered News Items
  const filteredNews = useMemo(() => {
    if (!feed?.news) return [];
    if (selectedCategory === 'All') return feed.news;
    return feed.news.filter(
      (n) => (n.category || '').toLowerCase() === selectedCategory.toLowerCase()
    );
  }, [feed?.news, selectedCategory]);

  const featuredItem = feed?.featured?.[0] || feed?.featuredNews?.[0];

  return (
    <ScreenLayout>
      <TourTarget id="screen.screen-school-daily.overview"><StudentHeader showBackButton={true} title={t('school_daily.title')} /></TourTarget>

      {/* Segmented Top Bar */}
      <TourTarget id="screen.screen-school-daily.workspace" native><View style={[styles.tabBar, isDark ? styles.tabBarDark : styles.tabBarLight]}>
        <TouchableOpacity
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setActiveTab('feed');
          }}
          style={[styles.tabButton, activeTab === 'feed' && styles.activeTabButton]}
        >
          <Ionicons
            name="newspaper-outline"
            size={16}
            color={activeTab === 'feed' ? clayTokens.colors.daily.newsAccent : isDark ? '#94A3B8' : '#64748B'}
          />
          <Text
            style={[
              styles.tabButtonText,
              activeTab === 'feed'
                ? styles.activeTabText
                : isDark
                ? styles.tabTextDark
                : styles.tabTextLight,
            ]}
          >
            {t('school_daily.todays_edition')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setActiveTab('saved');
          }}
          style={[styles.tabButton, activeTab === 'saved' && styles.activeTabButton]}
        >
          <Ionicons
            name="bookmark-outline"
            size={16}
            color={activeTab === 'saved' ? clayTokens.colors.daily.newsAccent : isDark ? '#94A3B8' : '#64748B'}
          />
          <Text
            style={[
              styles.tabButtonText,
              activeTab === 'saved'
                ? styles.activeTabText
                : isDark
                ? styles.tabTextDark
                : styles.tabTextLight,
            ]}
          >
            {t('school_daily.saved_stories')}
          </Text>
        </TouchableOpacity>
      </View></TourTarget>

      {/* Offline cached edition notice */}
      {isOfflineCached && (
        <View style={styles.offlinePill}>
          <Ionicons name="cloud-offline-outline" size={14} color="#D97706" />
          <Text style={styles.offlineText}>
            {t('school_daily.offline_edition')} • Cached {cachedTimeAgo}
          </Text>
        </View>
      )}

      {loading ? (
        <DailyFeedSkeleton />
      ) : activeTab === 'feed' ? (
        <TourScrollView
          style={styles.contentContainer}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={clayTokens.colors.daily.newsAccent}
              colors={[clayTokens.colors.daily.newsAccent]}
            />
          }
        >
          {/* Daily Date Header */}
          <View style={styles.editionHeader}>
            <Text style={styles.editionPre}>{t('school_daily.good_morning')}</Text>
            <Text style={[styles.editionDate, isDark ? styles.textDark : styles.textLight]}>
              {new Date().toLocaleDateString('en-GB', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
            </Text>
            <Text style={styles.editionKicker}>{t('school_daily.todays_kicker')}</Text>
          </View>

          {/* Today's Thought */}
          {feed?.thought ? (
            <Animated.View entering={FadeInDown.duration(280)}>
              <ThoughtCard thought={feed.thought} />
            </Animated.View>
          ) : (
            <View style={styles.emptyStateContainer}>
              <Ionicons name="sunny-outline" size={40} color={clayTokens.colors.daily.thoughtAccent} />
              <Text style={[styles.emptyTitle, isDark ? styles.textDark : styles.textLight]}>
                {t('school_daily.no_thought')}
              </Text>
              <Text style={styles.emptySubtitle}>
                {t('school_daily.empty_thought_help')}
              </Text>
            </View>
          )}

          {/* Category Filter Chips */}
          <View style={styles.categorySection}>
            <Text style={[styles.sectionTitle, isDark ? styles.textDark : styles.textLight]}>
              {t('school_daily.todays_stories')}
            </Text>
            <TourScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoryScroll}
            >
              {NEWS_CATEGORIES.map((cat) => {
                const isSelected = selectedCategory === cat;
                return (
                  <TouchableOpacity
                    key={cat}
                    onPress={() => {
                      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSelectedCategory(cat);
                    }}
                    style={[
                      styles.categoryChip,
                      isSelected && styles.activeCategoryChip,
                      !isSelected && (isDark ? styles.chipDark : styles.chipLight),
                    ]}
                  >
                    <Text
                      style={[
                        styles.categoryChipText,
                        isSelected && styles.activeChipText,
                        !isSelected && (isDark ? styles.chipTextDark : styles.chipTextLight),
                      ]}
                    >
                      {cat}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </TourScrollView>
          </View>

          {/* Featured Hero Story */}
          {selectedCategory === 'All' && featuredItem && (
            <Animated.View entering={FadeInDown.delay(100).duration(500)}>
              <NewsCard
                item={featuredItem}
                variant="hero"
                onPress={() => handleOpenArticle(featuredItem)}
              />
            </Animated.View>
          )}

          {/* Standard News Stories */}
          {filteredNews.length > 0 ? (
            filteredNews
              .filter((n) => (selectedCategory === 'All' && featuredItem ? n.id !== featuredItem.id : true))
              .map((item, index) => (
                <Animated.View
                  key={item.id}
                  entering={index < 6 ? FadeInDown.delay(80 + index * 40).duration(260) : undefined}
                >
                  <NewsCard
                    item={item}
                    variant="standard"
                    onPress={() => handleOpenArticle(item)}
                  />
                </Animated.View>
              ))
          ) : (
            <View style={styles.emptyStateContainer}>
              <Ionicons name="newspaper-outline" size={48} color="#94A3B8" />
              <Text style={[styles.emptyTitle, isDark ? styles.textDark : styles.textLight]}>
                {t('school_daily.no_news')}
              </Text>
              <Text style={styles.emptySubtitle}>
                {t('school_daily.empty_news_help')}
              </Text>
            </View>
          )}

          <View style={styles.bottomSpacer} />
        </TourScrollView>
      ) : (
        /* Saved Stories View */
        <TourScrollView
          style={styles.contentContainer}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={clayTokens.colors.daily.newsAccent}
              colors={[clayTokens.colors.daily.newsAccent]}
            />
          }
        >
          <View style={styles.editionHeader}>
            <Text style={styles.editionPre}>{t('school_daily.saved_stories')}</Text>
            <Text style={[styles.editionDate, isDark ? styles.textDark : styles.textLight]}>
              {t('school_daily.saved_stories')}
            </Text>
          </View>

          {savedArticles.length > 0 ? (
            savedArticles.map((item, index) => (
              <Animated.View key={item.id} entering={FadeInDown.delay(index * 50).duration(400)}>
                <NewsCard
                  item={item}
                  variant="standard"
                  onPress={() => handleOpenArticle(item)}
                />
              </Animated.View>
            ))
          ) : (
            <View style={styles.emptyStateContainer}>
              <Ionicons name="bookmark-outline" size={54} color="#CBD5E1" />
              <Text style={[styles.emptyTitle, isDark ? styles.textDark : styles.textLight]}>
                {t('school_daily.no_saved')}
              </Text>
              <Text style={styles.emptySubtitle}>
                Tap the bookmark icon on any story in Today's Edition to save it for offline reading.
              </Text>
            </View>
          )}

          <View style={styles.bottomSpacer} />
        </TourScrollView>
      )}

      {/* Reader Modal */}
      <Modal
        visible={Boolean(selectedArticle)}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          void readAloudService.stop(articleAudioId);

          setSelectedArticle(null);
        }}
      >
        {selectedArticle && (
          <View style={[styles.readerContainer, isDark ? styles.readerDark : styles.readerLight]}>
            {/* Modal Top Bar */}
            <View style={styles.readerHeader}>
              <TouchableOpacity
                onPress={() => {
                  void readAloudService.stop(articleAudioId);

                  setSelectedArticle(null);
                }}
                style={styles.readerCloseButton}
              >
                <Ionicons name="close" size={24} color={isDark ? '#F8FAFC' : '#1E293B'} />
              </TouchableOpacity>

              <View style={styles.readerActions}>
                {/* Audio Read-aloud */}
                <TouchableOpacity onPress={toggleSpeech} style={styles.readerIconBtn}>
                  <Ionicons
                    name={isSpeaking ? 'volume-high' : 'volume-medium-outline'}
                    size={22}
                    color={isSpeaking ? '#2C68B0' : isDark ? '#94A3B8' : '#64748B'}
                  />
                </TouchableOpacity>

                {/* Like */}
                <TouchableOpacity onPress={() => handleLike(selectedArticle)} style={styles.readerIconBtn}>
                  <Ionicons
                    name={articleLiked ? 'heart' : 'heart-outline'}
                    size={22}
                    color={articleLiked ? '#EF4444' : isDark ? '#94A3B8' : '#64748B'}
                  />
                </TouchableOpacity>

                {/* Bookmark */}
                <TouchableOpacity onPress={() => handleBookmark(selectedArticle)} style={styles.readerIconBtn}>
                  <Ionicons
                    name={articleBookmarked ? 'bookmark' : 'bookmark-outline'}
                    size={22}
                    color={articleBookmarked ? '#2C68B0' : isDark ? '#94A3B8' : '#64748B'}
                  />
                </TouchableOpacity>

                {/* Share */}
                <TouchableOpacity onPress={() => handleShare(selectedArticle)} style={styles.readerIconBtn}>
                  <Ionicons name="share-outline" size={22} color={isDark ? '#94A3B8' : '#64748B'} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Modal Content Scroll */}
            <TourScrollView style={styles.readerBody} showsVerticalScrollIndicator={false}>
              {/* Category & Reading Time */}
              <View style={styles.readerMetaRow}>
                <View style={styles.readerCategoryBadge}>
                  <Text style={styles.readerCategoryText}>
                    {(selectedArticle.category || 'News').toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.readerReadingTime}>
                  {selectedArticle.reading_time || 2} min read
                </Text>
              </View>

              {/* Title */}
              <Text style={[styles.readerTitle, isDark ? styles.textDark : styles.textLight]}>
                {selectedArticle.headline || selectedArticle.title}
              </Text>

              {/* Source & Timestamp */}
              <View style={styles.readerSourceRow}>
                <Text style={styles.readerSourceText}>
                  Source: <Text style={styles.readerSourceBold}>{selectedArticle.source_name || 'SchoolIMS Desk'}</Text>
                </Text>
                {selectedArticle.source_url && (
                  <TouchableOpacity
                    onPress={() => Linking.openURL(selectedArticle.source_url!)}
                    style={styles.readerExternalLink}
                  >
                    <Text style={styles.readerExternalLinkText}>Original Source</Text>
                    <Ionicons name="open-outline" size={13} color="#2C68B0" />
                  </TouchableOpacity>
                )}
              </View>

              {/* Cover Image */}
              {selectedArticle.cover_image_url && (
                <Image
                  source={{ uri: selectedArticle.cover_image_url }}
                  style={styles.readerCoverImage}
                  resizeMode="cover"
                />
              )}

              {/* Summary Lead */}
              {selectedArticle.summary && (
                <Text style={[styles.readerSummary, isDark ? styles.summaryDark : styles.summaryLight]}>
                  {selectedArticle.summary}
                </Text>
              )}

              {/* Body Content */}
              <Text style={[styles.readerBodyText, isDark ? styles.textDark : styles.textLight]}>
                {selectedArticle.body || selectedArticle.summary}
              </Text>

              <View style={styles.bottomSpacer} />
            </TourScrollView>
          </View>
        )}
      </Modal>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 10,
    borderRadius: 14,
    padding: 4,
  },
  tabBarLight: {
    backgroundColor: '#EDE9FE',
  },
  tabBarDark: {
    backgroundColor: '#1E1B4B',
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  activeTabButton: {
    backgroundColor: '#FFFFFF',
    ...Platform.select({
      ios: {
        shadowColor: '#2C68B0',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
      web: {
        boxShadow: '0 2px 8px rgba(109, 40, 217, 0.12)',
      },
    }),
  },
  tabButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  activeTabText: {
    color: '#2C68B0',
    fontWeight: '700',
  },
  tabTextLight: {
    color: '#64748B',
  },
  tabTextDark: {
    color: '#94A3B8',
  },
  offlinePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 6,
    marginBottom: 8,
  },
  offlineText: {
    fontSize: 11,
    color: '#92400E',
    fontWeight: '600',
  },
  contentContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
  },
  editionHeader: {
    marginBottom: 14,
  },
  editionPre: {
    fontSize: 22,
    fontWeight: '700',
    color: clayTokens.colors.text.primary,
    letterSpacing: -0.3,
    marginBottom: 2,
  },
  editionKicker: {
    fontSize: 13,
    fontWeight: '500',
    color: clayTokens.colors.text.muted,
    marginTop: 4,
  },
  editionDate: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 10,
    letterSpacing: -0.2,
  },
  categorySection: {
    marginTop: 18,
    marginBottom: 14,
  },
  categoryScroll: {
    gap: 8,
    paddingRight: 16,
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  activeCategoryChip: {
    backgroundColor: '#2C68B0',
    borderColor: '#2C68B0',
  },
  chipLight: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
  },
  chipDark: {
    backgroundColor: '#1E293B',
    borderColor: '#334155',
  },
  categoryChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  activeChipText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  chipTextLight: {
    color: '#475569',
  },
  chipTextDark: {
    color: '#CBD5E1',
  },
  emptyStateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 14,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 18,
  },
  textLight: {
    color: '#0F172A',
  },
  textDark: {
    color: '#F8FAFC',
  },
  bottomSpacer: {
    height: 48,
  },
  // Reader Modal Styles
  readerContainer: {
    flex: 1,
  },
  readerLight: {
    backgroundColor: '#FFFFFF',
  },
  readerDark: {
    backgroundColor: '#0F172A',
  },
  readerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  readerCloseButton: {
    padding: 6,
  },
  readerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  readerIconBtn: {
    padding: 6,
  },
  readerBody: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  readerMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  readerCategoryBadge: {
    backgroundColor: '#EDE9FE',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  readerCategoryText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#2C68B0',
    letterSpacing: 0.5,
  },
  readerReadingTime: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '500',
  },
  readerTitle: {
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 28,
    letterSpacing: -0.4,
    marginBottom: 10,
  },
  readerSourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  readerSourceText: {
    fontSize: 12,
    color: '#64748B',
  },
  readerSourceBold: {
    fontWeight: '700',
    color: '#475569',
  },
  readerExternalLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  readerExternalLinkText: {
    fontSize: 12,
    color: '#2C68B0',
    fontWeight: '600',
  },
  readerCoverImage: {
    width: '100%',
    height: 220,
    borderRadius: 16,
    marginBottom: 18,
  },
  readerSummary: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 22,
    marginBottom: 14,
  },
  summaryLight: {
    color: '#334155',
  },
  summaryDark: {
    color: '#CBD5E1',
  },
  readerBodyText: {
    fontSize: 15,
    lineHeight: 24,
    fontWeight: '400',
  },
});
