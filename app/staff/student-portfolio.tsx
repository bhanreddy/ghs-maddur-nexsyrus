import { TourTarget, TourScrollView } from '@/src/features/app-tour';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Image,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import * as Print from 'expo-print';

import StaffHeader from '../../src/components/StaffHeader';
import ViewAsBanner from '../../src/components/ViewAsBanner';
import LogoLoader from '../../src/components/LogoLoader';
import { useTheme } from '../../src/hooks/useTheme';
import { useEffectiveStaffId } from '../../src/hooks/useEffectiveStaffId';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import { copyToClipboard } from '../../src/utils/copyToClipboard';
import {
  PortfolioExam,
  PortfolioStudentSummary,
  StudentPortfolioDetail,
  StudentPortfolioList,
  StudentPortfolioService,
} from '../../src/services/studentPortfolioService';

const INDIGO = '#4F46E5';
const EMERALD = '#059669';
const AMBER = '#D97706';
const ROSE = '#E11D48';

function initials(name: string) {
  return String(name || 'Student')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function display(value: unknown) {
  return value == null || value === '' ? '—' : String(value);
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function ageFromDob(value?: string | null) {
  if (!value) return null;
  const dob = new Date(`${value}T00:00:00`);
  if (Number.isNaN(dob.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const beforeBirthday =
    today.getMonth() < dob.getMonth() ||
    (today.getMonth() === dob.getMonth() && today.getDate() < dob.getDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 ? age : null;
}

function htmlEscape(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function portfolioText(detail: StudentPortfolioDetail) {
  const { student, attendance, results, counts, school } = detail;
  const parents = (student.parents || [])
    .map((parent) =>
      `${parent.relationship || 'Parent'}: ${parent.name}` +
      `${parent.phone ? ` · ${parent.phone}` : ''}` +
      `${parent.occupation ? ` · ${parent.occupation}` : ''}`
    )
    .join('\n');
  const exams = results.preview
    .map((exam) => `${exam.exam_name}: ${exam.percentage}% (${exam.obtained}/${exam.maximum})`)
    .join('\n');
  return [
    school?.name || 'School',
    'STUDENT PORTFOLIO',
    '',
    `Name: ${student.display_name}`,
    `Class: ${student.class_name}-${student.section_name}`,
    `Roll No: ${display(student.roll_number)}`,
    `Admission No: ${student.admission_no}`,
    `DOB: ${formatDate(student.dob)}`,
    `Gender: ${display(student.gender)}`,
    `Blood Group: ${display(student.blood_group)}`,
    `Village: ${display(student.village)}`,
    `Student Phone: ${display(student.phone)}`,
    `Student Email: ${display(student.email)}`,
    '',
    `Attendance: ${attendance.percentage}% (${attendance.total_days} marked days)`,
    `Results: ${results.percentage}% (${results.exam_count} exams)`,
    `Complaints: ${counts.complaints}`,
    `Parent Visits: ${counts.parent_visits}`,
    '',
    'PARENTS / GUARDIANS',
    parents || 'No parent details available',
    '',
    'RESULTS PREVIEW',
    exams || 'No results recorded',
  ].join('\n');
}

function buildPortfolioHtml(detail: StudentPortfolioDetail) {
  const { student, attendance, results, counts, school } = detail;
  const information = [
    ['Admission No.', student.admission_no],
    ['Roll No.', student.roll_number],
    ['PEN', student.pen_number],
    ['APAAR', student.apar_number],
    ['Date of Birth', formatDate(student.dob)],
    ['Gender', student.gender],
    ['Blood Group', student.blood_group],
    ['Category', student.category],
    ['Religion', student.religion],
    ['Nationality', student.nationality],
    ['Admission Date', formatDate(student.admission_date)],
    ['Village', student.village],
    ['Phone', student.phone],
    ['Email', student.email],
  ];
  const parents = (student.parents || []).map((parent) => `
    <div class="parent">
      <strong>${htmlEscape(parent.name)}</strong>
      <span>${htmlEscape(parent.relationship || 'Parent / Guardian')}</span>
      <span>${htmlEscape(parent.phone || 'No phone')}</span>
      <span>${htmlEscape(parent.occupation || 'Occupation not recorded')}</span>
    </div>
  `).join('');
  const exams = results.preview.map((exam) => `
    <tr>
      <td>${htmlEscape(exam.exam_name)}</td>
      <td>${htmlEscape(exam.exam_type || 'Exam')}</td>
      <td>${exam.subjects_count}</td>
      <td>${exam.obtained}/${exam.maximum}</td>
      <td><strong>${exam.percentage}%</strong></td>
    </tr>
  `).join('');

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <style>
        @page { size: A4; margin: 16mm; }
        * { box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #172033; margin: 0; }
        .school { color: #4F46E5; font-weight: 800; font-size: 13px; letter-spacing: .5px; }
        .title { font-size: 24px; font-weight: 900; margin: 5px 0 18px; }
        .hero { display: flex; gap: 18px; align-items: center; padding: 18px; border-radius: 18px; background: #F1F3FF; }
        .photo { width: 86px; height: 86px; border-radius: 18px; object-fit: cover; background: #E0E7FF; }
        .avatar { width: 86px; height: 86px; border-radius: 18px; background: #4F46E5; color: white; display: flex; align-items: center; justify-content: center; font-size: 28px; font-weight: 900; }
        h1 { font-size: 23px; margin: 0 0 5px; }
        .muted { color: #64748B; font-size: 12px; }
        .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 16px 0; }
        .stat { padding: 11px; border: 1px solid #E4E8F0; border-radius: 12px; }
        .stat b { display: block; font-size: 20px; color: #312E81; }
        .stat span { color: #64748B; font-size: 10px; text-transform: uppercase; }
        h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .8px; margin: 20px 0 9px; color: #4338CA; }
        .info { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
        .field { padding: 9px; background: #F8FAFC; border-radius: 9px; }
        .field small { display: block; color: #64748B; margin-bottom: 3px; }
        .field strong { font-size: 12px; overflow-wrap: anywhere; }
        .parents { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
        .parent { border: 1px solid #E4E8F0; border-radius: 10px; padding: 10px; }
        .parent span { display: block; color: #64748B; font-size: 11px; margin-top: 3px; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; }
        th { text-align: left; color: #64748B; background: #F8FAFC; }
        td, th { border-bottom: 1px solid #E4E8F0; padding: 8px; }
        .footer { margin-top: 22px; color: #94A3B8; font-size: 9px; text-align: center; }
      </style>
    </head>
    <body>
      <div class="school">${htmlEscape(school?.name || 'School')}</div>
      <div class="title">Student Portfolio</div>
      <div class="hero">
        ${student.photo_url
          ? `<img class="photo" src="${htmlEscape(student.photo_url)}" />`
          : `<div class="avatar">${htmlEscape(initials(student.display_name))}</div>`}
        <div>
          <h1>${htmlEscape(student.display_name)}</h1>
          <div class="muted">Class ${htmlEscape(student.class_name)}-${htmlEscape(student.section_name)} · Roll ${htmlEscape(display(student.roll_number))}</div>
          <div class="muted">Admission No. ${htmlEscape(student.admission_no)} · Academic Year ${htmlEscape(student.academic_year)}</div>
        </div>
      </div>
      <div class="stats">
        <div class="stat"><b>${attendance.percentage}%</b><span>Total attendance</span></div>
        <div class="stat"><b>${results.percentage}%</b><span>Result average</span></div>
        <div class="stat"><b>${counts.complaints}</b><span>Complaints</span></div>
        <div class="stat"><b>${counts.parent_visits}</b><span>Parent visits</span></div>
      </div>
      <h2>Student information</h2>
      <div class="info">
        ${information.map(([label, value]) => `<div class="field"><small>${htmlEscape(label)}</small><strong>${htmlEscape(display(value))}</strong></div>`).join('')}
      </div>
      <h2>Parents / Guardians</h2>
      <div class="parents">${parents || '<div class="muted">No parent details available</div>'}</div>
      <h2>Attendance breakdown</h2>
      <div class="info">
        <div class="field"><small>Marked days</small><strong>${attendance.total_days}</strong></div>
        <div class="field"><small>Present</small><strong>${attendance.present}</strong></div>
        <div class="field"><small>Late</small><strong>${attendance.late}</strong></div>
        <div class="field"><small>Absent</small><strong>${attendance.absent}</strong></div>
        <div class="field"><small>Half day</small><strong>${attendance.half_day}</strong></div>
      </div>
      <h2>Results preview</h2>
      ${exams ? `<table><thead><tr><th>Exam</th><th>Type</th><th>Subjects</th><th>Marks</th><th>%</th></tr></thead><tbody>${exams}</tbody></table>` : '<div class="muted">No results recorded</div>'}
      <div class="footer">Generated ${htmlEscape(new Date().toLocaleString('en-IN'))} · Read-only staff portfolio</div>
    </body>
  </html>`;
}

function MetricCard({
  icon,
  label,
  value,
  hint,
  color,
  isDark,
  compact = false,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: string;
  hint: string;
  color: string;
  isDark: boolean;
  compact?: boolean;
}) {
  return (
    <View style={[styles.metricCard, compact && styles.metricCardCompact, { backgroundColor: isDark ? '#172033' : '#FFFFFF', borderColor: `${color}28` }]}>
      <View style={[styles.metricIcon, { backgroundColor: `${color}16` }]}>
        <Ionicons name={icon} size={17} color={color} />
      </View>
      <Text style={[styles.metricValue, { color: isDark ? '#F8FAFC' : '#111827' }]}>{value}</Text>
      <Text style={[styles.metricLabel, { color }]}>{label}</Text>
      <Text style={[styles.metricHint, { color: isDark ? '#8390A5' : '#64748B' }]}>{hint}</Text>
    </View>
  );
}

function StudentAvatar({
  name,
  photo,
  size = 52,
}: {
  name: string;
  photo?: string | null;
  size?: number;
}) {
  if (photo) {
    return <Image source={{ uri: photo }} style={{ width: size, height: size, borderRadius: size * 0.32 }} />;
  }
  return (
    <View style={[styles.avatarFallback, { width: size, height: size, borderRadius: size * 0.32 }]}>
      <Text style={[styles.avatarFallbackText, { fontSize: size * 0.28 }]}>{initials(name)}</Text>
    </View>
  );
}

function RosterCard({
  student,
  active,
  onPress,
  isDark,
}: {
  student: PortfolioStudentSummary;
  active: boolean;
  onPress: () => void;
  isDark: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open ${student.display_name}'s portfolio`}
      style={[
        styles.rosterCard,
        {
          backgroundColor: active ? (isDark ? '#25245A' : '#EEF2FF') : (isDark ? '#172033' : '#FFFFFF'),
          borderColor: active ? '#6366F1' : (isDark ? '#293449' : '#E5EAF2'),
        },
      ]}
    >
      <StudentAvatar name={student.display_name} photo={student.photo_url} />
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={[styles.rosterName, { color: isDark ? '#F8FAFC' : '#111827' }]}>
          {student.display_name}
        </Text>
        <Text style={[styles.rosterMeta, { color: isDark ? '#8390A5' : '#64748B' }]}>
          Roll {display(student.roll_number)} · {student.admission_no}
        </Text>
        <View style={styles.rosterChips}>
          <Text style={[styles.miniChip, { color: EMERALD, backgroundColor: `${EMERALD}13` }]}>
            {student.attendance_percentage}% attendance
          </Text>
          <Text style={[styles.miniChip, { color: INDIGO, backgroundColor: `${INDIGO}12` }]}>
            {student.result_percentage}% results
          </Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={17} color={active ? '#6366F1' : '#94A3B8'} />
    </Pressable>
  );
}

function InfoField({ label, value, isDark }: { label: string; value: unknown; isDark: boolean }) {
  return (
    <View style={[styles.infoField, { backgroundColor: isDark ? '#111827' : '#F8FAFC' }]}>
      <Text style={[styles.infoLabel, { color: isDark ? '#8390A5' : '#64748B' }]}>{label}</Text>
      <Text selectable style={[styles.infoValue, { color: isDark ? '#F1F5F9' : '#1F2937' }]}>
        {display(value)}
      </Text>
    </View>
  );
}

function ExamRow({ exam, isDark }: { exam: PortfolioExam; isDark: boolean }) {
  const color = exam.percentage >= 75 ? EMERALD : exam.percentage >= 50 ? AMBER : ROSE;
  return (
    <View style={[styles.examRow, { borderBottomColor: isDark ? '#263248' : '#E8ECF3' }]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.examName, { color: isDark ? '#F8FAFC' : '#111827' }]}>{exam.exam_name}</Text>
        <Text style={[styles.examMeta, { color: isDark ? '#8390A5' : '#64748B' }]}>
          {exam.subjects_count} subjects · {exam.obtained}/{exam.maximum}
        </Text>
      </View>
      <View style={[styles.examScore, { backgroundColor: `${color}16` }]}>
        <Text style={[styles.examScoreText, { color }]}>{exam.percentage}%</Text>
      </View>
    </View>
  );
}

export default function StudentPortfolioScreen() {
  const { isDark } = useTheme();
  const { width } = useWindowDimensions();
  const isCompact = width < 800;
  const isWide = width >= 980;
  const { staffId, isViewingAsAdmin, viewAsName } = useEffectiveStaffId();
  const pageScrollRef = useRef<ScrollView>(null);
  const [roster, setRoster] = useState<StudentPortfolioList | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const [detail, setDetail] = useState<StudentPortfolioDetail | null>(null);
  const [compactDetailOpen, setCompactDetailOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadDetail = useCallback(async (studentId: string) => {
    selectedIdRef.current = studentId;
    setSelectedId(studentId);
    setDetailLoading(true);
    try {
      const data = await StudentPortfolioService.getStudent(studentId, isViewingAsAdmin ? staffId : undefined);
      setDetail(data);
    } catch (error: any) {
      setDetail(null);
      alertCompat('Could not load portfolio', error?.message || 'Please try again.');
    } finally {
      setDetailLoading(false);
    }
  }, [isViewingAsAdmin, staffId]);

  const loadRoster = useCallback(async (pull = false) => {
    if (pull) setRefreshing(true);
    else setLoading(true);
    try {
      const data = await StudentPortfolioService.getRoster(isViewingAsAdmin ? staffId : undefined);
      setRoster(data);
      const currentId = selectedIdRef.current;
      const nextId = currentId && data.students.some((student) => student.id === currentId)
        ? currentId
        : data.students[0]?.id;
      if (nextId) await loadDetail(nextId);
      else {
        selectedIdRef.current = null;
        setSelectedId(null);
        setDetail(null);
      }
    } catch (error: any) {
      setRoster(null);
      setDetail(null);
      alertCompat('Could not load student portfolios', error?.message || 'Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isViewingAsAdmin, loadDetail, staffId]);

  useFocusEffect(
    useCallback(() => {
      void loadRoster();
    }, [loadRoster])
  );

  const filteredStudents = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return roster?.students || [];
    return (roster?.students || []).filter((student) =>
      [student.display_name, student.admission_no, student.roll_number]
        .some((value) => String(value ?? '').toLowerCase().includes(query))
    );
  }, [roster?.students, search]);

  const selectedIndex = useMemo(
    () => (roster?.students || []).findIndex((student) => student.id === selectedId),
    [roster?.students, selectedId]
  );

  const scrollToTop = useCallback(() => {
    requestAnimationFrame(() => pageScrollRef.current?.scrollTo({ y: 0, animated: false }));
  }, []);

  const openStudent = useCallback((studentId: string) => {
    if (isCompact) {
      setCompactDetailOpen(true);
      scrollToTop();
    }
    void loadDetail(studentId);
  }, [isCompact, loadDetail, scrollToTop]);

  const closeCompactDetail = useCallback(() => {
    setCompactDetailOpen(false);
    scrollToTop();
  }, [scrollToTop]);

  const openAdjacentStudent = useCallback((direction: -1 | 1) => {
    const students = roster?.students || [];
    if (!students.length || selectedIndex < 0) return;
    const next = students[selectedIndex + direction];
    if (next) openStudent(next.id);
  }, [openStudent, roster?.students, selectedIndex]);

  const handlePrint = async () => {
    if (!detail) return;
    try {
      await Print.printAsync({ html: buildPortfolioHtml(detail) });
    } catch (error: any) {
      alertCompat('Print failed', error?.message || 'Could not open the print dialog.');
    }
  };

  const handleShare = async () => {
    if (!detail) return;
    try {
      if (Platform.OS === 'web') {
        if (typeof navigator !== 'undefined' && navigator.share) {
          await navigator.share({
            title: `${detail.student.display_name} · Student Portfolio`,
            text: portfolioText(detail),
          });
          return;
        }
        const copied = await copyToClipboard(portfolioText(detail));
        alertCompat(copied ? 'Portfolio copied' : 'Share unavailable', copied
          ? 'Web Share is unavailable, so the portfolio summary was copied.'
          : 'Sharing is not available in this browser.');
        return;
      }
      const { uri } = await Print.printToFileAsync({ html: buildPortfolioHtml(detail) });
      const Sharing = await import('expo-sharing');
      if (!(await Sharing.isAvailableAsync())) {
        alertCompat('Share unavailable', 'Sharing is not available on this device.');
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: `Share ${detail.student.display_name}'s portfolio`,
        UTI: 'com.adobe.pdf',
      });
    } catch (error: any) {
      if (String(error?.name || '').toLowerCase().includes('abort')) return;
      alertCompat('Share failed', error?.message || 'Could not share this portfolio.');
    }
  };

  const handleCopy = async () => {
    if (!detail) return;
    const copied = await copyToClipboard(portfolioText(detail));
    alertCompat(copied ? 'Copied' : 'Copy failed', copied
      ? 'Student portfolio summary copied to the clipboard.'
      : 'Could not access the clipboard.');
  };

  const bg = isDark ? '#0B1020' : '#EEF2F7';
  const card = isDark ? '#172033' : '#FFFFFF';
  const text = isDark ? '#F8FAFC' : '#111827';
  const muted = isDark ? '#8390A5' : '#64748B';
  const border = isDark ? '#263248' : '#E5EAF2';

  const rosterPane = (
    <View style={[
      styles.rosterPane,
      isWide && { width: 350 },
      isCompact && styles.rosterPaneCompact,
      { backgroundColor: card, borderColor: border },
    ]}>
      <View style={styles.rosterHeader}>
        <View>
          <Text style={[styles.rosterTitle, { color: text }]}>First class roster</Text>
          <Text style={[styles.rosterSubtitle, { color: muted }]}>
            {roster?.class_section
              ? `${roster.class_section.class_name}-${roster.class_section.section_name} · ${roster.students.length} students`
              : 'No first class assigned'}
          </Text>
        </View>
        <View style={[styles.countBubble, { backgroundColor: isDark ? '#25245A' : '#EEF2FF' }]}>
          <Text style={styles.countBubbleText}>{roster?.students.length || 0}</Text>
        </View>
      </View>
      <View style={[styles.searchBox, { backgroundColor: isDark ? '#111827' : '#F8FAFC', borderColor: border }]}>
        <Ionicons name="search" size={17} color={muted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search name, roll or admission no."
          placeholderTextColor={muted}
          style={[styles.searchInput, { color: text }]}
        />
        {search ? (
          <Pressable onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={17} color={muted} />
          </Pressable>
        ) : null}
      </View>
      {filteredStudents.length ? (
        <View style={styles.rosterList}>
          {filteredStudents.map((student) => (
            <RosterCard
              key={student.id}
              student={student}
              active={!isCompact && student.id === selectedId}
              onPress={() => openStudent(student.id)}
              isDark={isDark}
            />
          ))}
        </View>
      ) : (
        <View style={styles.rosterEmpty}>
          <Ionicons name="people-outline" size={30} color={muted} />
          <Text style={[styles.rosterEmptyText, { color: muted }]}>
            {search ? 'No matching student' : 'No active students in the first class'}
          </Text>
        </View>
      )}
    </View>
  );

  const detailPane = detailLoading ? (
    <View style={[styles.detailLoading, { backgroundColor: card, borderColor: border }]}>
      <LogoLoader size={58} color={INDIGO} />
      <Text style={[styles.loadingLabel, { color: muted }]}>Building student portfolio…</Text>
    </View>
  ) : detail ? (
    <View style={[
      styles.detailPane,
      isCompact && styles.detailPaneCompact,
      { backgroundColor: card, borderColor: border },
    ]}>
      <View style={[
        styles.profileHero,
        isCompact && styles.profileHeroCompact,
        { backgroundColor: isDark ? '#1D2346' : '#F1F3FF' },
      ]}>
        <View style={styles.profileSummary}>
          <StudentAvatar
            name={detail.student.display_name}
            photo={detail.student.photo_url}
            size={isCompact ? 76 : 92}
          />
          <View style={styles.profileIdentity}>
            <Text numberOfLines={2} style={[styles.profileName, isCompact && styles.profileNameCompact, { color: text }]}>
              {detail.student.display_name}
            </Text>
            <Text style={[styles.profileMeta, { color: muted }]}>
              Class {detail.student.class_name}-{detail.student.section_name} · Roll {display(detail.student.roll_number)}
            </Text>
            <Text style={[styles.profileAdmission, { color: INDIGO }]}>
              Admission No. {detail.student.admission_no}
            </Text>
          </View>
        </View>
        <View style={[styles.actionRow, isCompact && styles.actionRowCompact]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Print portfolio" onPress={handlePrint} style={[styles.actionButton, isCompact && styles.actionButtonCompact, { borderColor: border, backgroundColor: isDark ? '#172033' : 'rgba(255,255,255,0.82)' }]}>
            <Ionicons name="print-outline" size={18} color={INDIGO} />
            <Text style={[styles.actionText, { color: text }]}>Print</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Share portfolio" onPress={handleShare} style={[styles.actionButton, isCompact && styles.actionButtonCompact, { borderColor: border, backgroundColor: isDark ? '#172033' : 'rgba(255,255,255,0.82)' }]}>
            <Ionicons name="share-social-outline" size={18} color={EMERALD} />
            <Text style={[styles.actionText, { color: text }]}>Share</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Copy portfolio" onPress={handleCopy} style={[styles.actionButton, isCompact && styles.actionButtonCompact, { borderColor: border, backgroundColor: isDark ? '#172033' : 'rgba(255,255,255,0.82)' }]}>
            <Ionicons name="copy-outline" size={18} color={AMBER} />
            <Text style={[styles.actionText, { color: text }]}>Copy</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.metricsGrid}>
        <MetricCard compact={isCompact} icon="calendar-outline" label="Attendance" value={`${detail.attendance.percentage}%`} hint={`${detail.attendance.total_days} marked days`} color={EMERALD} isDark={isDark} />
        <MetricCard compact={isCompact} icon="school-outline" label="Results" value={`${detail.results.percentage}%`} hint={`${detail.results.exam_count} exams`} color={INDIGO} isDark={isDark} />
        <MetricCard compact={isCompact} icon="chatbubble-ellipses-outline" label="Complaints" value={`${detail.counts.complaints}`} hint="Count only" color={ROSE} isDark={isDark} />
        <MetricCard compact={isCompact} icon="people-circle-outline" label="Parent visits" value={`${detail.counts.parent_visits}`} hint="Count only" color={AMBER} isDark={isDark} />
      </View>

      <Text style={[styles.sectionTitle, { color: text }]}>Student information</Text>
      <View style={styles.infoGrid}>
        <InfoField label="Admission number" value={detail.student.admission_no} isDark={isDark} />
        <InfoField label="Roll number" value={detail.student.roll_number} isDark={isDark} />
        <InfoField label="PEN" value={detail.student.pen_number} isDark={isDark} />
        <InfoField label="APAAR" value={detail.student.apar_number} isDark={isDark} />
        <InfoField label="Date of birth" value={`${formatDate(detail.student.dob)}${ageFromDob(detail.student.dob) != null ? ` · ${ageFromDob(detail.student.dob)} years` : ''}`} isDark={isDark} />
        <InfoField label="Gender" value={detail.student.gender} isDark={isDark} />
        <InfoField label="Blood group" value={detail.student.blood_group} isDark={isDark} />
        <InfoField label="Category" value={detail.student.category} isDark={isDark} />
        <InfoField label="Religion" value={detail.student.religion} isDark={isDark} />
        <InfoField label="Nationality" value={detail.student.nationality} isDark={isDark} />
        <InfoField label="Admission date" value={formatDate(detail.student.admission_date)} isDark={isDark} />
        <InfoField label="Status" value={detail.student.student_status} isDark={isDark} />
        <InfoField label="Village" value={detail.student.village} isDark={isDark} />
        <InfoField label="Student phone" value={detail.student.phone} isDark={isDark} />
        <InfoField label="Student email" value={detail.student.email} isDark={isDark} />
      </View>

      <Text style={[styles.sectionTitle, { color: text }]}>Parents and guardians</Text>
      {detail.student.parents?.length ? (
        <View style={styles.parentGrid}>
          {detail.student.parents.map((parent) => (
            <View key={parent.id} style={[styles.parentCard, { backgroundColor: isDark ? '#111827' : '#F8FAFC', borderColor: border }]}>
              <View style={[styles.parentIcon, { backgroundColor: isDark ? '#25245A' : '#EEF2FF' }]}>
                <Ionicons name="person" size={18} color={INDIGO} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.parentNameRow}>
                  <Text style={[styles.parentName, { color: text }]}>{parent.name}</Text>
                  {parent.is_primary ? <Text style={styles.primaryBadge}>PRIMARY</Text> : null}
                </View>
                <Text style={[styles.parentRelation, { color: INDIGO }]}>{display(parent.relationship)}</Text>
                <Text style={[styles.parentMeta, { color: muted }]}>{display(parent.phone)}</Text>
                <Text style={[styles.parentMeta, { color: muted }]}>{display(parent.email)}</Text>
                <Text style={[styles.parentMeta, { color: muted }]}>{display(parent.occupation)}</Text>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <Text style={[styles.noData, { color: muted }]}>No parent or guardian details recorded.</Text>
      )}

      <View style={styles.twoColumnSections}>
        <View style={[styles.subsectionCard, { borderColor: border }]}>
          <Text style={[styles.sectionTitle, { color: text, marginTop: 0 }]}>Attendance breakdown</Text>
          {[
            ['Present', detail.attendance.present, EMERALD],
            ['Late', detail.attendance.late, AMBER],
            ['Absent', detail.attendance.absent, ROSE],
            ['Half day', detail.attendance.half_day, INDIGO],
          ].map(([label, value, color]) => (
            <View key={String(label)} style={styles.breakdownRow}>
              <View style={[styles.breakdownDot, { backgroundColor: String(color) }]} />
              <Text style={[styles.breakdownLabel, { color: muted }]}>{label}</Text>
              <Text style={[styles.breakdownValue, { color: text }]}>{value}</Text>
            </View>
          ))}
        </View>
        <View style={[styles.subsectionCard, { borderColor: border }]}>
          <Text style={[styles.sectionTitle, { color: text, marginTop: 0 }]}>Results preview</Text>
          {detail.results.preview.length ? detail.results.preview.map((exam) => (
            <ExamRow key={exam.exam_id} exam={exam} isDark={isDark} />
          )) : (
            <Text style={[styles.noData, { color: muted }]}>No marks recorded for this academic year.</Text>
          )}
        </View>
      </View>

      <View style={[styles.privacyNote, { backgroundColor: isDark ? '#111827' : '#F8FAFC' }]}>
        <Ionicons name="shield-checkmark-outline" size={17} color={EMERALD} />
        <Text style={[styles.privacyText, { color: muted }]}>
          Read-only portfolio · available only for students in your first class.
        </Text>
      </View>
    </View>
  ) : (
    <View style={[styles.detailEmpty, { backgroundColor: card, borderColor: border }]}>
      <Ionicons name="folder-open-outline" size={46} color={muted} />
      <Text style={[styles.detailEmptyTitle, { color: text }]}>Select a student</Text>
      <Text style={[styles.detailEmptyText, { color: muted }]}>Choose a student from your first-class roster to open the complete portfolio.</Text>
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      <TourTarget id="screen.staff-student-portfolio.overview"><StaffHeader
        title={isCompact && compactDetailOpen && detail ? detail.student.display_name : 'Student Portfolio'}
        subtitle={isCompact && compactDetailOpen && detail
          ? `Class ${detail.student.class_name}-${detail.student.section_name} · Roll ${display(detail.student.roll_number)}`
          : 'First-class student records'}
        showBackButton={isCompact && compactDetailOpen}
        onBack={isCompact && compactDetailOpen ? closeCompactDetail : undefined}
      /></TourTarget>
      <TourTarget id="screen.staff-student-portfolio.workspace" native><TourScrollView
        ref={pageScrollRef}
        contentContainerStyle={[styles.page, isCompact && styles.pageCompact]}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadRoster(true)} tintColor={INDIGO} />}
      >
        {isViewingAsAdmin ? <ViewAsBanner name={viewAsName} /> : null}
        {!isCompact ? <View style={[styles.pageIntro, { backgroundColor: isDark ? '#1D2346' : '#F1F3FF', borderColor: isDark ? '#333B6E' : '#DDE2FF' }]}>
          <View style={styles.introIcon}><Ionicons name="folder-open" size={22} color="#FFFFFF" /></View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.introTitle, { color: text }]}>Complete student view, one trusted roster</Text>
            <Text style={[styles.introText, { color: muted }]}>
              Identity, family, attendance, results and count-only interaction history for your first class.
            </Text>
          </View>
          {roster?.academic_year ? <Text style={styles.yearBadge}>{roster.academic_year}</Text> : null}
        </View> : null}

        {loading ? (
          <View style={styles.screenLoading}>
            <LogoLoader size={68} color={INDIGO} />
            <Text style={[styles.loadingLabel, { color: muted }]}>Loading first-class portfolios…</Text>
          </View>
        ) : isCompact ? (
          compactDetailOpen ? (
            <View style={styles.compactWorkspace}>
              <View style={[styles.compactNavigator, { backgroundColor: card, borderColor: border }]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Back to first class roster"
                  onPress={closeCompactDetail}
                  style={[styles.compactRosterButton, { backgroundColor: isDark ? '#25245A' : '#EEF2FF' }]}
                >
                  <Ionicons name="people-outline" size={17} color={INDIGO} />
                  <Text style={styles.compactRosterButtonText}>All students</Text>
                </Pressable>
                <Text style={[styles.compactPositionText, { color: muted }]}>
                  {selectedIndex >= 0 ? `${selectedIndex + 1} of ${roster?.students.length || 0}` : 'Student'}
                </Text>
                <View style={styles.compactStepButtons}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Previous student"
                    disabled={selectedIndex <= 0}
                    onPress={() => openAdjacentStudent(-1)}
                    style={[styles.compactStepButton, { borderColor: border, opacity: selectedIndex <= 0 ? 0.38 : 1 }]}
                  >
                    <Ionicons name="chevron-back" size={18} color={text} />
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Next student"
                    disabled={selectedIndex < 0 || selectedIndex >= (roster?.students.length || 0) - 1}
                    onPress={() => openAdjacentStudent(1)}
                    style={[styles.compactStepButton, { borderColor: border, opacity: selectedIndex < 0 || selectedIndex >= (roster?.students.length || 0) - 1 ? 0.38 : 1 }]}
                  >
                    <Ionicons name="chevron-forward" size={18} color={text} />
                  </Pressable>
                </View>
              </View>
              {detailPane}
            </View>
          ) : rosterPane
        ) : (
          <View style={[styles.workspace, { flexDirection: isWide ? 'row' : 'column' }]}>
            {rosterPane}
            <View style={{ flex: 1, minWidth: 0 }}>{detailPane}</View>
          </View>
        )}
      </TourScrollView></TourTarget>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  page: { paddingHorizontal: 18, paddingBottom: 120, paddingTop: 14 },
  pageCompact: { paddingHorizontal: 10, paddingTop: 8, paddingBottom: 96 },
  pageIntro: { maxWidth: 1440, width: '100%', alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15, borderRadius: 20, borderWidth: 1, marginBottom: 14 },
  introIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: INDIGO, alignItems: 'center', justifyContent: 'center' },
  introTitle: { fontSize: 16, fontWeight: '900' },
  introText: { fontSize: 11, lineHeight: 16, marginTop: 2 },
  yearBadge: { color: '#4338CA', backgroundColor: '#FFFFFF', fontSize: 10, fontWeight: '900', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, overflow: 'hidden' },
  workspace: { maxWidth: 1440, width: '100%', alignSelf: 'center', gap: 14, alignItems: 'flex-start' },
  rosterPane: { width: '100%', borderRadius: 22, borderWidth: 1, padding: 13 },
  rosterPaneCompact: { borderRadius: 18, padding: 10 },
  rosterHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 11 },
  rosterTitle: { fontSize: 16, fontWeight: '900' },
  rosterSubtitle: { fontSize: 11, marginTop: 3 },
  countBubble: { minWidth: 32, height: 32, paddingHorizontal: 8, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  countBubbleText: { color: INDIGO, fontWeight: '900', fontSize: 12 },
  searchBox: { minHeight: 42, borderRadius: 13, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 11, marginBottom: 10 },
  searchInput: { flex: 1, fontSize: 12, outlineStyle: 'none' } as any,
  rosterList: { gap: 8 },
  rosterCard: { minHeight: 78, borderRadius: 16, borderWidth: 1, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  rosterName: { fontSize: 13.5, fontWeight: '900' },
  rosterMeta: { fontSize: 10, marginTop: 2 },
  rosterChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  miniChip: { fontSize: 8, fontWeight: '800', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 7, overflow: 'hidden' },
  rosterEmpty: { minHeight: 170, alignItems: 'center', justifyContent: 'center', gap: 9 },
  rosterEmptyText: { fontSize: 11, textAlign: 'center' },
  avatarFallback: { backgroundColor: '#4F46E5', alignItems: 'center', justifyContent: 'center' },
  avatarFallbackText: { color: '#FFFFFF', fontWeight: '900' },
  detailPane: { width: '100%', borderRadius: 24, borderWidth: 1, padding: 16 },
  detailPaneCompact: { borderRadius: 18, padding: 10 },
  profileHero: { padding: 16, borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 15 },
  profileHeroCompact: { padding: 12, borderRadius: 16, flexDirection: 'column', alignItems: 'stretch', gap: 12 },
  profileSummary: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 14 },
  profileIdentity: { flex: 1, minWidth: 0 },
  profileName: { fontSize: 23, fontWeight: '900', letterSpacing: -0.5 },
  profileNameCompact: { fontSize: 20 },
  profileMeta: { fontSize: 11, marginTop: 4 },
  profileAdmission: { fontSize: 10, fontWeight: '800', marginTop: 5 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  actionRowCompact: { width: '100%', flexWrap: 'nowrap' },
  actionButton: { minHeight: 38, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 5 },
  actionButtonCompact: { flex: 1, minWidth: 0, justifyContent: 'center', paddingHorizontal: 6 },
  actionText: { fontSize: 10, fontWeight: '800' },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 14 },
  metricCard: { flexGrow: 1, flexBasis: 155, minHeight: 122, borderRadius: 17, borderWidth: 1, padding: 12 },
  metricCardCompact: { flexBasis: '46%', minHeight: 108, padding: 10, borderRadius: 15 },
  metricIcon: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  metricValue: { fontSize: 22, fontWeight: '900' },
  metricLabel: { fontSize: 9, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.7, marginTop: 2 },
  metricHint: { fontSize: 9, marginTop: 5 },
  sectionTitle: { fontSize: 14, fontWeight: '900', marginTop: 20, marginBottom: 9 },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  infoField: { flexGrow: 1, flexBasis: 150, minHeight: 63, padding: 10, borderRadius: 12 },
  infoLabel: { fontSize: 8, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.65, marginBottom: 5 },
  infoValue: { fontSize: 11, fontWeight: '700' },
  parentGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  parentCard: { flexGrow: 1, flexBasis: 260, minHeight: 126, borderRadius: 15, borderWidth: 1, padding: 11, flexDirection: 'row', gap: 10 },
  parentIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  parentNameRow: { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' },
  parentName: { fontSize: 12, fontWeight: '900' },
  primaryBadge: { color: EMERALD, backgroundColor: '#ECFDF5', fontSize: 7, fontWeight: '900', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' },
  parentRelation: { fontSize: 9, fontWeight: '800', marginTop: 2 },
  parentMeta: { fontSize: 9, marginTop: 3 },
  twoColumnSections: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 2 },
  subsectionCard: { flexGrow: 1, flexBasis: 290, borderWidth: 1, borderRadius: 17, padding: 13 },
  breakdownRow: { flexDirection: 'row', alignItems: 'center', minHeight: 31 },
  breakdownDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  breakdownLabel: { flex: 1, fontSize: 10 },
  breakdownValue: { fontSize: 12, fontWeight: '900' },
  examRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 7 },
  examName: { fontSize: 10, fontWeight: '800' },
  examMeta: { fontSize: 8.5, marginTop: 3 },
  examScore: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 9 },
  examScoreText: { fontSize: 10, fontWeight: '900' },
  privacyNote: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, padding: 11, borderRadius: 13, marginTop: 15 },
  privacyText: { fontSize: 9.5, fontWeight: '600' },
  compactWorkspace: { width: '100%', maxWidth: 620, alignSelf: 'center', gap: 8 },
  compactNavigator: { minHeight: 48, borderRadius: 15, borderWidth: 1, padding: 6, flexDirection: 'row', alignItems: 'center', gap: 8 },
  compactRosterButton: { minHeight: 36, borderRadius: 11, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  compactRosterButtonText: { color: INDIGO, fontSize: 10.5, fontWeight: '900' },
  compactPositionText: { flex: 1, textAlign: 'center', fontSize: 10, fontWeight: '700' },
  compactStepButtons: { flexDirection: 'row', gap: 5 },
  compactStepButton: { width: 36, height: 36, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  noData: { fontSize: 10, paddingVertical: 12 },
  detailLoading: { flex: 1, width: '100%', minHeight: 420, borderRadius: 24, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingLabel: { fontSize: 11, fontWeight: '700' },
  detailEmpty: { width: '100%', minHeight: 380, borderRadius: 24, borderWidth: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
  detailEmptyTitle: { fontSize: 17, fontWeight: '900', marginTop: 11 },
  detailEmptyText: { maxWidth: 320, textAlign: 'center', fontSize: 11, lineHeight: 17, marginTop: 5 },
  screenLoading: { minHeight: 450, alignItems: 'center', justifyContent: 'center', gap: 12 },
});
