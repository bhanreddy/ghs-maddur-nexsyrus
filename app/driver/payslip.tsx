import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar } from 'react-native';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import StudentHeader from '../../src/components/StudentHeader';
import { StaffService } from '../../src/services/staffService';
import { useAuth } from '../../src/hooks/useAuth';
import { useStaffPortalConfig } from '../../src/hooks/useStaffPortalConfig';
import { useTheme } from '../../src/hooks/useTheme';
import LogoLoader from '../../src/components/LogoLoader';

interface Payslip {
  id: string;
  month: string;
  status: string;
  earnings: string;
  deductions: string;
  net: string;
}

export default function DriverPayslip() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const PRIMARY_GRADIENT: [string, string] = [theme.colors.primary, theme.colors.primaryDark];
  const { payslipsEnabled, loading: configLoading } = useStaffPortalConfig();
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [loading, setLoading] = useState(true);

  const styles = React.useMemo(() => getStyles(theme), [theme]);

  useEffect(() => {
    if (!user || configLoading || !payslipsEnabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    StaffService.getMyPayslips()
      .then((data) => setPayslips(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user?.userId, payslipsEnabled, configLoading]);

  const totalEarnings = React.useMemo(() => {
    if (!payslips.length) return '₹0';
    const total = payslips.reduce((sum, item) => {
      const amount = parseFloat(item.earnings.replace(/[₹,]/g, '')) || 0;
      return sum + amount;
    }, 0);
    return `₹${total.toLocaleString('en-IN')}`;
  }, [payslips]);

  const totalDeductions = React.useMemo(() => {
    if (!payslips.length) return '₹0';
    const total = payslips.reduce((sum, item) => {
      const amount = parseFloat(item.deductions.replace(/[₹,]/g, '')) || 0;
      return sum + amount;
    }, 0);
    return `₹${total.toLocaleString('en-IN')}`;
  }, [payslips]);

  const handleDownload = () => {
    alertCompat('Coming Soon', 'PDF download will be available soon.');
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor="#0F0F1A" />
      <StudentHeader title="My Payslips" menuUserType="driver" />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {!configLoading && !payslipsEnabled ? (
          <View style={styles.emptyBox}>
            <Ionicons name="eye-off-outline" size={36} color="#CBD5E1" />
            <Text style={styles.emptyTitle}>Payslips are unavailable</Text>
            <Text style={styles.emptySubtitle}>Your school admin has disabled payslip access.</Text>
          </View>
        ) : (
        <>
        {/* ═══════ YTD Earnings Card ═══════ */}
        <Animated.View entering={FadeInDown.delay(100).duration(600)} style={styles.summaryCardWrap}>
          <LinearGradient
            colors={PRIMARY_GRADIENT}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.summaryCard}>

            {/* Decorative circles */}
            <View style={[styles.decor, { top: -20, right: -20, width: 80, height: 80 }]} />
            <View style={[styles.decor, { bottom: -10, left: -10, width: 50, height: 50 }]} />
            <View style={styles.summaryTop}>
              <View>
                <Text style={styles.summaryLabel}>Total Earnings (YTD)</Text>
                <Text style={styles.summaryValue}>{totalEarnings}</Text>
              </View>
              <View style={styles.summaryIconBox}>
                <FontAwesome5 name="coins" size={24} color="#FFF" />
              </View>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryBottom}>
              <View style={styles.miniStat}>
                <Text style={styles.miniStatLabel}>Months</Text>
                <Text style={styles.miniStatValue}>{payslips.length}</Text>
              </View>
              <View style={styles.miniStat}>
                <Text style={styles.miniStatLabel}>Deductions</Text>
                <Text style={styles.miniStatValue}>{totalDeductions}</Text>
              </View>
            </View>
          </LinearGradient>
        </Animated.View>
        {/* ═══════ Payslip List ═══════ */}
        <View style={styles.listHeader}>
          <View style={styles.listHeaderLeft}>
            <View style={styles.listIconBox}>
              <Ionicons name="receipt" size={16} color={theme.colors.primary} />
            </View>
            <Text style={styles.listTitle}>Recent Payslips</Text>
          </View>
          <Text style={styles.listCount}>{payslips.length} total</Text>
        </View>
        {loading ?
          <View style={styles.centerBox}>
            <LogoLoader size={30} color={theme.colors.primary} />
            <Text style={styles.centerText}>Loading payslips…</Text>
          </View> :
          payslips.length === 0 ?
            <Animated.View entering={FadeInDown.delay(200).duration(500)} style={styles.emptyCard}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="receipt-outline" size={36} color="#CBD5E1" />
              </View>
              <Text style={styles.emptyTitle}>No Payslips Yet</Text>
              <Text style={styles.emptySubtitle}>Your salary slips will appear here once processed by the accounts department.</Text>
            </Animated.View> :

            <View style={styles.listContainer}>
              {payslips.map((item, index) =>
                <Animated.View
                  key={item.id}
                  entering={FadeInDown.delay(250 + index * 80).duration(500)}
                  style={styles.payslipCard}>

                  {/* Header */}
                  <View style={styles.cardHeader}>
                    <View style={styles.monthRow}>
                      <View style={styles.calIcon}>
                        <Ionicons name="calendar" size={16} color={theme.colors.primary} />
                      </View>
                      <Text style={styles.monthText}>{item.month}</Text>
                    </View>
                    <View style={[
                      styles.statusBadge,
                      item.status === 'Paid' ? styles.paidBadge : styles.pendingBadge]
                    }>
                      <View style={[
                        styles.statusDot,
                        { backgroundColor: item.status === 'Paid' ? theme.colors.success : theme.colors.warning }]
                      } />
                      <Text style={[
                        styles.statusText,
                        item.status === 'Paid' ? styles.paidText : styles.pendingText]
                      }>{item.status}</Text>
                    </View>
                  </View>
                  <View style={styles.cardDivider} />
                  {/* Breakdown */}
                  <View style={styles.breakdownRow}>
                    <View style={styles.breakdownItem}>
                      <View style={[styles.breakdownDot, { backgroundColor: theme.colors.success }]} />
                      <View>
                        <Text style={styles.breakdownLabel}>Earnings</Text>
                        <Text style={[styles.breakdownValue, { color: theme.colors.success }]}>{item.earnings}</Text>
                      </View>
                    </View>
                    <View style={styles.breakdownItem}>
                      <View style={[styles.breakdownDot, { backgroundColor: theme.colors.danger }]} />
                      <View>
                        <Text style={styles.breakdownLabel}>Deductions</Text>
                        <Text style={[styles.breakdownValue, { color: theme.colors.danger }]}>{item.deductions}</Text>
                      </View>
                    </View>
                    <View style={[styles.breakdownItem, { alignItems: 'flex-end' }]}>
                      <View>
                        <Text style={[styles.breakdownLabel, { textAlign: 'right' }]}>Net Pay</Text>
                        <Text style={[styles.breakdownValue, { color: '#0F172A', fontWeight: '800', fontSize: 16 }]}>{item.net}</Text>
                      </View>
                    </View>
                  </View>
                  {/* Download */}
                  <TouchableOpacity
                    style={styles.downloadBtn}
                    onPress={() => handleDownload()}
                    activeOpacity={0.7}>

                    <Ionicons name="download-outline" size={16} color={theme.colors.primary} />
                    <Text style={[styles.downloadText, { color: theme.colors.primary }]}>Download PDF</Text>
                  </TouchableOpacity>
                </Animated.View>
              )}
            </View>
        }
        <View style={{ height: 100 }} />
        </>
        )}
      </ScrollView>
    </View>);

}

/* ════════════════════════════ STYLES ════════════════════════════ */
const getStyles = (theme: any) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'transparent'},
  scrollContent: { padding: 20 },

  /* ── Summary Card ── */
  summaryCardWrap: {
    borderRadius: 28, overflow: 'hidden', marginBottom: 32,
    backgroundColor: '#FFFFFF',
    shadowColor: theme.colors.primary, shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15, shadowRadius: 24, elevation: 8,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)'
  },
  summaryCard: { padding: 26, overflow: 'hidden' },
  decor: {
    position: 'absolute', borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)'
  },
  summaryTop: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'
  },
  summaryLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: '500', marginBottom: 6 },
  summaryValue: { color: '#FFF', fontSize: 34, fontWeight: '800', letterSpacing: 0.5 },
  summaryIconBox: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center', alignItems: 'center'
  },
  summaryDivider: {
    height: 1, backgroundColor: 'rgba(255,255,255,0.15)',
    marginVertical: 18
  },
  summaryBottom: {
    flexDirection: 'row', justifyContent: 'space-around'
  },
  miniStat: { alignItems: 'center' },
  miniStatLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 },
  miniStatValue: { color: '#FFF', fontSize: 16, fontWeight: '700' },

  /* ── List Header ── */
  listHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 20
  },
  listHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  listIconBox: {
    width: 32, height: 32, borderRadius: 12,
    backgroundColor: '#FDF2F8',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: theme.colors.primary, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 4, elevation: 1
  },
  listTitle: { fontSize: 18, fontWeight: '800', color: '#1E293B', letterSpacing: -0.3 },
  listCount: { fontSize: 12, color: '#94A3B8', fontWeight: '600' },

  /* ── Empty / Loading ── */
  centerBox: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  centerText: { color: '#94A3B8', fontSize: 13 },
  emptyBox: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20 },
  emptyCard: {
    alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24,
    backgroundColor: '#FFF', borderRadius: 20,
    shadowColor: '#64748B', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 1
  },
  emptyIconCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center', alignItems: 'center', marginBottom: 16
  },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#64748B', marginBottom: 6 },
  emptySubtitle: { fontSize: 13, color: '#94A3B8', textAlign: 'center', lineHeight: 20 },

  /* ── Payslip Card ── */
  listContainer: { gap: 16 },
  payslipCard: {
    backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24,
    shadowColor: '#94A3B8', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08, shadowRadius: 20, elevation: 3,
    borderWidth: 1, borderColor: 'rgba(226, 232, 240, 0.6)'
  },
  cardHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 16
  },
  monthRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  calIcon: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: '#FDF2F8',
    justifyContent: 'center', alignItems: 'center'
  },
  monthText: { fontSize: 17, fontWeight: '700', color: '#1F2937' },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, gap: 5
  },
  paidBadge: { backgroundColor: '#DCFCE7' },
  pendingBadge: { backgroundColor: '#FEF3C7' },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  paidText: { color: '#059669' },
  pendingText: { color: '#D97706' },
  cardDivider: { height: 1, backgroundColor: '#F1F5F9', marginBottom: 16 },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 18 },
  breakdownItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  breakdownDot: { width: 4, height: 20, borderRadius: 2 },
  breakdownLabel: { fontSize: 11, color: '#94A3B8', fontWeight: '500', marginBottom: 2 },
  breakdownValue: { fontSize: 15, fontWeight: '700' },
  downloadBtn: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    paddingVertical: 14, backgroundColor: '#FDF2F8',
    borderRadius: 16, gap: 8, marginTop: 4
  },
  downloadText: { fontWeight: '700', fontSize: 14 }
});