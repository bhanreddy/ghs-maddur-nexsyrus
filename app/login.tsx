import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  TextInput,
  ActivityIndicator,
  Switch,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  FadeInDown,
  FadeInUp,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withRepeat,
  withSequence,
  interpolate,
  interpolateColor,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/src/hooks/useAuth';
import { useTheme } from '@/src/hooks/useTheme';
import { showAlert } from '@/src/components/CustomAlert';
import { AuthService } from '@/src/services/authService';
import LogoLoader from '../src/components/LogoLoader';
import { SCHOOL_NAME } from '@/src/constants/school';

const { width, height } = Dimensions.get('window');

// ─── Design Tokens ────────────────────────────────────────────────────────────


import { useLoginTheme } from '@/src/hooks/useLoginTheme';
import { DecorRing, FloatingInput, SignInButton } from '@/src/components/auth/LoginShared';

// ─── Main Screen ──────────────────────────────────────────────────────────────

const StudentLoginScreen: React.FC = () => {
  const C = useLoginTheme();
  const styles = getStyles(C);
  const router = useRouter();
  const { t } = useTranslation();
  const { user, loading: authLoading, signIn } = useAuth();

  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  // ── Restore saved credentials ──────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const savedEmail = await AsyncStorage.getItem('student_saved_email');
        const savedPassword = Platform.OS !== 'web'
          ? await SecureStore.getItemAsync('student_saved_password')
          : await AsyncStorage.getItem('student_saved_password');
        const autoLogin = await AsyncStorage.getItem('student_auto_login');

        if (savedEmail && savedPassword) {
          setEmail(savedEmail);
          setPassword(savedPassword);
          setRememberMe(true);

          if (autoLogin === 'true') {
            // Silently attempt to log in using the saved credentials
            setLoading(true);
            try {
              const response = await signIn(savedEmail, savedPassword);
              // If the auto-login resolved to a non-student role, sign out (wrong portal)
              const autoRole = response?.session?.validatedUser?.role?.code;
              if (response?.session && autoRole !== 'student') {
                await AuthService.signOut();
              }
            } catch (err) {
              // Ignore silent login errors, let user press sign in
            } finally {
              setLoading(false);
            }
          }
        }
      } catch (_) { }
    })();
  }, []);

  if (authLoading || user) {
    return (
      <View style={styles.loadingScreen}>
        <LogoLoader size={56} color={C.accent} />
      </View>
    );
  }

  // ── Validate & login ───────────────────────────────────────────────────────
  const handleLogin = async () => {
    let hasErr = false;
    if (!email) { setEmailError('Email is required'); hasErr = true; }
    if (!password) { setPasswordError('Password is required'); hasErr = true; }
    if (hasErr) return;

    setLoading(true);
    try {
      const response = await signIn(email, password);

      if (response.error || !response.session) {
        showAlert({ type: 'error', title: 'Login Failed', message: response.error || 'Invalid credentials' });
        return;
      }

      const userRole = response.session.validatedUser.role.code;

      if (userRole === 'student') {
        if (rememberMe) {
          await AsyncStorage.setItem('student_saved_email', email);
          Platform.OS !== 'web'
            ? await SecureStore.setItemAsync('student_saved_password', password)
            : await AsyncStorage.setItem('student_saved_password', password);
          await AsyncStorage.setItem('student_auto_login', 'true');
        } else {
          await AsyncStorage.removeItem('student_saved_email');
          Platform.OS !== 'web'
            ? await SecureStore.deleteItemAsync('student_saved_password')
            : await AsyncStorage.removeItem('student_saved_password');
          await AsyncStorage.removeItem('student_auto_login');
        }
      } else {
        showAlert({
          type: 'warning',
          title: 'Access Restricted',
          message: 'This login is for students only. Please use the Staff or Admin login.',
        });
        await AuthService.signOut();
      }
    } catch (err: any) {
      showAlert({ type: 'error', title: 'Login Failed', message: err.message || 'Invalid credentials' });
    } finally {
      setLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <View style={styles.root}>
      <StatusBar barStyle={C.isDark ? "light-content" : "dark-content"} backgroundColor="transparent" translucent />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1, backgroundColor: 'transparent' }}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          showsVerticalScrollIndicator={false}
          bounces={false}
          keyboardShouldPersistTaps="handled"
        >

          {/* ── HERO HEADER ─────────────────────────────────────────────── */}
          <View style={styles.heroWrap}>
            <LinearGradient
              colors={[C.bg, C.accentLight, C.accentLight]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.hero}
            >
              {/* Decorative rings */}
              <DecorRing size={320} x={-100} y={-80} color="rgba(6,182,212,0.18)" />
              <DecorRing size={200} x={-50} y={-30} color="rgba(6,182,212,0.10)" borderWidth={1} />
              <DecorRing size={260} x={width - 100} y={60} color="rgba(6,182,212,0.14)" />
              <DecorRing size={160} x={width - 60} y={100} color="rgba(6,182,212,0.08)" borderWidth={1} />

              {/* Solid accent dot — top right */}
              <View style={styles.heroDot} />

              <SafeAreaView edges={['top']} style={styles.heroContent}>
                {/* School badge */}
                <Animated.View
                  entering={FadeInDown.delay(0).duration(600)}
                  style={styles.schoolBadge}
                >
                  <View style={styles.badgeDot} />
                  <Text style={styles.badgeText}>STUDENT PORTAL</Text>
                </Animated.View>

                {/* Logo */}
                <Animated.View
                  entering={FadeInDown.delay(80).duration(700).springify()}
                  style={styles.logoRing}
                >
                  <LinearGradient
                    colors={[C.isDark ? C.surface : '#FFFFFF', C.surfaceAlt]}
                    style={styles.logoRingInner}
                  >
                    <LogoLoader size={52} color={C.accentDark} />
                  </LinearGradient>
                </Animated.View>

                {/* School name */}
                <Animated.Text
                  entering={FadeInDown.delay(160).duration(600)}
                  style={styles.schoolName}
                  numberOfLines={2}
                  adjustsFontSizeToFit
                >
                  {SCHOOL_NAME}
                </Animated.Text>

                <Animated.Text
                  entering={FadeInDown.delay(220).duration(500)}
                  style={styles.heroTagline}
                >
                  Grades · Timetable · Campus Services
                </Animated.Text>
              </SafeAreaView>
            </LinearGradient>

            {/* Curved bottom mask */}
            <View style={styles.heroBottomCurve} />
          </View>

          {/* ── FORM BODY ────────────────────────────────────────────────── */}
          <View style={styles.body}>

            {/* Form card */}
            <Animated.View
              entering={FadeInUp.delay(100).duration(600).springify()}
              style={styles.card}
            >
              {/* Card header */}
              <View style={styles.cardHeader}>
                <View>
                  <Text style={styles.cardTitle}>
                    {t('welcomeBack') || 'Welcome back'}
                  </Text>
                  <Text style={styles.cardSubtitle}>
                    {t('signInToContinue') || 'Sign in to your account'}
                  </Text>
                </View>
                <View style={styles.accentPill}>
                  <Ionicons name="shield-checkmark" size={13} color={C.accentDark} />
                  <Text style={styles.accentPillText}>Secure</Text>
                </View>
              </View>

              {/* Divider */}
              <View style={styles.cardDivider} />

              {/* Email */}
              <View style={styles.fieldGap}>
                <FloatingInput
                  label={t('emailAddress') || 'Email Address'}
                  value={email}
                  onChangeText={(v) => { setEmail(v); setEmailError(''); }}
                  icon="mail-outline"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  hasError={!!emailError}
                  errorText={emailError}
                  delay={200}
                />
              </View>

              {/* Password */}
              <View style={styles.fieldGap}>
                <FloatingInput
                  label={t('password') || 'Password'}
                  value={password}
                  onChangeText={(v) => { setPassword(v); setPasswordError(''); }}
                  icon="lock-closed-outline"
                  secureTextEntry={!showPassword}
                  hasError={!!passwordError}
                  errorText={passwordError}
                  delay={280}
                  rightAction={
                    <TouchableOpacity
                      onPress={() => setShowPassword(!showPassword)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons
                        name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                        size={19}
                        color={C.inkSoft}
                      />
                    </TouchableOpacity>
                  }
                />
              </View>

              {/* Remember me + Forgot password */}
              <Animated.View
                entering={FadeInDown.delay(360).duration(500)}
                style={styles.rememberRow}
              >
                <TouchableOpacity
                  onPress={() => setRememberMe(!rememberMe)}
                  style={styles.rememberTap}
                  activeOpacity={0.7}
                >
                  <View style={[
                    styles.rememberBox,
                    rememberMe && styles.rememberBoxActive,
                  ]}>
                    {rememberMe && (
                      <Ionicons name="checkmark" size={11} color="#fff" />
                    )}
                  </View>
                  <Text style={styles.rememberText}>Remember me</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => router.push('/forgot-password')}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.forgotText}>
                    {t('forgotPassword') || 'Forgot password?'}
                  </Text>
                </TouchableOpacity>
              </Animated.View>

              {/* Sign in button */}
              <View style={styles.btnWrap}>
                <SignInButton
                  onPress={handleLogin}
                  loading={loading}
                  label={t('signIn') || 'Sign In'}
                />
              </View>

              {/* Trust strip */}
              <Animated.View
                entering={FadeInUp.delay(600).duration(500)}
                style={styles.trustStrip}
              >
                <View style={styles.trustItem}>
                  <Ionicons name="lock-closed" size={11} color={C.inkGhost} />
                  <Text style={styles.trustText}>256-bit encrypted</Text>
                </View>
                <View style={styles.trustDot} />
                <View style={styles.trustItem}>
                  <Ionicons name="shield-outline" size={11} color={C.inkGhost} />
                  <Text style={styles.trustText}>Secure login</Text>
                </View>
                <View style={styles.trustDot} />
                <View style={styles.trustItem}>
                  <Ionicons name="server-outline" size={11} color={C.inkGhost} />
                  <Text style={styles.trustText}>Data protected</Text>
                </View>
              </Animated.View>
            </Animated.View>

            {/* Help row */}
            <Animated.View
              entering={FadeInUp.delay(700).duration(500)}
              style={styles.helpRow}
            >
              <Ionicons name="help-circle-outline" size={14} color={C.inkGhost} />
              <Text style={styles.helpText}>
                Having trouble?{' '}
                <Text style={styles.helpLink}>Contact your school admin</Text>
              </Text>
            </Animated.View>

            {/* Footer */}
            <Animated.View
              entering={FadeInUp.delay(800).duration(400)}
              style={styles.footer}
            >
              <View style={styles.footerDivider} />
              <Text style={styles.footerText}>
                Powered by{' '}
                <Text style={styles.footerBrand}>NexSyrus</Text>
              </Text>
            </Animated.View>

          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

export default StudentLoginScreen;

// ─── Stylesheet ───────────────────────────────────────────────────────────────

const getStyles = (C: ReturnType<typeof useLoginTheme>) => StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },
  loadingScreen: {
    flex: 1,
    backgroundColor: C.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── Hero ──────────────────────────────────────────────────────────────────
  heroWrap: {
    position: 'relative',
  },
  hero: {
    paddingBottom: 70,        // Extra space so curve overlap looks clean
    overflow: 'hidden',
  },
  heroDot: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: C.accent,
    top: 56,
    right: 28,
    opacity: 0.7,
  },
  heroContent: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  schoolBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.accentGlow,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: C.accentBorder,
    gap: 6,
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: C.accent,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.8,
    color: C.accentDeep,
  },
  logoRing: {
    width: 80,
    height: 80,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: C.accentBorder,
    marginBottom: 16,
    ...C.shadow.md,
    shadowColor: C.shadow.color,
  },
  logoRingInner: {
    flex: 1,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  schoolName: {
    fontSize: 22,
    fontWeight: '800',
    color: C.ink,
    letterSpacing: -0.5,
    textAlign: 'center',
    marginBottom: 8,
    paddingHorizontal: 12,
  },
  heroTagline: {
    fontSize: 12,
    color: C.inkMid,
    letterSpacing: 0.4,
    fontWeight: '500',
  },
  heroBottomCurve: {
    position: 'absolute',
    bottom: -1,
    left: 0,
    right: 0,
    height: 50,
    backgroundColor: C.bg,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
  },

  // ── Body ──────────────────────────────────────────────────────────────────
  body: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 32,
    ...Platform.select({
      web: { alignItems: 'center' } as any,
    }),
  },

  // ── Form Card ─────────────────────────────────────────────────────────────
  card: {
    backgroundColor: C.surface,
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: C.borderNeutral,
    ...C.shadow.lg,
    shadowColor: C.shadow.color,
    ...Platform.select({
      web: { width: '100%', maxWidth: 480 } as any,
    }),
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: C.ink,
    letterSpacing: -0.5,
    marginBottom: 3,
  },
  cardSubtitle: {
    fontSize: 13,
    color: C.inkSoft,
    fontWeight: '400',
  },
  accentPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.accentGlow,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: C.accentBorder,
  },
  accentPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: C.accentDark,
    letterSpacing: 0.3,
  },
  cardDivider: {
    height: 1,
    backgroundColor: C.borderNeutral,
    marginBottom: 24,
  },

  // ── Input ─────────────────────────────────────────────────────────────────
  fieldGap: {
    marginBottom: 16,
  },
  inputOuter: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1.5,
    minHeight: 58,
    paddingHorizontal: 14,
    shadowColor: C.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
  },
  inputIconWrap: {
    width: 28,
    alignItems: 'center',
    marginRight: 4,
  },
  inputLabelArea: {
    flex: 1,
    height: 58,
    justifyContent: 'center',
    paddingTop: 14,
  },
  floatingLabel: {
    position: 'absolute',
    left: 0,
    fontSize: 14,
    fontWeight: '500',
    transformOrigin: 'left',
  },
  textInput: {
    fontSize: 15,
    color: C.ink,
    fontWeight: '500',
    paddingVertical: 0,
    height: 26,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
  },
  inputRightSlot: {
    paddingLeft: 8,
  },
  errorLabel: {
    fontSize: 11,
    color: C.error,
    marginTop: 5,
    marginLeft: 14,
    fontWeight: '500',
  },

  // ── Remember / Forgot row ─────────────────────────────────────────────────
  rememberRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 28,
    marginTop: 4,
  },
  rememberTap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rememberBox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: C.borderNeutral,
    backgroundColor: C.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rememberBoxActive: {
    backgroundColor: C.accent,
    borderColor: C.accent,
  },
  rememberText: {
    fontSize: 13,
    color: C.inkSoft,
    fontWeight: '500',
  },
  forgotText: {
    fontSize: 13,
    fontWeight: '600',
    color: C.accent,
  },

  // ── Sign In Button ────────────────────────────────────────────────────────
  btnWrap: {
    marginBottom: 20,
  },
  btnTouch: {
    borderRadius: 16,
    overflow: 'hidden',
    ...C.shadow.md,
    shadowColor: C.accentDeep,
  },
  btnGradient: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  btnLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  btnArrow: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Trust strip ───────────────────────────────────────────────────────────
  trustStrip: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  trustItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  trustText: {
    fontSize: 10,
    color: C.inkGhost,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  trustDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: C.inkGhost,
    opacity: 0.5,
  },

  // ── Help + Footer ─────────────────────────────────────────────────────────
  helpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginTop: 20,
    marginBottom: 8,
  },
  helpText: {
    fontSize: 12,
    color: C.inkGhost,
    fontWeight: '400',
  },
  helpLink: {
    color: C.accent,
    fontWeight: '600',
  },
  footer: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 4,
  },
  footerDivider: {
    width: 36,
    height: 1,
    backgroundColor: C.borderNeutral,
    marginBottom: 10,
  },
  footerText: {
    fontSize: 11,
    color: C.inkGhost,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    fontWeight: '400',
  },
  footerBrand: {
    fontWeight: '700',
    color: C.inkSoft,
    letterSpacing: 1.2,
  },
});