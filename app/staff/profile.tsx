import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Linking } from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from '@/src/utils/haptics';
import StaffHeader from '../../src/components/StaffHeader';
import ViewAsBanner from '../../src/components/ViewAsBanner';
import Avatar from '../../src/components/Avatar';
import AvatarUploader from '../../src/components/AvatarUploader';
import { useAuth } from '../../src/hooks/useAuth';
import { useEffectiveStaffId } from '../../src/hooks/useEffectiveStaffId';
import { useTheme } from '../../src/hooks/useTheme';
import { Theme } from '../../src/theme/themes';
import { Staff, StaffMyProfile, StaffService } from '../../src/services/staffService';

/** True when a DB value is actually present (not null/blank/placeholder). */
function hasVal(v: unknown): v is string {
  if (v == null) return false;
  const s = String(v).trim();
  return s.length > 0 && s !== 'N/A' && s !== '-';
}

/** Format a DB date string for display; returns undefined when unparseable/empty. */
function formatDate(v?: string | null): string | undefined {
  if (!hasVal(v)) return undefined;
  const d = new Date(v as string);
  if (isNaN(d.getTime())) return undefined;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

const StaffProfileScreen = () => {
  const {
    theme,
    isDark
  } = useTheme();
  const styles = React.useMemo(() => getStyles(theme, isDark), [theme, isDark]);
  const {
    user
  } = useAuth();
  const { staffId, isViewingAsAdmin, viewAsName } = useEffectiveStaffId();
  const [viewedStaff, setViewedStaff] = React.useState<Staff | null>(null);
  const [myProfile, setMyProfile] = React.useState<StaffMyProfile | null>(null);

  React.useEffect(() => {
    if (!isViewingAsAdmin || !staffId) { setViewedStaff(null); return; }
    StaffService.getById(staffId).then(setViewedStaff).catch(() => setViewedStaff(null));
  }, [isViewingAsAdmin, staffId]);

  // Self view: pull the full DB-backed profile (dob, gender, address, joining date …).
  React.useEffect(() => {
    if (isViewingAsAdmin || !user) { setMyProfile(null); return; }
    StaffService.getMyProfile().then(setMyProfile).catch(() => setMyProfile(null));
  }, [isViewingAsAdmin, user?.userId]);

  // Every field below is sourced only from the DB record. Nothing is invented;
  // if the DB has no value, the row/section simply isn't rendered.
  const displayName = isViewingAsAdmin
    ? (viewedStaff?.display_name || viewAsName)
    : (myProfile?.display_name || user?.name);
  const photoUrl = isViewingAsAdmin ? viewedStaff?.photo_url : (myProfile?.photo_url || user?.photoUrl);
  const designation = isViewingAsAdmin
    ? (viewedStaff?.designation_name || viewedStaff?.designation)
    : myProfile?.designation;
  const roleLabel = hasVal(designation)
    ? designation
    : (!isViewingAsAdmin && user?.role ? user.role.name.charAt(0).toUpperCase() + user.role.name.slice(1) : 'Staff');
  const staffCode = isViewingAsAdmin ? viewedStaff?.staff_code : (myProfile?.staff_code || user?.staff_code);
  const status = isViewingAsAdmin ? (viewedStaff?.status_name || viewedStaff?.status) : myProfile?.status;
  const email = isViewingAsAdmin ? viewedStaff?.email : (myProfile?.email || user?.email);
  const phone = isViewingAsAdmin ? viewedStaff?.phone : (myProfile?.phone || user?.phone);
  const dob = isViewingAsAdmin ? undefined : myProfile?.dob;
  const gender = isViewingAsAdmin ? undefined : myProfile?.gender;
  const address = isViewingAsAdmin ? undefined : myProfile?.address;
  const joiningDate = isViewingAsAdmin ? viewedStaff?.joining_date : myProfile?.joining_date;

  const personalRows = [
    { icon: 'mail-outline' as const, label: 'Email Address', value: email, isLink: true, onPress: () => hasVal(email) && handleEmail(email as string) },
    { icon: 'call-outline' as const, label: 'Phone Number', value: phone, isLink: true, onPress: () => hasVal(phone) && handleCall(phone as string) },
    { icon: 'calendar-outline' as const, label: 'Date of Birth', value: formatDate(dob) },
    { icon: 'male-female-outline' as const, label: 'Gender', value: gender },
    { icon: 'location-outline' as const, label: 'Current Address', value: address },
  ].filter((r) => hasVal(r.value));

  const employmentRows = [
    { icon: 'ribbon-outline' as const, label: 'Designation', value: designation },
    { icon: 'shield-checkmark-outline' as const, label: 'Status', value: status },
    { icon: 'time-outline' as const, label: 'Joining Date', value: formatDate(joiningDate) },
  ].filter((r) => hasVal(r.value));

  const handleCall = (number: string) => {
    Haptics.selectionAsync();
    Linking.openURL(`tel:${number}`);
  };
  const handleEmail = (email: string) => {
    Haptics.selectionAsync();
    Linking.openURL(`mailto:${email}`);
  };
  const InfoRow = ({
    icon,
    label,
    value,
    isLink = false,
    onPress
  }: {
    icon: any;
    label: string;
    value: string;
    isLink?: boolean;
    onPress?: () => void;
  }) => {
    return <TouchableOpacity style={styles.infoRow} activeOpacity={isLink ? 0.7 : 1} onPress={isLink ? onPress : undefined} disabled={!isLink}>
      <View style={styles.iconBox}>
        <Ionicons name={icon} size={20} color="#6366F1" />
      </View>
      <View style={styles.infoContent}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={[styles.infoValue, isLink && styles.linkText]}>{value}</Text>
      </View>
      {isLink && <MaterialIcons name="chevron-right" size={20} color="#9CA3AF" />}
    </TouchableOpacity>;
  };
  return <View style={styles.container}>
    <StatusBar barStyle="dark-content" backgroundColor="#fff" />

    <StaffHeader title="My Profile" showBackButton={true} />
    {isViewingAsAdmin && <ViewAsBanner name={viewAsName} />}

    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      {/* --- Header Profile Card --- */}
      <Animated.View entering={FadeInDown.delay(100).duration(600)} style={styles.headerCard}>
        <LinearGradient colors={isDark ? ['rgba(30, 41, 59, 1)', 'rgba(15, 23, 42, 1)'] : [theme.colors.primary, theme.colors.primary]} start={{
          x: 0,
          y: 0
        }} end={{
          x: 1,
          y: 1
        }} style={styles.headerBackground} />

        <View style={styles.profileContent}>
          <View style={styles.avatarContainer}>
            {isViewingAsAdmin ? (
              <Avatar photoUrl={photoUrl} name={displayName} size={100} ringColor={theme.colors.background} ringWidth={4} />
            ) : (
              <AvatarUploader
                photoUrl={photoUrl}
                name={displayName}
                size={100}
                ringColor={theme.colors.background}
                ringWidth={4}
              />
            )}
            {hasVal(status) && (
              <View style={styles.statusBadge}>
                <View style={styles.statusDot} />
                <Text style={styles.statusText}>{status}</Text>
              </View>
            )}
          </View>

          <Text style={styles.name}>{displayName || 'Staff Member'}</Text>
          <Text style={styles.designation}>{roleLabel}</Text>
          {hasVal(staffCode) && <Text style={styles.staffId}>Staff ID: {staffCode}</Text>}
        </View>
      </Animated.View>

      {/* --- Personal Information (DB-driven; only populated fields) --- */}
      {personalRows.length > 0 && (
        <Animated.View entering={FadeInUp.delay(200).duration(600)} style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>Personal Information</Text>
          <View style={styles.infoCard}>
            {personalRows.map((r, i) => (
              <React.Fragment key={r.label}>
                {i > 0 && <View style={styles.divider} />}
                <InfoRow icon={r.icon} label={r.label} value={r.value as string} isLink={r.isLink} onPress={r.onPress} />
              </React.Fragment>
            ))}
          </View>
        </Animated.View>
      )}

      {/* --- Employment (DB-driven; only populated fields) --- */}
      {employmentRows.length > 0 && (
        <Animated.View entering={FadeInUp.delay(300).duration(600)} style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>Employment</Text>
          <View style={styles.infoCard}>
            {employmentRows.map((r, i) => (
              <React.Fragment key={r.label}>
                {i > 0 && <View style={styles.divider} />}
                <InfoRow icon={r.icon} label={r.label} value={r.value as string} />
              </React.Fragment>
            ))}
          </View>
        </Animated.View>
      )}

      <View style={{
        height: 40
      }} />
    </ScrollView>
  </View>;
};
export default StaffProfileScreen;
const getStyles = (theme: Theme, isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent'
  },
  scrollContent: {
    padding: 20
  },
  // Header Card
  headerCard: {
    borderRadius: 32,
    overflow: 'hidden',
    marginBottom: 24,
    shadowColor: theme.colors.primaryDark,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.25,
    shadowRadius: 28,
    elevation: 14,
    backgroundColor: theme.colors.card,
    borderWidth: 1.2,
    borderBottomWidth: 4,
    borderColor: theme.colors.border,
    borderBottomColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.1)'
  },
  headerBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 120
  },
  profileContent: {
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: 24,
    paddingHorizontal: 20
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 12
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 4,
    borderColor: theme.colors.background
  },
  statusBadge: {
    position: 'absolute',
    bottom: 4,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: theme.colors.background
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
    marginRight: 4
  },
  statusText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#059669'
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4
  },
  designation: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: 4,
    fontWeight: '500'
  },
  staffId: {
    fontSize: 12,
    color: theme.colors.textTertiary,
    marginBottom: 20,
    backgroundColor: theme.colors.card,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: 'hidden'
  },
  quickStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: theme.colors.card
  },
  quickStat: {
    alignItems: 'center',
    paddingHorizontal: 12
  },
  statNumber: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 2
  },
  statLabel: {
    fontSize: 11,
    color: theme.colors.textSecondary
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: theme.colors.border
  },
  // Sections
  sectionContainer: {
    marginBottom: 20
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 12,
    marginLeft: 4
  },
  infoCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 28,
    padding: 12,
    shadowColor: isDark ? '#000' : theme.colors.primaryDark,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: isDark ? 0.35 : 0.08,
    shadowRadius: 24,
    elevation: 8,
    borderWidth: 1.2,
    borderBottomWidth: 4,
    borderColor: theme.colors.border,
    borderBottomColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.1)'
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12
  },
  infoContent: {
    flex: 1
  },
  infoLabel: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    marginBottom: 2
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937'
  },
  linkText: {
    color: theme.colors.primary
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.card,
    marginLeft: 60
  }
});