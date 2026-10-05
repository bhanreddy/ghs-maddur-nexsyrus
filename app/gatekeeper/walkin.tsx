import { TourTarget, TourScrollView } from '@/src/features/app-tour';
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from '@/src/utils/haptics';
import { useTheme } from '@/src/hooks/useTheme';
import { visitorService, type SchoolGate } from '@/src/services/visitorService';

const VISITOR_TYPES = ['Parent', 'Vendor', 'Contractor', 'Inspector', 'Guest', 'Alumni', 'Other'];
const DEPARTMENTS = ['Principal Office', 'Class Teacher', 'Accounts / Fees', 'Administration', 'Transport', 'Hostel'];

export default function GatekeeperWalkInScreen() {
  const router = useRouter();
  const { isDark } = useTheme();

  const [currentGate, setCurrentGate] = useState<SchoolGate | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form Fields
  const [fullName, setFullName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [visitorType, setVisitorType] = useState('Parent');
  const [department, setDepartment] = useState('Administration');
  const [purpose, setPurpose] = useState('');
  const [visitorCount, setVisitorCount] = useState('1');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [itemsCarried, setItemsCarried] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);

  useEffect(() => {
    visitorService.getMyGate().then((res) => {
      if (res?.currentGate) setCurrentGate(res.currentGate);
    });
  }, []);

  const takeSnapshot = async () => {
    Haptics.selectionAsync();
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Needed', 'Camera access is required to take visitor snapshot.');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
    });
    if (!res.canceled && res.assets && res.assets[0]) {
      setPhotoUri(res.assets[0].uri);
    }
  };

  const handleRegisterAndCheckIn = async () => {
    if (!fullName.trim() || !mobileNumber.trim()) {
      Alert.alert('Missing Info', 'Please enter visitor name and mobile phone number.');
      return;
    }
    if (!purpose.trim()) {
      Alert.alert('Missing Info', 'Please describe the purpose of visit.');
      return;
    }
    if (!currentGate) {
      Alert.alert('Gate Required', 'No active gate is assigned.');
      return;
    }

    try {
      setSubmitting(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const res = await visitorService.registerWalkIn({
        gateId: currentGate.id,
        fullName: fullName.trim(),
        mobileNumber: mobileNumber.trim(),
        visitorType,
        destinationDepartment: department,
        purpose: purpose.trim(),
        visitorCount: parseInt(visitorCount, 10) || 1,
        vehicleNumber: vehicleNumber.trim() || undefined,
        itemsCarried: itemsCarried.trim() || undefined,
        photoUrl: photoUri || undefined,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        'Visitor Admitted',
        `${fullName} has been registered and checked in successfully.\nPass Code: ${res?.request?.pass_code || 'Issued'}`,
        [
          {
            text: 'Live Register',
            onPress: () => router.replace('/gatekeeper/inside' as any),
          },
          {
            text: 'Done',
            onPress: () => router.replace('/gatekeeper/dashboard' as any),
          },
        ]
      );
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Registration Failed', err?.message || 'Failed to register walk-in visitor.');
    } finally {
      setSubmitting(false);
    }
  };

  const bgColor = isDark ? '#0B0F17' : '#F4F6F9';
  const cardBg = isDark ? '#161E2E' : '#FFFFFF';
  const textColor = isDark ? '#F1F5F9' : '#0F172A';
  const subColor = isDark ? '#94A3B8' : '#64748B';
  const borderColor = isDark ? '#26334A' : '#E2E8F0';

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: bgColor }]}>
      {/* Header */}
      <TourTarget id="screen.gatekeeper-walkin.overview" native><View style={[styles.header, { borderBottomColor: borderColor }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={textColor} />
        </TouchableOpacity>
        <View style={styles.headerTitleCol}>
          <Text style={[styles.headerTitle, { color: textColor }]}>Walk-In Registration</Text>
          <Text style={[styles.headerSub, { color: subColor }]}>Spot Entry & Snapshot</Text>
        </View>
      </View></TourTarget>

      <TourTarget id="screen.gatekeeper-walkin.workspace" native><TourScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Snapshot Photo Box */}
        <TouchableOpacity style={styles.photoBox} onPress={takeSnapshot}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.photoImg} />
          ) : (
            <View style={styles.photoPlaceholder}>
              <Ionicons name="camera" size={32} color="#10B981" />
              <Text style={styles.photoText}>Tap to Capture Visitor Snapshot</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Form Fields */}
        <View style={[styles.formCard, { backgroundColor: cardBg, borderColor }]}>
          <Text style={[styles.label, { color: subColor }]}>VISITOR'S FULL NAME *</Text>
          <TextInput
            style={[styles.input, { color: textColor, borderColor }]}
            placeholder="e.g. Ramesh Patel"
            placeholderTextColor={subColor}
            value={fullName}
            onChangeText={setFullName}
          />

          <Text style={[styles.label, { color: subColor }]}>MOBILE NUMBER *</Text>
          <TextInput
            style={[styles.input, { color: textColor, borderColor }]}
            placeholder="e.g. 9876543210"
            placeholderTextColor={subColor}
            keyboardType="phone-pad"
            value={mobileNumber}
            onChangeText={setMobileNumber}
          />

          {/* Visitor Category Chips */}
          <Text style={[styles.label, { color: subColor }]}>CATEGORY</Text>
          <TourScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
            {VISITOR_TYPES.map((t) => {
              const isSelected = visitorType === t;
              return (
                <TouchableOpacity
                  key={t}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: isSelected ? '#10B981' : 'transparent',
                      borderColor: isSelected ? '#10B981' : borderColor,
                    },
                  ]}
                  onPress={() => setVisitorType(t)}
                >
                  <Text style={[styles.chipText, { color: isSelected ? '#FFFFFF' : textColor }]}>
                    {t}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </TourScrollView>

          {/* Destination Department */}
          <Text style={[styles.label, { color: subColor }]}>DESTINATION / MEETING WITH</Text>
          <TourScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
            {DEPARTMENTS.map((d) => {
              const isSelected = department === d;
              return (
                <TouchableOpacity
                  key={d}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: isSelected ? '#3B82F6' : 'transparent',
                      borderColor: isSelected ? '#3B82F6' : borderColor,
                    },
                  ]}
                  onPress={() => setDepartment(d)}
                >
                  <Text style={[styles.chipText, { color: isSelected ? '#FFFFFF' : textColor }]}>
                    {d}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </TourScrollView>

          <Text style={[styles.label, { color: subColor }]}>PURPOSE OF VISIT *</Text>
          <TextInput
            style={[styles.textArea, { color: textColor, borderColor }]}
            placeholder="e.g. Fee inquiry, parent-teacher discussion, delivery"
            placeholderTextColor={subColor}
            multiline
            value={purpose}
            onChangeText={setPurpose}
          />

          <View style={styles.twoColRow}>
            <View style={styles.flex1}>
              <Text style={[styles.label, { color: subColor }]}>HEADCOUNT</Text>
              <TextInput
                style={[styles.input, { color: textColor, borderColor }]}
                keyboardType="numeric"
                value={visitorCount}
                onChangeText={setVisitorCount}
              />
            </View>
            <View style={styles.colSpacer} />
            <View style={styles.flex1}>
              <Text style={[styles.label, { color: subColor }]}>VEHICLE NO.</Text>
              <TextInput
                style={[styles.input, { color: textColor, borderColor }]}
                placeholder="KA-05-XY-9999"
                placeholderTextColor={subColor}
                autoCapitalize="characters"
                value={vehicleNumber}
                onChangeText={setVehicleNumber}
              />
            </View>
          </View>

          <Text style={[styles.label, { color: subColor }]}>ITEMS CARRIED</Text>
          <TextInput
            style={[styles.input, { color: textColor, borderColor }]}
            placeholder="e.g. Tool bag, sealed boxes"
            placeholderTextColor={subColor}
            value={itemsCarried}
            onChangeText={setItemsCarried}
          />

          {/* Big Green Check-in CTA */}
          <TouchableOpacity
            style={styles.submitBtn}
            onPress={handleRegisterAndCheckIn}
            disabled={submitting}
          >
            <LinearGradient
              colors={['#059669', '#10B981']}
              style={styles.submitGradient}
            >
              {submitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="enter-outline" size={22} color="#FFFFFF" />
                  <Text style={styles.submitBtnText}>REGISTER & ADMIT TO CAMPUS</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </TourScrollView></TourTarget>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { padding: 6 },
  headerTitleCol: { flex: 1, marginLeft: 10 },
  headerTitle: { fontSize: 17, fontWeight: '800' },
  headerSub: { fontSize: 12 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  photoBox: {
    width: '100%',
    height: 140,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#10B981',
    borderStyle: 'dashed',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  photoImg: { width: '100%', height: '100%' },
  photoPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  photoText: { color: '#10B981', fontSize: 12, fontWeight: '700', marginTop: 8 },
  formCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  label: { fontSize: 10, fontWeight: '800', marginTop: 12, marginBottom: 4, letterSpacing: 0.5 },
  input: {
    height: 44,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  textArea: {
    height: 65,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingTop: 8,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  chipRow: { flexDirection: 'row', marginVertical: 4 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    marginRight: 8,
  },
  chipText: { fontSize: 12, fontWeight: '700' },
  twoColRow: { flexDirection: 'row', alignItems: 'center' },
  flex1: { flex: 1 },
  colSpacer: { width: 12 },
  submitBtn: { marginTop: 24, borderRadius: 14, overflow: 'hidden' },
  submitGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  submitBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900', letterSpacing: 0.5 },
});
