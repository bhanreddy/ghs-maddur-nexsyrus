import React, { useState, useEffect, useMemo } from 'react';
import AppTextInput from '@/src/components/AppTextInput';
import AppDatePicker from '@/src/components/AppDatePicker';

import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, StatusBar, KeyboardAvoidingView,
  Platform, Pressable, Dimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AdminHeader from '../../src/components/AdminHeader';
import { useTranslation } from 'react-i18next';
import Animated, {
  FadeInDown, FadeIn,
  useAnimatedStyle, useSharedValue,
  withTiming, withSpring,
  interpolate, Extrapolation,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../src/hooks/useAuth';
import { usePermissions } from '../../src/hooks/usePermissions';
import { StaffService } from '@/src/services/staffService';
import { ReferenceDataService } from '../../src/services/referenceDataService';
import { useTheme } from '../../src/hooks/useTheme';
import { useAccountsWebChrome } from '../../src/contexts/AccountsWebChromeContext';
import { ADMIN_THEME } from '../../src/constants/adminTheme';
import { Theme } from '../../src/theme/themes';
import LogoLoader from '../../src/components/LogoLoader';
import ClayPasswordToggle from '../../src/components/ClayPasswordToggle';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import {
  STAFF_ADD_LOGIN_ROLE_OPTIONS,
  dedupeDesignationsByName,
  resolveRoleFromDesignation,
  type StaffAddLoginRoleCode,
} from '../../src/utils/roleHelpers';

const { width: SW } = Dimensions.get('window');

// ─── Form palette (brand-aligned clay) ────────────────────────────────────────
const FORM = {
  brand: ADMIN_THEME.colors.primary,
  violet: '#7C6FFF',
  coral: ADMIN_THEME.colors.secondary,
  sage: '#5BAA9A',
  plum: '#9B7EDE',
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

// ─── Design tokens ────────────────────────────────────────────────────────────
const SECTION_COLORS = {
  personal: { accent: '#665990', bg_light: '#EDE9F6', bg_dark: '#2A2438' },
  employment: { accent: '#5BAA9A', bg_light: '#E8F5F1', bg_dark: '#1A2E28' },
  contact: { accent: '#F57964', bg_light: '#FFF0ED', bg_dark: '#3D2220' },
};

// Replaced static DESIGNATION_CONFIG with a dynamic stylish generator
const getDesigStyle = (name: string, id: string) => {
  const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) + parseInt(id);
  const colors = [
    { color: '#665990', grad: ['#4A3F6B', '#665990'] as [string, string], icon: 'star-outline' },
    { color: '#7C6FFF', grad: ['#52467A', '#7C6FFF'] as [string, string], icon: 'book-outline' },
    { color: '#5BAA9A', grad: ['#3D6B60', '#5BAA9A'] as [string, string], icon: 'shield-outline' },
    { color: '#F57964', grad: ['#C45E4C', '#F57964'] as [string, string], icon: 'calculator-outline' },
    { color: '#9B7EDE', grad: ['#6B4FA8', '#9B7EDE'] as [string, string], icon: 'library-outline' },
    { color: '#8B7FD4', grad: ['#5A4F8F', '#8B7FD4'] as [string, string], icon: 'briefcase-outline' },
    { color: '#E8927C', grad: ['#B86555', '#E8927C'] as [string, string], icon: 'car-outline' },
  ];
  const defaults: Record<string, any> = {
    'Principal': colors[0],
    'Vice Principal': colors[1],
    'Teacher': colors[1],
    'Senior Teacher': colors[5],
    'Lab Assistant': colors[2],
    'Librarian': colors[4],
    'Clerk': colors[3],
    'Accountant': colors[3],
    'Admin': colors[2],
    'Driver': colors[6]
  };
  return defaults[name] || colors[hash % colors.length];
};

const GENDER_CONFIG: Record<string, { label: string; icon: string; grad: [string, string] }> = {
  '1': { label: 'Male', icon: 'male-outline', grad: ['#665990', '#7C6FFF'] },
  '2': { label: 'Female', icon: 'female-outline', grad: ['#E8927C', '#F57964'] },
  '3': { label: 'Other', icon: 'male-female-outline', grad: ['#5BAA9A', '#7C6FFF'] },
};

// ─── Live Staff Avatar ────────────────────────────────────────────────────────
const LiveAvatar = ({ firstName, lastName, designationId, designationName, isDark }: any) => {
  const fNameStr = firstName || '';
  const lNameStr = lastName || '';
  const initials = [fNameStr[0], lNameStr[0]].filter(Boolean).join('').toUpperCase() || '?';
  const des = getDesigStyle(designationName || 'Staff', designationId?.toString() || '0');
  const gender = GENDER_CONFIG['1'];

  const grad = des.grad;

  return (
    <Animated.View entering={FadeIn.duration(400)} style={avatarSt.wrap}>
      <LinearGradient colors={grad} style={avatarSt.circle} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <LinearGradient
          colors={['rgba(255,255,255,0.32)', 'rgba(255,255,255,0)']}
          style={avatarSt.gloss}
          start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
        />
        <Text style={avatarSt.initials}>{initials}</Text>
      </LinearGradient>
      {/* Designation badge */}
      <View style={[avatarSt.badge, { backgroundColor: des.color }]}>
        <Ionicons name={des.icon as any} size={10} color="#fff" />
      </View>
    </Animated.View>
  );
};
const avatarSt = StyleSheet.create({
  wrap: { alignItems: 'center', marginBottom: 6 },
  circle: { width: 82, height: 82, borderRadius: 28, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  gloss: { position: 'absolute', top: 0, left: 0, right: 0, height: 42, borderRadius: 28 },
  initials: { fontSize: 30, fontWeight: '900', color: '#fff', letterSpacing: -1 },
  badge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 24, height: 24, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2.5, borderColor: '#fff',
  },
});

// ─── Animated InputField ──────────────────────────────────────────────────────
const InputField = ({
  label, placeholder, value, onChangeText, keyboardType = 'default',
  icon, secureTextEntry = false, required = false, accentColor = FORM.brand, isDark = false,
  fieldKey, autofillMode = 'off', ...rest
}: any) => {
  const focused = useSharedValue(0);
  const [showPassword, setShowPassword] = useState(false);
  const [webReadOnly, setWebReadOnly] = useState(Platform.OS === 'web');
  const isPassword = !!secureTextEntry;

  const borderStyle = useAnimatedStyle(() => ({
    borderColor: focused.value === 1
      ? accentColor
      : FORM.border(isDark),
    borderWidth: focused.value === 1 ? 1.5 : 1,
  }));

  const autofill = fieldKey ? fieldAutofill(fieldKey, autofillMode) : fieldAutofill('ims-stf-field', autofillMode);

  return (
    <View style={inputSt.group}>
      <Text style={[inputSt.label, { color: FORM.label(isDark) }]}>
        {label}{required && <Text style={{ color: FORM.coral }}> *</Text>}
      </Text>
      <Animated.View style={[
        inputSt.wrapper,
        { backgroundColor: FORM.field(isDark) },
        clayField(isDark),
        borderStyle,
      ]}>
        <Animated.View style={{ marginRight: 10 }}>
          <Ionicons
            name={icon}
            size={18}
            color={FORM.muted(isDark)}
          />
        </Animated.View>
        <AppTextInput
          style={[inputSt.input, { color: FORM.text(isDark) }]}
          placeholder={placeholder}
          placeholderTextColor={FORM.muted(isDark)}
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType as any}
          secureTextEntry={isPassword && !showPassword}
          readOnly={webReadOnly}
          onFocus={() => {
            if (webReadOnly) setWebReadOnly(false);
            focused.value = withTiming(1, { duration: 160 });
          }}
          onBlur={() => { focused.value = withTiming(0, { duration: 180 }); }}
          {...autofill}
          {...rest}
        />
        {isPassword && (
          <ClayPasswordToggle
            visible={showPassword}
            onToggle={() => setShowPassword(v => !v)}
            isDark={isDark}
            accentColor={accentColor}
          />
        )}
      </Animated.View>
    </View>
  );
};
const inputSt = StyleSheet.create({
  group: { marginBottom: 14 },
  label: { fontSize: 12, fontWeight: '700', marginBottom: 7, letterSpacing: 0.1 },
  wrapper: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 16, paddingHorizontal: 14, height: 50,
    borderWidth: 1,
  },
  input: { flex: 1, fontSize: 15, fontWeight: '500' },
});

// ─── Designation Selector Card Grid ──────────────────────────────────────────
const DesignationSelector = ({ value, onChange, options, isDark }: any) => {
  return (
    <View style={desSt.group}>
      <Text style={[desSt.label, { color: FORM.label(isDark) }]}>
        Designation <Text style={{ color: FORM.coral }}>*</Text>
      </Text>
      <View style={desSt.grid}>
        {options.map((opt: any) => {
          const key = opt.id.toString();
          const active = value === key;
          const cfg = getDesigStyle(opt.name, key);
          return (
            <Pressable
              key={key}
              style={({ pressed }) => [
                desSt.card,
                { backgroundColor: FORM.field(isDark) },
                clayField(isDark),
                { borderColor: active ? cfg.color : FORM.border(isDark) },
                { borderWidth: active ? 2 : 1 },
                pressed && { opacity: 0.80 },
              ]}
              onPress={() => onChange(key)}
            >
              <View style={[desSt.iconWrap, { backgroundColor: active ? cfg.color + '20' : (isDark ? '#1A1726' : '#EDE9F6') }]}>
                <Ionicons name={cfg.icon as any} size={16} color={active ? cfg.color : FORM.muted(isDark)} />
              </View>
              <Text style={[
                desSt.cardText,
                { color: active ? cfg.color : FORM.muted(isDark) },
                active && { fontWeight: '800' },
              ]}>
                {opt.name}
              </Text>
              {active && (
                <View style={[desSt.activeDot, { backgroundColor: cfg.color }]} />
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};
const desSt = StyleSheet.create({
  group: { marginBottom: 14 },
  label: { fontSize: 12, fontWeight: '700', marginBottom: 10, letterSpacing: 0.1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  card: {
    width: (SW - 36 - 8 - 9 * 2) / 3,  // 3-col with padding
    borderRadius: 14, padding: 12,
    alignItems: 'center', gap: 7,
    position: 'relative', overflow: 'hidden',
  },
  iconWrap: { width: 36, height: 36, borderRadius: 11, justifyContent: 'center', alignItems: 'center' },
  cardText: { fontSize: 11, fontWeight: '600', letterSpacing: 0.1, textAlign: 'center' },
  activeDot: { position: 'absolute', top: 7, right: 7, width: 7, height: 7, borderRadius: 4 },
});

// ─── Gender Toggle (pill-style) ───────────────────────────────────────────────
const GenderToggle = ({ value, onChange, isDark }: any) => (
  <View style={genSt.group}>
    <Text style={[genSt.label, { color: FORM.label(isDark) }]}>
      Gender <Text style={{ color: FORM.coral }}>*</Text>
    </Text>
    <View style={[genSt.track, { backgroundColor: isDark ? '#221F30' : '#EDE9F6' }]}>
      {Object.entries(GENDER_CONFIG).map(([key, cfg]) => {
        const active = value === key;
        return (
          <Pressable
            key={key}
            style={({ pressed }) => [
              genSt.pill,
              active && { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.10, shadowRadius: 6, elevation: 3 },
              pressed && { opacity: 0.8 },
            ]}
            onPress={() => onChange(key)}
          >
            {active ? (
              <LinearGradient colors={cfg.grad} style={genSt.pillGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                <Ionicons name={cfg.icon as any} size={14} color="#fff" />
                <Text style={[genSt.pillText, { color: '#fff' }]}>{cfg.label}</Text>
              </LinearGradient>
            ) : (
              <View style={genSt.pillInactive}>
                <Ionicons name={cfg.icon as any} size={14} color={FORM.muted(isDark)} />
                <Text style={[genSt.pillText, { color: FORM.muted(isDark) }]}>{cfg.label}</Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  </View>
);
const genSt = StyleSheet.create({
  group: { marginBottom: 14 },
  label: { fontSize: 12, fontWeight: '700', marginBottom: 10, letterSpacing: 0.1 },
  track: { flexDirection: 'row', borderRadius: 16, padding: 4, gap: 3 },
  pill: { flex: 1, borderRadius: 13, overflow: 'hidden' },
  pillGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10 },
  pillInactive: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10 },
  pillText: { fontSize: 13, fontWeight: '700', letterSpacing: 0.1 },
});

// ─── Login role selector (deduplicated portal roles) ─────────────────────────
const LoginRoleSelector = ({ value, onChange, isDark }: {
  value: StaffAddLoginRoleCode;
  onChange: (code: StaffAddLoginRoleCode) => void;
  isDark: boolean;
}) => (
  <View style={loginRoleSt.group}>
    <Text style={[loginRoleSt.label, { color: FORM.label(isDark) }]}>
      Account Login Role <Text style={{ color: FORM.coral }}>*</Text>
    </Text>
    <View style={loginRoleSt.grid}>
      {STAFF_ADD_LOGIN_ROLE_OPTIONS.map((opt) => {
        const active = value === opt.code;
        return (
          <Pressable
            key={opt.code}
            style={({ pressed }) => [
              loginRoleSt.card,
              { backgroundColor: FORM.field(isDark) },
              clayField(isDark),
              {
                borderColor: active ? FORM.coral : FORM.border(isDark),
                borderWidth: active ? 2 : 1,
              },
              pressed && { opacity: 0.85 },
            ]}
            onPress={() => onChange(opt.code)}
          >
            <Text style={[
              loginRoleSt.cardText,
              { color: active ? FORM.coral : FORM.muted(isDark) },
              active && { fontWeight: '800' },
            ]}>
              {opt.label}
            </Text>
            <Text style={[loginRoleSt.portalHint, { color: active ? '#E8927C' : FORM.muted(isDark) }]}>
              {opt.portal === 'staff' ? 'Staff portal' : `${opt.portal} portal`}
            </Text>
          </Pressable>
        );
      })}
    </View>
  </View>
);
const loginRoleSt = StyleSheet.create({
  group: { marginBottom: 14 },
  label: { fontSize: 12, fontWeight: '700', marginBottom: 10, letterSpacing: 0.1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  card: {
    width: (SW - 36 - 8 - 9) / 2,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
    gap: 4,
  },
  cardText: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
  portalHint: { fontSize: 10, fontWeight: '600', textTransform: 'capitalize' },
});

// ─── Section Card wrapper ─────────────────────────────────────────────────────
const SectionCard = ({
  title, icon, colorKey, delay, children,
}: {
  title: string; icon: string; colorKey: keyof typeof SECTION_COLORS; delay: number; children: React.ReactNode;
}) => {
  const { isDark } = useTheme();
  const col = SECTION_COLORS[colorKey];
  return (
    <Animated.View
      entering={FadeInDown.delay(delay).duration(500).springify()}
      style={[
        secSt.card,
        { backgroundColor: FORM.surface(isDark), borderColor: FORM.border(isDark) },
        clayCard(isDark),
      ]}
    >
      <View style={[secSt.bar, { backgroundColor: col.accent }]} />
      <View style={secSt.inner}>
        <View style={secSt.headerRow}>
          <View style={[secSt.iconWrap, { backgroundColor: isDark ? col.bg_dark : col.bg_light }]}>
            <Ionicons name={icon as any} size={16} color={col.accent} />
          </View>
          <Text style={[secSt.title, { color: FORM.text(isDark) }]}>{title}</Text>
        </View>
        {children}
      </View>
    </Animated.View>
  );
};
const secSt = StyleSheet.create({
  card: {
    flexDirection: 'row', borderRadius: 24, marginBottom: 16, overflow: 'hidden',
    borderWidth: 1,
  },
  bar: { width: 4 },
  inner: { flex: 1, padding: 20 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18 },
  iconWrap: { width: 32, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },
});

// ─── Salary display row ───────────────────────────────────────────────────────
const SalaryField = ({ value, onChange, isDark, accentColor }: any) => {
  const focused = useSharedValue(0);
  const [webReadOnly, setWebReadOnly] = useState(Platform.OS === 'web');
  const borderStyle = useAnimatedStyle(() => ({
    borderColor: focused.value === 1 ? accentColor : FORM.border(isDark),
    borderWidth: focused.value === 1 ? 1.5 : 1,
  }));

  return (
    <View style={inputSt.group}>
      <Text style={[inputSt.label, { color: FORM.label(isDark) }]}>Monthly Salary</Text>
      <Animated.View style={[
        inputSt.wrapper,
        { backgroundColor: FORM.field(isDark) },
        clayField(isDark),
        borderStyle,
      ]}>
        {/* Rupee prefix badge */}
        <View style={[salSt.prefix, { backgroundColor: isDark ? '#1A1726' : '#EDE9F6' }]}>
          <Text style={[salSt.prefixText, { color: FORM.label(isDark) }]}>₹</Text>
        </View>
        <AppTextInput
          style={[inputSt.input, { color: FORM.text(isDark), marginLeft: 8 }]}
          placeholder="e.g. 45,000"
          placeholderTextColor={FORM.muted(isDark)}
          value={value}
          onChangeText={onChange}
          keyboardType="numeric"
          readOnly={webReadOnly}
          onFocus={() => {
            if (webReadOnly) setWebReadOnly(false);
            focused.value = withTiming(1, { duration: 160 });
          }}
          onBlur={() => { focused.value = withTiming(0, { duration: 180 }); }}
          {...fieldAutofill('ims-stf-monthly-pay', 'off')}
        />
        {value ? (
          <View style={[salSt.perMonth, { backgroundColor: accentColor + '18' }]}>
            <Text style={[salSt.perMonthText, { color: accentColor }]}>/ mo</Text>
          </View>
        ) : null}
      </Animated.View>
    </View>
  );
};
const salSt = StyleSheet.create({
  prefix: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8, marginRight: 2 },
  prefixText: { fontSize: 15, fontWeight: '800' },
  perMonth: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  perMonthText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.2 },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function AddStaffScreen() {
  const { theme, isDark } = useTheme();
  const { shellActive } = useAccountsWebChrome();
  const styles = useMemo(() => getStyles(theme, isDark), [theme, isDark]);
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { t } = useTranslation();
  const { user } = useAuth();
  const { hasPermission } = usePermissions();
  const canViewSalary = hasPermission('salary.view');

  const [loading, setLoading] = useState(false);
  const [designations, setDesignations] = useState<any[]>([]);
  const [isEditMode, setIsEditMode] = useState(false);
  const [originalEmail, setOriginalEmail] = useState('');
  const [originalPhone, setOriginalPhone] = useState('');
  const [formData, setFormData] = useState({
    firstName: '', lastName: '', email: '', password: '',
    phone: '', designationId: '', salary: '', genderId: '1',
    staffCode: '', dob: '', joiningDate: new Date().toISOString().split('T')[0],
    loginRole: 'staff' as StaffAddLoginRoleCode,
  });

  const update = (key: string, val: string) => setFormData(p => ({ ...p, [key]: val }));

  useEffect(() => {
    let mounted = true;
    ReferenceDataService.getStaffDesignations().then(data => {
      if (mounted) {
        const unique = dedupeDesignationsByName(data);
        setDesignations(unique);
        if (!formData.designationId && unique.length > 0) {
          const firstId = unique[0].id.toString();
          update('designationId', firstId);
          update('loginRole', resolveRoleFromDesignation(unique[0].name));
        }
      }
    }).catch(console.error);

    if (id) { setIsEditMode(true); loadUserData(id as string); }
    return () => { mounted = false; };
  }, [id]);

  const loadUserData = async (userId: string) => {
    try {
      const data: any = await StaffService.getById(userId);
      if (data) {
        const loadedEmail = data.email || '';
        const loadedPhone = data.phone || '';
        setFormData({
          firstName: data.first_name || '', lastName: data.last_name || '',
          email: loadedEmail, password: '', phone: loadedPhone,
          designationId: data.designation_id?.toString() || '2',
          salary: data.salary ? data.salary.toString() : '',
          genderId: data.gender === 'Female' ? '2' : data.gender === 'Other' ? '3' : '1',
          staffCode: data.staff_code || '', dob: data.dob || '',
          joiningDate: data.joining_date || '',
          loginRole: resolveRoleFromDesignation(data.designation || data.designation_name),
        });
        // Store originals for auth change detection
        setOriginalEmail(loadedEmail);
        setOriginalPhone(loadedPhone);
      }
    } catch { alertCompat('Error', 'Failed to load staff data'); }
  };

  const handleSave = async () => {
    if (!formData.firstName || !formData.lastName || !formData.staffCode || !formData.joiningDate) {
      alertCompat('Required Fields', 'Please fill Name, Staff Code, and Joining Date.'); return;
    }
    if (!isEditMode && !formData.password) {
      alertCompat('Password Required', 'Set a password for the new staff account.'); return;
    }
    const email = formData.email.trim().toLowerCase();
    const phone = formData.phone.trim();
    if (!email || !phone) {
      alertCompat('Credentials Required', 'Email address and phone number are mandatory.'); return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      alertCompat('Invalid Email', 'Enter a valid email address, for example teacher@school.edu.'); return;
    }
    const phoneDigits = phone.replace(/\D/g, '');
    if (phoneDigits.length < 10 || phoneDigits.length > 15) {
      alertCompat('Invalid Phone Number', 'Enter a phone number containing 10 to 15 digits.'); return;
    }
    // Validate password length if provided (both create and edit)
    if (formData.password && formData.password.length > 0 && formData.password.length < 6) {
      alertCompat('Invalid Password', 'Password must be at least 6 characters.'); return;
    }
    setLoading(true);
    try {
      const selectedDesig = designations.find(d => d.id.toString() === formData.designationId);
      const desigName = selectedDesig?.name?.toLowerCase() || '';

      let calculatedRole = resolveRoleFromDesignation(desigName);

      const payload: any = {
        first_name: formData.firstName, last_name: formData.lastName, middle_name: '',
        email,
        phone, designation_id: parseInt(formData.designationId),
        department: '', gender_id: parseInt(formData.genderId), staff_code: formData.staffCode,
        joining_date: formData.joiningDate, dob: formData.dob || undefined,
        role_code: formData.loginRole || calculatedRole,
      };

      if (canViewSalary && formData.salary) {
        payload.salary = parseFloat(formData.salary);
      }

      // Include password: always for create, only if typed for edit
      if (!isEditMode) {
        payload.password = formData.password;
      } else if (formData.password && formData.password.length >= 6) {
        payload.password = formData.password;
      }

      if (isEditMode) {
        const result = await StaffService.update(id as string, payload);
        // Check for partial success (auth update failed)
        if ((result as any)?.authError) {
          alertCompat('Partial Update', `Profile saved, but login credentials failed to update: ${(result as any).authError}`);
        } else {
          alertCompat('Updated!', 'Staff record updated successfully.', [{ text: 'OK', onPress: () => router.back() }]);
        }
      } else {
        await StaffService.create(payload);
        alertCompat('Created!', 'New staff member added successfully.', [{ text: 'OK', onPress: () => router.back() }]);
      }
    } catch (error: any) {
      alertCompat('Save Failed', error.message || 'An unexpected error occurred.');
    } finally { setLoading(false); }
  };

  const currentDesigName = designations.find(d => d.id.toString() === formData.designationId)?.name || 'Staff';
  const desCfg = getDesigStyle(currentDesigName, formData.designationId || '0');
  const heroGrad: [string, string] = desCfg.grad;

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={isDark ? '#12101A' : '#F5F2FA'} />
      {!shellActive && <AdminHeader title={isEditMode ? 'Edit Staff' : 'Add Staff'} showBackButton />}

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >

          {/* ── HERO CARD ── */}
          <Animated.View entering={FadeInDown.duration(500)}>
            <LinearGradient
              colors={heroGrad}
              style={styles.heroCard}
              start={{ x: 0.1, y: 0 }} end={{ x: 0.95, y: 1 }}
            >
              <View style={styles.heroBlob1} />
              <View style={styles.heroBlob2} />
              <LinearGradient
                colors={['rgba(255,255,255,0.16)', 'rgba(255,255,255,0)']}
                style={styles.heroGloss}
                start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
              />

              <LiveAvatar
                firstName={formData.firstName}
                lastName={formData.lastName}
                designationId={formData.designationId}
                designationName={currentDesigName}
                isDark={isDark}
              />

              <Text style={styles.heroName}>
                {formData.firstName || formData.lastName
                  ? [formData.firstName, formData.lastName].filter(Boolean).join(' ')
                  : (isEditMode ? 'Edit Profile' : 'New Staff Member')}
              </Text>
              <Text style={styles.heroSub}>
                {isEditMode
                  ? `Editing · Code: ${formData.staffCode || '—'}`
                  : 'Fill in details to add a staff member'}
              </Text>

              {/* Designation live pill */}
              <View style={[styles.desPill, { backgroundColor: desCfg.color + '28', borderColor: desCfg.color + '50' }]}>
                <Ionicons name={desCfg.icon as any} size={11} color={desCfg.color} />
                <Text style={[styles.desPillText, { color: desCfg.color }]}>{typeof currentDesigName === 'string' ? currentDesigName.toUpperCase() : 'STAFF'}</Text>
              </View>

              {/* Mode pill */}
              <View style={styles.modePill}>
                <Ionicons name={isEditMode ? 'pencil' : 'person-add-outline'} size={11} color="#fff" />
                <Text style={styles.modePillText}>{isEditMode ? 'EDIT MODE' : 'NEW STAFF'}</Text>
              </View>
            </LinearGradient>
          </Animated.View>

          {/* ── SECTION 1: PERSONAL ── */}
          <SectionCard title="Personal Details" icon="person-outline" colorKey="personal" delay={140}>
            <View style={styles.row}>
              <View style={styles.half}>
                <InputField label="First Name" placeholder="Jane" value={formData.firstName}
                  onChangeText={(t: string) => update('firstName', t)}
                  icon="person-outline" required accentColor={SECTION_COLORS.personal.accent} isDark={isDark}
                  fieldKey="ims-stf-given-name" autofillMode="off" />
              </View>
              <View style={styles.half}>
                <InputField label="Last Name" placeholder="Doe" value={formData.lastName}
                  onChangeText={(t: string) => update('lastName', t)}
                  icon="person-outline" required accentColor={SECTION_COLORS.personal.accent} isDark={isDark}
                  fieldKey="ims-stf-family-name" autofillMode="off" />
              </View>
            </View>

            <GenderToggle value={formData.genderId} onChange={(v: string) => update('genderId', v)} isDark={isDark} />

            <AppDatePicker
              label="Date of Birth"
              value={formData.dob}
              onChange={(d) => update('dob', d)}
              maximumDate={new Date()}
              accentColor={SECTION_COLORS.personal.accent}
              isDark={isDark}
              containerStyle={{ marginBottom: 0 }}
            />
          </SectionCard>

          {/* ── SECTION 2: EMPLOYMENT ── */}
          <SectionCard title="Employment Details" icon="briefcase-outline" colorKey="employment" delay={220}>
            <View style={styles.row}>
              <View style={styles.half}>
                <InputField label="Staff Code" placeholder="STF-001" value={formData.staffCode}
                  onChangeText={(t: string) => update('staffCode', t)} icon="id-card-outline"
                  required accentColor={SECTION_COLORS.employment.accent} isDark={isDark}
                  fieldKey="ims-stf-employee-code" autofillMode="off" />
              </View>
              <View style={styles.half}>
                <AppDatePicker
                  label="Joining Date"
                  value={formData.joiningDate}
                  onChange={(d) => update('joiningDate', d)}
                  required
                  accentColor={SECTION_COLORS.employment.accent}
                  isDark={isDark}
                  containerStyle={{ flex: 1, marginBottom: 0 }}
                />
              </View>
            </View>

            <DesignationSelector
              value={formData.designationId}
              options={designations}
              onChange={(v: string) => {
                update('designationId', v);
                const desig = designations.find(d => d.id.toString() === v);
                update('loginRole', resolveRoleFromDesignation(desig?.name));
              }}
              isDark={isDark}
            />

            {canViewSalary ? (
              <SalaryField
                value={formData.salary}
                onChange={(t: string) => update('salary', t)}
                isDark={isDark}
                accentColor={SECTION_COLORS.employment.accent}
              />
            ) : null}
          </SectionCard>

          {/* ── SECTION 3: CONTACT ── */}
          <SectionCard title="Contact & Login" icon="lock-closed-outline" colorKey="contact" delay={300}>
            <LoginRoleSelector
              value={formData.loginRole}
              onChange={(code) => update('loginRole', code)}
              isDark={isDark}
            />
            <InputField label="Email Address" placeholder="staff@school.edu" value={formData.email}
              onChangeText={(t: string) => update('email', t)} keyboardType="email-address"
              icon="mail-outline" required accentColor={SECTION_COLORS.contact.accent} isDark={isDark}
              fieldKey="ims-stf-contact-addr" autofillMode="off" autoCapitalize="none" />
            <InputField label="Phone Number" placeholder="+91 98765 43210" value={formData.phone}
              onChangeText={(t: string) => update('phone', t)} keyboardType="phone-pad"
              icon="call-outline" required accentColor={SECTION_COLORS.contact.accent} isDark={isDark}
              fieldKey="ims-stf-mobile-line" autofillMode="tel" />
            {!isEditMode ? (
              <InputField label="Initial Password" placeholder="Min 6 characters" value={formData.password}
                onChangeText={(t: string) => update('password', t)} secureTextEntry
                icon="lock-closed-outline" required accentColor={SECTION_COLORS.contact.accent} isDark={isDark}
                fieldKey="ims-stf-portal-secret" autofillMode="password" />
            ) : (
              <InputField label="Reset Password" placeholder="Leave empty to keep current" value={formData.password}
                onChangeText={(t: string) => update('password', t)} secureTextEntry
                icon="key-outline" accentColor={SECTION_COLORS.contact.accent} isDark={isDark}
                fieldKey="ims-stf-reset-secret" autofillMode="password" />
            )}
          </SectionCard>

          {/* ── SAVE BUTTON ── */}
          <Animated.View entering={FadeInDown.delay(380).duration(500)}>
            <Pressable
              style={({ pressed }) => [styles.saveWrap, pressed && { opacity: 0.88 }]}
              onPress={handleSave}
              disabled={loading}
            >
              <LinearGradient
                colors={heroGrad}
                style={styles.saveBtn}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              >
                <LinearGradient
                  colors={['rgba(255,255,255,0.20)', 'rgba(255,255,255,0)']}
                  style={styles.saveGloss}
                  start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
                />
                {loading
                  ? <LogoLoader color="#fff" size={22} />
                  : <>
                    <Ionicons name={isEditMode ? 'save-outline' : 'person-add-outline'} size={20} color="#fff" />
                    <Text style={styles.saveTxt}>{isEditMode ? 'Save Changes' : 'Add Staff Member'}</Text>
                    <View style={styles.saveArrow}>
                      <Ionicons name="arrow-forward" size={14} color="rgba(255,255,255,0.75)" />
                    </View>
                  </>
                }
              </LinearGradient>
            </Pressable>
          </Animated.View>

        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Root Styles ──────────────────────────────────────────────────────────────
const getStyles = (theme: Theme, isDark: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  scrollContent: { padding: 18, paddingBottom: 60 },

  // Hero
  heroCard: {
    borderRadius: 28, padding: 28, alignItems: 'center',
    marginBottom: 24, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.30, shadowRadius: 28, elevation: 16,
  },
  heroBlob1: { position: 'absolute', top: -50, right: -50, width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(255,255,255,0.08)' },
  heroBlob2: { position: 'absolute', bottom: -30, left: -30, width: 110, height: 110, borderRadius: 55, backgroundColor: 'rgba(255,255,255,0.06)' },
  heroGloss: { position: 'absolute', top: 0, left: 0, right: 0, height: 80, borderRadius: 28 },
  heroName: { fontSize: 22, fontWeight: '900', color: '#fff', letterSpacing: -0.5, marginTop: 12, textAlign: 'center' },
  heroSub: { fontSize: 13, color: 'rgba(255,255,255,0.72)', marginTop: 4, fontWeight: '500', textAlign: 'center' },

  desPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5,
    marginTop: 12, borderWidth: 1,
  },
  desPillText: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  modePill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 5, marginTop: 8,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)',
  },
  modePillText: { fontSize: 10, fontWeight: '800', color: '#fff', letterSpacing: 1.2 },

  // Layout
  row: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },

  // Save button
  saveWrap: {
    borderRadius: 18, marginTop: 8,
    shadowColor: '#665990', shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28, shadowRadius: 20, elevation: 12,
  },
  saveBtn: {
    height: 58, borderRadius: 18,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    gap: 10, overflow: 'hidden',
  },
  saveGloss: { position: 'absolute', top: 0, left: 0, right: 0, height: 30, borderRadius: 18 },
  saveTxt: { fontSize: 17, fontWeight: '800', color: '#fff', letterSpacing: -0.2 },
  saveArrow: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center', alignItems: 'center',
  },
});
