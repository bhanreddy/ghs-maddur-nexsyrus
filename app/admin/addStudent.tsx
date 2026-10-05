import { TourTarget } from '@/src/features/app-tour';
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { View, Text, StatusBar, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import AppDatePicker, { toYMD } from '@/src/components/AppDatePicker';
import Animated, { FadeInDown } from 'react-native-reanimated';
import AdminHeader from '../../src/components/AdminHeader';
import { ADMIN_THEME } from '../../src/constants/adminTheme';
import { StudentService, CreateStudentRequest, UpdateStudentRequest } from '../../src/services/studentService';
import { ClassService, ClassInfo, Section, AcademicYear } from '../../src/services/classService';
import { BLOOD_GROUPS, RELIGIONS, STUDENT_CATEGORIES, STUDENT_STATUSES } from '../../src/constants/references';
import { useTheme } from '../../src/hooks/useTheme';
import LogoLoader from '../../src/components/LogoLoader';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import AdmissionSuccessModal from '../../src/components/AdmissionSuccessModal';
import { buildAdmissionFormData, AdmissionFormData } from '../../src/utils/admissionFormPdf';
import KeyboardAwareScreen from '@/components/keyboard/KeyboardAwareScreen';
import StudentPhotoField from '../../src/components/StudentPhotoField';
import AdmissionNumberControl from '../../src/components/AdmissionNumberControl';
import {
  AadhaarNumberField,
  DateOfBirthPartsField,
  GenderBoyGirlSelector,
  PreviousSchoolYesNoSelector,
} from '../../src/components/studentFormControls';
import {
  SECTION_COLORS,
  InputField,
  SelectField,
  SectionCard,
  ProgressRail,
  ParentBlock,
  StickySaveBar,
  AdmissionHero,
  FormCanvas,
  getAdmissionStyles,
} from '../../src/components/studentAdmissionChrome';

type ParentFormState = {
  first_name: string;
  last_name: string;
  phone: string;
  occupation: string;
};

type FieldErrors = Partial<Record<string, string>>;

const emptyParentState = (): ParentFormState => ({
  first_name: '',
  last_name: '',
  phone: '',
  occupation: '',
});

function normalizeDateInput(value?: string | null): string {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return toYMD(parsed);
}

function mapParentByRelation(
  parents: { relation?: string; relationship?: string; first_name?: string; last_name?: string; phone?: string; occupation?: string }[] | null | undefined,
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
    occupation: match.occupation || '',
  };
}

export default function AddStudentScreen() {
  const { theme, isDark } = useTheme();
  const styles = useMemo(() => getAdmissionStyles(theme, isDark), [theme, isDark]);
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [isEditMode, setIsEditMode] = useState(false);
  const [enrolledForm, setEnrolledForm] = useState<AdmissionFormData | null>(null);
  const [currentPhotoUrl, setCurrentPhotoUrl] = useState<string | null>(null);
  const [photoSelection, setPhotoSelection] = useState<string | null | undefined>(undefined);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const [formData, setFormData] = useState<CreateStudentRequest>({
    first_name: '',
    middle_name: '',
    last_name: '',
    dob: '',
    gender_id: 1,
    admission_no: '',
    pen_number: '',
    apar_number: '',
    village: '',
    aadhaar_number: '',
    tc_number: '',
    previous_school: null,
    admission_date: new Date().toISOString().split('T')[0],
    status_id: 1,
    category_id: 1,
    religion_id: 1,
    blood_group_id: 1,
    email: '',
    phone: '',
    password: '',
    role_code: 'student',
    class_id: '',
    section_id: '',
    academic_year_id: '',
  });

  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);

  const [father, setFather] = useState(emptyParentState());
  const [mother, setMother] = useState(emptyParentState());
  const [guardian, setGuardian] = useState({
    ...emptyParentState(),
    relation: '',
  });

  const clearError = (key: string) => {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const personalComplete = !!formData.first_name?.trim();
  const academicComplete = !!(formData.admission_no?.trim() && formData.class_id && formData.section_id && formData.academic_year_id && formData.admission_date);
  const parentsComplete = !!(father.first_name?.trim() || mother.first_name?.trim() || guardian.first_name?.trim());
  const detailsComplete = !!(formData.category_id && formData.religion_id && formData.blood_group_id);
  const loginComplete = isEditMode
    ? !!(formData.email?.trim() || formData.phone?.trim())
    : !!(formData.password && formData.password.length >= 6);

  const completedSteps = [personalComplete, academicComplete, parentsComplete, detailsComplete, loginComplete];
  const activeStep = Math.min(
    completedSteps.findIndex((done) => !done) === -1 ? 4 : completedSteps.findIndex((done) => !done),
    4,
  );
  const progressPercent = (completedSteps.filter(Boolean).length / completedSteps.length) * 100;

  const missingRequired = [
    !formData.first_name?.trim() && 'First name',
    !formData.admission_no?.trim() && 'Admission no',
    !formData.admission_date && 'Admission date',
    !formData.class_id && 'Class',
    !formData.section_id && 'Section',
    !isEditMode && !formData.password && 'Password',
    formData.previous_school === true && !formData.tc_number?.trim() && 'TC number',
  ].filter(Boolean) as string[];

  const selectedClass = classes.find((c) => c.id?.toString() === formData.class_id?.toString());
  const selectedSection = sections.find((s) => s.id?.toString() === formData.section_id?.toString());
  const scrollRef = useRef<ScrollView>(null);
  const sectionOffsets = useRef<number[]>([0, 0, 0, 0, 0]);
  const displayedPhoto = photoSelection === undefined ? currentPhotoUrl : photoSelection;

  const jumpToSection = useCallback((index: number) => {
    const y = sectionOffsets.current[index] ?? 0;
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
  }, []);

  const loadReferenceData = useCallback(async () => {
    try {
      const [classesData, sectionsData, yearsData] = await Promise.all([
        ClassService.getClasses(),
        ClassService.getSections(),
        ClassService.getAcademicYears(),
      ]);
      setClasses(classesData);
      setSections(sectionsData);
      setAcademicYears(yearsData);

      const currentYear = yearsData.find((y) => {
        const now = new Date();
        return new Date(y.start_date) <= now && new Date(y.end_date) >= now;
      });
      // Default the year only for a new admission. In edit mode the student's
      // fetched enrollment/exit year is authoritative and must not lose a race
      // against this reference-data request.
      if (currentYear && !id) {
        setFormData((prev) => ({
          ...prev,
          academic_year_id: currentYear.id,
        }));
      }
    } catch {
      alertCompat('Error', 'Failed to load classes and academic years');
    } finally {
      setInitialLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadReferenceData();
    setIsEditMode(Boolean(id));
  }, [id, loadReferenceData]);

  const loadStudentData = useCallback(async (studentId: string) => {
    try {
      const data: any = await StudentService.getById(studentId);
      if (data) {
        setCurrentPhotoUrl(data.photo_url || null);
        setPhotoSelection(undefined);
        setFormData((previous) => ({
          first_name: data.first_name || '',
          middle_name: data.middle_name || '',
          last_name: data.last_name || '',
          dob: normalizeDateInput(data.dob),
          gender_id: data.gender_id || 1,
          admission_no: data.admission_no || '',
          pen_number: data.pen_number || '',
          apar_number: data.apar_number || '',
          village: data.village || '',
          aadhaar_number: data.aadhaar_number || '',
          tc_number: data.tc_number || '',
          previous_school: typeof data.previous_school === 'boolean' ? data.previous_school : null,
          admission_date: normalizeDateInput(data.admission_date),
          status_id: data.status_id || 1,
          category_id: data.category_id ?? undefined,
          religion_id: data.religion_id ?? undefined,
          blood_group_id: data.blood_group_id ?? undefined,
          email: data.email || '',
          phone: data.phone || '',
          password: '',
          academic_year_id: data.exit_academic_year_id || data.current_enrollment?.academic_year_id || data.academic_year_id || previous.academic_year_id,
          role_code: 'student',
          class_id: data.current_enrollment?.class_id || '',
          section_id: data.current_enrollment?.section_id || '',
          roll_number: data.current_enrollment?.roll_number,
        } as any));
        setFather(mapParentByRelation(data.parents, 'Father'));
        setMother(mapParentByRelation(data.parents, 'Mother'));
        setGuardian({
          ...mapParentByRelation(data.parents, 'Guardian'),
          relation: 'Guardian',
        });
      }
    } catch {
      alertCompat('Error', 'Failed to load student details');
    }
  }, []);

  // Expo Router keeps screens mounted in the navigation stack. Refetch whenever
  // Edit Student regains focus so a completed bulk update cannot leave stale
  // values in an existing form instance.
  useFocusEffect(
    useCallback(() => {
      if (id) loadStudentData(String(id));
    }, [id, loadStudentData]),
  );

  const validate = (): FieldErrors => {
    const errors: FieldErrors = {};
    if (!formData.first_name?.trim()) errors.first_name = 'First name is required';
    if (!formData.admission_no?.trim()) errors.admission_no = 'Admission number is required';
    if (!formData.admission_date) errors.admission_date = 'Admission date is required';
    if (!formData.class_id) errors.class_id = 'Select a class';
    if (!formData.section_id) errors.section_id = 'Select a section';
    if (!isEditMode && !formData.password) errors.password = 'Password is required for new students';
    if (formData.password && formData.password.length < 6) errors.password = 'Password must be at least 6 characters';
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) errors.email = 'Enter a valid email';
    if (formData.phone && formData.phone.replace(/\D/g, '').length < 10) errors.phone = 'Phone must be at least 10 digits';
    if (formData.dob && new Date(formData.dob) > new Date()) errors.dob = 'Date of birth cannot be in the future';
    if (formData.pen_number?.trim()) {
      const pen = formData.pen_number.trim();
      if (pen.length > 30 || !/^[A-Za-z0-9]+$/.test(pen)) errors.pen_number = 'PEN must be alphanumeric (max 30)';
    }
    const aadhaarDigits = String(formData.aadhaar_number || '').replace(/\D/g, '');
    if (aadhaarDigits && aadhaarDigits.length !== 12) errors.aadhaar_number = 'Aadhaar must be exactly 12 digits';
    if (formData.previous_school === true && !formData.tc_number?.trim()) {
      errors.tc_number = 'TC number is required for transfer students';
    }
    const partialParent = ([['Father', father], ['Mother', mother], ['Guardian', guardian]] as const)
      .find(([, p]) => !p.first_name?.trim() && (p.last_name?.trim() || p.phone?.trim() || p.occupation?.trim()));
    if (partialParent) {
      errors.parent = `Enter a first name for the ${partialParent[0].toLowerCase()}, or clear the other fields`;
    }
    return errors;
  };

  const update = (key: keyof CreateStudentRequest, val: any) => {
    clearError(String(key));
    setFormData((prev) => ({ ...prev, [key]: val }));
  };

  const handleSave = async () => {
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      const first = Object.values(errors)[0];
      alertCompat('Check the form', first || 'Please fill all mandatory fields');
      return;
    }

    setLoading(true);
    try {
      const aadhaarDigits = String(formData.aadhaar_number || '').replace(/\D/g, '');
      const parents: NonNullable<CreateStudentRequest['parents']> = [];
      if (father.first_name?.trim()) {
        parents.push({
          ...father,
          relation: 'Father' as const,
          is_primary: true,
        });
      }
      if (mother.first_name?.trim()) {
        parents.push({
          ...mother,
          relation: 'Mother' as const,
        });
      }
      if (guardian.first_name?.trim()) {
        parents.push({
          ...guardian,
          relation: 'Guardian' as const,
          is_guardian: true,
        });
      }
      const previousSchool = typeof formData.previous_school === 'boolean' ? formData.previous_school : null;
      const tcNumber = previousSchool === true ? (formData.tc_number?.trim() || null) : null;
      const payload: CreateStudentRequest = {
        ...formData,
        aadhaar_number: aadhaarDigits || null,
        tc_number: tcNumber,
        previous_school: previousSchool,
        parents,
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
          village: formData.village?.trim() || null,
          aadhaar_number: aadhaarDigits || null,
          tc_number: tcNumber,
          previous_school: previousSchool,
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
        let photoError: string | null = null;
        try {
          if (typeof photoSelection === 'string') {
            await StudentService.uploadPhoto(id as string, photoSelection);
          } else if (photoSelection === null && currentPhotoUrl) {
            await StudentService.removePhoto(id as string);
          }
        } catch (error: any) {
          photoError = error?.message || 'The selected profile picture could not be saved.';
        }
        alertCompat(photoError ? 'Student Updated' : 'Success', photoError
          ? `Student details were saved, but the profile picture failed: ${photoError}`
          : result?.message || 'Student updated successfully!', [{
          text: 'OK',
          onPress: () => router.back(),
        }]);
      } else {
        const created = await StudentService.create(payload);
        const admissionPhotoUri = typeof photoSelection === 'string' ? photoSelection : null;
        const admissionForm = buildAdmissionFormData({
          formData: payload,
          father,
          mother,
          guardian,
          classes,
          sections,
          academicYears,
          photoUri: admissionPhotoUri,
        });
        if (typeof photoSelection === 'string') {
          try {
            await StudentService.uploadPhoto(created.student.id, photoSelection);
          } catch (error: any) {
            const message = error?.message || 'The selected profile picture could not be saved.';
            alertCompat(
              'Student Created',
              `The student was enrolled, but the profile picture failed: ${message}`,
              [{ text: 'Continue', onPress: () => setEnrolledForm(admissionForm) }],
            );
            return;
          }
        }
        setEnrolledForm(admissionForm);
      }
    } catch (error: any) {
      const msg = error?.message || error.response?.data?.error || 'Failed to save student';
      alertCompat('Save Failed', msg);
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading) {
    return (
      <FormCanvas isDark={isDark}>
        <View style={styles.loadingContainer}>
          <LogoLoader size={60} color={ADMIN_THEME.colors.primary} />
          <Text style={styles.loadingTitle}>Setting up form</Text>
          <Text style={styles.loadingSubtitle}>Loading classes and reference data…</Text>
        </View>
      </FormCanvas>
    );
  }

  const isTerminalStatus = formData.status_id === 2 || formData.status_id === 3;
  const availableStudentStatuses = isEditMode
    ? STUDENT_STATUSES
    : STUDENT_STATUSES.filter((status) => status.code === 'active');

  return (
    <FormCanvas isDark={isDark}>
      <View style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.colors.background} />
      <TourTarget id="screen.admin-add-student.overview"><AdminHeader title={isEditMode ? 'Edit Student' : 'Add Student'} showBackButton /></TourTarget>

      <TourTarget id="screen.admin-add-student.workspace" style={{ flex: 1 }}><KeyboardAwareScreen
        variant="scroll"
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bottomOffset={24}
        extraScrollPadding={120}
        scrollViewRef={scrollRef}
      >
        <AdmissionHero
          isEditMode={isEditMode}
          firstName={formData.first_name}
          lastName={formData.last_name}
          admissionNo={formData.admission_no}
          classLabel={selectedClass?.name}
          sectionLabel={selectedSection?.name}
          photoUrl={displayedPhoto}
          statusId={formData.status_id}
          genderId={formData.gender_id}
          rollNumber={(formData as any).roll_number}
        />

        <Animated.View entering={FadeInDown.delay(80).duration(400)}>
          <ProgressRail
            activeStep={activeStep}
            completedSteps={completedSteps}
            percent={progressPercent}
            isDark={isDark}
            onStepPress={jumpToSection}
          />
        </Animated.View>

        <SectionCard
          title="Personal Details"
          icon="person-outline"
          colorKey="personal"
          delay={140}
          complete={personalComplete}
          stepNumber={1}
          onLayout={(e) => { sectionOffsets.current[0] = e.nativeEvent.layout.y; }}
          meta={personalComplete ? 'Identity started' : 'Name, photo & identity'}
        >
          <StudentPhotoField
            currentPhotoUrl={currentPhotoUrl}
            value={photoSelection}
            studentName={[formData.first_name, formData.last_name].filter(Boolean).join(' ')}
            onChange={setPhotoSelection}
            accentColor={SECTION_COLORS.personal.accent}
            isDark={isDark}
          />
          <View style={styles.row}>
            <View style={styles.halfInput}>
              <InputField
                label="First Name"
                placeholder="John"
                value={formData.first_name}
                onChangeText={(t: string) => update('first_name', t)}
                icon="person-outline"
                required
                accentColor={SECTION_COLORS.personal.accent}
                fieldKey="ims-stu-given-name"
                error={fieldErrors.first_name}
              />
            </View>
            <View style={styles.halfInput}>
              <InputField
                label="Last Name"
                placeholder="Last Name (optional)"
                value={formData.last_name}
                onChangeText={(t: string) => update('last_name', t)}
                icon="person-outline"
                accentColor={SECTION_COLORS.personal.accent}
                fieldKey="ims-stu-family-name"
              />
            </View>
          </View>
          <InputField
            label="Middle Name"
            placeholder="Optional"
            value={formData.middle_name}
            onChangeText={(t: string) => update('middle_name', t)}
            icon="person-outline"
            accentColor={SECTION_COLORS.personal.accent}
            fieldKey="ims-stu-middle-name"
          />
          <GenderBoyGirlSelector
            value={formData.gender_id}
            onSelect={(gid) => update('gender_id', gid)}
            required
            accentColor={SECTION_COLORS.personal.accent}
            isDark={isDark}
          />
          <DateOfBirthPartsField
            value={formData.dob || ''}
            onChange={(d) => update('dob', d)}
            accentColor={SECTION_COLORS.personal.accent}
            isDark={isDark}
          />
          {fieldErrors.dob ? (
            <Text style={{ color: '#EF4444', fontSize: 11.5, fontWeight: '600', marginBottom: 10 }}>{fieldErrors.dob}</Text>
          ) : null}
          <AadhaarNumberField
            value={formData.aadhaar_number || ''}
            onChange={(digits) => update('aadhaar_number', digits)}
            accentColor={SECTION_COLORS.personal.accent}
            isDark={isDark}
          />
          {fieldErrors.aadhaar_number ? (
            <Text style={{ color: '#EF4444', fontSize: 11.5, fontWeight: '600', marginBottom: 10 }}>{fieldErrors.aadhaar_number}</Text>
          ) : null}
          <PreviousSchoolYesNoSelector
            value={formData.previous_school}
            onSelect={(v) => setFormData({
              ...formData,
              previous_school: v,
              tc_number: v ? formData.tc_number : '',
            })}
            accentColor={SECTION_COLORS.personal.accent}
            isDark={isDark}
          />
          {(formData.previous_school === true || Boolean(formData.tc_number?.trim())) && (
            <InputField
              label="TC Number"
              placeholder="Enter TC number from previous school"
              value={formData.tc_number || ''}
              onChangeText={(t: string) => update('tc_number', t)}
              icon="document-outline"
              accentColor={SECTION_COLORS.personal.accent}
              fieldKey="ims-stu-tc-number"
              required={formData.previous_school === true}
              error={fieldErrors.tc_number}
            />
          )}
          <InputField
            label="Village"
            placeholder="Village (optional)"
            value={formData.village || ''}
            onChangeText={(t: string) => update('village', t)}
            icon="location-outline"
            accentColor={SECTION_COLORS.personal.accent}
            fieldKey="ims-stu-village"
          />
        </SectionCard>

        <SectionCard
          title="Academic Information"
          icon="school-outline"
          colorKey="academic"
          delay={200}
          complete={academicComplete}
          stepNumber={2}
          onLayout={(e) => { sectionOffsets.current[1] = e.nativeEvent.layout.y; }}
          meta={academicComplete ? 'Class placement set' : 'Admission, class & year'}
        >
          <AdmissionNumberControl
            value={formData.admission_no}
            onChange={(t: string) => update('admission_no', t)}
            isEditMode={isEditMode}
            accentColor={SECTION_COLORS.academic.accent}
            error={fieldErrors.admission_no}
          />
          <InputField
            label="APAR Number"
            placeholder="Enter APAR number (optional)"
            value={formData.apar_number || ''}
            onChangeText={(t: string) => update('apar_number', t)}
            icon="document-text-outline"
            accentColor={SECTION_COLORS.academic.accent}
            fieldKey="ims-stu-apar-code"
          />
          <InputField
            label="PEN Number"
            placeholder="PEN2025001 (optional)"
            value={formData.pen_number || ''}
            onChangeText={(t: string) => update('pen_number', t)}
            icon="id-card-outline"
            autoCapitalize="characters"
            accentColor={SECTION_COLORS.academic.accent}
            fieldKey="ims-stu-pen-code"
            error={fieldErrors.pen_number}
          />
          <InputField
            label="Roll Number"
            placeholder="Auto-generated"
            value={(formData as any).roll_number ? String((formData as any).roll_number) : ''}
            editable={false}
            icon="list-outline"
            accentColor={SECTION_COLORS.academic.accent}
            fieldKey="ims-stu-roll-num"
            hint="Assigned automatically after enrollment"
          />
          <AppDatePicker
            label="Admission Date"
            value={formData.admission_date || ''}
            onChange={(d) => update('admission_date', d)}
            maximumDate={new Date()}
            required
            accentColor={SECTION_COLORS.academic.accent}
            isDark={isDark}
            showSelectedBadge
            containerStyle={styles.inputGroup}
          />
          <View style={styles.row}>
            <View style={styles.halfInput}>
              <SelectField
                label="Class"
                value={formData.class_id}
                options={classes}
                onSelect={(gid: string) => update('class_id', gid)}
                placeholder="Class"
                icon="business-outline"
                required
                accentColor={SECTION_COLORS.academic.accent}
                error={fieldErrors.class_id}
              />
            </View>
            <View style={styles.halfInput}>
              <SelectField
                label="Section"
                value={formData.section_id}
                options={sections}
                onSelect={(gid: string) => update('section_id', gid)}
                placeholder="Section"
                icon="grid-outline"
                required
                accentColor={SECTION_COLORS.academic.accent}
                error={fieldErrors.section_id}
              />
            </View>
          </View>
          <SelectField
            label={isTerminalStatus ? 'Exit Academic Year' : 'Academic Year'}
            value={formData.academic_year_id}
            options={academicYears.map((y) => ({ id: y.id, name: y.code }))}
            onSelect={(gid: string) => update('academic_year_id', gid)}
            placeholder="Select Year"
            icon="time-outline"
            required
            accentColor={SECTION_COLORS.academic.accent}
          />
          <SelectField
            label="Student Status"
            value={formData.status_id}
            options={availableStudentStatuses}
            onSelect={(gid: number) => update('status_id', gid)}
            icon="shield-checkmark-outline"
            required
            accentColor={SECTION_COLORS.academic.accent}
          />
          {isEditMode && isTerminalStatus && (
            <View style={styles.statusNotice}>
              <Ionicons name="information-circle-outline" size={20} color="#9A3412" />
              <Text style={styles.statusNoticeText}>
                Saving will move this student out of active counts and close the enrollment under the selected exit academic year. All historical data will be retained.
              </Text>
            </View>
          )}
        </SectionCard>

        <SectionCard
          title="Parent / Guardian"
          icon="people-outline"
          colorKey="parents"
          delay={260}
          complete={parentsComplete}
          stepNumber={3}
          onLayout={(e) => { sectionOffsets.current[2] = e.nativeEvent.layout.y; }}
          meta={parentsComplete ? 'Family contact added' : 'Optional — add when available'}
        >
          {fieldErrors.parent ? (
            <Text style={{ color: '#EF4444', fontSize: 11.5, fontWeight: '600', marginBottom: 8 }}>{fieldErrors.parent}</Text>
          ) : null}
          <ParentBlock
            title="Father"
            icon="man-outline"
            accentColor={SECTION_COLORS.parents.accent}
            filled={!!father.first_name?.trim()}
          >
            <View style={styles.row}>
              <View style={styles.halfInput}>
                <InputField
                  label="First Name"
                  placeholder="Father's name"
                  value={father.first_name}
                  onChangeText={(t: string) => { clearError('parent'); setFather({ ...father, first_name: t }); }}
                  icon="person-outline"
                  accentColor={SECTION_COLORS.parents.accent}
                  fieldKey="ims-stu-father-given"
                />
              </View>
              <View style={styles.halfInput}>
                <InputField
                  label="Last Name"
                  placeholder="Surname"
                  value={father.last_name}
                  onChangeText={(t: string) => setFather({ ...father, last_name: t })}
                  icon="person-outline"
                  accentColor={SECTION_COLORS.parents.accent}
                  fieldKey="ims-stu-father-family"
                />
              </View>
            </View>
            <View style={styles.row}>
              <View style={styles.halfInput}>
                <InputField
                  label="Phone"
                  placeholder="Mobile"
                  value={father.phone}
                  onChangeText={(t: string) => setFather({ ...father, phone: t })}
                  keyboardType="phone-pad"
                  icon="call-outline"
                  accentColor={SECTION_COLORS.parents.accent}
                  fieldKey="ims-stu-father-mobile"
                  autofillMode="tel"
                />
              </View>
              <View style={styles.halfInput}>
                <InputField
                  label="Occupation"
                  placeholder="Job title"
                  value={father.occupation}
                  onChangeText={(t: string) => setFather({ ...father, occupation: t })}
                  icon="briefcase-outline"
                  accentColor={SECTION_COLORS.parents.accent}
                  fieldKey="ims-stu-father-job"
                />
              </View>
            </View>
          </ParentBlock>

          <ParentBlock
            title="Mother"
            icon="woman-outline"
            accentColor={SECTION_COLORS.parents.accent}
            filled={!!mother.first_name?.trim()}
          >
            <View style={styles.row}>
              <View style={styles.halfInput}>
                <InputField
                  label="First Name"
                  placeholder="Mother's name"
                  value={mother.first_name}
                  onChangeText={(t: string) => { clearError('parent'); setMother({ ...mother, first_name: t }); }}
                  icon="person-outline"
                  accentColor={SECTION_COLORS.parents.accent}
                  fieldKey="ims-stu-mother-given"
                />
              </View>
              <View style={styles.halfInput}>
                <InputField
                  label="Last Name"
                  placeholder="Surname"
                  value={mother.last_name}
                  onChangeText={(t: string) => setMother({ ...mother, last_name: t })}
                  icon="person-outline"
                  accentColor={SECTION_COLORS.parents.accent}
                  fieldKey="ims-stu-mother-family"
                />
              </View>
            </View>
            <View style={styles.row}>
              <View style={styles.halfInput}>
                <InputField
                  label="Phone"
                  placeholder="Mobile"
                  value={mother.phone}
                  onChangeText={(t: string) => setMother({ ...mother, phone: t })}
                  keyboardType="phone-pad"
                  icon="call-outline"
                  accentColor={SECTION_COLORS.parents.accent}
                  fieldKey="ims-stu-mother-mobile"
                  autofillMode="tel"
                />
              </View>
              <View style={styles.halfInput}>
                <InputField
                  label="Occupation"
                  placeholder="Job title"
                  value={mother.occupation}
                  onChangeText={(t: string) => setMother({ ...mother, occupation: t })}
                  icon="briefcase-outline"
                  accentColor={SECTION_COLORS.parents.accent}
                  fieldKey="ims-stu-mother-job"
                />
              </View>
            </View>
          </ParentBlock>

          <ParentBlock
            title="Guardian"
            icon="shield-outline"
            accentColor={SECTION_COLORS.parents.accent}
            filled={!!guardian.first_name?.trim()}
          >
            <View style={styles.row}>
              <View style={styles.halfInput}>
                <InputField
                  label="First Name"
                  placeholder="Guardian's name"
                  value={guardian.first_name}
                  onChangeText={(t: string) => { clearError('parent'); setGuardian({ ...guardian, first_name: t }); }}
                  icon="person-outline"
                  accentColor={SECTION_COLORS.parents.accent}
                  fieldKey="ims-stu-guardian-given"
                />
              </View>
              <View style={styles.halfInput}>
                <InputField
                  label="Last Name"
                  placeholder="Surname"
                  value={guardian.last_name}
                  onChangeText={(t: string) => setGuardian({ ...guardian, last_name: t })}
                  icon="person-outline"
                  accentColor={SECTION_COLORS.parents.accent}
                  fieldKey="ims-stu-guardian-family"
                />
              </View>
            </View>
            <View style={styles.row}>
              <View style={styles.halfInput}>
                <InputField
                  label="Phone"
                  placeholder="Mobile"
                  value={guardian.phone}
                  onChangeText={(t: string) => setGuardian({ ...guardian, phone: t })}
                  keyboardType="phone-pad"
                  icon="call-outline"
                  accentColor={SECTION_COLORS.parents.accent}
                  fieldKey="ims-stu-guardian-mobile"
                  autofillMode="tel"
                />
              </View>
              <View style={styles.halfInput}>
                <InputField
                  label="Occupation"
                  placeholder="Job title"
                  value={guardian.occupation}
                  onChangeText={(t: string) => setGuardian({ ...guardian, occupation: t })}
                  icon="briefcase-outline"
                  accentColor={SECTION_COLORS.parents.accent}
                  fieldKey="ims-stu-guardian-job"
                />
              </View>
            </View>
          </ParentBlock>
        </SectionCard>

        <SectionCard
          title="Additional Details"
          icon="options-outline"
          colorKey="additional"
          delay={320}
          complete={detailsComplete}
          stepNumber={4}
          onLayout={(e) => { sectionOffsets.current[3] = e.nativeEvent.layout.y; }}
          meta="Category, religion & blood group"
        >
          <SelectField
            label="Category"
            value={formData.category_id}
            options={STUDENT_CATEGORIES}
            onSelect={(gid: number) => update('category_id', gid)}
            icon="list-outline"
            accentColor={SECTION_COLORS.additional.accent}
          />
          <SelectField
            label="Religion"
            value={formData.religion_id}
            options={RELIGIONS}
            onSelect={(gid: number) => update('religion_id', gid)}
            icon="heart-outline"
            accentColor={SECTION_COLORS.additional.accent}
          />
          <SelectField
            label="Blood Group"
            value={formData.blood_group_id}
            options={BLOOD_GROUPS}
            onSelect={(gid: number) => update('blood_group_id', gid)}
            icon="water-outline"
            accentColor={SECTION_COLORS.additional.accent}
          />
        </SectionCard>

        <SectionCard
          title="Contact & Login"
          icon="lock-closed-outline"
          colorKey="credentials"
          delay={380}
          complete={loginComplete}
          stepNumber={5}
          onLayout={(e) => { sectionOffsets.current[4] = e.nativeEvent.layout.y; }}
          meta={isEditMode ? 'Update credentials if needed' : 'Portal access for the student'}
        >
          <InputField
            label="Email Address"
            placeholder="student@school.edu"
            value={formData.email}
            onChangeText={(t: string) => update('email', t)}
            keyboardType="email-address"
            icon="mail-outline"
            accentColor={SECTION_COLORS.credentials.accent}
            fieldKey="ims-stu-contact-addr"
            autoCapitalize="none"
            error={fieldErrors.email}
          />
          <InputField
            label="Phone Number"
            placeholder="+91 9876543210"
            value={formData.phone}
            onChangeText={(t: string) => update('phone', t)}
            keyboardType="phone-pad"
            icon="call-outline"
            accentColor={SECTION_COLORS.credentials.accent}
            fieldKey="ims-stu-mobile-line"
            autofillMode="tel"
            error={fieldErrors.phone}
          />
          <InputField
            label={isEditMode ? 'New Password (optional)' : 'Initial Password'}
            placeholder={isEditMode ? 'Leave empty to keep current' : 'Min 6 characters'}
            value={formData.password}
            onChangeText={(t: string) => update('password', t)}
            icon="lock-closed-outline"
            required={!isEditMode}
            secureTextEntry
            accentColor={SECTION_COLORS.credentials.accent}
            fieldKey="ims-stu-portal-secret"
            autofillMode="password"
            error={fieldErrors.password}
            hint={!isEditMode ? 'Students use this password for first login' : undefined}
          />
        </SectionCard>
      </KeyboardAwareScreen></TourTarget>

      <StickySaveBar
        loading={loading}
        isEditMode={isEditMode}
        statusId={formData.status_id}
        missingCount={missingRequired.length}
        missingLabels={missingRequired}
        onPress={handleSave}
        isDark={isDark}
      />

      <AdmissionSuccessModal
        visible={!!enrolledForm}
        data={enrolledForm}
        onClose={() => { setEnrolledForm(null); router.back(); }}
      />
    </View>
    </FormCanvas>
  );
}
