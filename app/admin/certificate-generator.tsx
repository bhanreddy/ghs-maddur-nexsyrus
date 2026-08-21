import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import AppTextInput from '@/src/components/AppTextInput';
import { styles as ds } from '@/src/theme/styles';

import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Dimensions, Image, Platform, Pressable,
  Modal, ActivityIndicator, Switch,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AdminHeader from '../../src/components/AdminHeader';
import Animated, {
  FadeInDown,
  useSharedValue, useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { StudentService } from '@/src/services/studentService';
import type { Student, AttendanceSummary } from '@/src/types/models';
import { CertificateService, type IssuedCertificateRecord } from '@/src/services/certificateService';
import { FeeService } from '@/src/services/feeService';
import { SchoolSettingsService, SchoolSettings } from '@/src/services/schoolSettingsService';
import { AcademicYearService } from '@/src/services/academicYearService';
import { SCHOOL_CONFIG, SCHOOL_RECOGNITION_LINE } from '@/src/constants/schoolConfig';
import { SCHOOL_ID } from '@/src/constants/school';
import { RELIGIONS, STUDENT_CATEGORIES } from '@/src/constants/references';
import { useTheme } from '../../src/hooks/useTheme';
import { useAccountsWebChrome } from '../../src/contexts/AccountsWebChromeContext';
import { Theme } from '../../src/theme/themes';
import LogoLoader from '../../src/components/LogoLoader';
import {
  downloadCertificatePdf,
  getLogoDataUri,
  injectCertificatePrintStyles,
  printCertificateElement,
  resolveCertificateElement,
} from '@/src/utils/certificatePrint';
import { dobToWords } from '@/src/utils/dobToWords';

const { width, height } = Dimensions.get('window');

// ─── Paper size constants ─────────────────────────────────────────────────────
// TC Full: A4 portrait 210mm × 297mm.
// TC A4 Half: A5 landscape 210mm × 148.5mm.
// Bonafide: HALF an A4 sheet → A5 landscape (210mm × 148.5mm).
export const PAPER = {
  // 210mm = 595.3pt, 297mm = 841.9pt — standard A4.
  A4: { widthPt: 595.3, heightPt: 841.9, label: 'A4 (210 × 297 mm)' },
  TC_A4_HALF: { widthPt: 595.3, heightPt: 420.9, label: 'A4 Half (Landscape)' },
  // 210mm = 595.3pt, 148.5mm = 420.9pt — exactly half of an A4 sheet.
  BONAFIDE_A5_LANDSCAPE: { widthPt: 595.3, heightPt: 420.9, label: 'Half A4 (210 × 148.5 mm)' },
} as const;

export type TcLayout = 'A4' | 'A4_HALF';
/** Legacy = original double-frame letterhead (default); Modern = redesigned header. */
export type BonafideHeaderTheme = 'legacy' | 'modern';
type TcCompletionAction = 'printed' | 'downloaded';

export const TC_PAPER_MAP: Record<TcLayout, typeof PAPER.A4 | typeof PAPER.TC_A4_HALF> = {
  A4: PAPER.A4,
  A4_HALF: PAPER.TC_A4_HALF,
};

const BONAFIDE_BLUE = '#1e3a8a';
/** Premium TC palette — vibrant, familiar colours with strong print contrast. */
const TC_LEATHER = '#7A1732';
const TC_MAROON = '#7A1732';
const TC_NAVY = '#174A7E';
const TC_ROYAL = '#2F6594';
const TC_CHARCOAL = '#2D3748';
const TC_PLATINUM = '#FFF0C2';
const TC_GOLD = '#D58B16';
const TC_GOLD_BRIGHT = '#F2B134';
const TC_GOLD_SOFT = '#F5D58B';
const TC_PAPER_BG = '#FFF9E8';
const TC_HEADER_BAND = '#FFF0C9';
const TC_GREEN = '#2F6B4F';
const TC_INK = '#17324D';

interface SchoolProfile {
  name: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  affiliation: string;
  recognition: string;
  medium: string;
  logoUrl: string;
  principal: string;
}

function isPlaceholderSchoolName(name?: string): boolean {
  const n = (name || '').trim();
  return !n || /^(default\s+school(\s+name)?|school|school\s+name|my\s+school|unnamed\s+school)$/i.test(n);
}

function mapSchoolSettings(settings: Partial<SchoolSettings>): SchoolProfile {
  const configuredName = settings.school_name?.trim() || '';
  return {
    name: isPlaceholderSchoolName(configuredName) ? SCHOOL_CONFIG.name : configuredName,
    address: settings.school_address?.trim() || SCHOOL_CONFIG.address || '',
    phone: settings.school_phone?.trim() || SCHOOL_CONFIG.contact || '',
    email: settings.school_email?.trim() || SCHOOL_CONFIG.email || '',
    website: settings.school_website?.trim() || SCHOOL_CONFIG.website || '',
    affiliation: settings.school_affiliation?.trim() || '',
    recognition: settings.school_recognition?.trim() || '',
    medium: settings.school_medium?.trim() || '',
    logoUrl: settings.school_logo_url || '',
    principal: settings.school_principal || 'Head Master',
  };
}

/** Geethanjali High School (school_id = 17): Talent School letterhead by certificate type. */
const GEETHANJALI_SCHOOL_ID = 17;
const GEETHANJALI_TALENT_SCHOOL_NAME = 'Geethanjali Talent School';
/** Geethanjali only: TC may be issued for Class 1–6. */
const GEETHANJALI_TC_MAX_CLASS = 6;
/** Geethanjali Bonafide letterhead only: Talent School for classes 1–7. */
const GEETHANJALI_BONAFIDE_TALENT_MAX_CLASS = 7;

const ROMAN_CLASS_TO_NUMBER: Record<string, number> = {
  I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10, XI: 11, XII: 12,
};

/** Extract class grade (1–12) from labels like "5", "V", "Class 5 – A", "VIII – B". */
function parseClassNumber(classLabel?: string): number | null {
  if (!classLabel?.trim()) return null;
  const arabic = classLabel.match(/\b(\d{1,2})\b/);
  if (arabic) {
    const n = parseInt(arabic[1], 10);
    if (n >= 1 && n <= 12) return n;
  }
  const roman = classLabel.toUpperCase().match(/\b(XII|XI|X|IX|VIII|VII|VI|V|IV|III|II|I)\b/);
  if (roman) return ROMAN_CLASS_TO_NUMBER[roman[1]] ?? null;
  return null;
}

/**
 * Geethanjali (17) only letterhead naming:
 * - Bonafide: classes 1–7 → "Geethanjali Talent School"; higher classes keep High School
 * - TC: always High School (never Talent School)
 */
function resolveCertificateSchoolName(
  baseName: string,
  classLabel?: string,
  certType?: CertificateType,
): string {
  if (SCHOOL_ID !== GEETHANJALI_SCHOOL_ID) return baseName;
  // TC always uses High School letterhead for every class.
  if (certType !== 'BONAFIDE') return baseName;
  const classNum = parseClassNumber(classLabel);
  if (classNum !== null && classNum >= 1 && classNum <= GEETHANJALI_BONAFIDE_TALENT_MAX_CLASS) {
    return GEETHANJALI_TALENT_SCHOOL_NAME;
  }
  return baseName;
}

function withCertificateSchoolName(
  school: SchoolProfile,
  classLabel?: string,
  certType?: CertificateType,
): SchoolProfile {
  const name = resolveCertificateSchoolName(school.name, classLabel, certType);
  return name === school.name ? school : { ...school, name };
}

/** Geethanjali (17) only: TC allowed for classes 1–6. Other schools unrestricted. */
function isTcAllowedForClass(classLabel?: string): { allowed: boolean; classNum: number | null } {
  const classNum = parseClassNumber(classLabel);
  if (SCHOOL_ID !== GEETHANJALI_SCHOOL_ID) return { allowed: true, classNum };
  if (classNum === null) return { allowed: true, classNum };
  return { allowed: classNum <= GEETHANJALI_TC_MAX_CLASS, classNum };
}

function formatRecognitionLine(recognition: string, medium: string): string {
  if (!hasOfficialValue(recognition)) return '';
  let line = `Recognised by Govt. ${recognition.trim()}`;
  if (medium) {
    const m = medium.toLowerCase();
    if (m === 'e' || m.includes('english')) line += ' (E/M)';
    else if (m === 't' || m.includes('telugu')) line += ' (T/M)';
    else line += ` (${medium})`;
  }
  return line;
}

/**
 * Letterhead recognition / RC line for certificates.
 * Prefers school-settings recognition, else `SCHOOL_RECOGNITION_LINE` from schoolConfig
 * (`recognitionLine` + optional `recognitionNo`). Empty → omit the line (never "NA").
 */
function resolveCertificateRecognitionLine(school: SchoolProfile): string {
  const fromSettings = formatRecognitionLine(school.recognition, school.medium);
  if (fromSettings) {
    const rc = String(SCHOOL_CONFIG.recognitionNo ?? '').trim();
    if (hasOfficialValue(rc) && !/rc\s*no\.?/i.test(fromSettings)) {
      return `${fromSettings}, RC No. ${rc}`;
    }
    return fromSettings;
  }
  return hasOfficialValue(SCHOOL_RECOGNITION_LINE) ? SCHOOL_RECOGNITION_LINE.trim() : '';
}

function resolveSchoolLogoSource(_school: SchoolProfile) {
  // Bundled crest is circular and high-res; settings uploads are often square pads.
  return SCHOOL_CONFIG.logo;
}

// ─── Types ────────────────────────────────────────────────────────────────────
type CertificateType = 'TC' | 'BONAFIDE' | null;

function getActivePaper(selectedType: CertificateType, tcLayout: TcLayout) {
  if (selectedType === 'TC') return TC_PAPER_MAP[tcLayout];
  if (selectedType === 'BONAFIDE') return PAPER.BONAFIDE_A5_LANDSCAPE;
  return PAPER.A4;
}

function getPdfFormat(selectedType: CertificateType, tcLayout: TcLayout): 'TC' | 'TC_A4_HALF' | 'BONAFIDE' {
  if (selectedType === 'TC') return tcLayout === 'A4_HALF' ? 'TC_A4_HALF' : 'TC';
  return 'BONAFIDE';
}

interface StudentData {
  id: string;
  name: string;
  fatherName: string;
  motherName: string;
  parentName: string;
  genderId: number;
  genderLabel: string;
  class: string;
  dob: string;
  dobWords: string;
  admissionNo: string;
  academicYear: string;
  fromClass: string;
  fromYear: string;
  toClass: string;
  toYear: string;
  penNo: string;
  aadhaarNo: string;
  religion: string;
  address: string;
  nationality: string;
  category: string;
  admissionDate: string;
  lifecycleStatus: string;
  isFormerStudent: boolean;
}

interface TCEditableFields {
  cbseAffiliationNo: string;
  examResult: string;
  qualifiedPromotion: string;
  promotionClass: string;
  totalWorkingDays: string;
  workingDaysPresent: string;
  generalConduct: string;
  /** @deprecated Kept for previously issued certificates; no longer rendered. */
  failedDetails?: string;
  subjects?: [string, string, string, string, string, string];
  schoolDuesPaid?: string;
  feeConcession?: string;
  nccDetails?: string;
  extraCurricular?: string;
  otherRemarks?: string;
}

/** True when a certificate field has a real value (not blank / NA / placeholder). */
function hasOfficialValue(v?: string | null): boolean {
  const t = String(v ?? '').trim();
  if (!t) return false;
  return !/^(n\/?a|na|nil|null|none|undefined|-|—|\.{2,}|_{2,})$/i.test(t);
}

function displayOrDash(v?: string | null): string {
  return hasOfficialValue(v) ? String(v).trim() : '—';
}

type ExamResultStatus = 'Pursuing' | 'Passed';

const DEFAULT_TC_FIELDS: TCEditableFields = {
  cbseAffiliationNo: hasOfficialValue(SCHOOL_CONFIG.cbseAffiliationNo) ? String(SCHOOL_CONFIG.cbseAffiliationNo).trim() : '',
  examResult: 'Pursuing',
  qualifiedPromotion: '',
  promotionClass: '',
  totalWorkingDays: '',
  workingDaysPresent: '',
  generalConduct: 'Good',
};

function isExamResultPassed(value?: string | null): boolean {
  return String(value ?? '').trim().toLowerCase() === 'passed';
}

// ─── Utility ──────────────────────────────────────────────────────────────────
function formatDDMMYYYY(dateStr: string | Date | undefined | null): string {
  if (!dateStr) return 'N/A';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return typeof dateStr === 'string' ? dateStr : 'N/A';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

/** Rebuild TC preview from issued_certificates.data snapshot. */
function parseStoredTcSnapshot(
  data: IssuedCertificateRecord['data'],
): { studentData: StudentData; tcFields: TCEditableFields } | null {
  if (!data || typeof data !== 'object') return null;
  const rawStudent = data.studentData;
  const rawFields = data.tcFields;
  if (!rawStudent || typeof rawStudent !== 'object') return null;

  const s = rawStudent as Partial<StudentData>;
  const studentData: StudentData = {
    id: String(s.id || ''),
    name: String(s.name || ''),
    fatherName: String(s.fatherName || ''),
    motherName: String(s.motherName || ''),
    parentName: String(s.parentName || ''),
    genderId: typeof s.genderId === 'number' ? s.genderId : 0,
    genderLabel: String(s.genderLabel || ''),
    class: String(s.class || ''),
    dob: String(s.dob || ''),
    dobWords: String(s.dobWords || ''),
    admissionNo: String(s.admissionNo || ''),
    academicYear: String(s.academicYear || ''),
    fromClass: String(s.fromClass || ''),
    fromYear: String(s.fromYear || ''),
    toClass: String(s.toClass || ''),
    toYear: String(s.toYear || ''),
    penNo: String(s.penNo || ''),
    aadhaarNo: String(s.aadhaarNo || ''),
    religion: String(s.religion || ''),
    address: String(s.address || ''),
    nationality: String(s.nationality || 'Indian'),
    category: String(s.category || ''),
    admissionDate: String(s.admissionDate || ''),
    lifecycleStatus: String(s.lifecycleStatus || 'active'),
    isFormerStudent: !!s.isFormerStudent,
  };

  const tcFields: TCEditableFields = {
    ...DEFAULT_TC_FIELDS,
    ...(rawFields && typeof rawFields === 'object' ? (rawFields as Partial<TCEditableFields>) : {}),
  };

  return { studentData, tcFields };
}

function classToRoman(className: string): string {
  if (!className) return '';
  return className.replace(/\b(\d+)\b/g, (match) => {
    const num = parseInt(match, 10);
    if (num >= 1 && num <= 12) {
      const romanMap = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
      return romanMap[num - 1];
    }
    return match;
  });
}

function formatInr(amount: number): string {
  return amount.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
}

function genderHonorific(genderId?: number): string {
  if (genderId === 1) return 'Master';
  if (genderId === 2) return 'Kumari';
  return 'Master/Kumari';
}

function genderPronouns(genderId?: number) {
  if (genderId === 2) return { subject: 'She', possessive: 'her', verb: 'is' };
  if (genderId === 1) return { subject: 'He', possessive: 'his', verb: 'is' };
  return { subject: 'He/She', possessive: 'his/her', verb: 'is/was' };
}

function line(val?: string) {
  const v = val?.trim();
  return v || '________________________';
}

function dot(val: string) {
  return val?.trim() ? val : '—';
}

// ─── Certificate Config ───────────────────────────────────────────────────────
const CERT_CONFIG = {
  TC: {
    label: 'School Record Sheet', short: 'TC',
    icon: 'file-move-outline' as const,
    iconColor: TC_NAVY, iconBg: '#FDF2F4',
    accentLight: TC_NAVY, accentDark: TC_ROYAL,
    gradFrom: TC_NAVY, gradTo: TC_ROYAL,
    desc: 'Official School Record Sheet / Transfer Certificate for leaving students.',
  },
  BONAFIDE: {
    label: 'Bonafide Certificate', short: 'BON',
    icon: 'certificate-outline' as const,
    iconColor: '#059669', iconBg: '#ECFDF5',
    accentLight: '#059669', accentDark: '#34D399',
    gradFrom: '#059669', gradTo: '#10B981',
    paper: PAPER.BONAFIDE_A5_LANDSCAPE,
    desc: 'Official proof of enrolment and conduct.',
  },
} as const;

// ─── Animated Type Card ───────────────────────────────────────────────────────
function TypeCard({ type, isDark, onPress }: { type: keyof typeof CERT_CONFIG; isDark: boolean; onPress: () => void }) {
  const cfg = CERT_CONFIG[type];
  const scale = useSharedValue(1);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const cardBg = isDark ? '#1C1F2A' : '#FFFFFF';
  const border = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)';
  return (
    <Animated.View style={[aStyle, { flex: 1 }]}>
      <Pressable
        style={[tcStyles.card, { backgroundColor: cardBg, borderColor: border }]}
        onPress={onPress}
        onPressIn={() => { scale.value = withSpring(0.95, { damping: 20 }); }}
        onPressOut={() => { scale.value = withSpring(1, { damping: 20 }); }}
      >
        <View style={[tcStyles.iconBox, { backgroundColor: isDark ? `${cfg.iconColor}22` : cfg.iconBg }]}>
          <MaterialCommunityIcons name={cfg.icon} size={26} color={isDark ? (type === 'TC' ? '#818CF8' : '#34D399') : cfg.iconColor} />
        </View>
        <Text style={[tcStyles.title, { color: isDark ? '#F9FAFB' : '#111827' }]}>{cfg.label}</Text>
        <Text style={[tcStyles.desc, { color: isDark ? 'rgba(255,255,255,0.35)' : '#6B7280' }]}>{cfg.desc}</Text>
        <View style={[tcStyles.paperBadge, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F3F4F6' }]}>
          <Ionicons name="document-outline" size={10} color={isDark ? 'rgba(255,255,255,0.3)' : '#9CA3AF'} />
          <Text style={[tcStyles.paperBadgeText, { color: isDark ? 'rgba(255,255,255,0.3)' : '#9CA3AF' }]}>
            {type === 'TC' ? TC_PAPER_MAP.A4.label : PAPER.BONAFIDE_A5_LANDSCAPE.label}
          </Text>
        </View>
        <View style={[tcStyles.arrowWrap, { backgroundColor: isDark ? `${cfg.iconColor}22` : cfg.iconBg }]}>
          <Ionicons name="arrow-forward" size={14} color={isDark ? (type === 'TC' ? '#818CF8' : '#34D399') : cfg.iconColor} />
        </View>
      </Pressable>
    </Animated.View>
  );
}
const tcStyles = StyleSheet.create({
  card: { borderRadius: 18, padding: 16, borderWidth: 1, gap: 6, ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12 }, android: { elevation: 3 } }) },
  iconBox: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  title: { fontSize: 14, fontWeight: '800', lineHeight: 19 },
  desc: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
  paperBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, alignSelf: 'flex-start' },
  paperBadgeText: { fontSize: 10, fontWeight: '600' },
  arrowWrap: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
});

// ─── Edit Field (reusable) ────────────────────────────────────────────────────
function EditField({
  label, value, onChangeText, multiline = false, isDark,
}: {
  label: string; value: string; onChangeText: (v: string) => void;
  multiline?: boolean; isDark: boolean;
}) {
  return (
    <View style={efStyles.wrap}>
      <Text style={[efStyles.label, { color: isDark ? 'rgba(255,255,255,0.5)' : '#6B7280' }]}>{label}</Text>
      <AppTextInput
        style={[efStyles.input, {
          backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF',
          borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#CBD5E1',
          color: isDark ? '#F9FAFB' : '#111827',
          height: multiline ? 72 : 42,
          textAlignVertical: multiline ? 'top' : 'center',
        }]}
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        placeholderTextColor={isDark ? 'rgba(255,255,255,0.18)' : '#94A3B8'}
        placeholder="Enter value..."
      />
    </View>
  );
}
const efStyles = StyleSheet.create({
  wrap: { marginBottom: 12 },
  label: { fontSize: 11, fontWeight: '700', marginBottom: 5, letterSpacing: 0.3, textTransform: 'uppercase' },
  input: { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13.5, fontWeight: '500' },
});

// ─── Edit Modal ───────────────────────────────────────────────────────────────
function EditModal({
  visible, isDark, studentData, tcFields,
  onSave, onClose,
}: {
  visible: boolean; isDark: boolean;
  studentData: StudentData; tcFields: TCEditableFields;
  onSave: (sd: StudentData, tc: TCEditableFields) => void;
  onClose: () => void;
}) {
  const [sd, setSd] = useState<StudentData>(studentData);
  const [tc, setTc] = useState<TCEditableFields>(tcFields);
  const bg = isDark ? '#0F1117' : '#F8FAFC';
  const cardBg = isDark ? '#1C1F2A' : '#FFFFFF';

  const setSD = useCallback((k: keyof StudentData, v: string) => {
    setSd(prev => ({ ...prev, [k]: v }));
  }, []);
  const setTC = useCallback((k: keyof TCEditableFields, v: string | string[]) => {
    setTc(prev => ({ ...prev, [k]: v }));
  }, []);

  // Sync when externally changed
  React.useEffect(() => { setSd(studentData); }, [studentData]);
  React.useEffect(() => { setTc(tcFields); }, [tcFields]);

  const handleDobBlur = () => {
    if (sd.dob && sd.dob !== 'N/A') {
      setSd(prev => ({ ...prev, dobWords: dobToWords(sd.dob) }));
    }
  };

  const sectionTitle = (t: string) => (
    <View style={emStyles.sectionRow}>
      <View style={[emStyles.sectionDot, { backgroundColor: TC_ROYAL }]} />
      <Text style={[emStyles.sectionTitle, { color: isDark ? '#F9FAFB' : '#111827' }]}>{t}</Text>
    </View>
  );

  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent>
      <View style={emStyles.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={[emStyles.sheet, { backgroundColor: bg }]}>
            {/* Header */}
            <View style={[emStyles.header, { backgroundColor: cardBg, borderBottomColor: isDark ? 'rgba(255,255,255,0.07)' : '#F1F5F9' }]}>
              <TouchableOpacity onPress={onClose} style={emStyles.headerClose}>
                <Ionicons name="close" size={20} color={isDark ? '#9CA3AF' : '#6B7280'} />
              </TouchableOpacity>
              <Text style={[emStyles.headerTitle, { color: isDark ? '#F9FAFB' : '#111827' }]}>Edit Certificate</Text>
              <TouchableOpacity
                onPress={() => onSave(sd, tc)}
                style={emStyles.saveBtn}
              >
                <LinearGradient colors={[TC_NAVY, TC_ROYAL]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={emStyles.saveBtnGrad}>
                  <Text style={emStyles.saveBtnText}>Save</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={emStyles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

              {/* ── Student Information ── */}
              {sectionTitle('Student Information')}
              <View style={[emStyles.card, { backgroundColor: cardBg }]}>
                <EditField label="Full Name" value={sd.name} onChangeText={v => setSD('name', v)} isDark={isDark} />
                <EditField label="Father's / Guardian Name" value={sd.fatherName} onChangeText={v => setSD('fatherName', v)} isDark={isDark} />
                <EditField label="Mother's Name" value={sd.motherName} onChangeText={v => setSD('motherName', v)} isDark={isDark} />
                <EditField label="Admission No." value={sd.admissionNo} onChangeText={v => setSD('admissionNo', v)} isDark={isDark} />
                <EditField label="PEN Number" value={sd.penNo} onChangeText={v => setSD('penNo', v)} isDark={isDark} />
                <EditField label="Aadhaar No." value={sd.aadhaarNo} onChangeText={v => setSD('aadhaarNo', v)} isDark={isDark} />
                <EditField label="Class (no section)" value={sd.class} onChangeText={v => setSD('class', v)} isDark={isDark} />
                <EditField label="From Class (Bonafide)" value={sd.fromClass} onChangeText={v => setSD('fromClass', v)} isDark={isDark} />
                <EditField label="From Year (Bonafide)" value={sd.fromYear} onChangeText={v => setSD('fromYear', v)} isDark={isDark} />
                <EditField label="To Class (Bonafide)" value={sd.toClass} onChangeText={v => setSD('toClass', v)} isDark={isDark} />
                <EditField label="To Year (Bonafide)" value={sd.toYear} onChangeText={v => setSD('toYear', v)} isDark={isDark} />
                <EditField
                  label="Date of Birth (dd-MM-yyyy)"
                  value={sd.dob}
                  onChangeText={v => setSD('dob', v)}
                  isDark={isDark}
                />
                <TouchableOpacity onPress={handleDobBlur} style={emStyles.autoBtn}>
                  <Ionicons name="refresh-outline" size={13} color={TC_ROYAL} />
                  <Text style={[emStyles.autoBtnText, { color: TC_ROYAL }]}>Auto-fill DOB in words</Text>
                </TouchableOpacity>
                <EditField label="DOB in Words" value={sd.dobWords} onChangeText={v => setSD('dobWords', v)} isDark={isDark} />
                <EditField label="Date of Admission" value={sd.admissionDate} onChangeText={v => setSD('admissionDate', v)} isDark={isDark} />
                <EditField label="Nationality" value={sd.nationality} onChangeText={v => setSD('nationality', v)} isDark={isDark} />
                <EditField label="Religion" value={sd.religion} onChangeText={v => setSD('religion', v)} isDark={isDark} />
                <EditField label="Category / Caste (OC / BC / BC A–E / SC / ST / OBC / General)" value={sd.category} onChangeText={v => setSD('category', v)} isDark={isDark} />
                <EditField label="Academic Year" value={sd.academicYear} onChangeText={v => setSD('academicYear', v)} isDark={isDark} />
                <EditField label="Address" value={sd.address} onChangeText={v => setSD('address', v)} isDark={isDark} multiline />
              </View>

              {/* ── TC-Specific Fields ── */}
              {sectionTitle('School Record Sheet Fields')}
              <View style={[emStyles.card, { backgroundColor: cardBg }]}>
                <EditField label="CBSE Affiliation No." value={tc.cbseAffiliationNo} onChangeText={v => setTC('cbseAffiliationNo', v)} isDark={isDark} />
                <View style={[emStyles.examResultRow, { borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB' }]}>
                  <View style={emStyles.examResultCopy}>
                    <Text style={[emStyles.examResultLabel, { color: isDark ? 'rgba(255,255,255,0.45)' : '#6B7280' }]}>
                      Exam Last Taken with Result
                    </Text>
                    <Text style={[emStyles.examResultValue, { color: isDark ? '#F9FAFB' : '#111827' }]}>
                      {isExamResultPassed(tc.examResult) ? 'Passed' : 'Pursuing'}
                    </Text>
                  </View>
                  <View style={emStyles.examResultToggle}>
                    <Text style={[emStyles.examResultSide, !isExamResultPassed(tc.examResult) && emStyles.examResultSideActive]}>
                      Pursuing
                    </Text>
                    <Switch
                      value={isExamResultPassed(tc.examResult)}
                      onValueChange={(on) => setTC('examResult', on ? 'Passed' : 'Pursuing')}
                      trackColor={{ false: isDark ? '#374151' : '#CBD5E1', true: '#86EFAC' }}
                      thumbColor={isExamResultPassed(tc.examResult) ? '#059669' : '#FFFFFF'}
                    />
                    <Text style={[emStyles.examResultSide, isExamResultPassed(tc.examResult) && emStyles.examResultSideActive]}>
                      Passed
                    </Text>
                  </View>
                </View>
                <EditField label="Qualified for Promotion?" value={tc.qualifiedPromotion} onChangeText={v => setTC('qualifiedPromotion', v)} isDark={isDark} />
                <EditField label="Promotion to Class (Figures + Words)" value={tc.promotionClass} onChangeText={v => setTC('promotionClass', v)} isDark={isDark} />
                <EditField label="Total Working Days" value={tc.totalWorkingDays} onChangeText={v => setTC('totalWorkingDays', v)} isDark={isDark} />
                <EditField label="Working Days Present" value={tc.workingDaysPresent} onChangeText={v => setTC('workingDaysPresent', v)} isDark={isDark} />
                <EditField label="General Conduct" value={tc.generalConduct} onChangeText={v => setTC('generalConduct', v)} isDark={isDark} />
              </View>
              <View style={{ height: 32 }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
/** Dialog: waive fee-clearance rule for TC — scoped to one student for this session. */
function TcFeeWaiverDialog({
  visible,
  isDark,
  studentName,
  outstanding,
  waiveEnabled,
  onWaiveChange,
  onCancel,
  onContinue,
}: {
  visible: boolean;
  isDark: boolean;
  studentName: string;
  outstanding: number | null;
  waiveEnabled: boolean;
  onWaiveChange: (value: boolean) => void;
  onCancel: () => void;
  onContinue: () => void;
}) {
  const cardBg = isDark ? '#1C1F2A' : '#FFFFFF';
  const textPrimary = isDark ? '#F9FAFB' : '#111827';
  const textMuted = isDark ? 'rgba(255,255,255,0.45)' : '#6B7280';
  const duesKnown = outstanding !== null && outstanding > 0;

  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent>
      <View style={feeDlgStyles.overlay}>
        <View style={[feeDlgStyles.card, { backgroundColor: cardBg }]}>
          <View style={feeDlgStyles.iconWrap}>
            <MaterialCommunityIcons name="cash-remove" size={28} color="#DC2626" />
          </View>
          <Text style={[feeDlgStyles.title, { color: textPrimary }]}>
            {duesKnown ? 'Fee Dues Pending' : 'Could Not Verify Fees'}
          </Text>
          <Text style={[feeDlgStyles.message, { color: textMuted }]}>
            {duesKnown
              ? `${studentName} has outstanding fee dues of ${formatInr(outstanding!)}. Clear dues in Accounts, or allow TC for this student only without fee clearance.`
              : `Unable to confirm whether ${studentName} has pending dues. Check the fee ledger, or allow TC for this student only without fee verification.`}
          </Text>

          <View style={[feeDlgStyles.toggleRow, {
            backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F8FAFC',
            borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0',
          }]}>
            <View style={feeDlgStyles.toggleCopy}>
              <Text style={[feeDlgStyles.toggleTitle, { color: textPrimary }]}>
                Allow TC without fee clearance
              </Text>
              <Text style={[feeDlgStyles.toggleHint, { color: textMuted }]}>
                Applies only to {studentName} for this session. Other students still require fee clearance.
              </Text>
            </View>
            <Switch
              value={waiveEnabled}
              onValueChange={onWaiveChange}
              trackColor={{ false: isDark ? '#374151' : '#CBD5E1', true: '#FCA5A5' }}
              thumbColor={waiveEnabled ? '#DC2626' : '#FFFFFF'}
            />
          </View>

          <View style={feeDlgStyles.actions}>
            <TouchableOpacity style={feeDlgStyles.cancelBtn} onPress={onCancel} activeOpacity={0.8}>
              <Text style={[feeDlgStyles.cancelText, { color: textMuted }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[feeDlgStyles.continueBtn, !waiveEnabled && feeDlgStyles.continueDisabled]}
              onPress={onContinue}
              disabled={!waiveEnabled}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={waiveEnabled ? ['#DC2626', '#F87171'] : ['#9CA3AF', '#9CA3AF']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={feeDlgStyles.continueGrad}
              >
                <Text style={feeDlgStyles.continueText}>Generate TC</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** Confirmation shown only after an active student's TC print/download succeeds. */
function TcWithdrawalDialog({
  visible,
  isDark,
  studentName,
  completedAction,
  withdrawing,
  onKeepActive,
  onWithdraw,
}: {
  visible: boolean;
  isDark: boolean;
  studentName: string;
  completedAction: TcCompletionAction | null;
  withdrawing: boolean;
  onKeepActive: () => void;
  onWithdraw: () => void;
}) {
  const cardBg = isDark ? '#1C1F2A' : '#FFFFFF';
  const textPrimary = isDark ? '#F9FAFB' : '#111827';
  const textMuted = isDark ? 'rgba(255,255,255,0.45)' : '#6B7280';
  const completionMessage = completedAction === 'printed'
    ? `The TC print dialog for ${studentName} has closed. If the TC printed successfully, move this student from Active to Withdrawn now?`
    : `The TC for ${studentName} was downloaded successfully. Move this student from Active to Withdrawn now?`;

  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent>
      <View style={feeDlgStyles.overlay}>
        <View style={[feeDlgStyles.card, { backgroundColor: cardBg }]}>
          <View style={feeDlgStyles.iconWrap}>
            <Ionicons name="person-remove-outline" size={28} color="#DC2626" />
          </View>
          <Text style={[feeDlgStyles.title, { color: textPrimary }]}>Withdraw Student?</Text>
          <Text style={[feeDlgStyles.message, { color: textMuted }]}>
            {`${completionMessage} Attendance, fees, certificates, and all other history will be retained.`}
          </Text>

          <View style={feeDlgStyles.actions}>
            <TouchableOpacity
              style={feeDlgStyles.cancelBtn}
              onPress={onKeepActive}
              disabled={withdrawing}
              activeOpacity={0.8}
            >
              <Text style={[feeDlgStyles.cancelText, { color: textMuted }]}>Keep Active</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[feeDlgStyles.continueBtn, withdrawing && feeDlgStyles.continueDisabled]}
              onPress={onWithdraw}
              disabled={withdrawing}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={['#B91C1C', '#EF4444']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={feeDlgStyles.continueGrad}
              >
                {withdrawing
                  ? <ActivityIndicator size="small" color="#FFFFFF" />
                  : <Text style={feeDlgStyles.continueText}>Withdraw Student</Text>}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const feeDlgStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 20,
    padding: 22,
    gap: 12,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  title: { fontSize: 18, fontWeight: '800' },
  message: { fontSize: 14, lineHeight: 21, fontWeight: '500' },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginTop: 4,
  },
  toggleCopy: { flex: 1, gap: 4 },
  toggleTitle: { fontSize: 14, fontWeight: '700' },
  toggleHint: { fontSize: 12, lineHeight: 17, fontWeight: '500' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  cancelBtn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: { fontSize: 15, fontWeight: '700' },
  continueBtn: { flex: 1.4, borderRadius: 12, overflow: 'hidden', height: 46 },
  continueDisabled: { opacity: 0.55 },
  continueGrad: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  continueText: { color: '#FFF', fontSize: 15, fontWeight: '800' },
});

const emStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: { height: height * 0.92, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, gap: 10 },
  headerClose: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: '800' },
  saveBtn: { borderRadius: 10, overflow: 'hidden' },
  saveBtnGrad: { paddingHorizontal: 18, paddingVertical: 9 },
  saveBtnText: { color: '#FFF', fontWeight: '800', fontSize: 14 },
  body: { padding: 16 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, marginTop: 4 },
  sectionDot: { width: 6, height: 6, borderRadius: 3 },
  sectionTitle: { fontSize: 13, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase' },
  card: { borderRadius: 16, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)' },
  autoBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: -6, marginBottom: 10, alignSelf: 'flex-start' },
  autoBtnText: { fontSize: 12, color: '#4F46E5', fontWeight: '700' },
  examResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  examResultCopy: { flex: 1, gap: 2 },
  examResultLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
  examResultValue: { fontSize: 14, fontWeight: '800' },
  examResultToggle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  examResultSide: { fontSize: 12, fontWeight: '700', color: '#94A3B8' },
  examResultSideActive: { color: '#059669' },
  subjectsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  subjectCell: { flexDirection: 'row', alignItems: 'center', gap: 6, width: (width - 32 - 28 - 16) / 2 },
  subjectLabel: { fontSize: 11, fontWeight: '700', width: 22 },
  subjectInput: { flex: 1, borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 8, height: 36, fontSize: 13, fontWeight: '500' },
});

const webPrintRootProps = Platform.OS === 'web'
  ? ({ className: 'certificate-print-root' } as const)
  : ({} as const);

const webWatermarkProps = Platform.OS === 'web'
  ? ({ className: 'certificate-watermark' } as const)
  : ({} as const);

// ─── Bonafide document (HALF-A4 landscape letterhead) ────────────────────────
// Frame, meta, body, and footer stay identical for both themes.
// Only the school letterhead (logo + name/address + certificate title) changes.
function BonafideDocument({
  studentData,
  school,
  issueDate,
  headerTheme = 'legacy',
}: {
  studentData: StudentData;
  school: SchoolProfile;
  issueDate: string;
  headerTheme?: BonafideHeaderTheme;
}) {
  const pronouns = genderPronouns(studentData.genderId);
  const enrolmentVerb = studentData.isFormerStudent ? 'was' : 'is';
  const studyVerb = studentData.isFormerStudent ? 'studied' : 'is Studying';
  const logoSource = resolveSchoolLogoSource(school);
  const recognitionLine = resolveCertificateRecognitionLine(school);
  const isLegacy = headerTheme === 'legacy';

  return (
    <View style={bfStyles.outerFrame}>
      <View style={bfStyles.innerFrame}>
        <View style={bfStyles.watermarkWrap} pointerEvents="none" {...webWatermarkProps}>
          <Image source={logoSource} style={bfStyles.watermarkImg} />
        </View>

        {isLegacy ? (
          <>
            <View style={bfStyles.headerRow}>
              <Image source={logoSource} style={bfStyles.headerLogo} />
              <View style={bfStyles.headerCenter}>
                <Text style={bfStyles.schoolName}>{school.name.toUpperCase()}</Text>
                {recognitionLine ? (
                  <Text style={bfStyles.schoolRecognition}>{recognitionLine}</Text>
                ) : null}
                <Text style={bfStyles.schoolAddr}>{school.address}</Text>
              </View>
            </View>
            <View style={bfStyles.titleBox}>
              <Text style={bfStyles.titleText}>BONAFIDE & CONDUCT CERTIFICATE</Text>
            </View>
          </>
        ) : (
          <>
            <View style={bfModernStyles.headerBand}>
              <View style={bfModernStyles.headerRow}>
                <Image source={logoSource} style={bfModernStyles.headerLogo} />
                <View style={bfModernStyles.headerCenter}>
                  <Text style={bfModernStyles.schoolName}>{school.name.toUpperCase()}</Text>
                  {recognitionLine ? (
                    <Text style={bfModernStyles.schoolRecognition}>{recognitionLine}</Text>
                  ) : null}
                  <Text style={bfModernStyles.schoolAddr}>{school.address}</Text>
                  <View style={bfModernStyles.nameUnderline} />
                </View>
              </View>
            </View>
            <View style={bfModernStyles.titleWrap}>
              <View style={bfModernStyles.titleRule} />
              <View style={bfModernStyles.titleBox}>
                <Text style={bfModernStyles.titleText}>BONAFIDE & CONDUCT CERTIFICATE</Text>
              </View>
              <View style={bfModernStyles.titleRule} />
            </View>
          </>
        )}

        <View style={bfStyles.metaRow}>
          <Text style={bfStyles.metaText}>
            Admission No. <Text style={bfStyles.metaVal}>{line(studentData.admissionNo)}</Text>
          </Text>
          <Text style={bfStyles.metaText}>
            Date <Text style={bfStyles.metaVal}>{line(issueDate)}</Text>
          </Text>
        </View>

        <View style={bfStyles.body}>
          <Text style={bfStyles.bodyLine}>
            This is to certify that {studentData.genderLabel}{' '}
            <Text style={bfStyles.bold}>{line(studentData.name)}</Text>
          </Text>
          <Text style={bfStyles.bodyLine}>
            S/o. D/o. Shri/Smt. <Text style={bfStyles.bold}>{line(studentData.parentName)}</Text> {enrolmentVerb} a Bonafide student of this Institution.
          </Text>
          <Text style={bfStyles.bodyLine}>
            {pronouns.subject} {studyVerb} from Class{' '}
            <Text style={bfStyles.bold}>{line(studentData.fromClass)}</Text> Year{' '}
            <Text style={bfStyles.bold}>{line(studentData.fromYear)}</Text> to Class{' '}
            <Text style={bfStyles.bold}>{line(studentData.toClass)}</Text> Year{' '}
            <Text style={bfStyles.bold}>{line(studentData.toYear)}</Text> during {pronouns.possessive} study period. {pronouns.possessive.charAt(0).toUpperCase() + pronouns.possessive.slice(1)} Character is found Good.
          </Text>
          <Text style={[bfStyles.bodyLine, { marginTop: 14 }]}>
            {pronouns.possessive.charAt(0).toUpperCase() + pronouns.possessive.slice(1)} date of birth according to School Admission register is{' '}
            <Text style={bfStyles.bold}>{line(studentData.dob)}</Text>
          </Text>
          <Text style={bfStyles.dobWordsLine}>{line(studentData.dobWords)}</Text>
        </View>

        <View style={bfStyles.footer}>
          <Text style={bfStyles.footerText}>
            PEN No. <Text style={bfStyles.bold}>{line(studentData.penNo)}</Text>
          </Text>
          <Text style={bfStyles.footerSign}>{school.principal}</Text>
        </View>
      </View>
    </View>
  );
}

const bfStyles = StyleSheet.create({
  outerFrame: {
    margin: 40,
    borderWidth: 2,
    borderColor: BONAFIDE_BLUE,
    padding: 8,
    backgroundColor: '#FFFFFF',
  },
  innerFrame: {
    borderWidth: 1.5,
    borderColor: BONAFIDE_BLUE,
    paddingHorizontal: 24,
    paddingVertical: 16,
    position: 'relative',
  },
  watermarkWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 0,
  },
  watermarkImg: { width: 260, height: 260, opacity: 0.07, resizeMode: 'contain' },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 16, paddingTop: 28, marginBottom: 32, zIndex: 1 },
  headerLogo: { width: 160, height: 160, resizeMode: 'contain' },
  headerCenter: { flex: 1, alignItems: 'center' },
  schoolName: { fontSize: 32, fontWeight: '900', color: BONAFIDE_BLUE, letterSpacing: 0.8, textAlign: 'center' },
  schoolRecognition: { fontSize: 14, color: BONAFIDE_BLUE, textAlign: 'center', marginTop: 4, fontWeight: '700' },
  schoolAddr: { fontSize: 15, color: BONAFIDE_BLUE, textAlign: 'center', marginTop: 5, lineHeight: 22, fontWeight: '600' },
  titleBox: {
    alignSelf: 'center',
    borderWidth: 1.5,
    borderColor: BONAFIDE_BLUE,
    borderRadius: 4,
    paddingHorizontal: 20,
    paddingVertical: 8,
    marginTop: -92,
    marginBottom: 52,
    zIndex: 1,
  },
  titleText: { fontSize: 19, fontWeight: '800', color: BONAFIDE_BLUE, letterSpacing: 0.8, textAlign: 'center' },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, marginBottom: 14, zIndex: 1 },
  metaText: { fontSize: 17, color: BONAFIDE_BLUE, fontWeight: '600' },
  metaVal: { fontSize: 19, fontWeight: '800', textDecorationLine: 'underline' },
  body: { zIndex: 1, gap: 14 },
  bodyLine: { fontSize: 19, lineHeight: 32, color: BONAFIDE_BLUE, fontWeight: '500' },
  dobWordsLine: { fontSize: 18, color: BONAFIDE_BLUE, fontWeight: '700', textDecorationLine: 'underline', marginTop: 4, marginBottom: 12 },
  bold: { fontSize: 21, fontWeight: '800' },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 36, paddingTop: 8, zIndex: 1 },
  footerText: { fontSize: 17, color: BONAFIDE_BLUE, fontWeight: '600', flex: 1 },
  footerSign: { fontSize: 18, fontWeight: '800', color: BONAFIDE_BLUE, textAlign: 'right', minWidth: 140 },
});

/** Modern header only — same double frame + body as legacy. */
const bfModernStyles = StyleSheet.create({
  headerBand: {
    zIndex: 1,
    marginHorizontal: -8,
    marginTop: -4,
    marginBottom: 8,
    paddingHorizontal: 8,
    paddingTop: 20,
    paddingBottom: 14,
    backgroundColor: '#F4F7FB',
    borderBottomWidth: 2,
    borderBottomColor: BONAFIDE_BLUE,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  headerLogo: { width: 128, height: 128, resizeMode: 'contain' },
  headerCenter: { flex: 1, alignItems: 'center', paddingRight: 12 },
  schoolName: {
    fontSize: 30,
    fontWeight: '900',
    color: BONAFIDE_BLUE,
    letterSpacing: 1.4,
    textAlign: 'center',
    lineHeight: 36,
  },
  schoolRecognition: {
    fontSize: 13,
    color: BONAFIDE_BLUE,
    textAlign: 'center',
    marginTop: 4,
    fontWeight: '700',
    opacity: 0.85,
  },
  schoolAddr: {
    fontSize: 14,
    color: BONAFIDE_BLUE,
    textAlign: 'center',
    marginTop: 5,
    lineHeight: 20,
    fontWeight: '600',
    opacity: 0.9,
  },
  nameUnderline: {
    width: 72,
    height: 3,
    borderRadius: 2,
    backgroundColor: BONAFIDE_BLUE,
    marginTop: 10,
    opacity: 0.35,
  },
  titleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 6,
    marginBottom: 28,
    zIndex: 1,
  },
  titleRule: { flex: 1, height: 1.5, backgroundColor: BONAFIDE_BLUE, opacity: 0.35 },
  titleBox: {
    borderWidth: 1.5,
    borderColor: BONAFIDE_BLUE,
    backgroundColor: '#EEF3FB',
    borderRadius: 6,
    paddingHorizontal: 22,
    paddingVertical: 9,
  },
  titleText: {
    fontSize: 17,
    fontWeight: '800',
    color: BONAFIDE_BLUE,
    letterSpacing: 1,
    textAlign: 'center',
  },
});

const cpStyles = StyleSheet.create({
  wrap: { marginTop: 20, gap: 16 },
  paperBadgeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  paperBadgeLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  paperBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  paperBadgeText: { fontSize: 11, fontWeight: '700' },
  layoutToggle: { flexDirection: 'row', borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#F3F4F6' },
  layoutPill: { paddingHorizontal: 10, paddingVertical: 5 },
  layoutPillActive: { backgroundColor: '#4F46E5' },
  layoutPillText: { fontSize: 10, fontWeight: '700', color: '#6B7280' },
  layoutPillTextActive: { color: '#FFFFFF' },
  examResultToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F8FAFC',
  },
  examResultLabel: { fontSize: 11, fontWeight: '700', color: '#94A3B8' },
  examResultLabelActive: { color: '#059669' },
  headerThemeToggle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerThemeLabel: { fontSize: 11, fontWeight: '700', color: '#94A3B8' },
  headerThemeLabelActive: { color: '#059669' },
  headerThemeTrack: {
    width: 42,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#CBD5E1',
    padding: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  headerThemeTrackOn: { backgroundColor: '#059669', justifyContent: 'flex-end' },
  headerThemeThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.15, shadowRadius: 2 },
      android: { elevation: 2 },
    }),
  },
  serialText: { fontSize: 11, fontWeight: '600', color: '#94A3B8' },
  paper: { backgroundColor: 'transparent', borderRadius: 4, overflow: 'hidden', borderWidth: 1, borderColor: '#E2E8F0', position: 'relative', ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 20 }, android: { elevation: 8 } }) },
  // A4 @ ~96dpi (794 × 1123). Fixed height so rows can space-between to fill the sheet.
  tcPaper: { width: 794, height: 1123, backgroundColor: 'transparent' },
  tcHalfPaper: { width: 1060, minHeight: 520, backgroundColor: TC_MAROON, padding: 7 },
  tcHalfFrame: {
    flex: 1,
    minHeight: 506,
    backgroundColor: TC_PAPER_BG,
    borderWidth: 2,
    borderColor: TC_GOLD_BRIGHT,
    position: 'relative',
    overflow: 'hidden',
  },
  // A5 landscape ratio (1060 / 749 ≈ 1.414). Fixed height so the flex footer
  // can pin to the bottom and the sheet renders as a true half-A4 card.
  bonafidePaper: { width: 1060, minHeight: 749, backgroundColor: '#FFFFFF' },
  topBar: { height: 6 },
  bottomBar: { height: 4 },
  watermarkWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  watermarkImg: { width: 320, height: 320, opacity: 0.075, resizeMode: 'contain' },
  schoolHeader: { alignItems: 'center', paddingTop: 20, paddingHorizontal: 20, paddingBottom: 4 },
  tcHalfHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingTop: 12, paddingBottom: 7, zIndex: 1, backgroundColor: TC_HEADER_BAND, borderBottomWidth: 2, borderBottomColor: TC_GOLD },
  tcHalfLogo: { width: 54, height: 54, resizeMode: 'contain' },
  tcHalfHeaderCenter: { flex: 1, alignItems: 'center' },
  tcHalfSchoolName: { fontSize: 18, fontWeight: '900', color: TC_NAVY, letterSpacing: 0.9, textAlign: 'center' },
  tcHalfAffiliation: { fontSize: 9, color: TC_ROYAL, fontStyle: 'italic', marginTop: 2, textAlign: 'center' },
  tcHalfTitleBlock: { alignItems: 'center', paddingVertical: 7, paddingHorizontal: 16, zIndex: 1 },
  tcHalfEyebrow: { fontSize: 7, fontWeight: '800', letterSpacing: 1.8, color: TC_MAROON, textAlign: 'center', marginBottom: 3 },
  tcHalfCertTitle: { fontSize: 14, fontWeight: '900', letterSpacing: 1.8, color: TC_NAVY, textAlign: 'center' },
  tcHalfRefNo: { fontSize: 9, color: TC_CHARCOAL, marginTop: 2, opacity: 0.7 },
  logo: { width: 64, height: 64, resizeMode: 'contain', marginBottom: 8 },
  schoolName: { fontSize: 18, fontWeight: '900', color: '#0F172A', letterSpacing: 0.8, textAlign: 'center' },
  schoolAddr: { fontSize: 11, color: '#64748B', marginTop: 2, textAlign: 'center' },
  affiliation: { fontSize: 10, color: '#94A3B8', fontStyle: 'italic', marginTop: 2, textAlign: 'center' },
  dividerLine: { height: 1.5, width: '80%', marginTop: 16, opacity: 0.3, borderRadius: 1 },
  titleBlock: { alignItems: 'center', paddingVertical: 14, paddingHorizontal: 20 },
  certTitle: { fontSize: 18, fontWeight: '900', letterSpacing: 1.5, textDecorationLine: 'underline', textAlign: 'center' },
  refNo: { fontSize: 11, color: '#94A3B8', marginTop: 4 },
  tcContainer: { paddingHorizontal: 22, paddingBottom: 24 },
  tcHalfContainer: { paddingHorizontal: 16, paddingBottom: 8, zIndex: 1 },
  tcHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  tcHalfHeaderMeta: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  tcHeaderText: { fontSize: 11, fontWeight: '700', color: '#475569' },
  tcHalfHeaderText: { fontSize: 8, fontWeight: '700', color: TC_ROYAL },
  tcList: { gap: 5 },
  tcItem: { fontSize: 11, lineHeight: 18, color: '#1E293B', fontWeight: '500' },
  tcHalfGrid: { flexDirection: 'row' },
  tcHalfCol: { width: '50%', paddingHorizontal: 7, gap: 2, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: 'rgba(23,74,126,0.16)' },
  tcHalfItem: { fontSize: 8.2, lineHeight: 12.5, color: TC_INK, fontWeight: '600' },
  body: { paddingHorizontal: 22, paddingBottom: 16 },
  bodyText: { fontSize: 13.5, lineHeight: 24, color: '#1E293B', textAlign: 'justify' },
  bonafideNote: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  bonafideNoteText: { fontSize: 11, color: '#059669', fontWeight: '600' },
  bold: { fontWeight: '800', color: '#0F172A' },
  footer: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 22, paddingVertical: 20, borderTopWidth: 1, borderTopColor: '#F1F5F9', marginTop: 'auto' },
  tcHalfFooter: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8, borderTopWidth: 1, borderTopColor: 'rgba(213,139,22,0.50)', marginTop: 'auto', zIndex: 1 },
  sigBlock: { alignItems: 'center', gap: 6 },
  sigDate: { fontSize: 11, fontWeight: '600', color: '#475569' },
  tcHalfSigText: { fontSize: 8, fontWeight: '700', color: TC_NAVY },
  sigLine: { width: 90, height: 1, backgroundColor: '#334155' },
  sigLabel: { fontSize: 11, fontWeight: '600', color: '#475569' },
  actions: { flexDirection: 'row', gap: 12 },
  editBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 15, borderRadius: 14, backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB' },
  editBtnText: { fontSize: 14, fontWeight: '700', color: '#374151' },
  printBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 15, borderRadius: 14, backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB' },
  printBtnText: { fontSize: 14, fontWeight: '700', color: '#374151' },
  downloadGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 15, borderRadius: 14 },
  downloadText: { fontSize: 13, fontWeight: '800', color: '#FFF' },
});

function formatAttendanceDays(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return '';
  const n = Number(value);
  if (n < 0) return '';
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(1).replace(/\.0$/, '');
}

/** Map backend attendance summary → TC working-day fields. */
function attendanceFieldsFromSummary(
  summary?: AttendanceSummary | null,
): Pick<TCEditableFields, 'totalWorkingDays' | 'workingDaysPresent'> {
  if (!summary) return { totalWorkingDays: '', workingDaysPresent: '' };
  const total = Number(summary.total ?? 0);
  const present = summary.effective_present != null
    ? Number(summary.effective_present)
    : Number(summary.present || 0)
      + Number(summary.late || 0)
      + 0.5 * Number(summary.half_day || 0);
  // Keep blanks when the school has never marked attendance for this student.
  if (total <= 0 && present <= 0) {
    return { totalWorkingDays: '', workingDaysPresent: '' };
  }
  return {
    totalWorkingDays: formatAttendanceDays(total),
    workingDaysPresent: formatAttendanceDays(present),
  };
}

function toIsoDateOnly(value?: string | null): string | undefined {
  if (!value) return undefined;
  const raw = String(value).trim();
  if (!raw) return undefined;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return undefined;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function todayIsoLocal(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Prefer last/current enrollment session dates; fall back to active academic year. */
async function resolveAttendanceDateRange(
  student: any,
  enrollments: any[],
): Promise<{ from_date?: string; to_date?: string }> {
  const sorted = sortEnrollmentsChronologically(enrollments);
  const enrollment = student?.current_enrollment || sorted[sorted.length - 1] || null;
  const from = toIsoDateOnly(
    enrollment?.academic_year_start_date
      || enrollment?.start_date
      || student?.admission_date,
  );
  const to = toIsoDateOnly(
    enrollment?.academic_year_end_date
      || enrollment?.end_date,
  ) || todayIsoLocal();

  if (from && to) return { from_date: from, to_date: to };

  try {
    const ay = await AcademicYearService.getCurrentYear();
    const ayFrom = toIsoDateOnly(ay?.start_date);
    const ayTo = toIsoDateOnly(ay?.end_date) || todayIsoLocal();
    if (ayFrom && ayTo) return { from_date: ayFrom, to_date: ayTo };
  } catch {
    /* optional — all-time summary is fine */
  }
  return {};
}

function formatAadhaarDisplay(value?: string): string {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length !== 12) return hasOfficialValue(value) ? String(value).trim() : '—';
  return `${digits.slice(0, 4)} ${digits.slice(4, 8)} ${digits.slice(8)}`;
}

function resolveReligionLabel(student: any): string {
  if (student?.religion?.name) return String(student.religion.name);
  if (typeof student?.religion === 'string' && student.religion.trim()) return student.religion.trim();
  if (student?.religion_name) return String(student.religion_name);
  const id = student?.religion_id ?? student?.person?.religion_id;
  if (id != null) {
    const match = RELIGIONS.find(r => r.id === Number(id));
    if (match) return match.name;
  }
  return '';
}

function resolveCategoryLabel(student: any): string {
  if (student?.category?.name) return String(student.category.name);
  if (typeof student?.category === 'string' && student.category.trim()) return student.category.trim();
  if (student?.category_name) return String(student.category_name);
  const id = student?.category_id;
  if (id != null) {
    const match = STUDENT_CATEGORIES.find(c => c.id === Number(id));
    if (match) return match.name;
  }
  return 'General';
}

function parentRelationKey(p: any): string {
  return String(p?.relationship || p?.relation || '').trim().toLowerCase();
}

function resolveParentNames(parents: any[]): { fatherName: string; motherName: string } {
  const list = Array.isArray(parents) ? parents.filter(Boolean) : [];
  const fatherObj = list.find(p => /father/.test(parentRelationKey(p)));
  const motherObj = list.find(p => /mother/.test(parentRelationKey(p)));
  const guardianObj =
    list.find(p => /guardian/.test(parentRelationKey(p)))
    || list.find(p => p?.is_legal_guardian || p?.is_guardian)
    || list.find(p => p?.is_primary_contact || p?.is_primary)
    || list[0];

  const father = fatherObj
    ? parentDisplayName(fatherObj)
    : (guardianObj ? parentDisplayName(guardianObj) : '');
  const mother = motherObj ? parentDisplayName(motherObj) : '';

  return {
    fatherName: father || '—',
    motherName: mother || '—',
  };
}

function mergeParentLists(...lists: any[][]): any[] {
  const out: any[] = [];
  const seen = new Set<string>();
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const p of list) {
      if (!p) continue;
      const key = [
        parentRelationKey(p),
        parentDisplayName(p).toLowerCase(),
        String(p.parent_id || p.id || ''),
      ].join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(p);
    }
  }
  return out;
}

function buildTcItemTexts(studentData: StudentData, tcFields: TCEditableFields) {
  return [
    `1. Name of Pupil : ${studentData.name}`,
    `2. Father's/Guardian Name : ${studentData.fatherName}`,
    `3. Mother's Name : ${studentData.motherName}`,
    `4. Nationality : ${studentData.nationality}`,
    `5. Religion : ${dot(studentData.religion)}`,
    `6. Category / Caste : ${studentData.category}`,
    `7. Date of First Admission in the School with Class : ${studentData.admissionDate}`,
    `8. Date of Birth (In Figures) : ${studentData.dob}\n   (In Words) : ${studentData.dobWords}`,
    `9. Class In Which Pupil Last Studied : ${studentData.class}`,
    `10. School/Board Examination Last Taken with Result : ${dot(tcFields.examResult)}`,
    `11. Whether Qualified for Promotion to Higher Class : ${dot(tcFields.qualifiedPromotion)}\n    (If so, to which class) : ${dot(tcFields.promotionClass)}`,
    `12. Total No. of Working Days : ${dot(tcFields.totalWorkingDays)}`,
    `13. Total No. of Working Days Present : ${dot(tcFields.workingDaysPresent)}`,
    `14. General Conduct : ${dot(tcFields.generalConduct)}`,
  ];
}

type TcFieldRow = { n: string; label: string; value: React.ReactNode; strong?: boolean; compact?: boolean };

function TcSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  children: React.ReactNode;
}) {
  return (
    <View style={tcA4Styles.section}>
      <View style={tcA4Styles.sectionHeader}>
        <Ionicons name={icon} size={13} color={TC_GOLD} />
        <Text style={tcA4Styles.sectionTitle}>{title}</Text>
        <View style={tcA4Styles.sectionGoldRule} />
      </View>
      <View style={tcA4Styles.sectionBody}>{children}</View>
    </View>
  );
}

function TcField({ n, label, value, strong, compact }: TcFieldRow) {
  return (
    <View style={tcA4Styles.fieldRow}>
      <View style={tcA4Styles.fieldNumBadge}>
        <Text style={tcA4Styles.fieldNum}>{n}</Text>
      </View>
      <Text
        style={[tcA4Styles.fieldLabel, compact && tcA4Styles.fieldLabelCompact]}
        numberOfLines={2}
      >
        {label}
      </Text>
      <Text style={tcA4Styles.fieldColon}>:</Text>
      <View style={tcA4Styles.fieldValueWrap}>
        {typeof value === 'string' ? (
          <Text style={[tcA4Styles.fieldValue, strong && tcA4Styles.fieldStrong]}>{value || '—'}</Text>
        ) : (
          value
        )}
      </View>
    </View>
  );
}

function renderTcA4Body(studentData: StudentData, tcFields: TCEditableFields) {
  return (
    <View style={tcA4Styles.bodyStack}>
      <TcSection title="Student Information" icon="person-outline">
        <TcField n="01" label="Name of Pupil" value={studentData.name} strong />
        <TcField n="02" label="Father's / Guardian Name" value={studentData.fatherName} strong />
        <TcField n="03" label="Mother's Name" value={studentData.motherName} strong />
        <View style={tcA4Styles.fieldGrid2}>
          <View style={tcA4Styles.fieldGridCell}>
            <TcField n="04" label="Nationality" value={studentData.nationality} strong compact />
          </View>
          <View style={tcA4Styles.fieldGridCell}>
            <TcField n="05" label="Religion" value={dot(studentData.religion)} strong compact />
          </View>
        </View>
        <TcField n="06" label="Category / Caste" value={studentData.category} strong />
      </TcSection>

      <TcSection title="Admission & Academic Details" icon="school-outline">
        <TcField n="07" label="Date of First Admission in the School with Class" value={studentData.admissionDate} strong />
        <TcField
          n="08"
          label="Date of Birth"
          value={
            <Text style={tcA4Styles.fieldValue}>
              <Text style={tcA4Styles.fieldStrong}>{studentData.dob}</Text>
              <Text style={tcA4Styles.fieldMuted}>{'  ·  In Words: '}</Text>
              <Text style={tcA4Styles.fieldStrong}>{studentData.dobWords}</Text>
            </Text>
          }
        />
        <View style={tcA4Styles.fieldGrid2}>
          <View style={tcA4Styles.fieldGridCell}>
            <TcField n="09" label="Class Last Studied" value={studentData.class} strong compact />
          </View>
          <View style={tcA4Styles.fieldGridCell}>
            <TcField n="10" label="Exam Last Taken with Result" value={dot(tcFields.examResult)} compact />
          </View>
        </View>
        <TcField
          n="11"
          label="Qualified for Promotion to Higher Class"
          value={`${dot(tcFields.qualifiedPromotion)}${tcFields.promotionClass?.trim() ? `  ·  To Class: ${tcFields.promotionClass}` : ''}`}
        />
      </TcSection>

      <TcSection title="Attendance & Conduct" icon="calendar-outline">
        <View style={tcA4Styles.fieldGrid2}>
          <View style={tcA4Styles.fieldGridCell}>
            <TcField n="12" label="Total Working Days" value={dot(tcFields.totalWorkingDays)} compact />
          </View>
          <View style={tcA4Styles.fieldGridCell}>
            <TcField n="13" label="Days Present" value={dot(tcFields.workingDaysPresent)} compact />
          </View>
        </View>
        <TcField n="14" label="General Conduct" value={dot(tcFields.generalConduct)} strong />
      </TcSection>
    </View>
  );
}

/** Premium full-page A4 School Record Sheet / Transfer Certificate. */
export function TcA4Document({
  studentData,
  tcFields,
  school,
  serialNo,
  issueDate,
}: {
  studentData: StudentData;
  tcFields: TCEditableFields;
  school: SchoolProfile;
  serialNo: string;
  issueDate: string;
}) {
  const logoSource = resolveSchoolLogoSource(school);
  const affiliationLine = hasOfficialValue(school.affiliation) ? school.affiliation.trim() : '';
  const recognitionLine = resolveCertificateRecognitionLine(school);
  const showCbse = hasOfficialValue(tcFields.cbseAffiliationNo);
  const showPen = hasOfficialValue(studentData.penNo);
  const showAadhaar = hasOfficialValue(studentData.aadhaarNo) || String(studentData.aadhaarNo || '').replace(/\D/g, '').length === 12;
  const registryItems = [
    showCbse ? { label: 'CBSE Affiliation', value: tcFields.cbseAffiliationNo.trim() } : null,
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <View style={tcA4Styles.leatherFolder}>
      {/* Formal double-frame accents */}
      <View style={tcA4Styles.silkRibbonH} pointerEvents="none" />
      <View style={tcA4Styles.silkRibbonV} pointerEvents="none" />

      <View style={tcA4Styles.goldFoilOuter}>
        <View style={tcA4Styles.goldFoilInner}>
          {/* Ornate gold corner filigree */}
          <View style={[tcA4Styles.filigree, tcA4Styles.filigreeTL]} />
          <View style={[tcA4Styles.filigree, tcA4Styles.filigreeTR]} />
          <View style={[tcA4Styles.filigree, tcA4Styles.filigreeBL]} />
          <View style={[tcA4Styles.filigree, tcA4Styles.filigreeBR]} />
          <View style={[tcA4Styles.filigreeInner, tcA4Styles.filigreeInnerTL]} />
          <View style={[tcA4Styles.filigreeInner, tcA4Styles.filigreeInnerTR]} />
          <View style={[tcA4Styles.filigreeInner, tcA4Styles.filigreeInnerBL]} />
          <View style={[tcA4Styles.filigreeInner, tcA4Styles.filigreeInnerBR]} />

          <View style={tcA4Styles.linenPaper}>
            {/* Subtle crest watermark — behind all content */}
            <View style={tcA4Styles.watermarkWrap} pointerEvents="none" {...webWatermarkProps}>
              <Image source={logoSource} style={tcA4Styles.watermarkImg} />
            </View>

            {/* Letterhead */}
            <View style={tcA4Styles.headerBlock}>
              <View style={tcA4Styles.headerBand}>
                <LinearGradient
                  colors={[TC_MAROON, TC_GOLD_BRIGHT, TC_NAVY]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={tcA4Styles.headerAccentBar}
                />
                <View style={tcA4Styles.headerInner}>
                  <View style={tcA4Styles.logoCrest}>
                    <LinearGradient
                      colors={[TC_GOLD_BRIGHT, TC_GOLD, TC_MAROON]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={tcA4Styles.logoCrestOuter}
                    >
                      <View style={tcA4Styles.logoCrestClip}>
                        <Image source={logoSource} style={tcA4Styles.logoCrestImg} />
                      </View>
                    </LinearGradient>
                  </View>
                  <View style={tcA4Styles.headerIdentity}>
                    <Text style={tcA4Styles.schoolName} numberOfLines={2}>
                      {school.name.toUpperCase()}
                    </Text>
                    <View style={tcA4Styles.schoolNameUnderlineRow}>
                      <View style={tcA4Styles.schoolNameUnderlineSide} />
                      <View style={tcA4Styles.ornamentDiamond} />
                      <View style={tcA4Styles.schoolNameUnderline} />
                      <View style={tcA4Styles.ornamentDiamond} />
                      <View style={tcA4Styles.schoolNameUnderlineSide} />
                    </View>
                    {recognitionLine ? (
                      <Text style={tcA4Styles.recognition}>{recognitionLine}</Text>
                    ) : null}
                    {affiliationLine ? <Text style={tcA4Styles.affiliation}>{affiliationLine}</Text> : null}
                    <Text style={tcA4Styles.address}>{school.address}</Text>
                  </View>
                </View>
              </View>
              <View style={tcA4Styles.letterheadRule}>
                <View style={tcA4Styles.letterheadRuleGold} />
                <View style={tcA4Styles.letterheadRuleNavy} />
                <View style={tcA4Styles.letterheadRuleGoldThin} />
              </View>
            </View>

            {/* Document title */}
            <View style={tcA4Styles.titleBlock}>
              <Text style={tcA4Styles.titleEyebrow}>OFFICIAL ACADEMIC RECORD</Text>
              <LinearGradient
                colors={[TC_NAVY, TC_ROYAL, TC_NAVY]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={tcA4Styles.titleBanner}
              >
                <Text style={tcA4Styles.titleText}>TRANSFER CERTIFICATE</Text>
              </LinearGradient>
              <Text style={tcA4Styles.titleSub}>SCHOOL RECORD SHEET</Text>
            </View>

            {/* Official record identifiers */}
            <View style={tcA4Styles.metaCard}>
              <View style={tcA4Styles.metaGrid}>
                <View style={tcA4Styles.metaItem}>
                  <Text style={tcA4Styles.metaLabel}>Certificate No.</Text>
                  <Text style={tcA4Styles.metaVal}>{serialNo}</Text>
                </View>
                <View style={tcA4Styles.metaItem}>
                  <Text style={tcA4Styles.metaLabel}>Admission No.</Text>
                  <Text style={tcA4Styles.metaVal}>{displayOrDash(studentData.admissionNo)}</Text>
                </View>
                <View style={tcA4Styles.metaItem}>
                  <Text style={tcA4Styles.metaLabel}>PEN</Text>
                  <Text style={tcA4Styles.metaVal}>{showPen ? studentData.penNo : '—'}</Text>
                </View>
                <View style={tcA4Styles.metaItem}>
                  <Text style={tcA4Styles.metaLabel}>Aadhaar No.</Text>
                  <Text style={tcA4Styles.metaVal}>
                    {showAadhaar ? formatAadhaarDisplay(studentData.aadhaarNo) : '—'}
                  </Text>
                </View>
              </View>
              {registryItems.length > 0 ? (
                <View style={tcA4Styles.registryRow}>
                  <Text style={tcA4Styles.registryEyebrow}>INSTITUTION REGISTRY</Text>
                  {registryItems.map(item => (
                    <View key={item.label} style={tcA4Styles.registryItem}>
                      <Text style={tcA4Styles.registryLabel}>{item.label}</Text>
                      <Text style={tcA4Styles.registryValue}>{item.value}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>

            {renderTcA4Body(studentData, tcFields)}

            <View style={tcA4Styles.certificationNote}>
              <Ionicons name="shield-checkmark-outline" size={15} color={TC_GREEN} />
              <Text style={tcA4Styles.certificationText}>
                Certified that the particulars recorded above are true and correct as per the school records.
              </Text>
            </View>

            <View style={tcA4Styles.footer}>
              <View style={[tcA4Styles.sigBlock, tcA4Styles.dateBlock]}>
                <Text style={tcA4Styles.footerEyebrow}>DATE OF ISSUE</Text>
                <Text style={tcA4Styles.sigDate}>{issueDate}</Text>
              </View>
              <View style={tcA4Styles.sigBlock}>
                <View style={tcA4Styles.sigLine} />
                <Text style={tcA4Styles.sigLabel}>Checked By</Text>
              </View>
              <View style={[tcA4Styles.sigBlock, tcA4Styles.signatureBlock]}>
                <View style={tcA4Styles.sigLine} />
                <Text style={tcA4Styles.sigLabel}>Principal / Head Master</Text>
                {school.principal ? <Text style={tcA4Styles.sigSub}>{school.principal}</Text> : null}
              </View>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

const tcA4Styles = StyleSheet.create({
  leatherFolder: {
    flex: 1,
    padding: 9,
    position: 'relative',
    backgroundColor: TC_LEATHER,
  },
  silkRibbonH: {
    position: 'absolute',
    top: 18,
    left: 22,
    right: 22,
    height: 3,
    backgroundColor: TC_GOLD,
    opacity: 0,
    zIndex: 4,
    borderRadius: 1,
  },
  silkRibbonV: {
    position: 'absolute',
    top: 22,
    bottom: 22,
    left: 18,
    width: 3,
    backgroundColor: TC_GOLD_SOFT,
    opacity: 0,
    zIndex: 4,
    borderRadius: 1,
  },
  goldFoilOuter: {
    flex: 1,
    borderWidth: 2,
    borderColor: TC_GOLD_BRIGHT,
    padding: 5,
    backgroundColor: TC_NAVY,
  },
  goldFoilInner: {
    flex: 1,
    borderWidth: 1,
    borderColor: TC_GOLD_SOFT,
    padding: 3,
    position: 'relative',
    backgroundColor: TC_NAVY,
  },
  filigree: {
    position: 'absolute',
    width: 28,
    height: 28,
    zIndex: 5,
    borderColor: TC_GOLD,
  },
  filigreeTL: { top: 4, left: 4, borderTopWidth: 2.5, borderLeftWidth: 2.5 },
  filigreeTR: { top: 4, right: 4, borderTopWidth: 2.5, borderRightWidth: 2.5 },
  filigreeBL: { bottom: 4, left: 4, borderBottomWidth: 2.5, borderLeftWidth: 2.5 },
  filigreeBR: { bottom: 4, right: 4, borderBottomWidth: 2.5, borderRightWidth: 2.5 },
  filigreeInner: {
    position: 'absolute',
    width: 14,
    height: 14,
    zIndex: 5,
    borderColor: TC_GOLD_SOFT,
  },
  filigreeInnerTL: { top: 10, left: 10, borderTopWidth: 1, borderLeftWidth: 1 },
  filigreeInnerTR: { top: 10, right: 10, borderTopWidth: 1, borderRightWidth: 1 },
  filigreeInnerBL: { bottom: 10, left: 10, borderBottomWidth: 1, borderLeftWidth: 1 },
  filigreeInnerBR: { bottom: 10, right: 10, borderBottomWidth: 1, borderRightWidth: 1 },
  linenPaper: {
    flex: 1,
    backgroundColor: TC_PAPER_BG,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 2,
  },
  watermarkWrap: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 0,
  },
  watermarkImg: {
    width: 430,
    height: 430,
    opacity: 0.085,
    resizeMode: 'contain',
  },
  headerBlock: { zIndex: 1, flexShrink: 0 },
  headerBand: {
    backgroundColor: TC_HEADER_BAND,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(213,139,22,0.48)',
    overflow: 'hidden',
  },
  headerAccentBar: {
    height: 6,
  },
  headerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
  },
  logoCrest: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    borderWidth: 1.5,
    borderColor: 'rgba(213,139,22,0.58)',
  },
  logoCrestOuter: {
    width: 90,
    height: 90,
    borderRadius: 45,
    padding: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoCrestClip: {
    width: '100%',
    height: '100%',
    borderRadius: 42,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoCrestImg: {
    width: 82,
    height: 82,
    resizeMode: 'contain',
  },
  headerIdentity: {
    flex: 1,
    alignItems: 'flex-start',
    justifyContent: 'center',
    minWidth: 0,
    paddingRight: 4,
  },
  schoolName: {
    fontSize: 28,
    fontWeight: '900',
    color: TC_MAROON,
    letterSpacing: 1.3,
    textAlign: 'left',
    lineHeight: 32,
    width: '100%',
  },
  schoolNameUnderlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 7,
    marginBottom: 7,
    width: '100%',
  },
  schoolNameUnderlineSide: {
    flex: 1,
    height: 1.25,
    backgroundColor: TC_GOLD_SOFT,
  },
  schoolNameUnderline: {
    width: 56,
    height: 3.5,
    borderRadius: 2,
    backgroundColor: TC_GOLD,
  },
  ornamentDiamond: {
    width: 7,
    height: 7,
    backgroundColor: TC_GOLD,
    transform: [{ rotate: '45deg' }],
  },
  recognition: {
    fontSize: 12,
    fontWeight: '700',
    color: TC_ROYAL,
    textAlign: 'left',
    letterSpacing: 0.35,
    marginBottom: 2,
  },
  affiliation: {
    fontSize: 11.5,
    fontWeight: '700',
    color: TC_MAROON,
    marginTop: 1,
    textAlign: 'left',
    letterSpacing: 0.2,
  },
  address: {
    fontSize: 12,
    fontWeight: '600',
    color: TC_CHARCOAL,
    marginTop: 4,
    textAlign: 'left',
    lineHeight: 16,
    width: '100%',
  },
  letterheadRule: { marginTop: 8, gap: 2 },
  letterheadRuleGold: { height: 2, backgroundColor: TC_GOLD, borderRadius: 1 },
  letterheadRuleNavy: { height: 3, backgroundColor: TC_NAVY, borderRadius: 1 },
  letterheadRuleGoldThin: { height: 1, backgroundColor: TC_GOLD_SOFT },
  titleBlock: {
    zIndex: 1,
    flexShrink: 0,
    alignItems: 'center',
    marginTop: 9,
    marginBottom: 8,
  },
  titleEyebrow: {
    fontSize: 8.5,
    fontWeight: '800',
    color: TC_MAROON,
    letterSpacing: 2.2,
    marginBottom: 5,
  },
  titleBanner: {
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: TC_GOLD_BRIGHT,
    paddingHorizontal: 24,
    paddingVertical: 7,
    minWidth: '80%',
    alignItems: 'center',
  },
  titleText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 3.2,
    textAlign: 'center',
  },
  titleSub: {
    fontSize: 8.5,
    fontWeight: '800',
    color: TC_ROYAL,
    letterSpacing: 2,
    marginTop: 5,
  },
  metaCard: {
    zIndex: 1,
    flexShrink: 0,
    backgroundColor: '#FFF4D6',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(213,139,22,0.42)',
    borderLeftWidth: 3.5,
    borderLeftColor: TC_GOLD,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginBottom: 6,
  },
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  metaItem: {
    width: '23%',
    flexGrow: 1,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(23,74,126,0.15)',
  },
  metaLabel: {
    fontSize: 8.5,
    fontWeight: '800',
    color: TC_MAROON,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  metaVal: {
    fontSize: 13,
    fontWeight: '800',
    color: TC_NAVY,
  },
  registryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 7,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(213,139,22,0.40)',
  },
  registryEyebrow: { fontSize: 8, fontWeight: '800', color: TC_MAROON, letterSpacing: 0.9 },
  registryItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  registryLabel: { fontSize: 9, fontWeight: '600', color: TC_CHARCOAL, opacity: 0.75 },
  registryValue: { fontSize: 11, fontWeight: '800', color: TC_NAVY },
  bodyStack: {
    zIndex: 1,
    flex: 1,
    gap: 8,
    justifyContent: 'space-between',
  },
  section: {
    borderRadius: 7,
    borderWidth: 1,
    borderColor: 'rgba(23,74,126,0.18)',
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.72)',
    flexGrow: 1,
    flexDirection: 'column',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: TC_PLATINUM,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderLeftWidth: 3.5,
    borderLeftColor: TC_GOLD,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(23,74,126,0.14)',
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: TC_NAVY,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  sectionGoldRule: {
    flex: 1,
    height: 1.25,
    backgroundColor: TC_GOLD,
    opacity: 0.55,
    marginLeft: 4,
  },
  sectionBody: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    flexGrow: 1,
    justifyContent: 'space-evenly',
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5.5,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(23,74,126,0.12)',
    gap: 7,
  },
  fieldNumBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(213,139,22,0.78)',
    backgroundColor: '#FFF4D6',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  fieldNum: {
    fontSize: 9,
    fontWeight: '800',
    color: TC_MAROON,
  },
  fieldLabel: {
    width: 236,
    flexShrink: 0,
    fontSize: 12.5,
    fontWeight: '700',
    color: TC_ROYAL,
    letterSpacing: 0.05,
    lineHeight: 16,
  },
  fieldLabelCompact: {
    width: 112,
  },
  fieldColon: {
    fontSize: 13.5,
    fontWeight: '800',
    color: TC_NAVY,
    marginRight: 5,
    flexShrink: 0,
  },
  fieldValueWrap: {
    flex: 1,
    minWidth: 0,
    borderBottomWidth: 1.25,
    borderBottomColor: 'rgba(23,74,126,0.24)',
    paddingBottom: 2,
    minHeight: 20,
    justifyContent: 'center',
  },
  fieldValue: {
    fontSize: 14,
    fontWeight: '800',
    color: TC_CHARCOAL,
    lineHeight: 18,
  },
  fieldStrong: {
    fontWeight: '800',
    color: TC_NAVY,
    fontSize: 14.5,
  },
  fieldMuted: {
    fontSize: 12,
    fontWeight: '500',
    color: TC_CHARCOAL,
    opacity: 0.75,
  },
  fieldGrid2: { flexDirection: 'row', gap: 10 },
  fieldGridCell: { flex: 1 },
  certificationNote: {
    zIndex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F3FAF5',
    borderWidth: 1,
    borderColor: 'rgba(47,107,79,0.34)',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginTop: 8,
  },
  certificationText: {
    flex: 1,
    fontSize: 10.5,
    fontWeight: '600',
    fontStyle: 'italic',
    color: TC_GREEN,
    lineHeight: 14,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: 1.5,
    borderTopColor: 'rgba(213,139,22,0.50)',
    zIndex: 1,
    flexShrink: 0,
  },
  sigBlock: { alignItems: 'center', gap: 5, flex: 1 },
  dateBlock: { alignItems: 'flex-start' },
  signatureBlock: { alignItems: 'flex-end', minHeight: 78, justifyContent: 'flex-end' },
  footerEyebrow: { fontSize: 8.5, fontWeight: '800', color: TC_MAROON, letterSpacing: 1.1 },
  sigDate: { fontSize: 14, fontWeight: '800', color: TC_INK },
  sigLine: { width: 180, height: 1.5, backgroundColor: TC_INK, marginBottom: 6, marginTop: 28 },
  sigLabel: { fontSize: 12.5, fontWeight: '700', color: TC_INK },
  sigSub: { fontSize: 10, fontWeight: '500', color: TC_CHARCOAL, opacity: 0.7 },
});

function renderTcHalfItems(studentData: StudentData, tcFields: TCEditableFields, _today: string) {
  const items = buildTcItemTexts(studentData, tcFields);
  const left = items.slice(0, 9);
  const right = items.slice(9);
  return (
    <View style={cpStyles.tcHalfGrid}>
      <View style={cpStyles.tcHalfCol}>
        {left.map((item, i) => (
          <Text key={`l-${i}`} style={cpStyles.tcHalfItem}>{item}</Text>
        ))}
      </View>
      <View style={cpStyles.tcHalfCol}>
        {right.map((item, i) => (
          <Text key={`r-${i}`} style={cpStyles.tcHalfItem}>{item}</Text>
        ))}
      </View>
    </View>
  );
}

function renderTcSignatures(today: string, compact = false) {
  return (
    <View style={compact ? cpStyles.tcHalfFooter : cpStyles.footer}>
      <View style={cpStyles.sigBlock}>
        <Text style={compact ? cpStyles.tcHalfSigText : cpStyles.sigDate}>Date: {today}</Text>
      </View>
      <View style={cpStyles.sigBlock}>
        <View style={cpStyles.sigLine} />
        <Text style={compact ? cpStyles.tcHalfSigText : cpStyles.sigLabel}>Principal / Head Master</Text>
      </View>
    </View>
  );
}

// ─── Certificate Preview ──────────────────────────────────────────────────────
const CertificatePreview = React.forwardRef<View, {
  studentData: StudentData;
  tcFields: TCEditableFields;
  selectedType: CertificateType;
  serialNo: string;
  school: SchoolProfile;
  tcLayout: TcLayout;
  setTcLayout: (layout: TcLayout) => void;
  bonafideHeaderTheme: BonafideHeaderTheme;
  setBonafideHeaderTheme: (theme: BonafideHeaderTheme) => void;
  onExamResultChange: (value: ExamResultStatus) => void;
  onEdit: () => void;
  onPrint: () => void;
  onDownload: () => void;
}>(function CertificatePreview({
  studentData, tcFields, selectedType, serialNo, school: schoolBase, tcLayout, setTcLayout,
  bonafideHeaderTheme, setBonafideHeaderTheme, onExamResultChange, onEdit, onPrint, onDownload,
}, certificateRef) {
  if (!selectedType) return null;
  const cfg = CERT_CONFIG[selectedType];
  const isTC = selectedType === 'TC';
  const isHalfTc = isTC && tcLayout === 'A4_HALF';
  const examPassed = isExamResultPassed(tcFields.examResult);
  // Geethanjali (17): Bonafide uses Talent School through class 7; TC always High School.
  const school = withCertificateSchoolName(
    schoolBase,
    isTC ? studentData.class : studentData.toClass,
    selectedType,
  );
  const activePaper = getActivePaper(selectedType, tcLayout);
  const downloadLabel = isTC
    ? (tcLayout === 'A4_HALF' ? 'A4 Half' : 'A4')
    : 'Half A4';
  const today = formatDDMMYYYY(new Date());
  const logoSource = resolveSchoolLogoSource(school);
  const affiliationLine = hasOfficialValue(school.affiliation) ? school.affiliation.trim() : '';
  const recognitionLine = resolveCertificateRecognitionLine(school);
  const modernOn = bonafideHeaderTheme === 'modern';

  return (
    <Animated.View entering={FadeInDown.springify().damping(18)} style={cpStyles.wrap}>

      <View style={cpStyles.paperBadgeRow}>
        <View style={cpStyles.paperBadgeLeft}>
          <View style={[cpStyles.paperBadge, { backgroundColor: `${cfg.gradFrom}18` }]}>
            <Ionicons name="document-text-outline" size={12} color={cfg.gradFrom} />
            <Text style={[cpStyles.paperBadgeText, { color: cfg.gradFrom }]}>{activePaper.label}</Text>
          </View>
          {isTC ? (
            <>
              <View style={cpStyles.layoutToggle}>
                <TouchableOpacity
                  style={[cpStyles.layoutPill, tcLayout === 'A4' && cpStyles.layoutPillActive]}
                  onPress={() => setTcLayout('A4')}
                  activeOpacity={0.85}
                >
                  <Text style={[cpStyles.layoutPillText, tcLayout === 'A4' && cpStyles.layoutPillTextActive]}>
                    A4 (210×297)
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[cpStyles.layoutPill, tcLayout === 'A4_HALF' && cpStyles.layoutPillActive]}
                  onPress={() => setTcLayout('A4_HALF')}
                  activeOpacity={0.85}
                >
                  <Text style={[cpStyles.layoutPillText, tcLayout === 'A4_HALF' && cpStyles.layoutPillTextActive]}>
                    A4 Half (Landscape)
                  </Text>
                </TouchableOpacity>
              </View>
              <View style={cpStyles.examResultToggle}>
                <Text style={[cpStyles.examResultLabel, !examPassed && cpStyles.examResultLabelActive]}>
                  Pursuing
                </Text>
                <Switch
                  value={examPassed}
                  onValueChange={(on) => onExamResultChange(on ? 'Passed' : 'Pursuing')}
                  trackColor={{ false: '#CBD5E1', true: '#86EFAC' }}
                  thumbColor={examPassed ? '#059669' : '#FFFFFF'}
                  accessibilityLabel="Exam result"
                  accessibilityState={{ checked: examPassed }}
                />
                <Text style={[cpStyles.examResultLabel, examPassed && cpStyles.examResultLabelActive]}>
                  Passed
                </Text>
              </View>
            </>
          ) : (
            <View style={cpStyles.headerThemeToggle}>
              <Text style={cpStyles.headerThemeLabel}>Legacy</Text>
              <TouchableOpacity
                style={[cpStyles.headerThemeTrack, modernOn && cpStyles.headerThemeTrackOn]}
                onPress={() => setBonafideHeaderTheme(modernOn ? 'legacy' : 'modern')}
                activeOpacity={0.85}
                accessibilityRole="switch"
                accessibilityState={{ checked: modernOn }}
                accessibilityLabel="Modern header"
              >
                <View style={cpStyles.headerThemeThumb} />
              </TouchableOpacity>
              <Text style={[cpStyles.headerThemeLabel, modernOn && cpStyles.headerThemeLabelActive]}>Modern</Text>
            </View>
          )}
        </View>
        <Text style={cpStyles.serialText}>No. {serialNo}</Text>
      </View>

      <View
        ref={certificateRef}
        collapsable={false}
        nativeID="certificate-print-root"
        {...webPrintRootProps}
        style={[
          cpStyles.paper,
          isTC ? (isHalfTc ? cpStyles.tcHalfPaper : cpStyles.tcPaper) : cpStyles.bonafidePaper,
        ]}
      >
        {isTC ? (
          isHalfTc ? (
            <View style={cpStyles.tcHalfFrame}>
              <View style={cpStyles.watermarkWrap} pointerEvents="none" {...webWatermarkProps}>
                <Image source={logoSource} style={cpStyles.watermarkImg} />
              </View>
              <View style={cpStyles.tcHalfHeaderRow}>
                <Image source={logoSource} style={cpStyles.tcHalfLogo} />
                <View style={cpStyles.tcHalfHeaderCenter}>
                  <Text style={cpStyles.tcHalfSchoolName}>{school.name}</Text>
                  {affiliationLine ? (
                    <Text style={cpStyles.tcHalfAffiliation}>{affiliationLine}</Text>
                  ) : null}
                  {recognitionLine ? (
                    <Text style={cpStyles.tcHalfAffiliation}>{recognitionLine}</Text>
                  ) : null}
                </View>
              </View>
              <View style={cpStyles.tcHalfTitleBlock}>
                <Text style={cpStyles.tcHalfEyebrow}>OFFICIAL ACADEMIC RECORD</Text>
                <Text style={cpStyles.tcHalfCertTitle}>TRANSFER CERTIFICATE</Text>
                <Text style={cpStyles.tcHalfRefNo}>Ref No: {serialNo}</Text>
              </View>
              <View style={cpStyles.tcHalfContainer}>
                <View style={cpStyles.tcHalfHeaderMeta}>
                  <Text style={cpStyles.tcHalfHeaderText}>
                    Adm. No. : {studentData.admissionNo || '—'}
                    {hasOfficialValue(studentData.penNo) ? ` · PEN : ${studentData.penNo}` : ''}
                    {' · Aadhaar : '}{formatAadhaarDisplay(studentData.aadhaarNo)}
                  </Text>
                  <Text style={cpStyles.tcHalfHeaderText}>
                    {hasOfficialValue(tcFields.cbseAffiliationNo)
                      ? `CBSE Aff. : ${tcFields.cbseAffiliationNo.trim()}`
                      : ''}
                  </Text>
                </View>
                {renderTcHalfItems(studentData, tcFields, today)}
              </View>
              {renderTcSignatures(today, true)}
            </View>
          ) : (
            <TcA4Document
              studentData={studentData}
              tcFields={tcFields}
              school={school}
              serialNo={serialNo}
              issueDate={today}
            />
          )
        ) : (
          <BonafideDocument
            studentData={studentData}
            school={school}
            issueDate={today}
            headerTheme={bonafideHeaderTheme}
          />
        )}
      </View>

      <View style={cpStyles.actions}>
        <TouchableOpacity style={cpStyles.editBtn} onPress={onEdit} activeOpacity={0.8}>
          <Feather name="edit-2" size={16} color="#6B7280" />
          <Text style={cpStyles.editBtnText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={cpStyles.printBtn} onPress={onPrint} activeOpacity={0.8}>
          <Feather name="printer" size={16} color="#374151" />
          <Text style={cpStyles.printBtnText}>Print</Text>
        </TouchableOpacity>
        <TouchableOpacity style={{ flex: 2, borderRadius: 14, overflow: 'hidden' }} onPress={onDownload} activeOpacity={0.88}>
          <LinearGradient colors={[cfg.gradFrom, cfg.gradTo]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={cpStyles.downloadGrad}>
            <Feather name="download" size={16} color="#FFF" />
            <Text style={cpStyles.downloadText}>Download PDF ({downloadLabel})</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
});

// ─── Step Indicator ───────────────────────────────────────────────────────────
function StepDot({ n, active, done, isDark }: { n: number; active: boolean; done: boolean; isDark: boolean }) {
  const bg = done ? '#10B981' : active ? '#4F46E5' : (isDark ? 'rgba(255,255,255,0.1)' : '#E5E7EB');
  return (
    <View style={{ alignItems: 'center', gap: 4 }}>
      <View style={[sdStyles.dot, { backgroundColor: bg }]}>
        {done
          ? <Ionicons name="checkmark" size={12} color="#fff" />
          : <Text style={[sdStyles.num, { color: active || done ? '#fff' : (isDark ? 'rgba(255,255,255,0.3)' : '#9CA3AF') }]}>{n}</Text>
        }
      </View>
    </View>
  );
}
const SD_LABELS = ['Search', 'Select', 'Preview'];
function StepIndicator({ step, isDark }: { step: number; isDark: boolean }) {
  return (
    <View style={sdStyles.wrap}>
      {[1, 2, 3].map((n, i) => (
        <React.Fragment key={n}>
          <View style={sdStyles.item}>
            <StepDot n={n} active={step === n} done={step > n} isDark={isDark} />
            <Text style={[sdStyles.label, { color: step >= n ? (isDark ? '#F9FAFB' : '#111827') : (isDark ? 'rgba(255,255,255,0.25)' : '#9CA3AF'), fontWeight: step === n ? '800' : '500' }]}>{SD_LABELS[i]}</Text>
          </View>
          {i < 2 && <View style={[sdStyles.line, { backgroundColor: step > n ? '#10B981' : (isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB') }]} />}
        </React.Fragment>
      ))}
    </View>
  );
}
const sdStyles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, paddingHorizontal: 24, gap: 0 },
  item: { alignItems: 'center', gap: 4 },
  dot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  num: { fontSize: 13, fontWeight: '800' },
  label: { fontSize: 11, letterSpacing: 0.3 },
  line: { flex: 1, height: 1.5, marginHorizontal: 6, marginBottom: 16 },
});

// ─── HTML generator for PDF (expo-print) ─────────────────────────────────────
function buildCertificateHTML(
  studentData: StudentData,
  tcFields: TCEditableFields,
  type: CertificateType,
  serialNo: string,
  logoDataUri: string,
  schoolBase: SchoolProfile,
  tcLayout: TcLayout = 'A4',
  bonafideHeaderTheme: BonafideHeaderTheme = 'legacy',
): string {
  if (!type) return '';
  const isTC = type === 'TC';
  const isHalfTc = isTC && tcLayout === 'A4_HALF';
  const isBfLegacy = !isTC && bonafideHeaderTheme === 'legacy';
  // Geethanjali (17): Bonafide uses Talent School through class 7; TC always High School.
  const school = withCertificateSchoolName(
    schoolBase,
    isTC ? studentData.class : studentData.toClass,
    type,
  );
  const today = formatDDMMYYYY(new Date());
  const title = isTC ? 'SCHOOL RECORD SHEET' : 'BONAFIDE & CONDUCT CERTIFICATE';
  const logoImg = logoDataUri
    ? `<img src="${logoDataUri}" alt="School logo" class="header-logo-img" />`
    : '';
  const pronouns = genderPronouns(studentData.genderId);
  const affiliationLine = hasOfficialValue(school.affiliation) ? school.affiliation.trim() : '';
  const recognitionLine = resolveCertificateRecognitionLine(school);
  const escAddr = (school.address || '').replace(/\n/g, '<br/>');
  const escSchoolName = (school.name || '').replace(/</g, '&lt;');
  const showCbse = hasOfficialValue(tcFields.cbseAffiliationNo);
  const showPen = hasOfficialValue(studentData.penNo);
  const aadhaarDisp = formatAadhaarDisplay(studentData.aadhaarNo);
  const registryHtml = [
    showCbse ? `<span><em>CBSE Affiliation</em><strong>${tcFields.cbseAffiliationNo.trim()}</strong></span>` : '',
  ].filter(Boolean).join('');

  const tcItemHtml = (items: string[]) => items.map(item => `<div class="tc-half-item">${item.replace(/\n/g, '<br/>')}</div>`).join('');
  const tcItems = buildTcItemTexts(studentData, tcFields);
  const tcLeftCol = tcItemHtml(tcItems.slice(0, 9));
  const tcRightCol = tcItemHtml(tcItems.slice(9));

  const tcA4Field = (n: string, label: string, value: string, strong = false, compact = false) =>
    `<div class="tc-a4-field">
      <span class="tc-a4-num">${n}</span>
      <span class="tc-a4-field-label${compact ? ' compact' : ''}">${label}</span>
      <span class="tc-a4-field-colon">:</span>
      <span class="tc-a4-field-value${strong ? ' strong' : ''}">${value || '—'}</span>
    </div>`;

  const tcSection = (titleText: string, iconSvg: string, inner: string) =>
    `<div class="tc-a4-section">
      <div class="tc-a4-section-h">${iconSvg}<span>${titleText}</span><i></i></div>
      <div class="tc-a4-section-b">${inner}</div>
    </div>`;

  const iconPerson = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="${TC_GOLD}" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
  const iconSchool = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="${TC_GOLD}" stroke-width="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 2 6 2 9 0v-5"/></svg>`;
  const iconCal = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="${TC_GOLD}" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>`;
  const iconRibbon = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="${TC_GREEN}" stroke-width="2"><circle cx="12" cy="8" r="5"/><path d="M8.21 13.89 7 23l5-3 5 3-1.21-9.12"/></svg>`;

  const tcRowsA4 = `
    ${tcSection('Student Information', iconPerson, `
      ${tcA4Field('01', 'Name of Pupil', studentData.name, true)}
      ${tcA4Field("02", "Father's / Guardian Name", studentData.fatherName, true)}
      ${tcA4Field('03', "Mother's Name", studentData.motherName, true)}
      <div class="tc-a4-grid2">
        ${tcA4Field('04', 'Nationality', studentData.nationality, true, true)}
        ${tcA4Field('05', 'Religion', studentData.religion || '……………', true, true)}
      </div>
      ${tcA4Field('06', 'Category / Caste', studentData.category, true)}
    `)}
    ${tcSection('Admission & Academic Details', iconSchool, `
      ${tcA4Field('07', 'Date of First Admission in the School with Class', studentData.admissionDate, true)}
      ${tcA4Field('08', 'Date of Birth', `<strong>${studentData.dob}</strong> &nbsp;·&nbsp; In Words: <strong>${studentData.dobWords}</strong>`)}
      <div class="tc-a4-grid2">
        ${tcA4Field('09', 'Class Last Studied', studentData.class, true, true)}
        ${tcA4Field('10', 'Exam Last Taken with Result', tcFields.examResult || '……………', false, true)}
      </div>
      ${tcA4Field('11', 'Qualified for Promotion to Higher Class', `${tcFields.qualifiedPromotion || '……………'}${tcFields.promotionClass?.trim() ? ` &nbsp;·&nbsp; To Class: ${tcFields.promotionClass}` : ''}`)}
    `)}
    ${tcSection('Attendance & Conduct', iconCal, `
      <div class="tc-a4-grid2">
        ${tcA4Field('12', 'Total Working Days', tcFields.totalWorkingDays || '……………', false, true)}
        ${tcA4Field('13', 'Days Present', tcFields.workingDaysPresent || '……………', false, true)}
      </div>
      ${tcA4Field('14', 'General Conduct', tcFields.generalConduct || '……………', true)}
    `)}`;

  const tcRowsHalf = `
    <div class="tc-half-header">
      ${logoImg}
      <div class="tc-half-header-center">
        <div class="tc-half-school-name">${school.name}</div>
        ${affiliationLine ? `<div class="tc-half-affiliation">${affiliationLine}</div>` : ''}
        ${recognitionLine ? `<div class="tc-half-affiliation">${recognitionLine}</div>` : ''}
      </div>
    </div>
    <div class="tc-half-title-block">
      <div class="tc-half-eyebrow">OFFICIAL ACADEMIC RECORD</div>
      <div class="tc-half-cert-title">TRANSFER CERTIFICATE</div>
      <div class="tc-half-ref-no">Ref No: ${serialNo}</div>
    </div>
    <div class="tc-half-meta">
      <span>Adm. No. : ${studentData.admissionNo || '—'}${showPen ? ` · PEN : ${studentData.penNo}` : ''} · Aadhaar : ${aadhaarDisp}</span>
      <span>${showCbse ? `CBSE Aff. : ${tcFields.cbseAffiliationNo.trim()}` : ''}</span>
    </div>
    <div class="tc-grid">
      <div class="tc-col">${tcLeftCol}</div>
      <div class="tc-col">${tcRightCol}</div>
    </div>`;

  const bonafideSharedBody = `
      <div class="bf-meta">
        <span>Admission No. <u>${line(studentData.admissionNo)}</u></span>
        <span>Date <u>${line(today)}</u></span>
      </div>
      <div class="bf-body">
        <p class="bf-line">This is to certify that ${studentData.genderLabel} <strong>${line(studentData.name)}</strong></p>
        <p class="bf-line">S/o. D/o. Shri/Smt. <strong>${line(studentData.parentName)}</strong> ${studentData.isFormerStudent ? 'was' : 'is'} a Bonafide student of this Institution.</p>
        <p class="bf-line">${pronouns.subject} ${studentData.isFormerStudent ? 'studied' : 'is Studying'} from Class <strong>${line(studentData.fromClass)}</strong> Year <strong>${line(studentData.fromYear)}</strong> to Class <strong>${line(studentData.toClass)}</strong> Year <strong>${line(studentData.toYear)}</strong> during ${pronouns.possessive} study period. ${pronouns.possessive.charAt(0).toUpperCase() + pronouns.possessive.slice(1)} Character is found Good.</p>
        <p class="bf-line bf-line-dob">${pronouns.possessive.charAt(0).toUpperCase() + pronouns.possessive.slice(1)} date of birth according to School Admission register is <strong>${line(studentData.dob)}</strong></p>
        <p class="bf-dob-words">${line(studentData.dobWords)}</p>
      </div>
      <div class="bf-footer">
        <span>PEN No. <strong>${line(studentData.penNo)}</strong></span>
        <span>${school.principal}</span>
      </div>`;

  const bonafideHeaderLegacy = `
      <div class="bf-header">
        ${logoImg}
        <div class="bf-header-center">
          <div class="bf-school-name">${school.name.toUpperCase()}</div>
          ${recognitionLine ? `<div class="bf-school-recognition">${recognitionLine}</div>` : ''}
          <div class="bf-school-addr">${escAddr}</div>
        </div>
      </div>
      <div class="bf-title-box">${title}</div>`;

  const bonafideHeaderModern = `
      <div class="bfm-header-band">
        <div class="bfm-header">
          ${logoImg}
          <div class="bfm-header-center">
            <div class="bfm-school-name">${school.name.toUpperCase()}</div>
            ${recognitionLine ? `<div class="bfm-school-recognition">${recognitionLine}</div>` : ''}
            <div class="bfm-school-addr">${escAddr}</div>
            <div class="bfm-name-underline"></div>
          </div>
        </div>
      </div>
      <div class="bfm-title-wrap">
        <div class="bfm-title-rule"></div>
        <div class="bfm-title-box">${title}</div>
        <div class="bfm-title-rule"></div>
      </div>`;

  const bonafideBody = `
    <div class="bf-outer"><div class="bf-inner">
      ${isBfLegacy ? bonafideHeaderLegacy : bonafideHeaderModern}
      ${bonafideSharedBody}
    </div></div>`;

  // Full TC prints on A4 portrait; half TC / Bonafide use half-A4 landscape.
  const pageSize = isTC
    ? (isHalfTc
      ? '@page { size: 210mm 148.5mm landscape; margin: 0; }'
      : '@page { size: A4 portrait; margin: 0; }')
    : '@page { size: 210mm 148.5mm landscape; margin: 0; }';

  const rootWidth = isTC ? (isHalfTc ? '210mm' : '210mm') : '210mm';
  const rootHeight = isTC ? (isHalfTc ? '148.5mm' : '297mm') : '148.5mm';

  const tcA4Block = `
      <div class="tc-a4-leather">
        <div class="tc-a4-ribbon-h"></div>
        <div class="tc-a4-ribbon-v"></div>
        <div class="tc-a4-foil-outer">
          <div class="tc-a4-foil-inner">
            <div class="tc-a4-filigree tl"></div><div class="tc-a4-filigree tr"></div>
            <div class="tc-a4-filigree bl"></div><div class="tc-a4-filigree br"></div>
            <div class="tc-a4-filigree-i tl"></div><div class="tc-a4-filigree-i tr"></div>
            <div class="tc-a4-filigree-i bl"></div><div class="tc-a4-filigree-i br"></div>
            <div class="tc-a4-linen">
              ${logoDataUri ? `<div class="tc-a4-watermark"><img src="${logoDataUri}" alt="" /></div>` : ''}
              <div class="tc-a4-header-band">
                <div class="tc-a4-header-accent"></div>
                <div class="tc-a4-header">
                  <div class="tc-a4-logo-crest"><div class="tc-a4-logo-outer"><div class="tc-a4-logo-clip">${logoImg}</div></div></div>
                  <div class="tc-a4-header-identity">
                    <div class="tc-a4-school-name">${escSchoolName.toUpperCase()}</div>
                    <div class="tc-a4-school-underline-row"><i></i><span></span><b></b><span></span><i></i></div>
                    ${recognitionLine ? `<div class="tc-a4-recognition">${recognitionLine}</div>` : ''}
                    ${affiliationLine ? `<div class="tc-a4-affiliation">${affiliationLine}</div>` : ''}
                    <div class="tc-a4-addr">${escAddr}</div>
                  </div>
                </div>
              </div>
              <div class="tc-a4-letterhead-rule"><i></i><b></b><em></em></div>
              <div class="tc-a4-title-block">
                <div class="tc-a4-title-eyebrow">OFFICIAL ACADEMIC RECORD</div>
                <div class="tc-a4-title-box">TRANSFER CERTIFICATE</div>
                <div class="tc-a4-title-sub">SCHOOL RECORD SHEET</div>
              </div>
              <div class="tc-a4-meta-card">
                <div class="tc-a4-meta-grid">
                  <div class="tc-a4-meta-item"><em>Certificate No.</em><strong>${serialNo}</strong></div>
                  <div class="tc-a4-meta-item"><em>Admission No.</em><strong>${studentData.admissionNo || '—'}</strong></div>
                  <div class="tc-a4-meta-item"><em>PEN</em><strong>${showPen ? studentData.penNo : '—'}</strong></div>
                  <div class="tc-a4-meta-item"><em>Aadhaar No.</em><strong>${aadhaarDisp}</strong></div>
                </div>
                ${registryHtml ? `<div class="tc-a4-registry"><label>INSTITUTION REGISTRY</label>${registryHtml}</div>` : ''}
              </div>
              <div class="tc-a4-list">${tcRowsA4}</div>
              <div class="tc-a4-certification">${iconRibbon}<span>Certified that the particulars recorded above are true and correct as per the school records.</span></div>
              <div class="tc-a4-footer">
                <div class="tc-a4-sig tc-a4-date-block">
                  <em>DATE OF ISSUE</em>
                  <strong>${today}</strong>
                </div>
                <div class="tc-a4-sig tc-a4-signature-block">
                  <div class="tc-a4-sig-line"></div>
                  <div>Checked By</div>
                </div>
                <div class="tc-a4-sig tc-a4-signature-block">
                  <div class="tc-a4-sig-line"></div>
                  <div>Principal / Head Master</div>
                  ${school.principal ? `<div class="tc-a4-sig-sub">${school.principal}</div>` : ''}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>`;

  const tcHalfBlock = `
      <div class="tc-half-frame">
        ${logoDataUri ? `<div class="tc-half-watermark"><img src="${logoDataUri}" alt="" /></div>` : ''}
        ${tcRowsHalf}
        <div class="footer footer-compact">
          <div><div>Date: ${today}</div></div>
          <div><div class="sig-line"></div><div>Principal / Head Master</div></div>
        </div>
      </div>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Montserrat:wght@600;700;800&display=swap" rel="stylesheet"/>
  <style>
    ${pageSize}
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body { width: 100%; height: 100%; }
    body { font-family: 'Inter', 'Lato', 'Segoe UI', Arial, sans-serif; margin: 0; padding: 0; position: relative; background: ${isTC && !isHalfTc ? 'transparent' : '#FFFFFF'}; }
    .certificate-print-root {
      position: relative;
      background: ${isTC && !isHalfTc ? 'transparent' : '#FFFFFF'};
      width: ${rootWidth};
      height: ${rootHeight};
      min-height: ${rootHeight};
      overflow: hidden;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .certificate-watermark {
      position: fixed;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      z-index: 0;
      pointer-events: none;
      opacity: 0.05;
    }
    .certificate-watermark img {
      width: 280px; height: 280px;
      object-fit: contain;
      opacity: 0.05;
    }
    .page-content { position: relative; z-index: 1; height: 100%; }
    .header-logo-img { width: 64px; height: 64px; object-fit: contain; margin-bottom: 0; }

    /* ── Premium A4 Transfer Certificate ──────────────────────────────── */
    .tc-a4-leather {
      margin: 0; padding: 3.2mm; height: 297mm;
      background: ${TC_LEATHER};
      position: relative; box-sizing: border-box;
    }
    .tc-a4-ribbon-h {
      display: none;
    }
    .tc-a4-ribbon-v {
      display: none;
    }
    .tc-a4-foil-outer {
      border: 2px solid ${TC_GOLD_BRIGHT}; padding: 5px;
      background: ${TC_NAVY}; height: calc(297mm - 6.4mm);
    }
    .tc-a4-foil-inner {
      border: 1px solid ${TC_GOLD_SOFT}; padding: 3px;
      background: ${TC_NAVY}; height: 100%; position: relative;
    }
    .tc-a4-filigree {
      position: absolute; width: 28px; height: 28px; z-index: 5; border-color: ${TC_GOLD};
    }
    .tc-a4-filigree.tl { top: 4px; left: 4px; border-width: 2.5px 0 0 2.5px; }
    .tc-a4-filigree.tr { top: 4px; right: 4px; border-width: 2.5px 2.5px 0 0; }
    .tc-a4-filigree.bl { bottom: 4px; left: 4px; border-width: 0 0 2.5px 2.5px; }
    .tc-a4-filigree.br { bottom: 4px; right: 4px; border-width: 0 2.5px 2.5px 0; }
    .tc-a4-filigree-i {
      position: absolute; width: 14px; height: 14px; z-index: 5; border-color: ${TC_GOLD_SOFT};
    }
    .tc-a4-filigree-i.tl { top: 10px; left: 10px; border-width: 1px 0 0 1px; }
    .tc-a4-filigree-i.tr { top: 10px; right: 10px; border-width: 1px 1px 0 0; }
    .tc-a4-filigree-i.bl { bottom: 10px; left: 10px; border-width: 0 0 1px 1px; }
    .tc-a4-filigree-i.br { bottom: 10px; right: 10px; border-width: 0 1px 1px 0; }
    .tc-a4-linen {
      background: ${TC_PAPER_BG}; height: 100%;
      padding: 4mm 5mm 3.5mm; position: relative;
      display: flex; flex-direction: column; overflow: hidden;
    }
    .tc-a4-watermark {
      position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
      pointer-events: none; z-index: 0;
    }
    .tc-a4-watermark img { width: 430px; height: 430px; object-fit: contain; opacity: 0.085; }
    .tc-a4-linen > *:not(.tc-a4-watermark) { position: relative; z-index: 1; }
    .tc-a4-header-band {
      background: ${TC_HEADER_BAND};
      border: 1px solid rgba(213,139,22,0.48);
      border-radius: 8px; overflow: hidden;
    }
    .tc-a4-header-accent {
      height: 6px;
      background: linear-gradient(90deg, ${TC_MAROON}, ${TC_GOLD_BRIGHT}, ${TC_NAVY});
    }
    .tc-a4-header { display: flex; align-items: center; gap: 16px; padding: 10px 14px; }
    .tc-a4-logo-crest {
      width: 100px; height: 100px; border-radius: 50%;
      background: transparent; border: 1.5px solid rgba(213,139,22,0.58);
      display: flex; align-items: center; justify-content: center; flex: 0 0 100px;
    }
    .tc-a4-logo-outer {
      width: 90px; height: 90px; border-radius: 50%; padding: 3px;
      background: linear-gradient(135deg, ${TC_GOLD_BRIGHT}, ${TC_GOLD}, ${TC_MAROON});
      display: flex; align-items: center; justify-content: center;
    }
    .tc-a4-logo-clip {
      width: 100%; height: 100%; border-radius: 50%; overflow: hidden;
      background: #FFFFFF; display: flex; align-items: center; justify-content: center;
    }
    .tc-a4-logo-clip .header-logo-img { width: 82px; height: 82px; object-fit: contain; display: block; }
    .tc-a4-header-identity { flex: 1; min-width: 0; text-align: left; }
    .tc-a4-school-name {
      font-family: 'Montserrat', 'Georgia', serif;
      font-size: 28px; font-weight: 800; color: ${TC_MAROON};
      letter-spacing: 1.3px; line-height: 1.12;
    }
    .tc-a4-school-underline-row { display: flex; align-items: center; gap: 5px; margin: 7px 0; }
    .tc-a4-school-underline-row i { display: block; flex: 1; height: 1.25px; background: ${TC_GOLD_SOFT}; font-style: normal; }
    .tc-a4-school-underline-row b { display: block; width: 56px; height: 3.5px; border-radius: 2px; background: ${TC_GOLD}; font-weight: normal; }
    .tc-a4-school-underline-row span { display: block; width: 7px; height: 7px; background: ${TC_GOLD}; transform: rotate(45deg); }
    .tc-a4-recognition { font-size: 12px; font-weight: 700; color: ${TC_ROYAL}; letter-spacing: 0.35px; margin-bottom: 2px; }
    .tc-a4-affiliation { font-size: 11.5px; font-weight: 700; color: ${TC_MAROON}; margin-top: 1px; letter-spacing: 0.2px; }
    .tc-a4-addr { font-size: 12px; font-weight: 600; color: ${TC_CHARCOAL}; margin-top: 4px; white-space: pre-line; line-height: 1.35; }
    .tc-a4-letterhead-rule { margin: 8px 0 0; }
    .tc-a4-letterhead-rule i { display: block; height: 2px; background: ${TC_GOLD}; border-radius: 1px; font-style: normal; }
    .tc-a4-letterhead-rule b { display: block; height: 3px; background: ${TC_NAVY}; border-radius: 1px; margin-top: 2px; font-weight: normal; }
    .tc-a4-letterhead-rule em { display: block; height: 1px; background: ${TC_GOLD_SOFT}; margin-top: 2px; font-style: normal; }
    .tc-a4-title-block { text-align: center; margin: 8px 0 7px; }
    .tc-a4-title-eyebrow { color: ${TC_MAROON}; font-size: 8.5px; font-weight: 800; letter-spacing: 2.2px; margin-bottom: 4px; }
    .tc-a4-title-box {
      display: inline-block; font-family: 'Montserrat', sans-serif;
      font-size: 17px; font-weight: 800; color: #FFFFFF; letter-spacing: 3.2px; white-space: nowrap;
      background: linear-gradient(90deg, ${TC_NAVY}, ${TC_ROYAL}, ${TC_NAVY});
      border: 1.5px solid ${TC_GOLD_BRIGHT}; border-radius: 4px; padding: 7px 24px; min-width: 80%;
    }
    .tc-a4-title-sub { color: ${TC_ROYAL}; font-size: 8.5px; font-weight: 800; letter-spacing: 2px; margin-top: 4px; }
    .tc-a4-meta-card {
      background: #FFF4D6; border: 1px solid rgba(213,139,22,0.42);
      border-left: 3.5px solid ${TC_GOLD}; border-radius: 8px; padding: 7px 10px; margin-bottom: 7px;
    }
    .tc-a4-meta-grid { display: flex; flex-wrap: wrap; gap: 6px; }
    .tc-a4-meta-item {
      width: 23%; flex-grow: 1; padding: 6px 8px; box-sizing: border-box;
      border-radius: 7px; background: #FFFFFF; border: 1px solid rgba(23,74,126,0.15);
    }
    .tc-a4-meta-item em {
      display: block; font-style: normal; font-size: 8.5px; font-weight: 800;
      color: ${TC_MAROON}; letter-spacing: 0.4px; text-transform: uppercase; margin-bottom: 2px;
    }
    .tc-a4-meta-item strong { font-weight: 800; color: ${TC_NAVY}; font-size: 13px; }
    .tc-a4-registry {
      display: flex; align-items: center; gap: 12px; margin-top: 7px; padding-top: 6px;
      border-top: 0.5px solid rgba(213,139,22,0.40);
    }
    .tc-a4-registry label { font-size: 8px; font-weight: 800; color: ${TC_MAROON}; letter-spacing: 0.9px; }
    .tc-a4-registry span { display: flex; align-items: center; gap: 5px; }
    .tc-a4-registry em { font-size: 9px; font-style: normal; color: ${TC_CHARCOAL}; opacity: 0.75; }
    .tc-a4-registry strong { font-size: 11px; font-weight: 800; color: ${TC_NAVY}; }
    .tc-a4-list { flex: 1; display: flex; flex-direction: column; justify-content: space-between; gap: 7px; }
    .tc-a4-section {
      border: 1px solid rgba(23,74,126,0.18); border-radius: 7px; overflow: hidden;
      background: rgba(255,255,255,0.72); flex-grow: 1; display: flex; flex-direction: column;
    }
    .tc-a4-section-h {
      display: flex; align-items: center; gap: 6px; background: ${TC_PLATINUM}; padding: 5px 10px;
      border-left: 3.5px solid ${TC_GOLD}; border-bottom: 0.5px solid rgba(23,74,126,0.14);
      font-family: 'Montserrat', sans-serif; font-size: 11px; font-weight: 800; color: ${TC_NAVY};
      letter-spacing: 1px; text-transform: uppercase;
    }
    .tc-a4-section-h i { flex: 1; height: 1.25px; background: ${TC_GOLD}; opacity: 0.55; font-style: normal; }
    .tc-a4-section-b { padding: 4px 10px; flex-grow: 1; display: flex; flex-direction: column; justify-content: space-evenly; }
    .tc-a4-grid2 { display: flex; gap: 10px; }
    .tc-a4-grid2 .tc-a4-field { flex: 1; }
    .tc-a4-field { display: flex; gap: 7px; align-items: center; padding: 5.5px 0; border-bottom: 0.5px solid rgba(23,74,126,0.12); }
    .tc-a4-num {
      width: 24px; height: 24px; flex-shrink: 0; border-radius: 50%;
      border: 1px solid rgba(213,139,22,0.78); background: #FFF4D6;
      display: inline-flex; align-items: center; justify-content: center;
      font-size: 9px; font-weight: 800; color: ${TC_MAROON};
    }
    .tc-a4-field-label { width: 236px; flex-shrink: 0; font-size: 12.5px; font-weight: 700; color: ${TC_ROYAL}; letter-spacing: 0.05px; line-height: 1.3; }
    .tc-a4-field-label.compact { width: 112px; }
    .tc-a4-field-colon { flex-shrink: 0; font-size: 13.5px; font-weight: 800; color: ${TC_NAVY}; margin-right: 5px; }
    .tc-a4-field-value {
      flex: 1; min-width: 0; font-size: 14px; font-weight: 800; color: ${TC_CHARCOAL}; line-height: 1.3;
      border-bottom: 1.25px solid rgba(23,74,126,0.24); padding-bottom: 2px; min-height: 20px;
    }
    .tc-a4-field-value.strong, .tc-a4-field-value strong { font-weight: 800; color: ${TC_NAVY}; font-size: 14.5px; }
    .tc-a4-certification {
      display: flex; align-items: center; gap: 8px; margin-top: 7px; padding: 7px 10px;
      background: #F3FAF5; border: 1px solid rgba(47,107,79,0.34); border-radius: 6px;
      color: ${TC_GREEN}; font-size: 10.5px; font-weight: 600; font-style: italic; line-height: 1.35;
    }
    .tc-a4-certification svg { flex: 0 0 auto; }
    .tc-a4-footer {
      display: flex; justify-content: space-between; align-items: flex-end;
      margin-top: 7px; padding-top: 8px; border-top: 1.5px solid rgba(213,139,22,0.50);
      font-size: 12.5px; font-weight: 700; color: ${TC_INK};
    }
    .tc-a4-sig { text-align: center; flex: 1; }
    .tc-a4-date-block { text-align: left; }
    .tc-a4-date-block em { display: block; font-size: 8.5px; font-style: normal; font-weight: 800; color: ${TC_MAROON}; letter-spacing: 1.1px; margin-bottom: 4px; }
    .tc-a4-date-block strong { font-size: 14px; color: ${TC_INK}; }
    .tc-a4-sig-line { border-bottom: 1.5px solid ${TC_INK}; width: 145px; margin: 24px auto 6px; }
    .tc-a4-sig-sub { font-size: 10px; font-weight: 500; color: ${TC_CHARCOAL}; opacity: 0.7; margin-top: 2px; }
    .tc-a4-signature-block { text-align: center; min-height: 66px; }

    .tc-half-frame {
      margin: 2mm; height: calc(148.5mm - 4mm); border: 2px solid ${TC_GOLD_BRIGHT};
      background: ${TC_PAPER_BG}; display: flex; flex-direction: column; overflow: hidden;
      box-shadow: 0 0 0 2mm ${TC_MAROON}; position: relative;
    }
    .tc-half-watermark {
      position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
      pointer-events: none; z-index: 0;
    }
    .tc-half-watermark img { width: 300px; height: 300px; object-fit: contain; opacity: 0.075; }
    .tc-half-frame > *:not(.tc-half-watermark) { position: relative; z-index: 1; }
    .tc-half-header { display: flex; align-items: center; gap: 12px; padding: 9px 18px 7px; background: ${TC_HEADER_BAND}; border-bottom: 2px solid ${TC_GOLD}; }
    .tc-half-header .header-logo-img { width: 54px; height: 54px; margin-bottom: 0; }
    .tc-half-header-center { flex: 1; text-align: center; }
    .tc-half-school-name { font-size: 18px; font-weight: 800; color: ${TC_NAVY}; letter-spacing: 0.9px; }
    .tc-half-affiliation { font-size: 9px; color: ${TC_ROYAL}; font-style: italic; margin-top: 2px; }
    .tc-half-title-block { text-align: center; padding: 5px 14px 6px; }
    .tc-half-eyebrow { font-size: 7px; font-weight: 800; color: ${TC_MAROON}; letter-spacing: 1.8px; margin-bottom: 2px; }
    .tc-half-cert-title { font-size: 14px; font-weight: 800; color: ${TC_NAVY}; letter-spacing: 1.8px; }
    .tc-half-ref-no { font-size: 9px; color: ${TC_CHARCOAL}; margin-top: 2px; }
    .tc-half-meta { display: flex; justify-content: space-between; font-size: 8px; font-weight: 700; color: ${TC_ROYAL}; padding: 0 16px 5px; }
    .tc-grid { display: flex; padding: 0 10px; flex: 1; }
    .tc-col { width: 50%; padding: 0 7px; border-left: 0.5px solid rgba(23,74,126,0.16); }
    .tc-col:first-child { border-left: 0; }
    .tc-half-item { font-size: 8.2px; line-height: 12.5px; color: ${TC_INK}; font-weight: 600; margin-bottom: 2px; }
    .footer { display: flex; justify-content: space-between; padding: 16px 22px; border-top: 1px solid #F1F5F9; font-size: 11px; color: #475569; }
    .footer-compact { padding: 6px 16px; font-size: 8px; color: ${TC_NAVY}; font-weight: 700; border-top-color: rgba(213,139,22,0.50); }
    .sig-line { border-bottom: 1px solid ${TC_NAVY}; width: 90px; margin-bottom: 4px; }
    .stamp-box { border: 1.5px dashed #CBD5E1; width: 70px; height: 40px; display: flex; align-items: center; justify-content: center; font-size: 8px; color: #94A3B8; font-weight: 700; letter-spacing: 0.5px; }
    .stamp-box-compact { width: 52px; height: 28px; font-size: 7px; }

    /* ── Bonafide: HALF-A4 landscape, content fills the full sheet ───────── */
    .bf-outer {
      margin: 8mm;
      border: 2px solid ${BONAFIDE_BLUE};
      padding: 6px;
      height: calc(148.5mm - 16mm);
      background: #FFFFFF;
    }
    .bf-inner {
      border: 1.5px solid ${BONAFIDE_BLUE};
      padding: 8mm 12mm;
      height: 100%;
      position: relative;
      background: #FFFFFF;
      display: flex;
      flex-direction: column;
    }
    .bf-header { display: flex; align-items: flex-start; gap: 14px; padding-top: 15px; margin-bottom: 20px; }
    .bf-header-center { flex: 1; text-align: center; }
    .bf-header .header-logo-img { width: 140px; height: 140px; object-fit: contain; margin-bottom: 0; }
    .bf-school-name { font-size: 30px; font-weight: 900; color: ${BONAFIDE_BLUE}; letter-spacing: 0.8px; line-height: 1.15; }
    .bf-school-recognition { font-size: 13px; color: ${BONAFIDE_BLUE}; margin-top: 4px; font-weight: 700; }
    .bf-school-addr { font-size: 14px; color: ${BONAFIDE_BLUE}; margin-top: 5px; font-weight: 600; white-space: pre-line; line-height: 1.45; }
    .bf-title-box { text-align: center; border: 1.5px solid ${BONAFIDE_BLUE}; border-radius: 4px; padding: 6px 18px; margin: -70px auto 40px; width: fit-content; font-size: 19px; font-weight: 800; color: ${BONAFIDE_BLUE}; letter-spacing: 0.8px; }
    .bf-meta { display: flex; justify-content: space-between; font-size: 17px; color: ${BONAFIDE_BLUE}; font-weight: 600; margin: 8px 0 12px; }
    .bf-meta u { font-size: 19px; font-weight: 800; }
    .bf-body { }
    .bf-line { font-size: 19px; line-height: 32px; color: ${BONAFIDE_BLUE}; margin: 0 0 10px; font-weight: 500; }
    .bf-line strong { font-size: 21px; font-weight: 800; }
    .bf-line-dob { margin-top: 14px; }
    .bf-dob-words { font-size: 18px; color: ${BONAFIDE_BLUE}; font-weight: 700; text-decoration: underline; margin: 5px 0 12px; }
    .bf-footer { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 24px; padding-top: 8px; font-size: 17px; color: ${BONAFIDE_BLUE}; font-weight: 600; }
    .bf-footer strong { font-size: 19px; font-weight: 800; }

    /* ── Bonafide modern header only (same frame/body as legacy) ─────────── */
    .bfm-header-band {
      margin: -4px -6px 6px;
      padding: 10px 8px 12px;
      background: #F4F7FB;
      border-bottom: 2px solid ${BONAFIDE_BLUE};
    }
    .bfm-header { display: flex; align-items: center; gap: 14px; }
    .bfm-header .header-logo-img { width: 110px; height: 110px; object-fit: contain; margin: 0; }
    .bfm-header-center { flex: 1; text-align: center; }
    .bfm-school-name { font-size: 28px; font-weight: 900; color: ${BONAFIDE_BLUE}; letter-spacing: 1.4px; line-height: 1.2; }
    .bfm-school-recognition { font-size: 12px; color: ${BONAFIDE_BLUE}; margin-top: 3px; font-weight: 700; opacity: 0.85; }
    .bfm-school-addr { font-size: 13px; color: ${BONAFIDE_BLUE}; margin-top: 4px; font-weight: 600; white-space: pre-line; line-height: 1.4; opacity: 0.9; }
    .bfm-name-underline { width: 64px; height: 3px; border-radius: 2px; background: ${BONAFIDE_BLUE}; opacity: 0.35; margin: 8px auto 0; }
    .bfm-title-wrap { display: flex; align-items: center; gap: 12px; margin: 4px 0 22px; }
    .bfm-title-rule { flex: 1; height: 1.5px; background: ${BONAFIDE_BLUE}; opacity: 0.35; }
    .bfm-title-box {
      border: 1.5px solid ${BONAFIDE_BLUE};
      background: #EEF3FB;
      border-radius: 6px;
      padding: 7px 18px;
      font-size: 16px; font-weight: 800; color: ${BONAFIDE_BLUE}; letter-spacing: 1px; white-space: nowrap;
    }
  </style></head><body>
  <div class="certificate-print-root">
    ${logoDataUri ? `<div class="certificate-watermark"><img src="${logoDataUri}" alt="" /></div>` : ''}
    <div class="page-content">
      ${isTC ? (isHalfTc ? tcHalfBlock : tcA4Block) : bonafideBody}
    </div>
  </div>
</body></html>`;
}

function parentDisplayName(p: any): string {
  if (p?.display_name?.trim()) return p.display_name.trim();
  return `${p?.first_name || ''} ${p?.last_name || ''}`.trim();
}

/**
 * The Bonafide's "S/o. D/o. Shri/Smt." line renders `parentName`. It prefers the
 * father, falling back to the mother, then a generic guardian. Kept as a shared
 * helper so an edit of the father/mother name re-derives it (see handleEditSave).
 */
function computeParentName(fatherName?: string, motherName?: string): string {
  const father = fatherName?.trim();
  if (hasOfficialValue(father) && father !== 'Guardian') return father!;
  const mother = motherName?.trim();
  if (hasOfficialValue(mother)) return mother!;
  return 'Guardian';
}

function studentRecordName(student: Student): string {
  return student.display_name || `${student.first_name || ''} ${student.last_name || ''}`.trim() || 'Student';
}

function studentRecordClass(student: Student): string {
  const enrollment = student.current_enrollment;
  const cls = enrollment?.class_name || enrollment?.class_code || '—';
  const sec = enrollment?.section_name;
  return sec ? `${cls} – ${sec}` : cls;
}

function dateSortKey(value?: string): number | null {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

function academicYearSortKey(academicYear?: string): number {
  const match = String(academicYear || '').match(/(\d{4})/);
  return match ? Number(match[1]) * 1e10 : Number.MAX_SAFE_INTEGER;
}

function enrollmentSortKey(enrollment: {
  academic_year_start_date?: string;
  start_date?: string;
  created_at?: string;
  academic_year?: string;
  class_sort_order?: number;
}): number {
  const primaryDate =
    dateSortKey(enrollment.academic_year_start_date)
    ?? dateSortKey(enrollment.start_date)
    ?? dateSortKey(enrollment.created_at);

  const classOrder = Number.isFinite(Number(enrollment.class_sort_order))
    ? Number(enrollment.class_sort_order)
    : 0;

  if (primaryDate !== null) return primaryDate + classOrder;
  return academicYearSortKey(enrollment.academic_year) + classOrder;
}

function sortEnrollmentsChronologically<T extends {
  academic_year_start_date?: string;
  start_date?: string;
  created_at?: string;
  academic_year?: string;
  class_sort_order?: number;
}>(
  enrollments: T[],
): T[] {
  return [...enrollments].sort((a, b) => enrollmentSortKey(a) - enrollmentSortKey(b));
}

function classNameFromEnrollment(enrollment?: { class_name?: string; class_code?: string }): string {
  return enrollment?.class_name || enrollment?.class_code || '';
}

function normalizeCertificateValue(value: unknown, fallback = 'N/A'): string {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || fallback;
  }
  if (value === null || value === undefined) return fallback;
  return String(value).trim() || fallback;
}

function normalizePenNumber(value: unknown): string {
  const v = normalizeCertificateValue(value, '');
  return hasOfficialValue(v) ? v : '';
}

function admissionYearFallback(admissionDate?: string): string {
  if (!admissionDate) return '';
  const d = new Date(admissionDate);
  if (Number.isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  return `${year}-${year + 1}`;
}

function academicYearStartYear(academicYear?: string): number | null {
  const match = String(academicYear || '').match(/\b(\d{4})\b/);
  return match ? Number(match[1]) : null;
}

function classForAcademicYearGap(
  currentClass: string,
  fromYear: string,
  toYear: string,
): string {
  const fromStartYear = academicYearStartYear(fromYear);
  const toStartYear = academicYearStartYear(toYear);
  if (fromStartYear === null || toStartYear === null) return currentClass;

  const yearGap = toStartYear - fromStartYear;
  if (yearGap <= 0) return currentClass;

  return currentClass.replace(/\b(\d+)\b/, (match) => {
    const inferredClass = Number(match) - yearGap;
    return inferredClass >= 1 ? String(inferredClass) : match;
  });
}

function resolveBonafideStudyPeriod(
  enrollments: {
    class_name?: string;
    class_code?: string;
    academic_year?: string;
    academic_year_start_date?: string;
    start_date?: string;
    created_at?: string;
    class_sort_order?: number;
  }[],
  currentEnrollment: { class_name?: string; class_code?: string; academic_year?: string } | undefined,
  admissionDate?: string,
) {
  const currentClass = classNameFromEnrollment(currentEnrollment);
  const sorted = sortEnrollmentsChronologically(enrollments);
  const firstEnroll = sorted[0];
  const lastEnroll = sorted[sorted.length - 1];
  const admissionYear = admissionYearFallback(admissionDate);
  const fromYear = admissionDate
    ? admissionYear
    : (firstEnroll?.academic_year || currentEnrollment?.academic_year || 'N/A');
  const toYear = currentEnrollment?.academic_year || lastEnroll?.academic_year || admissionYear || 'N/A';
  const presentClass = currentClass || classNameFromEnrollment(lastEnroll);
  const inferredFromClass = classForAcademicYearGap(presentClass, fromYear, toYear);

  return {
    fromClass: classToRoman(inferredFromClass || classNameFromEnrollment(firstEnroll) || 'N/A'),
    fromYear,
    toClass: classToRoman(presentClass || 'N/A'),
    toYear,
  };
}

function buildStudentDataFromRecord(
  student: any,
  parents: any[],
  enrollments: any[],
): StudentData {
  const sortedEnrollments = sortEnrollmentsChronologically(enrollments);
  const latestEnrollment = sortedEnrollments[sortedEnrollments.length - 1];
  const enrollment = student.current_enrollment || latestEnrollment;
  const cls = enrollment?.class_name || enrollment?.class_code || '';
  const mergedParents = mergeParentLists(parents, student?.parents);
  const { fatherName, motherName } = resolveParentNames(mergedParents);
  const rawDob = student.dob || student.person?.dob || '';
  const dobFormatted = rawDob ? formatDDMMYYYY(rawDob) : '—';
  const studyPeriod = resolveBonafideStudyPeriod(enrollments, enrollment, student.admission_date);
  const isFormerStudent = student.status === 'graduated' || student.status === 'withdrawn';
  const exitAcademicYear = isFormerStudent && student.exit_academic_year
    ? String(student.exit_academic_year)
    : studyPeriod.toYear;
  const aadhaarRaw = student.aadhaar_number ?? student.aadhaar ?? student.person?.aadhaar_number ?? '';

  return {
    id: student.id,
    name: student.display_name || `${student.first_name || ''} ${student.last_name || ''}`.trim(),
    fatherName,
    motherName,
    parentName: computeParentName(fatherName, motherName),
    genderId: student.gender_id ?? student.person?.gender_id ?? 0,
    genderLabel: genderHonorific(student.gender_id ?? student.person?.gender_id),
    // Section omitted per School Record Sheet redesign (class only).
    class: classToRoman(cls),
    dob: dobFormatted,
    dobWords: rawDob ? dobToWords(rawDob) : '—',
    admissionNo: student.admission_no,
    academicYear: exitAcademicYear || enrollment?.academic_year || '—',
    fromClass: studyPeriod.fromClass,
    fromYear: studyPeriod.fromYear,
    toClass: studyPeriod.toClass,
    toYear: exitAcademicYear,
    penNo: normalizePenNumber(student.pen_number),
    aadhaarNo: String(aadhaarRaw || '').replace(/\D/g, ''),
    religion: resolveReligionLabel(student),
    address: String(student.village || '').trim(),
    nationality: 'Indian',
    category: resolveCategoryLabel(student),
    admissionDate: student.admission_date ? formatDDMMYYYY(student.admission_date) : '—',
    lifecycleStatus: String(student.status || '').toLowerCase(),
    isFormerStudent,
  };
}

const TC_A4_PREVIEW_W = 794;
const TC_A4_PREVIEW_H = 1123;

function SchoolCopyStamp() {
  return (
    <View style={historyStyles.stampWrap} pointerEvents="none">
      <View style={historyStyles.stampBox}>
        <Text style={historyStyles.stampText}>SCHOOL COPY</Text>
      </View>
    </View>
  );
}

function IssuedTcSchoolCopyCard({
  record,
  school,
  isDark,
  expanded,
  onToggle,
}: {
  record: IssuedCertificateRecord;
  school: SchoolProfile;
  isDark: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const snapshot = useMemo(() => parseStoredTcSnapshot(record.data), [record.data]);
  const issueDate = formatDDMMYYYY(record.issued_at);
  const displayName = snapshot?.studentData.name || record.student_name || 'Student';
  const admissionNo = snapshot?.studentData.admissionNo || record.admission_no || '—';
  const classLabel = snapshot?.studentData.class || '';
  const printRef = useRef<View>(null);
  const [busy, setBusy] = useState(false);

  const schoolForDoc = useMemo(() => {
    if (!snapshot) return school;
    return withCertificateSchoolName(school, snapshot.studentData.class, 'TC');
  }, [school, snapshot]);

  const handlePrint = async () => {
    if (!snapshot) return;
    setBusy(true);
    try {
      if (Platform.OS === 'web') {
        const element = resolveCertificateElement(printRef);
        await printCertificateElement(element, 'TC');
      } else {
        const logoDataUri = await getLogoDataUri();
        const html = buildCertificateHTML(
          snapshot.studentData,
          snapshot.tcFields,
          'TC',
          record.serial_no,
          logoDataUri,
          schoolForDoc,
          'A4',
          'legacy',
        );
        const Print = await import('expo-print');
        await Print.printAsync({
          html,
          width: PAPER.A4.widthPt,
          height: PAPER.A4.heightPt,
        });
      }
    } catch (err: any) {
      alertCompat('Print Error', err?.message || 'Could not print school copy.');
    } finally {
      setBusy(false);
    }
  };

  const handleDownload = async () => {
    if (!snapshot) return;
    setBusy(true);
    const safeName = displayName.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_') || 'student';
    const fileName = `TC_SchoolCopy_${safeName}_${record.serial_no.replace(/\//g, '-')}.pdf`;
    try {
      if (Platform.OS === 'web') {
        const element = resolveCertificateElement(printRef);
        await downloadCertificatePdf(element, 'TC', fileName);
      } else {
        const logoDataUri = await getLogoDataUri();
        const html = buildCertificateHTML(
          snapshot.studentData,
          snapshot.tcFields,
          'TC',
          record.serial_no,
          logoDataUri,
          schoolForDoc,
          'A4',
          'legacy',
        );
        const Print = await import('expo-print');
        const { uri } = await Print.printToFileAsync({
          html,
          width: PAPER.A4.widthPt,
          height: PAPER.A4.heightPt,
        });
        const FileSystem: any = await import('expo-file-system/legacy');
        const newUri = `${FileSystem.cacheDirectory}${fileName}`;
        await FileSystem.moveAsync({ from: uri, to: newUri });
        const Sharing = await import('expo-sharing');
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(newUri, {
            mimeType: 'application/pdf',
            dialogTitle: fileName,
            UTI: 'com.adobe.pdf',
          });
        } else {
          alertCompat('PDF Saved', `School copy saved to:\n${newUri}`);
        }
      }
    } catch (err: any) {
      alertCompat('Export Failed', err?.message || 'Could not download school copy.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[historyStyles.card, isDark && historyStyles.cardDark]}>
      <TouchableOpacity style={historyStyles.cardHeader} onPress={onToggle} activeOpacity={0.85}>
        <View style={historyStyles.copyBadge}>
          <Text style={historyStyles.copyBadgeText}>SCHOOL COPY</Text>
        </View>
        <View style={historyStyles.cardHeaderText}>
          <Text style={[historyStyles.cardName, isDark && historyStyles.cardNameDark]} numberOfLines={1}>
            {displayName}
          </Text>
          <Text style={[historyStyles.cardMeta, isDark && historyStyles.cardMetaDark]} numberOfLines={1}>
            {record.serial_no}
            {' · '}
            Adm. {admissionNo}
            {classLabel ? ` · ${classLabel}` : ''}
            {' · '}
            {issueDate}
          </Text>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={isDark ? 'rgba(255,255,255,0.35)' : '#9CA3AF'}
        />
      </TouchableOpacity>

      {expanded && (
        <View style={historyStyles.expandedBody}>
          {snapshot ? (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={historyStyles.previewScroll}>
                <View
                  ref={printRef}
                  collapsable={false}
                  nativeID={`tc-school-copy-${record.id}`}
                  {...webPrintRootProps}
                  style={[
                    historyStyles.paper,
                    { width: TC_A4_PREVIEW_W, height: TC_A4_PREVIEW_H },
                  ]}
                >
                  <TcA4Document
                    studentData={snapshot.studentData}
                    tcFields={snapshot.tcFields}
                    school={schoolForDoc}
                    serialNo={record.serial_no}
                    issueDate={issueDate}
                  />
                  <SchoolCopyStamp />
                </View>
              </ScrollView>

              <View style={historyStyles.actions}>
                <TouchableOpacity
                  style={[historyStyles.actionBtn, historyStyles.actionBtnMuted]}
                  onPress={handlePrint}
                  disabled={busy}
                  activeOpacity={0.8}
                >
                  {busy ? (
                    <ActivityIndicator size="small" color="#374151" />
                  ) : (
                    <>
                      <Feather name="printer" size={14} color="#374151" />
                      <Text style={historyStyles.actionBtnMutedText}>Print School Copy</Text>
                    </>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[historyStyles.actionBtn, historyStyles.actionBtnPrimary]}
                  onPress={handleDownload}
                  disabled={busy}
                  activeOpacity={0.88}
                >
                  <Feather name="download" size={14} color="#FFF" />
                  <Text style={historyStyles.actionBtnPrimaryText}>Download PDF</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <Text style={[historyStyles.emptyHint, isDark && historyStyles.cardMetaDark]}>
              Snapshot data is missing for this record — the school copy cannot be re-rendered.
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

function IssuedTcHistorySection({
  records,
  loading,
  school,
  isDark,
  onRefresh,
}: {
  records: IssuedCertificateRecord[];
  loading: boolean;
  school: SchoolProfile;
  isDark: boolean;
  onRefresh: () => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <Animated.View entering={FadeInDown.delay(80).duration(400)} style={historyStyles.section}>
      <View style={historyStyles.sectionHeader}>
        <View style={historyStyles.sectionTitleRow}>
          <View style={[historyStyles.stepPill, isDark && historyStyles.stepPillDark]}>
            <Text style={historyStyles.stepPillText}>TC</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[historyStyles.sectionTitle, isDark && historyStyles.cardNameDark]}>
              Issued Transfer Certificates
            </Text>
            <Text style={[historyStyles.sectionSub, isDark && historyStyles.cardMetaDark]}>
              School copies of previously generated TCs
            </Text>
          </View>
          <TouchableOpacity onPress={onRefresh} style={historyStyles.refreshBtn} activeOpacity={0.8}>
            {loading ? (
              <ActivityIndicator size="small" color="#4F46E5" />
            ) : (
              <Ionicons name="refresh-outline" size={16} color="#4F46E5" />
            )}
          </TouchableOpacity>
        </View>
      </View>

      {loading && records.length === 0 ? (
        <View style={[historyStyles.emptyBox, isDark && historyStyles.cardDark]}>
          <LogoLoader size={28} color="#4F46E5" />
          <Text style={[historyStyles.emptyHint, isDark && historyStyles.cardMetaDark]}>
            Loading school copies…
          </Text>
        </View>
      ) : records.length === 0 ? (
        <View style={[historyStyles.emptyBox, isDark && historyStyles.cardDark]}>
          <Ionicons name="documents-outline" size={28} color={isDark ? 'rgba(255,255,255,0.25)' : '#CBD5E1'} />
          <Text style={[historyStyles.emptyHint, isDark && historyStyles.cardMetaDark]}>
            No transfer certificates have been issued yet. Print or download a TC to keep a school copy here.
          </Text>
        </View>
      ) : (
        <View style={historyStyles.list}>
          {records.map((record) => (
            <IssuedTcSchoolCopyCard
              key={record.id}
              record={record}
              school={school}
              isDark={isDark}
              expanded={expandedId === record.id}
              onToggle={() => setExpandedId((cur) => (cur === record.id ? null : record.id))}
            />
          ))}
        </View>
      )}
    </Animated.View>
  );
}

const historyStyles = StyleSheet.create({
  section: { marginTop: 8, marginBottom: 8, gap: 12 },
  sectionHeader: { gap: 4 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#EEF2FF',
  },
  stepPillDark: { backgroundColor: 'rgba(79,70,229,0.2)' },
  stepPillText: { fontSize: 10, fontWeight: '900', color: '#4F46E5', letterSpacing: 0.5 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
  sectionSub: { fontSize: 12, fontWeight: '500', color: '#6B7280', marginTop: 1 },
  refreshBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF2FF',
  },
  list: { gap: 10 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.06, shadowRadius: 10 },
      android: { elevation: 3 },
    }),
  },
  cardDark: {
    backgroundColor: '#1C1F2A',
    borderColor: 'rgba(255,255,255,0.07)',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  copyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: TC_GOLD,
    backgroundColor: 'rgba(213,139,22,0.12)',
  },
  copyBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: TC_MAROON,
    letterSpacing: 0.6,
  },
  cardHeaderText: { flex: 1, gap: 2 },
  cardName: { fontSize: 14, fontWeight: '800', color: '#111827' },
  cardNameDark: { color: '#F9FAFB' },
  cardMeta: { fontSize: 11, fontWeight: '600', color: '#6B7280' },
  cardMetaDark: { color: 'rgba(255,255,255,0.4)' },
  expandedBody: { paddingHorizontal: 14, paddingBottom: 14, gap: 12 },
  previewScroll: { paddingVertical: 4 },
  paper: {
    backgroundColor: 'transparent',
    borderRadius: 4,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    position: 'relative',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.1, shadowRadius: 14 },
      android: { elevation: 6 },
    }),
  },
  actions: { flexDirection: 'row', gap: 10 },
  actionBtn: {
    flex: 1,
    height: 42,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  actionBtnMuted: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  actionBtnMutedText: { fontSize: 13, fontWeight: '700', color: '#374151' },
  actionBtnPrimary: { backgroundColor: '#4F46E5' },
  actionBtnPrimaryText: { fontSize: 13, fontWeight: '700', color: '#FFF' },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 28,
    paddingHorizontal: 20,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  emptyHint: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 18,
  },
  stampWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  stampBox: {
    borderWidth: 3,
    borderColor: 'rgba(122,23,50,0.60)',
    borderRadius: 6,
    paddingHorizontal: 18,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.15)',
    transform: [{ rotate: '-18deg' }],
  },
  stampText: {
    fontSize: 28,
    fontWeight: '900',
    color: 'rgba(122,23,50,0.68)',
    letterSpacing: 3,
  },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function CertificateGenerator() {
  const { theme, isDark } = useTheme();
  const { shellActive } = useAccountsWebChrome();
  const styles = useMemo(() => getStyles(theme, isDark), [theme, isDark]);

  const [studentId, setStudentId] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchMatches, setSearchMatches] = useState<Student[] | null>(null);
  const [studentData, setStudentData] = useState<StudentData | null>(null);
  const [tcFields, setTcFields] = useState<TCEditableFields>(DEFAULT_TC_FIELDS);
  const [selectedType, setSelectedType] = useState<CertificateType>(null);
  const [generated, setGenerated] = useState(false);
  const [focused, setFocused] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [serialNo, setSerialNo] = useState('');
  const [saving, setSaving] = useState(false);
  const [schoolProfile, setSchoolProfile] = useState<SchoolProfile>(() => mapSchoolSettings({}));
  const [tcLayout, setTcLayout] = useState<TcLayout>('A4');
  /** Legacy is the default. Toggle ON switches to the modern header. */
  const [bonafideHeaderTheme, setBonafideHeaderTheme] = useState<BonafideHeaderTheme>('legacy');
  /** Student id for whom TC fee-clearance is waived this session only. */
  const [tcSkipFeeCheckStudentId, setTcSkipFeeCheckStudentId] = useState<string | null>(null);
  const [showTcFeeDialog, setShowTcFeeDialog] = useState(false);
  const [tcFeeDialogOutstanding, setTcFeeDialogOutstanding] = useState<number | null>(null);
  const [tcFeeDialogToggle, setTcFeeDialogToggle] = useState(false);
  const [tcWithdrawalAction, setTcWithdrawalAction] = useState<TcCompletionAction | null>(null);
  const [withdrawingStudent, setWithdrawingStudent] = useState(false);
  const [issuedTcs, setIssuedTcs] = useState<IssuedCertificateRecord[]>([]);
  const [issuedTcsLoading, setIssuedTcsLoading] = useState(false);
  const certificateRef = useRef<View>(null);

  const step = generated ? 3 : studentData ? 2 : 1;
  const tcFeeWaivedForCurrentStudent = !!(studentData && tcSkipFeeCheckStudentId === studentData.id);

  const loadIssuedTcs = useCallback(async () => {
    setIssuedTcsLoading(true);
    try {
      const rows = await CertificateService.listIssuedCertificates({ type: 'TC', limit: 100 });
      setIssuedTcs(rows);
    } catch {
      setIssuedTcs([]);
    } finally {
      setIssuedTcsLoading(false);
    }
  }, []);

  useEffect(() => {
    injectCertificatePrintStyles();
    SchoolSettingsService.getSettings()
      .then(settings => setSchoolProfile(mapSchoolSettings(settings)))
      .catch(() => { /* keep SCHOOL_CONFIG fallback */ });
    loadIssuedTcs();
  }, [loadIssuedTcs]);

  const persistIssuedCertificate = useCallback(async () => {
    if (!studentData || !selectedType || !serialNo) return;
    try {
      await CertificateService.saveIssuedCertificate({
        studentId: studentData.id,
        type: selectedType,
        serialNo,
        issuedAt: new Date().toISOString(),
        data: { studentData, tcFields },
      });
      if (selectedType === 'TC') {
        await loadIssuedTcs();
      }
    } catch { /* non-blocking */ }
  }, [studentData, selectedType, serialNo, tcFields, loadIssuedTcs]);

  const loadStudentFromRecord = useCallback(async (studentRecord: Student) => {
    const silent = { silent: true } as const;
    const [fullStudent, parents, enrollments] = await Promise.all([
      StudentService.getById(studentRecord.id, silent).catch(() => studentRecord),
      StudentService.getParents(studentRecord.id, silent).catch(() => [] as any[]),
      StudentService.getEnrollments(studentRecord.id, silent).catch(() => [] as any[]),
    ]);
    const embeddedParents = Array.isArray((fullStudent as any)?.parents)
      ? (fullStudent as any).parents
      : [];

    const dateRange = await resolveAttendanceDateRange(fullStudent, enrollments);
    const attendance = await StudentService.getAttendance(
      studentRecord.id,
      {
        ...(dateRange.from_date && dateRange.to_date
          ? { from_date: dateRange.from_date, to_date: dateRange.to_date }
          : {}),
        limit: 1,
      },
      silent,
    ).catch(() => null);

    const built = buildStudentDataFromRecord(
      fullStudent,
      mergeParentLists(parents, embeddedParents),
      enrollments,
    );
    setStudentData(built);
    setTcFields({
      ...DEFAULT_TC_FIELDS,
      examResult: built.isFormerStudent ? 'Passed' : 'Pursuing',
      ...attendanceFieldsFromSummary(attendance?.summary),
    });
    setSearchMatches(null);
    // Fee waiver is per-student for this session — clear when loading another student.
    setTcSkipFeeCheckStudentId(null);
    setShowTcFeeDialog(false);
    setTcFeeDialogToggle(false);
    setTcFeeDialogOutstanding(null);
    setTcWithdrawalAction(null);
  }, []);

  // ── Fetch student ──────────────────────────────────────────────────────────
  const handleSearch = async () => {
    if (!studentId.trim()) {
      alertCompat('Missing Input', 'Enter a Student ID or Admission No.');
      return;
    }
    setLoading(true);
    setGenerated(false);
    setStudentData(null);
    setSearchMatches(null);
    setSelectedType(null);
    setTcFields(DEFAULT_TC_FIELDS);
    setTcSkipFeeCheckStudentId(null);
    setShowTcFeeDialog(false);
    setTcFeeDialogToggle(false);
    setTcFeeDialogOutstanding(null);
    setTcWithdrawalAction(null);
    try {
      const query = studentId.trim();
      const silent = { silent: true } as const;
      const results = await StudentService.search(query, 20, { lifecycle: 'all' });

      if (results.length === 0) {
        try {
          const student = await StudentService.getById(query, silent);
          await loadStudentFromRecord(student);
          return;
        } catch {
          alertCompat('Not Found', 'No student matched the given ID, admission number, or name.');
          return;
        }
      }

      if (results.length === 1) {
        await loadStudentFromRecord(results[0]);
        return;
      }

      setSearchMatches(results);
    } catch (err: any) {
      alertCompat('Error', err?.message || 'Could not fetch student data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectSearchMatch = async (student: Student) => {
    setLoading(true);
    try {
      await loadStudentFromRecord(student);
    } catch (err: any) {
      alertCompat('Error', err?.message || 'Could not load the selected student.');
    } finally {
      setLoading(false);
    }
  };

  // ── Generate certificate + DB serial ──────────────────────────────────────
  const issueCertificate = useCallback(async (type: CertificateType) => {
    if (!type) return;
    setLoading(true);
    try {
      let serial = '';
      try {
        serial = await CertificateService.getNextSerialNo(type, new Date().getFullYear());
      } catch {
        const y = new Date().getFullYear();
        serial = `${type}/${y}/${String(Math.floor(Math.random() * 900) + 100).padStart(3, '0')}`;
      }
      setSerialNo(serial);
      setSelectedType(type);
      setGenerated(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const generateCertificate = async (type: CertificateType) => {
    if (!studentData || !type) return;

    if (type === 'TC') {
      const { allowed, classNum } = isTcAllowedForClass(studentData.class);
      if (!allowed) {
        alertCompat(
          'TC Not Allowed',
          `Transfer Certificate can only be issued for students up to Class ${GEETHANJALI_TC_MAX_CLASS}.\n\n${studentData.name} is in Class ${classNum ?? studentData.class}.`
        );
        return;
      }

      // Per-student session waiver skips the fee gate for this student only.
      if (tcSkipFeeCheckStudentId !== studentData.id) {
        setLoading(true);
        try {
          const outstanding = await FeeService.getStudentOutstandingBalance(studentData.id);
          if (outstanding > 0) {
            setTcFeeDialogOutstanding(outstanding);
            setTcFeeDialogToggle(false);
            setShowTcFeeDialog(true);
            return;
          }
        } catch {
          setTcFeeDialogOutstanding(null);
          setTcFeeDialogToggle(false);
          setShowTcFeeDialog(true);
          return;
        } finally {
          setLoading(false);
        }
      }
    }

    await issueCertificate(type);
  };

  const handleTcFeeDialogCancel = () => {
    setShowTcFeeDialog(false);
    setTcFeeDialogToggle(false);
    setTcFeeDialogOutstanding(null);
  };

  const handleTcFeeDialogContinue = async () => {
    if (!studentData || !tcFeeDialogToggle) return;
    setTcSkipFeeCheckStudentId(studentData.id);
    setShowTcFeeDialog(false);
    setTcFeeDialogToggle(false);
    setTcFeeDialogOutstanding(null);
    await issueCertificate('TC');
  };

  // ── Save edits ─────────────────────────────────────────────────────────────
  const handleEditSave = useCallback((sd: StudentData, tc: TCEditableFields) => {
    // Re-derive parentName so edits to the father/mother name flow through to the
    // Bonafide's "S/o. D/o." line, which renders parentName (not fatherName).
    setStudentData({ ...sd, parentName: computeParentName(sd.fatherName, sd.motherName) });
    setTcFields(tc);
    setShowEdit(false);
  }, []);

  const offerTcWithdrawal = useCallback((action: TcCompletionAction) => {
    if (selectedType === 'TC' && studentData?.lifecycleStatus === 'active') {
      setTcWithdrawalAction(action);
    }
  }, [selectedType, studentData]);

  const handleWithdrawStudent = async () => {
    if (!studentData || withdrawingStudent) return;

    setWithdrawingStudent(true);
    try {
      const statuses = await StudentService.getStatuses();
      const withdrawnStatus = statuses.find(status => status.code.toLowerCase() === 'withdrawn');
      if (!withdrawnStatus) {
        throw new Error('The Withdrawn student status is not configured for this school.');
      }

      await StudentService.update(studentData.id, { status_id: withdrawnStatus.id });
      const withdrawnStudentName = studentData.name;
      setStudentData(current => current?.id === studentData.id
        ? { ...current, lifecycleStatus: 'withdrawn', isFormerStudent: true }
        : current);
      setTcWithdrawalAction(null);
      alertCompat(
        'Student Withdrawn',
        `${withdrawnStudentName} was moved from Active to Withdrawn. All historical records were retained.`,
      );
    } catch (err: any) {
      alertCompat('Withdrawal Failed', err?.message || 'Could not withdraw the student. Please try again.');
    } finally {
      setWithdrawingStudent(false);
    }
  };

  // ── Print certificate ──────────────────────────────────────────────────────
  const handlePrint = async () => {
    if (!studentData || !selectedType) return;
    const paper = getActivePaper(selectedType, tcLayout);
    const pdfFormat = getPdfFormat(selectedType, tcLayout);
    try {
      if (Platform.OS === 'web') {
        const element = resolveCertificateElement(certificateRef);
        await printCertificateElement(element, pdfFormat);
      } else {
        const logoDataUri = await getLogoDataUri();
        const html = buildCertificateHTML(
          studentData, tcFields, selectedType, serialNo, logoDataUri, schoolProfile, tcLayout, bonafideHeaderTheme,
        );
        const Print = await import('expo-print');
        await Print.printAsync({
          html,
          width: paper.widthPt,
          height: paper.heightPt,
        });
      }

      offerTcWithdrawal('printed');
      setSaving(true);
      try {
        await persistIssuedCertificate();
      } finally {
        setSaving(false);
      }
    } catch (err: any) {
      alertCompat('Print Error', err?.message || 'Could not print certificate.');
    }
  };

  // ── Download PDF (html2canvas + jsPDF on web; expo-print file on native) ───
  const handleDownload = async () => {
    if (!studentData || !selectedType) return;
    const paper = getActivePaper(selectedType, tcLayout);
    const pdfFormat = getPdfFormat(selectedType, tcLayout);
    const safeName = studentData.name.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_') || 'student';
    const fileName = `certificate_${safeName}_${serialNo.replace(/\//g, '-')}.pdf`;

    try {
      if (Platform.OS === 'web') {
        const element = resolveCertificateElement(certificateRef);
        await downloadCertificatePdf(element, pdfFormat, fileName);
      } else {
        const logoDataUri = await getLogoDataUri();
        const html = buildCertificateHTML(
          studentData, tcFields, selectedType, serialNo, logoDataUri, schoolProfile, tcLayout, bonafideHeaderTheme,
        );
        const Print = await import('expo-print');
        const { uri } = await Print.printToFileAsync({
          html,
          width: paper.widthPt,
          height: paper.heightPt,
        });
        
        const FileSystem: any = await import('expo-file-system/legacy');
        const newUri = `${FileSystem.cacheDirectory}${fileName}`;
        await FileSystem.moveAsync({
          from: uri,
          to: newUri,
        });

        const Sharing = await import('expo-sharing');
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(newUri, {
            mimeType: 'application/pdf',
            dialogTitle: fileName,
            UTI: 'com.adobe.pdf',
          });
        } else {
          alertCompat('PDF Saved', `Certificate saved to:\n${newUri}`);
        }
      }

      // Save issued record to DB
      setSaving(true);
      try {
        await persistIssuedCertificate();
      } finally {
        setSaving(false);
      }
      offerTcWithdrawal('downloaded');
    } catch (err: any) {
      setSaving(false);
      alertCompat('Export Failed', err?.message || 'Could not generate PDF.');
    }
  };

  const handleReset = () => {
    setGenerated(false);
    setStudentData(null);
    setSearchMatches(null);
    setSelectedType(null);
    setStudentId('');
    setTcFields(DEFAULT_TC_FIELDS);
    setSerialNo('');
    setTcLayout('A4');
    setTcSkipFeeCheckStudentId(null);
    setShowTcFeeDialog(false);
    setTcFeeDialogToggle(false);
    setTcFeeDialogOutstanding(null);
    setTcWithdrawalAction(null);
  };

  return (
    <View style={styles.root}>
      <LinearGradient colors={isDark ? ['#0F1117', '#0F1117'] : ['#F0F4FF', '#F8FAFC']} style={StyleSheet.absoluteFill} />
      {!shellActive && <AdminHeader title="Certificate Generator" showBackButton />}
      <StepIndicator step={step} isDark={isDark} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* ── Step 1: Search ── */}
        <Animated.View entering={FadeInDown.duration(400)} style={styles.card}>
          <View style={styles.cardLabelRow}>
            <View style={styles.stepPill}><Text style={styles.stepPillText}>01</Text></View>
            <Text style={styles.cardTitle}>Find Student</Text>
          </View>
          <Text style={styles.cardSub}>Enter student ID, admission number, or name</Text>
          <View style={[styles.searchRow, ds.searchBarWrapper, focused && styles.searchRowFocused]}>
            <Ionicons name="search-outline" size={18} color={focused ? '#4F46E5' : (isDark ? 'rgba(255,255,255,0.3)' : '#9CA3AF')} />
            <AppTextInput
              style={[ds.inputInChrome, styles.searchInput]}
              placeholder="e.g. 101, ADM2024..."
              placeholderTextColor={isDark ? 'rgba(255,255,255,0.2)' : '#94A3B8'}
              value={studentId}
              onChangeText={setStudentId}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onSubmitEditing={handleSearch}
              returnKeyType="search"
            />
            {studentId.length > 0 && (
              <TouchableOpacity onPress={() => setStudentId('')}>
                <Ionicons name="close-circle" size={17} color={isDark ? 'rgba(255,255,255,0.25)' : '#9CA3AF'} />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity style={[styles.searchBtn, loading && styles.searchBtnDisabled]} onPress={handleSearch} disabled={loading} activeOpacity={0.88}>
            {loading ? (
              <View style={styles.searchBtnGrad}><LogoLoader size={24} color="#FFF" /></View>
            ) : (
              <LinearGradient colors={['#4F46E5', '#818CF8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.searchBtnGrad}>
                <Ionicons name="person-outline" size={16} color="#FFF" />
                <Text style={styles.searchBtnText}>Search Student</Text>
              </LinearGradient>
            )}
          </TouchableOpacity>
        </Animated.View>

        {searchMatches && searchMatches.length > 0 && !studentData && (
          <Animated.View entering={FadeInDown.delay(40).duration(350)} style={styles.matchSection}>
            <Text style={styles.matchHint}>
              {searchMatches.length} students matched — select the correct one
            </Text>
            {searchMatches.map((student, index) => (
              <Pressable
                key={student.id}
                onPress={() => handleSelectSearchMatch(student)}
                disabled={loading}
                style={({ pressed }) => [
                  styles.matchCard,
                  pressed && styles.matchCardPressed,
                  loading && styles.matchCardDisabled,
                ]}
              >
                <View style={styles.studentAvatar}>
                  <Text style={styles.studentAvatarText}>
                    {studentRecordName(student).charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.studentInfo}>
                  <Text style={styles.studentName} numberOfLines={1}>
                    {studentRecordName(student)}
                  </Text>
                  <View style={styles.studentMetaRow}>
                    <View style={styles.metaChip}>
                      <Text style={styles.metaChipText}>{studentRecordClass(student)}</Text>
                    </View>
                    <View style={styles.metaChip}>
                      <Text style={styles.metaChipText}>#{student.admission_no}</Text>
                    </View>
                    {student.category?.name ? (
                      <View style={styles.metaChip}>
                        <Text style={styles.metaChipText}>{student.category.name}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={isDark ? 'rgba(255,255,255,0.25)' : '#9CA3AF'}
                />
              </Pressable>
            ))}
          </Animated.View>
        )}

        {/* ── Step 2: Student found + Select type ── */}
        {studentData && !generated && (
          <Animated.View entering={FadeInDown.delay(50).duration(400).springify()}>
            <View style={styles.studentStrip}>
              <View style={styles.studentAvatar}>
                <Text style={styles.studentAvatarText}>{studentData.name.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={styles.studentInfo}>
                <Text style={styles.studentName} numberOfLines={1}>{studentData.name}</Text>
                <View style={styles.studentMetaRow}>
                  <View style={styles.metaChip}><Text style={styles.metaChipText}>{studentData.class}</Text></View>
                  <View style={styles.metaChip}><Text style={styles.metaChipText}>#{studentData.admissionNo}</Text></View>
                  <View style={styles.metaChip}><Text style={styles.metaChipText}>{studentData.category}</Text></View>
                </View>
              </View>
              <View style={styles.verifiedBadge}>
                <MaterialCommunityIcons name="check-decagram" size={14} color="#10B981" />
                <Text style={styles.verifiedText}>Verified</Text>
              </View>
            </View>

            <View style={[styles.feeWaiverStrip, tcFeeWaivedForCurrentStudent && styles.feeWaiverStripOn]}>
              <View style={styles.feeWaiverCopy}>
                <Text style={styles.feeWaiverTitle}>Allow TC without fee clearance</Text>
                <Text style={styles.feeWaiverHint}>
                  {tcFeeWaivedForCurrentStudent
                    ? `Enabled for ${studentData.name} only. Turn off to require fee clearance again.`
                    : `Off by default. When dues block TC, use the dialog — or enable here for ${studentData.name} only.`}
                </Text>
              </View>
              <Switch
                value={tcFeeWaivedForCurrentStudent}
                onValueChange={(on) => setTcSkipFeeCheckStudentId(on ? studentData.id : null)}
                trackColor={{ false: isDark ? '#374151' : '#CBD5E1', true: '#FCA5A5' }}
                thumbColor={tcFeeWaivedForCurrentStudent ? '#DC2626' : '#FFFFFF'}
              />
            </View>

            <View style={styles.selectHeader}>
              <View style={styles.stepPill}><Text style={styles.stepPillText}>02</Text></View>
              <Text style={styles.cardTitle}>Choose Certificate</Text>
            </View>
            <View style={styles.typeGrid}>
              {(['TC', 'BONAFIDE'] as const).map(t => (
                <TypeCard key={t} type={t} isDark={isDark} onPress={() => generateCertificate(t)} />
              ))}
            </View>
            <TouchableOpacity style={styles.resetLink} onPress={handleReset}>
              <Ionicons name="refresh-outline" size={14} color={isDark ? 'rgba(255,255,255,0.3)' : '#9CA3AF'} />
              <Text style={styles.resetLinkText}>Search a different student</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* ── Step 3: Preview ── */}
        {generated && selectedType && studentData && (
          <>
            <View style={styles.selectHeader}>
              <View style={[styles.stepPill, { backgroundColor: isDark ? 'rgba(16,185,129,0.2)' : '#D1FAE5' }]}>
                <Text style={[styles.stepPillText, { color: '#10B981' }]}>03</Text>
              </View>
              <Text style={styles.cardTitle}>Certificate Preview</Text>
              {saving && <ActivityIndicator size="small" color="#4F46E5" style={{ marginLeft: 8 }} />}
            </View>
            <CertificatePreview
              ref={certificateRef}
              studentData={studentData}
              tcFields={tcFields}
              selectedType={selectedType}
              serialNo={serialNo}
              school={schoolProfile}
              tcLayout={tcLayout}
              setTcLayout={setTcLayout}
              bonafideHeaderTheme={bonafideHeaderTheme}
              setBonafideHeaderTheme={setBonafideHeaderTheme}
              onExamResultChange={(value) => setTcFields(f => ({ ...f, examResult: value }))}
              onEdit={() => setShowEdit(true)}
              onPrint={handlePrint}
              onDownload={handleDownload}
            />
            <TouchableOpacity style={[styles.resetLink, { marginTop: 8 }]} onPress={handleReset}>
              <Ionicons name="refresh-outline" size={14} color={isDark ? 'rgba(255,255,255,0.3)' : '#9CA3AF'} />
              <Text style={styles.resetLinkText}>Start over</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ── Past TC school copies ── */}
        <IssuedTcHistorySection
          records={issuedTcs}
          loading={issuedTcsLoading}
          school={schoolProfile}
          isDark={isDark}
          onRefresh={loadIssuedTcs}
        />

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── Edit Modal ── */}
      {studentData && (
        <EditModal
          visible={showEdit}
          isDark={isDark}
          studentData={studentData}
          tcFields={tcFields}
          onSave={handleEditSave}
          onClose={() => setShowEdit(false)}
        />
      )}

      {/* ── TC fee-waiver dialog (per student, this session) ── */}
      {studentData && (
        <TcFeeWaiverDialog
          visible={showTcFeeDialog}
          isDark={isDark}
          studentName={studentData.name}
          outstanding={tcFeeDialogOutstanding}
          waiveEnabled={tcFeeDialogToggle}
          onWaiveChange={setTcFeeDialogToggle}
          onCancel={handleTcFeeDialogCancel}
          onContinue={handleTcFeeDialogContinue}
        />
      )}

      {/* ── Post-TC lifecycle confirmation ── */}
      {studentData && (
        <TcWithdrawalDialog
          visible={tcWithdrawalAction !== null}
          isDark={isDark}
          studentName={studentData.name}
          completedAction={tcWithdrawalAction}
          withdrawing={withdrawingStudent}
          onKeepActive={() => setTcWithdrawalAction(null)}
          onWithdraw={handleWithdrawStudent}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const getStyles = (theme: Theme, isDark: boolean) => StyleSheet.create({
  root: { flex: 1 },
  scroll: { padding: 16, paddingTop: 4 },
  card: { backgroundColor: isDark ? '#1C1F2A' : '#FFFFFF', borderRadius: 20, padding: 18, marginBottom: 16, borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)', gap: 10, ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: isDark ? 0.3 : 0.06, shadowRadius: 14 }, android: { elevation: 4 } }) },
  cardLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: isDark ? 'rgba(79,70,229,0.2)' : '#EEF2FF' },
  stepPillText: { fontSize: 10, fontWeight: '900', color: '#4F46E5', letterSpacing: 0.5 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: isDark ? '#F9FAFB' : '#111827' },
  cardSub: { fontSize: 13, color: isDark ? 'rgba(255,255,255,0.35)' : '#6B7280', fontWeight: '500', marginTop: -4 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F9FAFB', borderWidth: 1.5, borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#E5E7EB', borderRadius: 13, paddingHorizontal: 13, height: 48 },
  searchRowFocused: { borderColor: '#4F46E5', backgroundColor: isDark ? 'rgba(79,70,229,0.07)' : '#F5F3FF' },
  searchInput: { flex: 1, fontSize: 15, fontWeight: '500', color: isDark ? '#F9FAFB' : '#111827' },
  searchBtn: { borderRadius: 13, overflow: 'hidden', height: 48, ...Platform.select({ ios: { shadowColor: '#4F46E5', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10 }, android: { elevation: 5 } }) },
  searchBtnDisabled: { opacity: 0.6, shadowOpacity: 0 },
  searchBtnGrad: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 20 },
  searchBtnText: { color: '#FFF', fontWeight: '800', fontSize: 15 },
  matchSection: { marginBottom: 16, gap: 8 },
  matchHint: { fontSize: 13, fontWeight: '700', color: isDark ? 'rgba(255,255,255,0.45)' : '#64748B', marginBottom: 4 },
  matchCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: isDark ? '#1C1F2A' : '#FFFFFF', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB' },
  matchCardPressed: { opacity: 0.85, borderColor: '#4F46E5' },
  matchCardDisabled: { opacity: 0.6 },
  studentStrip: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: isDark ? '#1C1F2A' : '#FFFFFF', borderRadius: 18, padding: 14, marginBottom: 16, borderWidth: 1, borderLeftWidth: 4, borderColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)', borderLeftColor: '#4F46E5', ...Platform.select({ ios: { shadowColor: '#4F46E5', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 10 }, android: { elevation: 3 } }) },
  studentAvatar: { width: 46, height: 46, borderRadius: 14, backgroundColor: isDark ? 'rgba(79,70,229,0.2)' : '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
  studentAvatarText: { fontSize: 20, fontWeight: '800', color: '#4F46E5' },
  studentInfo: { flex: 1 },
  studentName: { fontSize: 15, fontWeight: '800', color: isDark ? '#F9FAFB' : '#111827', marginBottom: 5 },
  studentMetaRow: { flexDirection: 'row', gap: 5, flexWrap: 'wrap' },
  metaChip: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : '#F3F4F6' },
  metaChipText: { fontSize: 11, fontWeight: '700', color: isDark ? 'rgba(255,255,255,0.4)' : '#6B7280' },
  verifiedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: isDark ? 'rgba(16,185,129,0.15)' : '#ECFDF5', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  verifiedText: { fontSize: 11, fontWeight: '700', color: '#10B981' },
  feeWaiverStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: isDark ? '#1C1F2A' : '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.07)' : '#E5E7EB',
  },
  feeWaiverStripOn: {
    borderColor: isDark ? 'rgba(248,113,113,0.45)' : '#FECACA',
    backgroundColor: isDark ? 'rgba(220,38,38,0.12)' : '#FEF2F2',
  },
  feeWaiverCopy: { flex: 1, gap: 3 },
  feeWaiverTitle: { fontSize: 13, fontWeight: '800', color: isDark ? '#F9FAFB' : '#111827' },
  feeWaiverHint: { fontSize: 11, lineHeight: 16, fontWeight: '500', color: isDark ? 'rgba(255,255,255,0.4)' : '#6B7280' },
  selectHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  typeGrid: { flexDirection: 'row', gap: 12, marginBottom: 4 },
  resetLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 12 },
  resetLinkText: { fontSize: 13, fontWeight: '600', color: isDark ? 'rgba(255,255,255,0.25)' : '#9CA3AF' },
});

/*
 * ─── CertificateService contract (create at src/services/certificateService.ts) ──
 *
 * export const CertificateService = {
 *   // Returns next serial string like "TC/2025/042"
 *   async getNextSerialNo(type: 'TC' | 'BONAFIDE', year: number): Promise<string> {
 *     const { data } = await supabase.rpc('next_certificate_serial', { cert_type: type, cert_year: year });
 *     return data; // e.g. "TC/2025/042"
 *   },
 *   // Persist issued certificate record
 *   async saveIssuedCertificate(payload: {
 *     studentId: string; type: string; serialNo: string;
 *     issuedAt: string; data: object;
 *   }) {
 *     return supabase.from('issued_certificates').insert(payload);
 *   },
 * };
 *
 * Supabase SQL:
 *   CREATE TABLE issued_certificates (
 *     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 *     student_id uuid REFERENCES students(id),
 *     type text NOT NULL,               -- 'TC' | 'BONAFIDE'
 *     serial_no text NOT NULL UNIQUE,
 *     issued_at timestamptz NOT NULL,
 *     data jsonb,
 *     created_at timestamptz DEFAULT now()
 *   );
 *   CREATE SEQUENCE tc_seq;
 *   CREATE SEQUENCE bonafide_seq;
 *   CREATE OR REPLACE FUNCTION next_certificate_serial(cert_type text, cert_year int)
 *   RETURNS text LANGUAGE plpgsql AS $$
 *   DECLARE n int;
 *   BEGIN
 *     IF cert_type = 'TC' THEN n := nextval('tc_seq');
 *     ELSE n := nextval('bonafide_seq'); END IF;
 *     RETURN cert_type || '/' || cert_year || '/' || LPAD(n::text, 3, '0');
 *   END; $$;
 *
 * ─── WEB EXPORT NOTE (certificatePrint.ts) ───────────────────────────────────
 * On web, Print/Download go through printCertificateElement()/downloadCertificatePdf()
 * with pdfFormat 'BONAFIDE'. That file is NOT in this component. For the half-A4
 * fix to also apply on web, the 'BONAFIDE' branch there MUST set the jsPDF/print
 * page to A5 landscape (210 × 148.5 mm), and ideally use html2canvas scale: 3 for
 * crisp output. Native (expo-print) is already fully handled here.
 */
