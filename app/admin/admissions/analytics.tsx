import { TourTarget, TourScrollView } from '@/src/features/app-tour';
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AdminHeader from '../../../src/components/AdminHeader';
import {
  admissionService,
} from '../../../src/services/admissionService';
import type { AdmissionAnalyticsData } from '../../../src/types/admission';
import { showAlert } from '../../../src/components/CustomAlert';

export default function AdmissionAnalyticsScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [analytics, setAnalytics] = useState<AdmissionAnalyticsData | null>(null);

  const fetchAnalytics = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await admissionService.getAnalytics();
      setAnalytics(res);
    } catch (err: any) {
      showAlert({
        title: 'Error Loading Analytics',
        message: err?.message || 'Could not fetch admission metrics',
        type: 'error',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  if (loading && !refreshing) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#0F766E" />
        <Text style={styles.loadingText}>Computing admissions analytics...</Text>
      </View>
    );
  }

  const funnel = analytics?.funnel;
  const enquiriesCount = funnel?.enquiries || 0;
  const applicationsCount = funnel?.applications || 0;
  const verifiedCount = funnel?.verified || 0;
  const interviewedCount = funnel?.interviewed || 0;
  const approvedCount = funnel?.approved || 0;
  const convertedCount = funnel?.converted || 0;

  const maxVal = Math.max(enquiriesCount, applicationsCount, 1);

  return (
    <View style={styles.container}>
      <TourTarget id="screen.admin-admissions-analytics.overview"><AdminHeader
        title="Admissions Analytics"
        showBackButton
        rightAction={{
          icon: 'refresh-outline',
          onPress: () => fetchAnalytics(true),
        }}
      /></TourTarget>

      <TourTarget id="screen.admin-admissions-analytics.workspace" native><TourScrollView
        style={styles.mainScroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => fetchAnalytics(true)} />
        }
      >
        {/* KPI Row */}
        <View style={styles.kpiRow}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiVal}>{analytics?.conversionRate || 0}%</Text>
            <Text style={styles.kpiLabel}>Conversion Rate</Text>
          </View>

          <View style={styles.kpiCard}>
            <Text style={styles.kpiVal}>{convertedCount}</Text>
            <Text style={styles.kpiLabel}>Enrolled Students</Text>
          </View>

          <View style={styles.kpiCard}>
            <Text style={styles.kpiVal}>{analytics?.averageTurnaroundDays || 0}d</Text>
            <Text style={styles.kpiLabel}>Avg Turnaround</Text>
          </View>
        </View>

        {/* Visual Conversion Funnel */}
        <View style={styles.card}>
          <Text style={styles.cardHeader}>Admissions Pipeline Funnel</Text>
          <Text style={styles.cardSub}>
            Conversion rate across candidate lifecycle milestones.
          </Text>

          {[
            { label: 'Enquiries Received', count: enquiriesCount, color: '#38BDF8' },
            { label: 'Applications Started', count: applicationsCount, color: '#0EA5E9' },
            { label: 'Documents Verified', count: verifiedCount, color: '#0284C7' },
            { label: 'Interviewed / Evaluated', count: interviewedCount, color: '#0F766E' },
            { label: 'Management Approved', count: approvedCount, color: '#059669' },
            { label: 'Official Students Enrolled', count: convertedCount, color: '#10B981' },
          ].map((step, idx) => {
            const widthPct = Math.max(8, Math.round((step.count / maxVal) * 100));
            return (
              <View key={step.label} style={styles.funnelRow}>
                <View style={styles.funnelMetaRow}>
                  <Text style={styles.funnelLabel}>{step.label}</Text>
                  <Text style={styles.funnelCount}>{step.count}</Text>
                </View>

                <View style={styles.funnelBarTrack}>
                  <View
                    style={[
                      styles.funnelBarFill,
                      { width: `${widthPct}%`, backgroundColor: step.color },
                    ]}
                  />
                </View>
              </View>
            );
          })}
        </View>

        {(analytics?.insights || []).length > 0 ? (
          <View style={styles.card}>
            <Text style={styles.cardHeader}>Operational Insights</Text>
            {(analytics?.insights || []).map((insight: string) => (
              <Text key={insight} style={styles.cardSub}>• {insight}</Text>
            ))}
          </View>
        ) : null}

        {/* Source Performance */}
        <View style={styles.card}>
          <Text style={styles.cardHeader}>Lead Acquisition Sources</Text>
          <Text style={styles.cardSub}>Where prospective students discover the school.</Text>

          {(analytics?.sourceBreakdown || []).length === 0 ? (
            <Text style={styles.emptyNote}>No source data recorded yet.</Text>
          ) : (
            (analytics?.sourceBreakdown || []).map((src: any) => (
              <View key={src.source} style={styles.sourceRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sourceName}>{src.source || 'Direct / Walk-in'}</Text>
                  <Text style={styles.sourceSub}>
                    {src.converted} converted ({src.conversionRate}%)
                  </Text>
                </View>
                <View style={styles.sourceBadge}>
                  <Text style={styles.sourceBadgeText}>{src.count} Leads</Text>
                </View>
              </View>
            ))
          )}
        </View>

        {/* SLA Compliance */}
        <View style={styles.card}>
          <Text style={styles.cardHeader}>Staff SLA & Operational Compliance</Text>
          <View style={styles.slaMetricRow}>
            <View style={styles.slaMetricBox}>
              <Text style={styles.slaMetricVal}>
                {analytics?.slaCompliance?.complianceRate || 100}%
              </Text>
              <Text style={styles.slaMetricLabel}>On-Time Processing</Text>
            </View>

            <View style={styles.slaMetricBox}>
              <Text style={[styles.slaMetricVal, { color: '#DC2626' }]}>
                {analytics?.slaCompliance?.breachedTasks || 0}
              </Text>
              <Text style={styles.slaMetricLabel}>Breached Milestones</Text>
            </View>
          </View>
        </View>
      </TourScrollView></TourTarget>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: '#64748B',
    fontSize: 14,
  },
  mainScroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 16,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 10,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  kpiVal: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F766E',
  },
  kpiLabel: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '600',
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardHeader: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  cardSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    marginBottom: 16,
  },
  funnelRow: {
    marginBottom: 12,
  },
  funnelMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  funnelLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  funnelCount: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  funnelBarTrack: {
    height: 12,
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
    overflow: 'hidden',
  },
  funnelBarFill: {
    height: '100%',
    borderRadius: 6,
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  sourceName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  sourceSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  sourceBadge: {
    backgroundColor: '#F0FDFA',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#99F6E4',
  },
  sourceBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F766E',
  },
  slaMetricRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  slaMetricBox: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  slaMetricVal: {
    fontSize: 24,
    fontWeight: '800',
    color: '#059669',
  },
  slaMetricLabel: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
    fontWeight: '600',
  },
  emptyNote: {
    fontSize: 13,
    color: '#94A3B8',
    fontStyle: 'italic',
    paddingVertical: 8,
  },
});
