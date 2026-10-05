import { TourTarget } from '@/src/features/app-tour';
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Redirect, useRouter } from 'expo-router';
import { canUseAdminNotificationBroadcast } from '../src/components/AdminNotificationSwitcher';
import NotificationInboxList from '../src/components/NotificationInboxList';
import { useAuth } from '../src/hooks/useAuth';
import { useTheme } from '../src/hooks/useTheme';

export default function NotificationsScreen() {
  const router = useRouter();
  const { theme, isDark } = useTheme();
  const { role } = useAuth();

  if (canUseAdminNotificationBroadcast(role)) {
    return <Redirect href={'/admin/notifications' as any} />;
  }

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <TourTarget id="screen.notifications.overview" native><View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={({ pressed }) => [styles.backButton, { backgroundColor: isDark ? '#1C1E38' : '#FFFFFF', borderColor: theme.colors.border }, pressed && styles.pressed]}
        >
          <Ionicons name="arrow-back" size={20} color={theme.colors.textStrong} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: theme.colors.textStrong }]}>Notifications</Text>
          <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>
            Your recent school updates
          </Text>
        </View>
        <Pressable
          onPress={() => router.push('/updates' as any)}
          accessibilityRole="button"
          accessibilityLabel="Open missed updates"
          style={({ pressed }) => [styles.backButton, { backgroundColor: isDark ? '#1C1E38' : '#FFFFFF', borderColor: theme.colors.border }, pressed && styles.pressed]}
        >
          <Ionicons name="megaphone-outline" size={18} color={theme.colors.textStrong} />
        </Pressable>
      </View></TourTarget>
      <TourTarget id="screen.notifications.workspace"><NotificationInboxList /></TourTarget>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { minHeight: 82, paddingHorizontal: 18, paddingTop: Platform.OS === 'ios' ? 18 : 22, paddingBottom: 14, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
  backButton: { width: 42, height: 42, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  headerCopy: { flex: 1 },
  title: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { marginTop: 3, fontSize: 13, fontWeight: '500' },
  pressed: { opacity: 0.72, transform: [{ scale: 0.96 }] },
});
