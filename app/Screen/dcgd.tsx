import { TourTarget, TourScrollView } from '@/src/features/app-tour';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  useWindowDimensions,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSpring,
  interpolate,
  Easing,
  FadeInDown,
  FadeIn,
} from 'react-native-reanimated';
import ScreenLayout from '../../src/components/ScreenLayout';
import StudentHeader from '../../src/components/StudentHeader';
import { useAuth } from '../../src/hooks/useAuth';
import { useTheme } from '../../src/hooks/useTheme';
import {
  DcgdPagePayload,
  DcgdProgram,
  fetchStudentDcgdPage,
} from '../../src/services/dcgdService';

// ─── Constants ────────────────────────────────────────────────────────────────

const CONTENT_MAX_W = 740;

// Program track color map for richer card accent rails
const PROGRAM_COLORS: Record<number, { rail: string; glow: string; chip: string }> = {
  [-1]: { rail: '#06B6D4', glow: 'rgba(6,182,212,0.18)', chip: 'rgba(6,182,212,0.14)' },
  [-2]: { rail: '#F59E0B', glow: 'rgba(245,158,11,0.18)', chip: 'rgba(245,158,11,0.14)' },
  [-3]: { rail: '#8B5CF6', glow: 'rgba(139,92,246,0.18)', chip: 'rgba(139,92,246,0.14)' },
  [-4]: { rail: '#10B981', glow: 'rgba(16,185,129,0.18)', chip: 'rgba(16,185,129,0.14)' },
  [-5]: { rail: '#EF4444', glow: 'rgba(239,68,68,0.18)', chip: 'rgba(239,68,68,0.14)' },
  [-6]: { rail: '#EC4899', glow: 'rgba(236,72,153,0.18)', chip: 'rgba(236,72,153,0.14)' },
};

const DEFAULT_COLOR = { rail: '#0D9488', glow: 'rgba(13,148,136,0.18)', chip: 'rgba(13,148,136,0.14)' };

const FALLBACK_PROGRAMS: DcgdProgram[] = [
  { id: -1, name: 'CSE Foundation', description: 'CS fundamentals, data structures, and logical problem solving for tech careers.', icon: 'hardware-chip-outline', display_order: 1, is_active: true },
  { id: -2, name: 'JEE Foundation', description: 'PCM depth with conceptual clarity for engineering entrance readiness.', icon: 'flask-outline', display_order: 2, is_active: true },
  { id: -3, name: 'IPMAT Foundation', description: 'Quantitative aptitude, verbal reasoning, and logic for IPM pathways.', icon: 'briefcase-outline', display_order: 3, is_active: true },
  { id: -4, name: 'NEET Foundation', description: 'Biology-forward preparation aligned with CBSE and medical entrance.', icon: 'medkit-outline', display_order: 4, is_active: true },
  { id: -5, name: 'Navodaya', description: 'JNV entrance patterns, scholastic rigor, and competitive depth.', icon: 'school-outline', display_order: 5, is_active: true },
  { id: -6, name: 'Gurukula', description: 'Holistic and disciplined classical study paths with modern application.', icon: 'book-outline', display_order: 6, is_active: true },
];

function resolveIonIcon(raw: string): keyof typeof Ionicons.glyphMap {
  const key = (raw || 'ribbon-outline') as keyof typeof Ionicons.glyphMap;
  return key in Ionicons.glyphMap ? key : 'ribbon-outline';
}

// ─── Program Card ─────────────────────────────────────────────────────────────

function ProgramCard({
  program,
  isDark,
  index,
  onPress,
}: {
  program: DcgdProgram;
  isDark: boolean;
  index: number;
  onPress: () => void;
}) {
  const iconName = resolveIonIcon(program.icon);
  const palette = PROGRAM_COLORS[program.id] ?? DEFAULT_COLOR;

  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 80).duration(420).springify()}
      style={[styles.programOuter, animStyle]}
    >
      <Pressable
        onPress={onPress}
        onPressIn={() => { scale.value = withSpring(0.975, { damping: 18 }); }}
        onPressOut={() => { scale.value = withSpring(1, { damping: 18 }); }}
      >
        <View
          style={[
            styles.programCard,
            {
              backgroundColor: isDark ? 'rgba(15,23,42,0.96)' : '#FFFFFF',
              borderColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(15,23,42,0.07)',
            },
          ]}
        >
          {/* Left accent rail */}
          <View style={[styles.accentRail, { backgroundColor: palette.rail }]} />

          {/* Icon */}
          <View style={[styles.programIconWrap, { backgroundColor: palette.glow }]}>
            <Ionicons name={iconName} size={24} color={palette.rail} />
          </View>

          {/* Text */}
          <View style={styles.programTextCol}>
            <Text
              style={[styles.programTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}
              numberOfLines={1}
            >
              {program.name}
            </Text>
            <Text
              style={[styles.programDesc, { color: isDark ? '#94A3B8' : '#64748B' }]}
              numberOfLines={2}
            >
              {program.description}
            </Text>
            {/* Chip */}
            <View style={[styles.programChip, { backgroundColor: palette.chip }]}>
              <View style={[styles.chipDot, { backgroundColor: palette.rail }]} />
              <Text style={[styles.chipLabel, { color: palette.rail }]}>Explore Track</Text>
            </View>
          </View>

          {/* Arrow */}
          <View
            style={[
              styles.arrowBtn,
              { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : palette.glow },
            ]}
          >
            <Ionicons name="arrow-forward" size={18} color={palette.rail} />
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ─── Stat Pill ────────────────────────────────────────────────────────────────

function StatPill({
  icon,
  label,
  value,
  isDark,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  isDark: boolean;
}) {
  return (
    <View
      style={[
        styles.statPill,
        { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(13,148,136,0.07)' },
      ]}
    >
      <Ionicons name={icon} size={14} color={isDark ? '#2DD4BF' : '#0D9488'} />
      <View style={styles.statTextCol}>
        <Text style={[styles.statValue, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>{value}</Text>
        <Text style={[styles.statLabel, { color: isDark ? '#64748B' : '#94A3B8' }]}>{label}</Text>
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

const DCGDScreen = () => {
  const { isDark } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const { width: winW } = useWindowDimensions();

  const padH = winW >= 900 ? 40 : 20;
  const innerW = Math.min(CONTENT_MAX_W, winW - padH * 2);

  const [payload, setPayload] = useState<DcgdPagePayload | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await fetchStudentDcgdPage();
    setPayload(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const pageTitle = payload?.settings?.page_title || 'DCGD';
  const subtitle = payload?.settings?.subtitle || 'Department of Career Growth & Development';

  const programs = useMemo(() => {
    if (payload?.visible && payload.programs?.length) {
      return [...payload.programs].sort((a, b) => a.display_order - b.display_order || a.id - b.id);
    }
    if (payload && !payload.visible) return [];
    return FALLBACK_PROGRAMS;
  }, [payload]);

  const profile = payload?.profile;
  const displayName = profile?.name?.trim() || user?.displayName || 'Student';
  const classLine = profile?.class_section_label?.trim() || '—';
  const rollLine = profile?.roll_number != null ? String(profile.roll_number) : '—';
  const admLine = profile?.admission_no?.trim() || '—';
  const showHidden = payload && !payload.visible;

  return (
    <ScreenLayout>
      <TourTarget id="screen.screen-dcgd.overview"><StudentHeader showBackButton title="Career Growth & Development" /></TourTarget>

      <TourTarget id="screen.screen-dcgd.workspace" native><TourScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingHorizontal: padH, paddingBottom: 56 }]}
      >
        <View style={[styles.centerColumn, { maxWidth: innerW, width: '100%', alignSelf: 'center' }]}>

          {/* ── Hero ── */}
          <Animated.View entering={FadeIn.duration(500)} style={styles.heroOuter}>
            <LinearGradient
              colors={
                isDark
                  ? ['#0C4A6E', '#0E7490', '#134E4A']
                  : ['#0C4A6E', '#0891B2', '#0D9488']
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.hero}
            >
              {/* Decorative orbs */}
              <View style={[styles.heroOrb, styles.heroOrbTL]} />
              <View style={[styles.heroOrb, styles.heroOrbBR]} />

              {/* Badge pill */}
              <View style={styles.heroBadge}>
                <View style={styles.heroBadgeDot} />
                <Text style={styles.heroBadgeText}>Nexsyrus · Microservice</Text>
              </View>

              <Text style={styles.heroTitle}>{pageTitle}</Text>
              <Text style={styles.heroSubtitle}>{subtitle}</Text>

              {/* Bottom stat row */}
              <View style={styles.heroStats}>
                <View style={styles.heroStat}>
                  <Text style={styles.heroStatVal}>{programs.length || 6}</Text>
                  <Text style={styles.heroStatLbl}>Tracks</Text>
                </View>
                <View style={styles.heroStatDivider} />
                <View style={styles.heroStat}>
                  <Text style={styles.heroStatVal}>Live</Text>
                  <Text style={styles.heroStatLbl}>Status</Text>
                </View>
                <View style={styles.heroStatDivider} />
                <View style={styles.heroStat}>
                  <Text style={styles.heroStatVal}>Free</Text>
                  <Text style={styles.heroStatLbl}>Access</Text>
                </View>
              </View>
            </LinearGradient>
          </Animated.View>

          {/* ── Profile Card ── */}
          <Animated.View
            entering={FadeInDown.delay(120).duration(440).springify()}
            style={[
              styles.profileCard,
              {
                backgroundColor: isDark ? 'rgba(15,23,42,0.97)' : '#FFFFFF',
                borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(13,148,136,0.12)',
                marginTop: -26,
              },
            ]}
          >
            {/* Top accent line */}
            <LinearGradient
              colors={['#0D9488', '#0891B2', '#8B5CF6']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.profileTopLine}
            />

            <View style={styles.profileInner}>
              {/* Avatar */}
              <View style={styles.avatarOuter}>
                <LinearGradient
                  colors={['#2DD4BF', '#0891B2']}
                  style={styles.avatarRing}
                >
                  {profile?.photo_url ? (
                    <Image source={{ uri: profile.photo_url }} style={styles.avatarImg} />
                  ) : (
                    <LinearGradient colors={['#134E4A', '#0C4A6E']} style={styles.avatarInner}>
                      <Text style={styles.avatarLetter}>{displayName.charAt(0).toUpperCase()}</Text>
                    </LinearGradient>
                  )}
                </LinearGradient>
                {/* Online badge */}
                <View style={styles.onlineBadge} />
              </View>

              {/* Meta */}
              <View style={styles.profileMeta}>
                <Text
                  style={[styles.profileName, { color: isDark ? '#F1F5F9' : '#0F172A' }]}
                  numberOfLines={1}
                >
                  {displayName}
                </Text>
                <Text style={[styles.profileSubline, { color: isDark ? '#2DD4BF' : '#0D9488' }]}>
                  DCGD Member · Active
                </Text>
              </View>
            </View>

            {/* Stat pills row */}
            <View style={styles.profilePills}>
              <StatPill icon="layers-outline" label="Section" value={classLine} isDark={isDark} />
              <StatPill icon="id-card-outline" label="Roll No." value={rollLine} isDark={isDark} />
              <StatPill icon="barcode-outline" label="Adm. No." value={admLine} isDark={isDark} />
            </View>
          </Animated.View>

          {/* ── Hidden State ── */}
          {showHidden ? (
            <Animated.View
              entering={FadeInDown.delay(160).duration(400)}
              style={[
                styles.hiddenBanner,
                { backgroundColor: isDark ? 'rgba(251,191,36,0.1)' : '#FFFBEB', borderColor: isDark ? 'rgba(251,191,36,0.25)' : '#FCD34D' },
              ]}
            >
              <View style={styles.hiddenIcon}>
                <Ionicons name="eye-off-outline" size={20} color="#D97706" />
              </View>
              <Text style={[styles.hiddenText, { color: isDark ? '#FCD34D' : '#92400E' }]}>
                This section is temporarily unavailable. Please check back with your school administrator.
              </Text>
            </Animated.View>
          ) : null}

          {/* ── Programs Section ── */}
          {!showHidden ? (
            <>
              {/* Section header */}
              <Animated.View
                entering={FadeInDown.delay(200).duration(420)}
                style={styles.sectionHead}
              >
                <View style={styles.sectionTitleRow}>
                  <View style={styles.sectionTitleBar} />
                  <Text style={[styles.sectionTitle, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>
                    Program Tracks
                  </Text>
                  <View style={[styles.sectionBadge, { backgroundColor: isDark ? 'rgba(45,212,191,0.14)' : 'rgba(13,148,136,0.1)' }]}>
                    <Text style={[styles.sectionBadgeText, { color: isDark ? '#2DD4BF' : '#0D9488' }]}>
                      {programs.length}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.sectionHint, { color: isDark ? '#64748B' : '#94A3B8' }]}>
                  Choose a pathway to explore resources curated by your school.
                </Text>
              </Animated.View>

              {loading ? (
                <View style={styles.loader}>
                  <ActivityIndicator size="large" color="#0D9488" />
                  <Text style={[styles.loaderText, { color: isDark ? '#64748B' : '#94A3B8' }]}>
                    Loading programs…
                  </Text>
                </View>
              ) : (
                programs.map((p, i) => (
                  <ProgramCard
                    key={p.id}
                    program={p}
                    isDark={isDark}
                    index={i}
                    onPress={() =>
                      router.push({
                        pathname: '/Screen/dcgdProgram',
                        params: { id: String(p.id), name: p.name, icon: p.icon, description: p.description },
                      })
                    }
                  />
                ))
              )}
            </>
          ) : null}

          {/* Footer */}
          <Animated.View entering={FadeIn.delay(700).duration(500)} style={styles.footer}>
            <View style={styles.footerLine} />
            <View style={styles.footerContent}>
              <Ionicons name="shield-checkmark-outline" size={13} color={isDark ? '#475569' : '#CBD5E1'} />
              <Text style={[styles.footerNote, { color: isDark ? '#475569' : '#CBD5E1' }]}>
                Content managed by Nexsyrus Pvt. Ltd. &amp; your school&apos;s Super Admin console.
              </Text>
            </View>
          </Animated.View>

        </View>
      </TourScrollView></TourTarget>
    </ScreenLayout>
  );
};

export default DCGDScreen;

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scrollContent: {
    paddingTop: 10,
  },
  centerColumn: {},

  // ── Hero ──
  heroOuter: {
    borderRadius: 24,
    overflow: 'hidden',
    ...Platform.select({
      web: { boxShadow: '0 20px 60px rgba(13,148,136,0.3), 0 4px 16px rgba(8,145,178,0.2)' },
      default: {
        shadowColor: '#0D9488',
        shadowOffset: { width: 0, height: 14 },
        shadowOpacity: 0.28,
        shadowRadius: 28,
        elevation: 10,
      },
    }),
  },
  hero: {
    borderRadius: 24,
    paddingTop: 24,
    paddingHorizontal: 22,
    paddingBottom: 46,
    overflow: 'hidden',
    position: 'relative',
  },
  heroOrb: {
    position: 'absolute',
    borderRadius: 999,
    opacity: 0.18,
  },
  heroOrbTL: {
    width: 160,
    height: 160,
    backgroundColor: '#67E8F9',
    top: -60,
    left: -50,
  },
  heroOrbBR: {
    width: 200,
    height: 200,
    backgroundColor: '#5EEAD4',
    bottom: -80,
    right: -60,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 99,
    paddingVertical: 5,
    paddingHorizontal: 12,
    marginBottom: 14,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  heroBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#A7F3D0',
  },
  heroBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.9)',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  heroTitle: {
    fontSize: 32,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.8,
    lineHeight: 38,
  },
  heroSubtitle: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.82)',
    lineHeight: 22,
    maxWidth: 480,
    marginBottom: 22,
  },
  heroStats: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 18,
    gap: 0,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  heroStat: {
    flex: 1,
    alignItems: 'center',
  },
  heroStatVal: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  heroStatLbl: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.65)',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  heroStatDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },

  // ── Profile Card ──
  profileCard: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
    zIndex: 10,
    ...Platform.select({
      web: { boxShadow: '0 16px 48px rgba(15,23,42,0.12)' },
      default: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.1,
        shadowRadius: 20,
        elevation: 6,
      },
    }),
  },
  profileTopLine: {
    height: 3,
    width: '100%',
  },
  profileInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    paddingBottom: 12,
    gap: 14,
  },
  avatarOuter: {
    position: 'relative',
  },
  avatarRing: {
    width: 76,
    height: 76,
    borderRadius: 38,
    padding: 2.5,
  },
  avatarImg: {
    width: '100%',
    height: '100%',
    borderRadius: 36,
    backgroundColor: '#1E293B',
  },
  avatarInner: {
    flex: 1,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontSize: 26,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  onlineBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#10B981',
    borderWidth: 2,
    borderColor: '#0F172A',
  },
  profileMeta: {
    flex: 1,
    minWidth: 0,
  },
  profileName: {
    fontSize: 19,
    fontWeight: '900',
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  profileSubline: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  profilePills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 18,
    paddingBottom: 18,
  },

  // ── Stat Pill ──
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 12,
    flex: 1,
    minWidth: 90,
  },
  statTextCol: {
    minWidth: 0,
  },
  statValue: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 1,
  },

  // ── Hidden Banner ──
  hiddenBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    marginTop: 16,
    gap: 12,
    borderWidth: 1,
  },
  hiddenIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(251,191,36,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hiddenText: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: '600',
    lineHeight: 20,
  },

  // ── Section Header ──
  sectionHead: {
    marginTop: 26,
    marginBottom: 14,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
  },
  sectionTitleBar: {
    width: 4,
    height: 20,
    borderRadius: 2,
    backgroundColor: '#0D9488',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.4,
    flex: 1,
  },
  sectionBadge: {
    borderRadius: 99,
    paddingVertical: 3,
    paddingHorizontal: 10,
  },
  sectionBadgeText: {
    fontSize: 13,
    fontWeight: '800',
  },
  sectionHint: {
    fontSize: 13.5,
    lineHeight: 20,
    fontWeight: '500',
    marginLeft: 14,
  },

  // ── Program Card ──
  programOuter: {
    marginBottom: 10,
    ...Platform.select({
      web: { boxShadow: '0 6px 24px rgba(15,23,42,0.07)' },
      default: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.07,
        shadowRadius: 8,
        elevation: 2,
      },
    }),
  },
  programCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 16,
    paddingRight: 14,
    paddingLeft: 0,
    gap: 12,
    overflow: 'hidden',
  },
  accentRail: {
    width: 4,
    height: '100%',
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
    marginRight: 2,
    alignSelf: 'stretch',
  },
  programIconWrap: {
    width: 50,
    height: 50,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  programTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  programTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  programDesc: {
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: '500',
  },
  programChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 99,
    paddingVertical: 3,
    paddingHorizontal: 9,
    gap: 5,
    marginTop: 4,
  },
  chipDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  chipLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  arrowBtn: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Loader ──
  loader: {
    paddingVertical: 36,
    alignItems: 'center',
    gap: 10,
  },
  loaderText: {
    fontSize: 13,
    fontWeight: '600',
  },

  // ── Footer ──
  footer: {
    marginTop: 32,
    alignItems: 'center',
    gap: 12,
  },
  footerLine: {
    width: 40,
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(148,163,184,0.2)',
  },
  footerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  footerNote: {
    fontSize: 11.5,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 17,
  },
});