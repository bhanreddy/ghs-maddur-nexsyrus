import React, { useContext, useEffect } from 'react';
import { setTourBlocked } from '../features/app-tour/registry';
import { ActivityIndicator, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { ThemeContext } from '../context/ThemeContext';
import { useAppFingerprintLock } from '../hooks/useAppFingerprintLock';
import { isFingerprintPlatformSupported } from '../services/biometricService';

/**
 * FingerprintLockGate — the opaque, touch-blocking cover shown over the whole
 * app while an opted-in staff/admin account waits for its fingerprint.
 *
 * Rendered last in the layout tree (and above the auth loader's z-index) so it
 * paints over every screen, including anything the router restored. While the
 * lock decision is still being made it renders the same opaque surface with no
 * copy, so no protected content is ever briefly visible on a cold start.
 *
 * On web and Tauri desktop it renders nothing at all.
 */
export default function FingerprintLockGate() {
  const { t } = useTranslation();
  const theme = useContext(ThemeContext)?.theme;
  const background = theme?.colors?.background ?? '#FFFFFF';
  const accent = theme?.colors?.primary ?? '#4F46E5';
  const textStrong = theme?.colors?.textStrong ?? '#111827';
  const textMuted = theme?.colors?.textMuted ?? '#6B7280';

  // Hooks must run unconditionally, so the platform check gates the render.
  const {
    status,
    prompting,
    failureMessage,
    privacyCovered,
    retry,
    fallbackToPassword,
  } =
    useAppFingerprintLock();

  useEffect(() => {
    setTourBlocked('fingerprint', isFingerprintPlatformSupported() && (status !== 'unlocked' || privacyCovered));
    return () => setTourBlocked('fingerprint', false);
  }, [status, privacyCovered]);

  if (
    !isFingerprintPlatformSupported() ||
    (status === 'unlocked' && !privacyCovered)
  ) {
    return null;
  }

  const resolving = status === 'resolving' || privacyCovered;

  return (
    <View
      // Blocks every touch underneath, including the navigator.
      pointerEvents="auto"
      accessibilityViewIsModal
      style={[StyleSheet.absoluteFill, styles.overlay, { backgroundColor: background }]}
    >
      {resolving ? null : (
        <View style={styles.content}>
          <View style={[styles.iconRing, { borderColor: accent }]}>
            <Ionicons name="finger-print" size={44} color={accent} />
          </View>

          <Text style={[styles.title, { color: textStrong }]}>{t('appLocked')}</Text>
          <Text style={[styles.subtitle, { color: textMuted }]}>
            {failureMessage || t('pleaseUnlockWithBiometrics')}
          </Text>

          {prompting ? (
            <ActivityIndicator style={styles.spinner} size="small" color={accent} />
          ) : (
            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: accent }]}
                onPress={() => void retry()}
                activeOpacity={0.85}
                accessibilityRole="button"
              >
                <Ionicons name="finger-print" size={17} color="#FFFFFF" />
                <Text style={styles.primaryBtnText}>{t('fingerprint.tryAgain')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={() => void fallbackToPassword()}
                activeOpacity={0.7}
                accessibilityRole="button"
              >
                <Text style={[styles.secondaryBtnText, { color: textMuted }]}>
                  {t('fingerprint.usePassword')}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    // Must beat AuthGate's 99999 so the lock is never painted under the
    // auth loader once auth resolves.
    zIndex: 100000,
    elevation: 100000,
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({ web: { position: 'fixed' } as any }),
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 32,
    maxWidth: 420,
    width: '100%',
  },
  iconRing: {
    width: 92,
    height: 92,
    borderRadius: 46,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 22,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 26,
  },
  spinner: { marginTop: 4 },
  actions: { width: '100%', alignItems: 'center', gap: 12 },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 14,
    width: '100%',
    maxWidth: 320,
  },
  primaryBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  secondaryBtn: { paddingVertical: 10, paddingHorizontal: 16 },
  secondaryBtnText: { fontSize: 14, fontWeight: '600' },
});
