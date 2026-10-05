import { TourTarget, TourScrollView } from '@/src/features/app-tour';
import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Switch, Linking } from 'react-native';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import { Ionicons, MaterialIcons, FontAwesome5 } from '@expo/vector-icons';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import StudentHeader from '../../src/components/StudentHeader';
import AccountSwitcherSheet from '../../src/components/AccountSwitcherSheet';
import { AvatarUploader, type AvatarUploaderHandle } from '../../src/components/AvatarUploader';
import { useAuth } from '../../src/hooks/useAuth';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { useTheme } from '../../src/hooks/useTheme';
import { ThemeColors } from '../../src/theme/themes';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
    SettingRow,
    SettingsGroup as Group,
} from '../../src/components/SettingsSection';

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

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Settings() {
    const { user, signOut } = useAuth();
    const router = useRouter();
    const { theme, isDark, toggleTheme } = useTheme();
    const { t, i18n } = useTranslation();
    const styles = React.useMemo(() => getStyles(theme.colors), [theme]);
    const [switcherOpen, setSwitcherOpen] = useState(false);
    const [birthdaySoundEnabled, setBirthdaySoundEnabled] = useState(true);
    const avatarUploaderRef = useRef<AvatarUploaderHandle>(null);

    React.useEffect(() => {
        AsyncStorage.getItem('birthday_celebration_sound_enabled').then((val) => {
            if (val === 'false') setBirthdaySoundEnabled(false);
        }).catch(() => {});
    }, []);

    const handleToggleBirthdaySound = async (val: boolean) => {
        setBirthdaySoundEnabled(val);
        await AsyncStorage.setItem('birthday_celebration_sound_enabled', val ? 'true' : 'false');
    };

    const handleLogout = async () => {
        await AsyncStorage.removeItem('student_auto_login');
        await signOut();
        router.replace('/welcome');
    };

    const chevron = <MaterialIcons name="chevron-right" size={18} color="#D1D5DB" />;

    return (
        <View style={styles.container}>
            <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.colors.background} />

            <TourTarget id="screen.screen-settings.overview"><StudentHeader
                title={t('settings.title', 'Settings')}
                showBackButton={true}
                showSettingsButton={false}
            /></TourTarget>

            <TourTarget id="screen.screen-settings.workspace" native><TourScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

                {/* ── Profile card ── */}
                <Animated.View entering={FadeInDown.delay(80).duration(600)} style={styles.profileCard}>
                    <View style={styles.blob1} />
                    <View style={styles.blob2} />

                    <View style={styles.profileTop}>
                        <Animated.View entering={ZoomIn.delay(200).duration(400)} style={styles.avatarWrap}>
                            <AvatarUploader
                                ref={avatarUploaderRef}
                                photoUrl={user?.photoUrl}
                                name={user?.displayName || 'Student Name'}
                                size={62}
                                borderRadius={18}
                                ringColor={theme.colors.border}
                                ringWidth={2}
                                accentColor="#10B981"
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
                            onPress={() => avatarUploaderRef.current?.open()}
                            activeOpacity={0.7}
                        >
                            <Ionicons name="camera" size={11} color="#10B981" />
                            <Text style={styles.editChipText}>{t('settings.edit_profile', 'Change Photo')}</Text>
                        </TouchableOpacity>
                    </View>
                </Animated.View>

                {/* ── Accounts ── */}
                <Group title={t('settings.accounts', 'Accounts')} delay={130} colors={theme.colors}>
                    <SettingRow
                        icon="people-circle"
                        iconColor="#2563EB" iconBg="#EFF6FF"
                        label={t('settings.switch_account', 'Switch account')}
                        sublabel={t('settings.switch_account_hint', 'Move between your linked school profiles')}
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
                        sublabel={
                            isDark
                                ? t('settings.dark_mode_on_hint', 'A softer low-light appearance is on')
                                : t('settings.dark_mode_hint', 'Use a softer appearance in low light')
                        }
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
                        sublabel={t('settings.language_hint', 'Switch the app between English and Telugu')}
                        rightElement={
                            <Switch
                                trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
                                thumbColor="#fff"
                                onValueChange={(val) => { i18n.changeLanguage(val ? 'te' : 'en').catch(console.error); }}
                                value={i18n.language === 'te'}
                            />
                        }
                    />

                    <SettingRow
                        icon="musical-notes"
                        iconColor="#EC4899" iconBg="#FDF2F8"
                        label={t('settings.birthday_sound', 'Birthday celebration sounds')}
                        sublabel={t('settings.birthday_sound_hint', 'Play a cheerful greeting sound on birthdays')}
                        isLast
                        rightElement={
                            <Switch
                                trackColor={{ false: theme.colors.border, true: '#F472B6' }}
                                thumbColor="#fff"
                                onValueChange={handleToggleBirthdaySound}
                                value={birthdaySoundEnabled}
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
                        sublabel={t('settings.change_password_hint', 'Update your login credentials securely')}
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
                        sublabel={t('settings.help_center_hint', 'Get help from our support team')}
                        onPress={() => Linking.openURL('https://api.whatsapp.com/send?phone=917892654731&text=Hey%2C%20I%20have%20a%20problem%20in%20the%20app')}
                        rightElement={chevron}
                    />
                    <SettingRow
                        icon="shield-checkmark"
                        iconColor="#06B6D4" iconBg="#ECFEFF"
                        label={t('settings.privacy_policy', 'Privacy Policy')}
                        sublabel={t('settings.privacy_policy_hint', 'Learn how your information is protected')}
                        onPress={() => Linking.openURL('https://schoolims.nexsyrus.com/privacy')}
                        rightElement={chevron}
                    />
                    <SettingRow
                        icon="megaphone-outline"
                        iconColor="#F59E0B" iconBg="#FEF3C7"
                        label={t('settings.why_ads', 'Why do we show ads')}
                        sublabel={t('settings.why_ads_hint', 'Understand our transparent advertising model')}
                        onPress={() => (router as any).push('/why-ads')}
                        rightElement={chevron}
                    />
                    <SettingRow
                        icon="logo-whatsapp"
                        iconColor="#25D366" iconBg="#F0FDF4"
                        label={t('settings.contact_us', 'Contact Us')}
                        sublabel={t('settings.contact_us_hint', 'Start a conversation on WhatsApp')}
                        onPress={() => Linking.openURL('https://api.whatsapp.com/send?phone=917892654731&text=Hi%20there...')}
                        rightElement={chevron}
                    />
                    <SettingRow
                        icon="code-slash"
                        iconColor="#8B5CF6" iconBg="#F5F3FF"
                        label={t('settings.dev_contact', 'Dev Contact')}
                        sublabel={t('settings.dev_contact_hint', 'Product and technical information')}
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

            </TourScrollView></TourTarget>

            <AccountSwitcherSheet visible={switcherOpen} onClose={() => setSwitcherOpen(false)} />
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const getStyles = (colors: ThemeColors) => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scroll: {
        width: '100%', maxWidth: 760, alignSelf: 'center',
        paddingHorizontal: 16, paddingTop: 18, paddingBottom: 80,
    },

    // Profile card
    profileCard: {
        backgroundColor: colors.card, borderRadius: 26, padding: 18,
        marginBottom: 28, overflow: 'hidden',
        borderWidth: 1, borderTopWidth: 3, borderColor: colors.border, borderTopColor: '#10B981',
        shadowColor: '#10B981', shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.11, shadowRadius: 18, elevation: 4,
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
    profileTop: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', rowGap: 12 },
    avatarWrap: { position: 'relative', marginRight: 14 },
    onlineDot: {
        position: 'absolute', bottom: 2, right: 2,
        width: 14, height: 14, borderRadius: 7,
        backgroundColor: '#10B981',
        borderWidth: 2, borderColor: colors.card,
    },
    profileMeta: { flex: 1, minWidth: 145 },
    profileName: {
        fontSize: 18, lineHeight: 23, fontWeight: '800',
        color: colors.textStrong, marginBottom: 7,
    },
    idBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 5,
        backgroundColor: '#ECFDF5', paddingHorizontal: 9, paddingVertical: 5,
        borderRadius: 9, alignSelf: 'flex-start',
    },
    idText: { fontSize: 11, fontWeight: '600', color: '#10B981' },
    editChip: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        backgroundColor: '#ECFDF5', paddingHorizontal: 12, paddingVertical: 8,
        borderRadius: 999, borderWidth: 1, borderColor: '#A7F3D0', marginLeft: 8,
    },
    editChipText: { fontSize: 12, fontWeight: '700', color: '#10B981' },

    // Logout
    logoutBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
        backgroundColor: '#FEF2F2', minHeight: 58, borderRadius: 20,
        marginTop: 2, borderWidth: 1, borderColor: '#FECACA',
        shadowColor: '#EF4444', shadowOffset: { width: 0, height: 5 },
        shadowOpacity: 0.08, shadowRadius: 12, elevation: 2,
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
