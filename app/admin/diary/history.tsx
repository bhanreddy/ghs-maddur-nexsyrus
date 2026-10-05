import { TourTarget, TourScrollView } from '@/src/features/app-tour';
import React, { useCallback, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useTheme } from '../../../src/hooks/useTheme';
import AdminHeader from '../../../src/components/AdminHeader';
import LogoLoader from '../../../src/components/LogoLoader';
import AppDatePicker, { toYMD } from '../../../src/components/AppDatePicker';
import { ClassService, ClassInfo, Section } from '../../../src/services/classService';
import { api } from '../../../src/services/apiClient';
import { alertCompat } from '../../../src/utils/crossPlatformAlert';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import { DiaryPhotoStrip, diaryPhotoUrls, diarySourceLabel, isPhotoOnlyDiary } from '../../../src/components/diary/DiaryPhotoStrip';

interface DiaryEntry {
  id: string;
  entry_date: string;
  title?: string | null;
  content: string;
  created_at: string;
  subject_name?: string | null;
  teacher_name?: string | null;
  class_name?: string | null;
  section_name?: string | null;
  attachments?: unknown;
  entry_source?: string | null;
}

export default function AdminDiaryHistoryScreen() {
  const { theme, isDark } = useTheme();

  // Theme colors
  const pageBg = isDark ? '#0E0F1A' : '#F2F3F8';
  const cardBg = isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const titleColor = isDark ? '#FFFFFF' : '#111827';
  const subColor = isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)';
  const chipBg = isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF';
  const chipActiveBg = '#7C6FFF';
  const chipBorder = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)';

  // State
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [selectedSection, setSelectedSection] = useState<string>('');
  
  const [selectedDate, setSelectedDate] = useState<string>(toYMD(new Date()));
  
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Initial Load
  useEffect(() => {
    const loadMetadata = async () => {
      try {
        const [clsData, secData] = await Promise.all([
          ClassService.getClasses(),
          ClassService.getSections(),
        ]);
        setClasses(clsData);
        setSections(secData);
      } catch (err) {
        console.log('Error loading metadata', err);
      }
    };
    loadMetadata();
  }, []);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { date: selectedDate };
      if (selectedClass) params.class_id = selectedClass;
      if (selectedSection) params.section_id = selectedSection;
      
      const data = await api.get<DiaryEntry[]>('/admin/diary/history', params);
      setEntries(data || []);
    } catch (err: any) {
      alertCompat('Error', err.message || 'Failed to fetch history');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedClass, selectedSection, selectedDate]);

  useFocusEffect(
    useCallback(() => {
      void fetchHistory();
    }, [fetchHistory]),
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchHistory();
  };

  return (
    <View style={[styles.container, { backgroundColor: pageBg }]}>
      <TourTarget id="screen.admin-diary-history.overview"><AdminHeader
        title="Diary History"
        showBackButton
      /></TourTarget>

      <View style={styles.filterContainer}>
        {/* Date Selection */}
        <View style={styles.datePickerContainer}>
          <AppDatePicker
            label="Select Date"
            value={selectedDate}
            onChange={setSelectedDate}
            containerStyle={{ marginBottom: 12 }}
          />
        </View>

        {/* Class Selection */}
        <TourTarget id="screen.admin-diary-history.workspace" native><View style={styles.filterRow}>
          <Text style={[styles.filterLabel, { color: subColor }]}>CLASS:</Text>
          <TourScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 20 }}>
            <TouchableOpacity
              style={[
                styles.chip,
                { backgroundColor: chipBg, borderColor: chipBorder },
                !selectedClass && { backgroundColor: chipActiveBg, borderColor: chipActiveBg }
              ]}
              onPress={() => setSelectedClass('')}
            >
              <Text style={[styles.chipText, { color: titleColor }, !selectedClass && styles.chipTextActive]}>All</Text>
            </TouchableOpacity>
            {classes.map(cls => (
              <TouchableOpacity
                key={cls.id}
                style={[
                  styles.chip,
                  { backgroundColor: chipBg, borderColor: chipBorder },
                  selectedClass === cls.id && { backgroundColor: chipActiveBg, borderColor: chipActiveBg }
                ]}
                onPress={() => setSelectedClass(cls.id)}
              >
                <Text style={[styles.chipText, { color: titleColor }, selectedClass === cls.id && styles.chipTextActive]}>{cls.name}</Text>
              </TouchableOpacity>
            ))}
          </TourScrollView>
        </View></TourTarget>

        {/* Section Selection */}
        <View style={styles.filterRow}>
          <Text style={[styles.filterLabel, { color: subColor }]}>SECTION:</Text>
          <TourScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 20 }}>
            <TouchableOpacity
              style={[
                styles.chip,
                { backgroundColor: chipBg, borderColor: chipBorder },
                !selectedSection && { backgroundColor: chipActiveBg, borderColor: chipActiveBg }
              ]}
              onPress={() => setSelectedSection('')}
            >
              <Text style={[styles.chipText, { color: titleColor }, !selectedSection && styles.chipTextActive]}>All</Text>
            </TouchableOpacity>
            {sections.map(sec => (
              <TouchableOpacity
                key={sec.id}
                style={[
                  styles.chip,
                  { backgroundColor: chipBg, borderColor: chipBorder },
                  selectedSection === sec.id && { backgroundColor: chipActiveBg, borderColor: chipActiveBg }
                ]}
                onPress={() => setSelectedSection(sec.id)}
              >
                <Text style={[styles.chipText, { color: titleColor }, selectedSection === sec.id && styles.chipTextActive]}>{sec.name}</Text>
              </TouchableOpacity>
            ))}
          </TourScrollView>
        </View>
      </View>

      <TourScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7C6FFF" />}
      >
        {loading && !refreshing ? (
          <View style={styles.centerBox}>
            <LogoLoader size={40} color="#7C6FFF" />
          </View>
        ) : entries.length === 0 ? (
          <Animated.View entering={ZoomIn} style={styles.emptyBox}>
            <Ionicons name="search-outline" size={48} color={subColor} style={{ opacity: 0.5 }} />
            <Text style={[styles.emptyTitle, { color: titleColor }]}>No Records Found</Text>
            <Text style={[styles.emptySub, { color: subColor }]}>There are no diary entries for the selected date and filters.</Text>
          </Animated.View>
        ) : (
          entries.map((entry, index) => {
            const timeStr = new Date(entry.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const photos = diaryPhotoUrls(entry.attachments);
            const photoOnly = isPhotoOnlyDiary(entry.content, entry.attachments);
            const sourceLabel = diarySourceLabel(entry.entry_source, photos.length > 0);
            const classLabel = entry.class_name ? `${entry.class_name}${entry.section_name || ''}` : null;
            return (
              <Animated.View
                key={entry.id}
                entering={FadeInDown.delay(index * 50).duration(400).springify()}
                style={[styles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.teacherInfo}>
                    <View style={styles.avatar}>
                      <Ionicons name={photos.length ? 'camera-outline' : 'person-outline'} size={16} color="#FFF" />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.teacherName, { color: titleColor }]}>{entry.teacher_name || 'Teacher'}</Text>
                      <Text style={[styles.subjectName, { color: subColor }]}>
                        {[classLabel, entry.subject_name || 'General', sourceLabel].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.timeText, { color: subColor }]}>{timeStr}</Text>
                </View>
                <View style={[styles.divider, { backgroundColor: cardBorder }]} />
                {entry.title && !photoOnly ? (
                  <Text style={[styles.teacherName, { color: titleColor, marginBottom: 6 }]}>{entry.title}</Text>
                ) : null}
                {photoOnly ? null : (
                  <Text style={[styles.content, { color: titleColor }]}>{entry.content}</Text>
                )}
                <DiaryPhotoStrip attachments={entry.attachments} hintColor={subColor} />
              </Animated.View>
            );
          })
        )}
      </TourScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  filterContainer: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(124,111,255,0.1)',
  },
  datePickerContainer: {
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 20,
    marginBottom: 8,
  },
  filterLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    width: 60,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#FFF',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 80,
  },
  centerBox: {
    paddingVertical: 100,
    alignItems: 'center',
  },
  emptyBox: {
    alignItems: 'center',
    paddingTop: 80,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  emptySub: {
    fontSize: 14,
    textAlign: 'center',
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  teacherInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#7C6FFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  teacherName: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  subjectName: {
    fontSize: 13,
    fontWeight: '500',
  },
  timeText: {
    fontSize: 12,
    fontWeight: '500',
  },
  divider: {
    height: 1,
    marginVertical: 12,
  },
  content: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400',
  },
});
