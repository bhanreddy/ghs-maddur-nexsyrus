import React, { useState } from 'react';
import AppTextInput from '@/src/components/AppTextInput';

import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
} from 'react-native';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import { Ionicons, Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AdminHeader from '../../src/components/AdminHeader';
import { ADMIN_THEME } from '../../src/constants/adminTheme';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { StudentService } from '../../src/services/studentService';
import {
  SCHOOL_CONFIG,
  schoolColorWithAlpha,
  schoolTheme,
} from '@/src/constants/schoolConfig';
import { Image } from 'react-native';
import { useTheme } from '../../src/hooks/useTheme';
import { Theme } from '../../src/theme/themes';
import LogoLoader from '../../src/components/LogoLoader';

// --- Types ---
interface SubjectMark {
  subject: string;
  maxMarks: number;
  passingMarks?: number;
  obtained: number;
  grade: string;
  is_absent?: boolean;
}
interface ExamResult {
  exam_id: string;
  exam_name: string;
  exam_type: string;
  subjects: SubjectMark[];
}
interface StudentResult {
  id: string;
  name: string;
  fatherName: string;
  class: string;
  rollNo: string;
  dob: string;
  academicYear: string;
  attendance: string;
  exams: ExamResult[];
  selectedExamIndex: number;
  marks: SubjectMark[];
  totalMax?: number;
  totalObtained?: number;
  percentage?: number;
  result?: 'PASS' | 'FAIL';
  division?: string;
}

// -------------------------------------------------------------------
// buildReportHTML — accepts logoDataUri (base64) for PDF rendering
// -------------------------------------------------------------------
function buildReportHTML(
  resultData: StudentResult,
  schoolConfig: typeof SCHOOL_CONFIG,
  logoDataUri: string
): string {
  // Printed report always uses light school palette for legible paper output.
  const c = schoolTheme.light.colors;
  const ribbon = schoolConfig.theme;
  const examName =
    resultData.exams[resultData.selectedExamIndex]?.exam_name?.toUpperCase() ||
    'PROGRESS REPORT';
  const isPass = resultData.result === 'PASS';
  const badgeColor = isPass ? c.success : c.danger;
  const badgeBg = isPass
    ? schoolColorWithAlpha(c.success, 0.16)
    : schoolColorWithAlpha(c.danger, 0.14);

  let tableRows = '';
  resultData.marks.forEach((m) => {
    const passMark = m.passingMarks || Math.round(m.maxMarks * 0.35);
    const isFail = m.obtained < passMark;
    const color = isFail ? c.danger : c.textPrimary;
    tableRows += `
      <tr>
        <td style="text-align:left">${m.subject}</td>
        <td>${m.maxMarks}</td>
        <td style="color:${color};font-weight:${isFail ? 'bold' : 'normal'}">
          ${m.is_absent ? 'AB' : m.obtained}
        </td>
        <td>${m.grade || '-'}</td>
      </tr>
    `;
  });

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8"/>
      <title>Progress Report - ${resultData.name}</title>
      <style>
        @page { size: A4 portrait; margin: 1.5cm; }
        * { box-sizing: border-box; }
        html, body {
          font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
          margin: 0; padding: 0; color: ${c.textPrimary}; background: ${c.surface};
        }
        body { position: relative; }

        /* Force color printing in browsers */
        * {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }

        /* ---- Watermark ---- */
        .watermark {
          position: fixed;
          top: 50%; left: 50%;
          transform: translate(-50%, -50%);
          z-index: 2;
          pointer-events: none;
        }
        .watermark img {
          width: 480px; height: 480px;
          object-fit: contain;
          opacity: 0.16;
        }
        .page-content { position: relative; z-index: 1; }

        /* ---- Header ---- */
        .header {
          background: ${c.primary};
          padding: 20px 24px;
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 20px;
        }
        .header-logo {
          width: 56px; height: 56px;
          border-radius: 50%;
          background: rgba(255,255,255,0.15);
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0; overflow: hidden;
        }
        .header-logo img { width: 44px; height: 44px; object-fit: contain; }
        .header-text { flex: 1; text-align: center; }
        .school-name {
          font-size: 22px; font-weight: 800; color: ${ribbon.ribbonTitle};
          text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px;
        }
        .exam-name {
          font-size: 13px; font-weight: 600;
          color: ${ribbon.ribbonBody}; letter-spacing: 2px;
        }
        .academic-year {
          font-size: 12px; color: ${ribbon.ribbonBodyMuted};
          font-style: italic; margin-top: 3px;
        }

        /* ---- Details Grid ---- */
        .details-grid {
          display: grid; grid-template-columns: 1fr 1fr;
          gap: 10px; margin: 0 1.5cm 20px;
          background: ${c.background}; padding: 15px;
          border-radius: 8px; border: 1px solid ${c.border};
        }
        .detail-item { font-size: 13px; }
        .detail-label {
          color: ${c.textSecondary}; font-weight: 600;
          text-transform: uppercase; font-size: 11px;
        }
        .detail-value { color: ${c.textStrong}; font-weight: 700; margin-top: 2px; }

        /* ---- Marks Table ---- */
        .table-wrap { margin: 0 1.5cm 20px; }
        table { width: 100%; border-collapse: collapse; }
        th {
          background: ${c.primaryDark}; color: ${ribbon.ribbonTitle};
          padding: 10px; font-size: 13px;
          font-weight: 700; text-align: center;
        }
        th:first-child { text-align: left; }
        td {
          padding: 10px; border-bottom: 1px solid ${c.border};
          text-align: center; font-size: 13px; font-weight: 500;
        }
        tr:nth-child(even) td { background: ${schoolColorWithAlpha(c.primary, 0.06)}; }

        /* ---- Summary ---- */
        .summary {
          background: ${c.background}; padding: 15px;
          border-radius: 8px; border: 1px solid ${c.border};
          margin: 0 1.5cm 40px;
        }
        .summary-row {
          display: flex; justify-content: space-between;
          padding: 8px 0; border-bottom: 1px solid ${c.border};
        }
        .summary-row:last-child { border-bottom: none; }
        .summary-label { color: ${c.textSecondary}; font-weight: 600; font-size: 14px; }
        .summary-value { color: ${c.textStrong}; font-weight: 800; font-size: 15px; }
        .badge {
          background: ${badgeBg}; color: ${badgeColor};
          padding: 4px 10px; border-radius: 12px;
          font-size: 12px; font-weight: 800; text-transform: uppercase;
        }

        /* ---- Footer Signatures ---- */
        .footer {
          display: flex; justify-content: space-between;
          margin: 60px 1.5cm 0; text-align: center;
        }
        .sig-box { width: 30%; }
        .sig-line {
          border-bottom: 1px solid ${c.textMuted};
          margin-bottom: 8px; height: 30px;
        }
        .sig-label { color: ${c.textSecondary}; font-weight: 600; font-size: 12px; }
      </style>
    </head>
    <body>

      <!-- Watermark behind all content -->
      <div class="watermark">
        <img src="${logoDataUri}" alt="" />
      </div>

      <div class="page-content">

        <!-- Header with logo -->
        <div class="header">
          <div class="header-logo">
            <img src="${logoDataUri}" alt="logo" />
          </div>
          <div class="header-text">
            <div class="school-name">${schoolConfig.name}</div>
            <div class="exam-name">${examName}</div>
            <div class="academic-year">Academic Year: ${resultData.academicYear}</div>
          </div>
          <div style="width:56px;flex-shrink:0;"></div>
        </div>

        <!-- Student Details -->
        <div class="details-grid">
          <div class="detail-item">
            <div class="detail-label">Student Name</div>
            <div class="detail-value">${resultData.name}</div>
          </div>
          <div class="detail-item">
            <div class="detail-label">Class &amp; Sec</div>
            <div class="detail-value">${resultData.class}</div>
          </div>
          <div class="detail-item">
            <div class="detail-label">Roll No</div>
            <div class="detail-value">${resultData.rollNo}</div>
          </div>
          <div class="detail-item">
            <div class="detail-label">Father's Name</div>
            <div class="detail-value">${resultData.fatherName}</div>
          </div>
          <div class="detail-item">
            <div class="detail-label">D.O.B</div>
            <div class="detail-value">${resultData.dob}</div>
          </div>
          <div class="detail-item">
            <div class="detail-label">Attendance</div>
            <div class="detail-value">${resultData.attendance}</div>
          </div>
        </div>

        <!-- Marks Table -->
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Subject</th>
                <th>Max Marks</th>
                <th>Obtained</th>
                <th>Grade</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
        </div>

        <!-- Summary -->
        <div class="summary">
          <div class="summary-row">
            <div class="summary-label">Total Marks</div>
            <div class="summary-value">${resultData.totalObtained} / ${resultData.totalMax}</div>
          </div>
          <div class="summary-row">
            <div class="summary-label">Percentage</div>
            <div class="summary-value">${resultData.percentage}%</div>
          </div>
          <div class="summary-row">
            <div class="summary-label">Result</div>
            <div class="summary-value"><span class="badge">${resultData.result}</span></div>
          </div>
          ${isPass ? `
          <div class="summary-row">
            <div class="summary-label">Division</div>
            <div class="summary-value">${resultData.division}</div>
          </div>
          ` : ''}
        </div>

        <!-- Signature Footer -->
        <div class="footer">
          <div class="sig-box">
            <div class="sig-line"></div>
            <div class="sig-label">Class Teacher</div>
          </div>
          <div class="sig-box">
            <div class="sig-line"></div>
            <div class="sig-label">Principal</div>
          </div>
          <div class="sig-box">
            <div class="sig-line"></div>
            <div class="sig-label">Parent</div>
          </div>
        </div>

      </div><!-- /page-content -->
    </body>
    </html>
  `;
}

// -------------------------------------------------------------------
// Logo loader — platform-aware base64 conversion
// -------------------------------------------------------------------
async function getLogoDataUri(): Promise<string> {
  // Use expo-asset everywhere — react-native-web's Image has no resolveAssetSource,
  // which breaks Expo web printing with Image.resolveAssetSource(...).
  const { Asset } = await import('expo-asset');
  const asset = Asset.fromModule(require('../../assets/images/icon.png'));
  await asset.downloadAsync();
  const uri = asset.localUri || asset.uri;
  if (!uri) return '';

  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  const FileSystem: any = await import('expo-file-system/legacy');
  const base64Logo = await FileSystem.readAsStringAsync(uri, {
    encoding: 'base64',
  });
  return `data:image/png;base64,${base64Logo}`;
}

// -------------------------------------------------------------------
// Main Component
// -------------------------------------------------------------------
export default function ProgressReportGenerator() {
  const { theme, isDark } = useTheme();
  const schoolColors = isDark ? schoolTheme.dark.colors : schoolTheme.light.colors;
  const styles = React.useMemo(
    () => getStyles(theme, schoolColors),
    [theme, schoolColors]
  );
  const [studentId, setStudentId] = useState('');
  const [loading, setLoading] = useState(false);
  const [resultData, setResultData] = useState<StudentResult | null>(null);

  const computeSummary = (marks: SubjectMark[]) => {
    let totalMax = 0;
    let totalObtained = 0;
    let hasFailed = false;
    marks.forEach((m) => {
      totalMax += m.maxMarks;
      totalObtained += m.obtained;
      const passingMarks = m.passingMarks || Math.round(m.maxMarks * 0.35);
      if (m.obtained < passingMarks) hasFailed = true;
    });
    const percentage = totalMax > 0 ? (totalObtained / totalMax) * 100 : 0;
    const result: 'PASS' | 'FAIL' = hasFailed ? 'FAIL' : 'PASS';
    let division = '-';
    if (result === 'PASS') {
      if (percentage >= 75) division = 'Distinction';
      else if (percentage >= 60) division = 'First Class';
      else if (percentage >= 50) division = 'Second Class';
      else division = 'Third Class';
    }
    return {
      totalMax,
      totalObtained,
      percentage: parseFloat(percentage.toFixed(2)),
      result,
      division,
    };
  };

  const handleSearch = async () => {
    if (!studentId.trim()) {
      alertCompat('Error', 'Please enter a Student ID or Admission No');
      return;
    }
    setLoading(true);
    setResultData(null);
    try {
      let student: any = null;
      const searchResults = await StudentService.search(studentId);
      if (searchResults && searchResults.length > 0) {
        const exactMatch = searchResults.find(
          (s: any) => s.admission_no === studentId
        );
        student = exactMatch || searchResults[0];
      }

      if (!student) {
        try {
          student = await StudentService.getById(studentId);
        } catch (e) {
          // not found by ID
        }
      }
      if (!student) {
        alertCompat('Error', 'Student not found');
        return;
      }

      const resultsResponse = await StudentService.getResults(student.id).catch(
        () => null
      );
      const exams: ExamResult[] = resultsResponse?.exams || [];
      const attendanceData = resultsResponse?.attendance;
      const academicYear = resultsResponse?.academic_year || 'N/A';

      let attendanceStr = '0%';
      if (attendanceData && attendanceData.total > 0) {
        attendanceStr = `${attendanceData.percentage}%`;
      }

      const selectedIndex = 0;
      const selectedMarks =
        exams.length > 0 ? exams[selectedIndex].subjects : [];
      const summary =
        selectedMarks.length > 0
          ? computeSummary(selectedMarks)
          : {
            totalMax: 0,
            totalObtained: 0,
            percentage: 0,
            result: 'FAIL' as const,
            division: '-',
          };

      const currentEnrollment = student.current_enrollment;
      const cls =
        currentEnrollment?.class_code ||
        currentEnrollment?.class_name ||
        'N/A';
      const sec = currentEnrollment?.section_name || '';
      const fatherObj = student.parents?.find(
        (p: any) => p.relation === 'Father'
      );
      const father = fatherObj
        ? [fatherObj.first_name, fatherObj.last_name].filter(Boolean).join(' ')
        : 'Guardian';

      const data: StudentResult = {
        id: student.id,
        name:
          student.display_name ||
          `${student.first_name} ${student.last_name}`,
        fatherName: father,
        class: `${cls} ${sec}`,
        rollNo: currentEnrollment?.roll_number?.toString() || 'N/A',
        dob: student.dob
          ? new Date(student.dob).toLocaleDateString()
          : 'N/A',
        academicYear,
        attendance: attendanceStr,
        exams,
        selectedExamIndex: selectedIndex,
        marks: selectedMarks,
        ...summary,
      };

      setResultData(data);
    } catch (error) {
      alertCompat('Error', 'Student not found or error fetching data.');
    } finally {
      setLoading(false);
    }
  };

  const selectExam = (index: number) => {
    if (!resultData || !resultData.exams[index]) return;
    const selectedMarks = resultData.exams[index].subjects;
    const summary =
      selectedMarks.length > 0
        ? computeSummary(selectedMarks)
        : {
          totalMax: 0,
          totalObtained: 0,
          percentage: 0,
          result: 'FAIL' as const,
          division: '-',
        };
    setResultData({
      ...resultData,
      selectedExamIndex: index,
      marks: selectedMarks,
      ...summary,
    });
  };

  // ----------------------------------------------------------------
  // handlePrint — popup window on web, expo-print on native
  // ----------------------------------------------------------------
  const handlePrint = async () => {
    if (!resultData) return;
    try {
      const logoDataUri = await getLogoDataUri();
      const html = buildReportHTML(resultData, SCHOOL_CONFIG, logoDataUri);

      if (Platform.OS === 'web') {
        // Open a fresh popup with ONLY the report HTML, then print
        const printWindow = window.open('', '_blank', 'width=900,height=1200');
        if (!printWindow) {
          alertCompat(
            'Print Error',
            'Popup blocked. Please allow popups for this site.'
          );
          return;
        }
        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();

        // Give the data-URI image time to decode, then trigger print
        setTimeout(() => {
          printWindow.focus();
          printWindow.print();
        }, 500);

        printWindow.addEventListener('afterprint', () => {
          try { printWindow.close(); } catch { }
        });
      } else {
        const Print = await import('expo-print');
        await Print.printAsync({ html });
      }
    } catch (err: any) {
      alertCompat('Print Error', err?.message || 'Could not generate PDF.');
    }
  };

  // --- Render Components ---

  const renderExamPicker = () => {
    if (!resultData || resultData.exams.length <= 1) return null;
    return (
      <View style={styles.examPickerContainer}>
        <Text style={styles.examPickerLabel}>Select Exam:</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.examPickerScroll}
        >
          {resultData.exams.map((exam, index) => (
            <TouchableOpacity
              key={exam.exam_id}
              style={[
                styles.examChip,
                index === resultData.selectedExamIndex && styles.examChipActive,
              ]}
              onPress={() => selectExam(index)}
            >
              <Text
                style={[
                  styles.examChipText,
                  index === resultData.selectedExamIndex &&
                  styles.examChipTextActive,
                ]}
              >
                {exam.exam_name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  };

  const renderNoResults = () => (
    <Animated.View
      entering={FadeInDown.springify()}
      style={styles.noResultsContainer}
    >
      <Ionicons
        name="document-text-outline"
        size={48}
        color={ADMIN_THEME.colors.text.muted}
      />
      <Text style={styles.noResultsTitle}>No Exam Results Found</Text>
      <Text style={styles.noResultsSubtitle}>
        Exam results haven't been published for this student yet.
        {'\n'}Attendance: {resultData?.attendance}
      </Text>
    </Animated.View>
  );

  const renderReportCard = () => {
    if (!resultData) return null;

    if (resultData.exams.length === 0 || resultData.marks.length === 0) {
      return renderNoResults();
    }

    const isPass = resultData.result === 'PASS';

    return (
      <Animated.View
        entering={FadeInDown.springify()}
        style={styles.previewContainer}
      >
        {renderExamPicker()}

        {/* Visual Paper Sheet */}
        <View style={styles.paperSheet}>
          {/* Header */}
          <View style={styles.headerSection}>
            <View style={styles.logoCircle}>
              <Image
                source={SCHOOL_CONFIG.logo}
                style={{ width: 40, height: 40, resizeMode: 'contain' }}
              />
            </View>
            <View style={{ alignItems: 'center' }}>
              <Text style={styles.schoolName}>{SCHOOL_CONFIG.name}</Text>
              <Text style={styles.schoolSub}>
                {resultData.exams[
                  resultData.selectedExamIndex
                ]?.exam_name?.toUpperCase() || 'PROGRESS REPORT'}
              </Text>
              <Text style={styles.academicYear}>{resultData.academicYear}</Text>
            </View>
            <View style={{ width: 40 }} />
          </View>

          {/* Student Details Grid */}
          <View style={styles.detailsGrid}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Student Name:</Text>
              <Text style={styles.detailValue}>{resultData.name}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Class & Sec:</Text>
              <Text style={styles.detailValue}>{resultData.class}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Roll No:</Text>
              <Text style={styles.detailValue}>{resultData.rollNo}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Father's Name:</Text>
              <Text style={styles.detailValue}>{resultData.fatherName}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>D.O.B:</Text>
              <Text style={styles.detailValue}>{resultData.dob}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Attendance:</Text>
              <Text style={styles.detailValue}>{resultData.attendance}</Text>
            </View>
          </View>

          {/* Marks Table */}
          <View style={styles.tableContainer}>
            <View style={styles.tableHeader}>
              <Text style={[styles.colSubject, styles.th]}>Subject</Text>
              <Text style={[styles.colMarks, styles.th]}>Max</Text>
              <Text style={[styles.colMarks, styles.th]}>Obt</Text>
              <Text style={[styles.colGrade, styles.th]}>Grade</Text>
            </View>
            {resultData.marks.map((m, i) => {
              const passingMarks =
                m.passingMarks || Math.round(m.maxMarks * 0.35);
              return (
                <View
                  key={i}
                  style={[styles.tableRow, i % 2 === 0 && styles.rowAlt]}
                >
                  <Text style={[styles.colSubject, styles.td]}>{m.subject}</Text>
                  <Text style={[styles.colMarks, styles.td]}>{m.maxMarks}</Text>
                  <Text
                    style={[
                      styles.colMarks,
                      styles.td,
                      m.obtained < passingMarks && styles.textDanger,
                    ]}
                  >
                    {m.is_absent ? 'AB' : m.obtained}
                  </Text>
                  <Text style={[styles.colGrade, styles.td]}>
                    {m.grade || '-'}
                  </Text>
                </View>
              );
            })}
          </View>

          {/* Summary Section */}
          <View style={styles.summarySection}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Total Marks:</Text>
              <Text style={styles.summaryValue}>
                {resultData.totalObtained} / {resultData.totalMax}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Percentage:</Text>
              <Text style={styles.summaryValue}>{resultData.percentage}%</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Result:</Text>
              <View
                style={[
                  styles.resultBadge,
                  isPass ? styles.badgePass : styles.badgeFail,
                ]}
              >
                <Text
                  style={[
                    styles.resultText,
                    isPass ? styles.textPass : styles.textFail,
                  ]}
                >
                  {resultData.result}
                </Text>
              </View>
            </View>
            {isPass && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Division:</Text>
                <Text style={styles.summaryValue}>{resultData.division}</Text>
              </View>
            )}
          </View>

          <View style={styles.divider} />

          {/* Footer Signatures */}
          <View style={styles.footerSignatures}>
            <View style={styles.signBox}>
              <Text style={styles.signLabel}>Class Teacher</Text>
            </View>
            <View style={styles.signBox}>
              <Text style={styles.signLabel}>Principal</Text>
            </View>
            <View style={styles.signBox}>
              <Text style={styles.signLabel}>Parent</Text>
            </View>
          </View>

          {/* Screen Watermark */}
          <View pointerEvents="none" style={styles.watermark}>
            <Image
              source={SCHOOL_CONFIG.logo}
              style={{
                width: 320,
                height: 320,
                opacity: 0.12,
                resizeMode: 'contain',
              }}
            />
          </View>
        </View>

        {/* Print Button */}
        <TouchableOpacity
          style={styles.printBtn}
          onPress={handlePrint}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={[
              SCHOOL_CONFIG.theme.ribbonGradient[0],
              SCHOOL_CONFIG.theme.ribbonGradient[1],
            ]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.printGradient}
          >
            <Feather name="printer" size={20} color="#FFF" />
            <Text style={styles.printText}>Print Report Card</Text>
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[
          schoolColors.background,
          schoolColorWithAlpha(schoolColors.primary, isDark ? 0.22 : 0.12),
        ]}
        style={StyleSheet.absoluteFill}
      />
      <AdminHeader title="Progress Reports" showBackButton />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.content}>
          <Text style={styles.sectionTitle}>Generate Report</Text>
          <View style={styles.searchCard}>
            <Text style={styles.label}>Enter Student ID</Text>
            <View style={styles.inputRow}>
              <View style={styles.inputWrapper}>
                <Ionicons
                  name="search-outline"
                  size={20}
                  color={ADMIN_THEME.colors.text.muted}
                  style={styles.searchIcon}
                />
                <AppTextInput
                  style={styles.input}
                  placeholder="e.g. 01, 101, John Doe"
                  placeholderTextColor={ADMIN_THEME.colors.text.muted}
                  value={studentId}
                  onChangeText={setStudentId}
                />
              </View>
              <TouchableOpacity
                style={[styles.searchBtn, loading && styles.disabledBtn]}
                onPress={handleSearch}
                disabled={loading}
              >
                {loading ? (
                  <LogoLoader size={30} color="#FFF" />
                ) : (
                  <Feather name="arrow-right" size={20} color="#FFF" />
                )}
              </TouchableOpacity>
            </View>
          </View>
          {renderReportCard()}
        </View>
      </ScrollView>
    </View>
  );
}

const getStyles = (
  theme: Theme,
  sc: (typeof schoolTheme.light)['colors']
) =>
  StyleSheet.create({
    root: { flex: 1 },
    scroll: { paddingBottom: 40 },
    content: { padding: 20 },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: ADMIN_THEME.colors.text.primary,
      marginBottom: 12,
      letterSpacing: 0.5,
    },
    label: {
      fontSize: 14,
      fontWeight: '600',
      color: ADMIN_THEME.colors.text.secondary,
      marginBottom: 8,
    },
    searchCard: {
      backgroundColor: '#FFF',
      borderRadius: 16,
      padding: 16,
      ...ADMIN_THEME.shadows.sm,
      marginBottom: 20,
    },
    inputRow: { flexDirection: 'row', gap: 12 },
    inputWrapper: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: ADMIN_THEME.colors.background.surface,
      borderWidth: 1,
      borderColor: ADMIN_THEME.colors.border,
      borderRadius: 12,
      paddingHorizontal: 12,
      height: 50,
    },
    searchIcon: { marginRight: 8 },
    input: { flex: 1, fontSize: 16, color: ADMIN_THEME.colors.text.primary },
    searchBtn: {
      width: 50,
      height: 50,
      borderRadius: 12,
      backgroundColor: ADMIN_THEME.colors.primary,
      justifyContent: 'center',
      alignItems: 'center',
      ...ADMIN_THEME.shadows.sm,
    },
    disabledBtn: { opacity: 0.7 },
    examPickerContainer: { marginBottom: 16, width: '100%' },
    examPickerLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: ADMIN_THEME.colors.text.secondary,
      marginBottom: 8,
    },
    examPickerScroll: { flexDirection: 'row' },
    examChip: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: sc.background,
      marginRight: 8,
      borderWidth: 1,
      borderColor: sc.border,
    },
    examChipActive: {
      backgroundColor: sc.primary,
      borderColor: sc.primary,
    },
    examChipText: { fontSize: 13, fontWeight: '600', color: sc.textSecondary },
    examChipTextActive: { color: SCHOOL_CONFIG.theme.ribbonTitle },
    noResultsContainer: {
      alignItems: 'center',
      padding: 40,
      backgroundColor: '#FFF',
      borderRadius: 16,
      ...ADMIN_THEME.shadows.sm,
      marginTop: 10,
    },
    noResultsTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: ADMIN_THEME.colors.text.primary,
      marginTop: 16,
    },
    noResultsSubtitle: {
      fontSize: 13,
      color: ADMIN_THEME.colors.text.muted,
      textAlign: 'center',
      marginTop: 8,
      lineHeight: 20,
    },
    previewContainer: { alignItems: 'center', marginTop: 10 },
    paperSheet: {
      width: '100%',
      backgroundColor: sc.surface,
      borderRadius: 4,
      padding: 0,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: sc.border,
      elevation: 4,
      shadowColor: theme.colors.text,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
    },
    headerSection: {
      backgroundColor: sc.primary,
      padding: 20,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    logoCircle: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: 'rgba(255,255,255,0.2)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    schoolName: {
      fontSize: 18,
      fontWeight: '800',
      color: SCHOOL_CONFIG.theme.ribbonTitle,
      letterSpacing: 1,
    },
    schoolSub: {
      fontSize: 12,
      fontWeight: '600',
      color: SCHOOL_CONFIG.theme.ribbonBody,
      marginTop: 4,
      letterSpacing: 2,
    },
    academicYear: {
      fontSize: 11,
      color: SCHOOL_CONFIG.theme.ribbonBodyMuted,
      marginTop: 2,
      fontStyle: 'italic',
    },
    detailsGrid: {
      padding: 20,
      flexDirection: 'row',
      flexWrap: 'wrap',
      borderBottomWidth: 1,
      borderBottomColor: sc.borderLight,
      backgroundColor: sc.background,
    },
    detailRow: { width: '50%', marginBottom: 12 },
    detailLabel: {
      fontSize: 11,
      color: sc.textSecondary,
      fontWeight: '600',
      textTransform: 'uppercase',
    },
    detailValue: {
      fontSize: 14,
      color: sc.textStrong,
      fontWeight: '700',
      marginTop: 2,
    },
    tableContainer: { padding: 20 },
    tableHeader: {
      flexDirection: 'row',
      backgroundColor: sc.primaryDark,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 8,
      marginBottom: 8,
    },
    th: { color: SCHOOL_CONFIG.theme.ribbonTitle, fontWeight: '700', fontSize: 13 },
    tableRow: {
      flexDirection: 'row',
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderBottomWidth: 1,
      borderBottomColor: sc.border,
    },
    rowAlt: { backgroundColor: schoolColorWithAlpha(sc.primary, 0.06) },
    td: { color: sc.textPrimary, fontSize: 13, fontWeight: '500' },
    colSubject: { flex: 2 },
    colMarks: { flex: 1, textAlign: 'center' },
    colGrade: { flex: 1, textAlign: 'center' },
    textDanger: { color: sc.danger, fontWeight: '700' },
    summarySection: { padding: 20, paddingTop: 0, gap: 12 },
    summaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: sc.borderLight,
    },
    summaryLabel: { fontSize: 14, color: sc.textSecondary, fontWeight: '600' },
    summaryValue: { fontSize: 16, color: sc.textStrong, fontWeight: '800' },
    resultBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
    badgePass: { backgroundColor: schoolColorWithAlpha(sc.success, 0.18) },
    badgeFail: { backgroundColor: schoolColorWithAlpha(sc.danger, 0.14) },
    textPass: { color: sc.success },
    textFail: { color: sc.danger },
    resultText: {
      fontSize: 12,
      fontWeight: '800',
      textTransform: 'uppercase',
    },
    divider: {
      height: 1,
      backgroundColor: sc.border,
      marginVertical: 10,
    },
    footerSignatures: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      padding: 30,
      paddingTop: 40,
    },
    signBox: {
      alignItems: 'center',
      borderTopWidth: 1,
      borderTopColor: sc.textMuted,
      width: '28%',
      paddingTop: 8,
    },
    signLabel: { fontSize: 11, color: sc.textSecondary, fontWeight: '600' },
    watermark: {
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: [{ translateX: -160 }, { translateY: -160 }],
      zIndex: 2,
    },
    printBtn: {
      width: '100%',
      marginTop: 24,
      borderRadius: 12,
      ...ADMIN_THEME.shadows.md,
    },
    printGradient: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 16,
      borderRadius: 12,
      gap: 10,
    },
    printText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  });