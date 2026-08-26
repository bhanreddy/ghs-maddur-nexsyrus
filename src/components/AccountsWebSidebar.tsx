import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { usePermissions } from '../hooks/usePermissions';
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
  /** RBAC permission required to see this entry (optional). */
  permission?: string;
}

function routeIsActive(pathname: string, itemRoute: string): boolean {
  const p = pathname.split('?')[0].replace(/\/$/, '') || '';
  const r = itemRoute.replace(/\/$/, '');
  if (p === r) return true;
  if (r === '/accounts/dashboard') return p === '/accounts/dashboard';
  return p.startsWith(`${r}/`);
}

const SECTION_LABELS = {
  workspace: 'Workspace',
  people: 'People',
  system: 'System',
} as const;

/** Shared accounts portal nav — used by the desktop sidebar and the mobile drawer. */
export const ACCOUNTS_SIDEBAR_NAV: AccountsSidebarNavItem[] = [
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
    title: 'Reports',
    icon: 'bar-chart-outline',
    route: '/accounts/invoices',
    gradient: ['#8B5CF6', '#6D28D9'],
    category: 'Invoices',
  },
  {
    title: 'Certificates',
    icon: 'ribbon-outline',
    route: '/accounts/certificate-generator',
    gradient: ['#1E40AF', '#06B6D4'],
    category: 'Certificates',
    permission: 'certificates.issue',
  },
  {
    title: 'Users / Clients',
    icon: 'people-outline',
    route: '/accounts/manage-users',
    gradient: ['#0EA5E9', '#0284C7'],
    category: 'Directory',
  },
  {
    title: 'Pending Enrolments',
    icon: 'person-add-outline',
    route: '/accounts/pending-enrollments',
    gradient: ['#8B5CF6', '#7C3AED'],
    category: 'Admissions',
  },
  {
    title: 'Hostel Students',
    icon: 'bed-outline',
    route: '/accounts/hostel',
    gradient: ['#312E81', '#6366F1'],
    category: 'Student services',
    permission: 'hostel.allocate',
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
  pendingEnrollmentsBadge?: number;
}

function NavRow({
  item,
  collapsed,
  active,
  isDark,
  onNavigate,
  styles,
}: {
  item: AccountsSidebarNavItem;
  collapsed: boolean;
  active: boolean;
  isDark: boolean;
  onNavigate: (route: string) => void;
  styles: ReturnType<typeof createStyles>;
}) {
  const [hovered, setHovered] = useState(false);
  const showBadge = item.badge !== undefined && item.badge > 0;
  const [g0, g1] = item.gradient;
  const accentDeep = g1;
  const soft = `${g0}1F`;
  const softDark = `${g0}2E`;

  return (
    <Pressable
      onPress={() => onNavigate(item.route)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={[Platform.OS === 'web' && { cursor: 'pointer' }]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <View
        style={[
          styles.row,
          collapsed && styles.rowCollapsed,
          active && styles.rowActiveShell,
          !active &&
            hovered && {
              backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.92)',
              transform: [{ translateX: 2 }],
            },
          !active &&
            !hovered && {
              backgroundColor: isDark ? 'rgba(255,255,255,0.035)' : 'rgba(255,255,255,0.55)',
            },
        ]}
      >
        {active ? (
          <LinearGradient
            colors={[g0, g1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[StyleSheet.absoluteFill, { borderRadius: 12 }]}
            pointerEvents="none"
          />
        ) : null}

        <View
          style={[
            styles.iconWrap,
            collapsed && styles.iconWrapCollapsed,
            active
              ? {
                  backgroundColor: 'rgba(255,255,255,0.22)',
                  borderColor: 'rgba(255,255,255,0.28)',
                }
              : {
                  backgroundColor: isDark ? softDark : soft,
                  borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.7)',
                },
          ]}
        >
          <Ionicons
            name={item.icon}
            size={collapsed ? 17 : 14}
            color={active ? '#FFFFFF' : accentDeep}
          />
          {collapsed && showBadge ? <View style={styles.badgeDot} /> : null}
        </View>

        {!collapsed ? (
          <View style={styles.meta}>
            <View style={styles.titleRow}>
              <Text style={[styles.itemTitle, active && styles.itemTitleActive]} numberOfLines={1}>
                {item.title}
              </Text>
              {showBadge ? (
                <View
                  style={[
                    styles.badge,
                    {
                      backgroundColor: active
                        ? 'rgba(255,255,255,0.24)'
                        : isDark
                          ? 'rgba(255,255,255,0.12)'
                          : accentDeep,
                    },
                  ]}
                >
                  <Text style={styles.badgeText}>{item.badge! > 99 ? '99+' : item.badge}</Text>
                </View>
              ) : null}
            </View>
            {item.category ? (
              <Text style={[styles.category, active && styles.categoryActive]} numberOfLines={1}>
                {item.category.toUpperCase()}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

export default function AccountsWebSidebar({
  collapsed,
  pendingEnrollmentsBadge = 0,
}: AccountsWebSidebarProps) {
  const { isDark } = useTheme();
  const pathname = usePathname();
  const router = useRouter();
  const { signOut } = useAuth();
  const { hasPermission } = usePermissions();
  const [logoutHovered, setLogoutHovered] = useState(false);

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
    return ACCOUNTS_SIDEBAR_NAV
      .filter((it) => !it.permission || hasPermission(it.permission))
      .map((it) =>
        it.route === '/accounts/pending-enrollments' && pendingEnrollmentsBadge > 0
          ? { ...it, badge: pendingEnrollmentsBadge }
          : it,
      );
  }, [pendingEnrollmentsBadge, hasPermission]);

  const grouped = useMemo(() => {
    const workspace = items.filter((i) =>
      ['/accounts/dashboard', '/accounts/fees', '/accounts/invoices', '/accounts/certificate-generator'].includes(i.route),
    );
    const people = items.filter((i) =>
      ['/accounts/manage-users', '/accounts/pending-enrollments'].includes(i.route),
    );
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
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push(route as any);
      } catch (e) {
        console.error('Button action failed:', e);
      }
    },
    [router],
  );

  const onLogout = useCallback(async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
      await AsyncStorage.removeItem('accounts_auto_login');
      await signOut();
      router.replace('/welcome');
    } catch (e) {
      console.error('Button action failed:', e);
    }
  }, [router, signOut]);

  return (
    <Animated.View style={[styles.shellOuter, shellAnimStyle]}>
      <View style={styles.shellInner}>
        <LinearGradient
          colors={isDark ? ['#070B14', '#0F172A', '#111827'] : ['#E8EEF8', '#F3F6FC', '#EEF2F9']}
          locations={[0, 0.45, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {Platform.OS === 'web' ? (
          <View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundImage: isDark
                  ? 'radial-gradient(80% 45% at 10% 0%, rgba(59,130,246,0.22) 0%, transparent 55%), radial-gradient(70% 40% at 100% 100%, rgba(20,184,166,0.12) 0%, transparent 50%)'
                  : 'radial-gradient(90% 50% at 0% 0%, rgba(59,130,246,0.16) 0%, transparent 52%), radial-gradient(70% 40% at 100% 85%, rgba(20,184,166,0.10) 0%, transparent 48%), radial-gradient(50% 30% at 50% 100%, rgba(251,146,60,0.06) 0%, transparent 55%)',
              } as any,
            ]}
          />
        ) : null}

        <View style={[styles.topBrand, !collapsed && styles.topBrandExpanded]}>
          <LinearGradient
            colors={isDark ? ['#1E3A8A', '#1D4ED8', '#0F766E'] : ['#1E40AF', '#2563EB', '#0D9488']}
            locations={[0, 0.55, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.brandPill}
          >
            <View style={styles.brandSheen} pointerEvents="none" />
            <View style={styles.brandOrb}>
              <Ionicons name="wallet" size={collapsed ? 17 : 19} color="#FFFFFF" />
            </View>
            {!collapsed ? (
              <View style={styles.brandTextWrap}>
                <Text style={styles.brandName} numberOfLines={1}>
                  {SCHOOL_NAME || 'SchoolIMS'}
                </Text>
                <View style={styles.brandSubRow}>
                  <View style={styles.brandLiveDot} />
                  <Text style={styles.brandSub}>Accounts</Text>
                </View>
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
            ? flatForCollapsed.map((item) => (
                <NavRow
                  key={item.route}
                  item={item}
                  collapsed
                  active={routeIsActive(pathname, item.route)}
                  isDark={isDark}
                  onNavigate={onNavigate}
                  styles={styles}
                />
              ))
            : grouped.map((group) => (
                <View key={group.key} style={styles.sectionBlock}>
                  <View style={styles.sectionHead}>
                    <Text style={styles.sectionHeadLabel}>{group.label}</Text>
                    <View style={styles.sectionHeadLine} />
                  </View>
                  <View style={styles.navStack}>
                    {group.items.map((item) => (
                      <NavRow
                        key={item.route}
                        item={item}
                        collapsed={false}
                        active={routeIsActive(pathname, item.route)}
                        isDark={isDark}
                        onNavigate={onNavigate}
                        styles={styles}
                      />
                    ))}
                  </View>
                </View>
              ))}
        </ScrollView>

        <Pressable
          onPress={onLogout}
          onHoverIn={() => setLogoutHovered(true)}
          onHoverOut={() => setLogoutHovered(false)}
          style={[Platform.OS === 'web' && { cursor: 'pointer' }]}
          accessibilityRole="button"
        >
          <View
            style={[
              styles.logoutRow,
              collapsed && styles.logoutRowCollapsed,
              logoutHovered && {
                backgroundColor: isDark ? 'rgba(239,68,68,0.14)' : 'rgba(254,226,226,0.95)',
                transform: [{ translateX: 2 }],
              },
              !logoutHovered && {
                backgroundColor: isDark ? 'rgba(239,68,68,0.08)' : 'rgba(254,242,242,0.75)',
              },
            ]}
          >
            <View style={styles.iconWrapLogout}>
              <Ionicons
                name="log-out-outline"
                size={collapsed ? 17 : 14}
                color={isDark ? 'rgba(248,113,113,0.95)' : '#DC2626'}
              />
            </View>
            {!collapsed ? <Text style={styles.logoutLabel}>Logout</Text> : null}
          </View>
        </Pressable>
      </View>
    </Animated.View>
  );
}

function createStyles(isDark: boolean, collapsed: boolean) {
  const fgMuted = isDark ? 'rgba(248,250,252,0.45)' : 'rgba(15,23,42,0.42)';

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
      borderRightWidth: 1,
      borderRightColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(148,163,184,0.25)',
      ...(Platform.OS === 'web'
        ? ({
            boxShadow: isDark
              ? '4px 0 24px rgba(0,0,0,0.35)'
              : '4px 0 24px rgba(15,23,42,0.05)',
          } as any)
        : {}),
    },
    topBrand: {
      paddingHorizontal: collapsed ? 10 : 14,
      paddingTop: 16,
      paddingBottom: 8,
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 2,
    },
    topBrandExpanded: {
      alignItems: 'stretch',
    },
    brandPill: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 18,
      paddingVertical: 12,
      paddingHorizontal: collapsed ? 12 : 13,
      gap: 11,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.2)',
      ...(Platform.OS === 'web'
        ? ({
            boxShadow:
              '0 14px 32px rgba(29,78,216,0.32), 0 2px 0 rgba(255,255,255,0.2) inset',
          } as any)
        : {
            shadowColor: '#1D4ED8',
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.3,
            shadowRadius: 16,
            elevation: 8,
          }),
    },
    brandSheen: {
      ...StyleSheet.absoluteFillObject,
      ...(Platform.OS === 'web'
        ? ({
            backgroundImage:
              'linear-gradient(115deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.05) 38%, transparent 55%)',
          } as any)
        : { backgroundColor: 'rgba(255,255,255,0.08)' }),
    },
    brandOrb: {
      width: 38,
      height: 38,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.18)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.3)',
    },
    brandTextWrap: {
      flex: 1,
      minWidth: 0,
    },
    brandName: {
      fontSize: 14,
      fontWeight: '800',
      color: '#FFFFFF',
      letterSpacing: -0.3,
    },
    brandSubRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 3,
    },
    brandLiveDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: '#5EEAD4',
    },
    brandSub: {
      fontSize: 9.5,
      fontWeight: '700',
      letterSpacing: 1.3,
      color: 'rgba(255,255,255,0.78)',
      textTransform: 'uppercase',
    },
    scroll: { flex: 1, minHeight: 0, zIndex: 2 },
    scrollContent: {
      paddingHorizontal: collapsed ? 10 : 12,
      paddingBottom: 16,
      paddingTop: 6,
    },
    sectionBlock: {
      marginBottom: 10,
    },
    sectionHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 8,
      paddingHorizontal: 4,
    },
    sectionHeadLabel: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1.8,
      color: fgMuted,
      textTransform: 'uppercase',
    },
    sectionHeadLine: {
      flex: 1,
      height: StyleSheet.hairlineWidth,
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)',
    },
    navStack: {
      gap: 5,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 12,
      minHeight: 44,
      paddingHorizontal: 8,
      paddingVertical: 6,
      gap: 9,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.55)',
      overflow: 'hidden',
      position: 'relative',
      ...(Platform.OS === 'web'
        ? ({
            transition: 'transform 140ms ease, background-color 140ms ease, box-shadow 160ms ease',
          } as any)
        : {}),
    },
    rowCollapsed: {
      justifyContent: 'center',
      minHeight: 44,
      marginBottom: 5,
      paddingHorizontal: 0,
      borderRadius: 13,
    },
    rowActiveShell: {
      borderColor: 'rgba(255,255,255,0.25)',
      ...(Platform.OS === 'web'
        ? ({
            boxShadow: '0 8px 18px rgba(15,23,42,0.18)',
          } as any)
        : {
            shadowColor: '#0F172A',
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.18,
            shadowRadius: 10,
            elevation: 4,
          }),
    },
    iconWrap: {
      width: 26,
      height: 26,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      zIndex: 1,
    },
    iconWrapCollapsed: {
      width: 40,
      height: 40,
      borderRadius: 12,
    },
    badgeDot: {
      position: 'absolute',
      top: 4,
      right: 4,
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: '#FB7185',
      borderWidth: 1.5,
      borderColor: isDark ? '#070B14' : '#E8EEF8',
    },
    meta: {
      flex: 1,
      minWidth: 0,
      zIndex: 1,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    itemTitle: {
      flex: 1,
      fontSize: 12.5,
      fontWeight: '600',
      color: isDark ? 'rgba(248,250,252,0.82)' : 'rgba(15,23,42,0.78)',
      letterSpacing: -0.15,
    },
    itemTitleActive: {
      color: '#FFFFFF',
      fontWeight: '700',
    },
    category: {
      fontSize: 9,
      fontWeight: '700',
      letterSpacing: 0.8,
      color: fgMuted,
      marginTop: 2,
    },
    categoryActive: {
      color: 'rgba(255,255,255,0.75)',
    },
    badge: {
      minWidth: 20,
      height: 20,
      paddingHorizontal: 6,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1,
    },
    badgeText: {
      color: '#FFFFFF',
      fontSize: 10,
      fontWeight: '800',
    },
    logoutRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: collapsed ? 10 : 12,
      marginBottom: 16,
      marginTop: 8,
      paddingHorizontal: 8,
      paddingVertical: 8,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(239,68,68,0.18)' : 'rgba(254,202,202,0.8)',
      gap: 9,
      zIndex: 2,
      ...(Platform.OS === 'web'
        ? ({
            transition: 'transform 140ms ease, background-color 140ms ease',
          } as any)
        : {}),
    },
    logoutRowCollapsed: {
      justifyContent: 'center',
      paddingHorizontal: 0,
    },
    iconWrapLogout: {
      width: collapsed ? 40 : 26,
      height: collapsed ? 40 : 26,
      borderRadius: collapsed ? 12 : 8,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(239,68,68,0.12)' : 'rgba(239,68,68,0.08)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(239,68,68,0.2)' : 'rgba(254,202,202,0.9)',
    },
    logoutLabel: {
      fontSize: 12.5,
      fontWeight: '700',
      color: isDark ? 'rgba(248,113,113,0.95)' : '#DC2626',
      letterSpacing: -0.15,
    },
  });
}
