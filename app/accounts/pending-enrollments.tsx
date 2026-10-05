import { TourTarget } from '@/src/features/app-tour';
import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Modal } from 'react-native';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import AdminHeader from '../../src/components/AdminHeader';
import { useTheme } from '../../src/hooks/useTheme';
import { useAccountsWebChrome } from '../../src/contexts/AccountsWebChromeContext';
import { StudentService } from '../../src/services/studentService';
import { ClassService } from '../../src/services/classService';
import DropDownPicker from 'react-native-dropdown-picker';
import LogoLoader from '../../src/components/LogoLoader';

export default function PendingEnrollmentsScreen() {
  const { t } = useTranslation();
  const { theme, isDark } = useTheme();
  const { shellActive } = useAccountsWebChrome();
  const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark]);
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<any[]>([]);
  const [enrollmentModalVisible, setEnrollmentModalVisible] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);

  // Dropdown States
  const [classes, setClasses] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);

  // Selection States
  const [openClass, setOpenClass] = useState(false);
  const [classId, setClassId] = useState(null);

  const [openSection, setOpenSection] = useState(false);
  const [sectionId, setSectionId] = useState(null);

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadUnenrolledStudents();
    loadMasterData();
  }, []);

  const loadUnenrolledStudents = async () => {
    setLoading(true);
    try {
      const data = await StudentService.getUnenrolledStudents();
      setStudents(data);
    } catch (error) {

      alertCompat('Error', 'Failed to load students list.');
    } finally {
      setLoading(false);
    }
  };

  const loadMasterData = async () => {
    try {
      const classData = await ClassService.getClasses();
      setClasses(classData.map((c: any) => ({ label: c.name, value: c.id })));
    } catch (error) {

    }
  };

  // Load sections when class changes
  useEffect(() => {
    if (classId) {
      loadSections(classId);
    } else {
      setSections([]);
      setSectionId(null);
    }
  }, [classId]);

  const loadSections = async (clsId: number) => {
    try {
      // Fetch sections for the selected class (Assuming ReferenceDataService or ClassService has this)
      // If classService doesn't have getSections, we might need to check where it is.
      // checking classService...
      const sectionData = await ClassService.getSections(clsId);
      setSections(sectionData.map((s: any) => ({ label: s.name, value: s.id })));
    } catch (error) {

      // Fallback or empty
      setSections([]);
    }
  };

  const handleEnrollPress = (student: any) => {
    setSelectedStudent(student);
    // Reset selections
    setClassId(null);
    setSectionId(null);
    setEnrollmentModalVisible(true);
  };

  const submitEnrollment = async () => {
    if (!classId || !sectionId) {
      alertCompat('Required', 'Please select both Class and Section.');
      return;
    }

    setSubmitting(true);
    try {
      await StudentService.enrollStudent(selectedStudent.id, {
        class_id: classId,
        section_id: sectionId
      });

      alertCompat('Success', 'Student enrolled successfully!');
      setEnrollmentModalVisible(false);
      loadUnenrolledStudents(); // Refresh list
    } catch (error: any) {
      alertCompat('Error', error.response?.data?.error || 'Failed to enroll student.');
    } finally {
      setSubmitting(false);
    }
  };

  const renderItem = ({ item }: { item: any; }) =>
    <View style={styles.card}>
      <View style={styles.cardContent}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{item.first_name[0]}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{item.display_name}</Text>
          <Text style={styles.subText}>Adm No: {item.admission_no || 'N/A'}</Text>
          <Text style={styles.subText}>Joined: {new Date(item.admission_date).toLocaleDateString()}</Text>
        </View>
        <Pressable
          style={({ pressed }) => [styles.enrollBtn, { opacity: pressed ? 0.8 : 1 }]}
          onPress={() => handleEnrollPress(item)}>

          <Text style={styles.enrollBtnText}>Enroll Now</Text>
        </Pressable>
      </View>
    </View>;

  return (
    <TourTarget id="screen.accounts-pending-enrollments.overview" native><TourTarget id="screen.accounts-pending-enrollments.workspace" native><View style={styles.container}>
      {!shellActive && <AdminHeader title="Pending Enrollments" showBackButton />}
      {loading ?
        <View style={styles.center}>
          <LogoLoader size={60} color={theme.colors.primary} />
        </View> :

        <FlatList
          data={students}
          renderItem={renderItem}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="checkmark-circle-outline" size={64} color={theme.colors.success} />
              <Text style={styles.emptyText}>All active students are enrolled!</Text>
            </View>
          } />

      }
      {/* ENROLLMENT MODAL */}
      <Modal
        visible={enrollmentModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setEnrollmentModalVisible(false)}>

        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Enroll Student</Text>
              <Pressable onPress={() => setEnrollmentModalVisible(false)}>
                <Ionicons name="close" size={24} color={theme.colors.text} />
              </Pressable>
            </View>
            <Text style={styles.modalSubtitle}>
              Enrolling: <Text style={{ fontWeight: 'bold' }}>{selectedStudent?.display_name}</Text>
            </Text>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Select Class</Text>
              <DropDownPicker
                open={openClass}
                value={classId}
                items={classes}
                setOpen={setOpenClass}
                setValue={setClassId}
                placeholder="Select Class"
                style={styles.dropdown}
                dropDownContainerStyle={styles.dropdownList}
                zIndex={3000}
                listMode="SCROLLVIEW" />

            </View>
            <View style={[styles.inputGroup, { zIndex: 2000 }]}>
              <Text style={styles.label}>Select Section</Text>
              <DropDownPicker
                open={openSection}
                value={sectionId}
                items={sections}
                setOpen={setOpenSection}
                setValue={setSectionId}
                placeholder="Select Section"
                style={styles.dropdown}
                dropDownContainerStyle={styles.dropdownList}
                zIndex={2000}
                listMode="SCROLLVIEW"
                disabled={!classId} />

            </View>
            <Pressable
              style={[styles.submitBtn, submitting && { opacity: 0.7 }]}
              onPress={submitEnrollment}
              disabled={submitting}>

              {submitting ?
                <LogoLoader color="#FFF" /> :

                <Text style={styles.submitBtnText}>Confirm Enrollment</Text>
              }
            </Pressable>
          </View>
        </View>
      </Modal>
    </View></TourTarget></TourTarget>);

}

const createStyles = (theme: any, isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent'
  },
  listContent: {
    padding: 16
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: theme.colors.border
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: isDark ? '#374151' : '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12
  },
  avatarText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text
  },
  name: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 4
  },
  subText: {
    fontSize: 13,
    color: theme.colors.textSecondary
  },
  enrollBtn: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8
  },
  enrollBtnText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 13
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 60
  },
  emptyText: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    marginTop: 16
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end'
  },
  modalContent: {
    backgroundColor: theme.colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    minHeight: 450
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.text
  },
  modalSubtitle: {
    fontSize: 15,
    color: theme.colors.textSecondary,
    marginBottom: 24
  },
  inputGroup: {
    marginBottom: 20
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 8
  },
  dropdown: {
    backgroundColor: theme.colors.background,
    borderColor: theme.colors.border
  },
  dropdownList: {
    backgroundColor: theme.colors.background,
    borderColor: theme.colors.border
  },
  submitBtn: {
    backgroundColor: theme.colors.primary,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20
  },
  submitBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold'
  }
});