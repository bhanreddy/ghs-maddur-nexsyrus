import { TourTarget, TourScrollView } from '@/src/features/app-tour';
import React, { useState } from 'react';
import AppTextInput from '@/src/components/AppTextInput';

import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions } from 'react-native';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import { Ionicons, Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AdminHeader from '../../src/components/AdminHeader';
import { ADMIN_THEME } from '../../src/constants/adminTheme';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTheme } from '../../src/hooks/useTheme';
import LogoLoader from '../../src/components/LogoLoader';
import { api } from '../../src/services/apiClient';
const {
  width
} = Dimensions.get('window');

// --- Types ---
interface ComplaintSummary {
  total: number;
  resolved: number;
  pending: number;
  critical: number; // e.g. Behavioral issues
}
interface SubjectPerformance {
  subject: string;
  prevMarks: number;
  currMarks: number;
  maxMarks: number;
}
interface StudentTrackerData {
  id: string;
  name: string;
  class: string;
  rollNo: string;
  guardian: string;
  contact: string;
  attendance: number; // percentage
  complaints: ComplaintSummary;
  performance: SubjectPerformance[];
  // Insight: e.g., "Trending Up", "Needs Attention"
  status: 'improving' | 'declining' | 'stable';
}

// --- Mock Data Service ---
const MOCK_TRACKER_DB: Record<string, StudentTrackerData> = {
  '101': {
    id: '101',
    name: 'Rohan Sharma',
    class: 'Class X - A',
    rollNo: '24',
    guardian: 'Mr. Rajesh Sharma',
    contact: '+91 98765 43210',
    attendance: 92,
    complaints: {
      total: 2,
      resolved: 2,
      pending: 0,
      critical: 0
    },
    status: 'improving',
    performance: [{
      subject: 'Math',
      prevMarks: 75,
      currMarks: 88,
      maxMarks: 100
    }, {
      subject: 'Science',
      prevMarks: 70,
      currMarks: 82,
      maxMarks: 100
    }, {
      subject: 'English',
      prevMarks: 80,
      currMarks: 85,
      maxMarks: 100
    }, {
      subject: 'Social',
      prevMarks: 85,
      currMarks: 84,
      maxMarks: 100
    } // slight dip
    ]
  },
  '102': {
    id: '102',
    name: 'Priya Reddy',
    class: 'Class X - A',
    rollNo: '25',
    guardian: 'Mr. Suresh Reddy',
    contact: '+91 99887 76655',
    attendance: 96,
    complaints: {
      total: 0,
      resolved: 0,
      pending: 0,
      critical: 0
    },
    status: 'stable',
    performance: [{
      subject: 'Math',
      prevMarks: 90,
      currMarks: 92,
      maxMarks: 100
    }, {
      subject: 'Science',
      prevMarks: 88,
      currMarks: 90,
      maxMarks: 100
    }, {
      subject: 'English',
      prevMarks: 92,
      currMarks: 94,
      maxMarks: 100
    }, {
      subject: 'Social',
      prevMarks: 90,
      currMarks: 91,
      maxMarks: 100
    }]
  },
  '103': {
    id: '103',
    name: 'Amit Kumar',
    class: 'Class X - B',
    rollNo: '05',
    guardian: 'Mr. Deepak Kumar',
    contact: '+91 88776 65544',
    attendance: 75,
    complaints: {
      total: 5,
      resolved: 3,
      pending: 2,
      critical: 1
    },
    status: 'declining',
    performance: [{
      subject: 'Math',
      prevMarks: 45,
      currMarks: 32,
      maxMarks: 100
    },
    // Fail
    {
      subject: 'Science',
      prevMarks: 50,
      currMarks: 40,
      maxMarks: 100
    }, {
      subject: 'English',
      prevMarks: 55,
      currMarks: 45,
      maxMarks: 100
    }, {
      subject: 'Social',
      prevMarks: 60,
      currMarks: 50,
      maxMarks: 100
    }]
  }
};
const fetchStudentTracker = async (id: string): Promise<StudentTrackerData> => {
  try {
    const result = await api.get<StudentTrackerData>(`/admin/analytics/student-progress-tracker/${encodeURIComponent(id)}`);
    return result;
  } catch (err: any) {
    if (MOCK_TRACKER_DB[id]) return MOCK_TRACKER_DB[id];
    throw new Error(err?.response?.data?.error || err?.message || 'Student not found');
  }
};
export default function StudentProgressTracker() {
  const {
    theme,
    isDark
  } = useTheme();
  const styles = React.useMemo(() => getStyles(), []);
  const [studentId, setStudentId] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<StudentTrackerData | null>(null);
  const handleSearch = async () => {
    if (!studentId.trim()) {
      alertCompat('Required', 'Please enter a Student ID or Admission No (e.g., 101, ADM-001)');
      return;
    }
    setLoading(true);
    setData(null);
    try {
      const result = await fetchStudentTracker(studentId);
      setData(result);
    } catch (e: any) {
      alertCompat('Error', e?.message || 'Student Not Found. Please verify admission number or ID.');
    } finally {
      setLoading(false);
    }
  };

  // --- Components ---

  const renderHeader = () => {
    if (!data) return null;
    const statusColor = data.status === 'improving' ? ADMIN_THEME.colors.success : data.status === 'declining' ? ADMIN_THEME.colors.danger : ADMIN_THEME.colors.warning;
    const statusIcon = data.status === 'improving' ? 'trending-up' : data.status === 'declining' ? 'trending-down' : 'minus';
    return <Animated.View entering={FadeInDown} style={styles.card}>
      <View style={styles.headerTop}>
        <View>
          <Text style={styles.studentName}>{data.name}</Text>
          <Text style={styles.studentDetail}>{data.class} • Roll: {data.rollNo}</Text>
          <Text style={styles.studentDetail}>Guardian: {data.guardian}</Text>
        </View>
        <View style={[styles.statusBadge, {
          backgroundColor: statusColor + '20'
        }]}>
          <Feather name={statusIcon} size={16} color={statusColor} />
          <Text style={[styles.statusText, {
            color: statusColor
          }]}>{data.status.toUpperCase()}</Text>
        </View>
      </View>

      <View style={styles.divider} />

      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Attendance</Text>
          <Text style={[styles.statValue, {
            color: data.attendance < 75 ? ADMIN_THEME.colors.danger : ADMIN_THEME.colors.text.primary
          }]}>
            {data.attendance}%
          </Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Avg Score</Text>
          <Text style={styles.statValue}>
            {Math.round(data.performance.reduce((acc, curr) => acc + curr.currMarks, 0) / data.performance.length)}%
          </Text>
        </View>
      </View>
    </Animated.View>;
  };
  const renderComplaints = () => {
    if (!data) return null;
    const {
      total,
      resolved,
      pending,
      critical
    } = data.complaints;
    return <Animated.View entering={FadeInDown.delay(100)}>
      <Text style={styles.sectionTitle}>Complaints & Discipline</Text>
      <View style={styles.complaintGrid}>
        <View style={[styles.complaintCard, {
          backgroundColor: '#F1F5F9'
        }]}>
          <Text style={styles.compValue}>{total}</Text>
          <Text style={styles.compLabel}>Total</Text>
        </View>
        <View style={[styles.complaintCard, {
          backgroundColor: '#ECFDF5'
        }]}>
          <Text style={[styles.compValue, {
            color: ADMIN_THEME.colors.success
          }]}>{resolved}</Text>
          <Text style={styles.compLabel}>Resolved</Text>
        </View>
        <View style={[styles.complaintCard, {
          backgroundColor: '#FEF2F2',
          borderColor: critical > 0 ? ADMIN_THEME.colors.danger : 'transparent',
          borderWidth: critical > 0 ? 1 : 0
        }]}>
          <Text style={[styles.compValue, {
            color: ADMIN_THEME.colors.danger
          }]}>{pending}</Text>
          <Text style={styles.compLabel}>Pending</Text>
          {critical > 0 && <View style={styles.criticalBadge}>
            <Text style={styles.criticalText}>{critical} Critical</Text>
          </View>}
        </View>
      </View>
    </Animated.View>;
  };
  const renderComparison = () => {
    if (!data) return null;
    return <Animated.View entering={FadeInDown.delay(200)}>
      <Text style={styles.sectionTitle}>Academic Comparison (Prev vs Curr)</Text>
      <View style={styles.card}>
        {data.performance.map((sub, i) => {
          const diff = sub.currMarks - sub.prevMarks;
          const isPos = diff >= 0;
          return <View key={i} style={styles.subjectRow}>
            <View style={styles.subjectInfo}>
              <Text style={styles.subjectName}>{sub.subject}</Text>
              <View style={styles.markBadge}>
                <Text style={[styles.markText, {
                  color: isPos ? ADMIN_THEME.colors.success : ADMIN_THEME.colors.danger
                }]}>
                  {isPos ? '+' : ''}{diff}
                </Text>
                <Feather name={isPos ? 'arrow-up' : 'arrow-down'} size={12} color={isPos ? ADMIN_THEME.colors.success : ADMIN_THEME.colors.danger} />
              </View>
            </View>

            <View style={styles.barContainer}>
              {/* Previous Marks Bar */}
              <View style={styles.barWrapper}>
                <View style={[styles.bar, {
                  width: `${sub.prevMarks}%`,
                  backgroundColor: '#CBD5E1'
                }]} />
                <Text style={styles.barLabel}>{sub.prevMarks}</Text>
              </View>
              {/* Current Marks Bar */}
              <View style={styles.barWrapper}>
                <View style={[styles.bar, {
                  width: `${sub.currMarks}%`,
                  backgroundColor: isPos ? ADMIN_THEME.colors.primary : ADMIN_THEME.colors.danger
                }]} />
                <Text style={[styles.barLabel, {
                  fontWeight: '700'
                }]}>{sub.currMarks}</Text>
              </View>
            </View>
          </View>;
        })}
      </View>
    </Animated.View>;
  };
  return <View style={styles.root}>
    <LinearGradient colors={[ADMIN_THEME.colors.background.app, '#F0F4FF']} style={StyleSheet.absoluteFill} />
    <TourTarget id="screen.admin-student-progress-tracker.overview"><AdminHeader title="Parent-Principal Meeting" showBackButton /></TourTarget>

    <TourTarget id="screen.admin-student-progress-tracker.workspace" native><TourScrollView contentContainerStyle={styles.scroll}>
      <View style={styles.content}>

        {/* Search Input */}
        <Text style={styles.label}>Connect Student Profile</Text>
        <View style={styles.inputRow}>
          <View style={styles.inputWrapper}>
            <Ionicons name="search-outline" size={20} color="#64748B" style={{
              marginRight: 8
            }} />
            <AppTextInput style={styles.input} placeholder="Enter Student ID (101, 102, 103)" placeholderTextColor="#94A3B8" value={studentId} onChangeText={setStudentId} />
          </View>
          <TouchableOpacity style={styles.searchBtn} onPress={handleSearch} disabled={loading}>
            {loading ? <LogoLoader color="#FFF" /> : <Feather name="arrow-right" size={20} color="#FFF" />}
          </TouchableOpacity>
        </View>

        {data && <>
          <View style={{
            height: 20
          }} />
          {renderHeader()}
          <View style={{
            height: 24
          }} />
          {renderComplaints()}
          <View style={{
            height: 24
          }} />
          {renderComparison()}
        </>}

      </View>
    </TourScrollView></TourTarget>
  </View>;
}
const getStyles = () => StyleSheet.create({
  root: {
    flex: 1
  },
  scroll: {
    paddingBottom: 40
  },
  content: {
    padding: 20
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: ADMIN_THEME.colors.text.secondary,
    marginBottom: 8
  },
  inputRow: {
    flexDirection: 'row',
    gap: 12
  },
  inputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 50,
    ...ADMIN_THEME.shadows.sm
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: ADMIN_THEME.colors.text.primary
  },
  searchBtn: {
    width: 50,
    height: 50,
    borderRadius: 12,
    backgroundColor: ADMIN_THEME.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...ADMIN_THEME.shadows.sm
  },
  // Header Card
  card: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 20,
    ...ADMIN_THEME.shadows.sm
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start'
  },
  studentName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1E293B',
    marginBottom: 4
  },
  studentDetail: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500'
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 4
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700'
  },
  divider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 16
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around'
  },
  statItem: {
    alignItems: 'center'
  },
  statLabel: {
    fontSize: 12,
    color: '#64748B',
    textTransform: 'uppercase',
    marginBottom: 4
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A'
  },
  // Complaints
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 12
  },
  complaintGrid: {
    flexDirection: 'row',
    gap: 12
  },
  complaintCard: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 100
  },
  compValue: {
    fontSize: 24,
    fontWeight: '800',
    color: '#334155',
    marginBottom: 4
  },
  compLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600'
  },
  criticalBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#EF4444',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8
  },
  criticalText: {
    color: '#FFF',
    fontSize: 9,
    fontWeight: '700'
  },
  // Comparison
  subjectRow: {
    marginBottom: 20
  },
  subjectInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8
  },
  subjectName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#334155'
  },
  markBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  markText: {
    fontSize: 13,
    fontWeight: '700'
  },
  barContainer: {
    gap: 6
  },
  barWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  bar: {
    height: 10,
    borderRadius: 5
  },
  barLabel: {
    fontSize: 11,
    color: '#64748B',
    width: 24,
    textAlign: 'right'
  }
});