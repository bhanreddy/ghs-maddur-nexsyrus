import { TourTarget, TourScrollView } from '@/src/features/app-tour';
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, ScrollView, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeInUp, FadeInLeft } from 'react-native-reanimated';
import { useTheme } from '../src/hooks/useTheme';
import { ThemeColors } from '../src/theme/themes';
import { useTranslation } from 'react-i18next';

const ACCENT = '#F59E0B';
const ACCENT_SOFT = '#FEF3C7';
const ACCENT_MID = '#FDE68A';

interface SectionRowProps {
    icon: string;
    iconColor: string;
    iconBg: string;
    title: string;
    body: string;
    delay: number;
    isLast?: boolean;
}

function SectionRow({ icon, iconColor, iconBg, title, body, delay, isLast }: SectionRowProps) {
    return (
        <Animated.View
            entering={FadeInLeft.delay(delay).duration(500)}
            style={[sectionStyles.row, isLast && { marginBottom: 0 }]}
        >
            <View style={[sectionStyles.iconWrap, { backgroundColor: iconBg }]}>
                <Ionicons name={icon as any} size={20} color={iconColor} />
            </View>
            <View style={sectionStyles.textWrap}>
                <Text style={sectionStyles.title}>{title}</Text>
                <Text style={sectionStyles.body}>{body}</Text>
            </View>
        </Animated.View>
    );
}

const sectionStyles = StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 24, gap: 14 },
    iconWrap: { width: 42, height: 42, borderRadius: 11, justifyContent: 'center', alignItems: 'center', flexShrink: 0, marginTop: 1 },
    textWrap: { flex: 1 },
    title: { fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 4 },
    body: { fontSize: 13, color: '#6B7280', lineHeight: 20 },
});

export default function WhyAdsScreen() {
    const router = useRouter();
    const { theme } = useTheme();
    const { t } = useTranslation();
    const styles = React.useMemo(() => getStyles(theme.colors), [theme]);

    return (
        <TourTarget id="screen.why-ads.overview" style={{ flex: 1 }}><SafeAreaView style={styles.container}>
            <Animated.View entering={FadeInUp.duration(400)} style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={20} color={theme.colors.textStrong} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>{t('settings.why_ads', 'Why Ads?')}</Text>
                <View style={{ width: 40 }} />
            </Animated.View>

            <TourTarget id="screen.why-ads.workspace" native><TourScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

                {/* Hero */}
                <Animated.View entering={FadeInDown.delay(100).duration(600)} style={styles.heroBanner}>
                    <View style={styles.heroGlow} />
                    <View style={styles.heroIconRing}>
                        <View style={styles.heroIconInner}>
                            <Ionicons name="megaphone" size={26} color={ACCENT} />
                        </View>
                    </View>
                    <Text style={styles.heroTitle}>Ads keep it free</Text>
                    <Text style={styles.heroSubtitle}>
                        Responsibly selected ads let every school access the platform without raising subscription costs.
                    </Text>
                    <View style={styles.heroBadge}>
                        <Ionicons name="shield-checkmark" size={13} color={ACCENT} />
                        <Text style={styles.heroBadgeText}>No personal data sold. Ever.</Text>
                    </View>
                </Animated.View>

                {/* Labeled divider */}
                <Animated.View entering={FadeInDown.delay(200).duration(400)} style={styles.dividerRow}>
                    <View style={styles.dividerLine} />
                    <Text style={styles.dividerLabel}>HOW IT WORKS</Text>
                    <View style={styles.dividerLine} />
                </Animated.View>

                {/* Feature rows */}
                <View style={styles.card}>
                    <SectionRow icon="server-outline" iconColor="#6366F1" iconBg="#EEF2FF"
                        title="Subscriptions cover infrastructure"
                        body="Servers, databases, and storage — your subscription keeps the core running."
                        delay={260} />
                    <SectionRow icon="construct-outline" iconColor="#10B981" iconBg="#ECFDF5"
                        title="Ads fund continuous improvement"
                        body="Security, performance, new modules, microservices — ads finance what subscriptions can't."
                        delay={330} />
                    <SectionRow icon="eye-off-outline" iconColor={ACCENT} iconBg={ACCENT_SOFT}
                        title="Non-intrusive by design"
                        body="No pop-ups, no data harvesting. Ads are curated to stay out of your workflow."
                        delay={400} />
                    <SectionRow icon="trending-up-outline" iconColor="#3B82F6" iconBg="#EFF6FF"
                        title="Long-term sustainability"
                        body="Updates, bug fixes, new features — without shifting the cost onto schools."
                        delay={470} isLast />
                </View>

                {/* Premium CTA */}
                <Animated.View entering={FadeInDown.delay(530).duration(500)} style={styles.ctaCard}>
                    <View style={styles.ctaIconWrap}>
                        <Ionicons name="star" size={18} color={ACCENT} />
                    </View>
                    <View style={styles.ctaTextWrap}>
                        <Text style={styles.ctaTitle}>Want an ad-free experience?</Text>
                        <Text style={styles.ctaBody}>A premium tier is on the roadmap. Stay tuned.</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color="#B45309" />
                </Animated.View>

                {/* Footer */}
                <Animated.View entering={FadeInDown.delay(600).duration(400)} style={styles.footer}>
                    <Ionicons name="heart-outline" size={14} color={theme.colors.textSecondary} />
                    <Text style={styles.footerText}>Thank you for supporting accessible school management.</Text>
                </Animated.View>
            </TourScrollView></TourTarget>
        </SafeAreaView></TourTarget>
    );
}

const getStyles = (colors: ThemeColors) =>
    StyleSheet.create({
        container: { flex: 1, backgroundColor: 'transparent'},
        header: {
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 16 : 36, paddingBottom: 16,
            backgroundColor: colors.background, borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.border,
        },
        backButton: {
            width: 40, height: 40, borderRadius: 12, backgroundColor: colors.card,
            justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.border,
        },
        headerTitle: { fontSize: 18, fontWeight: '800', color: colors.textStrong, letterSpacing: 0.2 },
        scrollContent: { padding: 20, paddingBottom: 48 },

        heroBanner: {
            backgroundColor: colors.card, borderRadius: 20, padding: 28, alignItems: 'center',
            marginBottom: 20, borderWidth: 1, borderColor: ACCENT_MID, overflow: 'hidden',
        },
        heroGlow: {
            position: 'absolute', top: -50, alignSelf: 'center',
            width: 220, height: 220, borderRadius: 110,
            backgroundColor: ACCENT_SOFT, opacity: 0.6,
        },
        heroIconRing: {
            width: 72, height: 72, borderRadius: 36, backgroundColor: ACCENT_SOFT,
            justifyContent: 'center', alignItems: 'center', marginBottom: 16,
            borderWidth: 2, borderColor: ACCENT_MID,
        },
        heroIconInner: {
            width: 54, height: 54, borderRadius: 27,
            backgroundColor: '#FFFBEB', justifyContent: 'center', alignItems: 'center',
        },
        heroTitle: { fontSize: 22, fontWeight: '800', color: colors.textStrong, marginBottom: 10 },
        heroSubtitle: {
            fontSize: 14, color: colors.textSecondary, lineHeight: 22,
            textAlign: 'center', marginBottom: 16, paddingHorizontal: 8,
        },
        heroBadge: {
            flexDirection: 'row', alignItems: 'center', gap: 6,
            backgroundColor: ACCENT_SOFT, paddingHorizontal: 14, paddingVertical: 7,
            borderRadius: 20, borderWidth: 1, borderColor: ACCENT_MID,
        },
        heroBadgeText: { fontSize: 12, fontWeight: '600', color: '#92400E' },

        dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
        dividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
        dividerLabel: { fontSize: 10, fontWeight: '700', color: colors.textSecondary, letterSpacing: 1.4 },

        card: {
            backgroundColor: colors.card, borderRadius: 20,
            padding: 20, marginBottom: 16, borderWidth: 1, borderColor: colors.border,
        },

        ctaCard: {
            flexDirection: 'row', alignItems: 'center', gap: 12,
            backgroundColor: ACCENT_SOFT, borderRadius: 16, padding: 16,
            marginBottom: 28, borderWidth: 1, borderColor: ACCENT_MID,
        },
        ctaIconWrap: {
            width: 36, height: 36, borderRadius: 10, backgroundColor: '#FFFBEB',
            justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: ACCENT_MID,
        },
        ctaTextWrap: { flex: 1 },
        ctaTitle: { fontSize: 13, fontWeight: '700', color: '#92400E', marginBottom: 2 },
        ctaBody: { fontSize: 12, color: '#B45309', lineHeight: 17 },

        footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
        footerText: { fontSize: 12, color: colors.textSecondary, textAlign: 'center', lineHeight: 18, fontStyle: 'italic' },
    });