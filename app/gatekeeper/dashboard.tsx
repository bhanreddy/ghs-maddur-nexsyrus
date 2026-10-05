import { AppTourQuickAction, TourTarget, TourScrollView } from '@/src/features/app-tour';
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from '@/src/utils/haptics';
import { useAuth } from '@/src/hooks/useAuth';
import { useTheme } from '@/src/hooks/useTheme';
import { visitorService, type VisitorAnalytics, type SchoolGate } from '@/src/services/visitorService';

export default function GatekeeperDashboard() {
  const router = useRouter();
  const { user } = useAuth();
  const { isDark } = useTheme();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [analytics, setAnalytics] = useState<VisitorAnalytics | null>(null);
  const [currentGate, setCurrentGate] = useState<SchoolGate | null>(null);
  const [assignedGates, setAssignedGates] = useState<SchoolGate[]>([]);
  const [emergencyActive, setEmergencyActive] = useState(false);

  const loadDashboardData = useCallback(async () => {
    try {
      const [analyticsData, gateData, emergencyData] = await Promise.all([
        visitorService.getAnalytics().catch(() => null),
        visitorService.getMyGate().catch(() => null),
        visitorService.getEmergencyStatus().catch(() => null),
      ]);

      if (analyticsData) setAnalytics(analyticsData);
      if (gateData?.currentGate) setCurrentGate(gateData.currentGate);
      if (gateData?.assignedGates) setAssignedGates(gateData.assignedGates);
      if (emergencyData?.isActive) setEmergencyActive(true);
      else setEmergencyActive(false);
    } catch (e) {
      console.warn('Error loading gatekeeper dashboard:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  const onRefresh = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRefreshing(true);
    loadDashboardData();
  };

  const nav = (path: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(path as any);
  };

  const bgColor = isDark ? '#0B0F17' : '#F4F6F9';
  const cardBg = isDark ? '#161E2E' : '#FFFFFF';
  const textColor = isDark ? '#F1F5F9' : '#0F172A';
  const subColor = isDark ? '#94A3B8' : '#64748B';
  const borderColor = isDark ? '#26334A' : '#E2E8F0';

  const summary = analytics?.summary || {
    visitsToday: 0,
    currentlyInside: 0,
    expectedToday: 0,
    pendingApprovals: 0,
    rejectedToday: 0,
    overstayedNow: 0,
    deliveriesToday: 0,
    incidentsToday: 0,
  };

  return (
    <TourTarget id="screen.gatekeeper-dashboard.overview" native><View style={[styles.root, { backgroundColor: bgColor }]}>
      <TourTarget id="screen.gatekeeper-dashboard.workspace" native><TourScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10B981" />}
      >
        {/* Emergency Alert Banner (if active) */}
        {emergencyActive && (
          <TouchableOpacity
            style={styles.emergencyBanner}
            onPress={() => nav('/gatekeeper/emergency')}
          >
            <Ionicons name="warning" size={24} color="#FFFFFF" />
            <View style={styles.emergencyTextCol}>
              <Text style={styles.emergencyTitle}>CAMPUS EMERGENCY ACTIVE</Text>
              <Text style={styles.emergencySub}>Tap to open live muster register roll-call</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        )}

        {/* Security Officer Header */}
        <TourTarget id="gatekeeper.navigation" native><View style={styles.heroSection}>
          <View style={styles.officerRow}>
            <View>
              <Text style={[styles.greetingLabel, { color: subColor }]}>GATE OFFICER ON DUTY</Text>
              <Text style={[styles.officerName, { color: textColor }]}>
                {user?.display_name || user?.name || 'Gatekeeper'}
              </Text>
            </View>
            <View style={styles.badgeShift}>
              <Ionicons name="shield-checkmark" size={14} color="#10B981" />
              <Text style={styles.shiftText}>ACTIVE POST</Text>
            </View>
          </View>
        </View></TourTarget>

        {/* PRIMARY SCAN BUTTON CTA */}
        <TouchableOpacity
          style={styles.scanCtaWrapper}
          activeOpacity={0.88}
          onPress={() => nav('/gatekeeper/scanner')}
        >
          <LinearGradient
            colors={['#059669', '#10B981', '#34D399']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.scanGradient}
          >
            <View style={styles.scanIconCircle}>
              <Ionicons name="qr-code" size={36} color="#059669" />
            </View>
            <View style={styles.scanTextCol}>
              <Text style={styles.scanMainTitle}>SCAN VISITOR / PICKUP QR</Text>
              <Text style={styles.scanSubTitle}>Point camera at digital pass or entry barcode</Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color="#FFFFFF" />
          </LinearGradient>
        </TouchableOpacity>

        {/* Real-time KPI Metric Cards */}
        <View style={styles.kpiGrid}>
          {/* Inside Campus */}
          <TouchableOpacity
            style={[styles.kpiCard, { backgroundColor: cardBg, borderColor }]}
            onPress={() => nav('/gatekeeper/inside')}
          >
            <View style={styles.kpiTop}>
              <View style={[styles.kpiIconBox, { backgroundColor: 'rgba(16,185,129,0.15)' }]}>
                <Ionicons name="people" size={20} color="#10B981" />
              </View>
              <Text style={[styles.kpiNumber, { color: '#10B981' }]}>{summary.currentlyInside}</Text>
            </View>
            <Text style={[styles.kpiLabel, { color: textColor }]}>Currently Inside</Text>
            <Text style={[styles.kpiSub, { color: subColor }]}>Active on campus</Text>
          </TouchableOpacity>

          {/* Expected Today */}
          <TouchableOpacity
            style={[styles.kpiCard, { backgroundColor: cardBg, borderColor }]}
            onPress={() => nav('/gatekeeper/expected')}
          >
            <View style={styles.kpiTop}>
              <View style={[styles.kpiIconBox, { backgroundColor: 'rgba(59,130,246,0.15)' }]}>
                <Ionicons name="calendar" size={20} color="#3B82F6" />
              </View>
              <Text style={[styles.kpiNumber, { color: '#3B82F6' }]}>{summary.expectedToday}</Text>
            </View>
            <Text style={[styles.kpiLabel, { color: textColor }]}>Expected Today</Text>
            <Text style={[styles.kpiSub, { color: subColor }]}>Pre-approved visits</Text>
          </TouchableOpacity>

          {/* Overstay Alerts */}
          <TouchableOpacity
            style={[
              styles.kpiCard,
              {
                backgroundColor: cardBg,
                borderColor: summary.overstayedNow > 0 ? '#EF4444' : borderColor,
              },
            ]}
            onPress={() => nav('/gatekeeper/inside')}
          >
            <View style={styles.kpiTop}>
              <View
                style={[
                  styles.kpiIconBox,
                  {
                    backgroundColor:
                      summary.overstayedNow > 0
                        ? 'rgba(239,68,68,0.2)'
                        : 'rgba(148,163,184,0.15)',
                  },
                ]}
              >
                <Ionicons
                  name="time-outline"
                  size={20}
                  color={summary.overstayedNow > 0 ? '#EF4444' : '#94A3B8'}
                />
              </View>
              <Text
                style={[
                  styles.kpiNumber,
                  { color: summary.overstayedNow > 0 ? '#EF4444' : subColor },
                ]}
              >
                {summary.overstayedNow}
              </Text>
            </View>
            <Text style={[styles.kpiLabel, { color: textColor }]}>Overstay Alerts</Text>
            <Text style={[styles.kpiSub, { color: subColor }]}>Exceeded duration</Text>
          </TouchableOpacity>

          {/* Deliveries */}
          <TouchableOpacity
            style={[styles.kpiCard, { backgroundColor: cardBg, borderColor }]}
            onPress={() => nav('/gatekeeper/deliveries')}
          >
            <View style={styles.kpiTop}>
              <View style={[styles.kpiIconBox, { backgroundColor: 'rgba(245,158,11,0.15)' }]}>
                <Ionicons name="cube" size={20} color="#F59E0B" />
              </View>
              <Text style={[styles.kpiNumber, { color: '#F59E0B' }]}>
                {summary.deliveriesToday}
              </Text>
            </View>
            <Text style={[styles.kpiLabel, { color: textColor }]}>Deliveries</Text>
            <Text style={[styles.kpiSub, { color: subColor }]}>Parcels at gate</Text>
          </TouchableOpacity>
        </View>

        {/* FAST ACTION HUB */}
        <View style={styles.hubSection}>
          <Text style={[styles.sectionTitle, { color: textColor }]}>Gate Security Operations</Text>

          <View style={styles.hubGrid}>
            <TouchableOpacity
              style={[styles.hubCard, { backgroundColor: cardBg, borderColor }]}
              onPress={() => nav('/gatekeeper/scanner')}
            >
              <View style={[styles.hubIcon, { backgroundColor: '#4F46E5' }]}>
                <Ionicons name="qr-code" size={22} color="#FFFFFF" />
              </View>
              <Text style={[styles.hubTitle, { color: textColor }]}>Event Pass Mode</Text>
              <Text style={[styles.hubDesc, { color: subColor }]}>Scan EV- or evpass_ tickets</Text>
            </TouchableOpacity>

            {/* Walk-in Registration */}
            <TouchableOpacity
              style={[styles.hubCard, { backgroundColor: cardBg, borderColor }]}
              onPress={() => nav('/gatekeeper/walkin')}
            >
              <View style={[styles.hubIcon, { backgroundColor: '#10B981' }]}>
                <Ionicons name="person-add" size={22} color="#FFFFFF" />
              </View>
              <Text style={[styles.hubTitle, { color: textColor }]}>Walk-in Entry</Text>
              <Text style={[styles.hubDesc, { color: subColor }]}>Spot visitor pass & snapshot</Text>
            </TouchableOpacity>

            {/* Student Pickup */}
            <TouchableOpacity
              style={[styles.hubCard, { backgroundColor: cardBg, borderColor }]}
              onPress={() => nav('/gatekeeper/pickup')}
            >
              <View style={[styles.hubIcon, { backgroundColor: '#6366F1' }]}>
                <Ionicons name="school" size={22} color="#FFFFFF" />
              </View>
              <Text style={[styles.hubTitle, { color: textColor }]}>Student Pickup</Text>
              <Text style={[styles.hubDesc, { color: subColor }]}>Guardian check & OTP release</Text>
            </TouchableOpacity>

            {/* Live Campus Register */}
            <TouchableOpacity
              style={[styles.hubCard, { backgroundColor: cardBg, borderColor }]}
              onPress={() => nav('/gatekeeper/inside')}
            >
              <View style={[styles.hubIcon, { backgroundColor: '#0EA5E9' }]}>
                <Ionicons name="list" size={22} color="#FFFFFF" />
              </View>
              <Text style={[styles.hubTitle, { color: textColor }]}>Live Register</Text>
              <Text style={[styles.hubDesc, { color: subColor }]}>Inspect & one-tap check-out</Text>
            </TouchableOpacity>

            {/* Deliveries & Couriers */}
            <TouchableOpacity
              style={[styles.hubCard, { backgroundColor: cardBg, borderColor }]}
              onPress={() => nav('/gatekeeper/deliveries')}
            >
              <View style={[styles.hubIcon, { backgroundColor: '#F59E0B' }]}>
                <Ionicons name="cube-outline" size={22} color="#FFFFFF" />
              </View>
              <Text style={[styles.hubTitle, { color: textColor }]}>Deliveries</Text>
              <Text style={[styles.hubDesc, { color: subColor }]}>Log couriers & package handoff</Text>
            </TouchableOpacity>

            {/* Material Gate Passes */}
            <TouchableOpacity
              style={[styles.hubCard, { backgroundColor: cardBg, borderColor }]}
              onPress={() => nav('/gatekeeper/materials')}
            >
              <View style={[styles.hubIcon, { backgroundColor: '#8B5CF6' }]}>
                <Ionicons name="swap-horizontal" size={22} color="#FFFFFF" />
              </View>
              <Text style={[styles.hubTitle, { color: textColor }]}>Material Pass</Text>
              <Text style={[styles.hubDesc, { color: subColor }]}>Inward / outward assets</Text>
            </TouchableOpacity>

            {/* Emergency Muster */}
            <TouchableOpacity
              style={[styles.hubCard, { backgroundColor: cardBg, borderColor }]}
              onPress={() => nav('/gatekeeper/emergency')}
            >
              <View style={[styles.hubIcon, { backgroundColor: '#EF4444' }]}>
                <Ionicons name="flame" size={22} color="#FFFFFF" />
              </View>
              <Text style={[styles.hubTitle, { color: textColor }]}>Emergency Roll</Text>
              <Text style={[styles.hubDesc, { color: subColor }]}>Evacuation & muster check</Text>
            </TouchableOpacity>

            {/* Incident Reporting */}
            <TouchableOpacity
              style={[styles.hubCard, { backgroundColor: cardBg, borderColor }]}
              onPress={() => nav('/gatekeeper/incidents')}
            >
              <View style={[styles.hubIcon, { backgroundColor: '#EC4899' }]}>
                <Ionicons name="warning" size={22} color="#FFFFFF" />
              </View>
              <Text style={[styles.hubTitle, { color: textColor }]}>Report Incident</Text>
              <Text style={[styles.hubDesc, { color: subColor }]}>Log breach, damage or dispute</Text>
            </TouchableOpacity>

            {/* Campus Schedule / Calendar */}
            <TouchableOpacity
              style={[styles.hubCard, { backgroundColor: cardBg, borderColor }]}
              onPress={() => nav('/gatekeeper/calendar')}
            >
              <View style={[styles.hubIcon, { backgroundColor: '#3B82F6' }]}>
                <Ionicons name="calendar-outline" size={22} color="#FFFFFF" />
              </View>
              <Text style={[styles.hubTitle, { color: textColor }]}>Campus Schedule</Text>
              <Text style={[styles.hubDesc, { color: subColor }]}>Holidays & visitor events</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.hubCard, { backgroundColor: cardBg, borderColor }]}
              onPress={() => nav('/gatekeeper/search')}
            >
              <View style={[styles.hubIcon, { backgroundColor: '#64748B' }]}>
                <Ionicons name="search" size={22} color="#FFFFFF" />
              </View>
              <Text style={[styles.hubTitle, { color: textColor }]}>Search Visitor</Text>
              <Text style={[styles.hubDesc, { color: subColor }]}>Name, phone or vehicle</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.hubCard, { backgroundColor: cardBg, borderColor }]}
              onPress={() => nav('/gatekeeper/vehicles')}
            >
              <View style={[styles.hubIcon, { backgroundColor: '#0369A1' }]}>
                <Ionicons name="car" size={22} color="#FFFFFF" />
              </View>
              <Text style={[styles.hubTitle, { color: textColor }]}>Vehicle Entry</Text>
              <Text style={[styles.hubDesc, { color: subColor }]}>Log bikes, cars and vans</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.hubCard, { backgroundColor: cardBg, borderColor }]}
              onPress={() => nav('/gatekeeper/contractors')}
            >
              <View style={[styles.hubIcon, { backgroundColor: '#B45309' }]}>
                <Ionicons name="construct" size={22} color="#FFFFFF" />
              </View>
              <Text style={[styles.hubTitle, { color: textColor }]}>Contractors</Text>
              <Text style={[styles.hubDesc, { color: subColor }]}>Recurring vendor passes</Text>
            </TouchableOpacity>
          </View>
        </View>
        <AppTourQuickAction portal="gatekeeper" />
      </TourScrollView></TourTarget>
    </View></TourTarget>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  emergencyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DC2626',
    padding: 14,
    borderRadius: 14,
    marginBottom: 16,
    gap: 12,
  },
  emergencyTextCol: { flex: 1 },
  emergencyTitle: { color: '#FFFFFF', fontSize: 13, fontWeight: '900', letterSpacing: 0.5 },
  emergencySub: { color: 'rgba(255,255,255,0.9)', fontSize: 11, marginTop: 2 },
  heroSection: { marginBottom: 16 },
  officerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  greetingLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  officerName: { fontSize: 20, fontWeight: '900', marginTop: 2 },
  badgeShift: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(16,185,129,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  shiftText: { color: '#10B981', fontSize: 10, fontWeight: '800' },
  scanCtaWrapper: {
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 20,
    elevation: 4,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
  },
  scanGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    gap: 14,
  },
  scanIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanTextCol: { flex: 1 },
  scanMainTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '900', letterSpacing: 0.5 },
  scanSubTitle: { color: 'rgba(255,255,255,0.88)', fontSize: 12, marginTop: 4 },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 24,
  },
  kpiCard: {
    width: '48.5%',
    borderRadius: 16,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  kpiTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  kpiIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiNumber: { fontSize: 24, fontWeight: '900' },
  kpiLabel: { fontSize: 13, fontWeight: '700' },
  kpiSub: { fontSize: 10, marginTop: 2 },
  hubSection: {},
  sectionTitle: { fontSize: 16, fontWeight: '800', marginBottom: 12 },
  hubGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  hubCard: {
    width: '48.5%',
    borderRadius: 16,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  hubIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  hubTitle: { fontSize: 14, fontWeight: '800' },
  hubDesc: { fontSize: 11, lineHeight: 15 },
});
