import { TourTarget } from '@/src/features/app-tour';
import React, { useState } from 'react';
import AppTextInput from '@/src/components/AppTextInput';

import { View, Text, StyleSheet, TouchableOpacity, StatusBar } from 'react-native';
import KeyboardAwareScreen from '@/components/keyboard/KeyboardAwareScreen';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AdminHeader from '../../src/components/AdminHeader';
import { useTranslation } from 'react-i18next';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTheme } from '../../src/hooks/useTheme';
import { useAccountsWebChrome } from '../../src/contexts/AccountsWebChromeContext';
import { Theme } from '../../src/theme/themes';
const InputField = ({
  label,
  placeholder,
  value,
  onChangeText,
  keyboardType = 'default',
  icon,
  secureTextEntry = false
}: any) => {
  const {
    theme,
    isDark
  } = useTheme();
  const styles = React.useMemo(() => getStyles(theme), [theme]);
  return <View style={styles.inputGroup}>
    <Text style={styles.label}>{label}</Text>
    <View style={styles.inputContainer}>
      <Ionicons name={icon} size={20} color="#9CA3AF" style={styles.inputIcon} />
      <AppTextInput style={styles.input} placeholder={placeholder} placeholderTextColor="#9CA3AF" value={value} onChangeText={onChangeText} keyboardType={keyboardType as any} secureTextEntry={secureTextEntry} />
    </View>
  </View>;
};
export default function AddAdminScreen() {
  const {
    theme,
    isDark
  } = useTheme();
  const styles = React.useMemo(() => getStyles(theme), [theme]);
  const { shellActive } = useAccountsWebChrome();
  const router = useRouter();
  const {
    t
  } = useTranslation();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    role: '',
    password: ''
  });
  const handleSave = () => {
    // Implement save logic

    router.back();
  };
  return <TourTarget id="screen.accounts-add-admin.overview" native><View style={styles.container}>
    <StatusBar barStyle="dark-content" backgroundColor="#fff" />
    {!shellActive && <AdminHeader title={t('accounts.add_admin', 'Add New Admin')} />}
    <TourTarget id="screen.accounts-add-admin.workspace" style={{ flex: 1 }}><KeyboardAwareScreen variant="scroll" contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} bottomOffset={24}>
        <Animated.View entering={FadeInDown.delay(100).duration(600)} style={styles.section}>
          <Text style={styles.sectionHeader}>{t('common.admin_details', 'Admin Details')}</Text>
          <InputField label={t('common.full_name', 'Full Name')} placeholder="e.g. Rajesh Singh" value={formData.name} onChangeText={(text: string) => setFormData({
            ...formData,
            name: text
          })} icon="person-outline" />
          <InputField label={t('common.email', 'Email Address')} placeholder="e.g. admin@school.com" value={formData.email} onChangeText={(text: string) => setFormData({
            ...formData,
            email: text
          })} keyboardType="email-address" icon="mail-outline" />
          <InputField label={t('common.phone', 'Phone Number')} placeholder="e.g. +91 98765 00000" value={formData.phone} onChangeText={(text: string) => setFormData({
            ...formData,
            phone: text
          })} keyboardType="phone-pad" icon="call-outline" />
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(200).duration(600)} style={styles.section}>
          <Text style={styles.sectionHeader}>{t('common.account_settings', 'Account Settings')}</Text>
          <InputField label={t('common.role', 'Role / Privileges')} placeholder="e.g. Accounts Manager" value={formData.role} onChangeText={(text: string) => setFormData({
            ...formData,
            role: text
          })} icon="shield-checkmark-outline" />
          <InputField label={t('common.password', 'Initial Password')} placeholder="••••••••" value={formData.password} onChangeText={(text: string) => setFormData({
            ...formData,
            password: text
          })} secureTextEntry={true} icon="lock-closed-outline" />
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(300).duration(600)} style={{
          marginTop: 20,
          paddingBottom: 40
        }}>
          <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
            <Text style={styles.saveButtonText}>{t('common.create_admin', 'Create Admin Account')}</Text>
            <Ionicons name="arrow-forward" size={20} color="#fff" />
          </TouchableOpacity>
        </Animated.View>
    </KeyboardAwareScreen></TourTarget>
  </View></TourTarget>;
}
const getStyles = (theme: Theme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent'
  },
  scrollContent: {
    padding: 20
  },
  section: {
    backgroundColor: theme.colors.background,
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    shadowColor: theme.colors.text,
    shadowOffset: {
      width: 0,
      height: 2
    },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2
  },
  sectionHeader: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 20
  },
  inputGroup: {
    marginBottom: 16
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.card,
    borderRadius: 12,
    paddingHorizontal: 15,
    height: 50,
    borderWidth: 1,
    borderColor: 'transparent'
  },
  inputIcon: {
    marginRight: 10
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#1F2937'
  },
  saveButton: {
    backgroundColor: '#10B981',
    borderRadius: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    shadowColor: "#10B981",
    shadowOffset: {
      width: 0,
      height: 4
    },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6
  },
  saveButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.background
  }
});