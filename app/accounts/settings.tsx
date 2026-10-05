import { TourTarget, TourScrollView } from '@/src/features/app-tour';
import React from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  StatusBar, Switch, Linking
} from
  'react-native';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import { Ionicons, MaterialIcons, FontAwesome5 } from '@expo/vector-icons';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import AdminHeader from '../../src/components/AdminHeader';
import { AvatarUploader } from '../../src/components/AvatarUploader';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { useAuth } from '../../src/hooks/useAuth';
import { useTheme } from '../../src/hooks/useTheme';
import { useAccountsWebChrome } from '../../src/contexts/AccountsWebChromeContext';
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

/** Returns the first human-readable ID (not a UUID) from the user object */
function getHumanId(user: any): string {
  const candidates = [user?.staff_code, user?.admission_no];
  for (const c of candidates) {
    if (c && typeof c === 'string' && c.trim().length > 0) return c;
  }
  return 'N/A';
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function AccountsSettings() {
  const { theme, isDark, toggleTheme } = useTheme();
  const { shellActive } = useAccountsWebChrome();
  const styles = React.useMemo(() => getStyles(theme, isDark), [theme, isDark]);
  const { i18n } = useTranslation();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { switcherOpen, openSwitcher, closeSwitcher } = useSettingsAccountSwitcher();

  const handlePress = (item: string) =>
    alertCompat(item, 'This feature will be available in the next update.');

  const chevron = <MaterialIcons name="chevron-right" size={18} color="#D1D5DB" />;
  const redChevron = <MaterialIcons name="chevron-right" size={18} color="#EF4444" />;

  return (
    <TourTarget id="screen.accounts-settings.overview" native><View style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.colors.background} />
      {!shellActive && <AdminHeader title="Settings" showBackButton={true} />}

      <TourTarget id="screen.accounts-settings.workspace" native><TourScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Profile card ── */}
        <Animated.View entering={FadeInDown.delay(80).duration(600)} style={styles.profileCard}>
          <View style={styles.blob1} />
          <View style={styles.blob2} />

          <View style={styles.profileTop}>
            <Animated.View entering={ZoomIn.delay(200).duration(400)} style={styles.avatarWrap}>
              <AvatarUploader
                photoUrl={user?.photoUrl}
                name={user?.displayName || 'Accountant'}
                size={62}
                borderRadius={18}
                ringColor={theme.colors.border}
                ringWidth={2}
                accentColor="#F59E0B"
              />

              <View style={styles.onlineDot} />
            </Animated.View>

            <View style={styles.profileMeta}>
              <Text style={styles.profileName}>
                {user?.displayName || 'Accountant'}
              </Text>
              <View style={styles.idBadge}>
                <FontAwesome5 name="id-badge" size={9} color="#F59E0B" />
                <Text style={styles.idText}>
                  {getHumanId(user)}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.editChip}
              onPress={() => handlePress('Edit Profile')}
              activeOpacity={0.7}>

              <Ionicons name="pencil" size={11} color="#F59E0B" />
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
            rightElement={chevron} />

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
                onValueChange={() => toggleTheme()}
                value={isDark} />

            } />

          <SettingRow
            icon="language" iconColor="#3B82F6" iconBg="#EFF6FF"
            label="Language (Telugu)"
            sublabel="Switch the app between English and Telugu"
            isLast
            rightElement={
              <Switch
                trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
                thumbColor="#fff"
                onValueChange={(val) => { i18n.changeLanguage(val ? 'te' : 'en'); }}
                value={i18n.language === 'te'} />

            } />

        </Group>

        {/* ── Security ── */}
        <Group title="Security" delay={250} theme={theme}>
          <SettingRow
            icon="lock-closed" iconColor="#3B82F6" iconBg="#EFF6FF"
            label="Change Password"
            sublabel="Update your login credentials securely"
            isLast
            onPress={() => router.push('/change-password')}
            rightElement={chevron} />

        </Group>

        {/* ── Support ── */}
        <Group title="Support" delay={330} theme={theme}>
          <SettingRow
            icon="help-buoy" iconColor="#8B5CF6" iconBg="#F5F3FF"
            label="Help Center"
            sublabel="Get help from our support team"
            onPress={() => Linking.openURL('https://api.whatsapp.com/send?phone=917892654731&text=Hey%2C%20I%20have%20a%20problem%20in%20the%20app')}
            rightElement={chevron} />

          <SettingRow
            icon="shield-checkmark" iconColor="#06B6D4" iconBg="#ECFEFF"
            label="Privacy Policy"
            sublabel="Learn how your information is protected"
            onPress={() => Linking.openURL('https://schoolims.nexsyrus.com/privacy')}
            rightElement={chevron} />

          <SettingRow
            icon="megaphone-outline" iconColor="#F59E0B" iconBg="#FEF3C7"
            label="Why do we show Ads"
            sublabel="Understand our transparent advertising model"
            onPress={() => (router as any).push('/why-ads')}
            rightElement={chevron} />

          <SettingRow
            icon="logo-whatsapp" iconColor="#25D366" iconBg="#F0FDF4"
            label="Contact Us"
            sublabel="Start a conversation on WhatsApp"
            onPress={() => Linking.openURL('https://api.whatsapp.com/send?phone=917892654731&text=Hi%20there...')}
            rightElement={chevron} />

          <SettingRow
            icon="code-slash" iconColor="#8B5CF6" iconBg="#F5F3FF"
            label="Dev Contact"
            sublabel="Product and technical information"
            isLast
            onPress={() => Linking.openURL('https://bhanureddy.nexsyrus.com')}
            rightElement={chevron} />

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
                'This is permanent and cannot be undone. Continue?',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: () => Linking.openURL('https://example.com/delete-account') }]

              )
            }
            rightElement={redChevron} />

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
                  text: 'Logout', style: 'destructive', onPress: async () => {
                    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
                    await AsyncStorage.removeItem('accounts_auto_login');
                    await signOut();
                    router.replace('/welcome');
                  }
                }]
              )
            }>

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

      </TourScrollView></TourTarget>

      <SettingsAccountSwitcherSheet visible={switcherOpen} onClose={closeSwitcher} />
    </View></TourTarget>);

}

// ─── Styles ───────────────────────────────────────────────────────────────────

const getStyles = (theme: Theme, isDark: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  scroll: {
    width: '100%', maxWidth: 760, alignSelf: 'center',
    paddingHorizontal: 16, paddingTop: 18, paddingBottom: 80
  },

  // Profile card — amber accent for Accounts role
  profileCard: {
    backgroundColor: theme.colors.card, borderRadius: 26, padding: 18,
    marginBottom: 28, overflow: 'hidden',
    borderWidth: 1, borderTopWidth: 3, borderColor: theme.colors.border, borderTopColor: '#F59E0B',
    shadowColor: '#F59E0B', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.11, shadowRadius: 18, elevation: 4
  },
  blob1: {
    position: 'absolute', top: -40, right: -30,
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: '#F59E0B', opacity: 0.07
  },
  blob2: {
    position: 'absolute', bottom: -20, left: -20,
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: '#EF4444', opacity: 0.05
  },
  profileTop: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', rowGap: 12 },
  avatarWrap: { position: 'relative', marginRight: 14 },
  avatar: {
    width: 62, height: 62, borderRadius: 18,
    borderWidth: 2, borderColor: theme.colors.border
  },
  onlineDot: {
    position: 'absolute', bottom: 2, right: 2,
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: '#10B981',
    borderWidth: 2, borderColor: theme.colors.card
  },
  profileMeta: { flex: 1, minWidth: 145 },
  profileName: { fontSize: 18, lineHeight: 23, fontWeight: '800', color: theme.colors.textStrong, marginBottom: 7 },
  idBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#FEF3C7', paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 9, alignSelf: 'flex-start'
  },
  idText: { fontSize: 11, fontWeight: '600', color: '#D97706' },
  editChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#FEF3C7', paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 999, borderWidth: 1, borderColor: '#FDE68A', marginLeft: 8
  },
  editChipText: { fontSize: 12, fontWeight: '700', color: '#F59E0B' },

  // Logout
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: isDark ? 'rgba(239,68,68,0.15)' : '#FEF2F2',
    minHeight: 58, borderRadius: 20,
    marginTop: 2, borderWidth: 1, borderColor: '#FECACA',
    shadowColor: '#EF4444', shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.08, shadowRadius: 12, elevation: 2
  },
  logoutIconWrap: {
    width: 30, height: 30, borderRadius: 9,
    backgroundColor: '#FFE4E6', justifyContent: 'center', alignItems: 'center'
  },
  logoutText: { fontSize: 15, fontWeight: '700', color: '#EF4444' },

  // Footer
  footer: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 8, marginTop: 20
  },
  footerDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB' },
  footerText: { fontSize: 12, color: '#9CA3AF', fontStyle: 'italic' }
});
