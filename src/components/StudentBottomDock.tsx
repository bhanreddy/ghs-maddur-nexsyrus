import { TourTarget } from '@/src/features/app-tour';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Href, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Image,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  ViewStyle,
  type ImageSourcePropType,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { FeatureKey } from '../config/featureFlags';
import { useAuth } from '../hooks/useAuth';
import { useFeatures } from '../hooks/useFeatures';
import { useTheme } from '../hooks/useTheme';
import * as Haptics from '../utils/haptics';

type StudentMenuItem = {
  key: string;
  labelKey: string;
  descriptionKey: string;
  link: Href;
  feature: FeatureKey;
  image: ImageSourcePropType;
  tint: string;
  surface: string;
};

const STUDENT_MENU_ITEMS: StudentMenuItem[] = [
  {
    key: 'dcgd',
    labelKey: 'studentSpace.career.title',
    descriptionKey: 'studentSpace.career.description',
    link: '/Screen/dcgd',
    feature: 'menu.dcgd',
    image: require('../../assets/images/student-space/career-guidance-clay.png'),
    tint: '#0D9488',
    surface: '#E6FFFA',
  },
  {
    key: 'ai_doubt',
    labelKey: 'studentSpace.ai.title',
    descriptionKey: 'studentSpace.ai.description',
    link: '/Screen/aiChat',
    feature: 'menu.ai_doubt_assist',
    image: require('../../assets/images/student-space/ai-study-assist-clay.png'),
    tint: '#6366F1',
    surface: '#EEF2FF',
  },
  {
    key: 'insurance',
    labelKey: 'studentSpace.insurance.title',
    descriptionKey: 'studentSpace.insurance.description',
    link: '/Screen/insurance',
    feature: 'menu.insurance',
    image: require('../../assets/images/student-space/insurance-protection-clay.png'),
    tint: '#059669',
    surface: '#ECFDF5',
  },
  {
    key: 'money_science',
    labelKey: 'studentSpace.money.title',
    descriptionKey: 'studentSpace.money.description',
    link: '/Screen/moneyScience',
    feature: 'menu.money_science',
    image: require('../../assets/images/student-space/money-skills-clay.png'),
    tint: '#8B5CF6',
    surface: '#F5F3FF',
  },
];

const SETTINGS_IMAGE = require('../../assets/images/student-space/settings-preferences-clay.png');

const TAB_META = {
  home: {
    labelKey: 'dashboard.home',
    fallback: 'Home',
    activeIcon: 'home' as const,
    inactiveIcon: 'home-outline' as const,
    feature: 'nav.home' as FeatureKey,
  },
  timetable: {
    labelKey: 'timetable.title',
    fallback: 'Time Table',
    activeIcon: 'calendar' as const,
    inactiveIcon: 'calendar-outline' as const,
    feature: 'nav.time_table' as FeatureKey,
  },
  fees: {
    labelKey: 'fees',
    fallback: 'Fees',
    activeIcon: 'wallet' as const,
    inactiveIcon: 'wallet-outline' as const,
    feature: 'nav.fees' as FeatureKey,
  },
  results: {
    labelKey: 'menu.results',
    fallback: 'Results',
    activeIcon: 'school' as const,
    inactiveIcon: 'school-outline' as const,
    feature: 'nav.results' as FeatureKey,
  },
};

type DockRouteName = keyof typeof TAB_META;

const isDockRoute = (name: string): name is DockRouteName =>
  Object.prototype.hasOwnProperty.call(TAB_META, name);

export default function StudentBottomDock({
  state,
  navigation,
}: BottomTabBarProps) {
  const { t } = useTranslation();
  const { theme, isDark } = useTheme();
  const { isEnabled } = useFeatures();
  const insets = useSafeAreaInsets();
  const [menuOpen, setMenuOpen] = useState(false);

  const routes = state.routes.filter(
    (route) => isDockRoute(route.name) && isEnabled(TAB_META[route.name].feature),
  );
  const leftRoutes = routes.filter((route) => route.name === 'home' || route.name === 'timetable');
  const rightRoutes = routes.filter((route) => route.name === 'fees' || route.name === 'results');

  const openMenu = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setMenuOpen(true);
  };

  const closeMenu = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMenuOpen(false);
  };

  const renderTab = (route: (typeof state.routes)[number]) => {
    if (!isDockRoute(route.name)) return null;

    const routeIndex = state.routes.findIndex((candidate) => candidate.key === route.key);
    const focused = state.index === routeIndex;
    const meta = TAB_META[route.name];
    const label = t(meta.labelKey, meta.fallback);

    const onPress = () => {
      Haptics.selectionAsync();
      const event = navigation.emit({
        type: 'tabPress',
        target: route.key,
        canPreventDefault: true,
      });

      if (!focused && !event.defaultPrevented) {
        navigation.navigate(route.name, route.params);
      }
    };

    return (
      <Pressable
        key={route.key}
        accessibilityRole="tab"
        accessibilityLabel={String(label)}
        accessibilityState={{ selected: focused }}
        onPress={onPress}
        onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
        style={({ pressed }) => [
          styles.tabButton,
          focused && [
            styles.tabButtonActive,
            {
              backgroundColor: isDark
                ? 'rgba(139,92,246,0.22)'
                : 'rgba(139,92,246,0.11)',
            },
          ],
          pressed && styles.pressed,
          Platform.OS === 'web' && ({ cursor: 'pointer' } as unknown as ViewStyle),
        ]}
      >
        <View
          style={[
            styles.tabIcon,
            focused && {
              backgroundColor: isDark ? '#8B5CF6' : '#7C3AED',
              shadowColor: '#7C3AED',
            },
          ]}
        >
          <Ionicons
            name={focused ? meta.activeIcon : meta.inactiveIcon}
            size={focused ? 18 : 19}
            color={focused ? '#FFFFFF' : (isDark ? '#94A3B8' : '#64748B')}
          />
        </View>
        <Text
          numberOfLines={1}
          style={[
            styles.tabLabel,
            { color: focused ? (isDark ? '#C4B5FD' : '#6D28D9') : theme.colors.textMuted },
            focused && styles.tabLabelActive,
          ]}
        >
          {label}
        </Text>
      </Pressable>
    );
  };

  return (
    <>
      <View
        style={[
          styles.host,
          {
            height: 82 + insets.bottom,
            paddingBottom: Math.max(insets.bottom, 8),
            backgroundColor: theme.colors.background,
          },
        ]}
      >
        <TourTarget id="student.navigation" native active><View
          style={[
            styles.dock,
            {
              backgroundColor: isDark ? 'rgba(20,24,40,0.96)' : 'rgba(255,255,255,0.97)',
              borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(124,107,184,0.12)',
              shadowColor: isDark ? '#000000' : '#667085',
            },
          ]}
        >
          <BlurView
            intensity={Platform.OS === 'ios' ? 36 : 0}
            tint={isDark ? 'dark' : 'light'}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <LinearGradient
            colors={isDark
              ? ['rgba(255,255,255,0.045)', 'rgba(124,107,184,0.045)']
              : ['rgba(255,255,255,0.80)', 'rgba(245,243,255,0.48)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />

          <View style={styles.tabGroup}>{leftRoutes.map(renderTab)}</View>
          <View style={styles.centerSlot}>
            <Text style={[styles.menuCaption, { color: isDark ? '#C4B5FD' : '#6D28D9' }]}>
              Menu
            </Text>
          </View>
          <View style={styles.tabGroup}>{rightRoutes.map(renderTab)}</View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open student menu"
            accessibilityState={{ expanded: menuOpen }}
            onPress={openMenu}
            style={({ pressed }) => [
              styles.menuButtonOuter,
              { backgroundColor: isDark ? '#242138' : '#FFFFFF' },
              pressed && styles.menuButtonPressed,
              Platform.OS === 'web' && ({ cursor: 'pointer' } as unknown as ViewStyle),
            ]}
          >
            <LinearGradient
              colors={['#A78BFA', '#7C3AED', '#5B21B6']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.menuButton}
            >
              <View style={styles.menuButtonGlow} />
              <Ionicons name="grid" size={25} color="#FFFFFF" />
              <View style={styles.menuNotificationDot} />
            </LinearGradient>
          </Pressable>
        </View></TourTarget>
      </View>

      <StudentDockMenu visible={menuOpen} onClose={closeMenu} />
    </>
  );
}

function StudentDockMenu({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { theme, isDark } = useTheme();
  const { user } = useAuth();
  const { isEnabled } = useFeatures();

  const menuItems = useMemo(
    () => STUDENT_MENU_ITEMS.filter((item) => isEnabled(item.feature)),
    [isEnabled],
  );
  const panelWidth = Math.min(width - 24, 620);
  const displayName = user?.displayName || 'Student';
  const initials = displayName
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const navigateTo = (link: Href) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
    setTimeout(() => router.push(link), 160);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.modalRoot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close student menu"
          style={styles.backdrop}
          onPress={onClose}
        />

        <Animated.View
          entering={FadeInDown.duration(220).springify().damping(20)}
          style={[
            styles.menuPanel,
            {
              width: panelWidth,
              bottom: 82 + insets.bottom,
              backgroundColor: isDark ? 'rgba(19,22,36,0.98)' : 'rgba(255,255,255,0.98)',
              borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(124,107,184,0.14)',
              shadowColor: isDark ? '#000000' : '#475467',
            },
          ]}
        >
          <BlurView
            intensity={Platform.OS === 'ios' ? 52 : 0}
            tint={isDark ? 'dark' : 'light'}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={isDark
              ? ['rgba(139,92,246,0.12)', 'rgba(16,185,129,0.035)']
              : ['rgba(245,243,255,0.96)', 'rgba(255,255,255,0.90)', 'rgba(236,253,245,0.72)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />

          <View style={styles.menuHandle} />

          <View style={styles.menuHeader}>
            <LinearGradient
              colors={['#8B5CF6', '#4F46E5']}
              style={styles.avatarRing}
            >
              <View style={[styles.avatarInner, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF' }]}>
                {user?.photoUrl ? (
                  <Image source={{ uri: user.photoUrl }} style={styles.avatarImage} />
                ) : (
                  <Text style={[styles.avatarInitials, { color: isDark ? '#C4B5FD' : '#6D28D9' }]}>
                    {initials}
                  </Text>
                )}
              </View>
            </LinearGradient>

            <View style={styles.menuHeaderCopy}>
              <Text style={[styles.menuEyebrow, { color: isDark ? '#A78BFA' : '#7C3AED' }]}>
                {t('studentSpace.eyebrow')}
              </Text>
              <Text style={[styles.menuTitle, { color: theme.colors.textStrong }]} numberOfLines={1}>
                {t('studentSpace.greeting', { name: displayName.split(' ')[0] })}
              </Text>
              <Text style={[styles.menuHeaderDescription, { color: theme.colors.textMuted }]} numberOfLines={1}>
                {t('studentSpace.description')}
              </Text>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
              style={({ pressed }) => [
                styles.closeButton,
                {
                  backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.80)',
                  borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(124,107,184,0.10)',
                },
                pressed && styles.pressed,
              ]}
            >
              <Ionicons name="close" size={19} color={theme.colors.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.menuGrid}>
            {menuItems.map((item) => {
              const label = t(item.labelKey);
              const description = t(item.descriptionKey);

              return (
                <Pressable
                  key={item.key}
                  accessibilityRole="button"
                  accessibilityLabel={`${label}. ${description}`}
                  onPress={() => navigateTo(item.link)}
                  style={({ pressed }) => [
                    styles.menuTile,
                    {
                      backgroundColor: isDark ? `${item.tint}18` : item.surface,
                      borderColor: isDark ? `${item.tint}32` : `${item.tint}22`,
                    },
                    pressed && styles.menuTilePressed,
                    Platform.OS === 'web' && ({ cursor: 'pointer' } as unknown as ViewStyle),
                  ]}
                >
                  <View style={[styles.menuArtwork, { shadowColor: item.tint }]}>
                    <Image
                      source={item.image}
                      style={styles.menuArtworkImage}
                      resizeMode="cover"
                      accessibilityIgnoresInvertColors
                    />
                    <LinearGradient
                      colors={['rgba(255,255,255,0.20)', 'rgba(255,255,255,0)']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 0.55, y: 0.75 }}
                      style={StyleSheet.absoluteFill}
                      pointerEvents="none"
                    />
                  </View>
                  <View style={styles.menuTileCopy}>
                    <Text style={[styles.menuTileLabel, { color: theme.colors.textStrong }]} numberOfLines={1}>
                      {label}
                    </Text>
                    <Text style={[styles.menuTileDescription, { color: theme.colors.textMuted }]} numberOfLines={1}>
                      {description}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          <View style={[styles.menuFooter, { borderTopColor: theme.colors.border }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open settings"
              onPress={() => navigateTo('/Screen/settings')}
              style={({ pressed }) => [
                styles.settingsAction,
                {
                  backgroundColor: isDark ? 'rgba(99,102,241,0.10)' : 'rgba(238,242,255,0.86)',
                  borderColor: isDark ? 'rgba(129,140,248,0.18)' : 'rgba(99,102,241,0.11)',
                },
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.settingsArtwork}>
                <Image
                  source={SETTINGS_IMAGE}
                  style={styles.settingsArtworkImage}
                  resizeMode="cover"
                  accessibilityIgnoresInvertColors
                />
              </View>
              <View style={styles.settingsCopy}>
                <Text style={[styles.footerActionText, { color: theme.colors.textStrong }]}>
                  {t('studentSpace.settings.title')}
                </Text>
                <Text style={[styles.settingsDescription, { color: theme.colors.textMuted }]}>
                  {t('studentSpace.settings.description')}
                </Text>
              </View>
            </Pressable>
          </View>

          <View style={[styles.panelPointer, { backgroundColor: isDark ? '#191C2D' : '#FFFFFF' }]} />
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  host: {
    paddingTop: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  dock: {
    width: '100%',
    maxWidth: 720,
    height: 64,
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 14,
    overflow: 'visible',
  },
  tabGroup: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  centerSlot: {
    width: 66,
    height: '100%',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 5,
  },
  menuCaption: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  tabButton: {
    flex: 1,
    minWidth: 0,
    height: 50,
    marginHorizontal: 1,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 2,
  },
  tabButtonActive: {
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.13)',
  },
  tabIcon: {
    width: 28,
    height: 28,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabLabel: {
    maxWidth: '95%',
    fontSize: 9.5,
    lineHeight: 12,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  tabLabelActive: {
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.78,
    transform: [{ scale: 0.97 }],
  },
  menuButtonOuter: {
    position: 'absolute',
    top: -22,
    left: '50%',
    width: 62,
    height: 62,
    marginLeft: -31,
    padding: 4,
    borderRadius: 31,
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 9 },
    shadowOpacity: 0.34,
    shadowRadius: 13,
    elevation: 18,
  },
  menuButton: {
    flex: 1,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.42)',
    overflow: 'hidden',
  },
  menuButtonGlow: {
    position: 'absolute',
    top: -22,
    left: -12,
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: 'rgba(255,255,255,0.24)',
  },
  menuNotificationDot: {
    position: 'absolute',
    top: 9,
    right: 9,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#34D399',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  menuButtonPressed: {
    transform: [{ translateY: 2 }, { scale: 0.96 }],
    shadowOpacity: 0.2,
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.24)',
  },
  menuPanel: {
    position: 'absolute',
    alignSelf: 'center',
    borderRadius: 28,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.22,
    shadowRadius: 34,
    elevation: 28,
    overflow: 'hidden',
  },
  menuHandle: {
    width: 34,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(124,107,184,0.28)',
    alignSelf: 'center',
    marginBottom: 11,
  },
  menuHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 11,
  },
  avatarRing: {
    width: 46,
    height: 46,
    borderRadius: 16,
    padding: 2,
  },
  avatarInner: {
    flex: 1,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarInitials: {
    fontSize: 14,
    fontWeight: '900',
  },
  menuHeaderCopy: {
    flex: 1,
    minWidth: 0,
    marginLeft: 11,
  },
  menuEyebrow: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.35,
    marginBottom: 2,
  },
  menuTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.45,
  },
  menuHeaderDescription: {
    marginTop: 2,
    fontSize: 9.5,
    lineHeight: 12,
    fontWeight: '600',
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 13,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  menuTile: {
    flexGrow: 1,
    flexBasis: '47%',
    minWidth: 122,
    height: 140,
    borderRadius: 19,
    borderWidth: 1,
    padding: 8,
    overflow: 'hidden',
  },
  menuTilePressed: {
    opacity: 0.86,
    transform: [{ scale: 0.975 }],
  },
  menuArtwork: {
    width: '100%',
    height: 82,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.62)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 7,
    backgroundColor: '#F8F5EF',
  },
  menuArtworkImage: {
    width: '100%',
    height: '100%',
  },
  menuTileCopy: {
    flex: 1,
    minWidth: 0,
    paddingTop: 7,
    paddingHorizontal: 2,
  },
  menuTileLabel: {
    fontSize: 12.5,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  menuTileDescription: {
    fontSize: 9.5,
    fontWeight: '600',
    marginTop: 3,
  },
  menuFooter: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  settingsAction: {
    minHeight: 70,
    borderWidth: 1,
    borderRadius: 16,
    padding: 7,
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingsArtwork: {
    width: 64,
    height: 56,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.62)',
    backgroundColor: '#F8F5EF',
  },
  settingsArtworkImage: {
    width: '100%',
    height: '100%',
  },
  settingsCopy: {
    flex: 1,
    minWidth: 0,
    marginLeft: 9,
  },
  footerActionText: {
    fontSize: 12,
    fontWeight: '800',
  },
  settingsDescription: {
    fontSize: 9.5,
    fontWeight: '600',
    marginTop: 2,
  },
  panelPointer: {
    position: 'absolute',
    bottom: -7,
    left: '50%',
    width: 16,
    height: 16,
    marginLeft: -8,
    transform: [{ rotate: '45deg' }],
  },
});
