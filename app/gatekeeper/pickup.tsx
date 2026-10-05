import { TourTarget, TourScrollView } from '@/src/features/app-tour';
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from '@/src/utils/haptics';
import { useTheme } from '@/src/hooks/useTheme';
import { visitorService, type SchoolGate } from '@/src/services/visitorService';

export default function GatekeeperPickupScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string }>();
  const { isDark } = useTheme();

  const [currentGate, setCurrentGate] = useState<SchoolGate | null>(null);
  const [passCode, setPassCode] = useState(params.code || '');
  const [otp, setOtp] = useState('');
  const [validating, setValidating] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [record, setRecord] = useState<any>(null);
  const [validationResult, setValidationResult] = useState<any>(null);

  useEffect(() => {
    visitorService.getMyGate().then((res) => {
      if (res?.currentGate) setCurrentGate(res.currentGate);
    });
    if (params.code) {
      handleValidate(params.code);
    }
  }, [params.code]);

  const handleValidate = async (codeToVerify?: string, otpToVerify?: string) => {
    const code = (codeToVerify || passCode).trim();
    if (!code) {
      Alert.alert('Missing Code', 'Please enter or scan the pickup pass code.');
      return;
    }

    try {
      setValidating(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const res = await visitorService.validatePickup(code, (otpToVerify || otp).trim() || undefined);
      setValidationResult(res);
      if (res.record) {
        setRecord(res.record);
      }

      if (res.isValid) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Validation Error', err?.message || 'Could not validate pickup pass.');
    } finally {
      setValidating(false);
    }
  };

  const handleReleaseStudent = async () => {
    if (!record?.id || !currentGate?.id) {
      Alert.alert('Error', 'Missing authorization or active gate identifier.');
      return;
    }

    Alert.alert(
      'Confirm Student Release',
      `Confirm physical handover of student ${record.student_name} to ${record.pickup_name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'CONFIRM RELEASE',
          onPress: async () => {
            try {
              setReleasing(true);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

              await visitorService.releaseStudent(record.id, currentGate.id);

              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert(
                'Student Handover Complete',
                `${record.student_name} has been safely released to ${record.pickup_name}. Parent notification sent.`,
                [
                  {
                    text: 'Next Pickup',
                    onPress: () => {
                      setRecord(null);
                      setValidationResult(null);
                      setPassCode('');
                      setOtp('');
                    },
                  },
                  {
                    text: 'Dashboard',
                    onPress: () => router.replace('/gatekeeper/dashboard' as any),
                  },
                ]
              );
            } catch (err: any) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              Alert.alert('Release Failed', err?.message || 'Could not complete student release.');
            } finally {
              setReleasing(false);
            }
          },
        },
      ]
    );
  };

  const bgColor = isDark ? '#0B0F17' : '#F4F6F9';
  const cardBg = isDark ? '#161E2E' : '#FFFFFF';
  const textColor = isDark ? '#F1F5F9' : '#0F172A';
  const subColor = isDark ? '#94A3B8' : '#64748B';
  const borderColor = isDark ? '#26334A' : '#E2E8F0';

  const isValid = Boolean(validationResult?.isValid);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: bgColor }]}>
      {/* Header */}
      <TourTarget id="screen.gatekeeper-pickup.overview" native><View style={[styles.header, { borderBottomColor: borderColor }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={textColor} />
        </TouchableOpacity>
        <View style={styles.headerTitleCol}>
          <Text style={[styles.headerTitle, { color: textColor }]}>Student Pickup Handover</Text>
          <Text style={[styles.headerSub, { color: subColor }]}>Identity Verification & Dismissal</Text>
        </View>
        <TouchableOpacity
          style={styles.scanIconBtn}
          onPress={() => router.push('/gatekeeper/scanner' as any)}
        >
          <Ionicons name="qr-code-outline" size={20} color="#10B981" />
        </TouchableOpacity>
      </View></TourTarget>

      <TourTarget id="screen.gatekeeper-pickup.workspace" native><TourScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Pass Code & OTP Input Box */}
        <View style={[styles.searchBox, { backgroundColor: cardBg, borderColor }]}>
          <Text style={[styles.boxLabel, { color: subColor }]}>PICKUP PASS CODE (OR SCAN QR)</Text>
          <View style={styles.inputRow}>
            <TourTarget id="gatekeeper.pickup.code" native><TextInput
              style={[styles.inputField, { color: textColor, borderColor }]}
              placeholder="e.g. PK-82A-91Z"
              placeholderTextColor={subColor}
              autoCapitalize="characters"
              value={passCode}
              onChangeText={setPassCode}
            /></TourTarget>
            <TourTarget id="gatekeeper.pickup.validate" native><TouchableOpacity
              style={styles.checkBtn}
              onPress={() => handleValidate()}
              disabled={validating || !passCode.trim()}
            >
              {validating ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.checkBtnText}>Verify</Text>
              )}
            </TouchableOpacity></TourTarget>
          </View>

          {/* OTP Input if required */}
          <Text style={[styles.boxLabel, { color: subColor, marginTop: 12 }]}>
            ONE-TIME SECURITY OTP (6 DIGITS)
          </Text>
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.inputField, { color: textColor, borderColor, letterSpacing: 4, fontWeight: '800' }]}
              placeholder="000000"
              placeholderTextColor={subColor}
              keyboardType="number-pad"
              maxLength={6}
              value={otp}
              onChangeText={(t) => {
                setOtp(t);
                if (t.length === 6 && passCode) {
                  handleValidate(passCode, t);
                }
              }}
            />
            <TouchableOpacity
              style={[styles.checkBtn, { backgroundColor: '#3B82F6' }]}
              onPress={() => handleValidate()}
              disabled={validating || !otp.trim()}
            >
              <Text style={styles.checkBtnText}>Submit OTP</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Validation Result Banner */}
        {validationResult && (
          <View
            style={[
              styles.statusBanner,
              {
                backgroundColor: isValid ? '#10B981' : '#EF4444',
              },
            ]}
          >
            <Ionicons
              name={isValid ? 'checkmark-circle' : 'alert-circle'}
              size={24}
              color="#FFFFFF"
            />
            <View style={styles.bannerTextCol}>
              <Text style={styles.bannerMainText}>
                {isValid ? 'VERIFIED FOR STUDENT RELEASE' : 'RELEASE DENIED'}
              </Text>
              <Text style={styles.bannerSubText}>{validationResult.message}</Text>
            </View>
          </View>
        )}

        {/* Record Details Card */}
        {record && (
          <View style={[styles.detailsCard, { backgroundColor: cardBg, borderColor }]}>
            {/* Student Section */}
            <View style={styles.sectionHeader}>
              <Ionicons name="school" size={16} color="#6366F1" />
              <Text style={[styles.sectionTitle, { color: textColor }]}>STUDENT DETAILS</Text>
            </View>

            <View style={styles.personRow}>
              <View style={[styles.avatarBox, { backgroundColor: 'rgba(99,102,241,0.1)' }]}>
                {record.student_photo_url ? (
                  <Image source={{ uri: record.student_photo_url }} style={styles.avatarImg} />
                ) : (
                  <Ionicons name="school" size={28} color="#6366F1" />
                )}
              </View>
              <View style={styles.personMeta}>
                <Text style={[styles.personName, { color: textColor }]}>
                  {record.student_name}
                </Text>
                <Text style={[styles.personSub, { color: subColor }]}>
                  Class {record.class_name || 'N/A'}-{record.section_name || ''} • Adm: {record.admission_no}
                </Text>
              </View>
            </View>

            {/* Separator */}
            <View style={[styles.divider, { borderColor }]} />

            {/* Pickup Person Section */}
            <View style={styles.sectionHeader}>
              <Ionicons name="person-circle" size={16} color="#10B981" />
              <Text style={[styles.sectionTitle, { color: textColor }]}>
                AUTHORIZED PICKUP PERSON
              </Text>
            </View>

            <View style={styles.personRow}>
              <View style={[styles.avatarBox, { backgroundColor: 'rgba(16,185,129,0.1)' }]}>
                {record.pickup_photo_url ? (
                  <Image source={{ uri: record.pickup_photo_url }} style={styles.avatarImg} />
                ) : (
                  <Ionicons name="person" size={28} color="#10B981" />
                )}
              </View>
              <View style={styles.personMeta}>
                <Text style={[styles.personName, { color: textColor }]}>
                  {record.pickup_name}
                </Text>
                <Text style={[styles.personSub, { color: subColor }]}>
                  {record.pickup_relationship} • {record.pickup_mobile}
                </Text>
                {record.vehicle_number ? (
                  <Text style={[styles.vehicleBadge, { color: '#10B981' }]}>
                    Vehicle: {record.vehicle_number}
                  </Text>
                ) : null}
              </View>
            </View>

            {/* Parent contact info */}
            {record.parent_name ? (
              <View style={[styles.parentContactBox, { borderColor }]}>
                <Ionicons name="shield-checkmark-outline" size={16} color="#10B981" />
                <Text style={[styles.parentContactText, { color: subColor }]}>
                  Authorized by parent: <Text style={styles.bold}>{record.parent_name}</Text> ({record.parent_mobile || 'Verified'})
                </Text>
              </View>
            ) : null}

            {/* Release Action CTA */}
            {record.status === 'RELEASED' ? (
              <View style={styles.alreadyReleasedBox}>
                <Ionicons name="checkmark-done-circle" size={22} color="#10B981" />
                <Text style={styles.alreadyReleasedText}>
                  STUDENT ALREADY RELEASED AT {new Date(record.released_at).toLocaleTimeString()}
                </Text>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.releaseBtn, !isValid && styles.releaseBtnDisabled]}
                onPress={handleReleaseStudent}
                disabled={releasing || !isValid}
              >
                <LinearGradient
                  colors={isValid ? ['#059669', '#10B981'] : ['#64748B', '#475569']}
                  style={styles.releaseGradient}
                >
                  {releasing ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle" size={24} color="#FFFFFF" />
                      <Text style={styles.releaseBtnText}>CONFIRM & RELEASE STUDENT</Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            )}
          </View>
        )}
      </TourScrollView></TourTarget>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { padding: 6 },
  headerTitleCol: { flex: 1, marginLeft: 10 },
  headerTitle: { fontSize: 17, fontWeight: '800' },
  headerSub: { fontSize: 12 },
  scanIconBtn: { padding: 8 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  searchBox: {
    borderRadius: 16,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 16,
  },
  boxLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5, marginBottom: 6 },
  inputRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  inputField: {
    flex: 1,
    height: 46,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    fontSize: 15,
  },
  checkBtn: {
    backgroundColor: '#10B981',
    paddingHorizontal: 18,
    height: 46,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    marginBottom: 16,
  },
  bannerTextCol: { flex: 1 },
  bannerMainText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900', letterSpacing: 0.5 },
  bannerSubText: { color: 'rgba(255,255,255,0.9)', fontSize: 12, marginTop: 2 },
  detailsCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  sectionTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  personRow: { flexDirection: 'row', alignItems: 'center' },
  avatarBox: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  personMeta: { flex: 1, marginLeft: 12 },
  personName: { fontSize: 16, fontWeight: '800' },
  personSub: { fontSize: 12, marginTop: 2 },
  vehicleBadge: { fontSize: 11, fontWeight: '700', marginTop: 2 },
  divider: {
    height: 1,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginVertical: 14,
  },
  parentContactBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(150,150,150,0.08)',
    padding: 10,
    borderRadius: 8,
    marginTop: 14,
  },
  parentContactText: { fontSize: 11, flex: 1 },
  bold: { fontWeight: '700' },
  releaseBtn: { marginTop: 20, borderRadius: 14, overflow: 'hidden' },
  releaseBtnDisabled: { opacity: 0.6 },
  releaseGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  releaseBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900', letterSpacing: 0.5 },
  alreadyReleasedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(16,185,129,0.15)',
    padding: 14,
    borderRadius: 12,
    marginTop: 18,
  },
  alreadyReleasedText: { color: '#10B981', fontSize: 12, fontWeight: '800' },
});
