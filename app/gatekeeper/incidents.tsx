import { TourTarget, TourScrollView } from '@/src/features/app-tour';
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from '@/src/utils/haptics';
import { useTheme } from '@/src/hooks/useTheme';
import { visitorService, type SchoolGate } from '@/src/services/visitorService';

const INCIDENT_TYPES = [
  'UNAUTHORIZED_ENTRY',
  'REFUSED_CHECKOUT',
  'TRESPASSING',
  'FIGHT_ALTERCATION',
  'PROPERTY_DAMAGE',
  'WATCHLIST_MATCH',
  'SUSPICIOUS_ACTIVITY',
  'OTHER',
];

const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

export default function GatekeeperIncidentsScreen() {
  const router = useRouter();
  const { isDark } = useTheme();

  const [activeTab, setActiveTab] = useState<'report' | 'list'>('report');
  const [currentGate, setCurrentGate] = useState<SchoolGate | null>(null);
  const [incidents, setIncidents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [incidentType, setIncidentType] = useState('UNAUTHORIZED_ENTRY');
  const [severity, setSeverity] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'>('MEDIUM');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [perpetratorName, setPerpetratorName] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');

  const loadIncidents = useCallback(async () => {
    try {
      const [list, gateData] = await Promise.all([
        visitorService.getIncidents(),
        visitorService.getMyGate().catch(() => null),
      ]);
      setIncidents(list);
      if (gateData?.currentGate) setCurrentGate(gateData.currentGate);
    } catch (e) {
      console.warn('Failed to load incidents:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadIncidents();
  }, [loadIncidents]);

  const onRefresh = () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    loadIncidents();
  };

  const handleSubmit = async () => {
    if (!title.trim() || !description.trim()) {
      Alert.alert('Missing Fields', 'Please enter an incident title and detailed description.');
      return;
    }

    try {
      setSubmitting(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

      const res = await visitorService.reportIncident({
        gateId: currentGate?.id,
        incidentType,
        severity,
        title: title.trim(),
        description: description.trim(),
        perpetratorName: perpetratorName.trim() || undefined,
        vehicleNumber: vehicleNumber.trim() || undefined,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setIncidents((prev) => [res.incident, ...prev]);
      setTitle('');
      setDescription('');
      setPerpetratorName('');
      setVehicleNumber('');
      setActiveTab('list');
      Alert.alert('Incident Logged', 'Security incident recorded and alerted to school administration.');
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not log incident.');
    } finally {
      setSubmitting(false);
    }
  };

  const bgColor = isDark ? '#0B0F17' : '#F4F6F9';
  const cardBg = isDark ? '#161E2E' : '#FFFFFF';
  const textColor = isDark ? '#F1F5F9' : '#0F172A';
  const subColor = isDark ? '#94A3B8' : '#64748B';
  const borderColor = isDark ? '#26334A' : '#E2E8F0';

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: bgColor }]}>
      {/* Header */}
      <TourTarget id="screen.gatekeeper-incidents.overview" native><View style={[styles.header, { borderBottomColor: borderColor }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={textColor} />
        </TouchableOpacity>
        <View style={styles.headerTitleCol}>
          <Text style={[styles.headerTitle, { color: textColor }]}>Security Incidents</Text>
          <Text style={[styles.headerSub, { color: subColor }]}>Breach & Alert Reporting</Text>
        </View>
      </View></TourTarget>

      {/* Tabs */}
      <TourTarget id="screen.gatekeeper-incidents.workspace" native><View style={[styles.tabBar, { backgroundColor: cardBg, borderColor }]}>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'report' && styles.tabItemActive]}
          onPress={() => setActiveTab('report')}
        >
          <Text style={[styles.tabText, { color: activeTab === 'report' ? '#EC4899' : subColor }]}>
            Report Incident
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'list' && styles.tabItemActive]}
          onPress={() => setActiveTab('list')}
        >
          <Text style={[styles.tabText, { color: activeTab === 'list' ? '#EC4899' : subColor }]}>
            Incident Log ({incidents.length})
          </Text>
        </TouchableOpacity>
      </View></TourTarget>

      <TourScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          activeTab === 'list' ? (
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#EC4899" />
          ) : undefined
        }
      >
        {activeTab === 'report' ? (
          <View style={[styles.formCard, { backgroundColor: cardBg, borderColor }]}>
            {/* Severity Picker */}
            <Text style={[styles.label, { color: subColor }]}>SEVERITY LEVEL</Text>
            <View style={styles.severityRow}>
              {SEVERITIES.map((s) => {
                const isSelected = severity === s;
                const col =
                  s === 'CRITICAL' ? '#DC2626' : s === 'HIGH' ? '#EF4444' : s === 'MEDIUM' ? '#F59E0B' : '#10B981';
                return (
                  <TouchableOpacity
                    key={s}
                    style={[
                      styles.severityChip,
                      {
                        backgroundColor: isSelected ? col : 'transparent',
                        borderColor: col,
                      },
                    ]}
                    onPress={() => setSeverity(s)}
                  >
                    <Text style={[styles.severityText, { color: isSelected ? '#FFFFFF' : col }]}>
                      {s}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Incident Type */}
            <Text style={[styles.label, { color: subColor }]}>INCIDENT TYPE</Text>
            <TourScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeRow}>
              {INCIDENT_TYPES.map((t) => {
                const isSelected = incidentType === t;
                return (
                  <TouchableOpacity
                    key={t}
                    style={[
                      styles.typeChip,
                      {
                        backgroundColor: isSelected ? '#EC4899' : 'transparent',
                        borderColor: isSelected ? '#EC4899' : borderColor,
                      },
                    ]}
                    onPress={() => setIncidentType(t)}
                  >
                    <Text style={[styles.typeText, { color: isSelected ? '#FFFFFF' : textColor }]}>
                      {t.replace(/_/g, ' ')}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </TourScrollView>

            <Text style={[styles.label, { color: subColor }]}>INCIDENT TITLE *</Text>
            <TextInput
              style={[styles.input, { color: textColor, borderColor }]}
              placeholder="e.g. Forcible entry attempted without pass"
              placeholderTextColor={subColor}
              value={title}
              onChangeText={setTitle}
            />

            <Text style={[styles.label, { color: subColor }]}>DETAILED DESCRIPTION *</Text>
            <TextInput
              style={[styles.textArea, { color: textColor, borderColor }]}
              placeholder="Describe sequence of events, personnel involved, and actions taken"
              placeholderTextColor={subColor}
              multiline
              value={description}
              onChangeText={setDescription}
            />

            <View style={styles.twoColRow}>
              <View style={styles.flex1}>
                <Text style={[styles.label, { color: subColor }]}>PERSON INVOLVED</Text>
                <TextInput
                  style={[styles.input, { color: textColor, borderColor }]}
                  placeholder="e.g. Unknown individual"
                  placeholderTextColor={subColor}
                  value={perpetratorName}
                  onChangeText={setPerpetratorName}
                />
              </View>
              <View style={styles.colSpacer} />
              <View style={styles.flex1}>
                <Text style={[styles.label, { color: subColor }]}>VEHICLE NO.</Text>
                <TextInput
                  style={[styles.input, { color: textColor, borderColor }]}
                  placeholder="e.g. DL-03-AA-1234"
                  placeholderTextColor={subColor}
                  autoCapitalize="characters"
                  value={vehicleNumber}
                  onChangeText={setVehicleNumber}
                />
              </View>
            </View>

            <TouchableOpacity
              style={styles.submitBtn}
              onPress={handleSubmit}
              disabled={submitting}
            >
              <LinearGradient
                colors={['#DB2777', '#EC4899']}
                style={styles.submitGradient}
              >
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="shield-outline" size={20} color="#FFFFFF" />
                    <Text style={styles.submitBtnText}>LOG SECURITY INCIDENT</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        ) : (
          <View>
            {incidents.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Ionicons name="shield-checkmark-outline" size={54} color="#10B981" />
                <Text style={[styles.emptyTitle, { color: textColor }]}>No Security Incidents Logged</Text>
                <Text style={[styles.emptySub, { color: subColor }]}>
                  The campus gate log is clean. Any security alerts or breaches will appear here.
                </Text>
              </View>
            ) : (
              incidents.map((item) => {
                const isCritical = item.severity === 'CRITICAL' || item.severity === 'HIGH';
                return (
                  <View
                    key={item.id}
                    style={[
                      styles.incidentCard,
                      {
                        backgroundColor: cardBg,
                        borderColor: isCritical ? '#EF4444' : borderColor,
                      },
                    ]}
                  >
                    <View style={styles.cardHeader}>
                      <View style={styles.typeBadge}>
                        <Text style={styles.typeBadgeText}>
                          {(item.incident_type || 'INCIDENT').replace(/_/g, ' ')}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.severityBadge,
                          {
                            backgroundColor:
                              item.severity === 'CRITICAL'
                                ? 'rgba(220,38,38,0.2)'
                                : item.severity === 'HIGH'
                                ? 'rgba(239,68,68,0.2)'
                                : 'rgba(245,158,11,0.2)',
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.severityBadgeText,
                            {
                              color:
                                item.severity === 'CRITICAL'
                                  ? '#DC2626'
                                  : item.severity === 'HIGH'
                                  ? '#EF4444'
                                  : '#F59E0B',
                            },
                          ]}
                        >
                          {item.severity}
                        </Text>
                      </View>
                    </View>

                    <Text style={[styles.incidentTitle, { color: textColor }]}>{item.title}</Text>
                    <Text style={[styles.incidentDesc, { color: subColor }]}>{item.description}</Text>

                    {item.perpetrator_name || item.vehicle_number ? (
                      <Text style={[styles.metaText, { color: subColor }]}>
                        Involved: {item.perpetrator_name || 'N/A'}{' '}
                        {item.vehicle_number ? `(${item.vehicle_number})` : ''}
                      </Text>
                    ) : null}

                    <View style={styles.cardFooter}>
                      <Text style={[styles.timeText, { color: subColor }]}>
                        {new Date(item.created_at).toLocaleDateString()} at{' '}
                        {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}
      </TourScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { padding: 6 },
  headerTitleCol: { flex: 1, marginLeft: 10 },
  headerTitle: { fontSize: 17, fontWeight: '800' },
  headerSub: { fontSize: 12 },
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  tabItem: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  tabItemActive: { borderBottomWidth: 2, borderBottomColor: '#EC4899' },
  tabText: { fontSize: 13, fontWeight: '700' },
  scrollContent: { padding: 16, paddingBottom: 40 },
  formCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  label: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5, marginTop: 12, marginBottom: 6 },
  severityRow: { flexDirection: 'row', gap: 8 },
  severityChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  severityText: { fontSize: 11, fontWeight: '800' },
  typeRow: { flexDirection: 'row', marginVertical: 4 },
  typeChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
    borderWidth: 1,
    marginRight: 6,
  },
  typeText: { fontSize: 11, fontWeight: '700' },
  input: {
    height: 44,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  textArea: {
    height: 80,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingTop: 8,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  twoColRow: { flexDirection: 'row', alignItems: 'center' },
  flex1: { flex: 1 },
  colSpacer: { width: 10 },
  submitBtn: { marginTop: 24, borderRadius: 12, overflow: 'hidden' },
  submitGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
  },
  submitBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  incidentCard: {
    borderRadius: 14,
    padding: 14,
    borderWidth: 1.5,
    marginBottom: 10,
    gap: 6,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  typeBadge: {
    backgroundColor: 'rgba(150,150,150,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  typeBadgeText: { fontSize: 10, fontWeight: '800' },
  severityBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  severityBadgeText: { fontSize: 10, fontWeight: '900' },
  incidentTitle: { fontSize: 15, fontWeight: '800' },
  incidentDesc: { fontSize: 13, lineHeight: 18 },
  metaText: { fontSize: 12 },
  cardFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(150,150,150,0.2)',
    paddingTop: 6,
    marginTop: 4,
  },
  timeText: { fontSize: 11 },
  emptyWrap: { alignItems: 'center', paddingVertical: 60 },
  emptyTitle: { fontSize: 17, fontWeight: '800', marginTop: 14 },
  emptySub: { fontSize: 13, textAlign: 'center', marginTop: 6, maxWidth: 260 },
});
