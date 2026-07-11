import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, StatusBar } from 'react-native';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import { useRouter } from 'expo-router';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import StaffHeader from '../../src/components/StaffHeader';
import ViewAsBanner from '../../src/components/ViewAsBanner';
import { useEffectiveStaffId } from '../../src/hooks/useEffectiveStaffId';
import { api } from '../../src/services/apiClient';
import { TeacherService, TeacherClassAssignment } from '../../src/services/commonServices';
import { useTheme } from '../../src/hooks/useTheme';
import { Theme } from '../../src/theme/themes';
import ClayInput from '../../src/components/ClayInput';
import PremiumButton from '../../src/components/PremiumButton';

interface CreateCourseResponse {
  course: {
    id: string;
  };
}

export default function StaffLMSUpload() {
  const { theme, isDark } = useTheme();
  const styles = React.useMemo(() => getStyles(theme, isDark), [theme, isDark]);
  const router = useRouter();
  const { isViewingAsAdmin, viewAsName } = useEffectiveStaffId();
  const [topic, setTopic] = useState(''); // Serves as Course Title (Subject/Topic)
  const [subTopic, setSubTopic] = useState(''); // Serves as Material Title

  // Dynamic Class/Subject Selection
  const [assignments, setAssignments] = useState<TeacherClassAssignment[]>([]);
  const [selectedAssignment, setSelectedAssignment] = useState<TeacherClassAssignment | null>(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchMetadata();
  }, []);

  const fetchMetadata = async () => {
    try {
      // Fetch teacher's assigned classes
      const data = await TeacherService.getMyClasses();
      setAssignments(data);
      if (data.length > 0) {
        // Auto-select first assignment
        setSelectedAssignment(data[0]);
        // Auto-populate topic with subject name as a default
        setTopic(data[0].subject_name);
      }
    } catch (error) {
      alertCompat('Error', 'Could not load your assigned classes');
    }
  };

  // Update topic when assignment changes
  useEffect(() => {
    if (selectedAssignment) {
      setTopic(selectedAssignment.subject_name);
    }
  }, [selectedAssignment]);

  const handleUpload = async () => {
    if (isViewingAsAdmin) {
      alertCompat('Read-only', 'Content can\'t be uploaded while viewing another staff member\'s portal.');
      return;
    }
    if (!selectedAssignment || !topic || !subTopic || !videoUrl) {
      alertCompat('Error', 'Please fill in all required fields');
      return;
    }
    try {
      setLoading(true);

      // 1. Create or Find Course (Topic)
      // We use the selected assignment to get class_id and subject_id

      const newCourse = await api.post<CreateCourseResponse>('/lms/courses', {
        title: topic,
        description: description || `Course for ${selectedAssignment.class_name}-${selectedAssignment.section_name}`,
        class_id: selectedAssignment.class_id,
        subject_id: selectedAssignment.subject_id,
        is_published: true
      });
      if (!newCourse || !newCourse.course) {
        throw new Error('Failed to create course context');
      }

      // 2. Create Material
      await api.post(`/lms/courses/${newCourse.course.id}/materials`, {
        title: subTopic,
        description: description,
        material_type: 'video',
        // defaulting to video for now
        content_url: videoUrl,
        sort_order: 1,
        is_published: true
      });
      alertCompat('Success', 'Content uploaded successfully!', [{
        text: 'OK',
        onPress: () => router.back()
      }]);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      alertCompat('Error', 'Failed to upload content. ' + msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={theme.colors.background} />
      <StaffHeader title="Upload LMS Content" showBackButton={true} />
      {isViewingAsAdmin && <ViewAsBanner name={viewAsName} limited />}

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeInDown.delay(100).duration(600).springify()} style={styles.formCard}>
            <View style={styles.cardHeader}>
              <View style={styles.iconContainer}>
                <MaterialIcons name="library-add" size={24} color="#3B82F6" />
              </View>
              <Text style={styles.cardTitle}>Add New Content</Text>
            </View>

            {/* Class Selection */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: isDark ? '#64748B' : '#94A3B8' }]}>
                SELECT CLASS & SUBJECT <Text style={styles.required}>*</Text>
              </Text>
              {assignments.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalScroll}>
                  {assignments.map((assign) => {
                    const isActive = selectedAssignment?.assignment_id === assign.assignment_id;
                    return (
                      <TouchableOpacity 
                        key={assign.assignment_id} 
                        style={[styles.chip, isActive && styles.chipActive]} 
                        onPress={() => setSelectedAssignment(assign)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                          {assign.class_name}-{assign.section_name} : {assign.subject_name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              ) : (
                <Text style={styles.errorText}>No classes assigned to you.</Text>
              )}
            </View>

            <ClayInput 
              label="Course Title (Subject) *" 
              placeholder="e.g. Mathematics" 
              value={topic} 
              onChangeText={setTopic} 
              isDark={isDark} 
              icon="subject"
            />

            <ClayInput 
              label="Material Title (Topic) *" 
              placeholder="e.g. Algebra - Quadratic Equations" 
              value={subTopic} 
              onChangeText={setSubTopic} 
              isDark={isDark} 
              icon="title"
            />

            <ClayInput 
              label="YouTube Video Link *" 
              placeholder="https://youtube.com/..." 
              value={videoUrl} 
              onChangeText={setVideoUrl} 
              isDark={isDark} 
              icon="smart-display"
            />

            <ClayInput 
              label="Description" 
              placeholder="Enter a brief description of the content..." 
              value={description} 
              onChangeText={setDescription} 
              isDark={isDark} 
              multiline
            />

            <View style={styles.buttonContainer}>
              <PremiumButton
                title="Upload Content"
                onPress={handleUpload}
                loading={loading}
                colors={['#3B82F6', '#2563EB']}
                icon={<MaterialIcons name="cloud-upload" size={22} color="#FFF" style={{ marginLeft: 8 }} />}
              />
            </View>

          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const getStyles = (theme: Theme, isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  formCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 24,
    padding: 24,
    shadowColor: isDark ? '#000' : theme.colors.text,
    shadowOffset: {
      width: 0,
      height: 8
    },
    shadowOpacity: isDark ? 0.3 : 0.06,
    shadowRadius: 16,
    elevation: 4,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    gap: 12,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: theme.colors.text,
    letterSpacing: -0.5,
  },
  inputGroup: {
    marginBottom: 20
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
    paddingLeft: 4,
  },
  required: {
    color: '#EF4444'
  },
  horizontalScroll: {
    flexDirection: 'row',
    paddingVertical: 4,
  },
  chip: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: isDark ? '#334155' : '#E2E8F0',
    marginRight: 10,
    backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: isDark ? 0.2 : 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  chipActive: {
    borderColor: '#3B82F6',
    backgroundColor: isDark ? '#1E3A8A' : '#EFF6FF',
    shadowColor: '#3B82F6',
    shadowOpacity: isDark ? 0.3 : 0.1,
  },
  chipText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    fontWeight: '600'
  },
  chipTextActive: {
    color: isDark ? '#60A5FA' : '#2563EB',
    fontWeight: '700'
  },
  errorText: {
    color: '#EF4444',
    fontSize: 14,
    marginTop: 8,
  },
  buttonContainer: {
    marginTop: 12,
  }
});