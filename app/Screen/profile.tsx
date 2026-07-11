import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions, SafeAreaView, Platform, StatusBar, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import * as Haptics from '@/src/utils/haptics';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { StudentService } from '../../src/services/studentService';
import { Student } from '../../src/types/models';
import { useAuth } from '../../src/hooks/useAuth';
import { useTheme } from '../../src/hooks/useTheme';
import { Theme } from '../../src/theme/themes';
import LogoLoader from '../../src/components/LogoLoader';
import AvatarUploader from '../../src/components/AvatarUploader';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
const {
  width
} = Dimensions.get('window');
const ProfileScreen = () => {
  const {
    theme,
    isDark
  } = useTheme();
  const styles = React.useMemo(() => getStyles(theme, isDark), [theme, isDark]);
  const {
    t
  } = useTranslation();
  const router = useRouter();
  const {
    user
  } = useAuth();
  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const fetchProfile = async () => {
    // Strict Role Guard
    if (user?.role?.code !== 'student') return;
    try {
      const data = await StudentService.getProfile();
      setStudent(data);
    } catch (error) {

    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };
  useEffect(() => {
    fetchProfile();
  }, []);
  const onRefresh = () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    fetchProfile();
  };
  if (loading) {
    return <View style={styles.loadingContainer}>
      <LogoLoader size={60} color="#4F46E5" />
    </View>;
  }
  if (!student) {
    return <View style={styles.errorContainer}>
      <Text style={styles.errorText}>{t('common.error_loading_profile', 'Failed to load profile')}</Text>
      <TouchableOpacity onPress={fetchProfile} style={styles.retryButton}>
        <Text style={styles.retryText}>{t('common.retry', 'Retry')}</Text>
      </TouchableOpacity>
    </View>;
  }

  // Extract enrollment details safely
  const enrollment = student.current_enrollment || {
    class_code: 'N/A',
    class_name: 'N/A',
    section_name: 'N/A',
    roll_number: 'N/A',
    academic_year: ''
  };

  // Extract primary parent/guardian safely
  const primaryParent = student.parents?.find((p) => p.is_primary) || student.parents?.[0];
  return <SafeAreaView style={styles.container}>
    <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
    {/* Header / Banner */}
    <Animated.View entering={FadeInDown.duration(600)} style={styles.headerContainer}>
      <LinearGradient
        colors={isDark ? ['rgba(30, 41, 59, 1)', 'rgba(15, 23, 42, 1)'] : [theme.colors.primary, theme.colors.primary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerGradient}
      >
        <SafeAreaView>
          <View style={styles.headerTop}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton} hitSlop={{
              top: 10,
              bottom: 10,
              left: 10,
              right: 10
            }}>
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{t('profile.title', 'My Profile')}</Text>
            <View style={{ width: 40 }} />
          </View>
          <View style={styles.profileSummary}>
            <View style={styles.avatarContainer}>
              <AvatarUploader
                photoUrl={student.photo_url}
                name={student.display_name || `${student.first_name || ''} ${student.last_name || ''}`}
                size={104}
                ringColor="rgba(255,255,255,0.9)"
                ringWidth={4}
                onUploaded={(url) => setStudent((prev) => (prev ? { ...prev, photo_url: url } : prev))}
                onRemoved={() => setStudent((prev) => (prev ? { ...prev, photo_url: undefined } : prev))}
              />
              <View style={styles.statusBadge}>
                <View style={[styles.statusDot, {
                  backgroundColor: student.status === 'active' ? '#10B981' : '#EF4444'
                }]} />
              </View>
            </View>
            <Text style={styles.name}>{student.display_name}</Text>
            <Text style={styles.rollNo}>
              {enrollment.class_name || enrollment.class_code} - {enrollment.section_name} | Roll: {enrollment.roll_number}
            </Text>
            <BlurView intensity={isDark ? 30 : 60} tint={isDark ? "dark" : "light"} style={styles.idChip}>
              <Text style={styles.idText}>ID: {student.admission_no}</Text>
            </BlurView>
          </View>
        </SafeAreaView>
      </LinearGradient>
    </Animated.View>
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="transparent" colors={['transparent']} progressBackgroundColor="transparent" />}>
      {refreshing &&
        <View style={{ width: '100%', alignItems: 'center', paddingVertical: 20 }}>
          <LogoLoader size={30} />
        </View>
      }
      {/* Personal Info Card */}
      <Animated.View entering={FadeInUp.delay(200).duration(500).springify()} style={[styles.card, isDark && styles.cardDark]}>
        <View style={styles.cardHeader}>
          <View style={[styles.iconWrap, { backgroundColor: 'rgba(79, 70, 229, 0.1)' }]}>
            <Ionicons name="person" size={20} color="#4F46E5" />
          </View>
          <Text style={[styles.cardTitle, isDark && { color: '#F1F5F9' }]}>{t('profile.personal_info', 'Personal Information')}</Text>
        </View>
        <View style={styles.infoRow}>
          <InfoItem label={t('profile.dob', 'Date of Birth')} value={new Date(student.dob).toLocaleDateString()} icon="calendar-outline" />
          <InfoItem label={t('profile.gender', 'Gender')} value={student.gender_id === 1 ? 'Male' : 'Female'} icon="male-female-outline" />
        </View>
        <View style={styles.divider} />
        <View style={styles.infoRow}>
          <InfoItem label={t('profile.email', 'Email')} value={student.email || 'N/A'} icon="mail-outline" />
          <InfoItem label={t('profile.phone', 'Phone')} value={student.phone || 'N/A'} icon="call-outline" />
        </View>
      </Animated.View>
      {/* Parent Info Card */}
      {primaryParent && <Animated.View entering={FadeInUp.delay(300).duration(500).springify()} style={[styles.card, isDark && styles.cardDark]}>
        <View style={styles.cardHeader}>
          <View style={[styles.iconWrap, { backgroundColor: 'rgba(245, 158, 11, 0.1)' }]}>
            <Ionicons name="people" size={20} color="#F59E0B" />
          </View>
          <Text style={[styles.cardTitle, isDark && { color: '#F1F5F9' }]}>{t('profile.guardian_info', 'Guardian Details')}</Text>
        </View>
        <View style={styles.infoRow}>
          <InfoItem label={t('profile.guardian_name', 'Name')} value={`${[primaryParent.first_name, primaryParent.last_name].filter(Boolean).join(' ')} (${primaryParent.relation})`} icon="person-outline" />
        </View>
        <View style={styles.divider} />
        <View style={styles.infoRow}>
          <InfoItem label={t('profile.guardian_phone', 'Phone')} value={primaryParent.phone || 'N/A'} icon="call-outline" />
          <InfoItem label={t('profile.occupation', 'Occupation')} value={primaryParent.occupation || 'N/A'} icon="briefcase-outline" />
        </View>
      </Animated.View>}
      {/* Other Details - Skeleton for future expansion */}
      <Animated.View entering={FadeInUp.delay(400).duration(500).springify()} style={[styles.card, isDark && styles.cardDark]}>
        <View style={styles.cardHeader}>
          <View style={[styles.iconWrap, { backgroundColor: 'rgba(16, 185, 129, 0.1)' }]}>
            <Ionicons name="school" size={20} color="#10B981" />
          </View>
          <Text style={[styles.cardTitle, isDark && { color: '#F1F5F9' }]}>{t('profile.academic_info', 'Academic Details')}</Text>
        </View>
        <View style={styles.infoRow}>
          <InfoItem label={t('profile.admission_date', 'Admission Date')} value={new Date(student.admission_date).toLocaleDateString()} icon="calendar-number-outline" />
          <InfoItem label={t('profile.academic_year', 'Academic Year')} value={enrollment.academic_year || 'Current'} icon="time-outline" />
        </View>
      </Animated.View>
      <View style={{
        height: 40
      }} />
    </ScrollView>
  </SafeAreaView>;
};
const InfoItem = ({
  label,
  value,
  icon

}: { label: string; value: string; icon: any; }) => {
  const {
    theme,
    isDark
  } = useTheme();
  const styles = React.useMemo(() => getStyles(theme, isDark), [theme, isDark]);
  return <View style={styles.infoItem}>
    <View style={styles.labelRow}>
      <Ionicons name={icon} size={14} color={isDark ? "#94A3B8" : "#64748B"} />
      <Text style={[styles.infoLabel, isDark && { color: '#94A3B8' }]}>{label}</Text>
    </View>
    <Text style={[styles.infoValue, isDark && { color: '#F8FAFC' }]}>{value}</Text>
  </View>;
};
export default ProfileScreen;
const getStyles = (theme: Theme, isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent'
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.card
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  errorText: {
    fontSize: 16,
    color: '#EF4444',
    marginBottom: 12
  },
  retryButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: theme.colors.primary,
    borderRadius: 8
  },
  retryText: {
    color: theme.colors.background,
    fontWeight: '600'
  },
  headerContainer: {
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
    overflow: 'hidden',
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.3,
    shadowRadius: 32,
    elevation: 14,
    zIndex: 10,
  },
  headerGradient: {
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight || 20 : 0,
    paddingBottom: 30,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 20,
    height: 56
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)'
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.background
  },
  profileSummary: {
    alignItems: 'center'
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 12
  },
  avatar: {
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  statusBadge: {
    position: 'absolute',
    bottom: 2,
    right: 6,
    backgroundColor: theme.colors.background,
    padding: 4,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 4
  },
  statusDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#10B981'
  },
  name: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 6,
    letterSpacing: 0.5
  },
  rollNo: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.85)',
    marginBottom: 16,
    fontWeight: '600',
    letterSpacing: 0.2
  },
  idChip: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  idText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5
  },
  scrollContent: {
    padding: 16,
    paddingTop: 24
  },
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: 32,
    padding: 24,
    marginBottom: 24,
    shadowColor: isDark ? '#000' : theme.colors.primary,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: isDark ? 0.35 : 0.12,
    shadowRadius: 24,
    elevation: 8,
    borderWidth: 1.5,
    borderBottomWidth: 6,
    borderColor: theme.colors.border,
    borderBottomColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.15)'
  },
  cardDark: {
    backgroundColor: 'rgba(30, 41, 59, 0.7)',
    borderColor: 'rgba(255,255,255,0.05)',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 12
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center'
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: 0.3
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 16
  },
  infoItem: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F8FAFC',
    padding: 14,
    borderRadius: 20,
    borderWidth: 1.2,
    borderBottomWidth: 3,
    borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(226, 232, 240, 0.8)',
    borderBottomColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(15,23,42,0.1)',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4
  },
  infoLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    fontWeight: '500'
  },
  infoValue: {
    fontSize: 15,
    color: '#111827',
    fontWeight: '600'
  },
  divider: {
    height: 8
  }
});