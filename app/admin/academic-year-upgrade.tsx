import { TourTarget, TourScrollView } from '@/src/features/app-tour';
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator,
  Platform, Modal, Pressable, useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from '@/src/utils/haptics';
import AdminHeader from '../../src/components/AdminHeader';
import { useTheme } from '../../src/hooks/useTheme';
import { AcademicYearService, AcademicYear, UpgradePreview } from '../../src/services/academicYearService';

const isWeb = Platform.OS === 'web';
const INDIGO = '#4F46E5';
const INDIGO_DARK = '#4338CA';
const INDIGO_LIGHT = '#EEF2FF';
const SORT_ORDER_ERROR =
  'Classes must have sort_order configured before performing an upgrade. Go to Academics > Classes and set the class order.';

export default function AcademicYearUpgradeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const isWide = isWeb && windowWidth >= 768;

  const [currentYear, setCurrentYear] = useState<AcademicYear | null>(null);
  const [allYears, setAllYears] = useState<AcademicYear[]>([]);
  const [preview, setPreview] = useState<UpgradePreview | null>(null);
  const [loadingYear, setLoadingYear] = useState(true);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [settingYear, setSettingYear] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [upgradeResult, setUpgradeResult] = useState<{ upgraded: number; graduated: number; year: string } | null>(null);

  const bg = isDark ? '#0B0F17' : '#F3F4F6';
  const card = isDark ? '#141C2E' : '#FFFFFF';
  const border = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(15,23,42,0.06)';
  const textPri = isDark ? '#F8FAFC' : '#0F172A';
  const textSec = isDark ? 'rgba(248,250,252,0.55)' : '#64748B';
  const radius = isWide ? 20 : 16;

  // Fetch current year
  useEffect(() => {
    (async () => {
      try {
        const yr = await AcademicYearService.getCurrentYear();
        setCurrentYear(yr);
      } catch (e: any) {
        // Current year not found — fetch all years for picker
        try {
          const years = await AcademicYearService.getAllYears();
          setAllYears(years);
        } catch { /* ignore */ }
        setError(e.message || 'No active academic year set.');
      } finally {
        setLoadingYear(false);
      }
    })();
  }, []);

  // Fetch preview once current year is loaded
  useEffect(() => {
    if (!currentYear || success) return;
    setLoadingPreview(true);
    setError(null);
    (async () => {
      try {
        const p = await AcademicYearService.getUpgradePreview();
        setPreview(p);
        if (p.max_sort_order <= 0) {
          setError(SORT_ORDER_ERROR);
        }
      } catch (e: any) {
        setError(e.message || 'Failed to load upgrade preview.');
      } finally {
        setLoadingPreview(false);
      }
    })();
  }, [currentYear, success]);

  const toYearCode = preview?.to_year?.code || null;

  // Set the active academic year
  const handleSetYear = useCallback(async (yearId: string) => {
    setSettingYear(true);
    setError(null);
    try {
      const yr = await AcademicYearService.setCurrentYear(yearId);
      setCurrentYear(yr);
      setAllYears([]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      setError(e.message || 'Failed to set academic year.');
    } finally {
      setSettingYear(false);
    }
  }, []);

  const handleUpgrade = useCallback(async () => {
    if (!currentYear || !toYearCode) return;
    setShowConfirm(false);
    setUpgrading(true);
    setError(null);
    try {
      const result = await AcademicYearService.executeUpgrade(currentYear.code, toYearCode);
      setUpgradeResult({ upgraded: result.upgraded_count, graduated: result.graduated_count, year: result.new_year });
      setSuccess(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => { if (router.canGoBack()) router.back(); }, 3000);
    } catch (e: any) {
      setError(e.message || 'Upgrade failed. All changes have been rolled back.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setUpgrading(false);
    }
  }, [currentYear, toYearCode, router]);

  const fmt = (n: number) => n.toLocaleString('en-IN');

  // --- RENDER ---
  return (
    <View style={[styles.root, { backgroundColor: bg, paddingTop: insets.top }]}>
      <TourTarget id="screen.admin-academic-year-upgrade.overview"><AdminHeader title="Academic Year Upgrade" showBackButton showMenuButton={false} showProfileButton={false} /></TourTarget>

      <TourTarget id="screen.admin-academic-year-upgrade.workspace" native><TourScrollView
        contentContainerStyle={[styles.scroll, isWide && { maxWidth: 640, alignSelf: 'center', width: '100%' }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── CURRENT YEAR CARD ── */}
        <Animated.View entering={FadeInDown.delay(80).springify()} style={[styles.card, { backgroundColor: card, borderColor: border, borderRadius: radius }]}>
          <View style={[styles.cardAccent, { backgroundColor: INDIGO }]} />
          <View style={styles.cardInner}>
            <View style={[styles.iconCircle, { backgroundColor: INDIGO_LIGHT }]}>
              <Ionicons name="calendar-outline" size={22} color={INDIGO} />
            </View>
            <Text style={[styles.cardLabel, { color: textSec }]}>CURRENT ACADEMIC YEAR</Text>
            {loadingYear ? (
              <ActivityIndicator color={INDIGO} style={{ marginTop: 8 }} />
            ) : currentYear ? (
              <Text style={[styles.yearValue, { color: textPri }]}>{currentYear.code}</Text>
            ) : (
              <>
                <Text style={[styles.yearValue, { color: '#EF4444' }]}>Not Set</Text>
                {/* Year picker */}
                {allYears.length > 0 ? (
                  <View style={{ marginTop: 16 }}>
                    <Text style={[styles.pickerLabel, { color: textSec }]}>
                      Select the current academic year:
                    </Text>
                    <View style={styles.yearChips}>
                      {allYears.map((yr) => (
                        <Pressable
                          key={yr.id}
                          onPress={() => handleSetYear(yr.id)}
                          disabled={settingYear}
                          style={({ pressed }) => [
                            styles.yearChip,
                            { borderColor: INDIGO, backgroundColor: pressed ? INDIGO_LIGHT : 'transparent' },
                            settingYear && { opacity: 0.5 },
                          ]}
                        >
                          <Text style={[styles.yearChipText, { color: INDIGO }]}>{yr.code}</Text>
                        </Pressable>
                      ))}
                    </View>
                    {settingYear && <ActivityIndicator color={INDIGO} style={{ marginTop: 10 }} />}
                  </View>
                ) : (
                  <Text style={[styles.errorHint, { color: '#F59E0B', marginTop: 12 }]}>
                    No academic years found. Go to Academics → Academic Years to create one.
                  </Text>
                )}
              </>
            )}
          </View>
        </Animated.View>

        {/* ── UPGRADE TO CARD ── */}
        {!success && currentYear && (
          <Animated.View entering={FadeInDown.delay(160).springify()} style={[styles.card, { backgroundColor: card, borderColor: border, borderRadius: radius }]}>
            <View style={[styles.cardAccent, { backgroundColor: '#7C3AED' }]} />
            <View style={styles.cardInner}>
              <View style={[styles.iconCircle, { backgroundColor: '#F5F3FF' }]}>
                <Ionicons name="arrow-forward-circle-outline" size={22} color="#7C3AED" />
              </View>
              <Text style={[styles.cardLabel, { color: textSec }]}>UPGRADE TO</Text>
              {loadingPreview ? (
                <ActivityIndicator color="#7C3AED" style={{ marginTop: 8 }} />
              ) : toYearCode ? (
                <Text style={[styles.yearValue, { color: textPri }]}>{toYearCode}</Text>
              ) : (
                <Text style={[styles.errorHint, { color: '#F59E0B' }]}>
                  No next academic year found. Create one in Academics → Academic Years first.
                </Text>
              )}
            </View>
          </Animated.View>
        )}

        {/* ── PREVIEW CARD ── */}
        {!success && preview && preview.has_next_year && (
          <Animated.View entering={FadeInDown.delay(240).springify()} style={[styles.card, { backgroundColor: card, borderColor: border, borderRadius: radius }]}>
            <View style={[styles.cardAccent, { backgroundColor: '#10B981' }]} />
            <View style={styles.cardInner}>
              <Text style={[styles.sectionTitle, { color: textPri }]}>Upgrade Preview</Text>

              <View style={styles.previewRow}>
                <View style={[styles.previewDot, { backgroundColor: '#3B82F6' }]} />
                <Text style={[styles.previewLabel, { color: textSec }]}>Students to be promoted</Text>
                <Text style={[styles.previewValue, { color: textPri }]}>{fmt(preview.upgrade_count)}</Text>
              </View>
              <View style={styles.previewRow}>
                <View style={[styles.previewDot, { backgroundColor: '#F59E0B' }]} />
                <Text style={[styles.previewLabel, { color: textSec }]}>Students to be passed out</Text>
                <Text style={[styles.previewValue, { color: textPri }]}>{fmt(preview.graduate_count)}</Text>
              </View>
              <View style={[styles.divider, { backgroundColor: border }]} />
              <View style={styles.previewRow}>
                <View style={[styles.previewDot, { backgroundColor: INDIGO }]} />
                <Text style={[styles.previewLabel, { color: textPri, fontWeight: '700' }]}>Total affected</Text>
                <Text style={[styles.previewValue, { color: INDIGO, fontWeight: '800' }]}>{fmt(preview.total)}</Text>
              </View>

              {/* Warning banner */}
              <View style={[styles.warningBanner, { backgroundColor: isDark ? 'rgba(245,158,11,0.1)' : '#FFFBEB', borderColor: isDark ? 'rgba(245,158,11,0.2)' : '#FEF3C7' }]}>
                <Ionicons name="warning-outline" size={18} color="#F59E0B" style={{ marginRight: 8, marginTop: 1 }} />
                <Text style={[styles.warningText, { color: isDark ? '#FBBF24' : '#92400E' }]}>
                  This action cannot be undone. All student class records will be updated permanently.
                </Text>
              </View>
            </View>
          </Animated.View>
        )}

        {/* ── ERROR ── */}
        {error && (
          <Animated.View entering={FadeIn.duration(300)} style={[styles.errorCard, { backgroundColor: isDark ? 'rgba(239,68,68,0.1)' : '#FEF2F2', borderColor: isDark ? 'rgba(239,68,68,0.2)' : '#FECACA', borderRadius: radius }]}>
            <Ionicons name="alert-circle" size={20} color="#EF4444" />
            <Text style={[styles.errorText, { color: isDark ? '#FCA5A5' : '#991B1B' }]}>{error}</Text>
          </Animated.View>
        )}

        {/* ── SUCCESS CARD ── */}
        {success && upgradeResult && (
          <Animated.View entering={FadeInDown.delay(100).springify()} style={[styles.card, { backgroundColor: card, borderColor: '#10B981', borderWidth: 2, borderRadius: radius }]}>
            <View style={[styles.cardAccent, { backgroundColor: '#10B981' }]} />
            <View style={[styles.cardInner, { alignItems: 'center' }]}>
              <View style={[styles.successIcon]}>
                <Ionicons name="checkmark-circle" size={48} color="#10B981" />
              </View>
              <Text style={[styles.successTitle, { color: textPri }]}>
                Academic Year Upgraded Successfully!
              </Text>
              <Text style={[styles.successSub, { color: textSec }]}>
                Upgraded to {upgradeResult.year}
              </Text>
              <View style={styles.successStats}>
                <View style={styles.successStat}>
                  <Text style={[styles.successStatVal, { color: '#3B82F6' }]}>{fmt(upgradeResult.upgraded)}</Text>
                  <Text style={[styles.successStatLbl, { color: textSec }]}>Promoted</Text>
                </View>
                <View style={[styles.successDivider, { backgroundColor: border }]} />
                <View style={styles.successStat}>
                  <Text style={[styles.successStatVal, { color: '#F59E0B' }]}>{fmt(upgradeResult.graduated)}</Text>
                  <Text style={[styles.successStatLbl, { color: textSec }]}>Passed out</Text>
                </View>
              </View>
              <Text style={[styles.redirectNote, { color: textSec }]}>Returning to dashboard…</Text>
            </View>
          </Animated.View>
        )}

        {/* ── UPGRADE BUTTON ── */}
        {!success && preview?.has_next_year && (
          <Animated.View entering={FadeInDown.delay(320).springify()} style={{ marginTop: 8 }}>
            <Pressable
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setShowConfirm(true); }}
              disabled={upgrading || !toYearCode || (preview?.max_sort_order ?? 0) <= 0}
              style={({ pressed }) => [styles.upgradeBtn, (upgrading || !toYearCode) && styles.upgradeBtnDisabled, pressed && { opacity: 0.9 }]}
            >
              <LinearGradient colors={[INDIGO, INDIGO_DARK]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.upgradeBtnGrad}>
                {upgrading ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <>
                    <Ionicons name="arrow-up-circle-outline" size={22} color="#FFF" style={{ marginRight: 10 }} />
                    <Text style={styles.upgradeBtnText}>Confirm & Upgrade</Text>
                  </>
                )}
              </LinearGradient>
            </Pressable>
          </Animated.View>
        )}

        <View style={{ height: 40 }} />
      </TourScrollView></TourTarget>

      {/* ── CONFIRMATION MODAL ── */}
      <Modal visible={showConfirm} transparent animationType="fade" onRequestClose={() => setShowConfirm(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowConfirm(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: card, borderRadius: radius + 4 }]} onPress={() => {}}>
            <View style={[styles.modalIconWrap, { backgroundColor: INDIGO_LIGHT }]}>
              <Ionicons name="alert-circle-outline" size={36} color={INDIGO} />
            </View>
            <Text style={[styles.modalTitle, { color: textPri }]}>Confirm Academic Year Upgrade</Text>
            <Text style={[styles.modalBody, { color: textSec }]}>
              You are upgrading from{' '}
              <Text style={{ fontWeight: '700', color: textPri }}>{currentYear?.code}</Text>
              {' '}to{' '}
              <Text style={{ fontWeight: '700', color: textPri }}>{toYearCode}</Text>.
            </Text>
            <Text style={[styles.modalBody, { color: textSec, marginTop: 8 }]}>
              • {fmt(preview?.upgrade_count ?? 0)} students will move to the next class{'\n'}
              • {fmt(preview?.graduate_count ?? 0)} students will be marked as Passed out{'\n\n'}
              This cannot be reversed.
            </Text>
            <View style={styles.modalActions}>
              <Pressable onPress={() => setShowConfirm(false)} style={[styles.modalBtn, styles.modalBtnCancel, { borderColor: border }]}>
                <Text style={[styles.modalBtnText, { color: textSec }]}>Cancel</Text>
              </Pressable>
              <Pressable onPress={handleUpgrade} style={[styles.modalBtn, styles.modalBtnConfirm]}>
                <LinearGradient colors={[INDIGO, INDIGO_DARK]} style={styles.modalBtnGrad}>
                  <Text style={[styles.modalBtnText, { color: '#FFF' }]}>Yes, Upgrade</Text>
                </LinearGradient>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { padding: 20, paddingTop: 16 },
  card: {
    borderWidth: 1, marginBottom: 16, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 4,
  },
  cardAccent: { height: 3 },
  cardInner: { padding: 20 },
  iconCircle: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  cardLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginBottom: 6 },
  yearValue: { fontSize: 28, fontWeight: '900', letterSpacing: -0.5 },
  sectionTitle: { fontSize: 16, fontWeight: '800', letterSpacing: -0.2, marginBottom: 18 },
  previewRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  previewDot: { width: 8, height: 8, borderRadius: 4, marginRight: 12 },
  previewLabel: { flex: 1, fontSize: 14, fontWeight: '500' },
  previewValue: { fontSize: 18, fontWeight: '800', minWidth: 50, textAlign: 'right' },
  divider: { height: 1, marginVertical: 10 },
  warningBanner: { flexDirection: 'row', alignItems: 'flex-start', borderWidth: 1, borderRadius: 12, padding: 14, marginTop: 16 },
  warningText: { flex: 1, fontSize: 13, fontWeight: '500', lineHeight: 19 },
  errorCard: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, padding: 16, marginBottom: 16 },
  errorText: { flex: 1, marginLeft: 10, fontSize: 13, fontWeight: '500', lineHeight: 19 },
  errorHint: { fontSize: 13, fontWeight: '500', lineHeight: 19, marginTop: 6 },
  pickerLabel: { fontSize: 13, fontWeight: '600', marginBottom: 10 },
  yearChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  yearChip: { borderWidth: 2, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 18 },
  yearChipText: { fontSize: 15, fontWeight: '700' },
  successIcon: { marginBottom: 12 },
  successTitle: { fontSize: 18, fontWeight: '800', textAlign: 'center', marginBottom: 6 },
  successSub: { fontSize: 14, fontWeight: '500', textAlign: 'center', marginBottom: 20 },
  successStats: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  successStat: { alignItems: 'center', paddingHorizontal: 24 },
  successStatVal: { fontSize: 26, fontWeight: '900' },
  successStatLbl: { fontSize: 11, fontWeight: '600', marginTop: 4 },
  successDivider: { width: 1, height: 40, marginHorizontal: 8 },
  redirectNote: { fontSize: 12, fontWeight: '500', marginTop: 18, textAlign: 'center' },
  upgradeBtn: { borderRadius: 16, overflow: 'hidden', shadowColor: INDIGO, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 8 },
  upgradeBtnDisabled: { opacity: 0.5 },
  upgradeBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 18, paddingHorizontal: 24 },
  upgradeBtnText: { color: '#FFF', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalCard: { width: '100%', maxWidth: 420, padding: 28, alignItems: 'center' },
  modalIconWrap: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '800', textAlign: 'center', marginBottom: 12 },
  modalBody: { fontSize: 14, fontWeight: '400', textAlign: 'center', lineHeight: 22 },
  modalActions: { flexDirection: 'row', marginTop: 24, gap: 12, width: '100%' },
  modalBtn: { flex: 1, borderRadius: 14, overflow: 'hidden' },
  modalBtnCancel: { borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 14 },
  modalBtnConfirm: {},
  modalBtnGrad: { alignItems: 'center', justifyContent: 'center', paddingVertical: 14 },
  modalBtnText: { fontSize: 15, fontWeight: '700' },
});
