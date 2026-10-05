import { TourTarget, TourScrollView } from '@/src/features/app-tour';
import { Ionicons, MaterialCommunityIcons, MaterialIcons } from "@expo/vector-icons";
import React from "react";
import {
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  FadeInDown,
  FadeInUp,
} from "react-native-reanimated";
import ScreenLayout from "../../src/components/ScreenLayout";
import StudentHeader from "../../src/components/StudentHeader";
import { useAuth } from "../../src/hooks/useAuth";
import { useTheme } from "../../src/hooks/useTheme";
import { Theme } from "../../src/theme/themes";

export default function InsuranceScreen() {
  const { theme, isDark } = useTheme();
  const styles = React.useMemo(() => getStyles(theme, isDark), [theme, isDark]);
  const { user } = useAuth();

  return (
    <ScreenLayout>
      <TourTarget id="screen.screen-insurance.overview"><StudentHeader showBackButton={true} title="Insurance" /></TourTarget>

      <TourTarget id="screen.screen-insurance.workspace" native><TourScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContainer}
      >
        {/* ─── INSURANCE CARD ─── */}
        <Animated.View entering={FadeInDown.delay(50).springify()} style={styles.insuranceCard}>
          {/* Decorative top stripe */}
          <View style={styles.cardStripe} />

          <View style={styles.cardHeader}>
            <View>
              <Text style={styles.cardBrand}>NexSyrus SchoolIMS</Text>
              <Text style={styles.planTitle}>Student Insurance Policy</Text>
            </View>
            <View style={styles.statusBadge}>
              <View style={styles.activeDot} />
              <Text style={styles.statusText}>ACTIVE</Text>
            </View>
          </View>

          <View style={styles.dividerLine} />

          <View style={styles.planRow}>
            <Text style={styles.label}>Student Name</Text>
            <Text style={styles.value}>{user?.name || "Student"}</Text>
          </View>
          <View style={styles.planRow}>
            <Text style={styles.label}>Policy Number</Text>
            <Text style={styles.value}>NX-INS-2025-001</Text>
          </View>
          <View style={styles.planRow}>
            <Text style={styles.label}>Claimable Amount</Text>
            <Text style={styles.coverage}>₹5,000 / claim</Text>
          </View>
          <View style={styles.planRow}>
            <Text style={styles.label}>Claims Allowed</Text>
            <Text style={styles.coverage}>2× per year</Text>
          </View>

          {/* Claim Tracker */}
          <View style={styles.claimTracker}>
            <Text style={styles.claimTrackerLabel}>Annual Claims Used</Text>
            <View style={styles.claimDots}>
              <View style={[styles.claimDot, styles.claimDotUsed]} />
              <View style={[styles.claimDot, styles.claimDotAvail]} />
            </View>
            <Text style={styles.claimTrackerSub}>0 of 2 used this year</Text>
          </View>

          {/* T&C Tag */}
          <View style={styles.tncBadge}>
            <MaterialCommunityIcons name="shield-check-outline" size={12} color="#A5B4FC" />
            <Text style={styles.tncText}>Terms & Conditions Apply</Text>
          </View>
        </Animated.View>

        {/* ─── COVERAGE DETAILS ─── */}
        <Animated.View entering={FadeInDown.delay(120).springify()}>
          <SectionTitle title="Coverage Includes" styles={styles} />
          <View style={styles.card}>
            <CoverageItem icon="medical-bag" text="Accidental Injuries" sub="Up to ₹5,000 per incident" theme={theme} isDark={isDark} />
            <CoverageItem icon="bus-school" text="School Travel Safety" sub="During school-operated transit" theme={theme} isDark={isDark} />
          </View>
        </Animated.View>

        {/* ─── HOW TO CLAIM ─── */}
        <Animated.View entering={FadeInDown.delay(190).springify()}>
          <SectionTitle title="How to Claim" styles={styles} />
          <View style={styles.card}>
            {[
              { n: "01", t: "Inform School Admin", d: "Notify your school immediately after the incident." },
              { n: "02", t: "Visit Nearest Hospital", d: "Seek treatment at any empanelled hospital." },
              { n: "03", t: "Submit Medical Reports", d: "Collect & submit bills, reports to the school." },
              { n: "04", t: "Claim Processed", d: "NexSyrus insurance team handles it from here." },
            ].map((s, i) => (
              <View key={i} style={[styles.stepRow, i < 3 && styles.stepRowBorder]}>
                <View style={styles.stepNumBadge}>
                  <Text style={styles.stepNum}>{s.n}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.stepTitle}>{s.t}</Text>
                  <Text style={styles.stepDesc}>{s.d}</Text>
                </View>
              </View>
            ))}
          </View>
        </Animated.View>

        {/* ─── MANAGED BY NEXSYRUS ─── */}
        <Animated.View entering={FadeInDown.delay(260).springify()}>
          <View style={styles.nexsyrusCard}>
            <View style={styles.nexsyrusTop}>
              <MaterialCommunityIcons name="office-building-cog-outline" size={28} color="#818CF8" />
              <View style={{ marginLeft: 12, flex: 1 }}>
                <Text style={styles.nexsyrusTitle}>Managed by NexSyrus Pvt. Ltd.</Text>
                <Text style={styles.nexsyrusSubtitle}>
                  All insurance operations, claim processing, and policy management for this school are exclusively handled by NexSyrus Pvt. Ltd.
                </Text>
              </View>
            </View>
            <View style={styles.nexsyrusDivider} />
            <Text style={styles.nexsyrusContactLabel}>For any queries or claim assistance:</Text>
            <TouchableOpacity
              style={styles.nexsyrusContactBtn}
              onPress={() => Linking.openURL("mailto:insurance@nexsyrus.com")}
            >
              <MaterialIcons name="email" size={16} color="#818CF8" />
              <Text style={styles.nexsyrusContactText}>insurance@nexsyrus.com</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.nexsyrusContactBtn}
              onPress={() => Linking.openURL("https://nexsyrus.com")}
            >
              <MaterialIcons name="language" size={16} color="#818CF8" />
              <Text style={styles.nexsyrusContactText}>nexsyrus.com</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* ─── EMERGENCY ─── */}
        <Animated.View entering={FadeInDown.delay(320).springify()}>
          <TouchableOpacity
            style={styles.emergencyCard}
            onPress={() => Linking.openURL("tel:+917892654731")}
            activeOpacity={0.85}
          >
            <View style={styles.emergencyIcon}>
              <Ionicons name="call" size={22} color="#fff" />
            </View>
            <View style={{ marginLeft: 14, flex: 1 }}>
              <Text style={styles.emergencyTitle}>Emergency Helpline</Text>
              <Text style={styles.emergencyNumber}>+91 7892654731</Text>
              <Text style={styles.emergencyNote}>Toll-free · 24/7 Available</Text>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="rgba(255,255,255,0.6)" />
          </TouchableOpacity>
        </Animated.View>

        {/* ─── ACTION BUTTONS ─── */}
        <Animated.View entering={FadeInUp.delay(380).springify()}>
          <TouchableOpacity style={styles.primaryBtn} activeOpacity={0.85}>
            <MaterialCommunityIcons name="card-account-details-outline" size={20} color="#fff" />
            <Text style={styles.primaryBtnText}>Download Insurance Card</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryBtn}
            activeOpacity={0.85}
            onPress={() => Linking.openURL("mailto:insurance@nexsyrus.com")}
          >
            <MaterialIcons name="support-agent" size={20} color={theme.colors.primary} />
            <Text style={styles.secondaryBtnText}>Contact NexSyrus Support</Text>
          </TouchableOpacity>
        </Animated.View>

        {/* ─── FOOTER DISCLAIMER ─── */}
        <Animated.View entering={FadeInUp.delay(420).springify()}>
          <Text style={styles.disclaimer}>
            * This insurance policy is subject to terms & conditions. Coverage is applicable during school hours and school-sanctioned activities only. NexSyrus Pvt. Ltd. reserves the right to verify all claims before processing.
          </Text>
        </Animated.View>
      </TourScrollView></TourTarget>
    </ScreenLayout>
  );
}

/* ── Section Title ── */
const SectionTitle = ({ title, styles }: any) => (
  <Text style={styles.sectionTitle}>{title}</Text>
);

/* ── Coverage Item ── */
const CoverageItem = ({ icon, text, sub, theme, isDark }: any) => {
  const styles = React.useMemo(() => getStyles(theme, isDark), [theme, isDark]);
  return (
    <View style={styles.coverageItem}>
      <View style={styles.coverageIconBg}>
        <MaterialCommunityIcons name={icon} size={20} color={theme.colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.coverageText}>{text}</Text>
        <Text style={styles.coverageSub}>{sub}</Text>
      </View>
      <MaterialIcons name="check-circle" size={18} color="#22C55E" />
    </View>
  );
};

/* ── Styles ── */
const getStyles = (theme: Theme, isDark: boolean) =>
  StyleSheet.create({
    scrollContainer: {
      paddingBottom: 32,
    },

    /* Insurance Card */
    insuranceCard: {
      backgroundColor: theme.colors.primary,
      margin: 16,
      borderRadius: 24,
      padding: 20,
      elevation: 10,
      shadowColor: theme.colors.primary,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.4,
      shadowRadius: 14,
      overflow: "hidden",
    },
    cardStripe: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      height: 4,
      backgroundColor: "rgba(255,255,255,0.25)",
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
    },
    cardHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: 14,
    },
    cardBrand: {
      fontSize: 11,
      color: "rgba(255,255,255,0.6)",
      letterSpacing: 1.2,
      textTransform: "uppercase",
      marginBottom: 2,
    },
    planTitle: {
      fontSize: 17,
      color: "#fff",
      fontWeight: "700",
    },
    statusBadge: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: "rgba(34,197,94,0.2)",
      borderWidth: 1,
      borderColor: "rgba(34,197,94,0.5)",
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 20,
      gap: 5,
    },
    activeDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: "#22C55E",
    },
    statusText: {
      color: "#22C55E",
      fontWeight: "700",
      fontSize: 11,
      letterSpacing: 0.8,
    },
    dividerLine: {
      height: 1,
      backgroundColor: "rgba(255,255,255,0.15)",
      marginBottom: 12,
    },
    planRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginVertical: 5,
    },
    label: {
      color: "rgba(255,255,255,0.6)",
      fontSize: 13,
    },
    value: {
      color: "#fff",
      fontSize: 14,
      fontWeight: "600",
    },
    coverage: {
      color: "#86EFAC",
      fontSize: 15,
      fontWeight: "700",
    },

    /* Claim Tracker */
    claimTracker: {
      backgroundColor: "rgba(255,255,255,0.1)",
      borderRadius: 14,
      padding: 12,
      marginTop: 14,
      alignItems: "center",
    },
    claimTrackerLabel: {
      color: "rgba(255,255,255,0.7)",
      fontSize: 11,
      letterSpacing: 0.5,
      textTransform: "uppercase",
      marginBottom: 8,
    },
    claimDots: {
      flexDirection: "row",
      gap: 10,
      marginBottom: 6,
    },
    claimDot: {
      width: 28,
      height: 28,
      borderRadius: 14,
      borderWidth: 2,
    },
    claimDotUsed: {
      backgroundColor: "rgba(239,68,68,0.25)",
      borderColor: "rgba(239,68,68,0.6)",
    },
    claimDotAvail: {
      backgroundColor: "rgba(34,197,94,0.25)",
      borderColor: "rgba(34,197,94,0.6)",
    },
    claimTrackerSub: {
      color: "rgba(255,255,255,0.55)",
      fontSize: 12,
    },

    /* T&C Tag */
    tncBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      marginTop: 12,
      alignSelf: "flex-end",
    },
    tncText: {
      color: "#A5B4FC",
      fontSize: 11,
      fontStyle: "italic",
    },

    /* Generic card */
    card: {
      backgroundColor: isDark
        ? "rgba(255,255,255,0.05)"
        : theme.colors.background,
      marginHorizontal: 16,
      marginBottom: 8,
      borderRadius: 20,
      padding: 16,
      borderWidth: isDark ? 1 : 0,
      borderColor: "rgba(255,255,255,0.08)",
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: "700",
      marginHorizontal: 16,
      marginTop: 16,
      marginBottom: 8,
      color: isDark ? "#E2E8F0" : theme.colors.text,
      letterSpacing: 0.3,
    },

    /* Coverage items */
    coverageItem: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 10,
      gap: 12,
    },
    coverageIconBg: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: isDark
        ? "rgba(99,102,241,0.15)"
        : "rgba(79,70,229,0.1)",
      alignItems: "center",
      justifyContent: "center",
    },
    coverageText: {
      fontSize: 14,
      fontWeight: "600",
      color: isDark ? "#E2E8F0" : theme.colors.text,
    },
    coverageSub: {
      fontSize: 12,
      color: isDark ? "rgba(255,255,255,0.45)" : "#6B7280",
      marginTop: 1,
    },

    /* Steps */
    stepRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      paddingVertical: 12,
      gap: 14,
    },
    stepRowBorder: {
      borderBottomWidth: 1,
      borderBottomColor: isDark ? "rgba(255,255,255,0.07)" : "#F3F4F6",
    },
    stepNumBadge: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: isDark
        ? "rgba(99,102,241,0.2)"
        : "rgba(79,70,229,0.1)",
      alignItems: "center",
      justifyContent: "center",
    },
    stepNum: {
      fontSize: 12,
      fontWeight: "800",
      color: theme.colors.primary,
    },
    stepTitle: {
      fontSize: 14,
      fontWeight: "600",
      color: isDark ? "#E2E8F0" : theme.colors.text,
    },
    stepDesc: {
      fontSize: 12,
      color: isDark ? "rgba(255,255,255,0.45)" : "#6B7280",
      marginTop: 2,
    },

    /* NexSyrus Card */
    nexsyrusCard: {
      backgroundColor: isDark
        ? "rgba(99,102,241,0.1)"
        : "rgba(79,70,229,0.06)",
      marginHorizontal: 16,
      marginTop: 16,
      marginBottom: 8,
      borderRadius: 20,
      padding: 18,
      borderWidth: 1,
      borderColor: isDark
        ? "rgba(129,140,248,0.25)"
        : "rgba(79,70,229,0.2)",
    },
    nexsyrusTop: {
      flexDirection: "row",
      alignItems: "flex-start",
    },
    nexsyrusTitle: {
      fontSize: 15,
      fontWeight: "700",
      color: isDark ? "#A5B4FC" : theme.colors.primary,
      marginBottom: 4,
    },
    nexsyrusSubtitle: {
      fontSize: 12,
      color: isDark ? "rgba(255,255,255,0.5)" : "#6B7280",
      lineHeight: 18,
    },
    nexsyrusDivider: {
      height: 1,
      backgroundColor: isDark
        ? "rgba(129,140,248,0.2)"
        : "rgba(79,70,229,0.15)",
      marginVertical: 14,
    },
    nexsyrusContactLabel: {
      fontSize: 12,
      color: isDark ? "rgba(255,255,255,0.5)" : "#6B7280",
      marginBottom: 10,
    },
    nexsyrusContactBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: 6,
    },
    nexsyrusContactText: {
      fontSize: 14,
      color: "#818CF8",
      fontWeight: "500",
      textDecorationLine: "underline",
    },

    /* Emergency */
    emergencyCard: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: "#DC2626",
      marginHorizontal: 16,
      marginTop: 16,
      marginBottom: 8,
      borderRadius: 20,
      padding: 16,
      elevation: 6,
      shadowColor: "#EF4444",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.35,
      shadowRadius: 10,
    },
    emergencyIcon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: "rgba(255,255,255,0.2)",
      alignItems: "center",
      justifyContent: "center",
    },
    emergencyTitle: {
      color: "rgba(255,255,255,0.75)",
      fontSize: 12,
      letterSpacing: 0.5,
    },
    emergencyNumber: {
      color: "#fff",
      fontSize: 20,
      fontWeight: "800",
      letterSpacing: 0.5,
    },
    emergencyNote: {
      color: "rgba(255,255,255,0.55)",
      fontSize: 11,
      marginTop: 1,
    },

    /* Buttons */
    primaryBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: theme.colors.primary,
      marginHorizontal: 16,
      marginTop: 16,
      borderRadius: 16,
      padding: 15,
      elevation: 4,
    },
    primaryBtnText: {
      color: "#fff",
      fontSize: 15,
      fontWeight: "700",
    },
    secondaryBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      borderWidth: 1.5,
      borderColor: theme.colors.primary,
      marginHorizontal: 16,
      marginTop: 12,
      borderRadius: 16,
      padding: 14,
    },
    secondaryBtnText: {
      color: theme.colors.primary,
      fontSize: 15,
      fontWeight: "700",
    },

    /* Disclaimer */
    disclaimer: {
      fontSize: 11,
      color: isDark ? "rgba(255,255,255,0.3)" : "#9CA3AF",
      marginHorizontal: 20,
      marginTop: 16,
      lineHeight: 17,
      textAlign: "center",
      fontStyle: "italic",
    },
  });