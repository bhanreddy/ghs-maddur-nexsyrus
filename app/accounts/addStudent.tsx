import { TourTarget } from '@/src/features/app-tour';
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { View, Text, StatusBar, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import AppDatePicker from '@/src/components/AppDatePicker';
import Animated, { FadeInDown } from 'react-native-reanimated';
import AdminHeader from '../../src/components/AdminHeader';
import { useAccountsWebChrome } from '../../src/contexts/AccountsWebChromeContext';
import { ADMIN_THEME } from '../../src/constants/adminTheme';
import { StudentService, CreateStudentRequest } from '../../src/services/studentService';
import { APIError } from '../../src/services/apiClient';
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

type FieldErrors = Partial<Record<string, string>>;

export default function AddStudentScreen() {
  const { theme, isDark } = useTheme();
  const { shellActive } = useAccountsWebChrome();
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
    first_name: '', middle_name: '', last_name: '',
    dob: '', gender_id: 1,
    admission_no: '', pen_number: '', apar_number: '', village: '',
    aadhaar_number: '', tc_number: '', previous_school: null,
    admission_date: new Date().toISOString().split('T')[0],
    status_id: 1, category_id: 1, religion_id: 1, blood_group_id: 1,
    email: '', phone: '', password: '', role_code: 'student',
    class_id: '', section_id: '', academic_year_id: '',
  });

  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);

  const [father, setFather] = useState({ first_name: '', last_name: '', phone: '', occupation: '' });
  const [mother, setMother] = useState({ first_name: '', last_name: '', phone: '', occupation: '' });
  const [guardian, setGuardian] = useState({ first_name: '', last_name: '', phone: '', relation: '', occupation: '' });

  const clearError = (key: string) => {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const personalComplete = !!formData.first_name?.trim();
  const academicComplete = !!(formData.admission_no?.trim() && formData.class_id && formData.section_id && formData.academic_year_id);
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
        ClassService.getClasses(), ClassService.getSections(), ClassService.getAcademicYears(),
      ]);
      setClasses(classesData); setSections(sectionsData); setAcademicYears(yearsData);
      const now = new Date();
      const currentYear = yearsData.find((y: AcademicYear) =>
        new Date(y.start_date) <= now && new Date(y.end_date) >= now
      );
      // Existing students keep the year returned by their enrollment/exit
      // record; this default is only valid for a new admission.
      if (currentYear && !id) setFormData(prev => ({ ...prev, academic_year_id: currentYear.id }));
    } catch { alertCompat('Error', 'Failed to load reference data'); }
    finally { setInitialLoading(false); }
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
        setFormData({
          first_name: data.first_name || '', middle_name: data.middle_name || '',
          last_name: data.last_name || '', dob: data.dob || '',
          gender_id: data.gender_id || 1, admission_no: data.admission_no || '',
          pen_number: data.pen_number || '',
          apar_number: data.apar_number || '',
          village: data.village || '',
          aadhaar_number: data.aadhaar_number || '',
          tc_number: data.tc_number || '',
          previous_school: typeof data.previous_school === 'boolean' ? data.previous_school : null,
          admission_date: data.admission_date || '', status_id: data.status_id || 1,
          category_id: data.category_id ?? undefined, religion_id: data.religion_id ?? undefined,
          blood_group_id: data.blood_group_id ?? undefined, email: data.email || '',
          phone: data.phone || '', password: '', role_code: 'student',
          academic_year_id: data.exit_academic_year_id || data.current_enrollment?.academic_year_id || data.academic_year_id || '',
          class_id: data.current_enrollment?.class_id || '',
          section_id: data.current_enrollment?.section_id || '',
          roll_number: data.current_enrollment?.roll_number,
        } as any);

        const findParent = (relation: string) =>
          (data.parents || []).find((p: any) => {
            const label = p.relation || p.relationship || '';
            return label.toLowerCase() === relation.toLowerCase();
          });
        const fatherData = findParent('Father');
        const motherData = findParent('Mother');
        const guardianData = findParent('Guardian');
        setFather({
          first_name: fatherData?.first_name || '', last_name: fatherData?.last_name || '',
          phone: fatherData?.phone || '', occupation: fatherData?.occupation || '',
        });
        setMother({
          first_name: motherData?.first_name || '', last_name: motherData?.last_name || '',
          phone: motherData?.phone || '', occupation: motherData?.occupation || '',
        });
        setGuardian({
          first_name: guardianData?.first_name || '', last_name: guardianData?.last_name || '',
          phone: guardianData?.phone || '', relation: 'Guardian',
          occupation: guardianData?.occupation || '',
        });
      }
    } catch { alertCompat('Error', 'Failed to load student details'); }
  }, []);

  // Always reload an existing form when it becomes active again. This matters
  // after an admin bulk update because the navigation stack may reuse the
  // previously mounted Edit Student screen.
  useFocusEffect(
    useCallback(() => {
      if (id) loadStudentData(String(id));
    }, [id, loadStudentData]),
  );

  const validate = (): FieldErrors => {
    const errors: FieldErrors = {};
    if (!formData.first_name?.trim()) errors.first_name = 'First name is required';
    if (!formData.admission_no?.trim()) errors.admission_no = 'Admission number is required';
    if (!formData.class_id) errors.class_id = 'Select a class';
    if (!formData.section_id) errors.section_id = 'Select a section';
    if (!isEditMode && !formData.password) errors.password = 'Set an initial password';
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

  const handleSave = async () => {
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      const first = Object.values(errors)[0];
      alertCompat('Check the form', first || 'Please fill all mandatory fields marked with *.');
      return;
    }

    setLoading(true);
    try {
      const aadhaarDigits = String(formData.aadhaar_number || '').replace(/\D/g, '');
      const parents: NonNullable<CreateStudentRequest['parents']> = [];
      if (father.first_name?.trim()) parents.push({ ...father, relation: 'Father' as const, is_primary: true });
      if (mother.first_name?.trim()) parents.push({ ...mother, relation: 'Mother' as const });
      if (guardian.first_name?.trim()) parents.push({ ...guardian, relation: 'Guardian' as const, is_guardian: true });

      const previousSchool = typeof formData.previous_school === 'boolean' ? formData.previous_school : null;
      const payload = {
        ...formData,
        aadhaar_number: aadhaarDigits || null,
        tc_number: previousSchool === true ? (formData.tc_number?.trim() || null) : null,
        previous_school: previousSchool,
        parents,
      };
      if (isEditMode) {
        const updatePayload = { ...payload };
        if (!updatePayload.password) {
          delete updatePayload.password;
        }
        const result = await StudentService.update(id as string, updatePayload as any);
        const warnings: string[] = [];
        if ((result as any)?.authError) {
          warnings.push(`Login credentials failed to update: ${(result as any).authError}`);
        }
        try {
          if (typeof photoSelection === 'string') {
            await StudentService.uploadPhoto(id as string, photoSelection);
          } else if (photoSelection === null && currentPhotoUrl) {
            await StudentService.removePhoto(id as string);
          }
        } catch (error: any) {
          warnings.push(`Profile picture failed: ${error?.message || 'The selected image could not be saved.'}`);
        }
        alertCompat(
          warnings.length ? 'Student Updated with Warnings' : 'Updated!',
          warnings.length
            ? `Student details were saved.\n\n${warnings.join('\n')}`
            : (result as any)?.message || 'Student record updated successfully.',
          [{ text: 'OK', onPress: () => router.back() }],
        );
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
    } catch (error: unknown) {
      const message = error instanceof APIError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'An unexpected error occurred.';
      alertCompat('Save Failed', message);
    } finally { setLoading(false); }
  };

  const update = (key: keyof CreateStudentRequest, val: any) => {
    clearError(String(key));
    setFormData(prev => ({ ...prev, [key]: val }));
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
    <TourTarget id="screen.accounts-add-student.overview" style={{ flex: 1 }}><FormCanvas isDark={isDark}>
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={theme.colors.background} />
      {!shellActive && <AdminHeader title={isEditMode ? 'Edit Student' : 'Add Student'} showBackButton />}

      <TourTarget id="screen.accounts-add-student.workspace" style={{ flex: 1 }}><KeyboardAwareScreen
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
              <InputField label="First Name" placeholder="John" value={formData.first_name}
                onChangeText={(t: string) => update('first_name', t)} icon="person-outline"
                required accentColor={SECTION_COLORS.personal.accent} fieldKey="ims-stu-given-name"
                error={fieldErrors.first_name} />
            </View>
            <View style={styles.halfInput}>
              <InputField label="Last Name" placeholder="Last Name (optional)" value={formData.last_name}
                onChangeText={(t: string) => update('last_name', t)} icon="person-outline"
                accentColor={SECTION_COLORS.personal.accent} fieldKey="ims-stu-family-name" />
            </View>
          </View>
          <InputField label="Middle Name" placeholder="Optional" value={formData.middle_name}
            onChangeText={(t: string) => update('middle_name', t)} icon="person-outline"
            accentColor={SECTION_COLORS.personal.accent} fieldKey="ims-stu-middle-name" />
          <GenderBoyGirlSelector
            value={formData.gender_id}
            onSelect={(v) => update('gender_id', v)}
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
          {fieldErrors.dob ? <Text style={{ color: '#EF4444', fontSize: 11.5, fontWeight: '600', marginBottom: 10 }}>{fieldErrors.dob}</Text> : null}
          <AadhaarNumberField
            value={formData.aadhaar_number || ''}
            onChange={(digits) => update('aadhaar_number', digits)}
            accentColor={SECTION_COLORS.personal.accent}
            isDark={isDark}
          />
          {fieldErrors.aadhaar_number ? <Text style={{ color: '#EF4444', fontSize: 11.5, fontWeight: '600', marginBottom: 10 }}>{fieldErrors.aadhaar_number}</Text> : null}
          <PreviousSchoolYesNoSelector
            value={formData.previous_school}
            onSelect={(v) => setFormData((prev) => ({
              ...prev,
              previous_school: v,
              tc_number: v ? prev.tc_number : '',
            }))}
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
          <InputField label="Village" placeholder="Village (optional)" value={formData.village || ''}
            onChangeText={(t: string) => update('village', t)} icon="location-outline"
            accentColor={SECTION_COLORS.personal.accent} />
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
          <InputField label="APAR Number" placeholder="Enter APAR number (optional)" value={formData.apar_number || ''}
            onChangeText={(t: string) => update('apar_number', t)} icon="document-text-outline"
            accentColor={SECTION_COLORS.academic.accent} fieldKey="ims-stu-apar-code" />
          <InputField label="PEN Number" placeholder="PEN2025001 (optional)" value={formData.pen_number || ''}
            onChangeText={(t: string) => update('pen_number', t)} icon="id-card-outline"
            autoCapitalize="characters" accentColor={SECTION_COLORS.academic.accent} fieldKey="ims-stu-pen-code"
            error={fieldErrors.pen_number} />
          <InputField label="Roll Number" placeholder="Auto-generated"
            value={(formData as any).roll_number ? String((formData as any).roll_number) : ''}
            editable={false} icon="list-outline" accentColor={SECTION_COLORS.academic.accent} fieldKey="ims-stu-roll-num"
            hint="Assigned automatically after enrollment" />
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
              <SelectField label="Class" value={formData.class_id} options={classes}
                onSelect={(v: string) => update('class_id', v)} placeholder="Class"
                icon="business-outline" required accentColor={SECTION_COLORS.academic.accent}
                error={fieldErrors.class_id} />
            </View>
            <View style={styles.halfInput}>
              <SelectField label="Section" value={formData.section_id} options={sections}
                onSelect={(v: string) => update('section_id', v)} placeholder="Section"
                icon="grid-outline" required accentColor={SECTION_COLORS.academic.accent}
                error={fieldErrors.section_id} />
            </View>
          </View>
          <SelectField label={isTerminalStatus ? 'Exit Academic Year' : 'Academic Year'} value={formData.academic_year_id}
            options={academicYears.map((y: AcademicYear) => ({ id: y.id, name: y.code }))}
            onSelect={(v: string) => update('academic_year_id', v)} placeholder="Select Year"
            icon="time-outline" required accentColor={SECTION_COLORS.academic.accent} />
          <SelectField label="Student Status" value={formData.status_id} options={availableStudentStatuses}
            onSelect={(v: number) => update('status_id', v)} icon="shield-checkmark-outline"
            required accentColor={SECTION_COLORS.academic.accent} />
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
                <InputField label="First Name" placeholder="Father's name" value={father.first_name}
                  onChangeText={(t: string) => { clearError('parent'); setFather(p => ({ ...p, first_name: t })); }}
                  icon="person-outline" accentColor={SECTION_COLORS.parents.accent} fieldKey="ims-stu-father-given" />
              </View>
              <View style={styles.halfInput}>
                <InputField label="Last Name" placeholder="Surname" value={father.last_name}
                  onChangeText={(t: string) => setFather(p => ({ ...p, last_name: t }))}
                  icon="person-outline" accentColor={SECTION_COLORS.parents.accent} fieldKey="ims-stu-father-family" />
              </View>
            </View>
            <View style={styles.row}>
              <View style={styles.halfInput}>
                <InputField label="Phone" placeholder="Mobile" value={father.phone}
                  onChangeText={(t: string) => setFather(p => ({ ...p, phone: t }))}
                  keyboardType="phone-pad" icon="call-outline" accentColor={SECTION_COLORS.parents.accent}
                  fieldKey="ims-stu-father-mobile" autofillMode="tel" />
              </View>
              <View style={styles.halfInput}>
                <InputField label="Occupation" placeholder="Job title" value={father.occupation}
                  onChangeText={(t: string) => setFather(p => ({ ...p, occupation: t }))}
                  icon="briefcase-outline" accentColor={SECTION_COLORS.parents.accent} fieldKey="ims-stu-father-job" />
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
                <InputField label="First Name" placeholder="Mother's name" value={mother.first_name}
                  onChangeText={(t: string) => { clearError('parent'); setMother(p => ({ ...p, first_name: t })); }}
                  icon="person-outline" accentColor={SECTION_COLORS.parents.accent} fieldKey="ims-stu-mother-given" />
              </View>
              <View style={styles.halfInput}>
                <InputField label="Last Name" placeholder="Surname" value={mother.last_name}
                  onChangeText={(t: string) => setMother(p => ({ ...p, last_name: t }))}
                  icon="person-outline" accentColor={SECTION_COLORS.parents.accent} fieldKey="ims-stu-mother-family" />
              </View>
            </View>
            <View style={styles.row}>
              <View style={styles.halfInput}>
                <InputField label="Phone" placeholder="Mobile" value={mother.phone}
                  onChangeText={(t: string) => setMother(p => ({ ...p, phone: t }))}
                  keyboardType="phone-pad" icon="call-outline" accentColor={SECTION_COLORS.parents.accent}
                  fieldKey="ims-stu-mother-mobile" autofillMode="tel" />
              </View>
              <View style={styles.halfInput}>
                <InputField label="Occupation" placeholder="Job title" value={mother.occupation}
                  onChangeText={(t: string) => setMother(p => ({ ...p, occupation: t }))}
                  icon="briefcase-outline" accentColor={SECTION_COLORS.parents.accent} fieldKey="ims-stu-mother-job" />
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
                <InputField label="First Name" placeholder="Guardian's name" value={guardian.first_name}
                  onChangeText={(t: string) => { clearError('parent'); setGuardian(p => ({ ...p, first_name: t })); }}
                  icon="person-outline" accentColor={SECTION_COLORS.parents.accent} fieldKey="ims-stu-guardian-given" />
              </View>
              <View style={styles.halfInput}>
                <InputField label="Last Name" placeholder="Surname" value={guardian.last_name}
                  onChangeText={(t: string) => setGuardian(p => ({ ...p, last_name: t }))}
                  icon="person-outline" accentColor={SECTION_COLORS.parents.accent} fieldKey="ims-stu-guardian-family" />
              </View>
            </View>
            <View style={styles.row}>
              <View style={styles.halfInput}>
                <InputField label="Phone" placeholder="Mobile" value={guardian.phone}
                  onChangeText={(t: string) => setGuardian(p => ({ ...p, phone: t }))}
                  keyboardType="phone-pad" icon="call-outline" accentColor={SECTION_COLORS.parents.accent}
                  fieldKey="ims-stu-guardian-mobile" autofillMode="tel" />
              </View>
              <View style={styles.halfInput}>
                <InputField label="Occupation" placeholder="Job title" value={guardian.occupation}
                  onChangeText={(t: string) => setGuardian(p => ({ ...p, occupation: t }))}
                  icon="briefcase-outline" accentColor={SECTION_COLORS.parents.accent} fieldKey="ims-stu-guardian-job" />
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
          <SelectField label="Category" value={formData.category_id} options={STUDENT_CATEGORIES}
            onSelect={(v: number) => update('category_id', v)} icon="list-outline"
            accentColor={SECTION_COLORS.additional.accent} />
          <SelectField label="Religion" value={formData.religion_id} options={RELIGIONS}
            onSelect={(v: number) => update('religion_id', v)} icon="heart-outline"
            accentColor={SECTION_COLORS.additional.accent} />
          <SelectField label="Blood Group" value={formData.blood_group_id} options={BLOOD_GROUPS}
            onSelect={(v: number) => update('blood_group_id', v)} icon="water-outline"
            accentColor={SECTION_COLORS.additional.accent} />
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
          <InputField label="Email Address" placeholder="student@school.edu" value={formData.email}
            onChangeText={(t: string) => update('email', t)} keyboardType="email-address"
            icon="mail-outline" accentColor={SECTION_COLORS.credentials.accent}
            fieldKey="ims-stu-contact-addr" autoCapitalize="none" error={fieldErrors.email} />
          <InputField label="Phone Number" placeholder="+91 9876543210" value={formData.phone}
            onChangeText={(t: string) => update('phone', t)} keyboardType="phone-pad"
            icon="call-outline" accentColor={SECTION_COLORS.credentials.accent}
            fieldKey="ims-stu-mobile-line" autofillMode="tel" error={fieldErrors.phone} />
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
    </FormCanvas></TourTarget>
  );
}
