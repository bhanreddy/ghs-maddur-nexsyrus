import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  StatusBar, Switch, Linking
} from
  'react-native';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import { Ionicons, MaterialIcons, FontAwesome5 } from '@expo/vector-icons';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import AdminHeader from '../../src/components/AdminHeader';
import AvatarUploader from '../../src/components/AvatarUploader';
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

/** Returns the first human-readable ID (not a UUID) from the user object */
function getHumanId(user: any): string {
  const candidates = [user?.staff_code, user?.admission_no];
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
    </>);

}

const RS = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 13, paddingHorizontal: 16
  },
  iconBox: {
    width: 38, height: 38, borderRadius: 11,
    justifyContent: 'center', alignItems: 'center', marginRight: 13
  },
  label: { flex: 1, fontSize: 15, fontWeight: '500' },
  right: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  divider: {
    height: StyleSheet.hairlineWidth, marginLeft: 67
  }
});

// ─── Group ────────────────────────────────────────────────────────────────────

interface GroupProps {
  title: string;
  delay: number;
  borderColor?: string;
  children: React.ReactNode;
  theme: Theme;
}

function Group({ title, delay, borderColor, children, theme }: GroupProps) {
  return (
    <Animated.View entering={FadeInDown.delay(delay).duration(480)} style={GS.container}>
      <Text style={GS.title}>{title}</Text>
      <View style={[
        GS.card, { backgroundColor: theme.colors.card },
        borderColor ?
          { borderColor, borderWidth: 1 } :
          { borderWidth: 1, borderColor: theme.colors.border }]
      }>
        {children}
      </View>
    </Animated.View>);

}

const GS = StyleSheet.create({
  container: { marginBottom: 22 },
  title: {
    fontSize: 10, fontWeight: '700', letterSpacing: 1.5,
    color: '#9CA3AF', marginBottom: 9, marginLeft: 4,
    textTransform: 'uppercase'
  },
  card: {
    borderRadius: 18, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 6, elevation: 1
  }
});

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function AccountsSettings() {
  const { theme, isDark, toggleTheme } = useTheme();
  const { shellActive } = useAccountsWebChrome();
  const styles = React.useMemo(() => getStyles(theme, isDark), [theme, isDark]);
  const { i18n } = useTranslation();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [updating, setUpdating] = useState(false);
  const { switcherOpen, openSwitcher, closeSwitcher } = useSettingsAccountSwitcher();

  const handlePress = (item: string) =>
    alertCompat(item, 'This feature will be available in the next update.');

  const chevron = <MaterialIcons name="chevron-right" size={18} color="#D1D5DB" />;
  const redChevron = <MaterialIcons name="chevron-right" size={18} color="#EF4444" />;

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.colors.background} />
      {!shellActive && <AdminHeader title="Settings" showBackButton={true} />}

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

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
            isLast
            onPress={openSwitcher}
            rightElement={chevron} />

        </Group>

        {/* ── General ── */}
        <Group title="General" delay={170} theme={theme}>
          <SettingRow
            icon="moon" iconColor="#6366F1" iconBg="#EEF2FF"
            label="Dark Mode"
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
            isLast
            onPress={() => router.push('/change-password')}
            rightElement={chevron} />

        </Group>

        {/* ── Support ── */}
        <Group title="Support" delay={330} theme={theme}>
          <SettingRow
            icon="help-buoy" iconColor="#8B5CF6" iconBg="#F5F3FF"
            label="Help Center"
            onPress={() => Linking.openURL('https://api.whatsapp.com/send?phone=917892654731&text=Hey%2C%20I%20have%20a%20problem%20in%20the%20app')}
            rightElement={chevron} />

          <SettingRow
            icon="shield-checkmark" iconColor="#06B6D4" iconBg="#ECFEFF"
            label="Privacy Policy"
            onPress={() => Linking.openURL('https://schoolims.nexsyrus.com/privacy')}
            rightElement={chevron} />

          <SettingRow
            icon="megaphone-outline" iconColor="#F59E0B" iconBg="#FEF3C7"
            label="Why do we show Ads"
            onPress={() => (router as any).push('/why-ads')}
            rightElement={chevron} />

          <SettingRow
            icon="logo-whatsapp" iconColor="#25D366" iconBg="#F0FDF4"
            label="Contact Us"
            onPress={() => Linking.openURL('https://api.whatsapp.com/send?phone=917892654731&text=Hi%20there...')}
            rightElement={chevron} />

          <SettingRow
            icon="code-slash" iconColor="#8B5CF6" iconBg="#F5F3FF"
            label="Dev Contact"
            isLast
            onPress={() => Linking.openURL('https://bhanureddy.nexsyrus.com')}
            rightElement={chevron} />

        </Group>

        {/* ── Danger Zone ── */}
        <Group title="Danger Zone" delay={410} borderColor="#FECACA" theme={theme}>
          <SettingRow
            icon="trash-outline" iconColor="#EF4444" iconBg="#FEF2F2"
            label="Delete Account"
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

      </ScrollView>

      <SettingsAccountSwitcherSheet visible={switcherOpen} onClose={closeSwitcher} />
    </View>);

}

// ─── Styles ───────────────────────────────────────────────────────────────────

const getStyles = (theme: Theme, isDark: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  scroll: { padding: 20, paddingBottom: 60 },

  // Profile card — amber accent for Accounts role
  profileCard: {
    backgroundColor: theme.colors.card, borderRadius: 22, padding: 20,
    marginBottom: 26, overflow: 'hidden',
    borderWidth: 1, borderColor: theme.colors.border,
    shadowColor: '#F59E0B', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 12, elevation: 3
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
  profileTop: { flexDirection: 'row', alignItems: 'center' },
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
  profileMeta: { flex: 1 },
  profileName: { fontSize: 17, fontWeight: '800', color: theme.colors.text, marginBottom: 6 },
  idBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#FEF3C7', paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 6, alignSelf: 'flex-start'
  },
  idText: { fontSize: 11, fontWeight: '600', color: '#D97706' },
  editChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#FEF3C7', paddingHorizontal: 10, paddingVertical: 7,
    borderRadius: 10, borderWidth: 1, borderColor: '#FDE68A'
  },
  editChipText: { fontSize: 12, fontWeight: '700', color: '#F59E0B' },

  // Logout
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: isDark ? 'rgba(239,68,68,0.15)' : '#FEF2F2',
    paddingVertical: 15, borderRadius: 16,
    marginTop: 4, borderWidth: 1, borderColor: '#FECACA'
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