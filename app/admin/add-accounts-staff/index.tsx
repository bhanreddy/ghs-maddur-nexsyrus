import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import AppTextInput from '@/src/components/AppTextInput';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import AdminHeader from '../../../src/components/AdminHeader';
import { AdminService, AccountsPortalStaffMember } from '../../../src/services/adminService';
import { useAuth } from '../../../src/hooks/useAuth';
import { useTheme } from '../../../src/hooks/useTheme';
import { Theme } from '../../../src/theme/themes';
import { alertCompat } from '../../../src/utils/crossPlatformAlert';
import { personListDisplayName } from '../../../src/utils/displayHelpers';
import { APIError } from '../../../src/services/apiClient';

export default function AccountsPortalStaffScreen() {
  const { theme, isDark } = useTheme();
  const styles = useMemo(() => getStyles(theme, isDark), [theme, isDark]);
  const router = useRouter();
  const { authChecked, session } = useAuth();

  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState<AccountsPortalStaffMember[]>([]);
  const [search, setSearch] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [creationEnabled, setCreationEnabled] = useState(true);
  const [savingCreationSetting, setSavingCreationSetting] = useState(false);

  const loadStaff = useCallback(async () => {
    setLoading(true);
    try {
      const [rows, creationSetting] = await Promise.all([
        AdminService.getAccountsPortalStaff(),
        AdminService.getAccountsStaffCreationSetting(),
      ]);
      setStaff(rows);
      setCreationEnabled(creationSetting.enabled);
    } catch (err: any) {
      console.error('Failed to load accounts portal staff:', err);
      alertCompat('Error', err?.message || 'Failed to load staff list');
      setStaff([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!authChecked || !session) return;
      loadStaff();
    }, [authChecked, session, loadStaff]),
  );

  const filteredStaff = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return staff;
    return staff.filter((row) => {
      const name = personListDisplayName(row as Record<string, unknown>).toLowerCase();
      const code = String(row.staff_code || '').toLowerCase();
      const email = String(row.email || '').toLowerCase();
      const designation = String(row.designation || '').toLowerCase();
      return name.includes(q) || code.includes(q) || email.includes(q) || designation.includes(q);
    });
  }, [staff, search]);

  const enabledCount = useMemo(
    () => staff.filter((row) => row.has_accounts_access || row.is_elevated).length,
    [staff],
  );

  const handleToggle = async (row: AccountsPortalStaffMember, nextValue: boolean) => {
    if (row.is_elevated) return;

    if (nextValue && !row.has_login) {
      alertCompat(
        'Login Required',
        'This staff member does not have login credentials yet. Create a new accounts staff account first.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Create Account', onPress: () => router.push('/admin/add-accounts-staff/create') },
        ],
      );
      return;
    }

    setSavingId(row.staff_id);
    try {
      await AdminService.setAccountsPortalAccess(row.staff_id, nextValue);
      setStaff((prev) =>
        prev.map((item) =>
          item.staff_id === row.staff_id
            ? { ...item, has_accounts_access: nextValue }
            : item,
        ),
      );
    } catch (err) {
      const message = err instanceof APIError ? err.message : 'Failed to update accounts portal access';
      alertCompat('Error', message);
    } finally {
      setSavingId(null);
    }
  };

  const handleCreationSettingToggle = async (nextValue: boolean) => {
    const previousValue = creationEnabled;
    setCreationEnabled(nextValue);
    setSavingCreationSetting(true);

    try {
      const result = await AdminService.setAccountsStaffCreationEnabled(nextValue);
      setCreationEnabled(result.enabled);
    } catch (err) {
      setCreationEnabled(previousValue);
      const message = err instanceof APIError ? err.message : 'Failed to update accounts creation setting';
      alertCompat('Error', message);
    } finally {
      setSavingCreationSetting(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" color="#F59E0B" />
        <Text style={[styles.loadingText, { color: theme.colors.textSecondary }]}>Loading staff...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.colors.background} />
      <AdminHeader title="Accounts Portal Access" showBackButton />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.duration(400)} style={styles.introCard}>
          <View style={styles.introTop}>
            <View style={styles.infoIconBox}>
              <Ionicons name="wallet-outline" size={24} color="#F59E0B" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.introTitle, { color: theme.colors.text }]}>Manage Portal Access</Text>
              <Text style={[styles.introDesc, { color: theme.colors.textSecondary }]}>
                Toggle staff on to grant accounts portal login. Toggle off to remove access and restore staff portal role.
              </Text>
            </View>
          </View>
          <View style={[styles.countPill, { backgroundColor: isDark ? 'rgba(245,158,11,0.15)' : '#FFFBEB' }]}>
            <Text style={styles.countText}>{enabledCount} with access</Text>
          </View>
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(50).duration(425)}
          style={[styles.featureCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
        >
          <View style={styles.featureTop}>
            <View style={[styles.featureIconBox, { backgroundColor: creationEnabled ? '#ECFDF5' : '#FEF2F2' }]}>
              <Ionicons
                name={creationEnabled ? 'person-add-outline' : 'lock-closed-outline'}
                size={22}
                color={creationEnabled ? '#059669' : '#DC2626'}
              />
            </View>
            <View style={styles.rowBody}>
              <Text style={[styles.featureTitle, { color: theme.colors.text }]}>Accountant Create Access</Text>
              <Text style={[styles.featureDesc, { color: theme.colors.textSecondary }]}>
                Allow accounts users to directly add staff, admin, and driver accounts.
              </Text>
              <Text style={[styles.featureStatusText, { color: creationEnabled ? '#059669' : '#DC2626' }]}>
                {creationEnabled ? 'Enabled for accounts team' : 'Disabled for accounts team'}
              </Text>
            </View>
            {savingCreationSetting ? (
              <ActivityIndicator size="small" color="#F59E0B" />
            ) : (
              <Switch
                trackColor={{ false: '#FCA5A5', true: '#86EFAC' }}
                thumbColor={creationEnabled ? '#059669' : '#DC2626'}
                value={creationEnabled}
                onValueChange={handleCreationSettingToggle}
              />
            )}
          </View>
        </Animated.View>

        <View style={[styles.searchBar, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
          <Ionicons name="search" size={18} color={theme.colors.textSecondary} />
          <AppTextInput
            style={[styles.searchInput, { color: theme.colors.text }]}
            placeholder="Search staff..."
            placeholderTextColor={theme.colors.textSecondary}
            value={search}
            onChangeText={setSearch}
          />
        </View>

        <Animated.View
          entering={FadeInDown.delay(100).duration(450)}
          style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
        >
          {filteredStaff.length === 0 ? (
            <Text style={[styles.emptyText, { color: theme.colors.textSecondary }]}>
              {search.trim() ? 'No matching staff found.' : 'No staff members found.'}
            </Text>
          ) : (
            filteredStaff.map((row, index) => {
              const isLast = index === filteredStaff.length - 1;
              const name = personListDisplayName(row as Record<string, unknown>);
              const subtitle = [row.designation, row.staff_code].filter(Boolean).join(' · ');
              const isEnabled = row.has_accounts_access || row.is_elevated;
              const isSaving = savingId === row.staff_id;
              const canToggle = !row.is_elevated && row.has_login;

              return (
                <React.Fragment key={row.staff_id}>
                  <View style={styles.row}>
                    <View style={[styles.avatar, { backgroundColor: isDark ? '#1E293B' : '#FEF3C7' }]}>
                      <Text style={[styles.avatarText, { color: isDark ? '#FCD34D' : '#B45309' }]}>
                        {(name.trim()[0] || 'S').toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.rowBody}>
                      <Text style={[styles.name, { color: theme.colors.text }]} numberOfLines={1}>
                        {name}
                      </Text>
                      <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                        {subtitle || row.email || 'No designation'}
                      </Text>
                      {row.is_elevated ? (
                        <Text style={styles.metaTag}>Admin / Principal access</Text>
                      ) : !row.has_login ? (
                        <Text style={styles.metaWarning}>No login — create account first</Text>
                      ) : null}
                    </View>
                    {isSaving ? (
                      <ActivityIndicator size="small" color="#F59E0B" />
                    ) : (
                      <Switch
                        trackColor={{ false: theme.colors.border, true: '#FCD34D' }}
                        thumbColor={isEnabled ? '#F59E0B' : '#fff'}
                        value={isEnabled}
                        disabled={!canToggle}
                        onValueChange={(value) => handleToggle(row, value)}
                      />
                    )}
                  </View>
                  {!isLast && <View style={[styles.divider, { backgroundColor: theme.colors.borderLight }]} />}
                </React.Fragment>
              );
            })
          )}
        </Animated.View>

        <TouchableOpacity
          style={styles.createBtn}
          activeOpacity={0.85}
          onPress={() => router.push('/admin/add-accounts-staff/create')}
        >
          <Ionicons name="person-add-outline" size={18} color="#fff" />
          <Text style={styles.createBtnText}>Create New Accounts Staff</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const getStyles = (theme: Theme, isDark: boolean) =>
  StyleSheet.create({
    container: { flex: 1 },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
    loadingText: { fontSize: 14, fontWeight: '500' },
    scroll: { padding: 20, paddingBottom: 60 },
    introCard: {
      borderRadius: 22,
      padding: 20,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: 'rgba(245, 158, 11, 0.2)',
      backgroundColor: isDark ? '#1C1917' : '#FFFBEB',
    },
    introTop: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12 },
    infoIconBox: {
      width: 48,
      height: 48,
      borderRadius: 16,
      backgroundColor: isDark ? 'rgba(245,158,11,0.15)' : '#FEF3C7',
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: 'rgba(245,158,11,0.25)',
    },
    introTitle: { fontSize: 17, fontWeight: '800', marginBottom: 4 },
    introDesc: { fontSize: 12, lineHeight: 18 },
    countPill: {
      alignSelf: 'flex-start',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
    },
    countText: { fontSize: 11, fontWeight: '800', color: '#B45309', letterSpacing: 0.4 },
    featureCard: {
      borderRadius: 18,
      borderWidth: 1,
      padding: 16,
      marginBottom: 16,
    },
    featureTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    featureIconBox: {
      width: 44,
      height: 44,
      borderRadius: 14,
      justifyContent: 'center',
      alignItems: 'center',
    },
    featureTitle: { fontSize: 15, fontWeight: '800', marginBottom: 3 },
    featureDesc: { fontSize: 12, lineHeight: 17 },
    featureStatusText: { fontSize: 11, fontWeight: '800', marginTop: 6, letterSpacing: 0.2 },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderWidth: 1,
      borderRadius: 14,
      paddingHorizontal: 14,
      height: 48,
      marginBottom: 16,
    },
    searchInput: { flex: 1, fontSize: 15, paddingVertical: 0 },
    card: {
      borderRadius: 18,
      overflow: 'hidden',
      borderWidth: 1,
      marginBottom: 20,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 14,
      paddingHorizontal: 16,
      gap: 12,
    },
    avatar: {
      width: 42,
      height: 42,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: { fontSize: 16, fontWeight: '800' },
    rowBody: { flex: 1, minWidth: 0 },
    name: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
    subtitle: { fontSize: 12, fontWeight: '500' },
    metaTag: { fontSize: 10, fontWeight: '700', color: '#6366F1', marginTop: 4, letterSpacing: 0.3 },
    metaWarning: { fontSize: 10, fontWeight: '700', color: '#EF4444', marginTop: 4, letterSpacing: 0.3 },
    divider: { height: StyleSheet.hairlineWidth, marginLeft: 70 },
    emptyText: { textAlign: 'center', padding: 28, fontSize: 14 },
    createBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: '#F59E0B',
      paddingVertical: 15,
      borderRadius: 16,
      shadowColor: '#F59E0B',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 8,
      elevation: 6,
    },
    createBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  });
