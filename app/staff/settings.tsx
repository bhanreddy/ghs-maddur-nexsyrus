import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Switch, Linking } from 'react-native';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import { Ionicons, MaterialIcons, FontAwesome5 } from '@expo/vector-icons';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import StaffHeader from '../../src/components/StaffHeader';
import ViewAsBanner from '../../src/components/ViewAsBanner';
import AccountSwitcherSheet from '../../src/components/AccountSwitcherSheet';
import Avatar from '../../src/components/Avatar';
import AvatarUploader, { AvatarUploaderHandle } from '../../src/components/AvatarUploader';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { useAuth } from '../../src/hooks/useAuth';
import { useEffectiveStaffId } from '../../src/hooks/useEffectiveStaffId';
import { useTheme } from '../../src/hooks/useTheme';
import { ThemeColors } from '../../src/theme/themes';
import { Staff, StaffService } from '../../src/services/staffService';

/** Returns the first human-readable ID (not a UUID) from the user object */
function getHumanId(user: any): string {
  const candidates = [user?.staff_code, user?.admission_no];
  for (const c of candidates) {
    if (c && typeof c === 'string' && c.trim().length > 0) return c;
  }
  return 'N/A';
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface SettingRowProps {
    icon: string;
    iconLib?: 'ion' | 'fa5' | 'mi';
    iconColor: string;
    iconBg: string;
    label: string;
    sublabel?: string;
    isLast?: boolean;
    rightElement?: React.ReactNode;
    onPress?: () => void;
    labelColor?: string;
}

interface GroupProps {
    title: string;
    subtitle?: string;
    delay: number;
    borderColor?: string;
    children: React.ReactNode;
    colors: ThemeColors;
}

// ─── SettingRow ───────────────────────────────────────────────────────────────

function SettingRow({
    icon, iconLib = 'ion', iconColor, iconBg,
    label, sublabel, isLast, rightElement, onPress, labelColor
}: SettingRowProps) {
    const Wrapper = onPress ? TouchableOpacity : View;
    const { theme } = useTheme();

    const IconComponent = () => {
        if (iconLib === 'fa5') return <FontAwesome5 name={icon as any} size={15} color={iconColor} />;
        if (iconLib === 'mi') return <MaterialIcons name={icon as any} size={18} color={iconColor} />;
        return <Ionicons name={icon as any} size={18} color={iconColor} />;
    };

    return (
        <>
            <Wrapper style={RS.row} onPress={onPress} activeOpacity={0.65}>
                <View style={[RS.iconBox, { backgroundColor: iconBg }]}>
                    <IconComponent />
                </View>
                <View style={RS.labelWrap}>
                    <Text style={[RS.label, { color: labelColor ?? theme.colors.textStrong }]}>{label}</Text>
                    {sublabel && <Text style={[RS.sublabel, { color: theme.colors.textMuted }]}>{sublabel}</Text>}
                </View>
                <View style={RS.right}>{rightElement}</View>
            </Wrapper>
            {!isLast && <View style={[RS.divider, { backgroundColor: theme.colors.borderLight }]} />}
        </>
    );
}

const RS = StyleSheet.create({
    row: {
        flexDirection: 'row', alignItems: 'center',
        paddingVertical: 13, paddingHorizontal: 16,
    },
    iconBox: {
        width: 38, height: 38, borderRadius: 11,
        justifyContent: 'center', alignItems: 'center', marginRight: 13,
    },
    labelWrap: { flex: 1 },
    label: { fontSize: 15, fontWeight: '500' },
    sublabel: { fontSize: 12, marginTop: 1 },
    right: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    divider: {
        height: StyleSheet.hairlineWidth, marginLeft: 67,
    },
});

// ─── Group ────────────────────────────────────────────────────────────────────

function Group({ title, subtitle, delay, borderColor, children, colors }: GroupProps) {
    return (
        <Animated.View entering={FadeInDown.delay(delay).duration(480)} style={GS.container}>
            <View style={GS.header}>
                <Text style={GS.title}>{title}</Text>
                {subtitle && <Text style={GS.subtitle}>{subtitle}</Text>}
            </View>
            <View style={[GS.card, { backgroundColor: colors.card },
            borderColor ? { borderColor, borderWidth: 1 } : { borderWidth: 1, borderColor: colors.border }
            ]}>
                {children}
            </View>
        </Animated.View>
    );
}

const GS = StyleSheet.create({
    container: { marginBottom: 22 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9, paddingHorizontal: 4 },
    title: { fontSize: 10, fontWeight: '700', letterSpacing: 1.5, color: '#9CA3AF', textTransform: 'uppercase' },
    subtitle: { fontSize: 11, color: '#D1D5DB' },
    card: { borderRadius: 18, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
});

// ─── Stat pill ────────────────────────────────────────────────────────────────


const SP = StyleSheet.create({
    wrap: { alignItems: 'center', flex: 1 },
    iconDot: { width: 28, height: 28, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
    value: { fontSize: 15, fontWeight: '800', color: '#111827' },
    label: { fontSize: 10, color: '#9CA3AF', marginTop: 1, textTransform: 'uppercase', letterSpacing: 0.5 },
});

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function StaffSettings() {
    const router = useRouter();
    const { user, signOut } = useAuth();
    const { theme, isDark, toggleTheme } = useTheme();
    const styles = React.useMemo(() => getStyles(theme.colors), [theme]);
    const [updating, setUpdating] = useState(false);
    const [switcherOpen, setSwitcherOpen] = useState(false);
    const { staffId, isViewingAsAdmin, viewAsName } = useEffectiveStaffId();
    const avatarUploaderRef = useRef<AvatarUploaderHandle>(null);
    const [viewedStaff, setViewedStaff] = useState<Staff | null>(null);

    React.useEffect(() => {
        if (!isViewingAsAdmin || !staffId) { setViewedStaff(null); return; }
        StaffService.getById(staffId).then(setViewedStaff).catch(() => setViewedStaff(null));
    }, [isViewingAsAdmin, staffId]);

    const displayName = (isViewingAsAdmin ? (viewedStaff?.display_name || viewAsName) : user?.displayName) || 'Staff Member';
    const photoUrl = isViewingAsAdmin ? viewedStaff?.photo_url : user?.photoUrl;

    const soon = (item: string) => alertCompat(item, 'Coming in the next update.');

    const handleLogout = () => {
        if (isViewingAsAdmin) {
            // Signing out here would log the ADMIN out of their own session, not
            // the viewed staff member — never allow it while viewing another
            // staff member's portal.
            alertCompat('Not available', 'You can\'t log out from another staff member\'s portal.');
            return;
        }
        alertCompat('Log Out', 'Are you sure you want to log out?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Log Out', style: 'destructive', onPress: async () => {
                const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
                await AsyncStorage.removeItem('staff_auto_login');
                await signOut();
                router.replace('/welcome');
            } },
        ]);
    };

    const chevron = <MaterialIcons name="chevron-right" size={18} color="#D1D5DB" />;
    const redChevron = <MaterialIcons name="chevron-right" size={18} color="#EF4444" />;

    return (
        <View style={styles.container}>
            <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.colors.background} />
            <StaffHeader title="Settings" showBackButton />
            {isViewingAsAdmin && <ViewAsBanner name={viewAsName} limited />}

            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

                {/* ── Profile ── */}
                <Animated.View entering={FadeInDown.delay(80).duration(600)} style={styles.profileCard}>
                    {/* Decorative blobs */}
                    <View style={styles.blob1} />
                    <View style={styles.blob2} />

                    {/* Top row */}
                    <View style={styles.profileTop}>
                        <Animated.View entering={ZoomIn.delay(200).duration(400)} style={styles.avatarWrap}>
                            {isViewingAsAdmin ? (
                                <Avatar
                                    photoUrl={photoUrl}
                                    name={displayName}
                                    size={62}
                                    borderRadius={18}
                                    ringColor={theme.colors.border}
                                    ringWidth={2}
                                />
                            ) : (
                                <AvatarUploader
                                    ref={avatarUploaderRef}
                                    photoUrl={photoUrl}
                                    name={displayName}
                                    size={62}
                                    borderRadius={18}
                                    ringColor={theme.colors.border}
                                    ringWidth={2}
                                    accentColor="#6366F1"
                                />
                            )}
                            <View style={styles.onlineDot} />
                        </Animated.View>

                        <View style={styles.profileMeta}>
                            <Text style={styles.profileName}>{displayName}</Text>
                            <View style={styles.roleRow}>
                                <FontAwesome5 name="id-badge" size={10} color="#6366F1" />
                                <Text style={styles.roleText}>
                                    {isViewingAsAdmin ? (viewedStaff?.staff_code || 'N/A') : getHumanId(user)}
                                </Text>
                            </View>
                        </View>

                        {!isViewingAsAdmin && (
                            <TouchableOpacity
                                style={styles.editChip}
                                onPress={() => avatarUploaderRef.current?.open()}
                                activeOpacity={0.7}
                            >
                                <Ionicons name="camera" size={11} color="#6366F1" />
                                <Text style={styles.editChipText}>Change Photo</Text>
                            </TouchableOpacity>
                        )}
                    </View>



                </Animated.View>

                {/* ── Accounts ── */}
                <Group title="Accounts" delay={130} colors={theme.colors}>
                    <SettingRow
                        icon="people-circle" iconColor="#2563EB" iconBg="#EFF6FF"
                        label="Switch account"
                        sublabel="Parent login, staff login, or another child"
                        isLast
                        onPress={() => setSwitcherOpen(true)}
                        rightElement={chevron}
                    />
                </Group>

                {/* ── General ── */}
                <Group title="General" delay={170} colors={theme.colors}>
                    <SettingRow
                        icon="moon" iconColor="#6366F1" iconBg="#EEF2FF"
                        label="Dark Mode" sublabel={isDark ? 'Currently on' : 'Currently off'}
                        rightElement={
                            <Switch trackColor={{ false: theme.colors.border, true: '#818CF8' }}
                                thumbColor="#fff" onValueChange={toggleTheme} value={isDark} />
                        }
                    />

                    <SettingRow
                        icon="language" iconColor="#10B981" iconBg="#ECFDF5"
                        label="Language" sublabel="App display language"
                        isLast onPress={() => soon('Language')}
                        rightElement={<><Text style={styles.valueText}>English</Text>{chevron}</>}
                    />
                </Group>

                {/* ── Security ── */}
                <Group title="Security" delay={250} colors={theme.colors}>
                    <SettingRow
                        icon="lock-closed" iconColor="#3B82F6" iconBg="#EFF6FF"
                        label="Change Password" sublabel="Update your login credentials"
                        isLast onPress={() => router.push('/change-password')}
                        rightElement={chevron}
                    />
                </Group>

                {/* ── Support ── */}
                <Group title="Support & Info" delay={330} colors={theme.colors}>
                    <SettingRow
                        icon="help-buoy" iconColor="#8B5CF6" iconBg="#F5F3FF"
                        label="Help Center" sublabel="Chat with support on WhatsApp"
                        onPress={() => Linking.openURL('https://api.whatsapp.com/send?phone=917892654731&text=Hey%2C%20I%20have%20a%20problem%20in%20the%20app')}
                        rightElement={chevron}
                    />
                    <SettingRow
                        icon="shield-checkmark" iconColor="#06B6D4" iconBg="#ECFEFF"
                        label="Privacy Policy" sublabel="How we handle your data"
                        onPress={() => Linking.openURL('https://schoolims.nexsyrus.com/privacy')}
                        rightElement={chevron}
                    />
                    <SettingRow
                        icon="megaphone-outline" iconColor="#F59E0B" iconBg="#FEF3C7"
                        label="Why do we show Ads" sublabel="Transparency about our ad model"
                        onPress={() => (router as any).push('/why-ads')}
                        rightElement={chevron}
                    />
                    <SettingRow
                        icon="logo-whatsapp" iconColor="#25D366" iconBg="#F0FDF4"
                        label="Contact Us" sublabel="Reach us on WhatsApp"
                        onPress={() => Linking.openURL('https://api.whatsapp.com/send?phone=917892654731')}
                        rightElement={chevron}
                    />
                    <SettingRow
                        icon="code-slash" iconColor="#8B5CF6" iconBg="#F5F3FF"
                        label="Dev Contact" sublabel="bhanureddy.nexsyrus.com"
                        isLast onPress={() => Linking.openURL('https://bhanureddy.nexsyrus.com')}
                        rightElement={chevron}
                    />
                </Group>

                {/* ── Danger Zone ── */}
                <Group title="Danger Zone" delay={410} borderColor="#FECACA" colors={theme.colors}>
                    <SettingRow
                        icon="trash-outline" iconColor="#EF4444" iconBg="#FEF2F2"
                        label="Delete Account" sublabel="Permanently remove your account"
                        labelColor="#EF4444" isLast
                        onPress={() =>
                            alertCompat('Delete Account', 'This is permanent and cannot be undone. Continue?', [
                                { text: 'Cancel', style: 'cancel' },
                                { text: 'Delete', style: 'destructive', onPress: () => Linking.openURL('https://example.com/delete-account') },
                            ])
                        }
                        rightElement={redChevron}
                    />
                </Group>

                {/* ── Logout ── */}
                <Animated.View entering={FadeInDown.delay(470).duration(500)}>
                    <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
                        <View style={styles.logoutIconWrap}>
                            <Ionicons name="log-out-outline" size={18} color="#EF4444" />
                        </View>
                        <Text style={styles.logoutText}>Log Out</Text>
                    </TouchableOpacity>
                </Animated.View>

                {/* ── Version footer ── */}
                <Animated.View entering={FadeInDown.delay(520).duration(400)} style={styles.footer}>
                    <View style={styles.footerDot} />
                    <Text style={styles.footerText}>Nexsyrus SchoolIMS · v{Constants.expoConfig?.version || '1.0.0'}</Text>
                    <View style={styles.footerDot} />
                </Animated.View>

            </ScrollView>
            <AccountSwitcherSheet visible={switcherOpen} onClose={() => setSwitcherOpen(false)} />
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const getStyles = (colors: ThemeColors) => StyleSheet.create({
    container: { flex: 1, backgroundColor: 'transparent' },
    scroll: { padding: 20, paddingBottom: 60 },

    // Profile card
    profileCard: {
        backgroundColor: colors.card, borderRadius: 22, padding: 20,
        marginBottom: 26, overflow: 'hidden',
        borderWidth: 1, borderColor: colors.border,
        shadowColor: '#6366F1', shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.07, shadowRadius: 12, elevation: 3,
    },
    blob1: {
        position: 'absolute', top: -40, right: -30,
        width: 130, height: 130, borderRadius: 65,
        backgroundColor: '#6366F1', opacity: 0.06,
    },
    blob2: {
        position: 'absolute', bottom: -20, left: -20,
        width: 90, height: 90, borderRadius: 45,
        backgroundColor: '#F59E0B', opacity: 0.07,
    },
    profileTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
    avatarWrap: { position: 'relative', marginRight: 14 },
    avatar: {
        width: 62, height: 62, borderRadius: 18,
        borderWidth: 2, borderColor: colors.border,
    },
    onlineDot: {
        position: 'absolute', bottom: 2, right: 2,
        width: 14, height: 14, borderRadius: 7,
        backgroundColor: '#10B981',
        borderWidth: 2, borderColor: colors.card,
    },
    profileMeta: { flex: 1 },
    profileName: { fontSize: 17, fontWeight: '800', color: colors.textStrong, marginBottom: 5 },
    roleRow: {
        flexDirection: 'row', alignItems: 'center', gap: 5,
        backgroundColor: '#EEF2FF', paddingHorizontal: 8, paddingVertical: 4,
        borderRadius: 6, alignSelf: 'flex-start',
    },
    roleText: { fontSize: 11, fontWeight: '600', color: '#6366F1' },
    editChip: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        backgroundColor: '#EEF2FF', paddingHorizontal: 10, paddingVertical: 7,
        borderRadius: 10, borderWidth: 1, borderColor: '#C7D2FE',
    },
    editChipText: { fontSize: 12, fontWeight: '700', color: '#6366F1' },
    profileDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginBottom: 16 },
    statsRow: { flexDirection: 'row', alignItems: 'center' },
    statSep: { width: StyleSheet.hairlineWidth, height: 36, backgroundColor: colors.border },

    // Shared
    valueText: { fontSize: 13, color: '#9CA3AF' },

    // Logout
    logoutBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
        backgroundColor: '#FEF2F2', paddingVertical: 15, borderRadius: 16,
        marginTop: 4, borderWidth: 1, borderColor: '#FECACA',
    },
    logoutIconWrap: {
        width: 30, height: 30, borderRadius: 9,
        backgroundColor: '#FFE4E6', justifyContent: 'center', alignItems: 'center',
    },
    logoutText: { fontSize: 15, fontWeight: '700', color: '#EF4444' },

    // Footer
    footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 20 },
    footerDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB' },
    footerText: { fontSize: 12, color: '#9CA3AF', fontStyle: 'italic' },
});