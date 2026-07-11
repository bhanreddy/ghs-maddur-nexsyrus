import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Platform, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ScreenLayout from '../../src/components/ScreenLayout';
import StudentHeader from '../../src/components/StudentHeader';
import { StudentService } from '../../src/services/studentService';
import { useStudentQuery } from '../../src/hooks/useStudentQuery';
import type { Student } from '../../src/types/models';
import { FeeService } from '../../src/services/feeService';
import { StudentFee, FeeReceipt } from '../../src/types/models';
import { useAuth } from '../../src/hooks/useAuth';
import * as Haptics from '@/src/utils/haptics';
import { escapeHtml, printHtmlOnWeb } from '../../src/utils/pdfGenerator';
import { useTheme, type SchoolTheme } from '../../src/hooks/useTheme';
import { SchoolSettingsService, SchoolSettings } from '../../src/services/schoolSettingsService';
import LogoLoader from '../../src/components/LogoLoader';
import { useTranslation } from 'react-i18next';
import { t_field } from '../../src/utils/lang';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import { useFeatureGuard } from '../../src/hooks/useFeatures';
export default function FeesScreen() {
  useFeatureGuard('nav.fees'); // deep-link guard: redirect Home if Fees is disabled
  const {
    theme,
    isDark
  } = useTheme();
  const styles = React.useMemo(() => getStyles(theme), [theme]);
  const {
    user
  } = useAuth();
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const isWide = width >= 900;
  const isCompact = width < 520;
  const roleCode = typeof user?.role === 'object' && user?.role !== null ? (user.role as { code: string }).code : user?.role;
  const isStudent = roleCode === 'student';
  const [activeTab, setActiveTab] = useState<'breakdown' | 'history'>('breakdown');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { data: profile, refetch: refetchProfile } = useStudentQuery<Student>(
    '/students/profile/me',
    'profile',
    3 * 60 * 1000,
    user?.userId,
    { enabled: !!user?.userId && isStudent }
  );
  const [userProfile, setUserProfile] = useState<any>(null);
  const [fees, setFees] = useState<StudentFee[]>([]);
  const [receipts, setReceipts] = useState<FeeReceipt[]>([]);
  const [loadingReceipts, setLoadingReceipts] = useState(false);
  const [summary, setSummary] = useState({
    total_due: 0,
    total_paid: 0,
    balance: 0
  });
  const [schoolSettings, setSchoolSettings] = useState<SchoolSettings | null>(null);
  useEffect(() => {
    const run = async () => {
      if (!user?.userId || !isStudent || !profile?.id) {
        setLoading(false);
        return;
      }
      try {
        setUserProfile(profile);
        const feeData = await StudentService.getFees(profile.id);
        setFees(feeData.fees || []);
        setSummary(feeData.summary || {
          total_due: 0,
          total_paid: 0,
          balance: 0
        });
      } catch {

      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    };
    void run();
  }, [user?.userId, isStudent, profile]);
  const loadSchoolSettings = async () => {
    try {
      const data = await SchoolSettingsService.getSettings();
      setSchoolSettings(data);
    } catch {

    }
  };
  useEffect(() => {
    loadSchoolSettings();
  }, []);
  const onRefresh = async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const fresh = await refetchProfile();
      const sid = fresh?.id ?? profile?.id;
      if (sid) {
        const feeData = await StudentService.getFees(sid);
        setFees(feeData.fees || []);
        setSummary(feeData.summary || { total_due: 0, total_paid: 0, balance: 0 });
      }
    } finally {
      setRefreshing(false);
    }
  };
  const loadReceipts = async () => {
    if (!userProfile?.id) return;
    setLoadingReceipts(true);
    try {
      const data = await FeeService.getReceipts({
        student_id: userProfile.id
      });
      setReceipts(data || []);
    } catch {

    } finally {
      setLoadingReceipts(false);
    }
  };

  const handleDownloadReceipt = async (receiptSummary: FeeReceipt) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      // Fetch full receipt details including items and student info
      const receipt = await FeeService.getReceipt(receiptSummary.id);

      if (!receipt) {
        alert('Could not fetch receipt details');
        return;
      }

      const html = `
        <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
            <style>
              body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 20px; color: #333; }
              .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #4F46E5; padding-bottom: 20px; }
              .school-name { font-size: 24px; font-weight: bold; color: #4F46E5; margin-bottom: 5px; }
              .school-address { font-size: 12px; color: #64748b; margin-bottom: 5px; }
              .school-contact { font-size: 12px; color: #64748b; margin-bottom: 10px; }
              .receipt-title { font-size: 18px; color: #666; letter-spacing: 2px; text-transform: uppercase; margin-top: 15px; }
              .details-container { display: flex; justify-content: space-between; margin-bottom: 30px; background: #f8fafc; padding: 15px; border-radius: 8px; }
              .detail-col { flex: 1; }
              .label { font-size: 12px; color: #64748b; text-transform: uppercase; margin-bottom: 4px; }
              .value { font-size: 14px; font-weight: 600; color: #1e293b; margin-bottom: 12px; }
              table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
              th, td { padding: 12px; text-align: left; border-bottom: 1px solid #e2e8f0; }
              th { background-color: #f8fafc; font-weight: 600; color: #475569; font-size: 14px; }
              td { font-size: 14px; color: #1e293b; }
              .total-row { font-weight: bold; background-color: #f8fafc; }
              .total-amount { font-size: 18px; color: #4F46E5; }
              .footer { text-align: center; margin-top: 50px; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 20px; }
            </style>
          </head>
          <body>
            <div class="header">
              <div class="school-name">${schoolSettings?.school_name || 'School'}</div>
              ${schoolSettings?.school_address ? `<div class="school-address">${schoolSettings.school_address}</div>` : ''}
              ${schoolSettings?.school_phone || schoolSettings?.school_website ?
      `<div class="school-contact">
                  ${schoolSettings?.school_phone ? `Phone: ${schoolSettings.school_phone}` : ''}
                  ${schoolSettings?.school_phone && schoolSettings?.school_website ? ' &nbsp;|&nbsp; ' : ''}
                  ${schoolSettings?.school_website ? `Web: ${schoolSettings.school_website}` : ''}
                </div>` :
      ''}
              <div class="receipt-title">Fee Receipt</div>
            </div>

            <div class="details-container">
              <div class="detail-col">
                <div class="label">Receipt No</div>
                <div class="value">#${receipt.receipt_no}</div>
                <div class="label">Date</div>
                <div class="value">${new Date(receipt.issued_at).toLocaleDateString()}</div>
              </div>
              <div class="detail-col">
                <div class="label">Student Name</div>
                <div class="value">${receipt.student_name || 'Student'}</div>
                ${receipt.father_name ? `
                <div class="label">Father's Name</div>
                <div class="value">${escapeHtml(receipt.father_name)}</div>
                ` : ''}
                ${receipt.father_mobile ? `
                <div class="label">Father Mobile</div>
                <div class="value">${escapeHtml(receipt.father_mobile)}</div>
                ` : ''}
                <div class="label">Admission No</div>
                <div class="value">${receipt.admission_no || 'N/A'}</div>
                ${receipt.class_name || receipt.section_name ? `
                <div class="label">Class &amp; Section</div>
                <div class="value">${[receipt.class_name, receipt.section_name].filter(Boolean).join(' — ') || 'N/A'}</div>
                ` : ''}
              </div>
            </div>

            <table>
              <thead>
                <tr>
                  <th>Fee Type</th>
                  <th>Payment Method</th>
                  <th>Date</th>
                  <th style="text-align: right">Amount</th>
                </tr>
              </thead>
              <tbody>
                ${receipt.items?.map((item) => `
                  <tr>
                    <td>${item.fee_type || 'Fee Payment'}</td>
                    <td>${(item.payment_method || 'online').toUpperCase()}
                        ${item.transaction_ref ? `<br><small style="color: #64748b">Ref: ${item.transaction_ref}</small>` : ''}
                    </td>
                    <td>${item.paid_at ? new Date(item.paid_at).toLocaleDateString() : 'N/A'}</td>
                    <td style="text-align: right">₹${item.amount.toLocaleString()}</td>
                  </tr>
                `).join('') || ''}
                <tr class="total-row">
                  <td colspan="3" style="text-align: right">Total Amount</td>
                  <td class="total-amount" style="text-align: right">₹${receipt.total_amount.toLocaleString()}</td>
                </tr>
              </tbody>
            </table>

            <div class="footer">
              <p>This is a computer-generated document. No signature is required.</p>
              ${receipt.issued_by_name ? `<p>Generated by: ${receipt.issued_by_name}</p>` : ''}
            </div>
          </body>
        </html>
      `;

      if (Platform.OS === 'web') {
        await printHtmlOnWeb(html);
        return;
      }
      const [Print, Sharing] = await Promise.all([import('expo-print'), import('expo-sharing')]);
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
    } catch {

      alert('Failed to generate receipt');
    }
  };

  const formatAdjustmentOption = (adj: { amount: number; created_at: string; adjustment_type?: string }) => {
    const isAdd = adj.adjustment_type === 'add';
    const sign = isAdd ? '+' : '−';
    const label = isAdd ? 'Added' : 'Waived';
    return `${label}: ${sign}₹${adj.amount.toLocaleString()} (${new Date(adj.created_at).toLocaleDateString()})`;
  };

  const handleDownloadAdjustmentReceipt = async (item: StudentFee) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setLoadingReceipts(true);
      const res = await FeeService.getAdjustments({ student_fee_id: item.id });
      const adjustments = res?.data || [];

      if (adjustments.length === 0) {
        alert('No adjustment records found for this fee component.');
        return;
      }

      const generatePdf = async (adj: any) => {
        const details = await FeeService.getAdjustment(adj.id);
        const { generateAdjustmentPDF } = await import('../../src/utils/pdfGenerator');
        await generateAdjustmentPDF(details, schoolSettings);
      };

      if (adjustments.length === 1) {
        await generatePdf(adjustments[0]);
      } else {
        const options = adjustments.map((a: any) => ({
          text: formatAdjustmentOption(a),
          onPress: () => void generatePdf(a)
        }));
        options.push({ text: 'Cancel', style: 'cancel' } as any);
        alertCompat(
          'Multiple Adjustments Found',
          'Please select which adjustment receipt to download:',
          options
        );
      }
    } catch {
      alert('Failed to download adjustment receipt.');
    } finally {
      setLoadingReceipts(false);
    }
  };

  const formatCurrency = (amount: number) => `₹${Math.max(0, amount).toLocaleString('en-IN')}`;
  const paidPercent = summary.total_due > 0
    ? Math.min(100, Math.round((summary.total_paid / summary.total_due) * 100))
    : 0;

  const handlePayNow = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    alertCompat(
      t('onlinePaymentsUnavailable', 'Online payments are not available yet'),
      t('contactSchoolForPayment', 'Please contact the school office for the available payment methods.')
    );
  };

  const renderFeeItem = ({
    item

  }: { item: StudentFee }) => {
    const billedAmount = Math.max(0, item.amount_due - item.discount);
    const balanceAmount = Math.max(0, billedAmount - item.amount_paid);
    const percent = billedAmount > 0 ? Math.min(100, (item.amount_paid / billedAmount) * 100) : 0;
    const statusTone = item.status === 'paid' || item.status === 'waived'
      ? { color: theme.colors.success, backgroundColor: isDark ? 'rgba(52,211,153,0.12)' : '#ECFDF5' }
      : item.status === 'overdue'
        ? { color: theme.colors.danger, backgroundColor: isDark ? 'rgba(248,113,113,0.12)' : '#FEF2F2' }
        : { color: theme.colors.warning, backgroundColor: isDark ? 'rgba(251,191,36,0.12)' : '#FFFBEB' };
    return <View style={[styles.feeCard, isWide && styles.feeCardWide]}>
      <View style={styles.feeHeader}>
        <View style={styles.feeTitleGroup}>
          <View style={styles.feeIcon}>
            <Ionicons name="receipt-outline" size={18} color={theme.colors.primary} />
          </View>
          <View style={styles.feeTitleCopy}>
            <Text style={styles.feeTitle} numberOfLines={1}>{t_field(item.fee_type, item.fee_type_te)}</Text>
            <Text style={styles.dueDate}>
              {t('dueOn', 'Due')} {new Date(item.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            </Text>
          </View>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusTone.backgroundColor }]}>
          <Text style={[styles.statusText, { color: statusTone.color }]}>
            {t(item.status.toLowerCase(), item.status).toUpperCase()}
          </Text>
        </View>
      </View>

      <View style={styles.progressHeading}>
        <Text style={styles.progressLabel}>{t('paymentProgress', 'Payment progress')}</Text>
        <Text style={styles.progressPercent}>{Math.round(percent)}%</Text>
      </View>
      <View style={styles.progressBarBg}>
        <View style={[styles.progressBarFill, percent >= 100 && styles.progressBarPaid, {
          width: `${Math.min(percent, 100)}%`
        }]} />
      </View>

      <View style={styles.amountGrid}>
        <View style={styles.amountCell}>
          <Text style={styles.amountLabel}>{t('billed', 'Billed')}</Text>
          <Text style={styles.amountValue}>{formatCurrency(billedAmount)}</Text>
        </View>
        <View style={[styles.amountCell, styles.amountCellMiddle]}>
          <Text style={styles.amountLabel}>{t('paid', 'Paid')}</Text>
          <Text style={[styles.amountValue, styles.amountPaid]}>{formatCurrency(item.amount_paid)}</Text>
        </View>
        <View style={[styles.amountCell, styles.amountCellEnd]}>
          <Text style={styles.amountLabel}>{t('balance', 'Balance')}</Text>
          <Text style={[styles.amountValue, balanceAmount > 0 && styles.amountBalance]}>{formatCurrency(balanceAmount)}</Text>
        </View>
      </View>

      {((item.adjustment_count ?? 0) > 0 || item.discount > 0) && (
        <View style={styles.cardActionArea}>
          <TouchableOpacity 
            style={styles.inlineAction}
            onPress={() => handleDownloadAdjustmentReceipt(item)}
            accessibilityRole="button"
          >
            <Ionicons name="download-outline" size={15} color={theme.colors.primary} />
            <Text style={styles.inlineActionText}>{t('adjustmentReceipt', 'Adjustment receipt')}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>;
  };
  if (loading) {
    return <ScreenLayout>
      <StudentHeader title={t('fees')} />
      <View style={{
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center'
      }}>
        <LogoLoader size={60} color="#4F46E5" />
      </View>
    </ScreenLayout>;
  }
  return <ScreenLayout>
    <StudentHeader title={t('fees')} />

    <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} colors={[theme.colors.primary]} progressBackgroundColor={theme.colors.surface} />}>
      <View style={styles.pageContent}>
                {refreshing &&
      <View style={styles.refreshLoader}>
                        <LogoLoader size={30} />
                    </View>
      }
      {/* SUMMARY CARD */}
      <View style={styles.summaryCard}>
        <View style={[styles.summaryRow, isCompact && styles.summaryRowCompact]}>
          <View style={styles.balanceBlock}>
            <View style={styles.summaryEyebrow}>
              <View style={styles.summaryIcon}>
                <Ionicons name="wallet-outline" size={20} color={theme.colors.primary} />
              </View>
              <Text style={styles.summaryLabel}>{t('outstandingBalance', 'Outstanding balance')}</Text>
            </View>
            <Text style={styles.summaryValue}>{formatCurrency(summary.balance)}</Text>
            <Text style={styles.summaryHint}>
              {summary.balance > 0
                ? t('feesPendingHint', 'Amount pending across your assigned fees')
                : t('feesClearedHint', 'You have no outstanding fee balance')}
            </Text>
          </View>
          {summary.balance > 0 && <TouchableOpacity
            style={[styles.payButton, isCompact && styles.payButtonCompact]}
            onPress={handlePayNow}
            activeOpacity={0.82}
            accessibilityRole="button"
            accessibilityLabel={t('payNow', 'Pay now')}
          >
            <Text style={styles.payBtnText}>{t('payNow', 'Pay now')}</Text>
            <Ionicons name="arrow-forward" size={17} color="#FFFFFF" />
          </TouchableOpacity>}
        </View>

        <View style={styles.collectionProgress}>
          <View style={styles.collectionProgressHeader}>
            <Text style={styles.collectionProgressLabel}>{t('overallPaymentProgress', 'Overall payment progress')}</Text>
            <Text style={styles.collectionProgressValue}>{paidPercent}%</Text>
          </View>
          <View style={styles.summaryProgressTrack}>
            <View style={[styles.summaryProgressFill, { width: `${paidPercent}%` }]} />
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>{t('totalFee', 'Total Fee')}</Text>
            <Text style={styles.statValue}>{formatCurrency(summary.total_due)}</Text>
          </View>
          <View style={[styles.statItem, styles.statItemBorder]}>
            <Text style={styles.statLabel}>{t('paid', 'Paid')}</Text>
            <Text style={styles.statValueSuccess}>{formatCurrency(summary.total_paid)}</Text>
          </View>
          <View style={[styles.statItem, styles.statItemBorder]}>
            <Text style={styles.statLabel}>{t('remaining', 'Remaining')}</Text>
            <Text style={styles.statValue}>{formatCurrency(summary.balance)}</Text>
          </View>
        </View>
      </View>

      {/* TABS */}
      <View style={styles.tabContainer}>
        <TouchableOpacity style={[styles.tab, activeTab === 'breakdown' && styles.activeTab]} onPress={() => setActiveTab('breakdown')} accessibilityRole="tab" accessibilityState={{ selected: activeTab === 'breakdown' }}>
          <Ionicons name="list-outline" size={17} color={activeTab === 'breakdown' ? theme.colors.primary : theme.colors.textSecondary} />
          <Text style={[styles.tabText, activeTab === 'breakdown' && styles.activeTabText]}>
            {t('breakdown', 'Breakdown')}
          </Text>
          <View style={[styles.tabCount, activeTab === 'breakdown' && styles.tabCountActive]}><Text style={[styles.tabCountText, activeTab === 'breakdown' && styles.tabCountTextActive]}>{fees.length}</Text></View>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, activeTab === 'history' && styles.activeTab]} onPress={() => {
          setActiveTab('history');
          if (receipts.length === 0) loadReceipts();
        }} accessibilityRole="tab" accessibilityState={{ selected: activeTab === 'history' }}>
          <Ionicons name="document-text-outline" size={17} color={activeTab === 'history' ? theme.colors.primary : theme.colors.textSecondary} />
          <Text style={[styles.tabText, activeTab === 'history' && styles.activeTabText]}>
            {t('receipts', 'Receipts')}
          </Text>
          {receipts.length > 0 && <View style={[styles.tabCount, activeTab === 'history' && styles.tabCountActive]}><Text style={[styles.tabCountText, activeTab === 'history' && styles.tabCountTextActive]}>{receipts.length}</Text></View>}
        </TouchableOpacity>
      </View>

      {/* CONTENT */}
      <View style={styles.contentSection}>
        {activeTab === 'breakdown' ? fees.length === 0 ? <View style={styles.emptyState}><View style={styles.emptyIcon}><Ionicons name="receipt-outline" size={28} color={theme.colors.textMuted} /></View><Text style={styles.emptyTitle}>{t('noFeeRecordsFound', 'No fee records found')}</Text><Text style={styles.emptyText}>{t('noFeeRecordsHint', 'Assigned fees will appear here when they are available.')}</Text></View> : <View style={styles.cardGrid}>{fees.map((item) => <React.Fragment key={item.id}>{renderFeeItem({
            item
          })}</React.Fragment>)}</View> : (/* RECEIPTS LIST */
        loadingReceipts ? <LogoLoader size={30} color="#4F46E5" style={{
          marginTop: 20
        }} /> : receipts.length === 0 ? <View style={styles.emptyState}><View style={styles.emptyIcon}><Ionicons name="document-text-outline" size={28} color={theme.colors.textMuted} /></View><Text style={styles.emptyTitle}>{t('noReceiptsFound', 'No receipts found')}</Text><Text style={styles.emptyText}>{t('noReceiptsHint', 'Receipts will appear here after a payment is recorded.')}</Text></View> : <View style={styles.cardGrid}>{receipts.map((receipt) => {
          return <View key={receipt.id} style={[styles.receiptCard, isWide && styles.feeCardWide]}>
              <View style={styles.receiptHeader}>
                <View style={styles.receiptIdentity}>
                  <View style={styles.receiptIcon}><Ionicons name="checkmark" size={17} color={theme.colors.success} /></View>
                  <View>
                  <Text style={styles.receiptNo}>#{receipt.receipt_no}</Text>
                  <Text style={styles.receiptDate}>{new Date(receipt.issued_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
                  </View>
                </View>
                <Text style={styles.receiptAmount}>{formatCurrency(receipt.total_amount)}</Text>
              </View>
              <TouchableOpacity style={styles.downloadBtn} onPress={() => handleDownloadReceipt(receipt)}>
                <Ionicons name="download-outline" size={16} color={theme.colors.primary} />
                <Text style={styles.downloadText}>{t('downloadReceipt', 'Download Receipt')}</Text>
              </TouchableOpacity>
            </View>;
        })}</View>)}
      </View>
      </View>
    </ScrollView>
  </ScreenLayout>;
}
const getStyles = (theme: SchoolTheme) => {
  const c = theme.colors;
  const isDark = theme.dark;
  return StyleSheet.create({
    scrollContainer: {
      paddingHorizontal: 16,
      paddingTop: 20,
      paddingBottom: 48,
    },
    pageContent: {
      width: '100%',
      maxWidth: 1180,
      alignSelf: 'center',
    },
    refreshLoader: {
      width: '100%',
      alignItems: 'center',
      paddingBottom: 18,
    },
    summaryCard: {
      backgroundColor: c.surface,
      borderRadius: 22,
      padding: 22,
      marginBottom: 18,
      borderWidth: 1,
      borderColor: c.border,
      shadowColor: isDark ? '#000000' : '#0F172A',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: isDark ? 0.22 : 0.07,
      shadowRadius: 24,
      elevation: 4,
    },
    summaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 20,
    },
    summaryRowCompact: {
      flexDirection: 'column',
      alignItems: 'stretch',
      gap: 16,
    },
    balanceBlock: {
      flex: 1,
      minWidth: 0,
    },
    summaryEyebrow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    summaryIcon: {
      width: 36,
      height: 36,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(129,140,248,0.14)' : '#EEF2FF',
    },
    summaryLabel: {
      color: c.textSecondary,
      fontSize: 13,
      fontWeight: '700',
      letterSpacing: 0.15,
    },
    summaryValue: {
      color: c.textStrong,
      fontSize: 36,
      lineHeight: 43,
      fontWeight: '800',
      letterSpacing: -1,
      marginTop: 12,
    },
    summaryHint: {
      color: c.textMuted,
      fontSize: 12,
      marginTop: 3,
    },
    payButton: {
      minHeight: 46,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 9,
      backgroundColor: c.primaryDark,
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: 13,
      shadowColor: c.primaryDark,
      shadowOffset: { width: 0, height: 5 },
      shadowOpacity: 0.24,
      shadowRadius: 12,
      elevation: 3,
    },
    payButtonCompact: {
      width: '100%',
    },
    payBtnText: {
      color: '#FFFFFF',
      fontWeight: '700',
      fontSize: 14,
    },
    collectionProgress: {
      marginTop: 22,
      marginBottom: 20,
    },
    collectionProgressHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    collectionProgressLabel: {
      color: c.textSecondary,
      fontSize: 12,
      fontWeight: '600',
    },
    collectionProgressValue: {
      color: c.textStrong,
      fontSize: 12,
      fontWeight: '800',
    },
    summaryProgressTrack: {
      height: 8,
      borderRadius: 4,
      overflow: 'hidden',
      backgroundColor: isDark ? '#273449' : '#E8EDF5',
    },
    summaryProgressFill: {
      height: '100%',
      borderRadius: 4,
      backgroundColor: c.success,
    },
    statsRow: {
      flexDirection: 'row',
      borderRadius: 14,
      overflow: 'hidden',
      backgroundColor: isDark ? 'rgba(255,255,255,0.025)' : '#F8FAFC',
      borderWidth: 1,
      borderColor: c.borderLight,
    },
    statItem: {
      flex: 1,
      paddingHorizontal: 14,
      paddingVertical: 13,
    },
    statItemBorder: {
      borderLeftWidth: 1,
      borderLeftColor: c.borderLight,
    },
    statLabel: {
      color: c.textMuted,
      fontSize: 11,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.45,
    },
    statValue: {
      color: c.textStrong,
      fontSize: 16,
      fontWeight: '700',
      marginTop: 4,
    },
    statValueSuccess: {
      color: c.success,
      fontSize: 16,
      fontWeight: '700',
      marginTop: 4,
    },
    tabContainer: {
      flexDirection: 'row',
      backgroundColor: isDark ? c.surface : '#EEF2F7',
      padding: 5,
      borderRadius: 14,
      marginBottom: 18,
      borderWidth: 1,
      borderColor: c.border,
      gap: 4,
    },
    tab: {
      flex: 1,
      minHeight: 44,
      paddingHorizontal: 12,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 8,
      borderRadius: 10,
    },
    activeTab: {
      backgroundColor: isDark ? 'rgba(129,140,248,0.14)' : c.surface,
      shadowColor: isDark ? '#000000' : '#0F172A',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0 : 0.06,
      shadowRadius: 5,
      elevation: isDark ? 0 : 1,
    },
    tabText: {
      fontSize: 13,
      fontWeight: '600',
      color: c.textSecondary,
    },
    activeTabText: {
      color: c.primary,
      fontWeight: '700',
    },
    tabCount: {
      minWidth: 20,
      height: 20,
      paddingHorizontal: 5,
      borderRadius: 10,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: isDark ? '#263246' : '#DDE4EE',
    },
    tabCountActive: {
      backgroundColor: isDark ? 'rgba(129,140,248,0.2)' : '#EEF2FF',
    },
    tabCountText: {
      fontSize: 10,
      fontWeight: '700',
      color: c.textSecondary,
    },
    tabCountTextActive: {
      color: c.primary,
    },
    contentSection: {
      flex: 1,
    },
    cardGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      gap: 14,
    },
    feeCard: {
      width: '100%',
      backgroundColor: c.surface,
      borderRadius: 18,
      padding: 18,
      borderWidth: 1,
      borderColor: c.border,
      shadowColor: isDark ? '#000000' : '#0F172A',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: isDark ? 0.12 : 0.04,
      shadowRadius: 10,
      elevation: 1,
    },
    feeCardWide: {
      width: '49.35%',
    },
    feeHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 12,
      marginBottom: 18,
    },
    feeTitleGroup: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
    },
    feeIcon: {
      width: 38,
      height: 38,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(129,140,248,0.12)' : '#EEF2FF',
    },
    feeTitleCopy: {
      flex: 1,
      minWidth: 0,
    },
    feeTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: c.textStrong,
    },
    dueDate: {
      fontSize: 11,
      color: c.textMuted,
      marginTop: 3,
    },
    statusBadge: {
      paddingHorizontal: 9,
      paddingVertical: 5,
      borderRadius: 999,
    },
    statusText: {
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 0.55,
    },
    progressHeading: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 7,
    },
    progressLabel: {
      fontSize: 11,
      color: c.textSecondary,
      fontWeight: '600',
    },
    progressPercent: {
      fontSize: 11,
      color: c.textStrong,
      fontWeight: '700',
    },
    progressBarBg: {
      height: 7,
      backgroundColor: isDark ? '#263246' : '#E8EDF5',
      borderRadius: 4,
      overflow: 'hidden',
      marginBottom: 16,
    },
    progressBarFill: {
      height: '100%',
      backgroundColor: c.primary,
      borderRadius: 4,
    },
    progressBarPaid: {
      backgroundColor: c.success,
    },
    amountGrid: {
      flexDirection: 'row',
      borderTopWidth: 1,
      borderTopColor: c.borderLight,
      paddingTop: 14,
    },
    amountCell: {
      flex: 1,
    },
    amountCellMiddle: {
      alignItems: 'center',
    },
    amountCellEnd: {
      alignItems: 'flex-end',
    },
    amountLabel: {
      fontSize: 10,
      fontWeight: '600',
      color: c.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    amountValue: {
      marginTop: 4,
      color: c.textStrong,
      fontSize: 14,
      fontWeight: '700',
    },
    amountPaid: {
      color: c.success,
    },
    amountBalance: {
      color: c.danger,
    },
    cardActionArea: {
      borderTopWidth: 1,
      borderTopColor: c.borderLight,
      marginTop: 15,
      paddingTop: 12,
      alignItems: 'flex-start',
    },
    inlineAction: {
      minHeight: 34,
      paddingHorizontal: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      borderRadius: 9,
      backgroundColor: isDark ? 'rgba(129,140,248,0.11)' : '#EEF2FF',
    },
    inlineActionText: {
      color: c.primary,
      fontSize: 12,
      fontWeight: '600',
    },
    receiptCard: {
      width: '100%',
      backgroundColor: c.surface,
      borderRadius: 18,
      padding: 18,
      borderWidth: 1,
      borderColor: c.border,
      shadowColor: isDark ? '#000000' : '#0F172A',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: isDark ? 0.12 : 0.04,
      shadowRadius: 10,
      elevation: 1,
    },
    receiptHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
      marginBottom: 16,
    },
    receiptIdentity: {
      minWidth: 0,
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    receiptIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(52,211,153,0.12)' : '#ECFDF5',
    },
    receiptNo: {
      fontSize: 14,
      fontWeight: '700',
      color: c.textStrong,
    },
    receiptDate: {
      fontSize: 11,
      color: c.textSecondary,
      marginTop: 3,
    },
    receiptAmount: {
      fontSize: 17,
      fontWeight: '800',
      color: c.success,
    },
    downloadBtn: {
      minHeight: 40,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12,
      backgroundColor: isDark ? 'rgba(129,140,248,0.11)' : '#EEF2FF',
      borderRadius: 10,
      gap: 8,
    },
    downloadText: {
      fontSize: 13,
      fontWeight: '600',
      color: c.primary,
    },
    emptyState: {
      width: '100%',
      minHeight: 220,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.surface,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: c.border,
      padding: 28,
    },
    emptyIcon: {
      width: 58,
      height: 58,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? '#202B3D' : '#F1F5F9',
      marginBottom: 14,
    },
    emptyTitle: {
      color: c.textStrong,
      fontSize: 16,
      fontWeight: '700',
    },
    emptyText: {
      maxWidth: 360,
      textAlign: 'center',
      marginTop: 6,
      color: c.textMuted,
      fontSize: 13,
      lineHeight: 19,
    },
  });
};
