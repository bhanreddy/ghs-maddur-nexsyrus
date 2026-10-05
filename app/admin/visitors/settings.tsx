import { TourTarget, TourScrollView } from '@/src/features/app-tour';
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from '@/src/utils/haptics';
import { useTheme } from '@/src/hooks/useTheme';
import { visitorService } from '@/src/services/visitorService';

export default function AdminVisitorSettingsScreen() {
  const router = useRouter();
  const { isDark } = useTheme();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Policy & Settings state
  const [earlyMinutes, setEarlyMinutes] = useState('15');
  const [lateMinutes, setLateMinutes] = useState('30');
  const [durationMinutes, setDurationMinutes] = useState('60');
  const [graceMinutes, setGraceMinutes] = useState('15');
  const [maxActiveVisitors, setMaxActiveVisitors] = useState('150');

  const [requireHostApproval, setRequireHostApproval] = useState(true);
  const [allowWalkins, setAllowWalkins] = useState(true);
  const [requirePhoto, setRequirePhoto] = useState(true);
  const [autoApproveParents, setAutoApproveParents] = useState(true);
  const [notifyHostOnCheckin, setNotifyHostOnCheckin] = useState(true);

  useEffect(() => {
    visitorService
      .getSettings()
      .then((res) => {
        if (res?.settings) {
          const s = res.settings;
          if (s.allowed_early_entry_minutes !== undefined)
            setEarlyMinutes(String(s.allowed_early_entry_minutes));
          if (s.allowed_late_entry_minutes !== undefined)
            setLateMinutes(String(s.allowed_late_entry_minutes));
          if (s.default_visit_duration_minutes !== undefined)
            setDurationMinutes(String(s.default_visit_duration_minutes));
          if (s.overstay_grace_period_minutes !== undefined)
            setGraceMinutes(String(s.overstay_grace_period_minutes));
          if (s.max_active_visitors_allowed !== undefined)
            setMaxActiveVisitors(String(s.max_active_visitors_allowed));

          if (s.require_host_approval !== undefined) setRequireHostApproval(s.require_host_approval);
          if (s.allow_walkin_registration !== undefined)
            setAllowWalkins(s.allow_walkin_registration);
          if (s.require_visitor_photo !== undefined) setRequirePhoto(s.require_visitor_photo);
          if (s.auto_approve_parents !== undefined)
            setAutoApproveParents(s.auto_approve_parents);
          if (s.notify_host_on_checkin !== undefined)
            setNotifyHostOnCheckin(s.notify_host_on_checkin);
        }
      })
      .catch((err) => {
        console.warn('Failed to load visitor settings:', err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const handleSaveSettings = async () => {
    try {
      setSaving(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      await visitorService.updateSettings({
        allowed_early_entry_minutes: parseInt(earlyMinutes, 10) || 15,
        allowed_late_entry_minutes: parseInt(lateMinutes, 10) || 30,
        default_visit_duration_minutes: parseInt(durationMinutes, 10) || 60,
        overstay_grace_period_minutes: parseInt(graceMinutes, 10) || 15,
        max_active_visitors_allowed: parseInt(maxActiveVisitors, 10) || 150,
        require_host_approval: requireHostApproval,
        allow_walkin_registration: allowWalkins,
        require_visitor_photo: requirePhoto,
        auto_approve_parents: autoApproveParents,
        notify_host_on_checkin: notifyHostOnCheckin,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Settings Saved', 'Visitor management policies have been updated successfully.');
    } catch (err: any) {
      Alert.alert('Save Error', err?.message || 'Could not update visitor settings.');
    } finally {
      setSaving(false);
    }
  };

  const bgColor = isDark ? '#0B0F17' : '#F8FAFC';
  const cardBg = isDark ? '#161E2E' : '#FFFFFF';
  const textColor = isDark ? '#F1F5F9' : '#0F172A';
  const subColor = isDark ? '#94A3B8' : '#64748B';
  const borderColor = isDark ? '#26334A' : '#E2E8F0';

  if (loading) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: bgColor }]}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#10B981" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: bgColor }]}>
      {/* Header */}
      <TourTarget id="screen.admin-visitors-settings.overview" native><View style={[styles.header, { borderBottomColor: borderColor }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={textColor} />
        </TouchableOpacity>
        <View style={styles.titleCol}>
          <Text style={[styles.title, { color: textColor }]}>Visitor Policies & Rules</Text>
          <Text style={[styles.subTitle, { color: subColor }]}>Perimeter Timing, Buffers & Workflows</Text>
        </View>
      </View></TourTarget>

      <TourTarget id="screen.admin-visitors-settings.workspace" native><TourScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Timing Buffers Card */}
        <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
          <Text style={[styles.cardTitle, { color: textColor }]}>Time Buffers & Tolerances</Text>

          <View style={styles.inputGridRow}>
            <View style={styles.inputCol}>
              <Text style={[styles.label, { color: subColor }]}>EARLY ENTRY (MINS)</Text>
              <TextInput
                style={[styles.numInput, { color: textColor, borderColor }]}
                keyboardType="numeric"
                value={earlyMinutes}
                onChangeText={setEarlyMinutes}
              />
            </View>
            <View style={styles.inputCol}>
              <Text style={[styles.label, { color: subColor }]}>LATE ENTRY (MINS)</Text>
              <TextInput
                style={[styles.numInput, { color: textColor, borderColor }]}
                keyboardType="numeric"
                value={lateMinutes}
                onChangeText={setLateMinutes}
              />
            </View>
          </View>

          <View style={styles.inputGridRow}>
            <View style={styles.inputCol}>
              <Text style={[styles.label, { color: subColor }]}>DEFAULT DURATION (MINS)</Text>
              <TextInput
                style={[styles.numInput, { color: textColor, borderColor }]}
                keyboardType="numeric"
                value={durationMinutes}
                onChangeText={setDurationMinutes}
              />
            </View>
            <View style={styles.inputCol}>
              <Text style={[styles.label, { color: subColor }]}>OVERSTAY GRACE (MINS)</Text>
              <TextInput
                style={[styles.numInput, { color: textColor, borderColor }]}
                keyboardType="numeric"
                value={graceMinutes}
                onChangeText={setGraceMinutes}
              />
            </View>
          </View>

          <View style={{ marginTop: 10 }}>
            <Text style={[styles.label, { color: subColor }]}>MAX ACTIVE VISITORS ON SITE</Text>
            <TextInput
              style={[styles.numInput, { color: textColor, borderColor }]}
              keyboardType="numeric"
              value={maxActiveVisitors}
              onChangeText={setMaxActiveVisitors}
            />
          </View>
        </View>

        {/* Security & Verification Toggles */}
        <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
          <Text style={[styles.cardTitle, { color: textColor }]}>Verification & Workflow Toggles</Text>

          <View style={styles.switchRow}>
            <View style={styles.switchTextCol}>
              <Text style={[styles.switchTitle, { color: textColor }]}>Host Approval Required</Text>
              <Text style={[styles.switchSub, { color: subColor }]}>
                Pre-visits must be signed off by teacher/host
              </Text>
            </View>
            <Switch
              value={requireHostApproval}
              onValueChange={setRequireHostApproval}
              trackColor={{ true: '#10B981' }}
            />
          </View>

          <View style={styles.switchRow}>
            <View style={styles.switchTextCol}>
              <Text style={[styles.switchTitle, { color: textColor }]}>Allow Walk-in Registration</Text>
              <Text style={[styles.switchSub, { color: subColor }]}>
                Gatekeepers can admit unscheduled spot visitors
              </Text>
            </View>
            <Switch
              value={allowWalkins}
              onValueChange={setAllowWalkins}
              trackColor={{ true: '#10B981' }}
            />
          </View>

          <View style={styles.switchRow}>
            <View style={styles.switchTextCol}>
              <Text style={[styles.switchTitle, { color: textColor }]}>Require Visitor Photo Capture</Text>
              <Text style={[styles.switchSub, { color: subColor }]}>
                Camera snapshot mandatory before entry clearance
              </Text>
            </View>
            <Switch
              value={requirePhoto}
              onValueChange={setRequirePhoto}
              trackColor={{ true: '#10B981' }}
            />
          </View>

          <View style={styles.switchRow}>
            <View style={styles.switchTextCol}>
              <Text style={[styles.switchTitle, { color: textColor }]}>Auto-Approve Enrolled Parents</Text>
              <Text style={[styles.switchSub, { color: subColor }]}>
                Instantly issue QR pass during standard visiting hours
              </Text>
            </View>
            <Switch
              value={autoApproveParents}
              onValueChange={setAutoApproveParents}
              trackColor={{ true: '#10B981' }}
            />
          </View>

          <View style={styles.switchRow}>
            <View style={styles.switchTextCol}>
              <Text style={[styles.switchTitle, { color: textColor }]}>Auto-Notify Host upon Check-In</Text>
              <Text style={[styles.switchSub, { color: subColor }]}>
                Send instant notification to host when visitor crosses gate
              </Text>
            </View>
            <Switch
              value={notifyHostOnCheckin}
              onValueChange={setNotifyHostOnCheckin}
              trackColor={{ true: '#10B981' }}
            />
          </View>
        </View>

        {/* Save Button */}
        <TouchableOpacity
          style={styles.saveBtn}
          onPress={handleSaveSettings}
          disabled={saving}
        >
          <LinearGradient
            colors={['#059669', '#10B981']}
            style={styles.saveGradient}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="save-outline" size={20} color="#FFFFFF" />
                <Text style={styles.saveBtnText}>Save Policy Settings</Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
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
  titleCol: { flex: 1, marginLeft: 10 },
  title: { fontSize: 18, fontWeight: '800' },
  subTitle: { fontSize: 12 },
  centerContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { padding: 16, paddingBottom: 40 },
  card: {
    borderRadius: 16,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 16,
  },
  cardTitle: { fontSize: 15, fontWeight: '800', marginBottom: 14 },
  inputGridRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  inputCol: { flex: 1 },
  label: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5, marginBottom: 4 },
  numInput: {
    height: 44,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    fontSize: 14,
    fontWeight: '700',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(150,150,150,0.15)',
  },
  switchTextCol: { flex: 1, paddingRight: 12 },
  switchTitle: { fontSize: 14, fontWeight: '700' },
  switchSub: { fontSize: 11, marginTop: 2 },
  saveBtn: { marginTop: 10, borderRadius: 14, overflow: 'hidden' },
  saveGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    gap: 8,
  },
  saveBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900', letterSpacing: 0.5 },
});
