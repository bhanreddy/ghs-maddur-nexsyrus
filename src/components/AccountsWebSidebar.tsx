import React, { useCallback, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Platform } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import * as Haptics from '../utils/haptics';
import { useTheme } from '../hooks/useTheme';
import { useAuth } from '../hooks/useAuth';
import { SCHOOL_NAME } from '../constants/school';
import {
  DASHBOARD_SIDEBAR_COLLAPSED,
  DASHBOARD_SIDEBAR_EXPANDED,
} from './DashboardWebSidebar';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export interface AccountsSidebarNavItem {
  title: string;
  icon: IconName;
  route: string;
  gradient: [string, string];
  badge?: number;
  category?: string;
}

function routeIsActive(pathname: string, itemRoute: string): boolean {
  const p = pathname.split('?')[0].replace(/\/$/, '') || '';
  const r = itemRoute.replace(/\/$/, '');
  if (p === r) return true;
  if (r === '/accounts/dashboard') return p === '/accounts/dashboard';
  return p.startsWith(`${r}/`);
}

const SECTION_LABELS = {
  workspace: 'WORKSPACE',
  people: 'PEOPLE',
  system: 'SYSTEM',
} as const;

const DEFAULT_NAV: AccountsSidebarNavItem[] = [
  {
    title: 'Dashboard',
    icon: 'grid-outline',
    route: '/accounts/dashboard',
    gradient: ['#3B82F6', '#1D4ED8'],
    category: 'Overview',
  },
  {
    title: 'Transactions',
    icon: 'swap-horizontal-outline',
    route: '/accounts/fees',
    gradient: ['#10B981', '#059669'],
    category: 'Fees & payments',
  },
  {
    title: 'UPI fee QR',
    icon: 'qr-code-outline',
    route: '/accounts/collect-fee-qr',
    gradient: ['#D97706', '#F59E0B'],
    category: 'Fees & payments',
  },
  {
    title: 'Reports',
    icon: 'bar-chart-outline',
    route: '/accounts/invoices',
    gradient: ['#8B5CF6', '#6D28D9'],
    category: 'Documents',
  },
  {
    title: 'Users / Clients',
    icon: 'people-outline',
    route: '/accounts/manage-users',
    gradient: ['#0EA5E9', '#0284C7'],
    category: 'Directory',
  },
  {
    title: 'Settings',
    icon: 'settings-outline',
    route: '/accounts/settings',
    gradient: ['#64748B', '#475569'],
    category: 'Preferences',
  },
];

interface AccountsWebSidebarProps {
  collapsed: boolean;
  /** e.g. pending enrollments count for Users / Clients */
  usersBadge?: number;
}

export default function AccountsWebSidebar({
  collapsed,
  usersBadge = 0,
}: AccountsWebSidebarProps) {
  const { isDark } = useTheme();
  const pathname = usePathname();
  const router = useRouter();
  const { signOut } = useAuth();

  const widthSV = useSharedValue(
    collapsed ? DASHBOARD_SIDEBAR_COLLAPSED : DASHBOARD_SIDEBAR_EXPANDED,
  );

  useEffect(() => {
    widthSV.value = withTiming(
      collapsed ? DASHBOARD_SIDEBAR_COLLAPSED : DASHBOARD_SIDEBAR_EXPANDED,
      { duration: 280, easing: Easing.out(Easing.cubic) },
    );
  }, [collapsed, widthSV]);

  const shellAnimStyle = useAnimatedStyle(() => ({
    width: widthSV.value,
    overflow: 'hidden' as const,
  }));

  const items = useMemo(() => {
    return DEFAULT_NAV.map((it) =>
      it.route === '/accounts/manage-users' && usersBadge > 0
        ? { ...it, badge: usersBadge }
        : it,
    );
  }, [usersBadge]);

  const grouped = useMemo(() => {
    const workspace = items.filter((i) =>
      ['/accounts/dashboard', '/accounts/fees', '/accounts/invoices'].includes(i.route),
    );
    const people = items.filter((i) => i.route === '/accounts/manage-users');
    const system = items.filter((i) => i.route === '/accounts/settings');
    return [
      { key: 'workspace' as const, label: SECTION_LABELS.workspace, items: workspace },
      { key: 'people' as const, label: SECTION_LABELS.people, items: people },
      { key: 'system' as const, label: SECTION_LABELS.system, items: system },
    ].filter((g) => g.items.length > 0);
  }, [items]);

  const flatForCollapsed = useMemo(() => items, [items]);

  const styles = useMemo(() => createStyles(isDark, collapsed), [isDark, collapsed]);

  const onNavigate = useCallback(
    (route: string) => {
      console.debug('[AccountsWebSidebar] onNavigate start', { route });
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push(route as any);
        console.debug('[AccountsWebSidebar] onNavigate end', { route });
      } catch (e) {
        console.error('Button action failed:', e);
      }
    },
    [router],
  );

  const onLogout = useCallback(async () => {
    console.debug('[AccountsWebSidebar] onLogout start');
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
      await AsyncStorage.removeItem('accounts_auto_login');
      await signOut();
      router.replace('/welcome');
      console.debug('[AccountsWebSidebar] onLogout end');
    } catch (e) {
      console.error('Button action failed:', e);
    }
  }, [router, signOut]);

  const accentTop = '#3B82F6';

  const renderRow = (item: AccountsSidebarNavItem) => {
    const active = routeIsActive(pathname, item.route);
    const [g0, g1] = item.gradient;
    const showBadge = item.badge !== undefined && item.badge > 0;

    return (
      <Pressable
        key={item.route}
        onPress={() => onNavigate(item.route)}
        style={[
          styles.row,
          collapsed && styles.rowCollapsed,
          Platform.OS === 'web' && { cursor: 'pointer' },
          {
            borderRadius: 18,
            marginBottom: 8,
            backgroundColor: active ? (isDark ? '#2A3142' : '#EEF1F8') : (isDark ? '#1E293B' : '#F8FAFC'),
            borderTopWidth: 1.5,
            borderTopColor: active ? (isDark ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.9)') : (isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.6)'),
            borderBottomWidth: 3,
            borderBottomColor: active ? (isDark ? 'rgba(0,0,0,0.5)' : 'rgba(76,90,120,0.18)') : (isDark ? 'rgba(0,0,0,0.3)' : 'rgba(76,90,120,0.08)'),
            shadowColor: isDark ? '#000' : '#6B7A99',
            shadowOffset: { width: 0, height: active ? 8 : 4 },
            shadowOpacity: active ? (isDark ? 0.35 : 0.22) : (isDark ? 0.2 : 0.08),
            shadowRadius: active ? 12 : 6,
            elevation: active ? 4 : 2,
          }
        ]}
      >
        <View style={[StyleSheet.absoluteFill, { borderRadius: 18, overflow: 'hidden' }]}>
          {active && (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: g0, opacity: isDark ? 0.35 : 0.30 }]} />
          )}
          <LinearGradient
            colors={active 
              ? (isDark ? ['rgba(255,255,255,0.15)', 'rgba(255,255,255,0)'] : ['rgba(255,255,255,0.45)', 'rgba(255,255,255,0)'])
              : (isDark ? ['rgba(255,255,255,0.05)', 'rgba(255,255,255,0)'] : ['rgba(255,255,255,0.3)', 'rgba(255,255,255,0)'])}
            start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 0.9 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
        </View>

        <View
          style={[styles.iconWrap, collapsed && styles.iconWrapCollapsed, active && { backgroundColor: isDark ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.7)', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4 }]}
        >
          <Ionicons
            name={item.icon}
            size={22}
            color={
              active
                ? (isDark ? '#FFFFFF' : g0)
                : isDark
                  ? 'rgba(255,255,255,0.45)'
                  : 'rgba(15,23,42,0.5)'
            }
          />
          {collapsed && showBadge ? <View style={styles.badgeDot} /> : null}
        </View>

        {!collapsed ? (
          <View style={styles.meta}>
            <View style={styles.titleRow}>
              <Text style={[styles.itemTitle, active && { color: isDark ? '#FFFFFF' : '#1E293B' }]} numberOfLines={2}>
                {item.title}
              </Text>
              {showBadge ? (
                <View style={[styles.badge, { backgroundColor: g0 }]}>
                  <Text style={styles.badgeText}>{item.badge! > 99 ? '99+' : item.badge}</Text>
                </View>
              ) : null}
            </View>
            {item.category ? (
              <Text style={[styles.category, active && { color: isDark ? 'rgba(255,255,255,0.7)' : 'rgba(30,41,59,0.7)' }]} numberOfLines={1}>
                {item.category.toUpperCase()}
              </Text>
            ) : null}
          </View>
        ) : null}
      </Pressable>
    );
  };

  return (
    <Animated.View style={[styles.shellOuter, shellAnimStyle]}>
      <View style={styles.shellInner}>
        <View
          style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? '#0D1120' : '#F8FAFF' }]}
        />
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.65)',
            },
          ]}
        />
        <LinearGradient
          pointerEvents="none"
          colors={[`${accentTop}55`, `${accentTop}00`]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.rightBorderGradient}
        />

        <View style={[styles.topBrand, !collapsed && styles.topBrandExpanded]}>
          <LinearGradient
            colors={isDark ? ['#3B82F6', '#7C3AED'] : ['#6366F1', '#8B5CF6']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.brandPill}
          >
            <View style={styles.brandOrbInner}>
              <LinearGradient
                colors={['rgba(255,255,255,0.25)', 'rgba(255,255,255,0)']}
                style={StyleSheet.absoluteFill}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              />
              <Ionicons name="wallet" size={collapsed ? 20 : 22} color="#FFFFFF" />
            </View>
            {!collapsed ? (
              <View style={styles.brandTextWrap}>
                <Text style={styles.brandName} numberOfLines={1}>
                  {SCHOOL_NAME || 'SchoolIMS'}
                </Text>
                <Text style={styles.brandSub}>Accounts</Text>
              </View>
            ) : null}
          </LinearGradient>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
        >
          {collapsed
            ? flatForCollapsed.map((item) => renderRow(item))
            : grouped.map((group) => (
                <View key={group.key} style={styles.sectionBlock}>
                  <Text style={styles.sectionLabel}>{group.label}</Text>
                  {group.items.map((item) => renderRow(item))}
                </View>
              ))}
        </ScrollView>

        <Pressable
          onPress={onLogout}
          style={[
            styles.logoutRow,
            collapsed && styles.logoutRowCollapsed,
            Platform.OS === 'web' && { cursor: 'pointer' },
            {
              borderRadius: 18,
              borderTopWidth: 1.5,
              backgroundColor: isDark ? '#2A3142' : '#FEE2E2',
              borderTopColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.9)',
              borderBottomWidth: 3,
              borderBottomColor: isDark ? 'rgba(0,0,0,0.5)' : 'rgba(220,38,38,0.2)',
              shadowColor: isDark ? '#000' : '#DC2626',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: isDark ? 0.2 : 0.15,
              shadowRadius: 8,
              elevation: 2,
              paddingVertical: 10,
              paddingHorizontal: 10,
              marginHorizontal: 10,
              marginBottom: 16,
              marginTop: 10,
            }
          ]}
        >
          <View style={[StyleSheet.absoluteFill, { borderRadius: 18, overflow: 'hidden' }]}>
            <LinearGradient
              colors={isDark ? ['rgba(255,255,255,0.05)', 'rgba(255,255,255,0)'] : ['rgba(255,255,255,0.5)', 'rgba(255,255,255,0)']}
              start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 0.9 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
          </View>
          <View style={[styles.iconWrapLogout, { backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.6)', marginLeft: 0 }]}>
            <Ionicons
              name="log-out-outline"
              size={22}
              color={isDark ? 'rgba(248,113,113,0.95)' : '#DC2626'}
            />
          </View>
          {!collapsed ? (
            <Text style={[styles.logoutLabel, { marginLeft: 10 }]}>Logout</Text>
          ) : null}
        </Pressable>
      </View>
    </Animated.View>
  );
}

function createStyles(isDark: boolean, collapsed: boolean) {
  const fg = isDark ? '#F8FAFC' : '#0F172A';
  const fgMuted = isDark ? 'rgba(248,250,252,0.5)' : 'rgba(15,23,42,0.45)';

  return StyleSheet.create({
    shellOuter: {
      alignSelf: 'stretch',
      flexShrink: 0,
    },
    shellInner: {
      flex: 1,
      alignSelf: 'stretch',
      position: 'relative',
      overflow: 'hidden',
    },
    rightBorderGradient: {
      position: 'absolute',
      top: 0,
      right: 0,
      width: 2,
      bottom: 0,
      zIndex: 4,
    },
    topBrand: {
      paddingHorizontal: collapsed ? 8 : 12,
      paddingVertical: 14,
      justifyContent: 'center',
      alignItems: 'center',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)',
      minHeight: 72,
      zIndex: 2,
    },
    topBrandExpanded: {
      alignItems: 'stretch',
    },
    brandPill: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 16,
      paddingVertical: 10,
      paddingHorizontal: collapsed ? 10 : 12,
      gap: 12,
      overflow: 'hidden',
    },
    brandOrbInner: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      backgroundColor: 'rgba(0,0,0,0.15)',
    },
    brandTextWrap: {
      flex: 1,
      minWidth: 0,
    },
    brandName: {
      fontSize: 14,
      fontWeight: '800',
      color: '#FFFFFF',
      letterSpacing: -0.2,
    },
    brandSub: {
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 1.2,
      color: 'rgba(255,255,255,0.8)',
      marginTop: 2,
      textTransform: 'uppercase',
    },
    scroll: { flex: 1, minHeight: 0, zIndex: 2 },
    scrollContent: {
      paddingVertical: 12,
      paddingHorizontal: collapsed ? 8 : 10,
      paddingBottom: 12,
    },
    sectionBlock: {
      marginBottom: 8,
    },
    sectionLabel: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 2,
      color: isDark ? 'rgba(255,255,255,0.35)' : 'rgba(15,23,42,0.4)',
      marginBottom: 8,
      marginTop: 4,
      paddingHorizontal: 4,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 14,
      marginBottom: 4,
      overflow: 'hidden',
      minHeight: 48,
      position: 'relative',
    },
    rowCollapsed: {
      justifyContent: 'center',
      paddingHorizontal: 0,
    },
    rowActiveFill: {
      borderRadius: 14,
    },
    rowGhost: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: 14,
      backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(15,23,42,0.02)',
    },
    activeLeftGlow: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: 56,
      borderRadius: 14,
      zIndex: 1,
    },
    iconWrap: {
      width: 44,
      height: 44,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: 8,
      marginRight: 10,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.05)',
      zIndex: 2,
    },
    iconWrapActive: {
      backgroundColor: 'rgba(255,255,255,0.18)',
    },
    iconWrapCollapsed: {
      marginLeft: 0,
      marginRight: 0,
    },
    badgeDot: {
      position: 'absolute',
      top: 6,
      right: 6,
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: '#EF4444',
      borderWidth: 1.5,
      borderColor: isDark ? '#0D1120' : '#F8FAFF',
    },
    meta: {
      flex: 1,
      minWidth: 0,
      paddingRight: 10,
      paddingVertical: 6,
      zIndex: 2,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    itemTitle: {
      flex: 1,
      fontSize: 13,
      fontWeight: '700',
      color: fg,
      letterSpacing: -0.2,
    },
    itemTitleActive: {
      color: '#FFFFFF',
    },
    category: {
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 1,
      color: fgMuted,
      marginTop: 4,
    },
    categoryActive: {
      color: 'rgba(255,255,255,0.75)',
    },
    badge: {
      minWidth: 22,
      height: 22,
      paddingHorizontal: 6,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badgeText: {
      color: '#FFFFFF',
      fontSize: 10,
      fontWeight: '900',
    },
    logoutRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 14,
      paddingHorizontal: collapsed ? 0 : 10,
      marginHorizontal: collapsed ? 0 : 10,
      marginBottom: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)',
      zIndex: 2,
    },
    logoutRowCollapsed: {
      justifyContent: 'center',
    },
    iconWrapLogout: {
      width: 44,
      height: 44,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: collapsed ? 0 : 8,
      marginRight: collapsed ? 0 : 10,
      backgroundColor: isDark ? 'rgba(239,68,68,0.12)' : 'rgba(239,68,68,0.08)',
    },
    logoutLabel: {
      fontSize: 14,
      fontWeight: '800',
      color: isDark ? 'rgba(248,113,113,0.95)' : '#DC2626',
      letterSpacing: -0.2,
    },
  });
}
