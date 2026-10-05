import { TourTarget, TourScrollView } from '@/src/features/app-tour';
import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from '@/src/utils/haptics';
import { useAuth } from '@/src/hooks/useAuth';
import { useTheme } from '@/src/hooks/useTheme';
import { visitorService, type VisitorRequest } from '@/src/services/visitorService';
import { alertCompat } from '@/src/utils/crossPlatformAlert';
import AppDatePicker, { parseYMD, toYMD } from '@/src/components/AppDatePicker';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

type DeptId = 'Teacher' | 'Principal' | 'Accounts' | 'Management' | 'Office' | 'Transport' | 'Hostel';

const DEPARTMENTS: {
  id: DeptId;
  label: string;
  hint: string;
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
}[] = [
  { id: 'Teacher', label: 'Class Teacher', hint: 'Progress & academics', icon: 'school-outline', tint: '#059669' },
  { id: 'Principal', label: 'Principal', hint: 'Official matters', icon: 'ribbon-outline', tint: '#4F46E5' },
  { id: 'Accounts', label: 'Accounts / Fees', hint: 'Payments & receipts', icon: 'wallet-outline', tint: '#D97706' },
  { id: 'Management', label: 'Management', hint: 'Administration', icon: 'briefcase-outline', tint: '#7C3AED' },
  { id: 'Office', label: 'Admin Office', hint: 'Certificates & records', icon: 'business-outline', tint: '#475569' },
  { id: 'Transport', label: 'Transport', hint: 'Bus & pickup', icon: 'bus-outline', tint: '#EA580C' },
  { id: 'Hostel', label: 'Hostel Warden', hint: 'Boarding & stay', icon: 'bed-outline', tint: '#0E7490' },
];

const RELATIONSHIPS = ['Parent', 'Father', 'Mother', 'Guardian', 'Grandparent', 'Relative', 'Other'] as const;

const PURPOSE_CHIPS = [
  { id: 'ptm', label: 'Teacher meeting', text: 'Parent-teacher meeting regarding my child.' },
  { id: 'fees', label: 'Fees & payment', text: 'Visit to discuss / complete fee payment.' },
  { id: 'docs', label: 'Collect documents', text: 'Collect certificates or official documents.' },
  { id: 'principal', label: 'Principal meeting', text: 'Meeting with the Principal.' },
  { id: 'transport', label: 'Transport / bus', text: 'Discuss transport or bus-related matter.' },
  { id: 'other', label: 'Something else', text: '' },
];

const TIME_SLOTS = [
  { start: '09:00', end: '10:00', label: '9–10 AM' },
  { start: '10:00', end: '11:00', label: '10–11 AM' },
  { start: '11:00', end: '12:00', label: '11–12 PM' },
  { start: '12:00', end: '13:00', label: '12–1 PM' },
  { start: '14:00', end: '15:00', label: '2–3 PM' },
  { start: '15:00', end: '16:00', label: '3–4 PM' },
  { start: '16:00', end: '17:00', label: '4–5 PM' },
] as const;

const STATUS_META: Record<
  string,
  { label: string; color: string; bg: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  PENDING: { label: 'Awaiting approval', color: '#D97706', bg: 'rgba(217,119,6,0.12)', icon: 'time-outline' },
  APPROVED: { label: 'Pass ready', color: '#059669', bg: 'rgba(5,150,105,0.14)', icon: 'qr-code-outline' },
  CHECKED_IN: { label: 'On campus', color: '#2563EB', bg: 'rgba(37,99,235,0.12)', icon: 'enter-outline' },
  CHECKED_OUT: { label: 'Completed', color: '#64748B', bg: 'rgba(100,116,139,0.14)', icon: 'checkmark-done-outline' },
  REJECTED: { label: 'Declined', color: '#DC2626', bg: 'rgba(220,38,38,0.12)', icon: 'close-circle-outline' },
  CANCELLED: { label: 'Cancelled', color: '#64748B', bg: 'rgba(100,116,139,0.14)', icon: 'ban-outline' },
  EXPIRED: { label: 'Expired', color: '#64748B', bg: 'rgba(100,116,139,0.14)', icon: 'hourglass-outline' },
};

const ACCENT = '#059669';
const MAX_VISITORS = 6;
const MAX_DATE = (() => {
  const d = new Date();
  d.setDate(d.getDate() + 60);
  return d;
})();

function isSlotPast(dateYmd: string, startHHmm: string): boolean {
  const now = new Date();
  const today = toYMD(now);
  if (dateYmd > today) return false;
  if (dateYmd < today) return true;
  const [h, m] = startHHmm.split(':').map(Number);
  const slot = new Date(now);
  slot.setHours(h, m, 0, 0);
  return slot.getTime() <= now.getTime() - 5 * 60 * 1000;
}

function firstOpenDate(): string {
  const now = new Date();
  const today = toYMD(now);
  if (TIME_SLOTS.some((s) => !isSlotPast(today, s.start))) return today;
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return toYMD(tomorrow);
}

function firstOpenSlot(dateYmd: string) {
  return TIME_SLOTS.find((s) => !isSlotPast(dateYmd, s.start)) ?? TIME_SLOTS[0];
}

function formatVisitDate(ymd: string, locale = 'en-IN') {
  try {
    return parseYMD(ymd).toLocaleDateString(locale, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  } catch {
    return ymd;
  }
}

function formatTime(hhmm: string) {
  const [hStr, mStr] = (hhmm || '').split(':');
  const h = Number(hStr);
  const m = Number(mStr) || 0;
  if (Number.isNaN(h)) return hhmm;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function digitsOnly(value: string) {
  return value.replace(/\D/g, '').slice(0, 10);
}

function deptLabel(id: string | undefined, translate: TFunction) {
  if (id && DEPARTMENTS.some((d) => d.id === id)) {
    return translate(`studentVisitSchool.dept.${id}`);
  }
  return id || translate('studentVisitSchool.schoolMeeting');
}

export default function VisitSchoolScreen() {
  const router = useRouter();
  const { user, portalContexts } = useAuth();
  const { isDark } = useTheme();
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith('te') ? 'te-IN' : 'en-IN';

  const [activeTab, setActiveTab] = useState<'book' | 'my_visits'>('book');
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [myVisits, setMyVisits] = useState<VisitorRequest[]>([]);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);

  const [visitorName, setVisitorName] = useState(user?.display_name || user?.name || '');
  const [mobileNumber, setMobileNumber] = useState(() => digitsOnly(user?.phone || ''));
  const [relationship, setRelationship] = useState('Parent');
  const [customRelationship, setCustomRelationship] = useState('');
  const [department, setDepartment] = useState<DeptId>('Teacher');
  const [visitDate, setVisitDate] = useState(firstOpenDate);
  const initialSlot = firstOpenSlot(firstOpenDate());
  const [startTime, setStartTime] = useState(initialSlot.start);
  const [endTime, setEndTime] = useState(initialSlot.end);
  const [purpose, setPurpose] = useState('');
  const [purposeChip, setPurposeChip] = useState<string | null>(null);
  const [visitorCount, setVisitorCount] = useState(1);
  const [vehicleNumber, setVehicleNumber] = useState('');

  const palette = useMemo(
    () => ({
      bg: isDark ? '#0B0F19' : '#F3F6FB',
      card: isDark ? '#151D2E' : '#FFFFFF',
      raised: isDark ? '#1B2436' : '#F8FAFC',
      text: isDark ? '#F1F5F9' : '#0F172A',
      sub: isDark ? '#94A3B8' : '#64748B',
      muted: isDark ? '#64748B' : '#94A3B8',
      border: isDark ? 'rgba(148,163,184,0.16)' : 'rgba(15,23,42,0.08)',
      inset: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(15,23,42,0.04)',
      danger: '#DC2626',
    }),
    [isDark]
  );

  const studentLabel =
    portalContexts?.activeContext?.student_id
      ? portalContexts.activeContext.display_name
      : null;
  const studentSub = portalContexts?.activeContext?.subtitle;

  const selectedDept = DEPARTMENTS.find((d) => d.id === department) || DEPARTMENTS[0];
  const openSlots = TIME_SLOTS.filter((s) => !isSlotPast(visitDate, s.start));
  const hoursClosed = openSlots.length === 0;
  const nameError = attempted && !visitorName.trim();
  const mobileError = attempted && digitsOnly(mobileNumber).length !== 10;
  const purposeError = attempted && !purpose.trim();
  const canSubmit = !loading && !hoursClosed;

  const loadMyVisits = async (silent = false) => {
    if (!silent) setFetching(true);
    try {
      const requests = await visitorService.getVisitorRequests();
      setMyVisits(requests);
    } catch (err: any) {
      console.error('Failed to load visits:', err);
    } finally {
      setFetching(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadMyVisits();
  }, []);

  useEffect(() => {
    if (isSlotPast(visitDate, startTime)) {
      const next = firstOpenSlot(visitDate);
      setStartTime(next.start);
      setEndTime(next.end);
    }
  }, [visitDate, startTime]);

  const handleDateChange = (value: string) => {
    setVisitDate(value);
    const next = firstOpenSlot(value);
    setStartTime(next.start);
    setEndTime(next.end);
  };

  const handleSubmit = async () => {
    setAttempted(true);
    const name = visitorName.trim();
    const mobile = digitsOnly(mobileNumber);
    const reason = purpose.trim();
    const rel = relationship === 'Other' ? customRelationship.trim() || 'Other' : relationship;

    if (!name || mobile.length !== 10 || !reason) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    if (hoursClosed) {
      alertCompat(t('studentVisitSchool.hoursOverTitle'), t('studentVisitSchool.hoursOverBody'));
      return;
    }

    setLoading(true);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const res = await visitorService.createVisitorRequest({
        visitorFullName: name,
        visitorMobile: mobile,
        relationship: rel,
        destinationDepartment: department,
        visitDate,
        startTime,
        endTime,
        purpose: reason,
        visitorCount,
        vehicleNumber: vehicleNumber.trim() || undefined,
        studentId: portalContexts?.activeContext?.student_id || undefined,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      if (res.qrToken && res.request?.id) {
        alertCompat(t('studentVisitSchool.passIssuedTitle'), t('studentVisitSchool.passIssuedBody'), [
          {
            text: t('studentVisitSchool.viewPass'),
            onPress: () =>
              router.push({
                pathname: '/Screen/visitorPass',
                params: { requestId: res.request.id, token: res.qrToken },
              } as any),
          },
          { text: t('studentVisitSchool.later'), style: 'cancel', onPress: () => setActiveTab('my_visits') },
        ]);
      } else {
        alertCompat(
          t('studentVisitSchool.requestSentTitle'),
          t('studentVisitSchool.requestSentBody'),
          [{ text: t('studentVisitSchool.ok'), onPress: () => setActiveTab('my_visits') }]
        );
      }

      setPurpose('');
      setPurposeChip(null);
      setAttempted(false);
      loadMyVisits(true);
    } catch (err: any) {
      alertCompat(t('studentVisitSchool.bookingFailed'), err?.message || t('studentVisitSchool.bookingFailedBody'));
    } finally {
      setLoading(false);
    }
  };

  const confirmCancel = (visit: VisitorRequest) => {
    alertCompat(t('studentVisitSchool.cancelTitle'), t('studentVisitSchool.cancelBody'), [
      { text: t('studentVisitSchool.keepVisit'), style: 'cancel' },
      {
        text: t('studentVisitSchool.cancelVisit'),
        style: 'destructive',
        onPress: async () => {
          try {
            await visitorService.cancelVisitorRequest(visit.id, 'Cancelled by parent');
            loadMyVisits(true);
          } catch (e: any) {
            alertCompat(t('studentVisitSchool.cancelFailed'), e?.message || t('studentVisitSchool.cancelFailed'));
          }
        },
      },
    ]);
  };

  const onPassPress = (visit: VisitorRequest) => {
    const approved = visit.approval_status === 'APPROVED' || visit.approval_status === 'CHECKED_IN';
    if (approved) {
      router.push({ pathname: '/Screen/visitorPass', params: { requestId: visit.id } } as any);
      return;
    }
    if (visit.approval_status === 'PENDING') {
      alertCompat(t('studentVisitSchool.awaitingTitle'), t('studentVisitSchool.awaitingBody'));
    }
  };

  const inputWrap = (field: string, hasError?: boolean) => [
    styles.inputWrap,
    {
      backgroundColor: palette.raised,
      borderColor: hasError ? palette.danger : focusedField === field ? ACCENT : palette.border,
    },
  ];

  return (
    <TourTarget id="screen.screen-visit-school.workspace" style={{ flex: 1 }}><SafeAreaView style={[styles.root, { backgroundColor: palette.bg }]} edges={['left', 'right']}>
      <View style={styles.pageShell}>
      <TourTarget id="screen.screen-visit-school.overview" native><View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.iconBtn, { backgroundColor: palette.card, borderColor: palette.border }]}
          accessibilityLabel={t('goBack')}
          activeOpacity={0.8}
        >
          <Ionicons name="chevron-back" size={22} color={palette.text} />
        </TouchableOpacity>
        <View style={styles.headerTitleBlock}>
          <Text style={[styles.headerTitle, { color: palette.text }]}>{t('studentVisitSchool.title')}</Text>
          <Text style={[styles.headerSub, { color: palette.sub }]}>{t('studentVisitSchool.subtitle')}</Text>
        </View>
        <TouchableOpacity
          onPress={() => loadMyVisits()}
          style={[styles.iconBtn, { backgroundColor: palette.card, borderColor: palette.border }]}
          accessibilityLabel={t('studentVisitSchool.refreshVisits')}
          activeOpacity={0.8}
        >
          {fetching ? (
            <ActivityIndicator size="small" color={ACCENT} />
          ) : (
            <Ionicons name="refresh" size={18} color={palette.text} />
          )}
        </TouchableOpacity>
      </View></TourTarget>

      <View style={[styles.tabTrack, { backgroundColor: palette.inset, borderColor: palette.border }]}>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'book' && [styles.tabItemActive, { backgroundColor: palette.card }]]}
          onPress={() => {
            Haptics.selectionAsync();
            setActiveTab('book');
          }}
          activeOpacity={0.85}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === 'book' }}
          accessibilityLabel={t('studentVisitSchool.bookVisit')}
        >
          <Ionicons name="calendar-outline" size={15} color={activeTab === 'book' ? ACCENT : palette.sub} />
          <Text style={[styles.tabText, { color: activeTab === 'book' ? palette.text : palette.sub }]}>{t('studentVisitSchool.bookVisit')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.tabItem,
            activeTab === 'my_visits' && [styles.tabItemActive, { backgroundColor: palette.card }],
          ]}
          onPress={() => {
            Haptics.selectionAsync();
            setActiveTab('my_visits');
          }}
          activeOpacity={0.85}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === 'my_visits' }}
          accessibilityLabel={t('studentVisitSchool.myPasses')}
        >
          <Ionicons name="qr-code-outline" size={15} color={activeTab === 'my_visits' ? ACCENT : palette.sub} />
          <Text style={[styles.tabText, { color: activeTab === 'my_visits' ? palette.text : palette.sub }]}>{t('studentVisitSchool.myPasses')}</Text>
          {myVisits.length > 0 ? (
            <View style={styles.tabCount}>
              <Text style={styles.tabCountText}>{myVisits.length}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={styles.body}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={8}
      >
        {activeTab === 'book' ? (
          <View style={styles.bookShell}>
            <TourScrollView
              style={styles.flex1}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <LinearGradient
                colors={isDark ? ['#064E3B', '#0F766E'] : ['#047857', '#10B981']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.hero}
              >
                <View style={styles.heroTop}>
                  <View style={styles.heroIcon}>
                    <Ionicons name="shield-checkmark" size={22} color="#FFFFFF" />
                  </View>
                  <View style={styles.flex1}>
                    <Text style={styles.heroTitle}>{t('studentVisitSchool.heroTitle')}</Text>
                    <Text style={styles.heroSub}>
                      {t('studentVisitSchool.heroSub')}
                    </Text>
                  </View>
                </View>
                {studentLabel ? (
                  <View style={styles.heroStudent}>
                    <Ionicons name="person-circle-outline" size={16} color="#ECFDF5" />
                    <Text style={styles.heroStudentText} numberOfLines={1}>
                      {t('studentVisitSchool.visitingFor', { name: studentLabel })}
                      {studentSub ? ` · ${studentSub}` : ''}
                    </Text>
                  </View>
                ) : null}
                <View style={styles.heroSteps}>
                  {[t('studentVisitSchool.stepMeet'), t('studentVisitSchool.stepSchedule'), t('studentVisitSchool.stepPass')].map((step, i) => (
                    <View key={step} style={styles.heroStep}>
                      <View style={styles.heroStepNum}>
                        <Text style={styles.heroStepNumText}>{i + 1}</Text>
                      </View>
                      <Text style={styles.heroStepLabel}>{step}</Text>
                      {i < 2 ? <View style={styles.heroStepLine} /> : null}
                    </View>
                  ))}
                </View>
              </LinearGradient>

              <Text style={[styles.sectionLabel, { color: palette.text }]}>{t('studentVisitSchool.whoMeet')}</Text>
              <View style={styles.deptGrid}>
                {DEPARTMENTS.map((dept) => {
                  const selected = department === dept.id;
                  return (
                    <TouchableOpacity
                      key={dept.id}
                      style={[
                        styles.deptCard,
                        {
                          backgroundColor: selected ? `${dept.tint}14` : palette.card,
                          borderColor: selected ? dept.tint : palette.border,
                        },
                      ]}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setDepartment(dept.id);
                      }}
                      activeOpacity={0.85}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                    >
                      {selected ? (
                        <View style={[styles.deptCheck, { backgroundColor: dept.tint }]}>
                          <Ionicons name="checkmark" size={11} color="#FFFFFF" />
                        </View>
                      ) : null}
                      <View style={[styles.deptIcon, { backgroundColor: `${dept.tint}18` }]}>
                        <Ionicons name={dept.icon} size={20} color={dept.tint} />
                      </View>
                      <Text style={[styles.deptLabel, { color: palette.text }]}>
                        {t(`studentVisitSchool.dept.${dept.id}`, dept.label)}
                      </Text>
                      <Text style={[styles.deptHint, { color: palette.sub }]}>
                        {t(`studentVisitSchool.deptHint.${dept.id}`, dept.hint)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}>
                <View style={styles.cardHead}>
                  <View style={[styles.cardHeadIcon, { backgroundColor: 'rgba(5,150,105,0.12)' }]}>
                    <Ionicons name="person-outline" size={16} color={ACCENT} />
                  </View>
                  <Text style={[styles.cardTitle, { color: palette.text }]}>{t('studentVisitSchool.visitorDetails')}</Text>
                </View>

                <Text style={[styles.fieldLabel, { color: palette.sub }]}>
                  {t('studentVisitSchool.fullName')} <Text style={styles.req}>*</Text>
                </Text>
                <View style={inputWrap('name', nameError)}>
                  <Ionicons name="person-circle-outline" size={18} color={nameError ? palette.danger : palette.muted} />
                  <TextInput
                    style={[styles.input, { color: palette.text }]}
                    value={visitorName}
                    onChangeText={setVisitorName}
                    placeholder={t('studentVisitSchool.fullNamePlaceholder')}
                    placeholderTextColor={palette.muted}
                    autoCapitalize="words"
                    onFocus={() => setFocusedField('name')}
                    onBlur={() => setFocusedField(null)}
                    accessibilityLabel={t('studentVisitSchool.fullName')}
                  />
                </View>
                {nameError ? <Text style={styles.errorText}>{t('studentVisitSchool.nameRequired')}</Text> : null}

                <Text style={[styles.fieldLabel, { color: palette.sub }]}>
                  {t('studentVisitSchool.mobile')} <Text style={styles.req}>*</Text>
                </Text>
                <View style={inputWrap('mobile', mobileError)}>
                  <Ionicons name="call-outline" size={18} color={mobileError ? palette.danger : palette.muted} />
                  <TextInput
                    style={[styles.input, { color: palette.text }]}
                    value={mobileNumber}
                    onChangeText={(value) => setMobileNumber(digitsOnly(value))}
                    keyboardType="phone-pad"
                    maxLength={10}
                    placeholder={t('studentVisitSchool.mobilePlaceholder')}
                    placeholderTextColor={palette.muted}
                    onFocus={() => setFocusedField('mobile')}
                    onBlur={() => setFocusedField(null)}
                    accessibilityLabel={t('studentVisitSchool.mobile')}
                  />
                  {mobileNumber.length === 10 ? (
                    <Ionicons name="checkmark-circle" size={18} color={ACCENT} />
                  ) : (
                    <Text style={[styles.charHint, { color: palette.muted }]}>{mobileNumber.length}/10</Text>
                  )}
                </View>
                {mobileError ? <Text style={styles.errorText}>{t('studentVisitSchool.mobileRequired')}</Text> : null}

                <Text style={[styles.fieldLabel, { color: palette.sub }]}>{t('studentVisitSchool.relationship')}</Text>
                <View style={styles.chipWrap}>
                  {RELATIONSHIPS.map((rel) => {
                    const selected = relationship === rel;
                    return (
                      <TouchableOpacity
                        key={rel}
                        style={[
                          styles.chip,
                          {
                            backgroundColor: selected ? ACCENT : palette.raised,
                            borderColor: selected ? ACCENT : palette.border,
                          },
                        ]}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setRelationship(rel);
                        }}
                        activeOpacity={0.85}
                      >
                        <Text style={[styles.chipText, { color: selected ? '#FFFFFF' : palette.text }]}>
                          {t(`studentVisitSchool.rel.${rel}`, rel)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {relationship === 'Other' ? (
                  <View style={[inputWrap('rel'), { marginTop: 10 }]}>
                    <TextInput
                      style={[styles.input, { color: palette.text }]}
                      value={customRelationship}
                      onChangeText={setCustomRelationship}
                      placeholder={t('studentVisitSchool.otherRelationshipPlaceholder')}
                      placeholderTextColor={palette.muted}
                      onFocus={() => setFocusedField('rel')}
                      onBlur={() => setFocusedField(null)}
                    />
                  </View>
                ) : null}

                <View style={styles.stepperRow}>
                  <View style={styles.flex1}>
                    <Text style={[styles.fieldLabel, { color: palette.sub, marginTop: 0 }]}>{t('studentVisitSchool.totalVisitors')}</Text>
                    <Text style={[styles.stepperHint, { color: palette.muted }]}>{t('studentVisitSchool.includingYou')}</Text>
                  </View>
                  <View style={[styles.stepper, { backgroundColor: palette.raised, borderColor: palette.border }]}>
                    <TouchableOpacity
                      style={[styles.stepperBtn, visitorCount <= 1 && styles.stepperBtnDisabled]}
                      disabled={visitorCount <= 1}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setVisitorCount((n) => Math.max(1, n - 1));
                      }}
                      accessibilityLabel={t('studentVisitSchool.decreaseVisitors')}
                    >
                      <Ionicons name="remove" size={18} color={visitorCount <= 1 ? palette.muted : palette.text} />
                    </TouchableOpacity>
                    <Text style={[styles.stepperValue, { color: palette.text }]}>{visitorCount}</Text>
                    <TouchableOpacity
                      style={[styles.stepperBtn, visitorCount >= MAX_VISITORS && styles.stepperBtnDisabled]}
                      disabled={visitorCount >= MAX_VISITORS}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setVisitorCount((n) => Math.min(MAX_VISITORS, n + 1));
                      }}
                      accessibilityLabel={t('studentVisitSchool.increaseVisitors')}
                    >
                      <Ionicons name="add" size={18} color={visitorCount >= MAX_VISITORS ? palette.muted : palette.text} />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              <View style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}>
                <View style={styles.cardHead}>
                  <View style={[styles.cardHeadIcon, { backgroundColor: 'rgba(79,70,229,0.12)' }]}>
                    <Ionicons name="time-outline" size={16} color="#4F46E5" />
                  </View>
                  <Text style={[styles.cardTitle, { color: palette.text }]}>{t('studentVisitSchool.whenComing')}</Text>
                </View>

                <AppDatePicker
                  value={visitDate}
                  onChange={handleDateChange}
                  label={t('studentVisitSchool.visitDate')}
                  required
                  minimumDate={new Date()}
                  maximumDate={MAX_DATE}
                  isDark={isDark}
                  accentColor={ACCENT}
                  textColor={palette.text}
                  borderColor={palette.border}
                  containerStyle={{ marginBottom: 8 }}
                />

                <Text style={[styles.fieldLabel, { color: palette.sub }]}>{t('studentVisitSchool.preferredSlot')}</Text>
                {hoursClosed ? (
                  <View style={styles.closedNote}>
                    <Ionicons name="moon-outline" size={16} color="#D97706" />
                    <Text style={styles.closedNoteText}>
                      {t('studentVisitSchool.hoursEnded')}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.chipWrap}>
                    {TIME_SLOTS.map((slot) => {
                      const past = isSlotPast(visitDate, slot.start);
                      const selected = startTime === slot.start && endTime === slot.end;
                      return (
                        <TouchableOpacity
                          key={slot.start}
                          style={[
                            styles.chip,
                            {
                              backgroundColor: selected ? ACCENT : palette.raised,
                              borderColor: selected ? ACCENT : palette.border,
                              opacity: past ? 0.38 : 1,
                            },
                          ]}
                          disabled={past}
                          onPress={() => {
                            Haptics.selectionAsync();
                            setStartTime(slot.start);
                            setEndTime(slot.end);
                          }}
                          activeOpacity={0.85}
                        >
                          <Text style={[styles.chipText, { color: selected ? '#FFFFFF' : palette.text }]}>
                            {slot.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

                <Text style={[styles.fieldLabel, { color: palette.sub }]}>{t('studentVisitSchool.vehicleOptional')}</Text>
                <View style={inputWrap('vehicle')}>
                  <Ionicons name="car-outline" size={18} color={palette.muted} />
                  <TextInput
                    style={[styles.input, { color: palette.text }]}
                    value={vehicleNumber}
                    onChangeText={(value) => setVehicleNumber(value.toUpperCase())}
                    autoCapitalize="characters"
                    placeholder={t('studentVisitSchool.vehiclePlaceholder')}
                    placeholderTextColor={palette.muted}
                    onFocus={() => setFocusedField('vehicle')}
                    onBlur={() => setFocusedField(null)}
                    accessibilityLabel={t('studentVisitSchool.vehicleOptional')}
                  />
                </View>
              </View>

              <View style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}>
                <View style={styles.cardHead}>
                  <View style={[styles.cardHeadIcon, { backgroundColor: 'rgba(217,119,6,0.12)' }]}>
                    <Ionicons name="chatbubble-ellipses-outline" size={16} color="#D97706" />
                  </View>
                  <Text style={[styles.cardTitle, { color: palette.text }]}>{t('studentVisitSchool.purposeTitle')}</Text>
                </View>

                <View style={styles.chipWrap}>
                  {PURPOSE_CHIPS.map((chip) => {
                    const selected = purposeChip === chip.id;
                    return (
                      <TouchableOpacity
                        key={chip.id}
                        style={[
                          styles.chip,
                          {
                            backgroundColor: selected ? ACCENT : palette.raised,
                            borderColor: selected ? ACCENT : palette.border,
                          },
                        ]}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setPurposeChip(chip.id);
                          if (chip.text) setPurpose(t(`studentVisitSchool.purposeText.${chip.id}`, chip.text));
                          if (chip.id === 'other') setPurpose('');
                        }}
                        activeOpacity={0.85}
                      >
                        <Text style={[styles.chipText, { color: selected ? '#FFFFFF' : palette.text }]}>
                          {t(`studentVisitSchool.purpose.${chip.id}`, chip.label)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={[styles.fieldLabel, { color: palette.sub }]}>
                  {t('studentVisitSchool.purposeLabel')} <Text style={styles.req}>*</Text>
                </Text>
                <View
                  style={[
                    styles.textAreaWrap,
                    {
                      backgroundColor: palette.raised,
                      borderColor: purposeError ? palette.danger : focusedField === 'purpose' ? ACCENT : palette.border,
                    },
                  ]}
                >
                  <TextInput
                    style={[styles.textArea, { color: palette.text }]}
                    value={purpose}
                    onChangeText={(value) => {
                      setPurpose(value);
                      const match = PURPOSE_CHIPS.find((c) => {
                        if (!c.text) return false;
                        return c.text === value || t(`studentVisitSchool.purposeText.${c.id}`) === value;
                      });
                      setPurposeChip(match ? match.id : value.trim() ? 'other' : null);
                    }}
                    multiline
                    numberOfLines={3}
                    maxLength={240}
                    placeholder={t('studentVisitSchool.purposePlaceholder')}
                    placeholderTextColor={palette.muted}
                    onFocus={() => setFocusedField('purpose')}
                    onBlur={() => setFocusedField(null)}
                    accessibilityLabel={t('studentVisitSchool.purposeTitle')}
                  />
                </View>
                <View style={styles.purposeMeta}>
                  {purposeError ? (
                    <Text style={styles.errorText}>{t('studentVisitSchool.purposeRequired')}</Text>
                  ) : (
                    <Text style={[styles.helper, { color: palette.muted }]}>{t('studentVisitSchool.purposeHelper')}</Text>
                  )}
                  <Text style={[styles.helper, { color: palette.muted }]}>{purpose.length}/240</Text>
                </View>
              </View>

              <View style={[styles.trustRow, { backgroundColor: palette.card, borderColor: palette.border }]}>
                <Ionicons name="lock-closed-outline" size={16} color={ACCENT} />
                <Text style={[styles.trustText, { color: palette.sub }]}>
                  {t('studentVisitSchool.trust')}
                </Text>
              </View>
            </TourScrollView>

            <View style={[styles.footer, { backgroundColor: palette.bg, borderTopColor: palette.border }]}>
              <View style={styles.footerSummary}>
                <Text style={[styles.footerEyebrow, { color: palette.muted }]}>{t('studentVisitSchool.yourVisit')}</Text>
                <Text style={[styles.footerLine, { color: palette.text }]} numberOfLines={1}>
                  {t(`studentVisitSchool.dept.${selectedDept.id}`, selectedDept.label)} · {formatVisitDate(visitDate, locale)} · {formatTime(startTime)}–{formatTime(endTime)}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.submitButton, (!canSubmit || !visitorName.trim() || digitsOnly(mobileNumber).length !== 10 || !purpose.trim()) && styles.submitDisabled]}
                onPress={handleSubmit}
                disabled={loading}
                activeOpacity={0.9}
                accessibilityLabel={t('studentVisitSchool.requestPass')}
              >
                <LinearGradient colors={['#10B981', '#047857']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.submitGradient}>
                  {loading ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons name="qr-code-outline" size={20} color="#FFFFFF" />
                      <Text style={styles.submitText}>{t('studentVisitSchool.requestPass')}</Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TourScrollView
            style={styles.flex1}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadMyVisits(true); }} tintColor={ACCENT} />
            }
          >
            {fetching && myVisits.length === 0 ? (
              <ActivityIndicator size="large" color={ACCENT} style={{ marginTop: 48 }} />
            ) : myVisits.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
                <View style={styles.emptyIcon}>
                  <Ionicons name="ticket-outline" size={32} color={ACCENT} />
                </View>
                <Text style={[styles.emptyTitle, { color: palette.text }]}>{t('studentVisitSchool.emptyTitle')}</Text>
                <Text style={[styles.emptySub, { color: palette.sub }]}>
                  {t('studentVisitSchool.emptySub')}
                </Text>
                <TouchableOpacity style={styles.emptyCta} onPress={() => setActiveTab('book')} activeOpacity={0.85}>
                  <Text style={styles.emptyCtaText}>{t('studentVisitSchool.emptyCta')}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              myVisits.map((v) => {
                const meta = STATUS_META[v.approval_status] || STATUS_META.PENDING;
                const isApproved = v.approval_status === 'APPROVED' || v.approval_status === 'CHECKED_IN';
                const canCancel = v.approval_status === 'PENDING' || v.approval_status === 'APPROVED';
                return (
                  <TouchableOpacity
                    key={v.id}
                    style={[styles.passCard, { backgroundColor: palette.card, borderColor: palette.border }]}
                    onPress={() => onPassPress(v)}
                    activeOpacity={0.88}
                  >
                    <View style={styles.passHeader}>
                      <View style={[styles.passDeptIcon, { backgroundColor: meta.bg }]}>
                        <Ionicons name={meta.icon} size={18} color={meta.color} />
                      </View>
                      <View style={styles.flex1}>
                        <Text style={[styles.passTitle, { color: palette.text }]}>{deptLabel(v.destination_department, t)}</Text>
                        <Text style={[styles.passDate, { color: palette.sub }]}>
                          {formatVisitDate(v.visit_date, locale)} · {formatTime(v.start_time)} – {formatTime(v.end_time)}
                        </Text>
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: meta.bg }]}>
                        <Text style={[styles.statusText, { color: meta.color }]}>
                          {t(`studentVisitSchool.status.${v.approval_status}`, meta.label)}
                        </Text>
                      </View>
                    </View>

                    {v.purpose ? (
                      <Text style={[styles.passPurpose, { color: palette.sub }]} numberOfLines={2}>
                        {v.purpose}
                      </Text>
                    ) : null}

                    <View style={styles.passFooter}>
                      {v.pass_code ? (
                        <View style={styles.passCodePill}>
                          <Ionicons name="qr-code" size={14} color={ACCENT} />
                          <Text style={styles.passCodeText}>{v.pass_code}</Text>
                        </View>
                      ) : (
                        <Text style={[styles.passFooterHint, { color: palette.muted }]}>
                          {isApproved ? t('studentVisitSchool.tapToOpen') : t('studentVisitSchool.passPending')}
                        </Text>
                      )}
                      {isApproved ? (
                        <View style={styles.viewPassHint}>
                          <Text style={styles.tapToView}>{t('studentVisitSchool.openQr')}</Text>
                          <Ionicons name="chevron-forward" size={14} color={ACCENT} />
                        </View>
                      ) : canCancel ? (
                        <TouchableOpacity onPress={() => confirmCancel(v)} hitSlop={8}>
                          <Text style={styles.cancelLink}>{t('studentVisitSchool.cancel')}</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </TourScrollView>
        )}
      </KeyboardAvoidingView>
      </View>
    </SafeAreaView></TourTarget>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  pageShell: {
    flex: 1,
    minHeight: 0,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  flex1: { flex: 1, minHeight: 0 },
  body: { flex: 1, minHeight: 0 },
  bookShell: { flex: 1, minHeight: 0 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    gap: 10,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  headerTitleBlock: { flex: 1 },
  headerTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.4 },
  headerSub: { fontSize: 12, fontWeight: '600', marginTop: 1 },
  tabTrack: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 4,
    padding: 4,
    borderRadius: 16,
    borderWidth: 1,
    gap: 4,
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
  },
  tabItemActive: {
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 6,
      },
      android: { elevation: 2 },
      web: { boxShadow: '0 4px 14px rgba(15,23,42,0.08)' } as any,
    }),
  },
  tabText: { fontSize: 13, fontWeight: '700' },
  tabCount: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabCountText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
  scrollContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 28, width: '100%' },
  hero: {
    borderRadius: 22,
    padding: 16,
    marginBottom: 20,
    overflow: 'hidden',
  },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  heroIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  heroSub: { color: 'rgba(255,255,255,0.86)', fontSize: 13, lineHeight: 18, marginTop: 4, fontWeight: '500' },
  heroStudent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    backgroundColor: 'rgba(0,0,0,0.16)',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    maxWidth: '100%',
  },
  heroStudentText: { color: '#ECFDF5', fontSize: 12, fontWeight: '700', flexShrink: 1 },
  heroSteps: { flexDirection: 'row', alignItems: 'center', marginTop: 14 },
  heroStep: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  heroStepNum: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroStepNumText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  heroStepLabel: { color: '#FFFFFF', fontSize: 12, fontWeight: '700', marginLeft: 6 },
  heroStepLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.28)',
    marginHorizontal: 8,
  },
  sectionLabel: { fontSize: 16, fontWeight: '800', letterSpacing: -0.2, marginBottom: 10 },
  deptGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  deptCard: {
    flexBasis: '47%',
    flexGrow: 1,
    maxWidth: '48.5%',
    position: 'relative',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1.5,
    minHeight: 108,
  },
  deptCheck: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deptIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  deptLabel: { fontSize: 13, fontWeight: '800', lineHeight: 17 },
  deptHint: { fontSize: 11, fontWeight: '600', marginTop: 2, lineHeight: 14 },
  card: {
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    marginBottom: 14,
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.05,
        shadowRadius: 16,
      },
      android: { elevation: 1 },
      web: { boxShadow: '0 10px 28px rgba(15,23,42,0.05)' } as any,
    }),
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  cardHeadIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { fontSize: 15, fontWeight: '800' },
  fieldLabel: { fontSize: 12, fontWeight: '700', marginTop: 12, marginBottom: 8 },
  req: { color: '#EF4444' },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1.5,
    paddingHorizontal: 12,
  },
  input: { flex: 1, fontSize: 15, fontWeight: '600', paddingVertical: 12 },
  charHint: { fontSize: 11, fontWeight: '700' },
  errorText: { color: '#DC2626', fontSize: 12, fontWeight: '600', marginTop: 6 },
  helper: { fontSize: 11, fontWeight: '600' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  chipText: { fontSize: 13, fontWeight: '700' },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
  },
  stepperHint: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  stepperBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  stepperBtnDisabled: { opacity: 0.4 },
  stepperValue: { minWidth: 28, textAlign: 'center', fontSize: 16, fontWeight: '800' },
  closedNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: 'rgba(217,119,6,0.1)',
    borderRadius: 12,
    padding: 12,
  },
  closedNoteText: { flex: 1, color: '#B45309', fontSize: 13, fontWeight: '600', lineHeight: 18 },
  textAreaWrap: {
    borderRadius: 14,
    borderWidth: 1.5,
    paddingHorizontal: 12,
    paddingTop: 8,
    minHeight: 96,
  },
  textArea: {
    fontSize: 14,
    fontWeight: '600',
    minHeight: 80,
    textAlignVertical: 'top',
  },
  purposeMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, gap: 12 },
  trustRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 8,
  },
  trustText: { flex: 1, fontSize: 12, lineHeight: 17, fontWeight: '600' },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 18 : 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  footerSummary: { paddingHorizontal: 2 },
  footerEyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
  footerLine: { fontSize: 13, fontWeight: '700', marginTop: 2 },
  submitButton: { borderRadius: 16, overflow: 'hidden' },
  submitDisabled: { opacity: 0.55 },
  submitGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  submitText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  emptyCard: {
    marginTop: 28,
    alignItems: 'center',
    padding: 28,
    borderRadius: 22,
    borderWidth: 1,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: 'rgba(5,150,105,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: { fontSize: 18, fontWeight: '800' },
  emptySub: { fontSize: 13, textAlign: 'center', marginTop: 6, lineHeight: 19 },
  emptyCta: {
    marginTop: 16,
    backgroundColor: ACCENT,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
  },
  emptyCtaText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  passCard: {
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 12,
  },
  passHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  passDeptIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  passTitle: { fontSize: 15, fontWeight: '800' },
  passDate: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  statusText: { fontSize: 11, fontWeight: '800' },
  passPurpose: { fontSize: 13, marginTop: 10, lineHeight: 18 },
  passFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(148,163,184,0.28)',
  },
  passCodePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(5,150,105,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
  },
  passCodeText: { color: ACCENT, fontSize: 12, fontWeight: '800' },
  passFooterHint: { fontSize: 12, fontWeight: '600' },
  viewPassHint: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  tapToView: { color: ACCENT, fontSize: 12, fontWeight: '800' },
  cancelLink: { color: '#DC2626', fontSize: 12, fontWeight: '800' },
});
