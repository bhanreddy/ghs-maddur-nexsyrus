import React from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    StatusBar, Switch, Linking, ActivityIndicator
} from 'react-native';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import { Ionicons, MaterialIcons, FontAwesome5 } from '@expo/vector-icons';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import AdminHeader from '../../src/components/AdminHeader';
import { AvatarUploader } from '../../src/components/AvatarUploader';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { useAuth } from '../../src/hooks/useAuth';
import { useFingerprintAuth } from '../../src/hooks/useFingerprintAuth';
import { useTheme } from '../../src/hooks/useTheme';
import { Theme } from '../../src/theme/themes';
import { useTranslation } from 'react-i18next';
import {
    SWITCH_ACCOUNT_SETTINGS,
    SettingsAccountSwitcherSheet,
    useSettingsAccountSwitcher,
} from '../../src/components/SettingsAccountSwitcher';
import {
    SettingRow,
    SettingsGroup as Group,
} from '../../src/components/SettingsSection';
import { SchoolSettingsService } from '../../src/services/schoolSettingsService';
import type { ResultRankingMethod } from '../../src/utils/assessmentGrading';

const RANKING_OPTIONS: {
    value: ResultRankingMethod;
    title: string;
    description: string;
    example: string;
    icon: keyof typeof Ionicons.glyphMap;
}[] = [
    {
        value: 'competition',
        title: 'Standard competition',
        description: 'Equal scores share a rank; occupied positions are skipped.',
        example: '1, 1, 1, 4',
        icon: 'podium-outline',
    },
    {
        value: 'attendance_tiebreak',
        title: 'Attendance tie-break',
        description: 'Equal scores are ordered by attendance percentage; exact ties still share a rank.',
        example: 'Marks → Attendance',
        icon: 'calendar-outline',
    },
    {
        value: 'dense',
        title: 'Consecutive ranks',
        description: 'Equal scores share a rank and the next distinct score gets the next rank.',
        example: '1, 1, 1, 2',
        icon: 'list-outline',
    },
];

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function AdminSettings() {
    const { theme, isDark, toggleTheme } = useTheme();
    const styles = React.useMemo(() => getStyles(theme, isDark), [theme, isDark]);
    const { t, i18n } = useTranslation();
    const router = useRouter();
    const { user, signOut } = useAuth();
    const fingerprint = useFingerprintAuth();
    const { switcherOpen, openSwitcher, closeSwitcher } = useSettingsAccountSwitcher();
    const [rankingMethod, setRankingMethod] = React.useState<ResultRankingMethod>('competition');
    const [rankingLoading, setRankingLoading] = React.useState(true);
    const [rankingSaving, setRankingSaving] = React.useState<ResultRankingMethod | null>(null);

    React.useEffect(() => {
        let active = true;
        SchoolSettingsService.getSettings()
            .then((settings) => {
                if (!active) return;
                const saved = settings.result_ranking_method;
                setRankingMethod(saved === 'attendance_tiebreak' || saved === 'dense' ? saved : 'competition');
            })
            .catch(() => {
                // The safe server default is standard competition ranking.
            })
            .finally(() => {
                if (active) setRankingLoading(false);
            });
        return () => { active = false; };
    }, []);

    const handleRankingMethodChange = async (next: ResultRankingMethod) => {
        if (rankingSaving || next === rankingMethod) return;
        const previous = rankingMethod;
        setRankingMethod(next);
        setRankingSaving(next);
        try {
            await SchoolSettingsService.updateSettings({ result_ranking_method: next });
        } catch {
            setRankingMethod(previous);
            alertCompat('Could not save ranking policy', 'Only an authorised administrator can change result ranking.');
        } finally {
            setRankingSaving(null);
        }
    };

    const handlePress = (item: string) =>
        alertCompat(item, 'This feature will be available in the next update.');

    const handleFingerprintToggle = async (next: boolean) => {
        const result = await fingerprint.setEnabled(next);
        if (!result.ok && next) {
            alertCompat(t('fingerprint.login'), result.error || t('fingerprint.failed'));
        }
    };

    const chevron = <MaterialIcons name="chevron-right" size={18} color="#D1D5DB" />;
    const redChevron = <MaterialIcons name="chevron-right" size={18} color="#EF4444" />;

    return (
        <View style={styles.container}>
            <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.colors.background} />
            <AdminHeader title="Settings" showBackButton={true} />

            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

                {/* ── Profile card ── */}
                <Animated.View entering={FadeInDown.delay(80).duration(600)} style={styles.profileCard}>
                    <View style={styles.blob1} />
                    <View style={styles.blob2} />

                    <View style={styles.profileTop}>
                        <Animated.View entering={ZoomIn.delay(200).duration(400)} style={styles.avatarWrap}>
                            <AvatarUploader
                                photoUrl={user?.photoUrl}
                                name={user?.displayName || 'Admin User'}
                                size={62}
                                borderRadius={18}
                                ringColor={theme.colors.border}
                                ringWidth={2}
                                accentColor="#7C3AED"
                            />
                            <View style={styles.onlineDot} />
                        </Animated.View>

                        <View style={styles.profileMeta}>
                            <View style={styles.nameRow}>
                                <Text style={styles.profileName}>
                                    {user?.displayName || 'Admin User'}
                                </Text>
                                <View style={styles.adminBadge}>
                                    <FontAwesome5 name="crown" size={8} color="#7C3AED" />
                                    <Text style={styles.adminBadgeText}>Admin</Text>
                                </View>
                            </View>
                            <View style={styles.idBadge}>
                                <FontAwesome5 name="id-badge" size={9} color="#7C3AED" />
                                <Text style={styles.idText} numberOfLines={1}>
                                    {user?.userId?.substring(0, 8).toUpperCase() || 'UNKNOWN'}
                                </Text>
                            </View>
                        </View>

                        <TouchableOpacity
                            style={styles.editChip}
                            onPress={() => handlePress('Edit Profile')}
                            activeOpacity={0.7}
                        >
                            <Ionicons name="pencil" size={11} color="#7C3AED" />
                            <Text style={styles.editChipText}>Edit</Text>
                        </TouchableOpacity>
                    </View>
                </Animated.View>

                {/* ── Accounts ── */}
                <Group title="Accounts" delay={130} theme={theme}>
                    <SettingRow
                        icon={SWITCH_ACCOUNT_SETTINGS.icon}
                        iconColor={SWITCH_ACCOUNT_SETTINGS.iconColor}
                        iconBg={SWITCH_ACCOUNT_SETTINGS.iconBg}
                        label={SWITCH_ACCOUNT_SETTINGS.label}
                        sublabel="Move between linked school profiles"
                        isLast
                        onPress={openSwitcher}
                        rightElement={chevron}
                    />
                </Group>

                {/* ── General ── */}
                <Group title="General" delay={170} theme={theme}>
                    <SettingRow
                        icon="moon" iconColor="#6366F1" iconBg="#EEF2FF"
                        label="Dark Mode"
                        sublabel={isDark ? 'A softer low-light appearance is on' : 'Use a softer appearance in low light'}
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
                        icon="language" iconColor="#3B82F6" iconBg="#EFF6FF"
                        label="Language (Telugu)"
                        sublabel="Switch the app between English and Telugu"
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

                {/* ── Result ranking policy ── */}
                <Group
                    title="Result Ranking"
                    subtitle="Admin-controlled policy used for class and report-card ranks"
                    delay={210}
                    theme={theme}
                >
                    <View style={styles.rankingOptions}>
                        {rankingLoading ? (
                            <View style={styles.rankingLoading}>
                                <ActivityIndicator color={theme.colors.primary} />
                                <Text style={styles.rankingLoadingText}>Loading ranking policy…</Text>
                            </View>
                        ) : RANKING_OPTIONS.map((option) => {
                            const selected = rankingMethod === option.value;
                            const saving = rankingSaving === option.value;
                            return (
                                <TouchableOpacity
                                    key={option.value}
                                    accessibilityRole="radio"
                                    accessibilityState={{ selected, disabled: Boolean(rankingSaving) }}
                                    activeOpacity={0.72}
                                    disabled={Boolean(rankingSaving)}
                                    onPress={() => handleRankingMethodChange(option.value)}
                                    style={[
                                        styles.rankingOption,
                                        selected && styles.rankingOptionSelected,
                                    ]}
                                >
                                    <View style={[
                                        styles.rankingIcon,
                                        selected && styles.rankingIconSelected,
                                    ]}>
                                        <Ionicons
                                            name={option.icon}
                                            size={19}
                                            color={selected ? '#FFFFFF' : '#7C3AED'}
                                        />
                                    </View>
                                    <View style={styles.rankingCopy}>
                                        <View style={styles.rankingTitleRow}>
                                            <Text style={[
                                                styles.rankingTitle,
                                                selected && styles.rankingTitleSelected,
                                            ]}>
                                                {option.title}
                                            </Text>
                                            <View style={styles.rankingExampleBadge}>
                                                <Text style={styles.rankingExampleText}>{option.example}</Text>
                                            </View>
                                        </View>
                                        <Text style={styles.rankingDescription}>{option.description}</Text>
                                    </View>
                                    {saving ? (
                                        <ActivityIndicator size="small" color="#7C3AED" />
                                    ) : (
                                        <Ionicons
                                            name={selected ? 'radio-button-on' : 'radio-button-off'}
                                            size={22}
                                            color={selected ? '#7C3AED' : '#CBD5E1'}
                                        />
                                    )}
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </Group>

                {/* ── Security ── */}
                <Group title="Security" delay={250} theme={theme}>
                    {/* Fingerprint Login is admin/staff (and principal) only.
                        Visibility is role + native platform; capability errors
                        surface when the user tries to enable. */}
                    {fingerprint.showRow && (
                        <SettingRow
                            icon="finger-print" iconColor="#0EA5E9" iconBg="#E0F2FE"
                            label={t('fingerprint.login')}
                            sublabel={fingerprint.enabled ? t('fingerprint.enabledSublabel') : t('fingerprint.disabledSublabel')}
                            rightElement={
                                <Switch
                                    trackColor={{ false: theme.colors.border, true: '#38BDF8' }}
                                    thumbColor="#fff"
                                    disabled={fingerprint.busy}
                                    onValueChange={handleFingerprintToggle}
                                    value={fingerprint.enabled}
                                />
                            }
                        />
                    )}
                    <SettingRow
                        icon="lock-closed" iconColor="#3B82F6" iconBg="#EFF6FF"
                        label="Change Password"
                        sublabel="Update your login credentials securely"
                        isLast
                        onPress={() => router.push('/change-password')}
                        rightElement={chevron}
                    />
                </Group>

                {/* ── Support ── */}
                <Group title="Support" delay={330} theme={theme}>
                    <SettingRow
                        icon="help-buoy" iconColor="#8B5CF6" iconBg="#F5F3FF"
                        label="Help Center"
                        sublabel="Get help from our support team"
                        onPress={() => Linking.openURL('https://api.whatsapp.com/send?phone=917892654731&text=Hey%2C%20I%20have%20a%20problem%20in%20the%20app')}
                        rightElement={chevron}
                    />
                    <SettingRow
                        icon="shield-checkmark" iconColor="#06B6D4" iconBg="#ECFEFF"
                        label="Privacy Policy"
                        sublabel="Learn how your information is protected"
                        onPress={() => Linking.openURL('https://schoolims.nexsyrus.com/privacy')}
                        rightElement={chevron}
                    />
                    <SettingRow
                        icon="megaphone-outline" iconColor="#F59E0B" iconBg="#FEF3C7"
                        label="Why do we show Ads"
                        sublabel="Understand our transparent advertising model"
                        onPress={() => (router as any).push('/why-ads')}
                        rightElement={chevron}
                    />
                    <SettingRow
                        icon="logo-whatsapp" iconColor="#25D366" iconBg="#F0FDF4"
                        label="Contact Us"
                        sublabel="Start a conversation on WhatsApp"
                        onPress={() => Linking.openURL('https://api.whatsapp.com/send?phone=917892654731&text=Hi%20there...')}
                        rightElement={chevron}
                    />
                    <SettingRow
                        icon="code-slash" iconColor="#8B5CF6" iconBg="#F5F3FF"
                        label="Dev Contact"
                        sublabel="Product and technical information"
                        isLast
                        onPress={() => Linking.openURL('https://bhanureddy.nexsyrus.com')}
                        rightElement={chevron}
                    />
                </Group>

                {/* ── Danger Zone ── */}
                <Group title="Danger Zone" delay={410} borderColor="#FECACA" theme={theme}>
                    <SettingRow
                        icon="trash-outline" iconColor="#EF4444" iconBg="#FEF2F2"
                        label="Delete Account"
                        sublabel="Permanently remove this account"
                        labelColor="#EF4444"
                        isLast
                        onPress={() =>
                            alertCompat(
                                'Delete Account',
                                'This action is permanent and cannot be undone. Are you sure you want to proceed?',
                                [
                                    { text: 'Cancel', style: 'cancel' },
                                    {
                                        text: 'Delete', style: 'destructive',
                                        onPress: () => Linking.openURL('https://example.com/delete-account'),
                                    },
                                ]
                            )
                        }
                        rightElement={redChevron}
                    />
                </Group>

                {/* ── Logout ── */}
                <Animated.View entering={FadeInDown.delay(470).duration(500)}>
                    <TouchableOpacity
                        style={styles.logoutBtn}
                        activeOpacity={0.8}
                        onPress={() =>
                            alertCompat('Logout', 'Are you sure?', [
                                { text: 'Cancel', style: 'cancel' },
                                {
                                    text: 'Logout', style: 'destructive',
                                    onPress: async () => {
                                        // Clear auto_login so login page won't auto re-login
                                        const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
                                        await AsyncStorage.removeItem('admin_auto_login');
                                        await signOut();
                                        router.replace('/welcome');
                                    }
                                }
                            ])
                        }
                    >
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

            <SettingsAccountSwitcherSheet visible={switcherOpen} onClose={closeSwitcher} />
        </View>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const getStyles = (theme: Theme, isDark: boolean) => StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    scroll: {
        width: '100%', maxWidth: 760, alignSelf: 'center',
        paddingHorizontal: 16, paddingTop: 18, paddingBottom: 80,
    },

    // Profile card — deep violet accent for Admin role
    profileCard: {
        backgroundColor: theme.colors.card, borderRadius: 26, padding: 18,
        marginBottom: 28, overflow: 'hidden',
        borderWidth: 1, borderTopWidth: 3, borderColor: theme.colors.border, borderTopColor: '#7C3AED',
        shadowColor: '#7C3AED', shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.11, shadowRadius: 18, elevation: 4,
    },
    blob1: {
        position: 'absolute', top: -40, right: -30,
        width: 130, height: 130, borderRadius: 65,
        backgroundColor: '#7C3AED', opacity: 0.07,
    },
    blob2: {
        position: 'absolute', bottom: -25, left: -20,
        width: 100, height: 100, borderRadius: 50,
        backgroundColor: '#6366F1', opacity: 0.05,
    },
    profileTop: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', rowGap: 12 },
    avatarWrap: { position: 'relative', marginRight: 14 },
    avatar: {
        width: 62, height: 62, borderRadius: 18,
        borderWidth: 2, borderColor: theme.colors.border,
    },
    onlineDot: {
        position: 'absolute', bottom: 2, right: 2,
        width: 14, height: 14, borderRadius: 7,
        backgroundColor: '#10B981',
        borderWidth: 2, borderColor: theme.colors.card,
    },
    profileMeta: { flex: 1, minWidth: 145 },
    nameRow: {
        flexDirection: 'row', alignItems: 'center',
        gap: 8, marginBottom: 6, flexWrap: 'wrap',
    },
    profileName: { fontSize: 18, lineHeight: 23, fontWeight: '800', color: theme.colors.textStrong },
    adminBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        backgroundColor: '#EDE9FE', paddingHorizontal: 7, paddingVertical: 3,
        borderRadius: 6,
    },
    adminBadgeText: { fontSize: 10, fontWeight: '700', color: '#7C3AED' },
    idBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 5,
        backgroundColor: '#EDE9FE', paddingHorizontal: 8, paddingVertical: 4,
        borderRadius: 9, alignSelf: 'flex-start',
    },
    idText: { fontSize: 11, fontWeight: '600', color: '#7C3AED' },
    editChip: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        backgroundColor: '#EDE9FE', paddingHorizontal: 12, paddingVertical: 8,
        borderRadius: 999, borderWidth: 1, borderColor: '#DDD6FE', marginLeft: 8,
    },
    editChipText: { fontSize: 12, fontWeight: '700', color: '#7C3AED' },

    rankingOptions: { padding: 10, gap: 8 },
    rankingLoading: {
        minHeight: 96, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    },
    rankingLoadingText: { color: theme.colors.textSecondary, fontSize: 13, fontWeight: '600' },
    rankingOption: {
        minHeight: 84, borderRadius: 17, borderWidth: 1.5,
        borderColor: theme.colors.border, padding: 12,
        flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: isDark ? 'rgba(255,255,255,0.025)' : '#F8FAFC',
    },
    rankingOptionSelected: {
        borderColor: '#8B5CF6',
        backgroundColor: isDark ? 'rgba(124,58,237,0.14)' : '#F5F3FF',
    },
    rankingIcon: {
        width: 40, height: 40, borderRadius: 13,
        backgroundColor: isDark ? 'rgba(124,58,237,0.18)' : '#EDE9FE',
        alignItems: 'center', justifyContent: 'center',
    },
    rankingIconSelected: { backgroundColor: '#7C3AED' },
    rankingCopy: { flex: 1, minWidth: 0 },
    rankingTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' },
    rankingTitle: { color: theme.colors.textStrong, fontSize: 14, fontWeight: '800' },
    rankingTitleSelected: { color: isDark ? '#DDD6FE' : '#5B21B6' },
    rankingExampleBadge: {
        borderRadius: 8, backgroundColor: isDark ? 'rgba(139,92,246,0.18)' : '#EDE9FE',
        paddingHorizontal: 7, paddingVertical: 3,
    },
    rankingExampleText: { color: '#7C3AED', fontSize: 10, fontWeight: '900' },
    rankingDescription: {
        color: theme.colors.textSecondary, fontSize: 11.5, lineHeight: 16, marginTop: 5,
    },

    // Logout
    logoutBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
        backgroundColor: isDark ? 'rgba(239,68,68,0.15)' : '#FEF2F2',
        minHeight: 58, borderRadius: 20,
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
