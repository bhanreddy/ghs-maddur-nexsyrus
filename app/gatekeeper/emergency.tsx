import { TourTarget } from '@/src/features/app-tour';
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
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
import { visitorService } from '@/src/services/visitorService';

export default function GatekeeperEmergencyScreen() {
  const router = useRouter();
  const { isDark } = useTheme();

  const [isActive, setIsActive] = useState(false);
  const [emergency, setEmergency] = useState<any>(null);
  const [muster, setMuster] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadEmergencyStatus = useCallback(async () => {
    try {
      const res = await visitorService.getEmergencyStatus();
      setIsActive(Boolean(res?.isActive));
      setEmergency(res?.emergency || null);
      setMuster(res?.muster || []);
    } catch (e) {
      console.warn('Failed to load emergency status:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadEmergencyStatus();
    const interval = setInterval(loadEmergencyStatus, 15000);
    return () => clearInterval(interval);
  }, [loadEmergencyStatus]);

  const onRefresh = () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    loadEmergencyStatus();
  };

  const handleTriggerEmergency = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(
      'DECLARE CAMPUS EMERGENCY',
      'This will lock down the campus, freeze access gates, and generate an immediate muster register of everyone currently inside. Proceed?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'ACTIVATE EMERGENCY',
          style: 'destructive',
          onPress: async () => {
            try {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
              await visitorService.activateEmergency({
                incidentType: 'EVACUATION_MUSTER',
                notes: 'Triggered by Gate Officer',
              });
              loadEmergencyStatus();
            } catch (err: any) {
              Alert.alert('Activation Failed', err?.message || 'Could not activate emergency.');
            }
          },
        },
      ]
    );
  };

  const handleResolveEmergency = () => {
    if (!emergency?.id) return;
    Alert.alert('RESOLVE EMERGENCY', 'Confirm all individuals are accounted for and issue ALL CLEAR?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'ALL CLEAR / RESOLVE',
        onPress: async () => {
          try {
            await visitorService.resolveEmergency(emergency.id, 'Campus declared secure');
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            loadEmergencyStatus();
          } catch (err: any) {
            Alert.alert('Error', err?.message || 'Failed to resolve emergency.');
          }
        },
      },
    ]);
  };

  const handleMarkEntry = async (entryId: string, status: string) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setUpdatingId(entryId);
      await visitorService.markEmergencyEntry(entryId, status);
      setMuster((prev) =>
        prev.map((item) => (item.id === entryId ? { ...item, status } : item))
      );
    } catch (e: any) {
      Alert.alert('Update Failed', e?.message || 'Could not update roll call status');
    } finally {
      setUpdatingId(null);
    }
  };

  const bgColor = isDark ? '#0B0F17' : '#F4F6F9';
  const cardBg = isDark ? '#161E2E' : '#FFFFFF';
  const textColor = isDark ? '#F1F5F9' : '#0F172A';
  const subColor = isDark ? '#94A3B8' : '#64748B';
  const borderColor = isDark ? '#26334A' : '#E2E8F0';

  const safeCount = muster.filter((m) => m.status === 'PRESENT_SAFE').length;
  const missingCount = muster.filter((m) => m.status === 'NOT_FOUND').length;
  const exitedCount = muster.filter((m) => m.status === 'EXITED').length;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: bgColor }]}>
      {/* Header */}
      <TourTarget id="screen.gatekeeper-emergency.overview" native><View style={[styles.header, { borderBottomColor: borderColor }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={textColor} />
        </TouchableOpacity>
        <View style={styles.headerTitleCol}>
          <Text style={[styles.headerTitle, { color: textColor }]}>Emergency Muster Roll</Text>
          <Text style={[styles.headerSub, { color: subColor }]}>Live Evacuation Accounting</Text>
        </View>
      </View></TourTarget>

      <TourTarget id="screen.gatekeeper-emergency.workspace" native><FlatList
        data={muster}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#EF4444" />
        }
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View>
            {/* Status Hero Card */}
            {isActive ? (
              <View style={styles.activeAlertCard}>
                <View style={styles.alertHeader}>
                  <Ionicons name="warning" size={26} color="#FFFFFF" />
                  <Text style={styles.alertTitle}>CAMPUS EMERGENCY ACTIVE</Text>
                </View>
                <Text style={styles.alertDesc}>
                  Account for every visitor and personnel. Tap status buttons as individuals assemble.
                </Text>

                {/* Counter Row */}
                <View style={styles.counterRow}>
                  <View style={styles.countBox}>
                    <Text style={styles.countNum}>{muster.length}</Text>
                    <Text style={styles.countLbl}>ON SITE</Text>
                  </View>
                  <View style={styles.countBox}>
                    <Text style={[styles.countNum, { color: '#34D399' }]}>{safeCount}</Text>
                    <Text style={styles.countLbl}>SAFE</Text>
                  </View>
                  <View style={styles.countBox}>
                    <Text style={[styles.countNum, { color: '#F87171' }]}>{missingCount}</Text>
                    <Text style={styles.countLbl}>MISSING</Text>
                  </View>
                  <View style={styles.countBox}>
                    <Text style={[styles.countNum, { color: '#93C5FD' }]}>{exitedCount}</Text>
                    <Text style={styles.countLbl}>EXITED</Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.resolveBtn}
                  onPress={handleResolveEmergency}
                >
                  <Text style={styles.resolveBtnText}>ALL CLEAR / RESOLVE</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={[styles.normalCard, { backgroundColor: cardBg, borderColor }]}>
                <View style={styles.normalRow}>
                  <Ionicons name="shield-checkmark" size={26} color="#10B981" />
                  <View style={styles.normalTextCol}>
                    <Text style={[styles.normalTitle, { color: textColor }]}>Campus Status: SECURE</Text>
                    <Text style={[styles.normalSub, { color: subColor }]}>No active evacuations or emergency drills</Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.triggerBtn}
                  onPress={handleTriggerEmergency}
                >
                  <Ionicons name="flame-outline" size={18} color="#FFFFFF" />
                  <Text style={styles.triggerBtnText}>ACTIVATE EMERGENCY LOCKDOWN</Text>
                </TouchableOpacity>
              </View>
            )}

            {isActive && (
              <Text style={[styles.musterHeaderTitle, { color: textColor }]}>
                Muster Register Checklist ({muster.length} Persons)
              </Text>
            )}
          </View>
        }
        ListEmptyComponent={
          isActive ? (
            <View style={styles.emptyWrap}>
              <Text style={[styles.emptyText, { color: subColor }]}>No visitors logged inside campus.</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const isSafe = item.status === 'PRESENT_SAFE';
          const isMissing = item.status === 'NOT_FOUND';
          const isExited = item.status === 'EXITED';
          const isBusy = updatingId === item.id;

          return (
            <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
              <View style={styles.cardHeader}>
                <View style={styles.personCol}>
                  <Text style={[styles.personName, { color: textColor }]}>{item.person_name}</Text>
                  <Text style={[styles.personSub, { color: subColor }]}>
                    {item.person_type} • {item.person_phone || 'No phone'}
                  </Text>
                </View>
                <View
                  style={[
                    styles.currentStatusPill,
                    {
                      backgroundColor: isSafe
                        ? 'rgba(16,185,129,0.15)'
                        : isMissing
                        ? 'rgba(239,68,68,0.15)'
                        : 'rgba(59,130,246,0.15)',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.currentStatusText,
                      { color: isSafe ? '#10B981' : isMissing ? '#EF4444' : '#3B82F6' },
                    ]}
                  >
                    {item.status}
                  </Text>
                </View>
              </View>

              {/* Status Action Buttons */}
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={[
                    styles.actionPill,
                    isSafe && { backgroundColor: '#10B981', borderColor: '#10B981' },
                  ]}
                  onPress={() => handleMarkEntry(item.id, 'PRESENT_SAFE')}
                  disabled={isBusy}
                >
                  <Ionicons name="checkmark" size={14} color={isSafe ? '#FFFFFF' : '#10B981'} />
                  <Text style={[styles.actionPillText, { color: isSafe ? '#FFFFFF' : '#10B981' }]}>
                    Safe
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.actionPill,
                    isMissing && { backgroundColor: '#EF4444', borderColor: '#EF4444' },
                  ]}
                  onPress={() => handleMarkEntry(item.id, 'NOT_FOUND')}
                  disabled={isBusy}
                >
                  <Ionicons name="close" size={14} color={isMissing ? '#FFFFFF' : '#EF4444'} />
                  <Text style={[styles.actionPillText, { color: isMissing ? '#FFFFFF' : '#EF4444' }]}>
                    Missing
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.actionPill,
                    isExited && { backgroundColor: '#3B82F6', borderColor: '#3B82F6' },
                  ]}
                  onPress={() => handleMarkEntry(item.id, 'EXITED')}
                  disabled={isBusy}
                >
                  <Ionicons name="log-out-outline" size={14} color={isExited ? '#FFFFFF' : '#3B82F6'} />
                  <Text style={[styles.actionPillText, { color: isExited ? '#FFFFFF' : '#3B82F6' }]}>
                    Exited
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
      /></TourTarget>
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
  listContent: { padding: 16, paddingBottom: 40 },
  activeAlertCard: {
    backgroundColor: '#DC2626',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  alertHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  alertTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '900', letterSpacing: 0.5 },
  alertDesc: { color: 'rgba(255,255,255,0.9)', fontSize: 12, marginTop: 4, lineHeight: 16 },
  counterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 12,
    padding: 12,
    marginTop: 14,
  },
  countBox: { alignItems: 'center' },
  countNum: { color: '#FFFFFF', fontSize: 20, fontWeight: '900' },
  countLbl: { color: 'rgba(255,255,255,0.8)', fontSize: 9, fontWeight: '800', marginTop: 2 },
  resolveBtn: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 14,
  },
  resolveBtnText: { color: '#DC2626', fontWeight: '900', fontSize: 13 },
  normalCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 20,
  },
  normalRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  normalTextCol: { flex: 1 },
  normalTitle: { fontSize: 15, fontWeight: '800' },
  normalSub: { fontSize: 12, marginTop: 2 },
  triggerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#EF4444',
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 14,
  },
  triggerBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
  musterHeaderTitle: { fontSize: 14, fontWeight: '800', marginBottom: 10 },
  card: {
    borderRadius: 14,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 10,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  personCol: { flex: 1 },
  personName: { fontSize: 15, fontWeight: '800' },
  personSub: { fontSize: 12, marginTop: 2 },
  currentStatusPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  currentStatusText: { fontSize: 10, fontWeight: '800' },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  actionPillText: { fontSize: 12, fontWeight: '700' },
  emptyWrap: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { fontSize: 13 },
});
