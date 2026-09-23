import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useRouter } from 'expo-router';
import AdminHeader from '../../components/AdminHeader';
import { SCHOOL_LOGO, SCHOOL_NAME } from '../../constants/school';
import { SCHOOL_CONFIG } from '../../constants/schoolConfig';
import { useTheme } from '../../hooks/useTheme';
import { useRequireRole } from '../../hooks/useRequireRole';
import { useAuth } from '../../hooks/useAuth';
import { alertCompat } from '../../utils/crossPlatformAlert';
import { resolveApiAssetUrl } from '../../utils/toBase64Uri';
import { useAccountsWebChrome } from '../../contexts/AccountsWebChromeContext';
import { StudentLoginQrApi, fetchAllLoginQrStudents } from './studentQrApi';
import { LOGIN_QR_CARDS_PER_PAGE, printStudentQrPdf, saveStudentQrPdf, studentQrPngDataUrl } from './qrPdfGenerator';
import type {
  IssuedLoginQr,
  LoginQrMetadata,
  LoginQrSchool,
  LoginQrStudent,
} from './types';

type PickerOption = { value: string; label: string };

function uniqOptions(rows: PickerOption[]): PickerOption[] {
  return [...new Map(rows.map((row) => [row.value, row])).values()];
}

function isPlaceholderSchoolName(value?: string | null) {
  const name = value?.trim() || '';
  return !name || /^(default\s+school(\s+name)?|school|school\s+name|my\s+school|unnamed\s+school)$/i.test(name);
}

function brandedLoginQrSchool(school?: LoginQrSchool | null): LoginQrSchool {
  const name = school?.name?.trim() || '';
  const fallbackName = !isPlaceholderSchoolName(SCHOOL_NAME) ? SCHOOL_NAME : SCHOOL_CONFIG.name;
  return {
    id: school?.id ?? 0,
    name: isPlaceholderSchoolName(name) ? fallbackName : name,
    logo_url: school?.logo_url || SCHOOL_LOGO || null,
  };
}

function formatQrExpiry(iso?: string | null) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function loginQrStatus(student: LoginQrStudent, issued: Map<string, IssuedLoginQr>) {
  if (!student.login_configured) {
    return { label: 'Needs login', tone: 'warn' as const };
  }
  if (student.qr_ready || issued.has(student.id)) {
    return { label: 'QR issued', tone: 'ready' as const };
  }
  return { label: 'Login set up', tone: 'idle' as const };
}

function FilterPicker({ label, value, options, onChange }: {
  label: string; value: string; options: PickerOption[]; onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);
  return <>
    <Pressable style={styles.filterField} onPress={() => setOpen(true)}>
      <Text style={styles.filterLabel}>{label}</Text>
      <View style={styles.filterValueRow}><Text numberOfLines={1} style={styles.filterValue}>{selected?.label || 'All'}</Text><Ionicons name="chevron-down" size={15} color="#64748B" /></View>
    </Pressable>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <Pressable style={styles.modalBackdrop} onPress={() => setOpen(false)}>
        <Pressable style={styles.pickerCard} onPress={(event) => event.stopPropagation()}>
          <Text style={styles.pickerTitle}>Select {label}</Text>
          <FlatList data={[{ value: '', label: 'All' }, ...options]} keyExtractor={(item) => item.value || 'all'} renderItem={({ item }) => (
            <Pressable style={[styles.pickerOption, item.value === value && styles.pickerOptionActive]} onPress={() => { onChange(item.value); setOpen(false); }}>
              <Text style={[styles.pickerOptionText, item.value === value && styles.pickerOptionTextActive]}>{item.label}</Text>
              {item.value === value ? <Ionicons name="checkmark-circle" size={20} color="#6D28D9" /> : null}
            </Pressable>
          )} />
        </Pressable>
      </Pressable>
    </Modal>
  </>;
}

function PreviewModal({ credential, school, academicYear, onClose, onRegenerated }: {
  credential: IssuedLoginQr | null;
  school: LoginQrSchool | null;
  academicYear: string;
  onClose: () => void;
  onRegenerated: (credential: IssuedLoginQr) => void;
}) {
  const qrRef = useRef<{ toDataURL: (callback: (data: string) => void) => void } | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState('Working…');
  const [logoFailed, setLogoFailed] = useState(false);
  const brand = brandedLoginQrSchool(school);
  const remoteLogo = resolveApiAssetUrl(brand.logo_url);

  useEffect(() => {
    setLogoFailed(false);
  }, [remoteLogo, credential?.credentialId]);

  if (!credential) return null;

  const printOptions = {
    school: brand,
    academicYear,
    className: credential.student.className || '-',
    sectionName: credential.student.sectionName || '-',
    credentials: [credential],
  };
  const audit = (exportType: 'png' | 'single_card_pdf' | 'print') =>
    StudentLoginQrApi.auditExport({ exportType, studentIds: [credential.student.id] }).catch(() => undefined);
  const expiry = formatQrExpiry(credential.expiresAt);
  const showRemoteLogo = Boolean(remoteLogo) && !logoFailed;
  const classLabel = [credential.student.className, credential.student.sectionName].filter(Boolean).join('-') || '-';

  const run = async (label: string, task: () => Promise<void>) => {
    setBusyLabel(label);
    setBusy(true);
    try {
      await task();
    } catch (error) {
      alertCompat('Could not finish', error instanceof Error ? error.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  const downloadPng = () => run('Saving QR image…', async () => {
    const filename = `${credential.student.name.replace(/[^a-z0-9]+/gi, '-')}_Class-${credential.student.className || ''}-${credential.student.sectionName || ''}_Login-QR.png`;
    if (Platform.OS === 'web') {
      const anchor = document.createElement('a');
      anchor.href = await studentQrPngDataUrl(credential.qrPayload);
      anchor.download = filename;
      document.body.appendChild(anchor);
      try { anchor.click(); } finally { anchor.remove(); }
    } else {
      const base64 = await new Promise<string>((resolve, reject) => {
        if (!qrRef.current) return reject(new Error('QR preview is not ready.'));
        const timeout = setTimeout(() => reject(new Error('QR image export timed out. Please try again.')), 10000);
        try {
          qrRef.current.toDataURL((data) => { clearTimeout(timeout); resolve(data); });
        } catch (error) { clearTimeout(timeout); reject(error); }
      });
      const uri = `${FileSystem.cacheDirectory}${filename}`;
      await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Save Student Login QR' });
    }
    await audit('png');
  });

  const regenerate = () => alertCompat(
    'Replace this login QR?',
    'Any printed or saved copy of the current QR will stop working immediately. The student password does not change.',
    [{ text: 'Keep current QR', style: 'cancel' }, { text: 'Replace QR', style: 'destructive', onPress: async () => {
      setBusyLabel('Replacing QR…');
      setBusy(true);
      try { onRegenerated(await StudentLoginQrApi.regenerate(credential.student.id)); }
      catch (error) { alertCompat('Could not replace QR', error instanceof Error ? error.message : 'Try again.'); }
      finally { setBusy(false); }
    } }],
  );

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.previewCard} onPress={(event) => event.stopPropagation()}>
          <View style={styles.previewHeader}>
            <View style={styles.previewHeaderCopy}>
              <Text style={styles.previewEyebrow}>LOGIN QR CARD</Text>
              <Text style={styles.previewTitle}>{credential.student.name}</Text>
              <Text style={styles.previewMeta}>Class {classLabel}  ·  Admission {credential.student.admissionNo}</Text>
            </View>
            <Pressable onPress={onClose} style={styles.iconButton} accessibilityLabel="Close QR preview">
              <Ionicons name="close" size={22} color="#334155" />
            </Pressable>
          </View>

          <ScrollView style={styles.previewScroll} contentContainerStyle={styles.previewScrollContent} showsVerticalScrollIndicator={false}>
            <View style={styles.qrCardPreview}>
              {showRemoteLogo ? (
                <Image source={{ uri: remoteLogo as string }} style={styles.previewLogo} resizeMode="contain" onError={() => setLogoFailed(true)} />
              ) : (
                <Image source={SCHOOL_CONFIG.logo} style={styles.previewLogo} resizeMode="contain" />
              )}
              <Text style={styles.previewSchool}>{brand.name}</Text>
              <Text style={styles.previewScanHint}>Open SchoolIMS, then scan to sign in</Text>
              <View style={styles.qrPreviewWrap}>
                <QRCode value={credential.qrPayload} size={216} ecl="M" quietZone={24} />
              </View>
              <View style={styles.previewValidity}>
                <View style={[styles.createdChip, credential.created ? styles.createdChipNew : styles.createdChipExisting]}>
                  <Text style={[styles.createdChipText, credential.created ? styles.createdChipTextNew : styles.createdChipTextExisting]}>
                    {credential.created ? 'New QR issued' : 'Current QR'}
                  </Text>
                </View>
                {expiry ? <Text style={styles.previewExpiry}>Works until {expiry}</Text> : null}
              </View>
            </View>

            <View style={styles.privacyBox}>
              <Ionicons name="warning" size={18} color="#B45309" />
              <Text style={styles.privacyText}>
                Treat this like a password. Anyone who has this QR can sign in as {credential.student.name}.
              </Text>
            </View>

            <Text style={styles.actionGroupLabel}>Give this to the student</Text>
            <Pressable
              disabled={busy}
              style={styles.primaryPreviewButton}
              onPress={() => { void run('Preparing printable card…', async () => { await saveStudentQrPdf(printOptions, true); await audit('single_card_pdf'); }); }}
            >
              <Ionicons name="id-card-outline" size={20} color="#FFFFFF" />
              <View style={styles.actionCopy}>
                <Text style={styles.primaryPreviewButtonText}>Download printable card</Text>
                <Text style={styles.primaryPreviewButtonSub}>PDF with name, class, and QR</Text>
              </View>
            </Pressable>

            <View style={styles.actionGrid}>
              <Pressable disabled={busy} style={styles.secondaryButton} onPress={() => { void downloadPng(); }}>
                <Ionicons name="image-outline" size={18} color="#5B21B6" />
                <View style={styles.actionCopy}>
                  <Text style={styles.secondaryButtonText}>Save QR image</Text>
                  <Text style={styles.secondaryButtonHint}>PNG for WhatsApp or files</Text>
                </View>
              </Pressable>
              <Pressable
                disabled={busy}
                style={styles.secondaryButton}
                onPress={() => { void run('Opening print dialog…', async () => { await printStudentQrPdf(printOptions, true); await audit('print'); }); }}
              >
                <Ionicons name="print-outline" size={18} color="#5B21B6" />
                <View style={styles.actionCopy}>
                  <Text style={styles.secondaryButtonText}>Print now</Text>
                  <Text style={styles.secondaryButtonHint}>Opens the printer dialog</Text>
                </View>
              </Pressable>
            </View>

            <View style={styles.replaceBox}>
              <View style={{ flex: 1 }}>
                <Text style={styles.replaceTitle}>Lost, shared, or printed by mistake?</Text>
                <Text style={styles.replaceCopy}>Replace the QR. The old card stops working immediately. The student password does not change.</Text>
              </View>
              <Pressable disabled={busy} style={styles.replaceButton} onPress={regenerate}>
                <Ionicons name="refresh" size={16} color="#B91C1C" />
                <Text style={styles.replaceButtonText}>Replace QR</Text>
              </Pressable>
            </View>
          </ScrollView>

          {Platform.OS !== 'web' ? <View pointerEvents="none" style={styles.hiResQr}>
            <QRCode getRef={(ref) => { qrRef.current = ref; }} value={credential.qrPayload} size={1024} ecl="M" quietZone={128} />
          </View> : null}
          {busy ? (
            <View style={styles.busyOverlay}>
              <ActivityIndicator size="large" color="#7C3AED" />
              <Text style={styles.busyLabel}>{busyLabel}</Text>
            </View>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function StudentQrManagementScreen() {
  useRequireRole('admin', 'principal', 'accountant', 'accounts');
  const { width } = useWindowDimensions();
  const { theme, isDark } = useTheme();
  const { role } = useAuth();
  const router = useRouter();
  const { shellActive: accountsShell, openMobileNav } = useAccountsWebChrome();
  const [metadata, setMetadata] = useState<LoginQrMetadata | null>(null);
  const [students, setStudents] = useState<LoginQrStudent[]>([]);
  const [academicYearId, setAcademicYearId] = useState('');
  const [classId, setClassId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [issued, setIssued] = useState<Map<string, IssuedLoginQr>>(new Map());
  const [preview, setPreview] = useState<IssuedLoginQr | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const isWide = width >= 820;
  const PAGE_SIZE = 50;

  useEffect(() => {
    let live = true;
    StudentLoginQrApi.metadata().then((data) => {
      if (!live) return;
      setMetadata(data);
      setAcademicYearId(data.academicYears.find((year) => year.is_current)?.id || data.academicYears[0]?.id || '');
    }).catch((caught) => { if (live) setError(caught instanceof Error ? caught.message : 'Could not load QR management.'); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);

  const currentFilters = useMemo(() => ({
    academicYearId: academicYearId || undefined,
    classId: classId || undefined,
    sectionId: sectionId || undefined,
    search: search.trim() || undefined,
    status: 'active' as const,
  }), [academicYearId, classId, sectionId, search]);

  const loadStudents = useCallback(async (nextPage = 1) => {
    if (!metadata) return;
    setLoading(true); setError('');
    try {
      const result = await StudentLoginQrApi.students({ ...currentFilters, page: nextPage, limit: PAGE_SIZE });
      setStudents(result.rows);
      setPage(result.page);
      setTotal(result.total);
      setTotalPages(result.totalPages);
      setSelected((current) => {
        const visible = new Set(result.rows.map((student) => student.id));
        return new Set([...current].filter((id) => {
          if (!visible.has(id)) return true;
          return result.rows.some((student) => student.id === id && student.login_configured);
        }));
      });
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not load students.'); }
    finally { setLoading(false); }
  }, [metadata, currentFilters]);

  useEffect(() => {
    const timer = setTimeout(() => { void loadStudents(1); }, search ? 350 : 0);
    return () => clearTimeout(timer);
  }, [loadStudents, search]);

  const classSections = useMemo(() => (metadata?.classSections || []).filter((row) => !academicYearId || row.academic_year_id === academicYearId), [metadata, academicYearId]);
  const classOptions = useMemo(() => uniqOptions(classSections.map((row) => ({ value: row.class_id, label: row.class_name }))), [classSections]);
  const sectionOptions = useMemo(() => uniqOptions(classSections.filter((row) => !classId || row.class_id === classId).map((row) => ({ value: row.section_id, label: row.section_name }))), [classSections, classId]);
  const selectable = students.filter((student) => student.login_configured);
  const allSelected = selectable.length > 0 && selectable.every((student) => selected.has(student.id));
  const canPrintSheet = selected.size > 0 || Boolean(classId && sectionId);
  const brandedSchool = useMemo(() => brandedLoginQrSchool(metadata?.school || null), [metadata]);

  const toggle = (id: string) => setSelected((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const selectAll = () => setSelected(allSelected ? new Set() : new Set(selectable.map((student) => student.id)));

  const storeIssued = (credentials: IssuedLoginQr[]) => setIssued((current) => {
    const next = new Map(current); credentials.forEach((credential) => next.set(credential.student.id, credential)); return next;
  });

  const issueForStudents = async (targets: LoginQrStudent[]): Promise<IssuedLoginQr[]> => {
    const ready = targets.filter((student) => student.login_configured);
    if (!ready.length) throw new Error('Select at least one student with a configured login.');
    // The server reuses valid credentials and replaces expired ones. Local cache
    // cannot tell whether another administrator replaced a QR or reset a password.
    const collected: IssuedLoginQr[] = [];
    let failed = 0;
    for (let index = 0; index < ready.length; index += 200) {
      const result = await StudentLoginQrApi.bulk(ready.slice(index, index + 200).map((student) => student.id));
      const serviceFailure = result.failures.find((failure) => !['LOGIN_NOT_CONFIGURED', 'STUDENT_NOT_FOUND'].includes(failure.code));
      if (serviceFailure) {
        throw new Error(serviceFailure.code === 'LOGIN_QR_NOT_CONFIGURED'
          ? 'Login QR generation is not configured on the server. Contact your system administrator.'
          : serviceFailure.code === 'LOGIN_QR_KEY_ROTATED'
            ? 'The school QR key changed. Open View QR for the affected student to replace their QR.'
            : 'The server could not generate the QR cards. Please try again.');
      }
      storeIssued(result.credentials);
      collected.push(...result.credentials);
      failed += result.failures.length;
    }
    if (failed) alertCompat('Some QR codes were skipped', `${failed} student login${failed === 1 ? ' is' : 's are'} not configured or no longer active.`);
    if (!collected.length) throw new Error('No QR codes were generated. Check that the selected students have active logins.');
    return collected;
  };

  const resolvePrintableStudents = async (): Promise<LoginQrStudent[]> => {
    if (selected.size) {
      const pool = [...selected].some((id) => !students.some((student) => student.id === id))
        ? await fetchAllLoginQrStudents(currentFilters) : students;
      return pool.filter((student) => selected.has(student.id) && student.login_configured);
    }
    if (classId && sectionId) {
      return (await fetchAllLoginQrStudents(currentFilters)).filter((student) => student.login_configured);
    }
    throw new Error('Select students, or choose both a class and a section, to print QR cards.');
  };

  const generateOne = async (student: LoginQrStudent) => {
    setOpeningId(student.id);
    try {
      const credential = await StudentLoginQrApi.generate(student.id);
      storeIssued([credential]);
      setPreview(credential);
    } catch (caught) {
      if ((caught as { code?: string })?.code === 'LOGIN_QR_KEY_ROTATED') {
        alertCompat('Replace this login QR?', 'The school QR key changed. Replace this QR so it works with the current server. Previously printed copies will stop working.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Replace QR', style: 'destructive', onPress: async () => {
            setOpeningId(student.id);
            try {
              const credential = await StudentLoginQrApi.regenerate(student.id);
              storeIssued([credential]);
              setPreview(credential);
            } catch (error) { alertCompat('QR unavailable', error instanceof Error ? error.message : 'Could not replace this QR.'); }
            finally { setOpeningId(null); }
          } },
        ]);
      } else {
        alertCompat('QR unavailable', caught instanceof Error ? caught.message : 'Could not generate this QR.');
      }
    } finally {
      setOpeningId(null);
    }
  };

  const bulkGenerate = async () => {
    setWorking(true);
    try {
      const targets = await resolvePrintableStudents();
      const credentials = await issueForStudents(targets);
      alertCompat(
        'QR codes are ready',
        `${credentials.length} login QR ${credentials.length === 1 ? 'card is' : 'cards are'} ready. Download a printable sheet, or open View QR for one student.`,
      );
    } catch (caught) { alertCompat('Could not issue QR codes', caught instanceof Error ? caught.message : 'Try again.'); }
    finally { setWorking(false); }
  };

  const downloadA4 = () => {
    const run = async () => {
      setWorking(true);
      try {
        const targets = await resolvePrintableStudents();
        const pages = Math.ceil(targets.length / LOGIN_QR_CARDS_PER_PAGE);
        const credentials = await issueForStudents(targets);
        if (!credentials.length) throw new Error('No printable QR codes were generated.');
        const className = classOptions.find((option) => option.value === classId)?.label || 'Selected';
        const sectionName = sectionOptions.find((option) => option.value === sectionId)?.label || 'Students';
        const academicYear = metadata?.academicYears.find((year) => year.id === academicYearId)?.code || 'Current Year';
        await saveStudentQrPdf({ school: brandedSchool, academicYear, className, sectionName, credentials });
        await StudentLoginQrApi.auditExport({ exportType: 'a4_pdf', studentIds: credentials.map((item) => item.student.id), classId: classId || undefined, sectionId: sectionId || undefined });
        alertCompat('Printable sheet ready', `${credentials.length} cards · ${pages} page${pages === 1 ? '' : 's'} · ${LOGIN_QR_CARDS_PER_PAGE} cards per page.`);
      } catch (caught) { alertCompat('Could not create the sheet', caught instanceof Error ? caught.message : 'Could not generate the PDF.'); }
      finally { setWorking(false); }
    };

    const estimated = selected.size || total;
    const pages = Math.max(1, Math.ceil(estimated / LOGIN_QR_CARDS_PER_PAGE));
    const classLabel = classOptions.find((option) => option.value === classId)?.label;
    const sectionLabel = sectionOptions.find((option) => option.value === sectionId)?.label;
    const who = selected.size
      ? `${selected.size} selected student${selected.size === 1 ? '' : 's'}`
      : `every ready student in Class ${classLabel || ''} ${sectionLabel || ''}`.trim();
    alertCompat(
      'Download printable sheet?',
      `${who}\n${LOGIN_QR_CARDS_PER_PAGE} cards per A4 page · about ${pages} page${pages === 1 ? '' : 's'}\n\nEach card includes the student name, class, and a private login QR.`,
      [{ text: 'Cancel', style: 'cancel' }, { text: 'Download sheet', onPress: () => { void run(); } }],
    );
  };

  const selectAllMatching = async () => {
    setWorking(true);
    try {
      const all = await fetchAllLoginQrStudents(currentFilters);
      setSelected(new Set(all.filter((student) => student.login_configured).map((student) => student.id)));
    } catch (caught) { alertCompat('Could not select students', caught instanceof Error ? caught.message : 'Try again.'); }
    finally { setWorking(false); }
  };

  const configureLogin = (student: LoginQrStudent) => {
    const accountsPortal = role === 'accountant' || role === 'accounts';
    router.push({ pathname: accountsPortal ? '/accounts/addStudent' : '/admin/addStudent', params: { id: student.id } } as never);
  };
  const academicYearLabel = metadata?.academicYears.find((year) => year.id === academicYearId)?.code || 'Current Year';
  const isAccountsPortal = role === 'accountant' || role === 'accounts';
  const classLabel = classOptions.find((option) => option.value === classId)?.label;
  const sectionLabel = sectionOptions.find((option) => option.value === sectionId)?.label;
  const pageHeader = (
    <AdminHeader
      title="Student Login QR Codes"
      showBackButton
      hideAppSearch
      showMenuButton={isAccountsPortal && !accountsShell}
      onMenuPress={isAccountsPortal ? openMobileNav : undefined}
    />
  );

  if (!metadata && loading) return <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>{!accountsShell ? pageHeader : null}<View style={styles.center}><ActivityIndicator size="large" color="#7C3AED" /><Text style={styles.muted}>Loading secure QR workspace…</Text></View></View>;

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      {!accountsShell ? pageHeader : null}
      <FlatList
        data={students}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={<>
          <View style={[styles.hero, isDark && styles.darkCard]}>
            <View style={styles.heroIcon}><Ionicons name="qr-code" size={28} color="#FFFFFF" /></View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.heroTitle, isDark && styles.darkText]}>Print private student login cards</Text>
              <Text style={styles.heroCopy}>Each student scans their card in SchoolIMS to sign in. Passwords are never shown on screen or on the card.</Text>
            </View>
            <View style={styles.securityBadge}><Ionicons name="eye-off" size={14} color="#166534" /><Text style={styles.securityBadgeText}>PASSWORDS HIDDEN</Text></View>
          </View>
          <View style={[styles.filters, isWide && styles.filtersWide, isDark && styles.darkCard]}>
            <View style={styles.searchBox}><Ionicons name="search" size={18} color="#64748B" /><TextInput value={search} onChangeText={setSearch} placeholder="Search name, admission no, or login" placeholderTextColor="#94A3B8" style={styles.searchInput} autoCapitalize="none" /></View>
            <View style={styles.filterRow}>
              <FilterPicker label="Academic Year" value={academicYearId} options={(metadata?.academicYears || []).map((year) => ({ value: year.id, label: year.code }))} onChange={(value) => { setAcademicYearId(value); setClassId(''); setSectionId(''); }} />
              <FilterPicker label="Class" value={classId} options={classOptions} onChange={(value) => { setClassId(value); setSectionId(''); }} />
              <FilterPicker label="Section" value={sectionId} options={sectionOptions} onChange={setSectionId} />
              <View style={styles.statusFilterChip}><View style={styles.activeDot} /><Text style={styles.statusFilterText}>Active students only</Text></View>
            </View>
          </View>
          <View style={styles.toolbar}>
            <Pressable style={styles.selectAllButton} onPress={selectAll}><Ionicons name={allSelected ? 'checkbox' : 'square-outline'} size={21} color="#6D28D9" /><Text style={styles.selectAllText}>Select this page ({selectable.length})</Text></Pressable>
            {total > students.length ? <Pressable style={styles.selectAllButton} onPress={() => { void selectAllMatching(); }}><Ionicons name="checkmark-done-outline" size={21} color="#6D28D9" /><Text style={styles.selectAllText}>Select every match ({total})</Text></Pressable> : null}
            <Text style={styles.selectedCount}>{selected.size ? `${selected.size} selected` : `${total} students`}</Text>
            <View style={styles.toolbarActions}>
              <Pressable disabled={working} onPress={() => { void loadStudents(page); }} style={styles.iconToolbarButton} accessibilityLabel="Refresh student list">
                <Ionicons name="refresh-outline" size={18} color="#6D28D9" />
              </Pressable>
              <Pressable disabled={working || !canPrintSheet} onPress={() => { void bulkGenerate(); }} style={[styles.outlineButton, !canPrintSheet && styles.disabledAction]}>
                <Ionicons name="qr-code-outline" size={17} color="#6D28D9" />
                <Text style={styles.outlineButtonText}>{selected.size ? `Issue selected (${selected.size})` : classId && sectionId ? 'Issue this class' : 'Issue QR codes'}</Text>
              </Pressable>
              <Pressable disabled={working || !canPrintSheet} onPress={downloadA4} style={[styles.primaryAction, !canPrintSheet && styles.disabledAction]}>
                <Ionicons name="download-outline" size={18} color="#FFFFFF" />
                <Text style={styles.primaryActionText}>Download printable sheet</Text>
              </Pressable>
            </View>
          </View>
          <Text style={styles.toolbarHint}>
            {selected.size
              ? `Print ${selected.size} selected card${selected.size === 1 ? '' : 's'} as an A4 sheet (${LOGIN_QR_CARDS_PER_PAGE} per page).`
              : classId && sectionId
                ? `Print every ready student in Class ${classLabel || ''} ${sectionLabel || ''}.`
                : 'Select students, or choose both class and section, to print an A4 sheet of QR cards.'}
          </Text>
          {error ? <View style={styles.errorBanner}><Ionicons name="alert-circle" size={18} color="#B91C1C" /><Text style={styles.errorBannerText}>{error}</Text><Pressable onPress={() => { void loadStudents(page); }}><Text style={styles.retryText}>Retry</Text></Pressable></View> : null}
          {working ? <View style={styles.workingBanner}><ActivityIndicator size="small" color="#6D28D9" /><Text style={styles.workingText}>Preparing login QR cards…</Text></View> : null}
          {isWide ? <View style={styles.tableHeader}><Text style={[styles.headerCell, { width: 54 }]}>SELECT</Text><Text style={[styles.headerCell, { flex: 2 }]}>STUDENT</Text><Text style={[styles.headerCell, { flex: 1 }]}>CLASS</Text><Text style={[styles.headerCell, { flex: 1.5 }]}>STATUS</Text><Text style={[styles.headerCell, { width: 116 }]}>ACTION</Text></View> : null}
        </>}
        renderItem={({ item }) => {
          const checked = selected.has(item.id);
          const status = loginQrStatus(item, issued);
          const opening = openingId === item.id;
          return <View style={[styles.studentRow, !isWide && styles.studentCard, isDark && styles.darkCard]}>
            <Pressable disabled={!item.login_configured} onPress={() => toggle(item.id)} style={styles.checkboxCell}><Ionicons name={checked ? 'checkbox' : 'square-outline'} size={23} color={item.login_configured ? '#6D28D9' : '#CBD5E1'} /></Pressable>
            <View style={styles.studentMain}><View style={styles.avatar}><Text style={styles.avatarText}>{item.name.slice(0, 1).toUpperCase()}</Text></View><View style={{ flex: 1 }}><Text numberOfLines={2} style={[styles.studentName, isDark && styles.darkText]}>{item.name}</Text><Text style={styles.studentSub}>Adm. {item.admission_no}{item.login_email ? ` · ${item.login_email}` : ''}</Text></View></View>
            <Text style={[styles.classCell, !isWide && styles.mobileMeta]}>Class {item.class_name} - {item.section_name}</Text>
            <View style={[styles.statusCell, status.tone === 'ready' ? styles.readyStatus : status.tone === 'idle' ? styles.idleStatus : styles.missingStatus]}>
              <View style={[styles.statusDot, { backgroundColor: status.tone === 'ready' ? '#16A34A' : status.tone === 'idle' ? '#7C3AED' : '#D97706' }]} />
              <Text style={[styles.statusText, { color: status.tone === 'ready' ? '#166534' : status.tone === 'idle' ? '#5B21B6' : '#92400E' }]}>{status.label}</Text>
            </View>
            <Pressable
              disabled={opening}
              style={[styles.rowAction, !item.login_configured && styles.configureAction]}
              onPress={() => item.login_configured ? generateOne(item) : configureLogin(item)}
            >
              {opening ? <ActivityIndicator size="small" color="#6D28D9" /> : <Ionicons name={item.login_configured ? (status.tone === 'ready' ? 'eye-outline' : 'qr-code-outline') : 'key-outline'} size={16} color={item.login_configured ? '#6D28D9' : '#92400E'} />}
              <Text style={[styles.rowActionText, !item.login_configured && { color: '#92400E' }]}>
                {item.login_configured ? (opening ? 'Opening' : status.tone === 'ready' ? 'View QR' : 'Create QR') : 'Set up login'}
              </Text>
            </Pressable>
          </View>;
        }}
        ListEmptyComponent={!loading ? <View style={styles.empty}><Ionicons name="people-outline" size={42} color="#94A3B8" /><Text style={[styles.emptyTitle, isDark && styles.darkText]}>No active students found</Text><Text style={styles.muted}>Try another class, section, academic year, or search.</Text></View> : null}
        ListFooterComponent={loading ? <View style={styles.center}><ActivityIndicator color="#7C3AED" /><Text style={styles.muted}>Loading students…</Text></View> : <View style={styles.pagination}>
          <Text style={styles.footerNote}>{total} active students · page {page} of {totalPages} · {academicYearLabel}</Text>
          {totalPages > 1 ? <View style={styles.pagerRow}>
            <Pressable disabled={page <= 1 || working} onPress={() => { void loadStudents(page - 1); }} style={[styles.pagerButton, page <= 1 && styles.pagerDisabled]}><Text style={styles.pagerText}>Previous</Text></Pressable>
            <Pressable disabled={page >= totalPages || working} onPress={() => { void loadStudents(page + 1); }} style={[styles.pagerButton, page >= totalPages && styles.pagerDisabled]}><Text style={styles.pagerText}>Next</Text></Pressable>
          </View> : null}
        </View>}
      />
      <PreviewModal credential={preview} school={brandedSchool} academicYear={academicYearLabel} onClose={() => setPreview(null)} onRegenerated={(next) => { storeIssued([next]); setPreview(next); void loadStudents(page); }} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, content: { padding: 18, paddingBottom: 44, maxWidth: 1180, width: '100%', alignSelf: 'center' }, center: { minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: 12 }, muted: { color: '#64748B', fontSize: 13, textAlign: 'center' }, darkText: { color: '#F8FAFC' }, darkCard: { backgroundColor: '#121827', borderColor: '#263044' },
  hero: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 22, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14 }, heroIcon: { width: 54, height: 54, borderRadius: 17, backgroundColor: '#6D28D9', alignItems: 'center', justifyContent: 'center' }, heroTitle: { color: '#0F172A', fontSize: 19, fontWeight: '800' }, heroCopy: { color: '#64748B', fontSize: 13, lineHeight: 19, marginTop: 3 }, securityBadge: { flexDirection: 'row', gap: 5, alignItems: 'center', backgroundColor: '#DCFCE7', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 7 }, securityBadgeText: { color: '#166534', fontSize: 9, fontWeight: '900', letterSpacing: .7 },
  filters: { borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF', borderRadius: 18, padding: 14, marginBottom: 14 }, filtersWide: { flexDirection: 'row', alignItems: 'center', gap: 12 }, searchBox: { flex: 1.3, minWidth: 220, height: 48, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF', borderRadius: 12, paddingHorizontal: 13 }, searchInput: { flex: 1, color: '#0F172A', fontSize: 14, outlineStyle: 'none' } as never, filterRow: { flex: 2, flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 10 }, filterField: { minWidth: 128, flex: 1, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC', borderRadius: 11, paddingHorizontal: 11, paddingVertical: 7 }, filterLabel: { color: '#64748B', fontSize: 9, fontWeight: '800', letterSpacing: .5, textTransform: 'uppercase' }, filterValueRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }, filterValue: { flex: 1, color: '#1E293B', fontWeight: '700', fontSize: 12 }, activeDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#22C55E' },
  statusFilterChip: { minWidth: 148, flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'stretch', borderWidth: 1, borderColor: '#DCFCE7', backgroundColor: '#F0FDF4', borderRadius: 11, paddingHorizontal: 11, paddingVertical: 10 }, statusFilterText: { color: '#166534', fontSize: 12, fontWeight: '800' },
  toolbar: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 6 }, selectAllButton: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 8 }, selectAllText: { color: '#5B21B6', fontWeight: '800', fontSize: 12 }, selectedCount: { color: '#64748B', fontSize: 12 }, toolbarActions: { marginLeft: 'auto', flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, toolbarHint: { color: '#64748B', fontSize: 12, lineHeight: 17, marginBottom: 12 }, iconToolbarButton: { width: 40, height: 40, borderRadius: 11, borderWidth: 1, borderColor: '#C4B5FD', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' }, outlineButton: { minHeight: 40, paddingHorizontal: 12, borderRadius: 11, borderWidth: 1, borderColor: '#C4B5FD', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFFFFF' }, outlineButtonText: { color: '#5B21B6', fontSize: 12, fontWeight: '800' }, primaryAction: { minHeight: 40, paddingHorizontal: 13, borderRadius: 11, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#6D28D9' }, primaryActionText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' }, disabledAction: { opacity: 0.45 },
  tableHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 9, backgroundColor: '#F1F5F9', borderTopLeftRadius: 12, borderTopRightRadius: 12 }, headerCell: { color: '#64748B', fontSize: 9, fontWeight: '900', letterSpacing: .7 }, studentRow: { minHeight: 72, backgroundColor: '#FFFFFF', borderWidth: 1, borderTopWidth: 0, borderColor: '#E2E8F0', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, gap: 10 }, studentCard: { borderTopWidth: 1, borderRadius: 15, marginBottom: 10, flexWrap: 'wrap' }, checkboxCell: { width: 44 }, studentMain: { flex: 2, minWidth: 180, flexDirection: 'row', alignItems: 'center', gap: 10 }, avatar: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#EDE9FE', alignItems: 'center', justifyContent: 'center' }, avatarText: { color: '#6D28D9', fontWeight: '900' }, studentName: { color: '#172033', fontSize: 13, fontWeight: '800' }, studentSub: { color: '#64748B', fontSize: 10, marginTop: 3 }, classCell: { flex: 1, color: '#475569', fontSize: 12, fontWeight: '700' }, mobileMeta: { flexBasis: '45%', marginLeft: 54 }, statusCell: { flex: 1.5, minWidth: 120, flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', paddingHorizontal: 9, paddingVertical: 7, borderRadius: 9 }, readyStatus: { backgroundColor: '#F0FDF4' }, idleStatus: { backgroundColor: '#F5F3FF' }, missingStatus: { backgroundColor: '#FFFBEB' }, statusDot: { width: 7, height: 7, borderRadius: 4 }, statusText: { fontSize: 10, fontWeight: '800' }, rowAction: { width: 116, height: 36, borderRadius: 10, backgroundColor: '#F5F3FF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 }, configureAction: { backgroundColor: '#FFF7ED' }, rowActionText: { color: '#5B21B6', fontSize: 11, fontWeight: '800' },
  errorBanner: { borderRadius: 12, padding: 12, backgroundColor: '#FEF2F2', flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }, errorBannerText: { color: '#991B1B', flex: 1, fontSize: 12 }, retryText: { color: '#B91C1C', fontWeight: '900' }, workingBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, marginBottom: 8, borderRadius: 10, backgroundColor: '#F5F3FF' }, workingText: { color: '#5B21B6', fontWeight: '700', fontSize: 12 }, empty: { minHeight: 240, alignItems: 'center', justifyContent: 'center', gap: 8 }, emptyTitle: { color: '#1E293B', fontSize: 17, fontWeight: '800' }, footerNote: { textAlign: 'center', color: '#94A3B8', fontSize: 11, marginTop: 18 }, pagination: { alignItems: 'center', gap: 10, marginTop: 8 }, pagerRow: { flexDirection: 'row', gap: 8 }, pagerButton: { minHeight: 36, paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#F5F3FF', justifyContent: 'center' }, pagerDisabled: { opacity: 0.45 }, pagerText: { color: '#5B21B6', fontWeight: '800', fontSize: 12 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(2,6,23,.64)', padding: 18, alignItems: 'center', justifyContent: 'center' }, pickerCard: { width: '100%', maxWidth: 440, maxHeight: '70%', borderRadius: 20, padding: 16, backgroundColor: '#FFFFFF' }, pickerTitle: { color: '#0F172A', fontSize: 18, fontWeight: '800', marginBottom: 10 }, pickerOption: { minHeight: 48, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 10 }, pickerOptionActive: { backgroundColor: '#F5F3FF' }, pickerOptionText: { color: '#475569', fontWeight: '600' }, pickerOptionTextActive: { color: '#5B21B6', fontWeight: '800' },
  previewCard: { width: '100%', maxWidth: 520, maxHeight: '92%', borderRadius: 24, backgroundColor: '#FFFFFF', overflow: 'hidden' }, previewHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 18, paddingBottom: 12 }, previewHeaderCopy: { flex: 1, paddingRight: 12 }, previewEyebrow: { color: '#7C3AED', fontSize: 9, fontWeight: '900', letterSpacing: 1 }, previewTitle: { color: '#0F172A', fontSize: 22, fontWeight: '800', marginTop: 3 }, iconButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' }, previewMeta: { color: '#64748B', fontSize: 12, marginTop: 6 }, previewScroll: { flexGrow: 0, flexShrink: 1 }, previewScrollContent: { paddingHorizontal: 20, paddingBottom: 20 }, qrCardPreview: { alignItems: 'center', borderWidth: 1, borderColor: '#EDE9FE', backgroundColor: '#FAF8FF', borderRadius: 18, paddingVertical: 16, paddingHorizontal: 16 }, previewLogo: { width: 52, height: 52 }, previewSchool: { textAlign: 'center', color: '#0F172A', fontWeight: '800', marginTop: 8, fontSize: 15 }, previewScanHint: { textAlign: 'center', color: '#6D28D9', fontWeight: '700', fontSize: 12, marginTop: 4 }, qrPreviewWrap: { alignSelf: 'center', marginTop: 14, marginBottom: 12, padding: 8, borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#FFFFFF' }, previewValidity: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }, createdChip: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 }, createdChipNew: { backgroundColor: '#DCFCE7' }, createdChipExisting: { backgroundColor: '#EDE9FE' }, createdChipText: { fontSize: 10, fontWeight: '800' }, createdChipTextNew: { color: '#166534' }, createdChipTextExisting: { color: '#5B21B6' }, previewExpiry: { color: '#64748B', fontSize: 11, fontWeight: '700' },
  privacyBox: { backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', borderRadius: 12, padding: 11, flexDirection: 'row', gap: 8, marginTop: 14 }, privacyText: { flex: 1, color: '#78350F', fontSize: 12, lineHeight: 17, fontWeight: '600' }, actionGroupLabel: { marginTop: 16, marginBottom: 8, color: '#64748B', fontSize: 10, fontWeight: '900', letterSpacing: 0.6, textTransform: 'uppercase' }, primaryPreviewButton: { minHeight: 56, borderRadius: 14, paddingHorizontal: 14, backgroundColor: '#6D28D9', flexDirection: 'row', alignItems: 'center', gap: 10 }, primaryPreviewButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' }, primaryPreviewButtonSub: { color: 'rgba(255,255,255,.82)', fontSize: 11, marginTop: 1 }, actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }, secondaryButton: { flexGrow: 1, minWidth: '46%', minHeight: 58, borderWidth: 1, borderColor: '#DDD6FE', borderRadius: 12, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8, backgroundColor: '#FAF9FF' }, secondaryButtonText: { color: '#5B21B6', fontSize: 12, fontWeight: '800' }, secondaryButtonHint: { color: '#7C3AED', fontSize: 10, marginTop: 1 }, actionCopy: { flex: 1 }, replaceBox: { marginTop: 14, borderWidth: 1, borderColor: '#FECACA', backgroundColor: '#FFF7F7', borderRadius: 14, padding: 12, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12 }, replaceTitle: { color: '#7F1D1D', fontSize: 12, fontWeight: '800' }, replaceCopy: { color: '#9F1239', fontSize: 11, lineHeight: 16, marginTop: 3 }, replaceButton: { minHeight: 40, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: '#FECACA', backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', gap: 5 }, replaceButtonText: { color: '#B91C1C', fontSize: 11, fontWeight: '800' }, busyOverlay: { ...StyleSheet.absoluteFillObject, borderRadius: 24, backgroundColor: 'rgba(255,255,255,.82)', alignItems: 'center', justifyContent: 'center', gap: 10 }, busyLabel: { color: '#5B21B6', fontWeight: '700', fontSize: 13 },
  hiResQr: { position: 'absolute', left: -2000, top: 0, width: 1024, height: 1024 },
});
