import { TourTarget, TourScrollView } from '@/src/features/app-tour';
import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import ScreenLayout from '../../src/components/ScreenLayout';
import StudentHeader from '../../src/components/StudentHeader';
const examLinks = ['Scholarship Exams', '"SFI" Talent Test', 'Navodaya Application', 'Gurkula Application', 'PolyCET Application', 'IIIT Application'];
import { useAuth } from '../../src/hooks/useAuth';
import { useTheme } from '../../src/hooks/useTheme';
const ExamLinksScreen = () => {
  const {
    theme,
    isDark
  } = useTheme();
  const styles = React.useMemo(() => getStyles(), []);
  const {
    user
  } = useAuth();
  return <ScreenLayout>

    {/* ===== HEADER ===== */}
    <TourTarget id="screen.screen-exam-links.overview"><StudentHeader showBackButton={true} title="Exams" /></TourTarget>

    {/* ===== CONTENT ===== */}
    <TourTarget id="screen.screen-exam-links.workspace" native><TourScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.container}>

      {/* TITLE */}
      <Text style={styles.pageTitle}>Important Exam Links</Text>

      {/* STUDENT INFO CARD */}
      <View style={styles.studentCard}>
        <View style={styles.avatar} />
        <View>
          <Text style={styles.infoText}>Name: {user?.name || 'Student'}</Text>
          <Text style={styles.infoText}>Class/sec: {user?.classId || 'N/A'}</Text>
          <Text style={styles.infoText}>Roll No: {user?.rollNo || 'N/A'}</Text>
          <Text style={styles.infoText}>Admission No: {(user as any)?.admissionNo || 'N/A'}</Text>
        </View>
      </View>

      {/* LINKS SECTION */}
      <Text style={styles.sectionTitle}>Links</Text>

      {examLinks.map((item, index) => {
        return <TouchableOpacity key={index} style={styles.linkCard} activeOpacity={0.85} onPress={() => {
          // TODO: open external link
        }}>
          <Text style={styles.linkText}>{item}</Text>
          <Text style={styles.arrow}>›</Text>
        </TouchableOpacity>;
      })}

    </TourScrollView></TourTarget>

  </ScreenLayout>;
};
export default ExamLinksScreen;

/* ============================ STYLES ============================ */

const getStyles = () => StyleSheet.create({
  container: {
    padding: 16,
    paddingBottom: 30
  },
  /* Page title */
  pageTitle: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 12
  },
  /* Student info */
  studentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#d8ecef',
    padding: 14,
    borderRadius: 16,
    marginBottom: 16,
    elevation: 3
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#9ca3af',
    marginRight: 12
  },
  infoText: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2
  },
  /* Section title */
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 10
  },
  /* Link card */
  linkCard: {
    backgroundColor: '#cfe9ef',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    elevation: 2
  },
  linkText: {
    fontSize: 17,
    fontWeight: '700'
  },
  arrow: {
    fontSize: 22,
    fontWeight: '700',
    color: '#555'
  }
});