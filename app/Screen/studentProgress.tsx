import { TourTarget, TourScrollView } from '@/src/features/app-tour';
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ScreenLayout from '../../src/components/ScreenLayout';
import StudentHeader from '../../src/components/StudentHeader';
import { useTheme } from '../../src/hooks/useTheme';
import { clayCard } from '../../src/theme/clayStyles';
import { IntelligenceService, StudentInsight } from '../../src/services/intelligenceService';

export default function StudentProgressScreen() {
  const { theme, isDark } = useTheme();
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [insights, setInsights] = useState<StudentInsight[]>([]);

  const load = useCallback(async () => {
    try {
      const data = await IntelligenceService.getMyProgress();
      setItems(data?.timeline?.items || []);
      setInsights((data?.insights || []).filter((row) => row.parent_visible));
    } catch (err) {
      console.warn('Failed to load approved progress', err);
      setItems([]);
      setInsights([]);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const cardStyle = clayCard(isDark, 'md');
  const primaryColor = theme.colors.primary || '#6366F1';

  return (
    <ScreenLayout>
      <TourTarget id="screen.screen-student-progress.overview"><StudentHeader title="My Progress" /></TourTarget>
      <TourTarget id="screen.screen-student-progress.workspace" native><TourScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => {
              setIsRefreshing(true);
              load();
            }}
            tintColor={primaryColor}
          />
        }
      >
        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={primaryColor} />
          </View>
        ) : (
          <>
            <View style={[cardStyle, styles.introCard]}>
              <Text style={[styles.introTitle, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>
                Approved progress
              </Text>
              <Text style={[styles.introBody, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                Achievements, recognitions, and teacher feedback that the school has shared with families.
              </Text>
            </View>

            {insights.map((insight) => (
              <View key={insight.id} style={[cardStyle, styles.itemCard]}>
                <View style={styles.row}>
                  <Ionicons name="star" size={16} color="#10B981" />
                  <Text style={[styles.itemTitle, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>
                    {insight.title}
                  </Text>
                </View>
                <Text style={[styles.itemBody, { color: isDark ? '#CBD5E1' : '#475569' }]}>
                  {insight.summary}
                </Text>
              </View>
            ))}

            {items.map((item) => (
              <View key={`${item.event_type}-${item.id}`} style={[cardStyle, styles.itemCard]}>
                <Text style={[styles.itemKicker, { color: primaryColor }]}>
                  {item.category_name || item.event_type}
                </Text>
                <Text style={[styles.itemTitle, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>
                  {item.title}
                </Text>
                <Text style={[styles.itemBody, { color: isDark ? '#CBD5E1' : '#475569' }]}>
                  {item.description}
                </Text>
              </View>
            ))}

            {insights.length === 0 && items.length === 0 ? (
              <View style={[cardStyle, styles.emptyCard]}>
                <Ionicons name="sparkles-outline" size={36} color={isDark ? '#475569' : '#94A3B8'} />
                <Text style={[styles.emptyTitle, { color: isDark ? '#F8FAFC' : '#0F172A' }]}>
                  No shared updates yet
                </Text>
                <Text style={[styles.introBody, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                  When teachers share an achievement or approved note, it will appear here.
                </Text>
              </View>
            ) : null}
          </>
        )}
      </TourScrollView></TourTarget>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40, gap: 12 },
  center: { paddingTop: 80, alignItems: 'center' },
  introCard: { padding: 16, borderRadius: 20 },
  introTitle: { fontSize: 18, fontWeight: '700', marginBottom: 6 },
  introBody: { fontSize: 14, lineHeight: 20 },
  itemCard: { padding: 16, borderRadius: 20, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemKicker: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  itemTitle: { fontSize: 16, fontWeight: '700' },
  itemBody: { fontSize: 14, lineHeight: 20 },
  emptyCard: { padding: 24, alignItems: 'center', gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700' },
});
