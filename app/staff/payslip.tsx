import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import StaffHeader from '../../src/components/StaffHeader';
import ViewAsBanner from '../../src/components/ViewAsBanner';
import { useEffectiveStaffId } from '../../src/hooks/useEffectiveStaffId';
import { useStaffPortalConfig } from '../../src/hooks/useStaffPortalConfig';
import { StaffMyProfile, StaffService } from '../../src/services/staffService';
import { SchoolProfile, SchoolService } from '../../src/services/schoolService';
import { useAuth } from '../../src/hooks/useAuth';
import { useTheme } from '../../src/hooks/useTheme';
import { downloadPayslipPdf, payslipAttendanceRows, PayslipPdfRow } from '../../src/utils/payslipPdf';
import { bundledAssetToBase64Uri, resolveApiAssetUrl, toBase64Uri } from '../../src/utils/toBase64Uri';
import { SCHOOL_LOGO } from '../../src/constants/school';
import { Theme } from '../../src/theme/themes';

type Payslip = PayslipPdfRow;
const DEFAULT_SCHOOL_LOGO = require('../../assets/images/icon.png') as number;

export default function PaySlip() {
  const { theme } = useTheme();
  const styles = React.useMemo(() => getStyles(theme), [theme]);
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const userId = user?.userId;
  const { staffId, isViewingAsAdmin, viewAsName } = useEffectiveStaffId();
  const { payslipsEnabled, loading: configLoading } = useStaffPortalConfig();
  const [profile, setProfile] = useState<StaffMyProfile | null>(null);
  const [schoolProfile, setSchoolProfile] = useState<SchoolProfile | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    if (!userId || configLoading || !payslipsEnabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([
      isViewingAsAdmin && staffId ? StaffService.getPayslips(staffId) : StaffService.getMyPayslips(),
      (isViewingAsAdmin && staffId ? StaffService.getById(staffId) : StaffService.getMyProfile()).catch(() => null),
      SchoolService.getProfile().catch(() => null),
    ])
      .then(([data, profileData, schoolData]) => {
        setPayslips(Array.isArray(data) ? data : []);
        setProfile(profileData as StaffMyProfile | null);
        if (schoolData) setSchoolProfile(schoolData);
      })
      .catch(() => {
        alertCompat('Error', 'Failed to load payslips');
      })
      .finally(() => setLoading(false));
  }, [userId, staffId, isViewingAsAdmin, payslipsEnabled, configLoading]);

  const ensureSchoolProfile = useCallback(async (): Promise<SchoolProfile | null> => {
    if (schoolProfile) return schoolProfile;
    try {
      const fetched = await SchoolService.getProfile();
      setSchoolProfile(fetched);
      return fetched;
    } catch {
      return null;
    }
  }, [schoolProfile]);

  const totalEarnings = React.useMemo(() => {
    if (!payslips.length) return '₹0';
    const total = payslips.reduce((sum, item) => {
      const amount = parseFloat(item.earnings.replace(/[₹,]/g, '')) || 0;
      return sum + amount;
    }, 0);
    return `₹${total.toLocaleString('en-IN')}`;
  }, [payslips]);

  const handleDownload = async (payslip: Payslip) => {
    if (downloadingId) return;
    setDownloadingId(payslip.id);
    try {
      const school = await ensureSchoolProfile();
      const logoUrl = resolveApiAssetUrl(school?.logo_url || SCHOOL_LOGO || null);
      const remoteLogoUri = logoUrl ? await toBase64Uri(logoUrl) : null;
      const logoUri = remoteLogoUri ?? (await bundledAssetToBase64Uri(DEFAULT_SCHOOL_LOGO));

      await downloadPayslipPdf({
        payslip,
        employee: {
          name: profile?.display_name || user?.displayName || user?.name,
          staffCode: profile?.staff_code || user?.staff_code,
          designation: profile?.designation,
          email: profile?.email || user?.email,
          phone: profile?.phone || user?.phone,
        },
        school: {
          name: school?.name ?? null,
          logoUri,
          address: school?.address ?? null,
          phone: school?.phone ?? null,
          email: school?.email ?? null,
          website: school?.website ?? null,
          affiliation: school?.affiliation ?? null,
        },
      });
    } catch (error) {
      console.error('Failed to download payslip PDF:', error);
      alertCompat('Download Failed', 'Unable to create the payslip PDF. Please try again.');
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      <StaffHeader title="My Pay Slips" showBackButton={true} />
      {isViewingAsAdmin && <ViewAsBanner name={viewAsName} />}
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {!configLoading && !payslipsEnabled ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="eye-off-outline" size={40} color="#94A3B8" />
            <Text style={[styles.emptyText, { marginTop: 12, fontWeight: '700' }]}>Payslips are unavailable</Text>
            <Text style={[styles.emptyText, { marginTop: 6, fontSize: 13 }]}>
              Your school admin has disabled payslip access in the staff portal.
            </Text>
          </View>
        ) : (
        <>
        <Animated.View entering={FadeInDown.delay(100).duration(600)} style={styles.summaryCard}>
          <LinearGradient
            colors={['#EC4899', '#BE185D']}
            style={styles.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}>
            <View>
              <Text style={styles.summaryLabel}>Total Earnings (YTD)</Text>
              <Text style={styles.summaryValue}>{totalEarnings}</Text>
            </View>
            <View style={styles.iconContainer}>
              <FontAwesome5 name="coins" size={24} color="#fff" />
            </View>
          </LinearGradient>
        </Animated.View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Payslips</Text>
        </View>

        {loading ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>Loading payslips…</Text>
          </View>
        ) : payslips.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No payslips found</Text>
          </View>
        ) : (
          <View style={styles.listContainer}>
            {payslips.map((item, index) => {
              const isDownloading = downloadingId === item.id;
              return (
                <Animated.View
                  key={item.id}
                  entering={FadeInDown.delay(300 + index * 100).duration(600)}
                  style={styles.payslipCard}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.monthText}>{item.month}</Text>
                    <View style={styles.statusBadge}>
                      <Text style={styles.statusText}>{item.status}</Text>
                    </View>
                  </View>
                  <View style={styles.divider} />
                  <View style={styles.detailsRow}>
                    <View style={styles.detailItem}>
                      <Text style={styles.detailLabel}>Earnings</Text>
                      <Text style={styles.earningsValue}>{item.earnings}</Text>
                    </View>
                    <View style={styles.detailItem}>
                      <Text style={styles.detailLabel}>Deductions</Text>
                      <Text style={styles.deductionsValue}>{item.deductions}</Text>
                    </View>
                    <View style={[styles.detailItem, { alignItems: 'flex-end' }]}>
                      <Text style={styles.detailLabel}>Net Pay</Text>
                      <Text style={styles.netValue}>{item.net}</Text>
                    </View>
                  </View>
                  {item.amount_in_words ? (
                    <Text style={styles.wordsText}>{item.amount_in_words}</Text>
                  ) : null}
                  {item.attendance ? (
                    <View style={styles.lineList}>
                      {payslipAttendanceRows(item.attendance, item.per_day_salary).map((row) => (
                        <Text key={`${item.id}-${row.label}`} style={styles.summaryLine}>
                          {row.label}: {row.value}
                        </Text>
                      ))}
                    </View>
                  ) : null}
                  {item.lines?.length ? (
                    <View style={styles.lineList}>
                      {item.lines.map((line, lineIndex) => (
                        <View key={`${item.id}-${lineIndex}`} style={styles.lineItem}>
                          <Text style={styles.lineName}>{line.name}</Text>
                          <Text style={styles.lineExplanation}>{line.explanation}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                  <TouchableOpacity
                    style={[styles.downloadButton, isDownloading && styles.downloadButtonDisabled]}
                    onPress={() => handleDownload(item)}
                    disabled={isDownloading}>
                    {isDownloading ? (
                      <ActivityIndicator size="small" color="#EC4899" />
                    ) : (
                      <Ionicons name="download-outline" size={18} color="#EC4899" />
                    )}
                    <Text style={styles.downloadText}>
                      {isDownloading ? 'Preparing PDF…' : 'Download PDF'}
                    </Text>
                  </TouchableOpacity>
                </Animated.View>
              );
            })}
          </View>
        )}
        </>
        )}
      </ScrollView>
    </View>
  );
}

const getStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    scrollContent: {
      padding: 20,
    },
    summaryCard: {
      borderRadius: 20,
      overflow: 'hidden',
      marginBottom: 30,
      shadowColor: '#EC4899',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 10,
      elevation: 5,
    },
    gradient: {
      padding: 24,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    summaryLabel: {
      color: 'rgba(255,255,255,0.8)',
      fontSize: 14,
      marginBottom: 8,
    },
    summaryValue: {
      color: theme.colors.background,
      fontSize: 32,
      fontWeight: 'bold',
    },
    iconContainer: {
      width: 50,
      height: 50,
      borderRadius: 25,
      backgroundColor: 'rgba(255,255,255,0.2)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    sectionHeader: {
      marginBottom: 15,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      color: '#111827',
    },
    listContainer: {
      gap: 15,
      paddingBottom: 20,
    },
    emptyContainer: {
      alignItems: 'center',
      marginTop: 20,
    },
    emptyText: {
      color: theme.colors.textSecondary,
      fontSize: 16,
    },
    payslipCard: {
      backgroundColor: theme.colors.background,
      borderRadius: 16,
      padding: 20,
      shadowColor: theme.colors.text,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 8,
      elevation: 2,
    },
    cardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 15,
    },
    monthText: {
      fontSize: 18,
      fontWeight: 'bold',
      color: '#1F2937',
    },
    statusBadge: {
      backgroundColor: '#DCFCE7',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
    },
    statusText: {
      color: '#10B981',
      fontSize: 12,
      fontWeight: 'bold',
    },
    divider: {
      height: 1,
      backgroundColor: theme.colors.card,
      marginBottom: 15,
    },
    detailsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 15,
    },
    detailItem: {
      flex: 1,
    },
    detailLabel: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      marginBottom: 4,
    },
    earningsValue: {
      fontSize: 14,
      fontWeight: '600',
      color: '#10B981',
    },
    deductionsValue: {
      fontSize: 14,
      fontWeight: '600',
      color: '#EF4444',
    },
    netValue: {
      fontSize: 16,
      fontWeight: 'bold',
      color: '#111827',
    },
    wordsText: {
      marginTop: 12,
      color: '#334155',
      fontSize: 13,
      fontWeight: '600',
    },
    summaryLine: {
      marginTop: 8,
      color: '#64748B',
      fontSize: 12,
    },
    lineList: {
      marginTop: 12,
      gap: 8,
    },
    lineItem: {
      backgroundColor: '#F8FAFC',
      borderRadius: 10,
      padding: 10,
    },
    lineName: {
      color: '#0F172A',
      fontSize: 13,
      fontWeight: '700',
    },
    lineExplanation: {
      marginTop: 4,
      color: '#475569',
      fontSize: 12,
      lineHeight: 18,
    },
    downloadButton: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 12,
      backgroundColor: '#FDF2F8',
      borderRadius: 12,
      gap: 8,
    },
    downloadButtonDisabled: {
      opacity: 0.65,
    },
    downloadText: {
      color: '#EC4899',
      fontWeight: '600',
      fontSize: 14,
    },
  });
