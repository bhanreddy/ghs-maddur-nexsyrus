import AppTextInput from '@/src/components/AppTextInput';
import React, { useState } from 'react';

import { Ionicons } from '@expo/vector-icons';
import AppDatePicker from '@/src/components/AppDatePicker';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Platform, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AdminHeader from '../../../src/components/AdminHeader';
import LogoLoader from '../../../src/components/LogoLoader';
import { ADMIN_THEME } from '../../../src/constants/adminTheme';
import { useTheme } from '../../../src/hooks/useTheme';
import { StaffService } from '../../../src/services/staffService';
import { Theme } from '../../../src/theme/themes';
import { alertCompat } from '../../../src/utils/crossPlatformAlert';
interface FormData {
  first_name: string;
  middle_name: string;
  last_name: string;
  email: string;
  phone: string;
  password: string;
  dob: string;
  gender_id: number;
  salary?: string;
}
export default function AddAccountsStaff() {
  const {
    theme,
    isDark
  } = useTheme();
  const styles = React.useMemo(() => getStyles(theme), [theme]);
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<FormData & {
    staff_code: string;
  }>({
    first_name: '',
    middle_name: '',
    last_name: '',
    email: '',
    phone: '',
    password: '',
    dob: '',
    gender_id: 1,
    // Default to Male
    staff_code: '',
    salary: ''
  });
  const updateField = (field: keyof typeof formData, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value
    }));
  };
  const validateForm = (): boolean => {
    if (!formData.first_name.trim()) {
      alertCompat('Validation Error', 'First name is required');
      return false;
    }
    if (!formData.last_name.trim()) {
      alertCompat('Validation Error', 'Last name is required');
      return false;
    }
    if (!formData.phone.trim()) {
      alertCompat('Validation Error', 'Mobile number is required');
      return false;
    }
    if (formData.phone.trim().length < 10) {
      alertCompat('Validation Error', 'Please enter a valid mobile number');
      return false;
    }
    if (!formData.staff_code.trim()) {
      alertCompat('Validation Error', 'Staff Code is required');
      return false;
    }
    if (!formData.email.trim()) {
      alertCompat('Validation Error', 'Email is required');
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      alertCompat('Validation Error', 'Please enter a valid email address');
      return false;
    }
    if (!formData.password || formData.password.length < 6) {
      alertCompat('Validation Error', 'Password must be at least 6 characters');
      return false;
    }
    return true;
  };
  const handleSubmit = async () => {
    if (!validateForm()) return;
    setLoading(true);
    try {
      // Use StaffService to create Staff + User + Role
      await StaffService.create({
        first_name: formData.first_name.trim(),
        middle_name: formData.middle_name.trim() || undefined,
        last_name: formData.last_name.trim(),
        email: formData.email.trim().toLowerCase(),
        phone: formData.phone.trim(),
        password: formData.password,
        dob: formData.dob || undefined,
        gender_id: formData.gender_id,
        staff_code: formData.staff_code.trim(),
        joining_date: new Date().toISOString().split('T')[0],
        // Default to today
        status_id: 1,
        // Active
        role_code: 'accountant',
        salary: formData.salary ? parseFloat(formData.salary) : undefined
      });
      alertCompat('Success', `Accounts staff ${formData.first_name} ${formData.last_name} has been created successfully!`, [{
        text: 'OK',
        onPress: () => router.back()
      }]);
    } catch (error: any) {

      alertCompat('Error', error.message || 'Failed to create accounts staff user');
    } finally {
      setLoading(false);
    }
  };
  return <View style={styles.container}>
    <StatusBar barStyle="light-content" backgroundColor={ADMIN_THEME.colors.primary} />
    <AdminHeader title="Add Accounts Staff" showBackButton />
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {/* Header Card */}
      <LinearGradient colors={['#FBBF24', '#F59E0B']} start={{
        x: 0,
        y: 0
      }} end={{
        x: 1,
        y: 1
      }} style={styles.headerCard}>
        <Ionicons name="person-add" size={40} color="#fff" />
        <Text style={styles.headerTitle}>Create New Accounts Staff</Text>
        <Text style={styles.headerSubtitle}>
          Add accounts department staff who can manage fees and financial operations
        </Text>
      </LinearGradient>
      {/* Form */}
      <View style={styles.form}>
        {/* Personal Information */}
        <Text style={styles.sectionTitle}>Personal Information</Text>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>
            First Name <Text style={styles.required}>*</Text>
          </Text>
          <View style={styles.inputWrapper}>
            <Ionicons name="person-outline" size={20} color="#9CA3AF" style={styles.inputIcon} />
            <AppTextInput style={styles.input} placeholder="Enter first name" value={formData.first_name} onChangeText={(text) => updateField('first_name', text)} autoCapitalize="words" />
          </View>
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Middle Name</Text>
          <View style={styles.inputWrapper}>
            <Ionicons name="person-outline" size={20} color="#9CA3AF" style={styles.inputIcon} />
            <AppTextInput style={styles.input} placeholder="Enter middle name (optional)" value={formData.middle_name} onChangeText={(text) => updateField('middle_name', text)} autoCapitalize="words" />
          </View>
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>
            Last Name <Text style={styles.required}>*</Text>
          </Text>
          <View style={styles.inputWrapper}>
            <Ionicons name="person-outline" size={20} color="#9CA3AF" style={styles.inputIcon} />
            <AppTextInput style={styles.input} placeholder="Enter last name" value={formData.last_name} onChangeText={(text) => updateField('last_name', text)} autoCapitalize="words" />
          </View>
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>
            Staff Code <Text style={styles.required}>*</Text>
          </Text>
          <View style={styles.inputWrapper}>
            <Ionicons name="card-outline" size={20} color="#9CA3AF" style={styles.inputIcon} />
            <AppTextInput style={styles.input} placeholder="e.g. ACC001" value={formData.staff_code} onChangeText={(text) => updateField('staff_code', text)} autoCapitalize="characters" />
          </View>
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>
            Mobile Number <Text style={styles.required}>*</Text>
          </Text>
          <View style={styles.inputWrapper}>
            <Ionicons name="call-outline" size={20} color="#9CA3AF" style={styles.inputIcon} />
            <AppTextInput style={styles.input} placeholder="Enter mobile number" value={formData.phone} onChangeText={(text) => updateField('phone', text)} keyboardType="phone-pad" maxLength={15} />
          </View>
        </View>
        <AppDatePicker
          label="Date of Birth"
          value={formData.dob}
          onChange={(d) => updateField('dob', d)}
          maximumDate={new Date()}
          containerStyle={styles.inputGroup}
        />
        {/* Gender */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>
            Gender <Text style={styles.required}>*</Text>
          </Text>
          <View style={styles.genderRow}>
            <TouchableOpacity style={[styles.genderButton, formData.gender_id === 1 && styles.genderButtonActive]} onPress={() => updateField('gender_id', 1)}>
              <Ionicons name="male" size={20} color={formData.gender_id === 1 ? '#fff' : '#6B7280'} />
              <Text style={[styles.genderText, formData.gender_id === 1 && styles.genderTextActive]}>
                Male
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.genderButton, formData.gender_id === 2 && styles.genderButtonActive]} onPress={() => updateField('gender_id', 2)}>
              <Ionicons name="female" size={20} color={formData.gender_id === 2 ? '#fff' : '#6B7280'} />
              <Text style={[styles.genderText, formData.gender_id === 2 && styles.genderTextActive]}>
                Female
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.genderButton, formData.gender_id === 3 && styles.genderButtonActive]} onPress={() => updateField('gender_id', 3)}>
              <Ionicons name="transgender" size={20} color={formData.gender_id === 3 ? '#fff' : '#6B7280'} />
              <Text style={[styles.genderText, formData.gender_id === 3 && styles.genderTextActive]}>
                Other
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        {/* Salary */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Salary</Text>
          <View style={styles.inputWrapper}>
            <Ionicons name="cash-outline" size={20} color="#9CA3AF" style={styles.inputIcon} />
            <AppTextInput style={styles.input} placeholder="e.g. 50000" value={formData.salary} onChangeText={(text) => updateField('salary', text)} keyboardType="numeric" />
          </View>
        </View>
        {/* Login Credentials */}
        <Text style={[styles.sectionTitle, {
          marginTop: 24
        }]}>Login Credentials</Text>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>
            Email <Text style={styles.required}>*</Text>
          </Text>
          <View style={styles.inputWrapper}>
            <Ionicons name="mail-outline" size={20} color="#9CA3AF" style={styles.inputIcon} />
            <AppTextInput style={styles.input} placeholder="accountant@school.com" value={formData.email} onChangeText={(text) => updateField('email', text)} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
          </View>
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>
            Password <Text style={styles.required}>*</Text>
          </Text>
          <View style={styles.inputWrapper}>
            <Ionicons name="lock-closed-outline" size={20} color="#9CA3AF" style={styles.inputIcon} />
            <AppTextInput style={styles.input} placeholder="Minimum 6 characters" value={formData.password} onChangeText={(text) => updateField('password', text)} secureTextEntry autoCapitalize="none" />
          </View>
          <Text style={styles.hint}>Password must be at least 6 characters long</Text>
        </View>
        {/* Permissions Info */}
        <View style={styles.infoCard}>
          <Ionicons name="information-circle" size={24} color="#3B82F6" />
          <View style={styles.infoContent}>
            <Text style={styles.infoTitle}>Accounts Department Permissions</Text>
            <Text style={styles.infoText}>
              • View and manage student fees{'\n'}
              • Collect fee payments{'\n'}
              • View transactions and generate receipts{'\n'}
              • Access financial reports
            </Text>
          </View>
        </View>
        {/* Submit Button */}
        <TouchableOpacity style={[styles.submitButton, loading && styles.submitButtonDisabled]} onPress={handleSubmit} disabled={loading}>
          <LinearGradient colors={loading ? ['#9CA3AF', '#6B7280'] : ['#FBBF24', '#F59E0B']} start={{
            x: 0,
            y: 0
          }} end={{
            x: 1,
            y: 0
          }} style={styles.submitGradient}>
            {loading ? <LogoLoader color="#fff" /> : <>
              <Ionicons name="checkmark-circle" size={24} color="#fff" />
              <Text style={styles.submitText}>Create Accounts Staff</Text>
            </>}
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </ScrollView>
  </View>;
}
const getStyles = (theme: Theme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent'
  },
  content: {
    padding: 20,
    paddingBottom: 40
  },
  headerCard: {
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.colors.background,
    marginTop: 12
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 8,
    textAlign: 'center'
  },
  form: {
    backgroundColor: theme.colors.background,
    borderRadius: 20,
    padding: 20
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16
  },
  inputGroup: {
    marginBottom: 20
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8
  },
  required: {
    color: '#EF4444'
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 12
  },
  inputIcon: {
    marginRight: 8
  },
  input: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111827'
  },
  hint: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 4
  },
  genderRow: {
    flexDirection: 'row',
    gap: 12
  },
  genderButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.card,
    gap: 6
  },
  genderButtonActive: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6'
  },
  genderText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textSecondary
  },
  genderTextActive: {
    color: theme.colors.background
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    marginBottom: 24
  },
  infoContent: {
    flex: 1,
    marginLeft: 12
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E40AF',
    marginBottom: 4
  },
  infoText: {
    fontSize: 13,
    color: '#3B82F6',
    lineHeight: 20
  },
  submitButton: {
    borderRadius: 12,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: theme.colors.text,
    shadowOffset: {
      width: 0,
      height: 2
    },
    shadowOpacity: 0.1,
    shadowRadius: 8
  },
  submitButtonDisabled: {
    opacity: 0.6
  },
  submitGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8
  },
  submitText: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.background
  }
});