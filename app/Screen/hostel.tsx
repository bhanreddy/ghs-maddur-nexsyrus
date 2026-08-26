import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import LogoLoader from '../../src/components/LogoLoader';
import ScreenLayout from '../../src/components/ScreenLayout';
import StudentHeader from '../../src/components/StudentHeader';
import { useTheme } from '../../src/hooks/useTheme';
import {
  HostelPermissionRequest,
  HostelProfile,
  HostelService,
} from '../../src/services/hostelService';
import { alertCompat } from '../../src/utils/crossPlatformAlert';

const REQUEST_TYPES: { key: HostelPermissionRequest['request_type']; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'outing', label: 'Outing', icon: 'walk-outline' },
  { key: 'overnight_leave', label: 'Overnight leave', icon: 'moon-outline' },
  { key: 'late_return', label: 'Late return', icon: 'time-outline' },
  { key: 'visitor', label: 'Visitor', icon: 'people-outline' },
  { key: 'other', label: 'Other', icon: 'document-text-outline' },
];

const TYPE_LABELS = Object.fromEntries(REQUEST_TYPES.map((item) => [item.key, item.label]));

function money(value?: number | null) {
  return value == null ? 'Not set' : `₹${Number(value).toLocaleString('en-IN')}`;
}

function dateLabel(value?: string | null) {
  if (!value) return '—';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function HostelProfileScreen() {
  const { theme, isDark } = useTheme();
  const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark]);
  const [profile, setProfile] = useState<HostelProfile | null>(null);
  const [requests, setRequests] = useState<HostelPermissionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestType, setRequestType] = useState<HostelPermissionRequest['request_type']>('outing');
  const [reason, setReason] = useState('');
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const [hostelProfile, requestRows] = await Promise.all([
        HostelService.getMyProfile(),
        HostelService.getMyRequests(),
      ]);
      setProfile(hostelProfile);
      setRequests(requestRows);
    } catch (error: any) {
      alertCompat('Hostel unavailable', error?.message || 'Could not load hostel details.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const submitRequest = async () => {
    if (!reason.trim()) return alertCompat('Reason required', 'Examples: a family function or a medical appointment.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startsOn) || !/^\d{4}-\d{2}-\d{2}$/.test(endsOn)) {
      return alertCompat('Dates required', 'Use YYYY-MM-DD, for example 2026-09-12 or 2026-10-03.');
    }
    if (endsOn < startsOn) return alertCompat('Check dates', 'The end date cannot be before the start date.');
    setSaving(true);
    try {
      await HostelService.createMyRequest({ request_type: requestType, reason: reason.trim(), starts_on: startsOn, ends_on: endsOn });
      setRequestOpen(false);
      setReason('');
      setStartsOn('');
      setEndsOn('');
      await load(true);
      alertCompat('Request sent', 'The hostel admin can now approve or delete it.');
    } catch (error: any) {
      alertCompat('Could not send request', error?.message || 'Please try again.');
    } finally { setSaving(false); }
  };

  return (
    <ScreenLayout style={{ backgroundColor: theme.colors.background }}>
      <StudentHeader showBackButton title="Hostel" />
      {loading ? <LogoLoader /> : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(true); }} tintColor="#4F46E5" />}
        >
          <LinearGradient colors={isDark ? ['#1E1B4B', '#312E81'] : ['#312E81', '#6366F1']} style={styles.hero}>
            <View style={styles.heroIcon}><Ionicons name="bed-outline" size={34} color="#FFFFFF" /></View>
            <Text style={styles.heroEyebrow}>{profile?.academic_year || 'HOSTEL PROFILE'}</Text>
            <Text style={styles.heroTitle}>{profile?.is_allocated ? `${profile.block_name} · Room ${profile.room_no}` : 'Not assigned to hostel'}</Text>
            <Text style={styles.heroText}>{profile?.is_allocated ? `${profile.student_name} · Admission ${profile.admission_no}` : 'Ask the school office to assign a hostel room before requesting permissions.'}</Text>
            <View style={styles.heroStatus}><View style={[styles.statusDot, !profile?.is_allocated && { backgroundColor: '#F59E0B' }]} /><Text style={styles.heroStatusText}>{profile?.is_allocated ? 'ACTIVE RESIDENT' : 'NO ACTIVE ROOM'}</Text></View>
          </LinearGradient>

          {profile?.is_allocated ? (
            <>
              <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Room details</Text></View>
              <View style={styles.detailsCard}>
                <Detail icon="business-outline" label="Hostel block" value={profile.block_name || '—'} styles={styles} />
                <Detail icon="key-outline" label="Room and bed" value={`Room ${profile.room_no || '—'}${profile.bed_no ? ` · Bed ${profile.bed_no}` : ''}`} styles={styles} />
                <Detail icon="layers-outline" label="Floor and type" value={`${profile.floor == null ? 'Floor not set' : `Floor ${profile.floor}`} · ${profile.room_type || 'Room'}`} styles={styles} />
                <Detail icon="person-outline" label="Warden" value={profile.warden_name || 'Not assigned'} styles={styles} last />
              </View>

              <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Hostel fee</Text><Text style={styles.sectionHint}>Set by admin</Text></View>
              <View style={styles.feeCard}>
                <View><Text style={styles.feeLabel}>Monthly fee</Text><Text style={styles.feeValue}>{money(profile.monthly_fee)}</Text></View>
                <View style={styles.feeDivider} />
                <View><Text style={styles.feeLabel}>12-month estimate</Text><Text style={styles.feeValue}>{money(profile.annual_fee)}</Text></View>
              </View>

              <TouchableOpacity style={styles.requestButton} onPress={() => setRequestOpen(true)}>
                <LinearGradient colors={['#4F46E5', '#7C3AED']} style={StyleSheet.absoluteFill} />
                <Ionicons name="add-circle-outline" size={22} color="#fff" />
                <View style={{ flex: 1 }}><Text style={styles.requestButtonTitle}>Ask for permission</Text><Text style={styles.requestButtonSub}>Outing, overnight leave, late return or visitor</Text></View>
                <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.7)" />
              </TouchableOpacity>
            </>
          ) : null}

          <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>My permission requests</Text><Text style={styles.sectionHint}>{requests.length}</Text></View>
          {requests.length === 0 ? (
            <View style={styles.empty}><Ionicons name="shield-checkmark-outline" size={34} color="#94A3B8" /><Text style={styles.emptyTitle}>No permission requests</Text><Text style={styles.emptyText}>New requests and admin decisions will appear here.</Text></View>
          ) : requests.map((request) => (
            <View key={request.id} style={styles.requestCard}>
              <View style={styles.requestTop}>
                <View style={styles.requestTypeIcon}><Ionicons name={REQUEST_TYPES.find((item) => item.key === request.request_type)?.icon || 'document-text-outline'} size={18} color="#4F46E5" /></View>
                <View style={{ flex: 1 }}><Text style={styles.requestType}>{TYPE_LABELS[request.request_type] || request.request_type}</Text><Text style={styles.requestDate}>{dateLabel(request.starts_on)} to {dateLabel(request.ends_on)}</Text></View>
                <View style={[styles.statusPill, request.status === 'approved' && styles.approvedPill]}><Text style={[styles.statusText, request.status === 'approved' && styles.approvedText]}>{request.status.toUpperCase()}</Text></View>
              </View>
              <Text style={styles.reason}>{request.reason}</Text>
              {request.admin_note ? <View style={styles.adminNote}><Ionicons name="chatbubble-outline" size={15} color="#4F46E5" /><Text style={styles.adminNoteText}>{request.admin_note}</Text></View> : null}
            </View>
          ))}
        </ScrollView>
      )}

      <Modal visible={requestOpen} transparent animationType="slide" onRequestClose={() => setRequestOpen(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setRequestOpen(false)} />
          <View style={styles.modalCard}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}><View><Text style={styles.modalTitle}>Request hostel permission</Text><Text style={styles.modalSub}>The hostel admin will review this request.</Text></View><Pressable onPress={() => setRequestOpen(false)}><Ionicons name="close" size={24} color={theme.colors.textSecondary} /></Pressable></View>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalBody}>
              <Text style={styles.fieldLabel}>Permission type</Text>
              <View style={styles.typeGrid}>{REQUEST_TYPES.map((item) => <Pressable key={item.key} onPress={() => setRequestType(item.key)} style={[styles.typeChip, requestType === item.key && styles.typeChipActive]}><Ionicons name={item.icon} size={17} color={requestType === item.key ? '#fff' : '#4F46E5'} /><Text style={[styles.typeChipText, requestType === item.key && styles.typeChipTextActive]}>{item.label}</Text></Pressable>)}</View>
              <View style={styles.twoFields}><Field label="Start date" value={startsOn} onChangeText={setStartsOn} placeholder="YYYY-MM-DD" styles={styles} /><Field label="End date" value={endsOn} onChangeText={setEndsOn} placeholder="YYYY-MM-DD" styles={styles} /></View>
              <Field label="Reason" value={reason} onChangeText={setReason} placeholder="Example: Family function in Hyderabad" multiline styles={styles} />
              <Text style={styles.helper}>Give a clear reason. Two useful examples are “medical appointment” and “family wedding.”</Text>
            </ScrollView>
            <View style={styles.modalFooter}><TouchableOpacity style={styles.cancelButton} onPress={() => setRequestOpen(false)}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity><TouchableOpacity disabled={saving} style={[styles.submitButton, saving && { opacity: 0.6 }]} onPress={() => void submitRequest()}><Text style={styles.submitText}>{saving ? 'Sending…' : 'Send request'}</Text></TouchableOpacity></View>
          </View>
        </View>
      </Modal>
    </ScreenLayout>
  );
}

function Detail({ icon, label, value, styles, last }: any) {
  return <View style={[styles.detailRow, last && { borderBottomWidth: 0 }]}><View style={styles.detailIcon}><Ionicons name={icon} size={18} color="#4F46E5" /></View><View style={{ flex: 1 }}><Text style={styles.detailLabel}>{label}</Text><Text style={styles.detailValue}>{value}</Text></View></View>;
}

function Field({ label, styles, ...props }: any) {
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput {...props} placeholderTextColor="#94A3B8" style={[styles.input, props.multiline && styles.textArea]} /></View>;
}

function createStyles(theme: any, isDark: boolean) {
  const card = theme.colors.card;
  const border = theme.colors.border;
  const text = theme.colors.text;
  const secondary = theme.colors.textSecondary;
  return StyleSheet.create({
    content: { padding: 16, paddingBottom: 50, gap: 14, width: '100%', maxWidth: 760, alignSelf: 'center' },
    hero: { borderRadius: 24, padding: 22, overflow: 'hidden' }, heroIcon: { width: 62, height: 62, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
    heroEyebrow: { color: '#C7D2FE', fontSize: 10, fontWeight: '900', letterSpacing: 1.2 }, heroTitle: { color: '#fff', fontSize: 22, fontWeight: '900', marginTop: 5 }, heroText: { color: 'rgba(255,255,255,0.72)', fontSize: 12, lineHeight: 18, marginTop: 6 },
    heroStatus: { flexDirection: 'row', gap: 7, alignItems: 'center', alignSelf: 'flex-start', marginTop: 16, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: 'rgba(255,255,255,0.12)' }, statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#34D399' }, heroStatusText: { color: '#fff', fontSize: 9, fontWeight: '900', letterSpacing: 0.7 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 5 }, sectionTitle: { color: text, fontSize: 17, fontWeight: '900' }, sectionHint: { color: secondary, fontSize: 10, fontWeight: '700' },
    detailsCard: { backgroundColor: card, borderRadius: 18, borderWidth: 1, borderColor: border, overflow: 'hidden' }, detailRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15, borderBottomWidth: 1, borderBottomColor: border }, detailIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: isDark ? 'rgba(79,70,229,0.14)' : '#EEF2FF', alignItems: 'center', justifyContent: 'center' }, detailLabel: { color: secondary, fontSize: 10, fontWeight: '700' }, detailValue: { color: text, fontSize: 13, fontWeight: '800', marginTop: 2 },
    feeCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: card, borderRadius: 18, borderWidth: 1, borderColor: border, padding: 18, justifyContent: 'space-around' }, feeLabel: { color: secondary, fontSize: 10, fontWeight: '700', textAlign: 'center' }, feeValue: { color: text, fontSize: 18, fontWeight: '900', marginTop: 5, textAlign: 'center' }, feeDivider: { width: 1, height: 42, backgroundColor: border },
    requestButton: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, padding: 17, overflow: 'hidden' }, requestButtonTitle: { color: '#fff', fontSize: 14, fontWeight: '900' }, requestButtonSub: { color: 'rgba(255,255,255,0.72)', fontSize: 10, marginTop: 3 },
    empty: { backgroundColor: card, borderRadius: 18, borderWidth: 1, borderColor: border, padding: 32, alignItems: 'center' }, emptyTitle: { color: text, fontSize: 14, fontWeight: '800', marginTop: 9 }, emptyText: { color: secondary, fontSize: 11, marginTop: 4, textAlign: 'center' },
    requestCard: { backgroundColor: card, borderRadius: 17, borderWidth: 1, borderColor: border, padding: 15, gap: 9 }, requestTop: { flexDirection: 'row', alignItems: 'center', gap: 10 }, requestTypeIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: isDark ? 'rgba(79,70,229,0.14)' : '#EEF2FF', alignItems: 'center', justifyContent: 'center' }, requestType: { color: text, fontWeight: '800', fontSize: 13 }, requestDate: { color: secondary, fontSize: 10, marginTop: 3 },
    statusPill: { backgroundColor: '#FEF3C7', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5 }, approvedPill: { backgroundColor: '#D1FAE5' }, statusText: { color: '#B45309', fontSize: 9, fontWeight: '900' }, approvedText: { color: '#047857' }, reason: { color: text, fontSize: 12, lineHeight: 18 }, adminNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, padding: 10, backgroundColor: isDark ? 'rgba(79,70,229,0.10)' : '#EEF2FF', borderRadius: 10 }, adminNoteText: { color: text, flex: 1, fontSize: 11, lineHeight: 16 },
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.62)', justifyContent: 'flex-end' }, modalCard: { maxHeight: '90%', backgroundColor: card, borderTopLeftRadius: 26, borderTopRightRadius: 26, overflow: 'hidden' }, modalHandle: { width: 42, height: 4, borderRadius: 2, backgroundColor: border, alignSelf: 'center', marginTop: 9 }, modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 18, borderBottomWidth: 1, borderBottomColor: border }, modalTitle: { color: text, fontSize: 18, fontWeight: '900' }, modalSub: { color: secondary, fontSize: 10, marginTop: 3 }, modalBody: { padding: 18, gap: 14, width: '100%', maxWidth: 760, alignSelf: 'center' },
    fieldLabel: { color: text, fontSize: 11, fontWeight: '800' }, typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, typeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 11, borderWidth: 1, borderColor: border, paddingHorizontal: 11, paddingVertical: 9 }, typeChipActive: { backgroundColor: '#4F46E5', borderColor: '#4F46E5' }, typeChipText: { color: text, fontSize: 10, fontWeight: '700' }, typeChipTextActive: { color: '#fff' },
    twoFields: { flexDirection: 'row', gap: 10 }, field: { flex: 1, gap: 6 }, input: { color: text, backgroundColor: theme.colors.background, borderWidth: 1, borderColor: border, borderRadius: 11, paddingHorizontal: 12, paddingVertical: 11 }, textArea: { minHeight: 90, textAlignVertical: 'top' }, helper: { color: secondary, fontSize: 10, lineHeight: 15 },
    modalFooter: { flexDirection: 'row', justifyContent: 'flex-end', gap: 9, padding: 16, borderTopWidth: 1, borderTopColor: border }, cancelButton: { paddingHorizontal: 16, paddingVertical: 11, borderRadius: 11, backgroundColor: theme.colors.background }, cancelText: { color: secondary, fontWeight: '800' }, submitButton: { paddingHorizontal: 18, paddingVertical: 11, borderRadius: 11, backgroundColor: '#4F46E5' }, submitText: { color: '#fff', fontWeight: '900' },
  });
}
