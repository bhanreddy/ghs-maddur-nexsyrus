import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  StatusBar, RefreshControl, Linking, Modal,
} from 'react-native';
import ScreenLayout from '../../src/components/ScreenLayout';
import StudentHeader from '../../src/components/StudentHeader';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { api } from '../../src/services/apiClient';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import LogoLoader from '../../src/components/LogoLoader';
import { useTheme } from '../../src/hooks/useTheme';

interface StudentInfo {
  student_id: string;
  student_name: string;
  admission_no: string | null;
  class_name: string | null;
  section_name: string | null;
  phone_contacts: PhoneContact[];
}

interface PhoneContact {
  relationship: string;
  contact_name: string | null;
  phone: string;
  is_primary: boolean;
}

interface StopInfo {
  stop_id: string;
  stop_name: string;
  stop_order: number;
  students: StudentInfo[];
}

interface RouteInfo {
  id: string;
  name: string;
  direction: string;
  stops: StopInfo[];
}

export default function DriverStudents() {
  const [routes, setRoutes] = useState<RouteInfo[]>([]);
  const [selectedRouteIdx, setSelectedRouteIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [callContacts, setCallContacts] = useState<PhoneContact[]>([]);
  const [callStudentName, setCallStudentName] = useState('');
  const { theme } = useTheme();
  const PRIMARY_GRADIENT: [string, string] = [theme.colors.primary, theme.colors.primaryDark];
  const s = React.useMemo(() => getStyles(theme), [theme]);

  const fetchStudents = useCallback(async () => {
    try {
      const data = await api.get<any>('/transport/driver/my-students');
      setRoutes(data.routes || []);
    } catch (e: any) {
      alertCompat('Error', e?.message || 'Failed to load students');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchStudents(); }, [fetchStudents]);

  const onRefresh = () => { setRefreshing(true); fetchStudents(); };

  const currentRoute = routes[selectedRouteIdx] || null;

  // Flatten students for stats
  const allStudents = currentRoute?.stops?.flatMap((s) => s.students) || [];
  const totalStudents = allStudents.length;
  const totalStops = currentRoute?.stops?.length || 0;
  const stopsWithStudents = currentRoute?.stops?.filter((s) => s.students.length > 0).length || 0;

  const dialPhone = async (phone: string) => {
    setCallContacts([]);
    try {
      await Linking.openURL(`tel:${encodeURIComponent(phone.trim())}`);
    } catch {
      alertCompat('Call unavailable', `Could not open the phone app for ${phone}.`);
    }
  };

  const openCallOptions = (student: StudentInfo) => {
    const contacts = (student.phone_contacts || []).filter((contact) => contact.phone?.trim());
    if (contacts.length === 0) {
      alertCompat('No Phone', 'No phone number is linked to this student or their family contacts.');
      return;
    }
    if (contacts.length === 1) {
      void dialPhone(contacts[0].phone);
      return;
    }
    setCallStudentName(student.student_name || 'student');
    setCallContacts(contacts);
  };

  /* ─── Loading State ─── */
  if (loading) {
    return (
      <ScreenLayout>
        <StudentHeader title="Passenger Roster" menuUserType="driver" />
        <View style={s.center}><LogoLoader size={60} color={theme.colors.primary} /></View>
      </ScreenLayout>
    );
  }

  /* ─── Empty State ─── */
  if (routes.length === 0) {
    return (
      <ScreenLayout>
        <StatusBar barStyle="dark-content" />
        <StudentHeader title="Passenger Roster" menuUserType="driver" />
        <View style={s.center}>
          <View style={s.emptyIcon}>
            <Ionicons name="people-outline" size={48} color="#CBD5E1" />
          </View>
          <Text style={s.emptyTitle}>No Students Assigned</Text>
          <Text style={s.emptySub}>
            Students will appear here once they are assigned to your route.
          </Text>
        </View>
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout>
      <StatusBar barStyle="light-content" />
      <StudentHeader title="Passenger Roster" menuUserType="driver" />

      <FlatList
        data={currentRoute?.stops || []}
        keyExtractor={(item) => item.stop_id}
        contentContainerStyle={s.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh}
            tintColor="transparent" colors={['transparent']}
            progressBackgroundColor="transparent" />
        }
        ListHeaderComponent={
          <>
            {refreshing && (
              <View style={{ width: '100%', alignItems: 'center', paddingVertical: 16 }}>
                <LogoLoader size={30} />
              </View>
            )}

            {/* ═══════ Hero Card ═══════ */}
            <Animated.View entering={FadeInDown.delay(80).duration(500)} style={s.heroWrap}>
              <LinearGradient colors={PRIMARY_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.hero}>
                <View style={[s.heroDecor, { top: -30, right: -30, width: 120, height: 120 }]} />
                <View style={[s.heroDecor, { bottom: -15, left: -15, width: 60, height: 60 }]} />

                <View style={s.heroRow}>
                  <View style={s.heroStatBox}>
                    <Text style={s.heroStatNum}>{totalStudents}</Text>
                    <Text style={s.heroStatLabel}>Students</Text>
                  </View>
                  <View style={s.heroStatDivider} />
                  <View style={s.heroStatBox}>
                    <Text style={s.heroStatNum}>{totalStops}</Text>
                    <Text style={s.heroStatLabel}>Stops</Text>
                  </View>
                  <View style={s.heroStatDivider} />
                  <View style={s.heroStatBox}>
                    <Text style={s.heroStatNum}>{stopsWithStudents}</Text>
                    <Text style={s.heroStatLabel}>Active Stops</Text>
                  </View>
                </View>

                <View style={s.heroDivider} />

                <View style={s.heroBottom}>
                  <View style={s.heroRoutePill}>
                    <Ionicons name="navigate" size={12} color="#FFF" />
                    <Text style={s.heroRouteText}>
                      {currentRoute?.name} · {currentRoute?.direction}
                    </Text>
                  </View>
                </View>
              </LinearGradient>
            </Animated.View>

            {/* ═══════ Route Selector ═══════ */}
            {routes.length > 1 && (
              <Animated.View entering={FadeInDown.delay(120).duration(400)}>
                <View style={s.secHeader}>
                  <View style={s.secIconBox}>
                    <Ionicons name="map" size={14} color={theme.colors.primary} />
                  </View>
                  <Text style={s.secTitle}>Select Route</Text>
                </View>
                <FlatList
                  horizontal
                  data={routes}
                  showsHorizontalScrollIndicator={false}
                  keyExtractor={(r) => r.id}
                  style={{ marginBottom: 16 }}
                  renderItem={({ item, index }) => (
                    <TouchableOpacity
                      style={[s.routeChip, selectedRouteIdx === index && s.routeChipActive]}
                      onPress={() => setSelectedRouteIdx(index)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="navigate-outline" size={14}
                        color={selectedRouteIdx === index ? '#FFF' : theme.colors.primary} />
                      <Text style={[s.routeChipText, selectedRouteIdx === index && { color: '#FFF' }]}>
                        {item.name}
                      </Text>
                      <Text style={[s.routeChipDir, selectedRouteIdx === index && { color: 'rgba(255,255,255,0.7)' }]}>
                        {item.direction}
                      </Text>
                    </TouchableOpacity>
                  )}
                />
              </Animated.View>
            )}

            {/* ═══════ Section Header ═══════ */}
            <Animated.View entering={FadeInDown.delay(160).duration(400)}>
              <View style={s.secHeader}>
                <View style={[s.secIconBox, { backgroundColor: '#ECFDF5' }]}>
                  <Ionicons name="people" size={14} color="#10B981" />
                </View>
                <Text style={s.secTitle}>Students by Stop</Text>
              </View>
            </Animated.View>
          </>
        }
        renderItem={({ item: stop, index }) => {
          const students = stop.students || [];
          if (students.length === 0) return null;

          return (
            <Animated.View
              entering={FadeInUp.delay(200 + index * 60).duration(400)}
              style={s.stopSection}
            >
              {/* Stop Header */}
              <View style={s.stopHeader}>
                <View style={s.stopOrderBadge}>
                  <Text style={s.stopOrderText}>{stop.stop_order}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.stopName}>{stop.stop_name}</Text>
                  <Text style={s.stopMeta}>
                    {students.length} student{students.length > 1 ? 's' : ''}
                  </Text>
                </View>
                <View style={s.stopCountPill}>
                  <Ionicons name="people" size={12} color={theme.colors.primary} />
                  <Text style={s.stopCountText}>{students.length}</Text>
                </View>
              </View>

              {/* Student List */}
              {students.map((stu, sIdx) => (
                <View
                  key={stu.student_id || `${stop.stop_id}-${sIdx}`}
                  style={[s.studentCard, sIdx === students.length - 1 && { marginBottom: 0 }]}
                >
                  {/* Avatar */}
                  <View style={s.avatar}>
                    <Text style={s.avatarText}>
                      {(stu.student_name || '?')[0]?.toUpperCase()}
                    </Text>
                  </View>

                  {/* Info */}
                  <View style={s.studentInfo}>
                    <Text style={s.studentName} numberOfLines={1}>
                      {stu.student_name || 'Unknown'}
                    </Text>
                    <View style={s.studentMetaRow}>
                      {stu.admission_no && (
                        <View style={s.metaChip}>
                          <Ionicons name="id-card-outline" size={10} color="#64748B" />
                          <Text style={s.metaText}>{stu.admission_no}</Text>
                        </View>
                      )}
                      {stu.class_name && (
                        <View style={s.metaChip}>
                          <Ionicons name="school-outline" size={10} color="#64748B" />
                          <Text style={s.metaText}>
                            {stu.class_name}{stu.section_name ? ` - ${stu.section_name}` : ''}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Call Button */}
                  <TouchableOpacity
                    style={[s.callBtn, !(stu.phone_contacts?.length) && { opacity: 0.3 }]}
                    onPress={() => openCallOptions(stu)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="call" size={16} color={theme.colors.success} />
                  </TouchableOpacity>
                </View>
              ))}
            </Animated.View>
          );
        }}
        ListEmptyComponent={
          <View style={s.center}>
            <Ionicons name="people-outline" size={40} color="#CBD5E1" />
            <Text style={s.emptyTitle}>No students on this route</Text>
          </View>
        }
        ListFooterComponent={<View style={{ height: 100 }} />}
      />

      <Modal
        visible={callContacts.length > 0}
        transparent
        animationType="fade"
        onRequestClose={() => setCallContacts([])}
      >
        <TouchableOpacity style={s.modalBackdrop} activeOpacity={1} onPress={() => setCallContacts([])}>
          <TouchableOpacity style={s.callSheet} activeOpacity={1}>
            <View style={s.callSheetHeader}>
              <View style={s.callSheetIcon}>
                <Ionicons name="call" size={20} color={theme.colors.success} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.callSheetTitle}>Call contact</Text>
                <Text style={s.callSheetSub}>Choose a number linked to {callStudentName}</Text>
              </View>
              <TouchableOpacity onPress={() => setCallContacts([])} style={s.closeBtn}>
                <Ionicons name="close" size={20} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {callContacts.map((contact, index) => (
              <TouchableOpacity
                key={`${contact.relationship}-${contact.phone}-${index}`}
                style={s.contactOption}
                onPress={() => void dialPhone(contact.phone)}
                activeOpacity={0.7}
              >
                <View style={{ flex: 1 }}>
                  <Text style={s.contactName}>
                    {contact.contact_name || contact.relationship}
                  </Text>
                  <Text style={s.contactMeta}>{contact.relationship} · {contact.phone}</Text>
                </View>
                <Ionicons name="call-outline" size={20} color={theme.colors.success} />
              </TouchableOpacity>
            ))}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </ScreenLayout>
  );
}

/* ════════════════════════════ STYLES ════════════════════════════ */
const getStyles = (theme: any) => StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 40 },
  scroll: { padding: 20 },

  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center',
    alignItems: 'center', padding: 20,
  },
  callSheet: {
    width: '100%', maxWidth: 460, maxHeight: '80%', backgroundColor: theme.colors.surface,
    borderRadius: 24, padding: 18, shadowColor: '#000', shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2, shadowRadius: 24, elevation: 12,
  },
  callSheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  callSheetIcon: {
    width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#ECFDF5',
  },
  callSheetTitle: { fontSize: 18, fontWeight: '800', color: theme.colors.text },
  callSheetSub: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 },
  closeBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  contactOption: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13,
    paddingHorizontal: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border,
  },
  contactName: { fontSize: 15, fontWeight: '700', color: theme.colors.text },
  contactMeta: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 3 },

  /* Hero */
  heroWrap: {
    borderRadius: 28, overflow: 'hidden', marginBottom: 24,
    backgroundColor: '#FFFFFF',
    shadowColor: theme.colors.primary, shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15, shadowRadius: 24, elevation: 8,
  },
  hero: { padding: 22, overflow: 'hidden' },
  heroDecor: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.07)' },
  heroRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  heroStatBox: { alignItems: 'center', flex: 1 },
  heroStatNum: { fontSize: 28, fontWeight: '900', color: '#FFF' },
  heroStatLabel: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.7)', marginTop: 2, letterSpacing: 0.3 },
  heroStatDivider: { width: 1, height: 36, backgroundColor: 'rgba(255,255,255,0.15)' },
  heroDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.12)', marginVertical: 14 },
  heroBottom: { flexDirection: 'row', justifyContent: 'center' },
  heroRoutePill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 14,
    paddingVertical: 6, borderRadius: 12,
  },
  heroRouteText: { color: '#FFF', fontSize: 13, fontWeight: '700', textTransform: 'capitalize' },

  /* Empty */
  emptyIcon: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: '#F8FAFC',
    justifyContent: 'center', alignItems: 'center', marginBottom: 16,
  },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#64748B', marginTop: 8 },
  emptySub: { fontSize: 13, color: '#94A3B8', textAlign: 'center', maxWidth: 260, marginTop: 4 },

  /* Sections */
  secHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  secIconBox: {
    width: 32, height: 32, borderRadius: 12, backgroundColor: '#FDF2F8',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: theme.colors.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 1
  },
  secTitle: { fontSize: 18, fontWeight: '800', color: '#1E293B', letterSpacing: -0.3 },

  /* Route selector */
  routeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FFFFFF', paddingHorizontal: 16, paddingVertical: 14,
    borderRadius: 16, marginRight: 12, borderWidth: 1, borderColor: '#E2E8F0',
    shadowColor: '#94A3B8', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1
  },
  routeChipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primaryDark, shadowColor: theme.colors.primary, shadowOpacity: 0.15 },
  routeChipText: { fontSize: 15, fontWeight: '700', color: '#1E293B' },
  routeChipDir: { fontSize: 12, color: '#64748B', fontWeight: '600', textTransform: 'capitalize' },

  /* Stop Section */
  stopSection: {
    backgroundColor: '#FFFFFF', borderRadius: 24, padding: 20, marginBottom: 20,
    shadowColor: '#94A3B8', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08, shadowRadius: 20, elevation: 3,
    borderWidth: 1, borderColor: 'rgba(226, 232, 240, 0.6)'
  },
  stopHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginBottom: 14, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  stopOrderBadge: {
    width: 32, height: 32, borderRadius: 12, backgroundColor: '#FDF2F8',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: theme.colors.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 1
  },
  stopOrderText: { fontSize: 14, fontWeight: '800', color: theme.colors.primary },
  stopName: { fontSize: 16, fontWeight: '700', color: '#1E293B' },
  stopMeta: { fontSize: 12, color: '#64748B', fontWeight: '500', marginTop: 2 },
  stopCountPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FDF2F8', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12,
  },
  stopCountText: { fontSize: 13, fontWeight: '800', color: theme.colors.primary },

  /* Student Card */
  studentCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10, marginBottom: 2,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F8FAFC',
  },
  avatar: {
    width: 40, height: 40, borderRadius: 14,
    backgroundColor: '#EDE9FE', justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { fontSize: 16, fontWeight: '800', color: '#7C3AED' },
  studentInfo: { flex: 1 },
  studentName: { fontSize: 14, fontWeight: '700', color: '#1F2937' },
  studentMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 3 },
  metaChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: '#F8FAFC', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6,
  },
  metaText: { fontSize: 10, fontWeight: '600', color: '#64748B' },

  /* Call Button */
  callBtn: {
    width: 44, height: 44, borderRadius: 16,
    backgroundColor: '#ECFDF5', justifyContent: 'center', alignItems: 'center',
    shadowColor: theme.colors.success, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 2
  },
});
