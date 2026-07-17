import React, { useState, useEffect } from 'react';
import AppTextInput from '@/src/components/AppTextInput';

import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Platform, Modal, FlatList, Keyboard } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AppDatePicker, { toYMD } from '@/src/components/AppDatePicker';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import AdminHeader from '../../src/components/AdminHeader';
import { ADMIN_THEME } from '../../src/constants/adminTheme';
import { StudentService, CreateStudentRequest, UpdateStudentRequest } from '../../src/services/studentService';
import { ClassService, ClassInfo, Section, AcademicYear } from '../../src/services/classService';
import { GENDERS, BLOOD_GROUPS, RELIGIONS, STUDENT_CATEGORIES, STUDENT_STATUSES } from '../../src/constants/references';
import { useTheme } from '../../src/hooks/useTheme';
import { Theme } from '../../src/theme/themes';
import LogoLoader from '../../src/components/LogoLoader';
import ClayPasswordToggle from '../../src/components/ClayPasswordToggle';
import AdmissionSuccessModal from '../../src/components/AdmissionSuccessModal';
import { buildAdmissionFormData, AdmissionFormData } from '../../src/utils/admissionFormPdf';

type ParentFormState = {
  first_name: string;
  last_name: string;
  phone: string;
  occupation: string;
};

const emptyParentState = (): ParentFormState => ({
  first_name: '',
  last_name: '',
  phone: '',
  occupation: ''
});

function normalizeDateInput(value?: string | null): string {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return toYMD(parsed);
}

function mapParentByRelation(
  parents: Array<{ relation?: string; relationship?: string; first_name?: string; last_name?: string; phone?: string; occupation?: string }> | null | undefined,
  relation: string
): ParentFormState {
  const match = (parents || []).find((parent) => {
    const label = parent.relation || parent.relationship || '';
    return label.toLowerCase() === relation.toLowerCase();
  });
  if (!match) return emptyParentState();
  return {
    first_name: match.first_name || '',
    last_name: match.last_name || '',
    phone: match.phone || '',
    occupation: match.occupation || ''
  };
}

// ─── Form palette (brand-aligned clay) ────────────────────────────────────────
const FORM = {
  brand: ADMIN_THEME.colors.primary,
  violet: '#7C6FFF',
  coral: ADMIN_THEME.colors.secondary,
  sage: '#5BAA9A',
  surface: (isDark: boolean) => (isDark ? '#1A1726' : '#FDFCFF'),
  field: (isDark: boolean) => (isDark ? '#221F30' : '#F3EFF8'),
  border: (isDark: boolean) => (isDark ? 'rgba(124, 111, 255, 0.18)' : 'rgba(102, 89, 144, 0.14)'),
  label: (isDark: boolean) => (isDark ? '#A89EC4' : '#6B6280'),
  text: (isDark: boolean) => (isDark ? '#EDE8F5' : '#2D2640'),
  muted: (isDark: boolean) => (isDark ? '#7A718F' : '#9B92AD'),
};

// ─── Claymorphism helpers ─────────────────────────────────────────────────────
function clayField(isDark: boolean) {
  if (Platform.OS === 'web') {
    const drop = isDark ? 'rgba(45, 30, 70, 0.55)' : 'rgba(102, 89, 144, 0.20)';
    const light = isDark ? 'rgba(124, 111, 255, 0.07)' : 'rgba(255, 255, 255, 0.92)';
    const innerHi = isDark ? 'rgba(124, 111, 255, 0.10)' : 'rgba(255, 255, 255, 0.80)';
    const innerLo = isDark ? 'rgba(20, 15, 35, 0.35)' : 'rgba(102, 89, 144, 0.12)';
    return {
      boxShadow:
        `5px 5px 14px ${drop}, -4px -4px 11px ${light}, ` +
        `inset 1.5px 1.5px 2px ${innerHi}, inset -1.5px -1.5px 2px ${innerLo}`,
    } as any;
  }
  return {
    shadowColor: isDark ? '#3D2858' : '#665990',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: isDark ? 0.38 : 0.18,
    shadowRadius: 11,
    elevation: 4,
  } as any;
}

function clayCard(isDark: boolean) {
  if (Platform.OS === 'web') {
    const drop = isDark ? 'rgba(35, 22, 55, 0.58)' : 'rgba(102, 89, 144, 0.22)';
    const light = isDark ? 'rgba(124, 111, 255, 0.06)' : 'rgba(255, 255, 255, 0.96)';
    return { boxShadow: `8px 8px 22px ${drop}, -6px -6px 18px ${light}` } as any;
  }
  return {
    shadowColor: isDark ? '#3D2858' : '#665990',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: isDark ? 0.42 : 0.16,
    shadowRadius: 15,
    elevation: 6,
  } as any;
}

type AutofillMode = 'off' | 'password' | 'tel';

function fieldAutofill(fieldKey: string, mode: AutofillMode = 'off') {
  const base: Record<string, unknown> = {
    autoComplete: mode === 'password' ? 'new-password' : 'off',
    textContentType: mode === 'password' ? 'newPassword' : 'none',
    autoCorrect: false,
  };
  if (Platform.OS !== 'web') return base;
  return {
    ...base,
    nativeID: fieldKey,
    id: fieldKey,
    name: fieldKey,
    'data-1p-ignore': 'true',
    'data-lpignore': 'true',
    'data-form-type': 'other',
  };
}

// Reusable Components
const InputField = ({
  label,
  placeholder,
  value,
  onChangeText,
  keyboardType = 'default',
  icon,
  required = false,
  secureTextEntry = false,
  editable = true,
  fieldKey,
  autofillMode = 'off',
  ...rest
}: any) => {
  const {
    theme,
    isDark
  } = useTheme();
  const styles = React.useMemo(() => getStyles(theme, isDark), [theme, isDark]);
  const [showPassword, setShowPassword] = useState(false);
  const [webReadOnly, setWebReadOnly] = useState(Platform.OS === 'web');
  const isPassword = !!secureTextEntry;
  const autofill = fieldKey ? fieldAutofill(fieldKey, autofillMode) : fieldAutofill('ims-stu-field', autofillMode);

  return <View style={styles.inputGroup}>
    <Text style={styles.label}>
      {label} {required && <Text style={{
        color: ADMIN_THEME.colors.danger
      }}>*</Text>}
    </Text>
    <View style={[styles.inputWrapper, !editable && { opacity: 0.65 }]}>
      <Ionicons name={icon} size={20} color={FORM.muted(isDark)} style={styles.inputIcon} />
      <AppTextInput
        style={[styles.input, { color: FORM.text(isDark) }]}
        placeholder={placeholder}
        placeholderTextColor={FORM.muted(isDark)}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType as any}
        secureTextEntry={isPassword && !showPassword}
        editable={editable}
        readOnly={editable ? webReadOnly : undefined}
        onFocus={() => { if (webReadOnly) setWebReadOnly(false); }}
        {...autofill}
        {...rest}
      />
      {isPassword && editable && (
        <ClayPasswordToggle
          visible={showPassword}
          onToggle={() => setShowPassword(v => !v)}
          isDark={isDark}
          accentColor={FORM.brand}
        />
      )}
    </View>
  </View>;
};
const SelectField = ({
  label,
  value,
  options,
  onSelect,
  placeholder,
  icon,
  required = false,
  loading = false
}: any) => {
  const {
    theme,
    isDark
  } = useTheme();
  const styles = React.useMemo(() => getStyles(theme, isDark), [theme, isDark]);
  const [modalVisible, setModalVisible] = useState(false);
  const selectedOption = options.find((opt: any) => opt.id.toString() === value?.toString());
  return <View style={styles.inputGroup}>
    <Text style={styles.label}>
      {label} {required && <Text style={{
        color: ADMIN_THEME.colors.danger
      }}>*</Text>}
    </Text>
    <TouchableOpacity style={styles.inputWrapper} onPress={() => {
      Keyboard.dismiss();
      if (!loading) setModalVisible(true);
    }} disabled={loading}>
      <Ionicons name={icon} size={20} color={ADMIN_THEME.colors.text.muted} style={styles.inputIcon} />
      <Text style={[styles.input, !selectedOption && {
        color: ADMIN_THEME.colors.text.muted
      }, {
        paddingTop: 12
      }]}>
        {loading ? 'Loading...' : selectedOption ? selectedOption.name : placeholder}
      </Text>
      <Ionicons name="chevron-down" size={20} color={ADMIN_THEME.colors.text.muted} />
    </TouchableOpacity>
    <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select {label}</Text>
            <TouchableOpacity onPress={() => setModalVisible(false)} hitSlop={{
              top: 10,
              bottom: 10,
              left: 10,
              right: 10
            }}>
              <Ionicons name="close" size={24} color={ADMIN_THEME.colors.text.primary} />
            </TouchableOpacity>
          </View>
          <FlatList data={options} keyExtractor={(item) => item.id.toString()} contentContainerStyle={{
            paddingBottom: 50
          }} renderItem={({
            item
          }) => {
            return <TouchableOpacity style={[styles.optionItem, value?.toString() === item.id.toString() && styles.selectedOption]} onPress={() => {
              onSelect(item.id);
              setModalVisible(false);
            }}>
              <Text style={[styles.optionText, value?.toString() === item.id.toString() && styles.selectedOptionText]}>
                {item.name}
              </Text>
              {value?.toString() === item.id.toString() && <Ionicons name="checkmark" size={20} color={ADMIN_THEME.colors.primary} />}
            </TouchableOpacity>;
          }} />
        </View>
      </View>
    </Modal>
  </View>;
};
export default function AddStudentScreen() {
  const {
    theme,
    isDark
  } = useTheme();
  const styles = React.useMemo(() => getStyles(theme, isDark), [theme, isDark]);
  const router = useRouter();
  const {
    id
  } = useLocalSearchParams();
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [isEditMode, setIsEditMode] = useState(false);
  const [enrolledForm, setEnrolledForm] = useState<AdmissionFormData | null>(null);

  // Form State
  const [formData, setFormData] = useState<CreateStudentRequest>({
    first_name: '',
    middle_name: '',
    last_name: '',
    dob: '',
    gender_id: 1,
    // Default: Male
    admission_no: '',
    pen_number: '',
    apar_number: '',
    admission_date: new Date().toISOString().split('T')[0],
    status_id: 1,
    // Default: Active
    category_id: 1,
    // Default: General
    religion_id: 1,
    // Default: Hindu
    blood_group_id: 1,
    // Default: A+
    email: '',
    phone: '',
    password: '',
    role_code: 'student',
    class_id: '',
    section_id: '',
    academic_year_id: ''
  });

  // Reference Data State
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);

  // Date Picker State

  // Parent State
  const [father, setFather] = useState({
    first_name: '',
    last_name: '',
    phone: '',
    occupation: ''
  });
  const [mother, setMother] = useState({
    first_name: '',
    last_name: '',
    phone: '',
    occupation: ''
  });
  const [guardian, setGuardian] = useState({
    first_name: '',
    last_name: '',
    phone: '',
    relation: '',
    occupation: ''
  }); // Guardian needs custom relation? Or just 'Guardian'

  useEffect(() => {
    loadReferenceData();
    if (id) {
      setIsEditMode(true);
      loadStudentData(id as string);
    }
  }, [id]);
  const loadReferenceData = async () => {
    try {
      const [classesData, sectionsData, yearsData] = await Promise.all([ClassService.getClasses(), ClassService.getSections(), ClassService.getAcademicYears()]);
      setClasses(classesData);
      setSections(sectionsData);
      setAcademicYears(yearsData);

      // Set current academic year as default
      const currentYear = yearsData.find((y) => {
        const now = new Date();
        return new Date(y.start_date) <= now && new Date(y.end_date) >= now;
      });
      if (currentYear) {
        setFormData((prev) => ({
          ...prev,
          academic_year_id: currentYear.id
        }));
      }
    } catch (error) {

      alertCompat('Error', 'Failed to load classes and academic years');
    } finally {
      setInitialLoading(false);
    }
  };
  const loadStudentData = async (studentId: string) => {
    try {
      const data: any = await StudentService.getById(studentId);
      if (data) {
        setFormData({
          first_name: data.first_name || '',
          middle_name: data.middle_name || '',
          last_name: data.last_name || '',
          dob: normalizeDateInput(data.dob),
          gender_id: data.gender_id || 1,
          admission_no: data.admission_no || '',
          pen_number: data.pen_number || '',
          apar_number: data.apar_number || '',
          admission_date: normalizeDateInput(data.admission_date),
          status_id: data.status_id || 1,
          category_id: data.category_id || 1,
          religion_id: data.religion_id || 1,
          blood_group_id: data.blood_group_id || 1,
          email: data.email || '',
          phone: data.phone || '',
          password: '',
          academic_year_id: data.current_enrollment?.academic_year_id || data.academic_year_id || formData.academic_year_id,
          role_code: 'student',
          class_id: data.current_enrollment?.class_id || '',
          section_id: data.current_enrollment?.section_id || '',
          roll_number: data.current_enrollment?.roll_number
        } as any);
        setFather(mapParentByRelation(data.parents, 'Father'));
        setMother(mapParentByRelation(data.parents, 'Mother'));
        setGuardian({
          ...mapParentByRelation(data.parents, 'Guardian'),
          relation: 'Guardian'
        });
      }
    } catch (error) {

      alertCompat('Error', 'Failed to load student details');
    }
  };
  const handleSave = async () => {
    // Validation
    if (!formData.first_name || !formData.admission_no || !formData.admission_date || !formData.class_id || !formData.section_id) {
      alertCompat('Required Fields', 'Please fill all mandatory fields (First Name, Admission No, Class, Section)');
      return;
    }
    if (!isEditMode && !formData.password) {
      alertCompat('Security', 'Password is required for new students');
      return;
    }

    // Password length check
    if (formData.password && formData.password.length < 6) {
      alertCompat('Weak Password', 'Password must be at least 6 characters long.');
      return;
    }

    // Email format validation
    if (formData.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.email)) {
        alertCompat('Invalid Email', 'Please enter a valid email address.');
        return;
      }
    }

    // Phone number validation (10 digits)
    if (formData.phone) {
      const phoneClean = formData.phone.replace(/\D/g, '');
      if (phoneClean.length < 10) {
        alertCompat('Invalid Phone', 'Phone number must be at least 10 digits.');
        return;
      }
    }

    // DOB: prevent future dates
    if (formData.dob) {
      const dobDate = new Date(formData.dob);
      if (dobDate > new Date()) {
        alertCompat('Invalid DOB', 'Date of birth cannot be in the future.');
        return;
      }
    }

    if (formData.pen_number?.trim()) {
      const pen = formData.pen_number.trim();
      if (pen.length > 30 || !/^[A-Za-z0-9]+$/.test(pen)) {
        alertCompat('Invalid PEN Number', 'PEN must be alphanumeric and at most 30 characters.');
        return;
      }
    }

    // A parent is saved when it has a first name (last name optional). If other
    // fields are filled but the first name is blank, warn instead of silently dropping.
    const partialParent = ([['Father', father], ['Mother', mother], ['Guardian', guardian]] as const)
      .find(([, p]) => !p.first_name?.trim() && (p.last_name?.trim() || p.phone?.trim() || p.occupation?.trim()));
    if (partialParent) {
      alertCompat('Incomplete Parent', `Enter a first name for the ${partialParent[0].toLowerCase()}, or clear the other ${partialParent[0].toLowerCase()} fields.`);
      return;
    }

    setLoading(true);
    try {
      const parents: NonNullable<CreateStudentRequest['parents']> = [];
      if (father.first_name?.trim()) {
        parents.push({
          ...father,
          relation: 'Father' as const,
          is_primary: true
        });
      }
      if (mother.first_name?.trim()) {
        parents.push({
          ...mother,
          relation: 'Mother' as const
        });
      }
      if (guardian.first_name?.trim()) {
        parents.push({
          ...guardian,
          relation: 'Guardian' as const,
          is_guardian: true
        });
      }
      const payload: CreateStudentRequest = {
        ...formData,
        parents
      };
      if (isEditMode) {
        const updatePayload: UpdateStudentRequest = {
          first_name: formData.first_name,
          middle_name: formData.middle_name,
          last_name: formData.last_name,
          dob: formData.dob,
          gender_id: formData.gender_id,
          admission_no: formData.admission_no,
          ...(formData.pen_number?.trim() ? { pen_number: formData.pen_number.trim() } : {}),
          apar_number: formData.apar_number || null,
          admission_date: formData.admission_date,
          status_id: formData.status_id,
          category_id: formData.category_id,
          religion_id: formData.religion_id,
          blood_group_id: formData.blood_group_id,
          email: formData.email,
          phone: formData.phone,
          class_id: formData.class_id,
          section_id: formData.section_id,
          academic_year_id: formData.academic_year_id,
          parents,
          ...(formData.password ? { password: formData.password } : {}),
        };
        const result = await StudentService.update(id as string, updatePayload);
        if (result && typeof result === 'object' && (result as { success?: boolean }).success === false) {
          alertCompat('Save Failed', (result as { message?: string }).message || 'Failed to update student');
          return;
        }
        alertCompat('Success', result?.message || 'Student updated successfully!', [{
          text: 'OK',
          onPress: () => router.back()
        }]);
      } else {
        await StudentService.create(payload);
        setEnrolledForm(
          buildAdmissionFormData({ formData, father, mother, guardian, classes, sections, academicYears }),
        );
      }
    } catch (error: any) {
      const msg = error?.message || error.response?.data?.error || 'Failed to save student';
      alertCompat('Save Failed', msg);
    } finally {
      setLoading(false);
    }
  };
  if (initialLoading) {
    return <View style={styles.loadingContainer}>
      <LogoLoader size={60} color={ADMIN_THEME.colors.primary} />
      <Text style={styles.loadingText}>Initializing form...</Text>
    </View>;
  }
  return <View style={styles.container}>
    <StatusBar barStyle="dark-content" backgroundColor="#fff" />
    <AdminHeader title={isEditMode ? "Edit Student" : "Add Student"} showBackButton={true} />
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{
      flex: 1
    }}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header Info Card */}
        <LinearGradient colors={[ADMIN_THEME.colors.primary, ADMIN_THEME.colors.secondary]} style={styles.headerCard} start={{
          x: 0,
          y: 0
        }} end={{
          x: 1,
          y: 1
        }}>
          <Ionicons name="school" size={40} color="#fff" />
          <Text style={styles.headerTitle}>{isEditMode ? 'Update Record' : 'Enroll New Student'}</Text>
          <Text style={styles.headerSubtitle}>
            {isEditMode ? 'Modify existing student profile' : 'Add a new student to the school database'}
          </Text>
        </LinearGradient>
        {/* Section: Personal Details */}
        <Animated.View entering={FadeInDown.delay(100).duration(500)} style={styles.section}>
          <Text style={styles.sectionHeader}>Personal Details</Text>
          <View style={styles.row}>
            <View style={styles.halfInput}>
              <InputField label="First Name" placeholder="John" value={formData.first_name} onChangeText={(t: string) => setFormData({
                ...formData,
                first_name: t
              })} icon="person-outline" required={true} fieldKey="ims-stu-given-name" />
            </View>
            <View style={styles.halfInput}>
              <InputField label="Last Name" placeholder="Last Name (optional)" value={formData.last_name} onChangeText={(t: string) => setFormData({
                ...formData,
                last_name: t
              })} icon="person-outline" fieldKey="ims-stu-family-name" />
            </View>
          </View>
          <InputField label="Middle Name" placeholder="Optional" value={formData.middle_name} onChangeText={(t: string) => setFormData({
            ...formData,
            middle_name: t
          })} icon="person-outline" fieldKey="ims-stu-middle-name" />
          <SelectField label="Gender" value={formData.gender_id} options={GENDERS} onSelect={(id: number) => setFormData({
            ...formData,
            gender_id: id
          })} icon="transgender-outline" required={true} />
          <AppDatePicker
            label="Date of Birth"
            value={formData.dob || ''}
            onChange={(d) => setFormData({ ...formData, dob: d })}
            maximumDate={new Date()}
            containerStyle={styles.inputGroup}
          />
        </Animated.View>
        {/* Section: Academic Info */}
        <Animated.View entering={FadeInDown.delay(200).duration(500)} style={styles.section}>
          <Text style={styles.sectionHeader}>Academic Information</Text>
          <InputField label="Admission Number" placeholder="ADM2024001" value={formData.admission_no} onChangeText={(t: string) => setFormData({
            ...formData,
            admission_no: t
          })} icon="card-outline" required={true} fieldKey="ims-stu-adm-code" />
          <InputField label="APAR Number" placeholder="Enter APAR number (optional)" value={formData.apar_number || ''} onChangeText={(t: string) => setFormData({
            ...formData,
            apar_number: t
          })} icon="document-text-outline" fieldKey="ims-stu-apar-code" />
          <InputField label="PEN Number" placeholder="PEN2025001 (optional)" value={formData.pen_number || ''} onChangeText={(t: string) => setFormData({
            ...formData,
            pen_number: t
          })} icon="id-card-outline" autoCapitalize="characters" fieldKey="ims-stu-pen-code" />
          {/* 🆕 Roll Number Field */}
          <InputField label="Roll Number" placeholder="Auto-generated" value={(formData as any).roll_number ? String((formData as any).roll_number) : 'Auto-generated'} editable={false} icon="list-outline" fieldKey="ims-stu-roll-num" />
          <AppDatePicker
            label="Admission Date"
            value={formData.admission_date || ''}
            onChange={(d) => setFormData({ ...formData, admission_date: d })}
            maximumDate={new Date()}
            containerStyle={styles.inputGroup}
          />
          <SelectField label="Class" value={formData.class_id} options={classes} onSelect={(id: string) => setFormData({
            ...formData,
            class_id: id
          })} placeholder="Select Class" icon="business-outline" required={true} />
          <SelectField label="Section" value={formData.section_id} options={sections} onSelect={(id: string) => setFormData({
            ...formData,
            section_id: id
          })} placeholder="Select Section" icon="grid-outline" required={true} />
          <SelectField label="Student Status" value={formData.status_id} options={STUDENT_STATUSES} onSelect={(id: number) => setFormData({
            ...formData,
            status_id: id
          })} icon="shield-checkmark-outline" required={true} />
          <SelectField label="Academic Year" value={formData.academic_year_id} options={academicYears.map((y) => ({
            id: y.id,
            name: y.code
          }))} onSelect={(id: string) => setFormData({
            ...formData,
            academic_year_id: id
          })} placeholder="Select Year" icon="time-outline" required={true} />
        </Animated.View>
        {/* Section: Parent Details */}
        <Animated.View entering={FadeInDown.delay(150).duration(500)} style={styles.section}>
          <Text style={styles.sectionHeader}>Parent / Guardian Details</Text>
          {/* Father */}
          <Text style={[styles.label, {
            marginTop: 10,
            color: ADMIN_THEME.colors.primary
          }]}>Father's Details</Text>
          <View style={styles.row}>
            <View style={styles.halfInput}>
              <InputField label="First Name" placeholder="Father Name" value={father.first_name} onChangeText={(t: string) => setFather({
                ...father,
                first_name: t
              })} icon="person-outline" fieldKey="ims-stu-father-given" />
            </View>
            <View style={styles.halfInput}>
              <InputField label="Last Name" placeholder="Surname" value={father.last_name} onChangeText={(t: string) => setFather({
                ...father,
                last_name: t
              })} icon="person-outline" fieldKey="ims-stu-father-family" />
            </View>
          </View>
          <InputField label="Phone" placeholder="Mobile Number" value={father.phone} onChangeText={(t: string) => setFather({
            ...father,
            phone: t
          })} keyboardType="phone-pad" icon="call-outline" fieldKey="ims-stu-father-mobile" autofillMode="tel" />
          <InputField label="Occupation" placeholder="Designation" value={father.occupation} onChangeText={(t: string) => setFather({
            ...father,
            occupation: t
          })} icon="briefcase-outline" fieldKey="ims-stu-father-job" />
          {/* Mother */}
          <Text style={[styles.label, {
            marginTop: 20,
            color: ADMIN_THEME.colors.primary
          }]}>Mother's Details</Text>
          <View style={styles.row}>
            <View style={styles.halfInput}>
              <InputField label="First Name" placeholder="Mother Name" value={mother.first_name} onChangeText={(t: string) => setMother({
                ...mother,
                first_name: t
              })} icon="person-outline" fieldKey="ims-stu-mother-given" />
            </View>
            <View style={styles.halfInput}>
              <InputField label="Last Name" placeholder="Surname" value={mother.last_name} onChangeText={(t: string) => setMother({
                ...mother,
                last_name: t
              })} icon="person-outline" fieldKey="ims-stu-mother-family" />
            </View>
          </View>
          <InputField label="Phone" placeholder="Mobile Number" value={mother.phone} onChangeText={(t: string) => setMother({
            ...mother,
            phone: t
          })} keyboardType="phone-pad" icon="call-outline" fieldKey="ims-stu-mother-mobile" autofillMode="tel" />
          <InputField label="Occupation" placeholder="Designation" value={mother.occupation} onChangeText={(t: string) => setMother({
            ...mother,
            occupation: t
          })} icon="briefcase-outline" fieldKey="ims-stu-mother-job" />
        </Animated.View>
        {/* Section: Additional Details */}
        <Animated.View entering={FadeInDown.delay(300).duration(500)} style={styles.section}>
          <Text style={styles.sectionHeader}>Additional Details</Text>
          <SelectField label="Category" value={formData.category_id} options={STUDENT_CATEGORIES} onSelect={(id: number) => setFormData({
            ...formData,
            category_id: id
          })} icon="list-outline" />
          <SelectField label="Religion" value={formData.religion_id} options={RELIGIONS} onSelect={(id: number) => setFormData({
            ...formData,
            religion_id: id
          })} icon="heart-outline" />
          <SelectField label="Blood Group" value={formData.blood_group_id} options={BLOOD_GROUPS} onSelect={(id: number) => setFormData({
            ...formData,
            blood_group_id: id
          })} icon="water-outline" />
        </Animated.View>
        {/* Section: Contact & Login */}
        <Animated.View entering={FadeInDown.delay(400).duration(500)} style={styles.section}>
          <Text style={styles.sectionHeader}>Contact & Login Credentials</Text>
          <InputField label="Email Address (Login ID)" placeholder="student@example.com" value={formData.email} onChangeText={(t: string) => setFormData({
            ...formData,
            email: t
          })} keyboardType="email-address" icon="mail-outline" fieldKey="ims-stu-contact-addr" autoCapitalize="none" />
          <InputField label="Phone Number" placeholder="+91 9876543210" value={formData.phone} onChangeText={(t: string) => setFormData({
            ...formData,
            phone: t
          })} keyboardType="phone-pad" icon="call-outline" fieldKey="ims-stu-mobile-line" autofillMode="tel" />
          {!isEditMode && <InputField label="Initial Password" placeholder="Min 6 characters" value={formData.password} onChangeText={(t: string) => setFormData({
            ...formData,
            password: t
          })} icon="lock-closed-outline" required={true} secureTextEntry={true} fieldKey="ims-stu-portal-secret" autofillMode="password" />}
        </Animated.View>
        {/* Submit Button */}
        <TouchableOpacity style={[styles.saveButton, loading && styles.saveButtonDisabled]} activeOpacity={0.8} onPress={handleSave} disabled={loading}>
          {loading ? <LogoLoader color="#fff" /> : <>
            <Text style={styles.saveButtonText}>
              {isEditMode ? 'Update Student' : 'Create Student Profile'}
            </Text>
            <Ionicons name="checkmark-circle" size={24} color="#fff" style={{
              marginLeft: 8
            }} />
          </>}
        </TouchableOpacity>
        {/* Date Pickers */}
      </ScrollView>
    </KeyboardAvoidingView>
    <AdmissionSuccessModal
      visible={!!enrolledForm}
      data={enrolledForm}
      onClose={() => { setEnrolledForm(null); router.back(); }}
    />
  </View>;
}
const getStyles = (theme: Theme, isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent'
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background
  },
  loadingText: {
    marginTop: 10,
    color: ADMIN_THEME.colors.text.secondary,
    fontSize: 16
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 50
  },
  headerCard: {
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.background,
    marginTop: 12
  },
  headerSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 8,
    textAlign: 'center'
  },
  section: {
    backgroundColor: FORM.surface(isDark),
    borderRadius: 24,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: FORM.border(isDark),
    ...clayCard(isDark),
  },
  sectionHeader: {
    fontSize: 16,
    fontWeight: 'bold',
    color: FORM.brand,
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: FORM.border(isDark),
    paddingBottom: 8
  },
  row: {
    flexDirection: 'row',
    gap: 12
  },
  halfInput: {
    flex: 1
  },
  inputGroup: {
    marginBottom: 16
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: FORM.label(isDark),
    marginBottom: 8
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: FORM.field(isDark),
    borderRadius: 16,
    borderWidth: 1,
    borderColor: FORM.border(isDark),
    paddingHorizontal: 15,
    height: 50,
    ...clayField(isDark),
  },
  inputIcon: {
    marginRight: 10
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: FORM.text(isDark)
  },
  saveButton: {
    backgroundColor: ADMIN_THEME.colors.primary,
    borderRadius: 18,
    height: 56,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
    shadowColor: '#665990',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.32,
    shadowRadius: 16,
    elevation: 8,
  },
  saveButtonDisabled: {
    opacity: 0.7
  },
  saveButtonText: {
    color: theme.colors.background,
    fontSize: 18,
    fontWeight: 'bold'
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end'
  },
  modalContent: {
    backgroundColor: FORM.surface(isDark),
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    padding: 20,
    maxHeight: '80%',
    width: '100%'
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: FORM.text(isDark)
  },
  optionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: FORM.border(isDark)
  },
  selectedOption: {
    backgroundColor: isDark ? '#221F30' : '#F3EFF8'
  },
  optionText: {
    fontSize: 16,
    color: FORM.label(isDark)
  },
  selectedOptionText: {
    color: FORM.brand,
    fontWeight: '600'
  }
});