import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as WebBrowser from 'expo-web-browser';
import AdminHeader from '../../src/components/AdminHeader';
import { useTheme } from '../../src/hooks/useTheme';
import {
  SubscriptionPayment,
  SubscriptionPortal,
  SubscriptionReceipt,
  SubscriptionService,
} from '../../src/services/subscriptionService';

const money = (value: number | string | null | undefined) =>
  `₹${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const date = (value?: string | null) => {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const statusLabel = (value?: string | null) =>
  String(value || 'not configured').replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

function paymentTone(status: SubscriptionPayment['status']) {
  if (status === 'completed') return { color: '#047857', bg: '#D1FAE5', icon: 'checkmark-circle' as const };
  if (status === 'failed' || status === 'expired') return { color: '#B91C1C', bg: '#FEE2E2', icon: 'close-circle' as const };
  return { color: '#B45309', bg: '#FEF3C7', icon: 'time' as const };
}

export default function SubscriptionScreen() {
  const { theme, isDark } = useTheme();
  const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark]);
  const { width } = useWindowDimensions();
  const wide = width >= 860;
  const [portal, setPortal] = useState<SubscriptionPortal | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [paying, setPaying] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      setPortal(await SubscriptionService.getPortal());
    } catch (loadError: any) {
      setError(loadError?.message || 'Your subscription details are temporarily unavailable.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const subscription = portal?.subscription;
  const amountDue = Number(subscription?.amount_due || 0);
  const showReminder = Boolean(subscription?.reminder_enabled && amountDue > 0);

  const checkPayment = useCallback(async (payment: SubscriptionPayment) => {
    try {
      const verified = await SubscriptionService.getPaymentStatus(payment.merchant_order_id);
      if (verified.status === 'completed') {
        Alert.alert('Payment received', 'Thank you. PhonePe has confirmed your payment. Your receipt will appear here after NexSyrus issues it.');
      } else if (verified.status === 'failed' || verified.status === 'expired') {
        Alert.alert('Payment not completed', 'PhonePe did not confirm this payment. You can safely try again.');
      } else {
        Alert.alert('Verification in progress', 'PhonePe is still processing this payment. Please check again in a moment.');
      }
      await load(true);
    } catch (statusError: any) {
      Alert.alert('Could not verify payment', statusError?.message || 'Please try again shortly.');
    }
  }, [load]);

  const payNow = async () => {
    if (paying || amountDue <= 0) return;
    setPaying(true);
    try {
      const payment = await SubscriptionService.startPayment();
      if (!payment.checkout_url) throw new Error('PhonePe did not return a checkout link.');
      await WebBrowser.openBrowserAsync(payment.checkout_url, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.FORM_SHEET,
        controlsColor: theme.colors.primary,
      });
      await checkPayment(payment);
    } catch (paymentError: any) {
      Alert.alert('Payment could not start', paymentError?.message || 'Please try again later.');
    } finally {
      setPaying(false);
    }
  };

  const downloadReceipt = async (receipt: SubscriptionReceipt) => {
    setDownloading(receipt.id);
    try {
      await SubscriptionService.downloadReceipt(receipt);
    } catch (downloadError: any) {
      Alert.alert('Download failed', downloadError?.message || 'The receipt could not be downloaded.');
    } finally {
      setDownloading(null);
    }
  };

  if (loading) {
    return <View style={styles.screen}><AdminHeader title="Subscription & Billing" showNotification /><View style={styles.center}><ActivityIndicator size="large" color={theme.colors.primary} /><Text style={styles.centerText}>Loading secure billing details…</Text></View></View>;
  }

  return (
    <View style={styles.screen}>
      <AdminHeader title="Subscription & Billing" showNotification />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={theme.colors.primary} />}
      >
        {error ? (
          <View style={styles.errorCard}>
            <Ionicons name="cloud-offline-outline" size={30} color={theme.colors.danger} />
            <Text style={styles.errorTitle}>Billing details unavailable</Text>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.outlineButton} onPress={() => load()}><Text style={styles.outlineButtonText}>Try again</Text></TouchableOpacity>
          </View>
        ) : !subscription ? (
          <View style={styles.emptyCard}>
            <Ionicons name="documents-outline" size={34} color={theme.colors.textTertiary} />
            <Text style={styles.emptyTitle}>Subscription setup is in progress</Text>
            <Text style={styles.emptyText}>NexSyrus has not configured a plan for this school yet. There is nothing you need to do right now.</Text>
          </View>
        ) : (
          <>
            {showReminder && (
              <View style={styles.reminder}>
                <View style={styles.reminderIcon}><Ionicons name="notifications-outline" size={20} color="#B45309" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.reminderTitle}>A gentle payment reminder</Text>
                  <Text style={styles.reminderText}>{subscription.reminder_message?.trim() || 'When convenient, please review the subscription amount below. Thank you for continuing with NexSyrus.'}</Text>
                </View>
              </View>
            )}

            <LinearGradient colors={isDark ? ['#172554', '#164E63'] : ['#1D4ED8', '#0F766E']} style={styles.hero}>
              <View style={styles.heroTop}>
                <View style={styles.planIcon}><Ionicons name="diamond-outline" size={22} color="#FFFFFF" /></View>
                <View style={{ flex: 1 }}><Text style={styles.heroKicker}>CURRENT PLAN</Text><Text style={styles.heroTitle}>{subscription.plan_name}</Text></View>
                <View style={styles.statusPill}><View style={styles.statusDot} /><Text style={styles.statusText}>{statusLabel(subscription.subscription_status)}</Text></View>
              </View>
              <View style={[styles.heroBottom, !wide && { flexDirection: 'column', alignItems: 'stretch' }]}>
                <View><Text style={styles.dueLabel}>{amountDue > 0 ? 'AMOUNT DUE' : 'ACCOUNT BALANCE'}</Text><Text style={styles.dueValue}>{money(amountDue)}</Text><Text style={styles.dueDate}>{amountDue > 0 ? `Due ${date(subscription.next_due_date)}` : 'No payment is due'}</Text></View>
                {amountDue > 0 && (
                  <TouchableOpacity disabled={paying || !portal?.gateway.available} style={[styles.payButton, (!portal?.gateway.available || paying) && { opacity: 0.55 }]} onPress={payNow}>
                    {paying ? <ActivityIndicator color="#1D4ED8" /> : <Ionicons name="shield-checkmark-outline" size={19} color="#1D4ED8" />}
                    <Text style={styles.payButtonText}>{paying ? 'Opening PhonePe…' : portal?.gateway.available ? 'Pay securely' : 'Gateway unavailable'}</Text>
                  </TouchableOpacity>
                )}
              </View>
              <View style={styles.secureLine}><Ionicons name="lock-closed" size={12} color="rgba(255,255,255,.76)" /><Text style={styles.secureText}>Secure checkout powered by PhonePe. NexSyrus never stores card or UPI credentials.</Text></View>
            </LinearGradient>

            <View style={[styles.metricGrid, wide && styles.metricGridWide]}>
              {[
                { label: 'Plan fee', value: money(subscription.monthly_fee), icon: 'wallet-outline' as const },
                { label: 'Billing cycle', value: statusLabel(subscription.billing_cycle), icon: 'repeat-outline' as const },
                { label: 'Current period', value: `${date(subscription.current_period_start)} – ${date(subscription.current_period_end)}`, icon: 'calendar-outline' as const },
                { label: 'Last payment', value: date(subscription.last_paid_at), icon: 'checkmark-done-outline' as const },
              ].map((item) => <View key={item.label} style={styles.metricCard}><View style={styles.metricIcon}><Ionicons name={item.icon} size={19} color={theme.colors.primary} /></View><Text style={styles.metricLabel}>{item.label}</Text><Text style={styles.metricValue} numberOfLines={1}>{item.value}</Text></View>)}
            </View>

            <SectionTitle title="Receipts" subtitle="Issued by NexSyrus after payment verification" icon="receipt-outline" styles={styles} />
            {portal.receipts.length === 0 ? (
              <View style={styles.listEmpty}><Ionicons name="receipt-outline" size={26} color={theme.colors.textTertiary} /><Text style={styles.listEmptyTitle}>No receipts issued yet</Text><Text style={styles.listEmptyText}>Completed payment receipts will appear here as soon as Super Admin issues them.</Text></View>
            ) : portal.receipts.map((receipt) => (
              <View key={receipt.id} style={styles.listRow}>
                <View style={styles.receiptIcon}><Ionicons name="document-text-outline" size={20} color="#047857" /></View>
                <View style={{ flex: 1, minWidth: 0 }}><Text style={styles.rowTitle} numberOfLines={1}>{receipt.document_number}</Text><Text style={styles.rowMeta}>{date(receipt.issued_at || receipt.created_at)} · FY {receipt.financial_year}</Text></View>
                <Text style={styles.rowAmount}>{money(receipt.total_amount)}</Text>
                <TouchableOpacity disabled={downloading === receipt.id} style={styles.downloadButton} onPress={() => downloadReceipt(receipt)}>{downloading === receipt.id ? <ActivityIndicator size="small" color={theme.colors.primary} /> : <Ionicons name="download-outline" size={19} color={theme.colors.primary} />}</TouchableOpacity>
              </View>
            ))}

            <SectionTitle title="Payment activity" subtitle="PhonePe verification status for recent attempts" icon="time-outline" styles={styles} />
            {portal.payments.length === 0 ? (
              <View style={styles.listEmpty}><Text style={styles.listEmptyText}>No online subscription payments yet.</Text></View>
            ) : portal.payments.map((payment) => {
              const tone = paymentTone(payment.status);
              return <View key={payment.id} style={styles.listRow}><View style={[styles.receiptIcon, { backgroundColor: tone.bg }]}><Ionicons name={tone.icon} size={20} color={tone.color} /></View><View style={{ flex: 1, minWidth: 0 }}><Text style={styles.rowTitle}>{statusLabel(payment.status)}</Text><Text style={styles.rowMeta}>{date(payment.created_at)} · {payment.merchant_order_id}</Text></View><View style={{ alignItems: 'flex-end', gap: 6 }}><Text style={styles.rowAmount}>{money(payment.amount)}</Text>{payment.status === 'pending' && <TouchableOpacity onPress={() => checkPayment(payment)}><Text style={styles.verifyText}>Check status</Text></TouchableOpacity>}</View></View>;
            })}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function SectionTitle({ title, subtitle, icon, styles }: any) {
  return <View style={styles.sectionHeader}><View style={styles.sectionHeaderIcon}><Ionicons name={icon} size={18} color="#2563EB" /></View><View><Text style={styles.sectionTitle}>{title}</Text><Text style={styles.sectionSubtitle}>{subtitle}</Text></View></View>;
}

function createStyles(theme: any, isDark: boolean) {
  const cardShadow = isDark ? {} : { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.06, shadowRadius: 15, elevation: 2 };
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background },
    content: { width: '100%', maxWidth: 1080, alignSelf: 'center', padding: 18, paddingBottom: 40 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }, centerText: { color: theme.colors.textSecondary, fontSize: 13 },
    reminder: { flexDirection: 'row', gap: 11, padding: 14, borderRadius: 17, borderWidth: 1, borderColor: isDark ? 'rgba(245,158,11,.3)' : '#FDE68A', backgroundColor: isDark ? 'rgba(146,64,14,.18)' : '#FFFBEB', marginBottom: 15 },
    reminderIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? 'rgba(245,158,11,.16)' : '#FEF3C7' },
    reminderTitle: { color: isDark ? '#FDE68A' : '#92400E', fontSize: 13, fontWeight: '800', marginBottom: 3 }, reminderText: { color: isDark ? '#FED7AA' : '#78350F', fontSize: 12, lineHeight: 18 },
    hero: { borderRadius: 25, padding: 20, overflow: 'hidden', ...cardShadow }, heroTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    planIcon: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,.16)' },
    heroKicker: { color: 'rgba(255,255,255,.7)', fontSize: 10, fontWeight: '800', letterSpacing: 1 }, heroTitle: { color: '#FFFFFF', fontSize: 21, fontWeight: '800', marginTop: 3 },
    statusPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, backgroundColor: 'rgba(255,255,255,.14)' }, statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#6EE7B7' }, statusText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
    heroBottom: { marginTop: 26, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }, dueLabel: { color: 'rgba(255,255,255,.68)', fontSize: 10, letterSpacing: .8, fontWeight: '800' }, dueValue: { color: '#FFFFFF', fontSize: 34, fontWeight: '900', letterSpacing: -1, marginTop: 2 }, dueDate: { color: 'rgba(255,255,255,.76)', fontSize: 12, marginTop: 3 },
    payButton: { minHeight: 49, paddingHorizontal: 19, borderRadius: 15, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, payButtonText: { color: '#1D4ED8', fontSize: 13, fontWeight: '900' },
    secureLine: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 18 }, secureText: { color: 'rgba(255,255,255,.70)', fontSize: 10, flex: 1 },
    metricGrid: { marginTop: 14, gap: 10 }, metricGridWide: { flexDirection: 'row' }, metricCard: { flex: 1, minWidth: 0, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.card, borderRadius: 18, padding: 14, ...cardShadow }, metricIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: isDark ? 'rgba(59,130,246,.12)' : '#EFF6FF', alignItems: 'center', justifyContent: 'center', marginBottom: 11 }, metricLabel: { color: theme.colors.textSecondary, fontSize: 10, textTransform: 'uppercase', fontWeight: '800', letterSpacing: .5 }, metricValue: { color: theme.colors.textStrong, fontSize: 14, fontWeight: '800', marginTop: 4 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 28, marginBottom: 11 }, sectionHeaderIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? 'rgba(37,99,235,.14)' : '#EFF6FF' }, sectionTitle: { color: theme.colors.textStrong, fontSize: 17, fontWeight: '800' }, sectionSubtitle: { color: theme.colors.textSecondary, fontSize: 11, marginTop: 2 },
    listRow: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 14, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.card, borderRadius: 17, marginBottom: 9, ...cardShadow }, receiptIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: isDark ? 'rgba(16,185,129,.14)' : '#ECFDF5', alignItems: 'center', justifyContent: 'center' }, rowTitle: { color: theme.colors.textStrong, fontSize: 13, fontWeight: '800' }, rowMeta: { color: theme.colors.textSecondary, fontSize: 10, marginTop: 3 }, rowAmount: { color: theme.colors.textStrong, fontSize: 13, fontWeight: '900' }, downloadButton: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? 'rgba(59,130,246,.12)' : '#EFF6FF' }, verifyText: { color: theme.colors.primary, fontSize: 10, fontWeight: '800' },
    listEmpty: { alignItems: 'center', padding: 24, borderRadius: 18, borderWidth: 1, borderStyle: 'dashed', borderColor: theme.colors.border, backgroundColor: isDark ? 'rgba(255,255,255,.02)' : '#F8FAFC' }, listEmptyTitle: { color: theme.colors.textStrong, fontSize: 13, fontWeight: '800', marginTop: 8 }, listEmptyText: { color: theme.colors.textSecondary, fontSize: 11, lineHeight: 17, textAlign: 'center', marginTop: 4 },
    emptyCard: { alignItems: 'center', marginTop: 30, padding: 30, backgroundColor: theme.colors.card, borderRadius: 22, borderWidth: 1, borderColor: theme.colors.border }, emptyTitle: { color: theme.colors.textStrong, fontSize: 17, fontWeight: '800', marginTop: 12 }, emptyText: { color: theme.colors.textSecondary, fontSize: 12, lineHeight: 19, textAlign: 'center', maxWidth: 480, marginTop: 6 },
    errorCard: { alignItems: 'center', marginTop: 30, padding: 28, borderRadius: 22, borderWidth: 1, borderColor: isDark ? 'rgba(248,113,113,.25)' : '#FECACA', backgroundColor: isDark ? 'rgba(127,29,29,.12)' : '#FEF2F2' }, errorTitle: { color: theme.colors.textStrong, fontSize: 17, fontWeight: '800', marginTop: 10 }, errorText: { color: theme.colors.textSecondary, textAlign: 'center', fontSize: 12, marginTop: 5 }, outlineButton: { marginTop: 15, borderWidth: 1, borderColor: theme.colors.primary, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 }, outlineButtonText: { color: theme.colors.primary, fontWeight: '800', fontSize: 12 },
  });
}
