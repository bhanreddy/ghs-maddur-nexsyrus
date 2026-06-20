import { FontAwesome5, Ionicons, MaterialIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dimensions,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  FadeInLeft,
  FadeInRight,
  FadeInUp,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  ZoomIn,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SCHOOL_NAME } from "../src/constants/school";
import { SCHOOL_CONFIG, schoolColorWithAlpha } from "../src/constants/schoolConfig";
import { useAuth } from "../src/hooks/useAuth";
import { useTheme } from "../src/hooks/useTheme";
import { AuthService } from "../src/services/authService";
import { isStudentRole } from "../src/utils/roleHelpers";

const { width } = Dimensions.get("window");

/* ─── Theme ──────────────────────────────────────────────────────────────── */
const useWelcomeTheme = () => {
  const { theme } = useTheme();
  const p = theme.colors.primary;
  const pD = theme.colors.primaryDark;
  const rgba = schoolColorWithAlpha;

  return {
    p, pD,
    c50: rgba(p, 0.04),
    c100: rgba(p, 0.09),
    c200: rgba(p, 0.18),
    c500: p,
    c600: pD,
    c700: pD,

    page: theme.colors.background,
    surface: "#FFFFFF",

    ink: theme.colors.textStrong,
    inkB: theme.colors.textPrimary,
    inkC: theme.colors.textSecondary,
    inkD: theme.colors.textMuted,

    teal: "#0D9488",
    tealBg: "rgba(13,148,136,0.07)",
    tealBorder: "rgba(13,148,136,0.16)",

    indigo: "#4F46E5",
    indigoBg: "rgba(79,70,229,0.07)",
    indigoBorder: "rgba(79,70,229,0.16)",

    amber: "#B45309",
    amberBg: "rgba(180,83,9,0.07)",
    amberBorder: "rgba(180,83,9,0.16)",

    crimson: "#BE123C",
    crimsonBg: "rgba(190,18,60,0.07)",
    crimsonBorder: "rgba(190,18,60,0.16)",

    border: "rgba(0,0,0,0.07)",
    borderMed: "rgba(0,0,0,0.11)",
    accentGlow: rgba(p, 0.08),
    accentBorder: rgba(p, 0.16),
    accentSoft: rgba(p, 0.04),
    secondary: theme.colors.secondary,
  } as const;
};

type WTheme = ReturnType<typeof useWelcomeTheme>;

/* ─── Live Dot ───────────────────────────────────────────────────────────── */
const LiveDot = ({ color }: { color: string }) => {
  const s = useSharedValue(1);
  useEffect(() => {
    s.value = withRepeat(
      withSequence(
        withTiming(2.4, { duration: 900 }),
        withTiming(1.0, { duration: 900 }),
      ), -1, false,
    );
  }, []);
  const ring = useAnimatedStyle(() => ({
    transform: [{ scale: s.value }],
    opacity: interpolate(s.value, [1, 2.4], [0.55, 0]),
  }));
  return (
    <View style={styles.liveDotWrap}>
      <Animated.View style={[styles.liveDotRing, { borderColor: color }, ring]} />
      <View style={[styles.liveDotCore, { backgroundColor: color }]} />
    </View>
  );
};

/* ─── Premium Crest ──────────────────────────────────────────────────────── */
const PremiumCrest = ({
  gradStart, gradEnd, ringColor, dashedColor,
}: {
  gradStart: string; gradEnd: string; ringColor: string; dashedColor: string;
}) => {
  const pulse = useSharedValue(1);
  const rot = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.045, { duration: 2600, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.975, { duration: 2600, easing: Easing.inOut(Easing.sin) }),
      ), -1, true,
    );
    rot.value = withRepeat(
      withTiming(360, { duration: 22000, easing: Easing.linear }),
      -1, false,
    );
  }, []);

  const crestAnim = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  const dashedAnim = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.value}deg` }] }));

  return (
    <View style={styles.crestStage}>
      <Animated.View style={[styles.crestDashed, { borderColor: dashedColor }, dashedAnim]} />
      <View style={[styles.crestMidRing, { borderColor: ringColor }]} />
      <Animated.View style={crestAnim}>
        <LinearGradient
          colors={[gradStart, gradEnd]}
          start={{ x: 0.12, y: 0 }}
          end={{ x: 0.88, y: 1 }}
          style={styles.crestCore}
        >
          <View style={styles.crestGlint} />
          <Image source={SCHOOL_CONFIG.logo} style={styles.crestLogo} />
        </LinearGradient>
      </Animated.View>
    </View>
  );
};

/* ─── Portal Card (secondary roles) ─────────────────────────────────────── */
interface PortalCardProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  accent: string;
  accentBg: string;
  accentBorder: string;
  onPress: () => void;
  index: number;
  numLabel: string;
}

const PortalCard = ({
  icon, title, subtitle,
  accent, accentBg, accentBorder,
  onPress, index, numLabel,
}: PortalCardProps) => {
  const pressed = useSharedValue(0);
  const entering = index % 2 === 0 ? FadeInLeft : FadeInRight;

  const onPressIn = useCallback(() => {
    pressed.value = withTiming(1, { duration: 80 });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);
  const onPressOut = useCallback(() => {
    pressed.value = withSpring(0, { stiffness: 360, damping: 20 });
  }, []);

  const anim = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(pressed.value, [0, 1], [1, 0.972]) }],
  }));

  return (
    <Animated.View
      entering={entering.delay(420 + index * 65).duration(460).springify()}
      style={[styles.portalCard, anim]}
    >
      <Pressable
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={styles.portalInner}
      >
        <View style={[styles.portalBar, { backgroundColor: accent }]} />
        <Text style={[styles.portalGhost, { color: accent }]}>{numLabel}</Text>
        <View style={[styles.portalIconBox, { backgroundColor: accentBg, borderColor: accentBorder }]}>
          {icon}
        </View>
        <View style={styles.portalText}>
          <Text style={styles.portalTitle} numberOfLines={1}>{title}</Text>
          <Text style={styles.portalSub} numberOfLines={1}>{subtitle}</Text>
        </View>
        <View style={[styles.portalArrow, { backgroundColor: accentBg, borderColor: accentBorder }]}>
          <Ionicons name="chevron-forward" size={13} color={accent} />
        </View>
      </Pressable>
    </Animated.View>
  );
};

/* ─── MAIN ───────────────────────────────────────────────────────────────── */
export default function Index() {
  const router = useRouter();
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  const insets = useSafeAreaInsets();
  const C = useWelcomeTheme();

  /* Student card press */
  const studentPressed = useSharedValue(0);
  const onStudentIn = useCallback(() => {
    studentPressed.value = withTiming(1, { duration: 90 });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, []);
  const onStudentOut = useCallback(() => {
    studentPressed.value = withSpring(0, { stiffness: 320, damping: 18 });
  }, []);
  const studentAnim = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(studentPressed.value, [0, 1], [1, 0.968]) }],
  }));

  /* ── Student session persistence guard ───────────────────────── */
  const [studentCheckDone, setStudentCheckDone] = useState(false);
  useEffect(() => {
    if (loading || user) return;
    AuthService.getSession().then((storedSession) => {
      const storedRole = storedSession?.validatedUser?.role?.code;
      if (isStudentRole(storedRole)) {
        if (__DEV__) console.log('[welcome] Student session found in storage — auto-navigating to student dashboard');
        router.replace('/(tabs)/home');
      } else {
        setStudentCheckDone(true);
      }
    }).catch(() => {
      setStudentCheckDone(true);
    });
  }, [loading, user]);

  if (loading || user || !studentCheckDone) {
    return <View style={{ flex: 1, backgroundColor: C.page }} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.page }}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1 }}
        bounces={false}
        showsVerticalScrollIndicator={false}
      >
        {/* ═══════════════════════════════════════════════════════
            HERO  (reduced height)
            ═══════════════════════════════════════════════════════ */}
        <View style={[styles.hero, { paddingTop: insets.top + 14 }]}>

          <LinearGradient
            colors={[C.c50, "#F9FAFB", C.c100, "#FFFFFF"]}
            locations={[0, 0.3, 0.65, 1]}
            start={{ x: 0.15, y: 0 }}
            end={{ x: 0.85, y: 1 }}
            style={StyleSheet.absoluteFill}
          />

          <View
            pointerEvents="none"
            style={[styles.haloBg, { borderColor: C.accentBorder }]}
          />
          <View
            pointerEvents="none"
            style={[styles.haloBg2, { borderColor: C.accentSoft }]}
          />

          <View style={styles.heroContent}>

            {/* ── Top row: school pill + Startup India (stacked) ── */}
            <View style={styles.heroTopRow}>
              <Animated.View
                entering={FadeInDown.delay(60).duration(500)}
                style={[styles.schoolPill, {
                  borderColor: C.accentBorder,
                  backgroundColor: "rgba(255,255,255,0.9)",
                }]}
              >
                <View style={[styles.pillLogoRing, { borderColor: C.accentBorder }]}>
                  <Image source={SCHOOL_CONFIG.logo} style={styles.pillLogo} />
                </View>
                <Text style={[styles.pillName, { color: C.inkB }]} numberOfLines={1}>
                  {SCHOOL_CONFIG.name}
                </Text>
                <LiveDot color={C.c500} />
              </Animated.View>

              <Animated.View
                entering={FadeInDown.delay(0).duration(520).springify()}
                style={styles.credHeroWrap}
              >
                <LinearGradient
                  colors={["#FFFFFF", "rgba(255,153,51,0.06)", "#FFFCF8", "rgba(19,136,8,0.04)", "#FFFFFF"]}
                  locations={[0, 0.22, 0.5, 0.78, 1]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.credHeroCard, { borderColor: C.accentBorder }]}
                >
                  <View style={styles.credRibbon}>
                    <View style={[styles.credRibbonSeg, { backgroundColor: "#FF9933" }]} />
                    <View style={[
                      styles.credRibbonSeg,
                      {
                        backgroundColor: "#FFFFFF",
                        borderTopWidth: 0.5,
                        borderBottomWidth: 0.5,
                        borderColor: "rgba(0,0,0,0.08)",
                        alignItems: "center",
                        justifyContent: "center",
                      },
                    ]}>
                      <View style={styles.credAshoka} />
                    </View>
                    <View style={[styles.credRibbonSeg, { backgroundColor: "#138808" }]} />
                  </View>

                  <View style={[styles.credLogoRing, styles.credHeroLogoRing, { borderColor: C.accentBorder }]}>
                    <View style={[styles.credLogoInner, styles.credHeroLogoInner, { borderColor: C.accentSoft }]}>
                      <Image
                        source={require("../assets/images/startup-india.png")}
                        style={styles.credHeroLogo}
                      />
                    </View>
                  </View>

                  <View style={styles.credDivider} />

                  <View style={styles.credText}>
                    <View style={styles.credEyebrowRow}>
                      <Ionicons name="star" size={7} color="#FF9933" />
                      <Text style={styles.credEyebrow}>DPIIT RECOGNIZED</Text>
                    </View>
                    <Text style={[styles.credTitle, styles.credHeroTitle, { color: C.ink }]} numberOfLines={1}>
                      Startup India
                    </Text>
                    <View style={styles.credMetaRow}>
                      <Text style={styles.credSub} numberOfLines={1}>Govt. of India</Text>
                      <View style={[styles.credMetaDot, { backgroundColor: C.inkD }]} />
                      <View style={[styles.credVerifiedChip, styles.credHeroVerifiedChip, { backgroundColor: C.accentGlow, borderColor: C.accentBorder }]}>
                        <Ionicons name="shield-checkmark" size={8} color={C.c600} />
                        <Text style={[styles.credVerified, { color: C.c600 }]}>Verified</Text>
                      </View>
                    </View>
                  </View>

                  <View style={[styles.credBadgePill, styles.credHeroBadge, {
                    backgroundColor: C.accentGlow,
                    borderColor: C.accentBorder,
                  }]}>
                    <Ionicons name="ribbon" size={11} color={C.c600} />
                  </View>
                </LinearGradient>
              </Animated.View>
            </View>

            {/* ── Premium crest (136 px) ───────────────────────── */}
            <Animated.View
              entering={ZoomIn.delay(80).duration(720).springify()}
              style={{ marginBottom: 14 }}
            >
              <PremiumCrest
                gradStart={C.c500}
                gradEnd={C.c700}
                ringColor={C.c100}
                dashedColor={C.accentBorder}
              />
            </Animated.View>

            {/* ── School name ─────────────────────────────────── */}
            <Animated.View
              entering={FadeInDown.delay(160).duration(600)}
              style={styles.nameBlock}
            >
              <Text
                style={[styles.schoolNameText, { color: C.ink }]}
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                {SCHOOL_NAME || SCHOOL_CONFIG.name}
              </Text>

              {SCHOOL_CONFIG.tagline ? (
                <Animated.View
                  entering={FadeInDown.delay(230).duration(420)}
                  style={[styles.taglinePill, {
                    backgroundColor: C.accentGlow,
                    borderColor: C.accentBorder,
                  }]}
                >
                  <Text style={[styles.taglineText, { color: C.c600 }]}>
                    {SCHOOL_CONFIG.tagline}
                  </Text>
                </Animated.View>
              ) : null}

              {SCHOOL_CONFIG.motto ? (
                <Animated.Text
                  entering={FadeInDown.delay(290).duration(400)}
                  style={[styles.mottoText, { color: C.inkC }]}
                >
                  &ldquo;{SCHOOL_CONFIG.motto}&rdquo;
                </Animated.Text>
              ) : null}
            </Animated.View>

          </View>

          <View style={[styles.heroCurve, { backgroundColor: C.page }]} />
        </View>

        {/* ═══════════════════════════════════════════════════════
            BODY
            ═══════════════════════════════════════════════════════ */}
        <View style={styles.body}>

          {/* Section eyebrow */}
          <Animated.View
            entering={FadeInUp.delay(340).duration(400)}
            style={styles.eyebrow}
          >
            <View style={[styles.eyebrowLine, { backgroundColor: C.border }]} />
            <Text style={styles.eyebrowLabel}>SELECT YOUR PORTAL</Text>
            <View style={[styles.eyebrowLine, { backgroundColor: C.border }]} />
          </Animated.View>

          {/* ══ Student hero card ══════════════════════════════ */}
          <Animated.View
            entering={FadeInDown.delay(380).duration(560).springify()}
            style={[styles.studentCardWrap, studentAnim]}
          >
            <Pressable
              onPress={() => router.push("/login")}
              onPressIn={onStudentIn}
              onPressOut={onStudentOut}
              style={{ overflow: "hidden", borderRadius: 26 }}
            >
              <LinearGradient
                colors={[C.c500, C.c600, C.c700]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.studentGrad}
              >
                <Text style={styles.studentGhost}>01</Text>
                <View style={styles.studentGlow} />
                <View style={styles.studentGlow2} />

                <View style={styles.studentBody}>
                  <View style={styles.studentLeft}>
                    <View style={styles.studentBadge}>
                      <View style={styles.studentBadgePulse} />
                      <Text style={styles.studentBadgeText}>✦  PRIMARY PORTAL</Text>
                    </View>

                    <Text style={styles.studentTitle}>
                      {t("index.student_login") || "Student Portal"}
                    </Text>
                    <Text style={styles.studentSub}>
                      Grades · Attendance · Timetable
                    </Text>
                  </View>

                  <View style={styles.studentRight}>
                    <View style={styles.studentIconWrap}>
                      <FontAwesome5 name="user-graduate" size={26} color="#FFFFFF" />
                    </View>
                    <View style={styles.studentArrowBtn}>
                      <Ionicons name="arrow-forward" size={14} color={C.c600} />
                    </View>
                  </View>
                </View>

                <LinearGradient
                  colors={["transparent", "rgba(0,0,0,0.14)"]}
                  style={styles.studentVignette}
                />
              </LinearGradient>
            </Pressable>
          </Animated.View>

          {/* ══ Secondary portal cards ════════════════════════ */}
          <View style={styles.portalsStack}>

            <PortalCard
              index={0} numLabel="02"
              icon={<Ionicons name="people-outline" size={20} color={C.teal} />}
              title={t("index.staff_login") || "Staff Portal"}
              subtitle="Classes, records & reports"
              accent={C.teal} accentBg={C.tealBg} accentBorder={C.tealBorder}
              onPress={() => router.push("/staff-login")}
            />

            <PortalCard
              index={1} numLabel="03"
              icon={<MaterialIcons name="admin-panel-settings" size={21} color={C.indigo} />}
              title={t("index.admin_login") || "Admin Portal"}
              subtitle="Administration & management"
              accent={C.indigo} accentBg={C.indigoBg} accentBorder={C.indigoBorder}
              onPress={() => router.push("/admin-login")}
            />

            <PortalCard
              index={2} numLabel="04"
              icon={<Ionicons name="wallet-outline" size={20} color={C.amber} />}
              title={t("index.accounts_login") || "Accounts Portal"}
              subtitle="Finance & fee collections"
              accent={C.amber} accentBg={C.amberBg} accentBorder={C.amberBorder}
              onPress={() => router.push("/accounts-login")}
            />

            <PortalCard
              index={3} numLabel="05"
              icon={<Ionicons name="bus-outline" size={21} color={C.crimson} />}
              title="Driver Portal"
              subtitle="Live tracking & trip logs"
              accent={C.crimson} accentBg={C.crimsonBg} accentBorder={C.crimsonBorder}
              onPress={() => router.push("/driver-login")}
            />

          </View>

          {/* Footer */}
          <Animated.View entering={FadeInUp.delay(820).duration(400)} style={styles.footer}>
            <View style={[styles.footerRule, { backgroundColor: C.border }]} />
            <View style={styles.footerRow}>
              <View style={[styles.footerDot, { backgroundColor: C.inkD }]} />
              <Text style={styles.footerBrand}>POWERED BY NEXSYRUS</Text>
              <View style={[styles.footerDot, { backgroundColor: C.inkD }]} />
            </View>
            <Text style={styles.footerVersion}>v 2.0.0  ·  SchoolIMS</Text>
          </Animated.View>

        </View>
      </ScrollView>
    </View>
  );
}

/* ─── Styles ─────────────────────────────────────────────────────────────── */
const styles = StyleSheet.create({

  /* ── Hero (reduced) ────────────────────────────────────── */
  hero: {
    paddingBottom: 36,        // ↓ was 60
    overflow: "hidden",
    position: "relative",
  },
  heroContent: {
    paddingHorizontal: 24,
    alignItems: "center",
  },
  /* OPTION 1: stacked column (pill on top, cred card full-width below) */
  heroTopRow: {
    alignSelf: "stretch",
    gap: 12,
    marginBottom: 18,
  },
  heroCurve: {
    position: "absolute", bottom: -1, left: 0, right: 0,
    height: 28,               // ↓ was 44
    borderTopLeftRadius: 36, borderTopRightRadius: 36,
  },

  /* Halo decorations */
  haloBg: {
    position: "absolute",
    width: 240, height: 240, borderRadius: 120,
    borderWidth: 1,
    top: "18%",
    alignSelf: "center",
    opacity: 0.6,
  },
  haloBg2: {
    position: "absolute",
    width: 316, height: 316, borderRadius: 158,
    borderWidth: 1,
    top: "13%",
    alignSelf: "center",
    opacity: 0.35,
  },

  /* School pill */
  schoolPill: {
    flexDirection: "row", alignItems: "center",
    alignSelf: "flex-start",   // must not stretch full-width in a column
    flexShrink: 1,
    borderRadius: 100,
    paddingRight: 12, paddingLeft: 4, paddingVertical: 4,
    gap: 8, borderWidth: 1,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 10 },
      android: { elevation: 3 },
    }),
  },
  pillLogoRing: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: "#FFFFFF",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1,
  },
  pillLogo: { width: 22, height: 22, resizeMode: "contain" },
  /* name can breathe now that it owns its row */
  pillName: { fontSize: 12, fontWeight: "700", letterSpacing: 0.2, flexShrink: 1, maxWidth: width * 0.6 },

  /* Live dot */
  liveDotWrap: { width: 14, height: 14, alignItems: "center", justifyContent: "center" },
  liveDotRing: { position: "absolute", width: 14, height: 14, borderRadius: 7, borderWidth: 1.5 },
  liveDotCore: { width: 7, height: 7, borderRadius: 4 },

  /* Premium crest (136 px) */
  crestStage: {
    width: 136, height: 136,  // ↓ was 168
    alignItems: "center", justifyContent: "center",
  },
  crestDashed: {
    position: "absolute",
    width: 134, height: 134, borderRadius: 67,    // ↓ was 164/82
    borderWidth: 1, borderStyle: "dashed",
  },
  crestMidRing: {
    position: "absolute",
    width: 108, height: 108, borderRadius: 54,    // ↓ was 130/65
    borderWidth: 1,
  },
  crestCore: {
    width: 82, height: 82, borderRadius: 41,      // ↓ was 96/48
    alignItems: "center", justifyContent: "center",
    overflow: "hidden",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.28, shadowRadius: 24 },
      android: { elevation: 12 },
    }),
  },
  crestGlint: {
    position: "absolute",
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: "rgba(255,255,255,0.14)",
    top: -16, right: -12,
  },
  crestLogo: {
    width: 40, height: 40,    // ↓ was 46
    resizeMode: "contain",
  },

  /* School name block */
  nameBlock: {
    alignItems: "center", marginBottom: 12,       // ↓ was 16
    paddingHorizontal: 10,
  },
  schoolNameText: {
    fontSize: 24, fontWeight: "900",              // ↓ was 28
    textAlign: "center", letterSpacing: -0.7,
    lineHeight: 30, marginBottom: 8,              // ↓ was 36/10
  },
  taglinePill: {
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5,
    borderWidth: 1, marginBottom: 6,
  },
  taglineText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.6, textAlign: "center" },
  mottoText: {
    fontSize: 13, fontStyle: "italic", fontWeight: "500",
    textAlign: "center", letterSpacing: 0.3, marginTop: 2,
  },

  /* ── Body ──────────────────────────────────────────────── */
  body: {
    flex: 1, paddingHorizontal: 20,
    paddingTop: 4, paddingBottom: 44,
  },

  /* Eyebrow */
  eyebrow: {
    flexDirection: "row", alignItems: "center",
    gap: 10, marginBottom: 16, marginTop: 2,
  },
  eyebrowLine: { flex: 1, height: 1 },
  eyebrowLabel: { fontSize: 9, fontWeight: "800", letterSpacing: 2.5, color: "#94A3B8" },

  /* Student hero card */
  studentCardWrap: {
    borderRadius: 26, marginBottom: 12,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.22, shadowRadius: 32 },
      android: { elevation: 10 },
    }),
  },
  studentGrad: {
    minHeight: 132, position: "relative", overflow: "hidden",
  },
  studentGhost: {
    position: "absolute", right: 14, top: -6,
    fontSize: 80, fontWeight: "900",
    color: "rgba(255,255,255,0.07)", letterSpacing: -2,
  },
  studentGlow: {
    position: "absolute",
    width: 160, height: 160, borderRadius: 80,
    backgroundColor: "rgba(255,255,255,0.09)",
    top: -60, right: -30,
  },
  studentGlow2: {
    position: "absolute",
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: "rgba(255,255,255,0.06)",
    top: 20, right: 80,
  },
  studentBody: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 22, paddingVertical: 24, gap: 14,
  },
  studentLeft: { flex: 1, gap: 5 },
  studentBadge: {
    flexDirection: "row", alignItems: "center", gap: 6,
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.14)",
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.22)",
    marginBottom: 4,
  },
  studentBadgePulse: {
    width: 5, height: 5, borderRadius: 2.5,
    backgroundColor: "rgba(255,255,255,0.75)",
  },
  studentBadgeText: { fontSize: 9, fontWeight: "800", letterSpacing: 1.4, color: "rgba(255,255,255,0.86)" },
  studentTitle: {
    fontSize: 24, fontWeight: "900", color: "#FFFFFF",
    letterSpacing: -0.6, lineHeight: 30,
  },
  studentSub: {
    fontSize: 12, fontWeight: "500",
    color: "rgba(255,255,255,0.56)", letterSpacing: 0.2,
  },
  studentRight: { alignItems: "center", gap: 12 },
  studentIconWrap: {
    width: 62, height: 62, borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.22)",
  },
  studentArrowBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.92)",
    alignItems: "center", justifyContent: "center",
  },
  studentVignette: {
    position: "absolute", bottom: 0, left: 0, right: 0, height: 30,
  },

  /* Portal cards (secondary) */
  portalsStack: { gap: 10, marginBottom: 4 },
  portalCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.07)",
    overflow: "hidden",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 12 },
      android: { elevation: 2 },
    }),
  },
  portalInner: {
    flexDirection: "row", alignItems: "center",
    paddingRight: 16, paddingVertical: 14,
    minHeight: 76,
  },
  portalBar: {
    width: 4, alignSelf: "stretch",
    borderTopLeftRadius: 18, borderBottomLeftRadius: 18,
    marginRight: 10,
  },
  portalGhost: {
    fontSize: 11, fontWeight: "900", letterSpacing: 0.4,
    opacity: 0.18, width: 22, marginRight: 6,
  },
  portalIconBox: {
    width: 46, height: 46, borderRadius: 14,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, marginRight: 14,
  },
  portalText: { flex: 1, gap: 2 },
  portalTitle: { fontSize: 15, fontWeight: "700", color: "#0F172A", letterSpacing: -0.2, lineHeight: 21 },
  portalSub: { fontSize: 11.5, fontWeight: "400", color: "#64748B", lineHeight: 17 },
  portalArrow: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: "center", justifyContent: "center", borderWidth: 1,
  },

  /* ── Startup India (hero top row) ───────────────────────── */
  /* OPTION 1: full-width credential strip below the pill */
  credHeroWrap: {
    alignSelf: "stretch",      // was flex:1 / maxWidth: width*0.56
    borderRadius: 14,
    ...Platform.select({
      ios: {
        shadowColor: "#1E293B",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 10,
      },
      android: { elevation: 3 },
    }),
  },
  credHeroCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,        // was 5
    paddingLeft: 16,           // was 14
    paddingRight: 8,
    borderWidth: 1,
    borderRadius: 14,
    overflow: "hidden",
    position: "relative",
  },
  /* Tricolor ribbon — left edge */
  credRibbon: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 6,
    flexDirection: "column",
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
    overflow: "hidden",
  },
  credRibbonSeg: {
    flex: 1,
  },
  credAshoka: {
    width: 4,
    height: 4,
    borderRadius: 2,
    borderWidth: 0.8,
    borderColor: "#000080",
  },
  /* Logo ring */
  credLogoRing: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.1, shadowRadius: 10 },
      android: { elevation: 3 },
    }),
  },
  credHeroLogoRing: {
    width: 40,                 // was 34
    height: 40,                // was 34
    borderRadius: 12,          // was 10
  },
  credHeroLogoInner: {
    width: 34,                 // was 30
    height: 34,                // was 30
    borderRadius: 10,          // was 8
  },
  credHeroLogo: {
    width: 28,                 // was 24
    height: 28,                // was 24
    resizeMode: "contain",
  },
  credLogoInner: {
    width: 50,
    height: 50,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    backgroundColor: "#FAFAFA",
  },
  credLogo: {
    width: 42,
    height: 42,
    resizeMode: "contain",
  },
  /* Thin center divider */
  credDivider: {
    width: 1,
    height: 30,
    backgroundColor: "rgba(0,0,0,0.07)",
  },
  /* Text */
  credText: { flex: 1, minWidth: 0, gap: 1 },
  credEyebrowRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  credEyebrow: {
    fontSize: 7.5,
    fontWeight: "800",
    letterSpacing: 1.2,
    color: "#94A3B8",
  },
  credTitle: {
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: -0.3,
    lineHeight: 21,
  },
  credHeroTitle: {
    fontSize: 15,              // was 12
    lineHeight: 19,            // was 15
  },
  credMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 1,
  },
  credSub: {
    fontSize: 9,
    fontWeight: "500",
    color: "#64748B",
    letterSpacing: 0.1,
    flexShrink: 1,
  },
  credMetaDot: {
    width: 2.5,
    height: 2.5,
    borderRadius: 1.25,
    opacity: 0.5,
  },
  credVerifiedChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
  },
  credHeroVerifiedChip: {
    paddingHorizontal: 6,      // was 5
    paddingVertical: 2,        // was 1
    borderRadius: 9,           // was 8
    flexShrink: 0,
  },
  credVerified: {
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  /* Right badge */
  credBadgePill: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  credHeroBadge: {
    width: 28,                 // was 24
    height: 28,                // was 24
    borderRadius: 14,          // was 12
    flexShrink: 0,
  },

  /* Footer */
  footer: { alignItems: "center", gap: 5, paddingTop: 12, paddingBottom: 4 },
  footerRule: { width: 40, height: 1, marginBottom: 8 },
  footerRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  footerDot: { width: 3, height: 3, borderRadius: 2, opacity: 0.4 },
  footerBrand: { fontSize: 9, fontWeight: "700", letterSpacing: 2.5, color: "#94A3B8" },
  footerVersion: { fontSize: 10, color: "#94A3B8", letterSpacing: 0.5, opacity: 0.7 },
});