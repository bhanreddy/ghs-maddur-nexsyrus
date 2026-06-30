import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
  Image,
  ActivityIndicator,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { alertCompat } from '../utils/crossPlatformAlert';
import * as accountVault from '../services/accountVault';
import type { VaultAccount } from '../services/accountVault';
import {
  getUnreadCountsForAllVaultedAccounts,
  removeVaultedAccount,
} from '../services/pushFanout';

const FALLBACK_AVATAR = 'https://cdn-icons-png.flaticon.com/512/2922/2922506.png';

interface Props {
  visible: boolean;
  onClose: () => void;
}

/**
 * AccountSwitcherSheet — Phase 4b: the Instagram-style multi-account switcher.
 *
 * Lists every vaulted account with avatar + name + unread badge, a checkmark on
 * the active one, tap-to-switch (no password), an inline "Add account" form, and
 * per-account remove. Heavy lifting lives in earlier phases:
 *   - switch        → useAuth.switchAccount (Phase 2, seamless, no prompt)
 *   - add           → useAuth.addAccount (Phase 1/2) then switchAccount to it
 *   - remove active → useAuth.signOut (Phase 3a: unregister + vault remove)
 *   - remove other  → pushFanout.removeVaultedAccount (Phase 3b)
 *   - badges        → pushFanout.getUnreadCountsForAllVaultedAccounts (Phase 4a)
 */
export default function AccountSwitcherSheet({ visible, onClose }: Props) {
  const { switchAccount, addAccount, signOut } = useAuth();
  const { theme, isDark } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  const [accounts, setAccounts] = useState<VaultAccount[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [addMode, setAddMode] = useState(false);
  const [addEmail, setAddEmail] = useState('');
  const [addPassword, setAddPassword] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [addBusy, setAddBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [accs, active] = await Promise.all([
        accountVault.listAccounts(),
        accountVault.getActiveAccountId(),
      ]);
      setAccounts(accs);
      setActiveId(active);
    } catch {
      /* vault read failures shouldn't crash the sheet */
    } finally {
      setLoading(false);
    }
    getUnreadCountsForAllVaultedAccounts()
      .then(setCounts)
      .catch(() => { /* badges simply don't show */ });
  }, []);

  useEffect(() => {
    if (visible) {
      setAddMode(false);
      setAddEmail('');
      setAddPassword('');
      setAddError(null);
      load();
    }
  }, [visible, load]);

  const onSwitch = async (userId: string) => {
    if (busyId) return;
    if (userId === activeId) {
      onClose();
      return;
    }
    setBusyId(userId);
    try {
      const res = await switchAccount(userId);
      if (res?.error) {
        alertCompat('Could not switch', res.error);
        return;
      }
      onClose();
    } finally {
      setBusyId(null);
    }
  };

  const onAdd = async () => {
    if (addBusy) return;
    if (!addEmail.trim() || !addPassword) {
      setAddError('Enter both email and password.');
      return;
    }
    setAddBusy(true);
    setAddError(null);
    try {
      const res = await addAccount(addEmail.trim(), addPassword);
      if (res?.error) {
        setAddError(res.error);
        return;
      }
      if (res?.session) {
        await switchAccount(res.session.validatedUser.userId);
        onClose();
      }
    } catch (e: any) {
      setAddError(e?.message || 'Could not add this account.');
    } finally {
      setAddBusy(false);
    }
  };

  const onRemove = (acct: VaultAccount) => {
    if (busyId) return;
    const isActive = acct.userId === activeId;
    const name = acct.displayName || 'this account';
    alertCompat(
      isActive ? 'Log out' : 'Remove account',
      isActive
        ? `Log out of ${name}? You can add it back later.`
        : `Remove ${name} from this device? You can add it again later.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isActive ? 'Log out' : 'Remove',
          style: 'destructive',
          onPress: async () => {
            setBusyId(acct.userId);
            try {
              if (isActive) {
                onClose();
                await signOut();
                router.replace('/welcome');
              } else {
                await removeVaultedAccount(acct.userId);
                await load();
              }
            } finally {
              setBusyId(null);
            }
          },
        },
      ]
    );
  };

  const s = getStyles(theme.colors, isDark);
  const sheetMinHeight = Math.min(Math.round(height * 0.52), 540);
  const sheetMaxHeight = Math.round(height * 0.88);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View entering={FadeIn.duration(180)} style={s.backdrop}>
        <Pressable style={s.backdropPress} onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={s.kav}
          pointerEvents="box-none"
        >
          <View
            style={[
              s.sheet,
              { paddingBottom: 18 + insets.bottom, minHeight: sheetMinHeight, maxHeight: sheetMaxHeight },
            ]}
          >
            <View style={s.grabber} />

            <View style={s.header}>
              <View style={{ flex: 1 }}>
                <Text style={s.title}>Switch account</Text>
                <Text style={s.subtitle}>
                  {accounts.length > 0
                    ? `Tap an account to switch instantly · ${accounts.length} on this device`
                    : 'Manage the accounts on this device'}
                </Text>
              </View>
              <TouchableOpacity style={s.closeBtn} onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={18} color={isDark ? '#9CA3AF' : '#6B7280'} />
              </TouchableOpacity>
            </View>

            {loading ? (
              <View style={s.loadingBox}>
                <ActivityIndicator color={theme.colors.primary} />
              </View>
            ) : (
              <ScrollView
                style={s.list}
                contentContainerStyle={{ paddingTop: 6, paddingBottom: 8 }}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {accounts.map((acct, idx) => {
                  const isActive = acct.userId === activeId;
                  const unread = counts[acct.userId] ?? 0;
                  const rowBusy = busyId === acct.userId;
                  return (
                    <Animated.View key={acct.userId} entering={FadeInDown.delay(40 * idx).duration(320)}>
                      <TouchableOpacity
                        style={[s.row, isActive && s.rowActive]}
                        activeOpacity={0.7}
                        disabled={!!busyId}
                        onPress={() => onSwitch(acct.userId)}
                      >
                        <View style={[s.avatarRing, isActive && s.avatarRingActive]}>
                          <Image source={{ uri: acct.photoUrl || FALLBACK_AVATAR }} style={s.avatar} />
                          {unread > 0 && (
                            <View style={s.avatarBadge}>
                              <Text style={s.avatarBadgeText}>{unread > 99 ? '99+' : unread}</Text>
                            </View>
                          )}
                        </View>

                        <View style={s.rowMeta}>
                          <Text style={s.rowName} numberOfLines={1}>
                            {acct.displayName || 'Account'}
                          </Text>
                          <View style={s.rowSubLine}>
                            {isActive && <Text style={s.activeTag}>Active</Text>}
                            {unread > 0 ? (
                              <Text style={s.rowSubMuted} numberOfLines={1}>
                                {unread > 99 ? '99+' : unread} unread
                              </Text>
                            ) : acct.admissionNo ? (
                              <Text style={s.rowSubMuted} numberOfLines={1}>{acct.admissionNo}</Text>
                            ) : null}
                          </View>
                        </View>

                        {rowBusy ? (
                          <ActivityIndicator size="small" color={theme.colors.primary} />
                        ) : (
                          <View style={s.rowRight}>
                            {isActive ? (
                              <View style={s.checkWrap}>
                                <Ionicons name="checkmark" size={15} color="#fff" />
                              </View>
                            ) : (
                              <Ionicons name="chevron-forward" size={18} color="#C4CAD3" />
                            )}
                            <TouchableOpacity
                              style={[s.actionBtn, isActive ? s.actionBtnDanger : s.actionBtnNeutral]}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                              onPress={() => onRemove(acct)}
                              disabled={!!busyId}
                            >
                              <Ionicons
                                name={isActive ? 'log-out-outline' : 'close'}
                                size={15}
                                color={isActive ? '#EF4444' : '#9CA3AF'}
                              />
                            </TouchableOpacity>
                          </View>
                        )}
                      </TouchableOpacity>
                    </Animated.View>
                  );
                })}

                {/* Add account */}
                {!addMode ? (
                  <TouchableOpacity
                    style={s.addRow}
                    activeOpacity={0.7}
                    disabled={!!busyId}
                    onPress={() => setAddMode(true)}
                  >
                    <View style={s.addIcon}>
                      <Ionicons name="add" size={24} color={theme.colors.primary} />
                    </View>
                    <View style={s.rowMeta}>
                      <Text style={[s.rowName, { color: theme.colors.primary }]}>Add account</Text>
                      <Text style={s.rowSubMuted}>Log in to another child or account</Text>
                    </View>
                  </TouchableOpacity>
                ) : (
                  <Animated.View entering={FadeInDown.duration(260)} style={s.addForm}>
                    <Text style={s.addFormTitle}>Add another account</Text>
                    <TextInput
                      style={s.input}
                      placeholder="Email"
                      placeholderTextColor="#9CA3AF"
                      autoCapitalize="none"
                      keyboardType="email-address"
                      autoCorrect={false}
                      value={addEmail}
                      onChangeText={setAddEmail}
                      editable={!addBusy}
                    />
                    <TextInput
                      style={s.input}
                      placeholder="Password"
                      placeholderTextColor="#9CA3AF"
                      secureTextEntry
                      value={addPassword}
                      onChangeText={setAddPassword}
                      editable={!addBusy}
                      onSubmitEditing={onAdd}
                    />
                    {addError ? <Text style={s.errorText}>{addError}</Text> : null}
                    <View style={s.addActions}>
                      <TouchableOpacity
                        style={[s.btn, s.btnGhost]}
                        onPress={() => setAddMode(false)}
                        disabled={addBusy}
                        activeOpacity={0.8}
                      >
                        <Text style={s.btnGhostText}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[s.btn, { backgroundColor: theme.colors.primary }]}
                        onPress={onAdd}
                        disabled={addBusy}
                        activeOpacity={0.85}
                      >
                        {addBusy ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Text style={s.btnPrimaryText}>Log in &amp; add</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  </Animated.View>
                )}
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </Animated.View>
    </Modal>
  );
}

const getStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(15,23,42,0.62)',
      justifyContent: 'flex-end',
    },
    backdropPress: { ...StyleSheet.absoluteFillObject },
    kav: { width: '100%' },
    sheet: {
      width: '100%',
      maxWidth: 540,
      alignSelf: 'center',
      backgroundColor: colors.card,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      // On web (centered card) the bottom corners are visible too — round lightly.
      borderBottomLeftRadius: Platform.OS === 'web' ? 0 : 0,
      borderBottomRightRadius: Platform.OS === 'web' ? 0 : 0,
      paddingHorizontal: 18,
      paddingTop: 10,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -8 },
      shadowOpacity: 0.18,
      shadowRadius: 24,
      elevation: 24,
    },
    grabber: {
      alignSelf: 'center',
      width: 44,
      height: 5,
      borderRadius: 3,
      backgroundColor: isDark ? '#3F4756' : '#E2E8F0',
      marginBottom: 14,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: 8,
      paddingHorizontal: 2,
    },
    title: { fontSize: 20, fontWeight: '800', color: colors.textStrong, letterSpacing: -0.3 },
    subtitle: { fontSize: 12.5, color: '#9CA3AF', marginTop: 3, fontWeight: '500' },
    closeBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: isDark ? '#1F2937' : '#F1F5F9',
      justifyContent: 'center',
      alignItems: 'center',
      marginLeft: 8,
    },
    loadingBox: { flex: 1, paddingVertical: 60, alignItems: 'center', justifyContent: 'center' },
    list: { flexGrow: 0 },

    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 11,
      paddingHorizontal: 12,
      borderRadius: 18,
      marginBottom: 6,
      backgroundColor: 'transparent',
    },
    rowActive: {
      backgroundColor: isDark ? 'rgba(37,99,235,0.12)' : '#EFF4FF',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(37,99,235,0.35)' : '#DBE6FF',
    },
    avatarRing: {
      width: 56,
      height: 56,
      borderRadius: 28,
      padding: 2,
      marginRight: 14,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: isDark ? '#1F2937' : '#F1F5F9',
    },
    avatarRingActive: { backgroundColor: '#2563EB' },
    avatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#E5E7EB' },
    avatarBadge: {
      position: 'absolute',
      top: -2,
      right: -2,
      minWidth: 20,
      height: 20,
      borderRadius: 10,
      paddingHorizontal: 5,
      backgroundColor: '#EF4444',
      borderWidth: 2,
      borderColor: colors.card,
      justifyContent: 'center',
      alignItems: 'center',
    },
    avatarBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
    rowMeta: { flex: 1 },
    rowName: { fontSize: 15.5, fontWeight: '700', color: colors.textStrong },
    rowSubLine: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 },
    activeTag: {
      fontSize: 10.5,
      fontWeight: '800',
      color: '#2563EB',
      backgroundColor: isDark ? 'rgba(37,99,235,0.18)' : '#DBEAFE',
      paddingHorizontal: 7,
      paddingVertical: 1.5,
      borderRadius: 6,
      letterSpacing: 0.3,
      textTransform: 'uppercase',
      overflow: 'hidden',
    },
    rowSubMuted: { fontSize: 12.5, color: '#9CA3AF', fontWeight: '500' },
    rowRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    checkWrap: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: '#2563EB',
      justifyContent: 'center',
      alignItems: 'center',
    },
    actionBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      justifyContent: 'center',
      alignItems: 'center',
    },
    actionBtnNeutral: { backgroundColor: isDark ? '#1F2937' : '#F3F4F6' },
    actionBtnDanger: { backgroundColor: isDark ? 'rgba(239,68,68,0.14)' : '#FEF2F2' },

    addRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 12,
      marginTop: 4,
      borderRadius: 18,
    },
    addIcon: {
      width: 56,
      height: 56,
      borderRadius: 28,
      marginRight: 14,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1.5,
      borderColor: colors.primary,
      borderStyle: 'dashed',
      backgroundColor: isDark ? 'rgba(37,99,235,0.08)' : '#F5F9FF',
    },

    addForm: {
      paddingVertical: 8,
      paddingHorizontal: 4,
      marginTop: 4,
    },
    addFormTitle: { fontSize: 14, fontWeight: '800', color: colors.textStrong, marginBottom: 12 },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      paddingHorizontal: 15,
      paddingVertical: 13,
      fontSize: 15,
      color: colors.textStrong,
      marginBottom: 11,
      backgroundColor: isDark ? '#111827' : '#F9FAFB',
    },
    errorText: { color: '#DC2626', fontSize: 12.5, marginBottom: 10, marginLeft: 2, fontWeight: '600' },
    addActions: { flexDirection: 'row', gap: 12, marginTop: 4 },
    btn: { flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    btnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
    btnGhostText: { fontSize: 14.5, fontWeight: '700', color: colors.textStrong },
    btnPrimaryText: { fontSize: 14.5, fontWeight: '800', color: '#fff' },
  });
