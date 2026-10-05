import { TourTarget, TourScrollView } from '@/src/features/app-tour';
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  Alert,
  RefreshControl,
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

const COURIERS = ['Amazon', 'Flipkart', 'BlueDart', 'Delhivery', 'DTDC', 'Swiggy', 'Zomato', 'Speed Post', 'Other'];

export default function GatekeeperDeliveriesScreen() {
  const router = useRouter();
  const { isDark } = useTheme();

  const [currentGate, setCurrentGate] = useState<SchoolGate | null>(null);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // New Delivery Form
  const [courierName, setCourierName] = useState('Amazon');
  const [recipientName, setRecipientName] = useState('');
  const [recipientMobile, setRecipientMobile] = useState('');
  const [packageCount, setPackageCount] = useState('1');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  const loadDeliveries = useCallback(async () => {
    try {
      const [list, gateData] = await Promise.all([
        visitorService.getDeliveries(),
        visitorService.getMyGate().catch(() => null),
      ]);
      setDeliveries(list);
      if (gateData?.currentGate) setCurrentGate(gateData.currentGate);
    } catch (e) {
      console.warn('Failed to load deliveries:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDeliveries();
  }, [loadDeliveries]);

  const onRefresh = () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    loadDeliveries();
  };

  const takePackagePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Needed', 'Camera permission is required.');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({
      quality: 0.6,
      allowsEditing: true,
      aspect: [4, 3],
    });
    if (!res.canceled && res.assets && res.assets[0]) {
      setPhotoUri(res.assets[0].uri);
    }
  };

  const handleLogDelivery = async () => {
    if (!recipientName.trim()) {
      Alert.alert('Missing Field', 'Please enter recipient name.');
      return;
    }

    try {
      setSubmitting(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const res = await visitorService.logDelivery({
        gateId: currentGate?.id,
        courierCompany: courierName,
        recipientName: recipientName.trim(),
        recipientMobile: recipientMobile.trim() || undefined,
        packageCount: parseInt(packageCount, 10) || 1,
        trackingNumber: trackingNumber.trim() || undefined,
        packagePhotoUrl: photoUri || undefined,
        notes: notes.trim() || undefined,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setDeliveries((prev) => [res.delivery, ...prev]);
      setModalVisible(false);
      setRecipientName('');
      setRecipientMobile('');
      setTrackingNumber('');
      setPhotoUri(null);
      setNotes('');
    } catch (err: any) {
      Alert.alert('Log Failed', err?.message || 'Could not log delivery.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkCollected = (item: any) => {
    Alert.prompt
      ? Alert.prompt('Handover Package', 'Enter name of person collecting package:', async (collector) => {
          if (collector) {
            await visitorService.collectDelivery(item.id, collector);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            loadDeliveries();
          }
        })
      : Alert.alert('Handover Package', 'Confirm package handover to recipient?', [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Confirm Handover',
            onPress: async () => {
              await visitorService.collectDelivery(item.id, 'Recipient');
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              loadDeliveries();
            },
          },
        ]);
  };

  const bgColor = isDark ? '#0B0F17' : '#F4F6F9';
  const cardBg = isDark ? '#161E2E' : '#FFFFFF';
  const textColor = isDark ? '#F1F5F9' : '#0F172A';
  const subColor = isDark ? '#94A3B8' : '#64748B';
  const borderColor = isDark ? '#26334A' : '#E2E8F0';

  const pendingCount = deliveries.filter((d) => d.status === 'HELD_AT_GATE').length;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: bgColor }]}>
      {/* Header */}
      <TourTarget id="screen.gatekeeper-deliveries.overview" native><View style={[styles.header, { borderBottomColor: borderColor }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={textColor} />
        </TouchableOpacity>
        <View style={styles.headerTitleCol}>
          <Text style={[styles.headerTitle, { color: textColor }]}>Gate Deliveries</Text>
          <Text style={[styles.headerSub, { color: subColor }]}>
            {pendingCount} waiting at gate • {deliveries.length} total today
          </Text>
        </View>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => setModalVisible(true)}
        >
          <Ionicons name="add" size={22} color="#FFFFFF" />
        </TouchableOpacity>
      </View></TourTarget>

      <TourTarget id="screen.gatekeeper-deliveries.workspace" native><FlatList
        data={deliveries}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10B981" />
        }
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Ionicons name="cube-outline" size={54} color={subColor} />
            <Text style={[styles.emptyTitle, { color: textColor }]}>No Packages at Gate</Text>
            <Text style={[styles.emptySub, { color: subColor }]}>
              Log courier packages, parcels, and deliveries for teachers and students.
            </Text>
            <TouchableOpacity
              style={styles.logFirstBtn}
              onPress={() => setModalVisible(true)}
            >
              <Text style={styles.logFirstBtnText}>+ Log First Delivery</Text>
            </TouchableOpacity>
          </View>
        }
        renderItem={({ item }) => {
          const isHeld = item.status === 'HELD_AT_GATE';

          return (
            <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
              <View style={styles.cardHeader}>
                <View style={styles.courierTag}>
                  <Ionicons name="cube" size={14} color="#F59E0B" />
                  <Text style={styles.courierText}>{item.courier_company || 'Courier'}</Text>
                </View>
                <View
                  style={[
                    styles.statusPill,
                    {
                      backgroundColor: isHeld
                        ? 'rgba(245,158,11,0.15)'
                        : 'rgba(16,185,129,0.15)',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusPillText,
                      { color: isHeld ? '#F59E0B' : '#10B981' },
                    ]}
                  >
                    {isHeld ? 'HELD AT GATE' : 'COLLECTED'}
                  </Text>
                </View>
              </View>

              <View style={styles.bodyRow}>
                {item.package_photo_url ? (
                  <Image source={{ uri: item.package_photo_url }} style={styles.packageThumb} />
                ) : null}
                <View style={styles.detailsCol}>
                  <Text style={[styles.recipientName, { color: textColor }]}>
                    To: {item.recipient_name}
                  </Text>
                  {item.recipient_mobile ? (
                    <Text style={[styles.recipientMobile, { color: subColor }]}>
                      Phone: {item.recipient_mobile}
                    </Text>
                  ) : null}
                  {item.tracking_number ? (
                    <Text style={[styles.trackingText, { color: subColor }]}>
                      Tracking: {item.tracking_number}
                    </Text>
                  ) : null}
                  <Text style={[styles.timeText, { color: subColor }]}>
                    Arrived: {new Date(item.arrived_at || item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {item.package_count || 1} pkg
                  </Text>
                </View>
              </View>

              {isHeld ? (
                <TouchableOpacity
                  style={styles.collectBtn}
                  onPress={() => handleMarkCollected(item)}
                >
                  <Ionicons name="hand-right-outline" size={16} color="#FFFFFF" />
                  <Text style={styles.collectBtnText}>Hand Over / Mark Collected</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.collectedByBox}>
                  <Ionicons name="checkmark-circle" size={14} color="#10B981" />
                  <Text style={[styles.collectedByText, { color: subColor }]}>
                    Collected by {item.collected_by_name || 'Recipient'} at{' '}
                    {item.collected_at ? new Date(item.collected_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Gate'}
                  </Text>
                </View>
              )}
            </View>
          );
        }}
      /></TourTarget>

      {/* Log Delivery Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <SafeAreaView style={[styles.modalSheet, { backgroundColor: cardBg }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: textColor }]}>Log Courier Delivery</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={subColor} />
              </TouchableOpacity>
            </View>

            <TourScrollView contentContainerStyle={styles.modalScroll}>
              {/* Courier Company */}
              <Text style={[styles.formLabel, { color: subColor }]}>COURIER / COMPANY</Text>
              <TourScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.courierRow}>
                {COURIERS.map((c) => {
                  const isSelected = courierName === c;
                  return (
                    <TouchableOpacity
                      key={c}
                      style={[
                        styles.courierChip,
                        {
                          backgroundColor: isSelected ? '#F59E0B' : 'transparent',
                          borderColor: isSelected ? '#F59E0B' : borderColor,
                        },
                      ]}
                      onPress={() => setCourierName(c)}
                    >
                      <Text
                        style={[
                          styles.courierChipText,
                          { color: isSelected ? '#FFFFFF' : textColor },
                        ]}
                      >
                        {c}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </TourScrollView>

              <Text style={[styles.formLabel, { color: subColor }]}>RECIPIENT NAME *</Text>
              <TextInput
                style={[styles.input, { color: textColor, borderColor }]}
                placeholder="e.g. Teacher Priya / Student Rahul"
                placeholderTextColor={subColor}
                value={recipientName}
                onChangeText={setRecipientName}
              />

              <View style={styles.twoColRow}>
                <View style={styles.flex1}>
                  <Text style={[styles.formLabel, { color: subColor }]}>PHONE NUMBER</Text>
                  <TextInput
                    style={[styles.input, { color: textColor, borderColor }]}
                    placeholder="e.g. 9876543210"
                    placeholderTextColor={subColor}
                    keyboardType="phone-pad"
                    value={recipientMobile}
                    onChangeText={setRecipientMobile}
                  />
                </View>
                <View style={styles.spacer} />
                <View style={{ width: 80 }}>
                  <Text style={[styles.formLabel, { color: subColor }]}>COUNT</Text>
                  <TextInput
                    style={[styles.input, { color: textColor, borderColor, textAlign: 'center' }]}
                    keyboardType="numeric"
                    value={packageCount}
                    onChangeText={setPackageCount}
                  />
                </View>
              </View>

              <Text style={[styles.formLabel, { color: subColor }]}>TRACKING / WAYBILL NO.</Text>
              <TextInput
                style={[styles.input, { color: textColor, borderColor }]}
                placeholder="e.g. AWB-982187391"
                placeholderTextColor={subColor}
                value={trackingNumber}
                onChangeText={setTrackingNumber}
              />

              {/* Photo snap */}
              <TouchableOpacity style={styles.snapBox} onPress={takePackagePhoto}>
                {photoUri ? (
                  <Image source={{ uri: photoUri }} style={styles.snapImg} />
                ) : (
                  <View style={styles.snapPlaceholder}>
                    <Ionicons name="camera-outline" size={24} color="#F59E0B" />
                    <Text style={styles.snapText}>Snap Package / Label Photo</Text>
                  </View>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.saveBtn}
                onPress={handleLogDelivery}
                disabled={submitting}
              >
                <LinearGradient
                  colors={['#D97706', '#F59E0B']}
                  style={styles.saveGradient}
                >
                  {submitting ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.saveBtnText}>Log Delivery at Gate</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </TourScrollView>
          </SafeAreaView>
        </View>
      </Modal>
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
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: { padding: 16, paddingBottom: 40 },
  card: {
    borderRadius: 16,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  courierTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(245,158,11,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  courierText: { color: '#F59E0B', fontSize: 12, fontWeight: '800' },
  statusPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  statusPillText: { fontSize: 10, fontWeight: '800' },
  bodyRow: { flexDirection: 'row', gap: 12 },
  packageThumb: { width: 56, height: 56, borderRadius: 8 },
  detailsCol: { flex: 1, gap: 2 },
  recipientName: { fontSize: 15, fontWeight: '800' },
  recipientMobile: { fontSize: 12 },
  trackingText: { fontSize: 11 },
  timeText: { fontSize: 11, marginTop: 4 },
  collectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#10B981',
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 12,
  },
  collectBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  collectedByBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(150,150,150,0.2)',
  },
  collectedByText: { fontSize: 11 },
  emptyWrap: { alignItems: 'center', paddingVertical: 60 },
  emptyTitle: { fontSize: 17, fontWeight: '800', marginTop: 14 },
  emptySub: { fontSize: 13, textAlign: 'center', marginTop: 6, maxWidth: 260 },
  logFirstBtn: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 18,
  },
  logFirstBtnText: { color: '#FFFFFF', fontWeight: '800' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%' },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: { fontSize: 17, fontWeight: '800' },
  modalScroll: { padding: 20 },
  formLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5, marginTop: 12, marginBottom: 4 },
  courierRow: { flexDirection: 'row', marginVertical: 4 },
  courierChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
    borderWidth: 1,
    marginRight: 6,
  },
  courierChipText: { fontSize: 12, fontWeight: '700' },
  input: {
    height: 44,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  twoColRow: { flexDirection: 'row', alignItems: 'center' },
  flex1: { flex: 1 },
  spacer: { width: 10 },
  snapBox: {
    height: 90,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F59E0B',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
    overflow: 'hidden',
  },
  snapImg: { width: '100%', height: '100%' },
  snapPlaceholder: { alignItems: 'center', gap: 4 },
  snapText: { color: '#F59E0B', fontSize: 11, fontWeight: '700' },
  saveBtn: { marginTop: 20, borderRadius: 12, overflow: 'hidden' },
  saveGradient: { alignItems: 'center', justifyContent: 'center', paddingVertical: 14 },
  saveBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
});
