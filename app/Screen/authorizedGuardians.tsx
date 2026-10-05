import { TourTarget, TourScrollView } from '@/src/features/app-tour';
import React, { useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  Image,
  Pressable,
  Linking,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import AppTextInput from '@/src/components/AppTextInput';
import { styles as themeStyles } from '@/src/theme/styles';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from '@/src/utils/haptics';
import { useAuth } from '@/src/hooks/useAuth';
import { useTheme } from '@/src/hooks/useTheme';
import { useTranslation } from 'react-i18next';
import { clayCard, clayInset } from '@/src/theme/clayStyles';
import { schoolColorWithAlpha } from '@/src/constants/schoolConfig';
import ScreenLayout from '@/src/components/ScreenLayout';
import StudentSubpageHeader from '@/src/components/StudentSubpageHeader';
import { visitorService, type AuthorizedGuardian } from '@/src/services/visitorService';

const ACCENT = '#059669';
const RELATIONSHIPS = ['Father', 'Mother', 'Grandfather', 'Grandmother', 'Uncle', 'Aunt', 'Family Driver', 'Other Guardian'];

const STEPS = [
  { icon: 'person-add-outline' as const, titleKey: 'stepAdd', copyKey: 'stepAddCopy' },
  { icon: 'camera-outline' as const, titleKey: 'stepPhoto', copyKey: 'stepPhotoCopy' },
  { icon: 'key-outline' as const, titleKey: 'stepPass', copyKey: 'stepPassCopy' },
];

export default function AuthorizedGuardiansScreen() {
  const router = useRouter();
  const { portalContexts } = useAuth();
  const { isDark, theme } = useTheme();
  const { t } = useTranslation();

  const studentId = portalContexts?.activeContext?.student_id || '';
  const [guardians, setGuardians] = useState<AuthorizedGuardian[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [relationship, setRelationship] = useState('Father');
  const [mobile, setMobile] = useState('');
  const [idReference, setIdReference] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);

  const styles = useMemo(() => createStyles(isDark, theme.colors), [isDark, theme.colors]);

  const loadGuardians = async () => {
    if (!studentId) return;
    try {
      setLoading(true);
      const list = await visitorService.getGuardians(studentId);
      setGuardians(list);
    } catch (e: any) {
      console.warn('Failed to load guardians:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGuardians();
  }, [studentId]);

  const resetForm = () => {
    setName('');
    setMobile('');
    setIdReference('');
    setPhotoUri(null);
    setRelationship('Father');
    setFormError(null);
  };

  const openModal = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    resetForm();
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    resetForm();
  };

  const handlePickPhoto = async () => {
    Haptics.selectionAsync();
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('studentGuardians.permissionTitle'), t('studentGuardians.permissionBody'));
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!res.canceled && res.assets && res.assets[0]) {
      setPhotoUri(res.assets[0].uri);
    }
  };

  const handleAddGuardian = async () => {
    if (!name.trim() || !mobile.trim()) {
      setFormError(t('studentGuardians.formRequired'));
      return;
    }
    if (mobile.trim().length < 10) {
      setFormError(t('studentGuardians.formMobile'));
      return;
    }

    try {
      setSubmitting(true);
      setFormError(null);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const res = await visitorService.addGuardian({
        studentId,
        name: name.trim(),
        relationship,
        mobile: mobile.trim(),
        idReferenceMasked: idReference.trim() || undefined,
        photoUrl: photoUri || undefined,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setGuardians((prev) => [res.guardian, ...prev]);
      closeModal();
    } catch (err: any) {
      Alert.alert(t('studentGuardians.errorTitle'), err?.message || t('studentGuardians.errorBody'));
    } finally {
      setSubmitting(false);
    }
  };

  const callGuardian = (number: string) => {
    Haptics.selectionAsync();
    Linking.openURL(`tel:${number}`).catch(() => {});
  };

  return (
    <ScreenLayout>
      <SafeAreaView style={styles.root} edges={['left', 'right', 'bottom']}>
        <TourTarget id="screen.screen-authorized-guardians.overview"><StudentSubpageHeader
          title={t('studentGuardians.title')}
          subtitle={t('studentGuardians.subtitle')}
          onBack={() => router.back()}
          right={
            <Pressable style={styles.addButton} onPress={openModal} accessibilityRole="button" accessibilityLabel={t('studentGuardians.addGuardian')}>
              <Ionicons name="add" size={20} color="#FFFFFF" />
            </Pressable>
          }
        /></TourTarget>

        <TourTarget id="screen.screen-authorized-guardians.workspace" native><TourScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.policyBox}>
            <View style={styles.policyIcon}>
              <Ionicons name="shield-checkmark" size={18} color={ACCENT} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.policyTitle}>{t('studentGuardians.verifiedTitle')}</Text>
              <Text style={styles.policyText}>{t('studentGuardians.verifiedCopy')}</Text>
            </View>
          </View>

          {loading ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator size="small" color={ACCENT} />
              <Text style={styles.loadingLabel}>{t('studentGuardians.loading')}</Text>
            </View>
          ) : guardians.length === 0 ? (
            <Animated.View entering={FadeIn.duration(280)} style={styles.emptyContainer}>
              <View style={styles.emptyIconWell}>
                <Ionicons name="people" size={32} color={ACCENT} />
              </View>
              <Text style={styles.emptyTitle}>{t('studentGuardians.emptyTitle')}</Text>
              <Text style={styles.emptySub}>{t('studentGuardians.emptySub')}</Text>
              {STEPS.map((step) => (
                <View key={step.titleKey} style={styles.stepRow}>
                  <View style={styles.stepIcon}>
                    <Ionicons name={step.icon} size={16} color={ACCENT} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.stepTitle}>{t(`studentGuardians.${step.titleKey}`)}</Text>
                    <Text style={styles.stepCopy}>{t(`studentGuardians.${step.copyKey}`)}</Text>
                  </View>
                </View>
              ))}
              <TouchableOpacity style={styles.addFirstBtn} onPress={openModal} activeOpacity={0.9}>
                <LinearGradient colors={['#047857', '#10B981']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.addFirstGradient}>
                  <Ionicons name="add" size={18} color="#FFFFFF" />
                  <Text style={styles.addFirstBtnText}>{t('studentGuardians.addFirst')}</Text>
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>
          ) : (
            guardians.map((g, index) => (
              <Animated.View
                key={g.id}
                entering={FadeInDown.delay(Math.min(index, 6) * 40).duration(240)}
                style={styles.guardianCard}
              >
                <View style={styles.guardianRow}>
                  <View style={styles.avatarWrap}>
                    {g.photo_url ? (
                      <Image source={{ uri: g.photo_url }} style={styles.avatarImg} />
                    ) : (
                      <Text style={styles.avatarInitial}>{g.name.charAt(0).toUpperCase()}</Text>
                    )}
                  </View>
                  <View style={styles.guardianInfo}>
                    <View style={styles.nameRow}>
                      <Text style={styles.guardianName}>{g.name}</Text>
                      <View style={styles.statusPill}>
                        <Text style={styles.statusPillText}>{t(`studentGuardians.status.${g.status || 'ACTIVE'}`, g.status || 'ACTIVE')}</Text>
                      </View>
                    </View>
                    <Text style={styles.guardianMeta}>{t(`studentGuardians.rel.${g.relationship.replace(/\s+/g, '')}`, g.relationship)}</Text>
                    {g.id_reference_masked ? (
                      <Text style={styles.idMasked}>{t('studentGuardians.idRef', { value: g.id_reference_masked })}</Text>
                    ) : null}
                  </View>
                </View>

                <View style={styles.actionRow}>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => callGuardian(g.mobile)}>
                    <Ionicons name="call-outline" size={15} color={ACCENT} />
                    <Text style={styles.actionBtnText}>{g.mobile}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.passBtn}
                    onPress={() =>
                      router.push({
                        pathname: '/Screen/studentPickup',
                        params: { guardianId: g.id },
                      } as any)
                    }
                  >
                    <Ionicons name="key-outline" size={14} color="#FFFFFF" />
                    <Text style={styles.passBtnText}>{t('studentGuardians.pickupPass')}</Text>
                  </TouchableOpacity>
                </View>
              </Animated.View>
            ))
          )}
        </TourScrollView></TourTarget>

        <Modal visible={modalVisible} animationType="slide" transparent>
          <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <Pressable style={StyleSheet.absoluteFill} onPress={closeModal} />
            <SafeAreaView style={styles.modalSheet} edges={['bottom']}>
              <View style={styles.sheetHandle} />
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>{t('studentGuardians.modalTitle')}</Text>
                  <Text style={styles.modalSub}>{t('studentGuardians.modalSub')}</Text>
                </View>
                <TouchableOpacity onPress={closeModal} style={styles.closeBtn} accessibilityLabel={t('studentGuardians.close')}>
                  <Ionicons name="close" size={20} color={theme.colors.textMuted} />
                </TouchableOpacity>
              </View>

              <TourScrollView contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled">
                <TouchableOpacity style={styles.photoPicker} onPress={handlePickPhoto} activeOpacity={0.85}>
                  {photoUri ? (
                    <>
                      <Image source={{ uri: photoUri }} style={styles.pickerImg} />
                      <View style={styles.photoChange}>
                        <Ionicons name="camera" size={14} color="#FFFFFF" />
                        <Text style={styles.photoChangeText}>{t('studentGuardians.changePhoto')}</Text>
                      </View>
                    </>
                  ) : (
                    <View style={styles.photoPlaceholder}>
                      <View style={styles.cameraWell}>
                        <Ionicons name="camera" size={22} color={ACCENT} />
                      </View>
                      <Text style={styles.photoHint}>{t('studentGuardians.addPhoto')}</Text>
                      <Text style={styles.photoHintSub}>{t('studentGuardians.addPhotoSub')}</Text>
                    </View>
                  )}
                </TouchableOpacity>

                <Text style={styles.formLabel}>{t('studentGuardians.fullName')}</Text>
                <AppTextInput
                  style={[themeStyles.inputInChrome, styles.formInput]}
                  placeholder={t('studentGuardians.namePlaceholder')}
                  value={name}
                  onChangeText={(t) => {
                    setName(t);
                    setFormError(null);
                  }}
                />

                <Text style={styles.formLabel}>{t('studentGuardians.relationship')}</Text>
                <View style={styles.relWrap}>
                  {RELATIONSHIPS.map((rel) => {
                    const isSelected = relationship === rel;
                    return (
                      <TouchableOpacity
                        key={rel}
                        style={[styles.relChip, isSelected && styles.relChipOn]}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setRelationship(rel);
                        }}
                      >
                        <Text style={[styles.relChipText, isSelected && styles.relChipTextOn]}>
                          {t(`studentGuardians.rel.${rel.replace(/\s+/g, '')}`, rel)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={styles.formLabel}>{t('studentGuardians.phone')}</Text>
                <AppTextInput
                  style={[themeStyles.inputInChrome, styles.formInput]}
                  placeholder={t('studentGuardians.phonePlaceholder')}
                  keyboardType="phone-pad"
                  maxLength={13}
                  value={mobile}
                  onChangeText={(value) => {
                    setMobile(value);
                    setFormError(null);
                  }}
                />

                <Text style={styles.formLabel}>{t('studentGuardians.idOptional')}</Text>
                <AppTextInput
                  style={[themeStyles.inputInChrome, styles.formInput]}
                  placeholder={t('studentGuardians.idPlaceholder')}
                  value={idReference}
                  onChangeText={setIdReference}
                />

                {formError ? <Text style={styles.formError}>{formError}</Text> : null}

                <TouchableOpacity style={styles.saveBtn} onPress={handleAddGuardian} disabled={submitting} activeOpacity={0.9}>
                  <LinearGradient colors={['#047857', '#10B981']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.saveBtnGradient}>
                    {submitting ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <Text style={styles.saveBtnText}>{t('studentGuardians.save')}</Text>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </TourScrollView>
            </SafeAreaView>
          </KeyboardAvoidingView>
        </Modal>
      </SafeAreaView>
    </ScreenLayout>
  );
}

function createStyles(
  isDark: boolean,
  colors: { background: string; textStrong: string; textMuted: string },
) {
  const cardBg = isDark ? '#161E2E' : '#FFFFFF';
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 10,
      gap: 10,
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#FFFFFF',
    },
    headerTitleBlock: { flex: 1 },
    headerTitle: { fontSize: 22, fontWeight: '800', letterSpacing: -0.4, color: colors.textStrong },
    headerSub: { fontSize: 13, fontWeight: '600', color: colors.textMuted, marginTop: 1 },
    addButton: {
      backgroundColor: ACCENT,
      width: 40,
      height: 40,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scrollContent: { padding: 16, paddingBottom: 48, width: '100%', maxWidth: 640, alignSelf: 'center' },
    policyBox: {
      ...clayCard(isDark, 'sm'),
      flexDirection: 'row',
      gap: 12,
      alignItems: 'center',
      padding: 14,
      borderRadius: 20,
      marginBottom: 16,
    },
    policyIcon: {
      width: 40,
      height: 40,
      borderRadius: 14,
      backgroundColor: schoolColorWithAlpha(ACCENT, isDark ? 0.2 : 0.12),
      alignItems: 'center',
      justifyContent: 'center',
    },
    policyTitle: { fontSize: 14, fontWeight: '800', color: colors.textStrong },
    policyText: { fontSize: 12, lineHeight: 17, marginTop: 2, color: colors.textMuted },
    centerContainer: { padding: 48, alignItems: 'center', gap: 10 },
    loadingLabel: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
    emptyContainer: { alignItems: 'center', paddingTop: 12, paddingHorizontal: 4 },
    emptyIconWell: {
      width: 76,
      height: 76,
      borderRadius: 26,
      backgroundColor: schoolColorWithAlpha(ACCENT, isDark ? 0.18 : 0.1),
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
    },
    emptyTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3, color: colors.textStrong, textAlign: 'center' },
    emptySub: { fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 21, color: colors.textMuted, marginBottom: 20, maxWidth: 320 },
    stepRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      width: '100%',
      paddingVertical: 10,
      paddingHorizontal: 8,
    },
    stepIcon: {
      width: 36,
      height: 36,
      borderRadius: 12,
      backgroundColor: schoolColorWithAlpha(ACCENT, isDark ? 0.16 : 0.1),
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepTitle: { fontSize: 14, fontWeight: '800', color: colors.textStrong },
    stepCopy: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
    addFirstBtn: { marginTop: 16, width: '100%', borderRadius: 16, overflow: 'hidden' },
    addFirstGradient: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 14,
    },
    addFirstBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
    guardianCard: {
      ...clayCard(isDark, 'sm'),
      borderRadius: 20,
      padding: 14,
      marginBottom: 12,
    },
    guardianRow: { flexDirection: 'row', alignItems: 'center' },
    avatarWrap: {
      width: 56,
      height: 56,
      borderRadius: 18,
      backgroundColor: schoolColorWithAlpha(ACCENT, 0.12),
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    avatarImg: { width: '100%', height: '100%' },
    avatarInitial: { fontSize: 20, fontWeight: '800', color: ACCENT },
    guardianInfo: { flex: 1, marginLeft: 12 },
    nameRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
    guardianName: { fontSize: 16, fontWeight: '800', color: colors.textStrong, flex: 1 },
    statusPill: {
      backgroundColor: schoolColorWithAlpha(ACCENT, 0.14),
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
    },
    statusPillText: { color: ACCENT, fontSize: 10, fontWeight: '800' },
    guardianMeta: { fontSize: 13, marginTop: 3, color: colors.textMuted, fontWeight: '600' },
    idMasked: { fontSize: 11, marginTop: 2, color: colors.textMuted },
    actionRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
    actionBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      height: 42,
      borderRadius: 12,
      backgroundColor: schoolColorWithAlpha(ACCENT, isDark ? 0.16 : 0.1),
    },
    actionBtnText: { color: ACCENT, fontSize: 12, fontWeight: '800' },
    passBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      height: 42,
      paddingHorizontal: 14,
      borderRadius: 12,
      backgroundColor: ACCENT,
    },
    passBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(15,23,42,0.45)',
      justifyContent: 'flex-end',
    },
    modalSheet: {
      backgroundColor: cardBg,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      maxHeight: '92%',
    },
    sheetHandle: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(15,23,42,0.12)',
      marginTop: 10,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      paddingHorizontal: 20,
      paddingTop: 14,
      paddingBottom: 8,
    },
    modalTitle: { fontSize: 18, fontWeight: '800', color: colors.textStrong, letterSpacing: -0.3 },
    modalSub: { fontSize: 12, color: colors.textMuted, marginTop: 3, maxWidth: 260 },
    closeBtn: {
      width: 36,
      height: 36,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9',
    },
    modalScroll: { padding: 20, paddingBottom: 32 },
    photoPicker: {
      alignSelf: 'center',
      width: 148,
      height: 148,
      borderRadius: 28,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 8,
      backgroundColor: schoolColorWithAlpha(ACCENT, isDark ? 0.14 : 0.08),
      borderWidth: 1.5,
      borderColor: schoolColorWithAlpha(ACCENT, 0.28),
      borderStyle: 'dashed',
    },
    pickerImg: { width: '100%', height: '100%' },
    photoPlaceholder: { alignItems: 'center', justifyContent: 'center', padding: 12 },
    cameraWell: {
      width: 44,
      height: 44,
      borderRadius: 16,
      backgroundColor: isDark ? 'rgba(16,185,129,0.2)' : '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 8,
    },
    photoHint: { fontSize: 13, color: ACCENT, textAlign: 'center', fontWeight: '800' },
    photoHintSub: { fontSize: 11, color: colors.textMuted, textAlign: 'center', marginTop: 2 },
    photoChange: {
      position: 'absolute',
      bottom: 10,
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: 'rgba(15,23,42,0.72)',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
    },
    photoChangeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
    formLabel: {
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
      color: colors.textMuted,
      marginTop: 14,
      marginBottom: 6,
    },
    formInput: {
      ...clayInset(isDark),
      height: 48,
      borderRadius: 14,
      paddingHorizontal: 14,
      fontSize: 15,
      fontWeight: '600',
      color: colors.textStrong,
    },
    relWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    relChip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 12,
      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F1F5F9',
    },
    relChipOn: { backgroundColor: ACCENT },
    relChipText: { fontSize: 12, fontWeight: '700', color: colors.textStrong },
    relChipTextOn: { color: '#FFFFFF' },
    formError: { marginTop: 12, color: '#DC2626', fontWeight: '700', fontSize: 13 },
    saveBtn: { marginTop: 22, borderRadius: 16, overflow: 'hidden' },
    saveBtnGradient: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 15,
    },
    saveBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  });
}
