import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Linking } from 'react-native';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import { useRouter } from 'expo-router';
import { Ionicons, MaterialIcons, FontAwesome5 } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from '@/src/utils/haptics';
import StudentHeader from '../../src/components/StudentHeader';
import AvatarUploader from '../../src/components/AvatarUploader';
import { useAuth } from '../../src/hooks/useAuth';
import { useStaffPortalConfig } from '../../src/hooks/useStaffPortalConfig';
import { useTheme } from '../../src/hooks/useTheme';
import LogoLoader from '../../src/components/LogoLoader';
import {
  SWITCH_ACCOUNT_SETTINGS,
  SettingsAccountSwitcherSheet,
  useSettingsAccountSwitcher,
} from '../../src/components/SettingsAccountSwitcher';
import { StaffService, StaffMyProfile } from '../../src/services/staffService';

const EMPTY = '—';

function displayOrEmpty(value?: string | null): string {
  if (value == null) return EMPTY;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : EMPTY;
}

function formatDob(dob?: string | null): string {
  if (!dob) return EMPTY;
  const parsed = new Date(dob);
  if (Number.isNaN(parsed.getTime())) return dob;
  return parsed.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function routeSummary(routes?: StaffMyProfile['routes']): string {
  if (!routes?.length) return EMPTY;
  return routes.map((route) => route.name).filter(Boolean).join(', ');
}

/** Returns the first human-readable ID (not a UUID) from the user object */
function getHumanId(user: any): string {
  const candidates = [user?.staff_code, user?.admission_no];
  for (const c of candidates) {
    if (c && typeof c === 'string' && c.trim().length > 0) return c;
  }
  return 'N/A';
}

interface Payslip {
  id: string;
  month: string;
  status: string;
  earnings: string;
  deductions: string;
  net: string;
}

/* ─── Reusable Info Row ─── */
const InfoRow = ({ icon, label, value, iconBg, iconColor, isLink, onPress, theme, styles

}: { icon: any; label: string; value: string; iconBg?: string; iconColor?: string; isLink?: boolean; onPress?: () => void; theme: any; styles: any; }) =>
  <TouchableOpacity
    style={styles.infoRow}
    activeOpacity={isLink ? 0.7 : 1}
    onPress={isLink ? onPress : undefined}
    disabled={!isLink}>

    <View style={[styles.iconBox, iconBg ? { backgroundColor: iconBg } : {}]}>
      <Ionicons name={icon} size={18} color={iconColor || theme.colors.primary} />
    </View>
    <View style={styles.infoContent}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, isLink && styles.linkText]}>{value}</Text>
    </View>
    {isLink && <MaterialIcons name="chevron-right" size={20} color="#9CA3AF" />}
  </TouchableOpacity>;

/* ─── Payslip Card ─── */
const PayslipCard = ({ item, index, onDownload, theme, styles }: { item: Payslip; index: number; onDownload: (id: string) => void; theme: any; styles: any }) =>
  <Animated.View entering={FadeInDown.delay(500 + index * 80).duration(500)} style={styles.payslipCard}>
    <View style={styles.payslipHeader}>
      <View style={styles.payslipMonthRow}>
        <View style={styles.payslipIcon}>
          <Ionicons name="calendar" size={16} color={theme.colors.primary} />
        </View>
        <Text style={styles.payslipMonth}>{item.month}</Text>
      </View>
      <View style={[styles.payslipBadge,
      item.status === 'Paid' ? styles.paidBadge : styles.pendingBadge]
      }>
        <Text style={[styles.payslipBadgeText,
        item.status === 'Paid' ? styles.paidText : styles.pendingText]
        }>{item.status}</Text>
      </View>
    </View>
    <View style={styles.payslipDivider} />
    <View style={styles.payslipGrid}>
      <View style={styles.payslipStat}>
        <Text style={styles.payslipStatLabel}>Earnings</Text>
        <Text style={[styles.payslipStatValue, { color: '#10B981' }]}>{item.earnings}</Text>
      </View>
      <View style={styles.payslipStat}>
        <Text style={styles.payslipStatLabel}>Deductions</Text>
        <Text style={[styles.payslipStatValue, { color: '#EF4444' }]}>{item.deductions}</Text>
      </View>
      <View style={[styles.payslipStat, { alignItems: 'flex-end' }]}>
        <Text style={styles.payslipStatLabel}>Net Pay</Text>
        <Text style={[styles.payslipStatValue, { color: '#0F172A', fontWeight: '800' }]}>{item.net}</Text>
      </View>
    </View>
    <TouchableOpacity style={styles.downloadBtn} onPress={() => onDownload(item.id)} activeOpacity={0.7}>
      <Ionicons name="download-outline" size={16} color={theme.colors.primary} />
      <Text style={[styles.downloadBtnText, { color: theme.colors.primary }]}>Download PDF</Text>
    </TouchableOpacity>
  </Animated.View>;

/* ════════════════════════════════════════════════════════════
   ████  DRIVER PROFILE SCREEN  ████
   ════════════════════════════════════════════════════════════ */
export default function DriverProfile() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [profile, setProfile] = useState<StaffMyProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [loadingPayslips, setLoadingPayslips] = useState(true);
  const { payslipsEnabled } = useStaffPortalConfig();
  const { switcherOpen, openSwitcher, closeSwitcher } = useSettingsAccountSwitcher();
  const { theme } = useTheme();
  const PRIMARY_GRADIENT: [string, string] = [theme.colors.primary, theme.colors.primaryDark];
  const styles = React.useMemo(() => getStyles(theme), [theme]);

  const displayName = profile?.display_name || user?.displayName || (user as any)?.first_name || 'Driver';
  const email = displayOrEmpty(profile?.email || (user as any)?.email);
  const phone = displayOrEmpty(profile?.phone || (user as any)?.phone);
  const dob = formatDob(profile?.dob);
  const address = displayOrEmpty(profile?.address);
  const busNo = displayOrEmpty(profile?.bus?.bus_no);
  const routeName = routeSummary(profile?.routes);
  const vehicleRegNo = displayOrEmpty(profile?.bus?.registration_no);
  const staffCode = profile?.staff_code || getHumanId(user);

  useEffect(() => {
    if (!user) {
      setLoadingProfile(false);
      setLoadingPayslips(false);
      return;
    }
    setLoadingProfile(true);
    StaffService.getMyProfile()
      .then((data) => setProfile(data))
      .catch(() => setProfile(null))
      .finally(() => setLoadingProfile(false));
  }, [user?.userId]);

  useEffect(() => {
    if (!user || !payslipsEnabled) {
      setLoadingPayslips(false);
      return;
    }
    setLoadingPayslips(true);
    StaffService.getMyPayslips()
      .then((data) => setPayslips(Array.isArray(data) ? data : []))
      .catch(() => { })
      .finally(() => setLoadingPayslips(false));
  }, [user?.userId, payslipsEnabled]);

  const totalEarnings = React.useMemo(() => {
    if (!payslips.length) return '₹0';
    const total = payslips.reduce((sum, item) => {
      const amount = parseFloat(item.earnings.replace(/[₹,]/g, '')) || 0;
      return sum + amount;
    }, 0);
    return `₹${total.toLocaleString('en-IN')}`;
  }, [payslips]);

  const handleEmail = (addr: string) => {
    if (addr === EMPTY || addr === 'N/A') return;
    Haptics.selectionAsync();
    Linking.openURL(`mailto:${addr}`);
  };
  const handleDownload = () => { alertCompat('Coming Soon', 'PDF download will be available soon.'); };
  const handleLogout = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    await AsyncStorage.removeItem('driver_auto_login');
    await signOut();
    router.replace('/welcome');
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor="#0F0F1A" />
      <StudentHeader title="My Profile" menuUserType="driver" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>

        {loadingProfile ?
          <View style={styles.loadingBox}>
            <LogoLoader size={36} color={theme.colors.primary} />
            <Text style={styles.loadingText}>Loading profile…</Text>
          </View> :
          <>
        {/* ═══════ Profile Hero Card ═══════ */}
        <Animated.View entering={FadeInDown.delay(100).duration(600)} style={styles.heroCard}>
          <LinearGradient
            colors={PRIMARY_GRADIENT}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroBg} />

          {/* Decorative circles */}
          <View style={[styles.decorCircle, { top: -20, right: -20, width: 100, height: 100 }]} />
          <View style={[styles.decorCircle, { bottom: -15, left: -15, width: 60, height: 60 }]} />
          <View style={styles.heroContent}>
            <View style={styles.avatarWrapper}>
              <AvatarUploader
                photoUrl={profile?.photo_url ?? user?.photoUrl}
                name={displayName}
                size={100}
                ringColor="#FFF"
                ringWidth={3}
                accentColor={theme.colors.primary}
                onUploaded={(url) => setProfile((prev) => (prev ? { ...prev, photo_url: url } : prev))}
                onRemoved={() => setProfile((prev) => (prev ? { ...prev, photo_url: null } : prev))}
              />
              <View style={styles.onlineBadge}>
                <View style={styles.onlineDot} />
                <Text style={styles.onlineText}>Active</Text>
              </View>
            </View>
            <Text style={styles.heroName}>{displayName}</Text>
            <View style={[styles.rolePill, { backgroundColor: theme.colors.primary }]}>
              <Ionicons name="bus" size={12} color="#FFF" />
              <Text style={styles.rolePillText}>Driver</Text>
            </View>
            <Text style={styles.heroId}>ID: {staffCode}</Text>
            {/* Quick Stats */}
            <View style={styles.quickStats}>
              <View style={styles.qStat}>
                <Text style={styles.qStatValue}>{busNo}</Text>
                <Text style={styles.qStatLabel}>Bus No.</Text>
              </View>
              <View style={styles.qStatDivider} />
              <View style={styles.qStat}>
                <Text style={styles.qStatValue}>{routeName}</Text>
                <Text style={styles.qStatLabel}>Route</Text>
              </View>
              <View style={styles.qStatDivider} />
              <View style={styles.qStat}>
                <Text style={styles.qStatValue}>{vehicleRegNo}</Text>
                <Text style={styles.qStatLabel}>Reg. No.</Text>
              </View>
            </View>
          </View>
        </Animated.View>
        {/* ═══════ Personal Information ═══════ */}
        <Animated.View entering={FadeInUp.delay(200).duration(600)} style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionIconBox}>
              <Ionicons name="person" size={14} color={theme.colors.primary} />
            </View>
            <Text style={styles.sectionTitle}>Personal Information</Text>
          </View>
          <View style={styles.card}>
            <InfoRow icon="mail-outline" label="Email Address" value={email}
              theme={theme} styles={styles}
              iconColor={theme.colors.primary}
              iconBg="#FDF2F8" isLink={email !== EMPTY && email !== 'N/A'}
              onPress={() => handleEmail(email)} />
            <View style={styles.rowDivider} />
            <InfoRow icon="call-outline" label="Phone Number" value={phone}
              theme={theme} styles={styles}
              iconBg="#ECFDF5" iconColor="#10B981" />
            <View style={styles.rowDivider} />
            <InfoRow icon="calendar-outline" label="Date of Birth" value={dob}
              theme={theme} styles={styles}
              iconBg="#EEF2FF" iconColor="#6366F1" />
            <View style={styles.rowDivider} />
            <InfoRow icon="water-outline" label="Blood Group" value={EMPTY}
              theme={theme} styles={styles}
              iconBg="#FEF3C7" iconColor="#F59E0B" />
            <View style={styles.rowDivider} />
            <InfoRow icon="location-outline" label="Address" value={address}
              theme={theme} styles={styles}
              iconBg="#F0FDF4" iconColor={theme.colors.success} />
          </View>
        </Animated.View>
        {/* ═══════ Vehicle & Route ═══════ */}
        <Animated.View entering={FadeInUp.delay(300).duration(600)} style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIconBox, { backgroundColor: '#EEF2FF' }]}>
              <Ionicons name="bus" size={14} color="#6366F1" />
            </View>
            <Text style={styles.sectionTitle}>Vehicle & Route</Text>
          </View>
          <View style={styles.card}>
            <InfoRow icon="car-outline" label="Assigned Bus" value={busNo}
              theme={theme} styles={styles}
              iconBg="#EEF2FF" iconColor="#6366F1" />
            <View style={styles.rowDivider} />
            <InfoRow icon="navigate-outline" label="Route Name" value={routeName}
              theme={theme} styles={styles}
              iconBg="#FDF2F8" iconColor={theme.colors.primary} />
            <View style={styles.rowDivider} />
            <InfoRow icon="card-outline" label="License Number" value={EMPTY}
              theme={theme} styles={styles}
              iconBg="#FEF3C7" iconColor="#F59E0B" />
            <View style={styles.rowDivider} />
            <InfoRow icon="shield-checkmark-outline" label="License Expiry" value={EMPTY}
              theme={theme} styles={styles}
              iconBg="#ECFDF5" iconColor="#10B981" />
          </View>
        </Animated.View>
        {/* ═══════ Payslips Section ═══════ */}
        {payslipsEnabled && (
        <Animated.View entering={FadeInUp.delay(400).duration(600)} style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIconBox, { backgroundColor: '#ECFDF5' }]}>
              <FontAwesome5 name="coins" size={12} color="#10B981" />
            </View>
            <Text style={styles.sectionTitle}>My Payslips</Text>
          </View>
          {/* Earnings Summary */}
          <Animated.View entering={FadeInDown.delay(450).duration(500)} style={styles.earningsCard}>
            <LinearGradient
              colors={PRIMARY_GRADIENT}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.earningsGradient}>

              <View>
                <Text style={styles.earningsLabel}>Total Earnings (YTD)</Text>
                <Text style={styles.earningsValue}>{totalEarnings}</Text>
              </View>
              <View style={styles.earningsIconBox}>
                <FontAwesome5 name="coins" size={22} color="#FFF" />
              </View>
            </LinearGradient>
          </Animated.View>
          {/* Payslip Cards */}
          {loadingPayslips ?
            <View style={styles.loadingBox}>
              <LogoLoader size={30} color={theme.colors.primary} />
              <Text style={styles.loadingText}>Loading payslips…</Text>
            </View> :
            payslips.length === 0 ?
              <View style={styles.emptyBox}>
                <View style={styles.emptyIcon}>
                  <Ionicons name="receipt-outline" size={32} color="#CBD5E1" />
                </View>
                <Text style={styles.emptyTitle}>No Payslips Yet</Text>
                <Text style={styles.emptySubtitle}>Your payslips will appear here once processed.</Text>
              </View> :

              <View style={styles.payslipList}>
                {payslips.map((item, index) =>
                  <PayslipCard key={item.id} item={item} index={index} onDownload={handleDownload} theme={theme} styles={styles} />
                )}
              </View>
          }
        </Animated.View>
        )}
        {/* ═══════ Switch account ═══════ */}
        <Animated.View entering={FadeInUp.delay(450).duration(600)} style={styles.section}>
          <TouchableOpacity style={styles.switchAccountButton} onPress={openSwitcher} activeOpacity={0.7}>
            <View style={[styles.logoutIconBox, styles.switchAccountIconBox]}>
              <Ionicons name={SWITCH_ACCOUNT_SETTINGS.icon} size={20} color={SWITCH_ACCOUNT_SETTINGS.iconColor} />
            </View>
            <Text style={styles.switchAccountText}>{SWITCH_ACCOUNT_SETTINGS.label}</Text>
            <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
          </TouchableOpacity>
        </Animated.View>
        {/* ═══════ Logout Button ═══════ */}
        <Animated.View entering={FadeInUp.delay(500).duration(600)} style={styles.section}>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.7}>
            <View style={styles.logoutIconBox}>
              <Ionicons name="log-out-outline" size={20} color="#DC2626" />
            </View>
            <Text style={styles.logoutText}>Logout</Text>
            <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
          </TouchableOpacity>
        </Animated.View>
        <View style={{ height: 40 }} />
          </>
        }
      </ScrollView>

      <SettingsAccountSwitcherSheet visible={switcherOpen} onClose={closeSwitcher} />
    </View>);

}

/* ════════════════════════════ STYLES ════════════════════════════ */
const getStyles = (theme: any) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'transparent' },
  scrollContent: { padding: 20 },

  /* ── Hero Card ── */
  heroCard: {
    borderRadius: 32, overflow: 'hidden', marginBottom: 28,
    shadowColor: theme.colors.primaryDark, shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.25, shadowRadius: 28, elevation: 14,
    backgroundColor: '#FFF',
    borderWidth: 1.2, borderBottomWidth: 4,
    borderColor: 'rgba(226, 232, 240, 0.6)',
    borderBottomColor: 'rgba(15,23,42,0.1)'
  },
  heroBg: { position: 'absolute', top: 0, left: 0, right: 0, height: 140 },
  decorCircle: {
    position: 'absolute', borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)'
  },
  heroContent: { alignItems: 'center', paddingTop: 65, paddingBottom: 24, paddingHorizontal: 20 },
  avatarWrapper: { position: 'relative', marginBottom: 14 },
  avatarRing: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: '#FFF', padding: 3,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1, shadowRadius: 10, elevation: 5
  },
  avatarInner: {
    flex: 1, borderRadius: 50,
    backgroundColor: '#FDF2F8',
    justifyContent: 'center', alignItems: 'center'
  },
  avatarText: { fontSize: 32, fontWeight: '800', color: theme.colors.primary, letterSpacing: 1 },
  onlineBadge: {
    position: 'absolute', bottom: 2, right: -4,
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#ECFDF5', paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 12, borderWidth: 2, borderColor: '#FFF'
  },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B981', marginRight: 4 },
  onlineText: { fontSize: 9, fontWeight: '800', color: '#059669', letterSpacing: 0.3 },
  heroName: { fontSize: 24, fontWeight: '800', color: '#0F172A', marginBottom: 6, letterSpacing: 0.2 },
  rolePill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 4,
    borderRadius: 20, marginBottom: 6
  },
  rolePillText: { fontSize: 11, fontWeight: '700', color: '#FFF', letterSpacing: 0.5, textTransform: 'uppercase' },
  heroId: {
    fontSize: 11, color: '#94A3B8', fontWeight: '600',
    backgroundColor: '#F1F5F9', paddingHorizontal: 10, paddingVertical: 3,
    borderRadius: 8, overflow: 'hidden', marginBottom: 18, letterSpacing: 0.5
  },
  quickStats: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    width: '100%', paddingTop: 18, borderTopWidth: 1, borderTopColor: '#F1F5F9'
  },
  qStat: { alignItems: 'center', flex: 1 },
  qStatValue: { fontSize: 15, fontWeight: '800', color: '#1F2937', marginBottom: 2 },
  qStatLabel: { fontSize: 10, color: '#94A3B8', fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase' },
  qStatDivider: { width: 1, height: 28, backgroundColor: '#F1F5F9' },

  /* ── Sections ── */
  section: { marginBottom: 20 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 },
  sectionIconBox: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: '#FDF2F8',
    justifyContent: 'center', alignItems: 'center'
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#374151', letterSpacing: 0.2 },

  /* ── Card ── */
  card: {
    backgroundColor: '#FFF', borderRadius: 28, padding: 12,
    shadowColor: '#94A3B8', shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15, shadowRadius: 24, elevation: 8,
    borderWidth: 1.2, borderBottomWidth: 4,
    borderColor: 'rgba(226, 232, 240, 0.6)',
    borderBottomColor: 'rgba(15,23,42,0.1)'
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 12 },
  iconBox: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: '#FDF2F8',
    justifyContent: 'center', alignItems: 'center', marginRight: 12
  },
  infoContent: { flex: 1 },
  infoLabel: { fontSize: 11, color: '#94A3B8', marginBottom: 2, fontWeight: '500' },
  infoValue: { fontSize: 14, fontWeight: '700', color: '#1F2937' },
  linkText: { color: theme.colors.primary },
  rowDivider: { height: 1, backgroundColor: '#F8FAFC', marginLeft: 60 },

  /* ── Earnings Summary ── */
  earningsCard: {
    borderRadius: 28, overflow: 'hidden', marginBottom: 16,
    shadowColor: theme.colors.primaryDark, shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25, shadowRadius: 24, elevation: 8,
    borderBottomWidth: 4, borderBottomColor: 'rgba(0,0,0,0.2)'
  },
  earningsGradient: {
    padding: 22, flexDirection: 'row',
    justifyContent: 'space-between', alignItems: 'center'
  },
  earningsLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 13, marginBottom: 6, fontWeight: '500' },
  earningsValue: { color: '#FFF', fontSize: 30, fontWeight: '800', letterSpacing: 0.5 },
  earningsIconBox: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center', alignItems: 'center'
  },

  /* ── Payslip Cards ── */
  payslipList: { gap: 16 },
  payslipCard: {
    backgroundColor: '#FFF', borderRadius: 24, padding: 20,
    shadowColor: '#94A3B8', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15, shadowRadius: 20, elevation: 6,
    borderWidth: 1.2, borderBottomWidth: 4,
    borderColor: 'rgba(226, 232, 240, 0.6)',
    borderBottomColor: 'rgba(15,23,42,0.1)'
  },
  payslipHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  payslipMonthRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  payslipIcon: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: '#FDF2F8',
    justifyContent: 'center', alignItems: 'center'
  },
  payslipMonth: { fontSize: 16, fontWeight: '700', color: '#1F2937' },
  payslipBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  paidBadge: { backgroundColor: '#DCFCE7' },
  pendingBadge: { backgroundColor: '#FEF3C7' },
  payslipBadgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  paidText: { color: '#10B981' },
  pendingText: { color: '#F59E0B' },
  payslipDivider: { height: 1, backgroundColor: '#F1F5F9', marginBottom: 14 },
  payslipGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  payslipStat: { flex: 1 },
  payslipStatLabel: { fontSize: 11, color: '#94A3B8', marginBottom: 3, fontWeight: '500' },
  payslipStatValue: { fontSize: 14, fontWeight: '600' },
  downloadBtn: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    paddingVertical: 12, backgroundColor: '#FDF2F8',
    borderRadius: 14, gap: 8, marginTop: 4
  },
  downloadBtnText: { fontWeight: '700', fontSize: 13 },

  /* ── Empty / Loading ── */
  loadingBox: { alignItems: 'center', paddingVertical: 30, gap: 8 },
  loadingText: { color: '#94A3B8', fontSize: 13 },
  emptyBox: {
    alignItems: 'center', paddingVertical: 36,
    backgroundColor: '#FFF', borderRadius: 16, padding: 24,
    shadowColor: '#64748B', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04, shadowRadius: 6, elevation: 1
  },
  emptyIcon: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center', alignItems: 'center', marginBottom: 12
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#64748B', marginBottom: 4 },
  emptySubtitle: { fontSize: 13, color: '#94A3B8', textAlign: 'center' },

  /* ── Switch account ── */
  switchAccountButton: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#EFF6FF', borderRadius: 16, padding: 14, gap: 12,
  },
  switchAccountIconBox: { backgroundColor: '#DBEAFE' },
  switchAccountText: { flex: 1, fontSize: 15, fontWeight: '600', color: '#1D4ED8', letterSpacing: 0.1 },

  /* ── Logout ── */
  logoutButton: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FEF2F2', borderRadius: 16, padding: 14, gap: 12,
    borderWidth: 1, borderColor: '#FECACA'
  },
  logoutIconBox: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center', alignItems: 'center'
  },
  logoutText: { flex: 1, fontSize: 15, fontWeight: '600', color: '#DC2626', letterSpacing: 0.1 }
});