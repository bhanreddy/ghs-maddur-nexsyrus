import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import AppTextInput from '@/src/components/AppTextInput';
import { styles as ds } from '@/src/theme/styles';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  StatusBar,
  ScrollView,
  useWindowDimensions,
  Platform,
  Linking,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import StudentHeader from '../../src/components/StudentHeader';
import { api } from '../../src/services/apiClient';
import { useTheme } from '../../src/hooks/useTheme';
import { Theme } from '../../src/theme/themes';
import LogoLoader from '../../src/components/LogoLoader';
import LMSVideoModal, { type LMSVideoMaterial } from '@/src/components/lms/LMSVideoModal';
import { extractYoutubeVideoId } from '@/src/utils/youtube';
import { getVideoProgressMap, type VideoProgress } from '@/src/utils/lmsVideoProgress';

const TABLET_MIN_W = 720;
const DESKTOP_MIN_W = 1180;
const NEW_DAYS = 7;

/** `duration` from API is seconds (integer); format for badge. Legacy string like "10:00" is passed through. */
function formatVideoDurationLabel(raw: unknown): string {
  if (raw == null || raw === '') return '—';
  const n = typeof raw === 'number' ? raw : parseInt(String(raw).replace(/\s/g, ''), 10);
  if (Number.isFinite(n) && n > 0) {
    const h = Math.floor(n / 3600);
    const m = Math.floor((n % 3600) / 60);
    const s = n % 60;
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (/^\d{1,3}:\d{2}(?::\d{2})?$/.test(t)) return t;
  }
  return '—';
}

interface LMSMaterial {
  id: string;
  title: string;
  description: string;
  content_url: string;
  duration: string;
  material_type: string;
  created_at: string;
  createdAtIso: string;
  course_title: string;
  class_name: string;
  teacher_name: string;
}

const SUBJECTS = [
  'All',
  'Mathematics',
  'Science',
  'English',
  'Social Science',
  'Hindi',
  'Telugu',
  'Physics',
  'Biology',
] as const;

type SubjectKey = (typeof SUBJECTS)[number];

/** Compare course title from API to filter tab (handles ENGLISH vs English, extra spaces, etc.). */
function normalizeSubjectString(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function courseMatchesSubjectTab(courseTitle: string, tab: SubjectKey): boolean {
  if (tab === 'All') return true;
  const c = normalizeSubjectString(courseTitle);
  const t = normalizeSubjectString(tab);
  if (c === t) return true;
  // e.g. course "English — Grade 10" or "English Literature" still under English
  if (c.startsWith(`${t} `) || c.startsWith(`${t}-`)) return true;
  return false;
}

const SUBJECT_TAB: Record<string, { icon: string; accent: string }> = {
  All: { icon: '📚', accent: '#6366F1' },
  Mathematics: { icon: '📐', accent: '#2563EB' },
  Science: { icon: '🔬', accent: '#059669' },
  English: { icon: '🔤', accent: '#D97706' },
  'Social Science': { icon: '🌍', accent: '#7C3AED' },
  Hindi: { icon: '🔠', accent: '#DB2777' },
  Telugu: { icon: '✍️', accent: '#0D9488' },
  Physics: { icon: '⚛️', accent: '#0891B2' },
  Biology: { icon: '🧬', accent: '#10B981' },
};

function topicAccent(courseTitle: string): string {
  const cfg = SUBJECT_TAB[courseTitle];
  if (cfg) return cfg.accent;
  const t = courseTitle.toLowerCase();
  if (t.includes('math')) return '#2563EB';
  if (t.includes('science')) return '#059669';
  if (t.includes('english')) return '#D97706';
  if (t.includes('social')) return '#7C3AED';
  if (t.includes('hindi')) return '#DB2777';
  if (t.includes('telugu')) return '#0D9488';
  if (t.includes('physics')) return '#0891B2';
  if (t.includes('bio')) return '#10B981';
  return '#4F46E5';
}

export default function LMSPage() {
  const { theme, isDark } = useTheme();
  const { width: winW } = useWindowDimensions();
  const isWide = winW >= TABLET_MIN_W;
  const numCols = winW >= DESKTOP_MIN_W ? 3 : isWide ? 2 : 1;
  const styles = useMemo(() => getStyles(theme, isDark, isWide, winW), [theme, isDark, isWide, winW]);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubject, setSelectedSubject] = useState<SubjectKey>('All');
  const [materials, setMaterials] = useState<LMSMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [progressMap, setProgressMap] = useState<Record<string, VideoProgress>>({});
  const [videoModalVisible, setVideoModalVisible] = useState(false);
  const [activeVideo, setActiveVideo] = useState<LMSVideoMaterial | null>(null);
  const listRef = useRef<FlatList<LMSMaterial>>(null);

  const refreshProgressMap = useCallback(async () => {
    const m = await getVideoProgressMap();
    setProgressMap(m);
  }, []);

  useEffect(() => {
    fetchLMSFeed();
    refreshProgressMap();
  }, [refreshProgressMap]);

  const fetchLMSFeed = async () => {
    try {
      setLoading(true);
      const data: any[] = await api.get('/lms/all-materials');
      const mapped: LMSMaterial[] = data.map((m) => ({
        id: m.id,
        title: m.title,
        description: m.description,
        content_url: m.content_url,
        duration: formatVideoDurationLabel(m.duration),
        material_type: m.material_type,
        created_at: new Date(m.created_at).toLocaleDateString(),
        createdAtIso: typeof m.created_at === 'string' ? m.created_at : new Date(m.created_at).toISOString(),
        course_title: m.course_title,
        class_name: m.class_name || 'Class',
        teacher_name: m.instructor_name || 'Teacher',
      }));
      setMaterials(mapped);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  const filteredContent = useMemo(() => {
    return materials.filter((item) => {
      const matchesSearch =
        item.course_title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.title.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesSubject = courseMatchesSubjectTab(item.course_title, selectedSubject);
      return matchesSearch && matchesSubject;
    });
  }, [materials, searchQuery, selectedSubject]);

  const progressStats = useMemo(() => {
    const total = filteredContent.length;
    const done = filteredContent.filter((it) => progressMap[it.id]?.completed).length;
    return { total, done, ratio: total > 0 ? done / total : 0 };
  }, [filteredContent, progressMap]);

  const firstIncompleteIndex = useMemo(() => {
    return filteredContent.findIndex((it) => !progressMap[it.id]?.completed);
  }, [filteredContent, progressMap]);

  const openMaterial = useCallback((item: LMSMaterial) => {
    const vid = extractYoutubeVideoId(item.content_url);
    if (vid) {
      setActiveVideo({
        id: item.id,
        title: item.title,
        course_title: item.course_title,
        teacher_name: item.teacher_name,
        content_url: item.content_url,
      });
      setVideoModalVisible(true);
      return;
    }
    Linking.openURL(item.content_url).catch(() => { });
  }, []);

  const closeVideoModal = useCallback(() => {
    setVideoModalVisible(false);
    setActiveVideo(null);
  }, []);

  const isNewMaterial = (iso: string) => {
    const t = new Date(iso).getTime();
    if (Number.isNaN(t)) return false;
    return Date.now() - t < NEW_DAYS * 24 * 60 * 60 * 1000;
  };

  const renderItem = ({ item }: { item: LMSMaterial }) => {
    const accent = topicAccent(item.course_title);
    const yid = extractYoutubeVideoId(item.content_url);
    const thumbUri = yid ? `https://img.youtube.com/vi/${yid}/hqdefault.jpg` : null;
    const completed = !!progressMap[item.id]?.completed;
    const isNew = isNewMaterial(item.createdAtIso);

    return (
      <View style={numCols > 1 ? styles.gridCell : undefined}>
        <Pressable
          onPress={() => openMaterial(item)}
          accessibilityRole="button"
          accessibilityLabel={`${completed ? 'Completed' : 'Play'} ${item.title}, ${item.course_title}`}
          style={({ pressed, hovered }) => [
            styles.card,
            Platform.OS === 'web' && hovered ? styles.cardHoverWeb : null,
            pressed ? styles.cardPressed : null,
          ]}
        >
          <View style={styles.thumbnailContainer}>
              {thumbUri ? (
                <Image
                  source={{ uri: thumbUri }}
                  style={styles.thumbnail}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                />
              ) : (
                <View style={[styles.thumbnail, styles.thumbPlaceholder]}>
                  <Ionicons name="logo-youtube" size={40} color={theme.colors.textTertiary} />
                </View>
              )}
              <View style={styles.playButtonOverlay} pointerEvents="none">
                <View style={[styles.playButton, { backgroundColor: accent }]}>
                  <Ionicons name="play" size={22} color="#FFF" style={{ marginLeft: 3 }} />
                </View>
              </View>
              <LinearGradient colors={['transparent', 'rgba(8,15,35,0.76)']} style={styles.thumbnailGradient} />
              <View style={styles.durationBadge}>
                <MaterialIcons name="schedule" size={12} color="rgba(255,255,255,0.95)" style={{ marginRight: 4 }} />
                <Text style={styles.durationText}>{item.duration}</Text>
              </View>
              {isNew ? (
                <View style={styles.newBadge}>
                  <Text style={styles.newBadgeText}>New</Text>
                </View>
              ) : null}
              {completed ? (
                <View style={styles.doneCorner}>
                  <Ionicons name="checkmark-circle" size={28} color={theme.colors.success} />
                </View>
              ) : null}
          </View>

          <View style={styles.cardContent}>
            <View style={styles.badgesRow}>
              <View style={[styles.topicBadge, { backgroundColor: isDark ? `${accent}33` : `${accent}22` }]}>
                <Text style={[styles.topicText, { color: accent }]}>{item.course_title}</Text>
              </View>
              <View style={styles.classBadge}>
                <Text style={styles.classBadgeText}>{item.class_name}</Text>
              </View>
            </View>
            <Text style={styles.subTopic} numberOfLines={2}>
              {item.title}
            </Text>
            {item.description ? (
              <Text style={styles.description} numberOfLines={2}>
                {item.description}
              </Text>
            ) : null}
            <View style={styles.footer}>
              <View style={styles.teacherInfo}>
                <MaterialIcons name="person" size={14} color={theme.colors.textSecondary} />
                <Text style={styles.teacherName}>{item.teacher_name}</Text>
              </View>
              <Text style={styles.date}>{item.created_at}</Text>
            </View>
            <View style={styles.cardActionRow}>
              <Text style={[styles.cardActionText, { color: accent }]}>
                {completed ? 'Watch again' : 'Start lesson'}
              </Text>
              <Ionicons name="arrow-forward" size={16} color={accent} />
            </View>
          </View>
        </Pressable>
      </View>
    );
  };

  const nextMaterial = firstIncompleteIndex >= 0 ? filteredContent[firstIncompleteIndex] : filteredContent[0];

  const listHeader = (
    <View>
      <View style={styles.heroShell}>
        <LinearGradient
          colors={isDark ? ['#1C2750', '#151B35'] : ['#E7E9FF', '#DDE9FF']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroCopy}>
            <View style={styles.eyebrow}>
              <Ionicons name="sparkles" size={13} color={isDark ? '#C7D2FE' : '#4338CA'} />
              <Text style={styles.eyebrowText}>YOUR LEARNING SPACE</Text>
            </View>
            <Text style={styles.heroTitle}>Learn a little.{isWide ? '\n' : ' '}Grow a lot.</Text>
            <Text style={styles.heroSubtitle}>
              Pick up where you left off or explore a new subject at your own pace.
            </Text>
            {nextMaterial ? (
              <Pressable
                onPress={() => openMaterial(nextMaterial)}
                accessibilityRole="button"
                accessibilityLabel={`Continue learning ${nextMaterial.title}`}
                style={({ pressed }) => [styles.continueButton, pressed && styles.continueButtonPressed]}
              >
                <View style={styles.continueIcon}>
                  <Ionicons name="play" size={14} color="#FFFFFF" style={{ marginLeft: 2 }} />
                </View>
                <View style={styles.continueCopy}>
                  <Text style={styles.continueLabel}>{firstIncompleteIndex >= 0 ? 'CONTINUE LEARNING' : 'REPLAY LESSON'}</Text>
                  <Text style={styles.continueTitle} numberOfLines={1}>{nextMaterial.title}</Text>
                </View>
                <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
              </Pressable>
            ) : null}
          </View>

          <View style={styles.progressClay}>
            <View style={styles.progressTopRow}>
              <View>
                <Text style={styles.progressOverline}>COURSE PROGRESS</Text>
                <Text style={styles.progressPercent}>{Math.round(progressStats.ratio * 100)}%</Text>
              </View>
              <View style={styles.progressIconWell}>
                <Ionicons name="trophy-outline" size={24} color={isDark ? '#FCD34D' : '#B45309'} />
              </View>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.round(progressStats.ratio * 100)}%` as any }]} />
            </View>
            <Text style={styles.progressCaption}>
              {progressStats.done} of {progressStats.total} lessons complete
            </Text>
          </View>
        </LinearGradient>
      </View>

      <View style={styles.discoverySection}>
        <View style={styles.searchBar}>
          <View style={styles.searchIconWell}>
            <Ionicons name="search" size={19} color={theme.colors.primary} />
          </View>
          <AppTextInput
            style={[ds.inputInChrome, styles.searchInput]}
            placeholder="Search lessons, topics, or subjects"
            placeholderTextColor={theme.colors.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            accessibilityLabel="Search lessons"
            returnKeyType="search"
          />
          {searchQuery.length > 0 ? (
            <Pressable
              onPress={() => setSearchQuery('')}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              hitSlop={10}
              style={styles.searchClear}
            >
              <Ionicons name="close" size={18} color={theme.colors.textSecondary} />
            </Pressable>
          ) : null}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsContent}>
          {SUBJECTS.map((subject) => {
            const active = selectedSubject === subject;
            const tabMeta = SUBJECT_TAB[subject] ?? SUBJECT_TAB.All;
            return (
              <Pressable
                key={subject}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setSelectedSubject(subject)}
                style={({ pressed }) => [
                  styles.tabItem,
                  active && { backgroundColor: tabMeta.accent, borderColor: tabMeta.accent },
                  pressed && styles.tabPressed,
                ]}
              >
                <Text style={styles.tabEmoji}>{tabMeta.icon}</Text>
                <Text style={[styles.tabText, active && styles.activeTabText]}>{subject}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.sectionHeadingRow}>
          <View>
            <Text style={styles.sectionTitle}>{selectedSubject === 'All' ? 'All lessons' : selectedSubject}</Text>
            <Text style={styles.sectionMeta}>
              {filteredContent.length} {filteredContent.length === 1 ? 'lesson' : 'lessons'} available
            </Text>
          </View>
          {searchQuery || selectedSubject !== 'All' ? (
            <Pressable
              onPress={() => { setSearchQuery(''); setSelectedSubject('All'); }}
              accessibilityRole="button"
              style={styles.resetButton}
            >
              <Text style={styles.resetText}>Reset filters</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.colors.card} />
      <StudentHeader showBackButton={true} title="LMS" />

      {loading ? (
        <View style={styles.loaderWrap}>
          <LogoLoader size={60} color={theme.colors.primary} />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={filteredContent}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          key={numCols}
          numColumns={numCols}
          columnWrapperStyle={numCols > 1 ? styles.columnWrap : undefined}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={listHeader}
          showsVerticalScrollIndicator={false}
          initialNumToRender={numCols * 2}
          maxToRenderPerBatch={numCols * 2}
          windowSize={5}
          removeClippedSubviews={Platform.OS !== 'web'}
          onScrollToIndexFailed={(info) => {
            const approx = 360;
            setTimeout(() => {
              listRef.current?.scrollToOffset({
                offset: approx * info.index,
                animated: true,
              });
            }, 120);
          }}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIconWell}>
                <MaterialIcons name="video-library" size={34} color={theme.colors.primary} />
              </View>
              <Text style={styles.emptyText}>No lessons found</Text>
              <Text style={styles.emptyCaption}>Try another subject or clear your search.</Text>
            </View>
          }
        />
      )}

      <LMSVideoModal
        visible={videoModalVisible}
        material={activeVideo}
        theme={theme}
        isDark={isDark}
        onClose={closeVideoModal}
        onProgressUpdated={refreshProgressMap}
      />
    </View>
  );
}

function getStyles(theme: Theme, isDark: boolean, isWide: boolean, winW: number) {
  const pad = isWide ? 24 : 16;
  const gap = isWide ? 18 : 14;
  const contentW = Math.min(winW, 1480);
  const columns = winW >= DESKTOP_MIN_W ? 3 : isWide ? 2 : 1;
  const colBasis = (contentW - pad * 2 - gap * (columns - 1)) / columns;
  const clayBase = isDark ? '#171D30' : '#EEF2FA';
  const clayRaised = isDark ? '#20283D' : '#F7F9FE';
  const clayBorder = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.88)';
  const webClay = isDark
    ? '-6px -6px 14px rgba(48,58,84,0.34), 8px 10px 22px rgba(3,7,18,0.46)'
    : '-7px -7px 16px rgba(255,255,255,0.95), 8px 10px 22px rgba(94,108,137,0.18)';
  const webClaySmall = isDark
    ? '-3px -3px 8px rgba(48,58,84,0.26), 4px 5px 10px rgba(3,7,18,0.34)'
    : '-4px -4px 9px rgba(255,255,255,0.95), 4px 5px 11px rgba(94,108,137,0.14)';

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: clayBase,
    },
    loaderWrap: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: clayBase,
    },
    listContent: {
      width: '100%',
      maxWidth: 1480,
      alignSelf: 'center',
      paddingHorizontal: pad,
      paddingBottom: 48,
    },
    heroShell: {
      paddingTop: isWide ? 24 : 16,
      paddingBottom: isWide ? 26 : 18,
    },
    hero: {
      minHeight: isWide ? 258 : 0,
      borderRadius: isWide ? 32 : 24,
      padding: isWide ? 30 : 20,
      flexDirection: isWide ? 'row' : 'column',
      alignItems: isWide ? 'stretch' : 'flex-start',
      justifyContent: 'space-between',
      gap: 22,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(165,180,252,0.12)' : 'rgba(255,255,255,0.75)',
      shadowColor: isDark ? '#000000' : '#7582A0',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: isDark ? 0.35 : 0.18,
      shadowRadius: 22,
      elevation: 7,
      ...Platform.select({ web: { boxShadow: webClay }, default: {} }),
    },
    heroCopy: {
      flex: 1,
      maxWidth: 720,
      justifyContent: 'center',
    },
    eyebrow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      alignSelf: 'flex-start',
      paddingHorizontal: 11,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: isDark ? 'rgba(129,140,248,0.15)' : 'rgba(255,255,255,0.55)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(165,180,252,0.16)' : 'rgba(255,255,255,0.78)',
    },
    eyebrowText: {
      color: isDark ? '#C7D2FE' : '#4338CA',
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1.15,
    },
    heroTitle: {
      color: isDark ? '#F8FAFC' : '#18214B',
      fontSize: isWide ? 38 : 28,
      lineHeight: isWide ? 43 : 34,
      fontWeight: '800',
      letterSpacing: -1.1,
      marginTop: 14,
    },
    heroSubtitle: {
      color: isDark ? '#B7C1D8' : '#536181',
      fontSize: isWide ? 15 : 14,
      lineHeight: 22,
      maxWidth: 570,
      marginTop: 9,
    },
    continueButton: {
      marginTop: 18,
      minHeight: 54,
      maxWidth: isWide ? 430 : '100%',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
      paddingHorizontal: 10,
      paddingRight: 16,
      borderRadius: 18,
      backgroundColor: '#4F46E5',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.22)',
      shadowColor: '#312E81',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.28,
      shadowRadius: 10,
      elevation: 5,
      ...Platform.select({
        web: {
          cursor: 'pointer',
          boxShadow: 'inset 2px 2px 3px rgba(255,255,255,0.22), inset -3px -3px 5px rgba(49,46,129,0.24), 0 8px 16px rgba(67,56,202,0.25)',
        },
        default: {},
      }),
    },
    continueButtonPressed: {
      opacity: 0.92,
      transform: [{ translateY: 1 }],
    },
    continueIcon: {
      width: 36,
      height: 36,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.18)',
    },
    continueCopy: { flex: 1 },
    continueLabel: {
      color: '#C7D2FE',
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 0.9,
    },
    continueTitle: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '700',
      marginTop: 2,
    },
    progressClay: {
      width: isWide ? 280 : '100%',
      alignSelf: 'stretch',
      justifyContent: 'center',
      padding: 20,
      borderRadius: 24,
      backgroundColor: isDark ? 'rgba(21,27,48,0.78)' : 'rgba(247,249,255,0.72)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.78)',
      shadowColor: isDark ? '#020617' : '#8C99B7',
      shadowOffset: { width: 7, height: 8 },
      shadowOpacity: isDark ? 0.35 : 0.2,
      shadowRadius: 16,
      elevation: 4,
      ...Platform.select({ web: { boxShadow: webClaySmall }, default: {} }),
    },
    progressTopRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
    },
    progressOverline: {
      color: isDark ? '#9AA6C1' : '#64718C',
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 1,
    },
    progressPercent: {
      color: isDark ? '#FFFFFF' : '#18214B',
      fontSize: 38,
      lineHeight: 44,
      fontWeight: '800',
      letterSpacing: -1.2,
      marginTop: 3,
    },
    progressIconWell: {
      width: 46,
      height: 46,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? '#252D45' : '#F6EBCB',
      borderWidth: 1,
      borderColor: clayBorder,
      ...Platform.select({ web: { boxShadow: webClaySmall }, default: { elevation: 2 } }),
    },
    progressTrack: {
      height: 10,
      marginTop: 14,
      borderRadius: 999,
      overflow: 'hidden',
      backgroundColor: isDark ? '#111727' : '#D7DEED',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(119,132,161,0.1)',
    },
    progressFill: {
      height: '100%',
      minWidth: 0,
      borderRadius: 999,
      backgroundColor: '#4F46E5',
    },
    progressCaption: {
      marginTop: 9,
      color: isDark ? '#A7B0C5' : '#67728D',
      fontSize: 12,
      fontWeight: '600',
    },
    discoverySection: {
      paddingTop: 2,
    },
    searchBar: {
      minHeight: 56,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 9,
      paddingRight: 14,
      gap: 10,
      borderRadius: 20,
      backgroundColor: clayRaised,
      borderWidth: 1,
      borderColor: clayBorder,
      shadowColor: isDark ? '#020617' : '#8B98B5',
      shadowOffset: { width: 5, height: 6 },
      shadowOpacity: isDark ? 0.32 : 0.18,
      shadowRadius: 12,
      elevation: 3,
      ...Platform.select({ web: { boxShadow: webClaySmall }, default: {} }),
    },
    searchIconWell: {
      width: 40,
      height: 40,
      borderRadius: 14,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: isDark ? '#252D45' : '#E5E9F5',
      borderWidth: 1,
      borderColor: clayBorder,
    },
    searchInput: {
      flex: 1,
      minHeight: 44,
      paddingHorizontal: 0,
      paddingVertical: 0,
      borderWidth: 0,
      backgroundColor: 'transparent',
      color: theme.colors.textStrong,
      fontSize: 14,
    },
    searchClear: {
      width: 30,
      height: 30,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? '#2A3248' : '#E9EDF6',
    },
    tabsContent: {
      gap: 10,
      paddingVertical: 20,
      paddingHorizontal: 2,
    },
    tabItem: {
      minHeight: 42,
      paddingHorizontal: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      borderRadius: 15,
      backgroundColor: clayRaised,
      borderWidth: 1,
      borderColor: clayBorder,
      shadowColor: isDark ? '#020617' : '#8B98B5',
      shadowOffset: { width: 3, height: 4 },
      shadowOpacity: isDark ? 0.28 : 0.14,
      shadowRadius: 7,
      elevation: 2,
      ...Platform.select({ web: { cursor: 'pointer', boxShadow: webClaySmall }, default: {} }),
    },
    tabPressed: { opacity: 0.86, transform: [{ translateY: 1 }] },
    tabEmoji: { fontSize: 14 },
    tabText: { fontSize: 13, fontWeight: '700', color: theme.colors.textSecondary },
    activeTabText: { color: '#FFFFFF' },
    sectionHeadingRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      marginTop: 2,
      marginBottom: 16,
    },
    sectionTitle: {
      color: theme.colors.textStrong,
      fontSize: isWide ? 24 : 21,
      lineHeight: 29,
      fontWeight: '800',
      letterSpacing: -0.5,
    },
    sectionMeta: {
      marginTop: 3,
      color: theme.colors.textSecondary,
      fontSize: 12,
      fontWeight: '500',
    },
    resetButton: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 12,
      backgroundColor: isDark ? '#252D45' : '#E5E9F5',
    },
    resetText: { color: theme.colors.primary, fontSize: 12, fontWeight: '700' },
    columnWrap: { gap, marginBottom: gap },
    gridCell: { width: colBasis },
    card: {
      flex: 1,
      minHeight: '100%',
      borderRadius: 24,
      overflow: 'hidden',
      marginBottom: columns > 1 ? 0 : gap,
      backgroundColor: clayRaised,
      borderWidth: 1,
      borderColor: clayBorder,
      shadowColor: isDark ? '#020617' : '#8B98B5',
      shadowOffset: { width: 6, height: 8 },
      shadowOpacity: isDark ? 0.36 : 0.18,
      shadowRadius: 14,
      elevation: 4,
      ...Platform.select({
        web: {
          cursor: 'pointer',
          boxShadow: webClay,
          transition: 'transform 160ms ease, box-shadow 160ms ease',
        },
        default: {},
      }),
    },
    cardHoverWeb: {
      transform: [{ translateY: -3 }],
      ...Platform.select({
        web: {
          boxShadow: isDark
            ? '-6px -6px 16px rgba(48,58,84,0.38), 12px 16px 28px rgba(3,7,18,0.55)'
            : '-7px -7px 17px rgba(255,255,255,1), 12px 16px 28px rgba(94,108,137,0.24)',
        },
        default: {},
      }),
    },
    cardPressed: { opacity: 0.94, transform: [{ translateY: 1 }] },
    thumbnailContainer: {
      position: 'relative',
      width: '100%',
      aspectRatio: 16 / 9,
      overflow: 'hidden',
      backgroundColor: isDark ? '#0F172A' : '#DCE3F0',
    },
    thumbnail: { width: '100%', height: '100%' },
    thumbPlaceholder: { justifyContent: 'center', alignItems: 'center' },
    thumbnailGradient: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: '44%',
    },
    playButtonOverlay: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'center',
      alignItems: 'center',
    },
    playButton: {
      width: 54,
      height: 54,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: 'rgba(255,255,255,0.7)',
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 5 },
      shadowOpacity: 0.28,
      shadowRadius: 8,
      elevation: 5,
      ...Platform.select({
        web: { boxShadow: 'inset 2px 2px 3px rgba(255,255,255,0.3), inset -3px -3px 5px rgba(0,0,0,0.2), 0 7px 15px rgba(0,0,0,0.3)' },
        default: {},
      }),
    },
    durationBadge: {
      position: 'absolute',
      bottom: 10,
      right: 10,
      zIndex: 4,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingVertical: 5,
      borderRadius: 9,
      backgroundColor: 'rgba(8,15,35,0.84)',
    },
    durationText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800', fontVariant: ['tabular-nums'] },
    newBadge: {
      position: 'absolute',
      top: 10,
      left: 10,
      zIndex: 4,
      paddingHorizontal: 9,
      paddingVertical: 5,
      borderRadius: 9,
      backgroundColor: '#10B981',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.5)',
    },
    newBadgeText: { color: '#FFFFFF', fontSize: 9, fontWeight: '900', letterSpacing: 0.7, textTransform: 'uppercase' },
    doneCorner: {
      position: 'absolute',
      top: 9,
      right: 9,
      zIndex: 5,
      width: 32,
      height: 32,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? '#152E2B' : '#ECFDF5',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(52,211,153,0.18)' : '#A7F3D0',
    },
    cardContent: { flex: 1, padding: 16 },
    badgesRow: { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginBottom: 9 },
    topicBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
    topicText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.65, textTransform: 'uppercase' },
    classBadge: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
      backgroundColor: isDark ? '#252D45' : '#E7EBF4',
      borderWidth: 1,
      borderColor: clayBorder,
    },
    classBadgeText: { color: theme.colors.textSecondary, fontSize: 9, fontWeight: '700' },
    subTopic: {
      color: theme.colors.textStrong,
      fontSize: 16,
      lineHeight: 22,
      fontWeight: '800',
      letterSpacing: -0.2,
      marginBottom: 5,
    },
    description: { color: theme.colors.textSecondary, fontSize: 12, lineHeight: 18, marginBottom: 11 },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      marginTop: 'auto',
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(100,116,139,0.12)',
    },
    teacherInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5 },
    teacherName: { flex: 1, color: theme.colors.textSecondary, fontSize: 11, fontWeight: '600' },
    date: { color: theme.colors.textTertiary, fontSize: 10, fontWeight: '600' },
    cardActionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 13,
      paddingTop: 2,
    },
    cardActionText: { fontSize: 12, fontWeight: '800' },
    emptyState: {
      minHeight: 260,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 32,
      borderRadius: 24,
      backgroundColor: clayRaised,
      borderWidth: 1,
      borderColor: clayBorder,
      ...Platform.select({ web: { boxShadow: webClaySmall }, default: { elevation: 2 } }),
    },
    emptyIconWell: {
      width: 66,
      height: 66,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? '#252D45' : '#E5E9F5',
      borderWidth: 1,
      borderColor: clayBorder,
    },
    emptyText: { marginTop: 16, color: theme.colors.textStrong, fontSize: 17, fontWeight: '800' },
    emptyCaption: { marginTop: 5, color: theme.colors.textSecondary, fontSize: 13, textAlign: 'center' },
  });
}
