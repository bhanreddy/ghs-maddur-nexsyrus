import { TourTarget, TourScrollView } from '@/src/features/app-tour';
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, RefreshControl } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import StudentHeader from '../../src/components/StudentHeader';
import ScreenLayout from '@/src/components/ScreenLayout';
import { useStudentQuery } from '../../src/hooks/useStudentQuery';
import type { Student } from '../../src/types/models';
import { ResultService, ExamSummary } from '../../src/services/resultService';
import { useAuth } from '../../src/hooks/useAuth';
import { useTheme, type SchoolTheme } from '../../src/hooks/useTheme';
import LogoLoader from '../../src/components/LogoLoader';
import { useFeatureGuard } from '../../src/hooks/useFeatures';

// Config for visual styling based on exam type
const EXAM_TYPE_CONFIG: Record<string, {
  icon: string;
  colors: string[];
  accent: string;
  labelKey: string;
}> = {
  'slip_test': {
    icon: 'document-text',
    colors: ['#3B82F6', '#2563EB'],
    accent: '#EFF6FF',
    labelKey: 'results.slip_test'
  },
  'fa_results': {
    icon: 'analytics',
    colors: ['#10B981', '#059669'],
    accent: '#ECFDF5',
    labelKey: 'results.fa_results'
  },
  'sa_results': {
    icon: 'school',
    colors: ['#F59E0B', '#D97706'],
    accent: '#FFFBEB',
    labelKey: 'results.sa_results'
  },
  'special': {
    icon: 'star',
    colors: ['#8B5CF6', '#7C3AED'],
    accent: '#F3E8FF',
    labelKey: 'results.special'
  },
  'weekend': {
    icon: 'calendar',
    colors: ['#EC4899', '#DB2777'],
    accent: '#FDF2F8',
    labelKey: 'results.weekend'
  },
  'default': {
    icon: 'copy',
    colors: ['#6B7280', '#4B5563'],
    accent: '#F3F4F6',
    labelKey: 'results.other'
  }
};
const ResultsScreen = () => {
  useFeatureGuard('nav.results'); // deep-link guard
  const { theme } = useTheme();
  const styles = React.useMemo(() => getStyles(theme), [theme]);
  const {
    t
  } = useTranslation();
  const router = useRouter();
  const {
    user
  } = useAuth();
  const roleCode = typeof user?.role === 'object' && user?.role !== null ? (user.role as { code: string }).code : user?.role;
  const isStudent = roleCode === 'student';
  const { data: profile, refetch: refetchProfile } = useStudentQuery<Student>(
    '/students/profile/me',
    'profile',
    3 * 60 * 1000,
    user?.userId,
    { enabled: !!user?.userId && isStudent }
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState<ExamSummary[]>([]);
  useEffect(() => {
    const run = async () => {
      if (!user?.userId || !isStudent || !profile?.id) {
        setLoading(false);
        return;
      }
      try {
        const data = await ResultService.getSummary(profile.id);
        setSummary(data || []);
      } catch {

      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    };
    void run();
  }, [user?.userId, isStudent, profile?.id]);
  const onRefresh = async () => {
    setRefreshing(true);
    const fresh = await refetchProfile();
    const sid = fresh?.id ?? profile?.id;
    if (sid) {
      try {
        const data = await ResultService.getSummary(sid);
        setSummary(data || []);
      } catch {

      }
    }
    setRefreshing(false);
  };
  const handlePress = (type: string, title: string) => {
    router.push({
      pathname: '/result-details',
      params: {
        type,
        title
      }
    });
  };
  const getExamConfig = (type: string) => {
    return EXAM_TYPE_CONFIG[type] || EXAM_TYPE_CONFIG['default'];
  };

  // Helper to format subtitle
  const getSubtitle = (type: string, count: number) => {
    // We could use t() for "Exams" or "Assignments" if needed
    return `Total Exams: ${count}`;
  };
  if (loading) {
    return <ScreenLayout>
      <StudentHeader title={t('results.title', 'Results')} />
      <View style={styles.centerContainer}>
        <LogoLoader size={60} color="#4F46E5" />
      </View>
    </ScreenLayout>;
  }
  return <ScreenLayout>

    <TourTarget id="screen.results.overview"><StudentHeader title={t('results.title', 'Results')} /></TourTarget>

    <TourTarget id="screen.results.workspace" native><TourScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="transparent" colors={['transparent']} progressBackgroundColor="transparent" />}>
                {refreshing &&
      <View style={{ width: '100%', alignItems: 'center', paddingVertical: 20 }}>
                        <LogoLoader size={30} />
                    </View>
      }
      <Animated.View entering={FadeInUp.delay(100).duration(600)} style={styles.headerSection}>
        <Text style={styles.pageTitle}>{t('results.exam_results', 'Exam Results')}</Text>
        <Text style={styles.pageSubtitle}>{t('results.subtitle', 'Check your performance and progress reports')}</Text>
      </Animated.View>

      {summary.length === 0 ? <View style={styles.emptyContainer}>
        <Ionicons name="documents-outline" size={64} color="#D1D5DB" />
        <Text style={styles.emptyText}>No exam results available yet.</Text>
      </View> : <View style={styles.gridContainer}>
        {summary.map((item, index) => {
          const config = getExamConfig(item.exam_type);
          // Fallback title if translation key missing or dynamic type
          const title = t(config.labelKey, {
            defaultValue: item.exam_type.replace(/_/g, ' ').toUpperCase()
          });
          return <Animated.View key={item.exam_type} entering={FadeInDown.delay(200 + index * 100).duration(600)} style={styles.cardContainer}>
            <TouchableOpacity activeOpacity={0.9} onPress={() => handlePress(item.exam_type, title)} style={styles.card}>
              <View style={[styles.iconBox, {
                backgroundColor: config.accent
              }]}>
                <Ionicons name={config.icon as any} size={28} color={config.colors[1]} />
              </View>

              <View style={styles.textContainer}>
                <Text style={styles.cardTitle}>{title}</Text>
                <Text style={styles.cardSubtitle}>{getSubtitle(item.exam_type, item.exam_count)}</Text>
                {item.last_exam_date && <Text style={styles.dateText}>Last updated: {new Date(item.last_exam_date).toLocaleDateString()}</Text>}
              </View>

              <View style={styles.arrowBox}>
                <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
              </View>
            </TouchableOpacity>
          </Animated.View>;
        })}
      </View>}
    </TourScrollView></TourTarget>

  </ScreenLayout>;
};
export default ResultsScreen;
const getStyles = (theme: SchoolTheme) => {
  const c = theme.colors;
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingTop: Platform.OS === 'android' ? 30 : 0
  },
  scrollContent: {
    padding: 20
  },
  headerSection: {
    marginBottom: 25
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: c.textStrong
  },
  pageSubtitle: {
    fontSize: 14,
    color: c.textSecondary,
    marginTop: 5
  },
  gridContainer: {
    gap: 15
  },
  cardContainer: {
    width: '100%'
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.background,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: c.border,
    shadowColor: c.textPrimary,
    shadowOffset: {
      width: 0,
      height: 4
    },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 2
  },
  iconBox: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16
  },
  textContainer: {
    flex: 1
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: c.textStrong,
    marginBottom: 4
  },
  cardSubtitle: {
    fontSize: 12,
    color: c.textSecondary,
    fontWeight: '500'
  },
  arrowBox: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: c.card,
    justifyContent: 'center',
    alignItems: 'center'
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 60
  },
  emptyText: {
    marginTop: 10,
    fontSize: 16,
    color: c.textMuted
  },
  dateText: {
    fontSize: 11,
    color: c.textMuted,
    marginTop: 2
  }
});
};