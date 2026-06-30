import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Switch, Image, Linking } from 'react-native';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import { Ionicons, MaterialIcons, FontAwesome5 } from '@expo/vector-icons';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import StudentHeader from '../../src/components/StudentHeader';
import AccountSwitcherSheet from '../../src/components/AccountSwitcherSheet';
import { useAuth } from '../../src/hooks/useAuth';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { useTheme } from '../../src/hooks/useTheme';
import { ThemeColors } from '../../src/theme/themes';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** Returns the first human-readable ID (not a UUID) from the user object */
function getHumanId(user: any): string {
  const candidates = [
    user?.admission_no,
    user?.staff_code,
  ];
  for (const c of candidates) {
    if (c && typeof c === 'string' && c.trim().length > 0) return c;
  }
  return 'N/A';
}

// ─── SettingRow ───────────────────────────────────────────────────────────────

interface SettingRowProps {
    icon: string;
    iconColor: string;
    iconBg: string;
    label: string;
    isLast?: boolean;
    rightElement?: React.ReactNode;
    onPress?: () => void;
    labelColor?: string;
}

function SettingRow({ icon, iconColor, iconBg, label, isLast, rightElement, onPress, labelColor }: SettingRowProps) {
    const Wrapper = onPress ? TouchableOpacity : View;
    const { theme } = useTheme();
    return (
        <>
            <Wrapper style={RS.row} onPress={onPress} activeOpacity={0.65}>
                <View style={[RS.iconBox, { backgroundColor: iconBg }]}>
                    <Ionicons name={icon as any} size={18} color={iconColor} />
                </View>
                <Text style={[RS.label, { color: labelColor ?? theme.colors.textStrong }]}>{label}</Text>
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
    label: { flex: 1, fontSize: 15, fontWeight: '500' },
    right: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    divider: {
        height: StyleSheet.hairlineWidth, marginLeft: 67,
    },
});

// ─── Group ────────────────────────────────────────────────────────────────────

interface GroupProps {
    title: string;
    delay: number;
    borderColor?: string;
    children: React.ReactNode;
    colors: ThemeColors;
}

function Group({ title, delay, borderColor, children, colors }: GroupProps) {
    return (
        <Animated.View entering={FadeInDown.delay(delay).duration(480)} style={GS.container}>
            <Text style={GS.title}>{title}</Text>
            <View style={[
                GS.card, { backgroundColor: colors.card },
                borderColor
                    ? { borderColor, borderWidth: 1 }
                    : { borderWidth: 1, borderColor: colors.border }
            ]}>
                {children}
            </View>
        </Animated.View>
    );
}

const GS = StyleSheet.create({
    container: { marginBottom: 22 },
    title: {
        fontSize: 10, fontWeight: '700', letterSpacing: 1.5,
        color: '#9CA3AF', marginBottom: 9, marginLeft: 4,
        textTransform: 'uppercase',
    },
    card: {
        borderRadius: 18, overflow: 'hidden',
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
    },
});

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Settings() {
    const { user, signOut } = useAuth();
    const router = useRouter();
    const { theme, isDark, toggleTheme } = useTheme();
    const { t, i18n } = useTranslation();
    const styles = React.useMemo(() => getStyles(theme.colors), [theme]);
    const [updating, setUpdating] = useState(false);
    const [switcherOpen, setSwitcherOpen] = useState(false);

    const handlePress = (item: string) =>
        alertCompat(item, 'This feature will be available in the next update.');

    const handleLogout = async () => {
        await AsyncStorage.removeItem('student_auto_login');
        await signOut();
        router.replace('/welcome');
    };

    const chevron = <MaterialIcons name="chevron-right" size={18} color="#D1D5DB" />;

    return (
        <View style={styles.container}>
            <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.colors.background} />

            <StudentHeader
                title={t('settings.title', 'Settings')}
                showBackButton={true}
                showSettingsButton={false}
            />

            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

                {/* ── Profile card ── */}
                <Animated.View entering={FadeInDown.delay(80).duration(600)} style={styles.profileCard}>
                    <View style={styles.blob1} />
                    <View style={styles.blob2} />

                    <View style={styles.profileTop}>
                        <Animated.View entering={ZoomIn.delay(200).duration(400)} style={styles.avatarWrap}>
                            <Image
                                source={{ uri: user?.photoUrl || 'https://cdn-icons-png.flaticon.com/512/2922/2922506.png' }}
                                style={styles.avatar}
                            />
                            <View style={styles.onlineDot} />
                        </Animated.View>

                        <View style={styles.profileMeta}>
                            <Text style={styles.profileName}>
                                {user?.displayName || 'Student Name'}
                            </Text>
                            <View style={styles.idBadge}>
                                <FontAwesome5 name="id-card" size={9} color="#10B981" />
                                <Text style={styles.idText}>
                                    {getHumanId(user)}
                                </Text>
                            </View>
                        </View>

                        <TouchableOpacity
                            style={styles.editChip}
                            onPress={() => handlePress('Edit Profile')}
                            activeOpacity={0.7}
                        >
                            <Ionicons name="pencil" size={11} color="#10B981" />
                            <Text style={styles.editChipText}>{t('settings.edit_profile', 'Edit')}</Text>
                        </TouchableOpacity>
                    </View>
                </Animated.View>

                {/* ── Accounts ── */}
                <Group title={t('settings.accounts', 'Accounts')} delay={130} colors={theme.colors}>
                    <SettingRow
                        icon="people-circle"
                        iconColor="#2563EB" iconBg="#EFF6FF"
                        label={t('settings.switch_account', 'Switch / Manage accounts')}
                        isLast
                        onPress={() => setSwitcherOpen(true)}
                        rightElement={chevron}
                    />
                </Group>

                {/* ── General ── */}
                <Group title={t('settings.general', 'General')} delay={170} colors={theme.colors}>
                    <SettingRow
                        icon="moon"
                        iconColor="#6366F1" iconBg="#EEF2FF"
                        label={t('settings.dark_mode', 'Dark Mode')}
                        rightElement={
                            <Switch
                                trackColor={{ false: theme.colors.border, true: '#818CF8' }}
                                thumbColor="#fff"
                                onValueChange={toggleTheme}
                                value={isDark}
                            />
                        }
                    />

                    <SettingRow
                        icon="language"
                        iconColor="#3B82F6" iconBg="#EFF6FF"
                        label={t('settings.language_telugu', 'Language (Telugu)')}
                        isLast
                        rightElement={
                            <Switch
                                trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
                                thumbColor="#fff"
                                onValueChange={(val) => { i18n.changeLanguage(val ? 'te' : 'en').catch(console.error); }}
                                value={i18n.language === 'te'}
                            />
                        }
                    />
                </Group>

                {/* ── Security ── */}
                <Group title={t('settings.security', 'Security')} delay={250} colors={theme.colors}>
                    <SettingRow
                        icon="lock-closed"
                        iconColor="#3B82F6" iconBg="#EFF6FF"
                        label={t('settings.change_password', 'Change Password')}
                        isLast
                        onPress={() => router.push('/change-password')}
                        rightElement={chevron}
                    />
                </Group>

                {/* ── Support ── */}
                <Group title={t('settings.support', 'Support')} delay={330} colors={theme.colors}>
                    <SettingRow
                        icon="help-buoy"
                        iconColor="#8B5CF6" iconBg="#F5F3FF"
                        label={t('settings.help_center', 'Help Center')}
                        onPress={() => Linking.openURL('https://api.whatsapp.com/send?phone=917892654731&text=Hey%2C%20I%20have%20a%20problem%20in%20the%20app')}
                        rightElement={chevron}
                    />
                    <SettingRow
                        icon="shield-checkmark"
                        iconColor="#06B6D4" iconBg="#ECFEFF"
                        label={t('settings.privacy_policy', 'Privacy Policy')}
                        onPress={() => Linking.openURL('https://schoolims.nexsyrus.com/privacy')}
                        rightElement={chevron}
                    />
                    <SettingRow
                        icon="megaphone-outline"
                        iconColor="#F59E0B" iconBg="#FEF3C7"
                        label={t('settings.why_ads', 'Why do we show ads')}
                        onPress={() => (router as any).push('/why-ads')}
                        rightElement={chevron}
                    />
                    <SettingRow
                        icon="logo-whatsapp"
                        iconColor="#25D366" iconBg="#F0FDF4"
                        label={t('settings.contact_us', 'Contact Us')}
                        onPress={() => Linking.openURL('https://api.whatsapp.com/send?phone=917892654731&text=Hi%20there...')}
                        rightElement={chevron}
                    />
                    <SettingRow
                        icon="code-slash"
                        iconColor="#8B5CF6" iconBg="#F5F3FF"
                        label={t('settings.dev_contact', 'Dev Contact')}
                        isLast
                        onPress={() => Linking.openURL('https://bhanureddy.nexsyrus.com')}
                        rightElement={chevron}
                    />
                </Group>

                {/* ── Logout ── */}
                <Animated.View entering={FadeInDown.delay(410).duration(500)}>
                    <TouchableOpacity
                        style={styles.logoutBtn}
                        activeOpacity={0.8}
                        onPress={() =>
                            alertCompat(
                                'Logout',
                                'Are you sure you want to logout?',
                                [
                                    { text: 'Cancel', style: 'cancel' },
                                    { text: 'Logout', style: 'destructive', onPress: handleLogout },
                                ]
                            )
                        }
                    >
                        <View style={styles.logoutIconWrap}>
                            <Ionicons name="log-out-outline" size={18} color="#EF4444" />
                        </View>
                        <Text style={styles.logoutText}>{t('settings.log_out', 'Log Out')}</Text>
                    </TouchableOpacity>
                </Animated.View>

                {/* ── Version footer ── */}
                <Animated.View entering={FadeInDown.delay(460).duration(400)} style={styles.footer}>
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
        shadowColor: '#10B981', shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.07, shadowRadius: 12, elevation: 3,
    },
    blob1: {
        position: 'absolute', top: -40, right: -30,
        width: 120, height: 120, borderRadius: 60,
        backgroundColor: '#10B981', opacity: 0.06,
    },
    blob2: {
        position: 'absolute', bottom: -20, left: -20,
        width: 90, height: 90, borderRadius: 45,
        backgroundColor: '#3B82F6', opacity: 0.06,
    },
    profileTop: { flexDirection: 'row', alignItems: 'center' },
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
    profileName: {
        fontSize: 17, fontWeight: '800',
        color: colors.textStrong, marginBottom: 6,
    },
    idBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 5,
        backgroundColor: '#ECFDF5', paddingHorizontal: 8, paddingVertical: 4,
        borderRadius: 6, alignSelf: 'flex-start',
    },
    idText: { fontSize: 11, fontWeight: '600', color: '#10B981' },
    editChip: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        backgroundColor: '#ECFDF5', paddingHorizontal: 10, paddingVertical: 7,
        borderRadius: 10, borderWidth: 1, borderColor: '#A7F3D0',
    },
    editChipText: { fontSize: 12, fontWeight: '700', color: '#10B981' },

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
    footer: {
        flexDirection: 'row', alignItems: 'center',
        justifyContent: 'center', gap: 8, marginTop: 20,
    },
    footerDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB' },
    footerText: { fontSize: 12, color: '#9CA3AF', fontStyle: 'italic' },
});