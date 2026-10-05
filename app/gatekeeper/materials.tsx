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
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from '@/src/utils/haptics';
import { useTheme } from '@/src/hooks/useTheme';
import { visitorService, type SchoolGate } from '@/src/services/visitorService';

export default function GatekeeperMaterialsScreen() {
  const router = useRouter();
  const { isDark } = useTheme();

  const [currentGate, setCurrentGate] = useState<SchoolGate | null>(null);
  const [passes, setPasses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form Fields
  const [movementType, setMovementType] = useState<'INWARD' | 'OUTWARD'>('INWARD');
  const [passType, setPassType] = useState<'RETURNABLE' | 'NON_RETURNABLE'>('NON_RETURNABLE');
  const [vendorName, setVendorName] = useState('');
  const [carrierName, setCarrierName] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [itemsSummary, setItemsSummary] = useState('');
  const [notes, setNotes] = useState('');

  const loadMaterialPasses = useCallback(async () => {
    try {
      const [list, gateData] = await Promise.all([
        visitorService.getMaterialPasses(),
        visitorService.getMyGate().catch(() => null),
      ]);
      setPasses(list);
      if (gateData?.currentGate) setCurrentGate(gateData.currentGate);
    } catch (e) {
      console.warn('Failed to load material passes:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadMaterialPasses();
  }, [loadMaterialPasses]);

  const onRefresh = () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    loadMaterialPasses();
  };

  const handleCreatePass = async () => {
    if (!vendorName.trim() || !itemsSummary.trim()) {
      Alert.alert('Missing Info', 'Please enter vendor/company name and item description.');
      return;
    }

    try {
      setSubmitting(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const res = await visitorService.logMaterialPass({
        gateId: currentGate?.id,
        movementType,
        passType,
        vendorName: vendorName.trim(),
        carrierName: carrierName.trim() || undefined,
        vehicleNumber: vehicleNumber.trim() || undefined,
        items: [{ item_description: itemsSummary.trim(), quantity: 1 }],
        notes: notes.trim() || undefined,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPasses((prev) => [res.pass, ...prev]);
      setModalVisible(false);
      setVendorName('');
      setCarrierName('');
      setVehicleNumber('');
      setItemsSummary('');
      setNotes('');
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not log material pass.');
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
      <TourTarget id="screen.gatekeeper-materials.overview" native><View style={[styles.header, { borderBottomColor: borderColor }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={textColor} />
        </TouchableOpacity>
        <View style={styles.headerTitleCol}>
          <Text style={[styles.headerTitle, { color: textColor }]}>Material Gate Passes</Text>
          <Text style={[styles.headerSub, { color: subColor }]}>Inward & Outward Goods Tracking</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => setModalVisible(true)}>
          <Ionicons name="add" size={22} color="#FFFFFF" />
        </TouchableOpacity>
      </View></TourTarget>

      <TourTarget id="screen.gatekeeper-materials.workspace" native><FlatList
        data={passes}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10B981" />
        }
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Ionicons name="swap-horizontal-outline" size={54} color={subColor} />
            <Text style={[styles.emptyTitle, { color: textColor }]}>No Material Passes Logged</Text>
            <Text style={[styles.emptySub, { color: subColor }]}>
              Issue and record gate passes for furniture, IT equipment, lab supplies, and maintenance gear.
            </Text>
            <TouchableOpacity style={styles.createFirstBtn} onPress={() => setModalVisible(true)}>
              <Text style={styles.createFirstBtnText}>+ New Material Pass</Text>
            </TouchableOpacity>
          </View>
        }
        renderItem={({ item }) => {
          const isInward = item.movement_type === 'INWARD';
          const isReturnable = item.pass_type === 'RETURNABLE';

          return (
            <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
              <View style={styles.cardHeader}>
                <View
                  style={[
                    styles.directionBadge,
                    { backgroundColor: isInward ? 'rgba(16,185,129,0.15)' : 'rgba(59,130,246,0.15)' },
                  ]}
                >
                  <Ionicons
                    name={isInward ? 'arrow-down-circle' : 'arrow-up-circle'}
                    size={14}
                    color={isInward ? '#10B981' : '#3B82F6'}
                  />
                  <Text
                    style={[
                      styles.directionText,
                      { color: isInward ? '#10B981' : '#3B82F6' },
                    ]}
                  >
                    {item.movement_type}
                  </Text>
                </View>

                <View style={[styles.passTypeBadge, { borderColor }]}>
                  <Text style={[styles.passTypeText, { color: subColor }]}>
                    {isReturnable ? 'RETURNABLE' : 'NON-RETURNABLE'}
                  </Text>
                </View>
              </View>

              <Text style={[styles.passCodeTitle, { color: textColor }]}>
                {item.pass_number || `GP-${item.id.slice(0, 8).toUpperCase()}`}
              </Text>

              <Text style={[styles.vendorText, { color: textColor }]}>
                Vendor / Transporter: <Text style={styles.bold}>{item.vendor_name}</Text>
              </Text>

              {item.carrier_name || item.vehicle_number ? (
                <Text style={[styles.metaRowText, { color: subColor }]}>
                  Carrier: {item.carrier_name || 'Direct'} • Vehicle: {item.vehicle_number || 'N/A'}
                </Text>
              ) : null}

              <View style={[styles.itemsBox, { backgroundColor: 'rgba(150,150,150,0.06)' }]}>
                <Ionicons name="document-text-outline" size={16} color={subColor} />
                <Text style={[styles.itemsText, { color: textColor }]}>
                  {item.items && item.items.length > 0
                    ? item.items.map((i: any) => `${i.item_description} (x${i.quantity})`).join(', ')
                    : item.notes || 'Goods recorded at gate'}
                </Text>
              </View>

              <View style={styles.cardFooter}>
                <Text style={[styles.timeText, { color: subColor }]}>
                  Logged: {new Date(item.created_at).toLocaleDateString()} at{' '}
                  {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
            </View>
          );
        }}
      /></TourTarget>

      {/* New Pass Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <SafeAreaView style={[styles.modalSheet, { backgroundColor: cardBg }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: textColor }]}>New Material Gate Pass</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={subColor} />
              </TouchableOpacity>
            </View>

            <TourScrollView contentContainerStyle={styles.modalScroll}>
              {/* Movement Type Toggle */}
              <Text style={[styles.label, { color: subColor }]}>MOVEMENT DIRECTION</Text>
              <View style={styles.toggleRow}>
                <TouchableOpacity
                  style={[
                    styles.toggleBtn,
                    movementType === 'INWARD' && { backgroundColor: '#10B981', borderColor: '#10B981' },
                  ]}
                  onPress={() => setMovementType('INWARD')}
                >
                  <Text style={[styles.toggleText, { color: movementType === 'INWARD' ? '#FFFFFF' : textColor }]}>
                    INWARD (Campus Entry)
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.toggleBtn,
                    movementType === 'OUTWARD' && { backgroundColor: '#3B82F6', borderColor: '#3B82F6' },
                  ]}
                  onPress={() => setMovementType('OUTWARD')}
                >
                  <Text style={[styles.toggleText, { color: movementType === 'OUTWARD' ? '#FFFFFF' : textColor }]}>
                    OUTWARD (Campus Exit)
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Pass Type */}
              <Text style={[styles.label, { color: subColor }]}>RETURN STATUS</Text>
              <View style={styles.toggleRow}>
                <TouchableOpacity
                  style={[
                    styles.toggleBtn,
                    passType === 'NON_RETURNABLE' && { backgroundColor: '#8B5CF6', borderColor: '#8B5CF6' },
                  ]}
                  onPress={() => setPassType('NON_RETURNABLE')}
                >
                  <Text style={[styles.toggleText, { color: passType === 'NON_RETURNABLE' ? '#FFFFFF' : textColor }]}>
                    Non-Returnable
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.toggleBtn,
                    passType === 'RETURNABLE' && { backgroundColor: '#8B5CF6', borderColor: '#8B5CF6' },
                  ]}
                  onPress={() => setPassType('RETURNABLE')}
                >
                  <Text style={[styles.toggleText, { color: passType === 'RETURNABLE' ? '#FFFFFF' : textColor }]}>
                    Returnable Pass
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={[styles.label, { color: subColor }]}>VENDOR / SUPPLIER / DEPARTMENT *</Text>
              <TextInput
                style={[styles.input, { color: textColor, borderColor }]}
                placeholder="e.g. Apex Lab Supplies Ltd"
                placeholderTextColor={subColor}
                value={vendorName}
                onChangeText={setVendorName}
              />

              <View style={styles.twoColRow}>
                <View style={styles.flex1}>
                  <Text style={[styles.label, { color: subColor }]}>CARRIER / DRIVER</Text>
                  <TextInput
                    style={[styles.input, { color: textColor, borderColor }]}
                    placeholder="e.g. Somesh"
                    placeholderTextColor={subColor}
                    value={carrierName}
                    onChangeText={setCarrierName}
                  />
                </View>
                <View style={styles.colSpacer} />
                <View style={styles.flex1}>
                  <Text style={[styles.label, { color: subColor }]}>VEHICLE NO.</Text>
                  <TextInput
                    style={[styles.input, { color: textColor, borderColor }]}
                    placeholder="KA-01-M-9021"
                    placeholderTextColor={subColor}
                    autoCapitalize="characters"
                    value={vehicleNumber}
                    onChangeText={setVehicleNumber}
                  />
                </View>
              </View>

              <Text style={[styles.label, { color: subColor }]}>MATERIALS / ITEMS DESCRIPTION *</Text>
              <TextInput
                style={[styles.textArea, { color: textColor, borderColor }]}
                placeholder="e.g. 10 wooden teacher desks, 2 science lab microscopes"
                placeholderTextColor={subColor}
                multiline
                value={itemsSummary}
                onChangeText={setItemsSummary}
              />

              <TouchableOpacity
                style={styles.saveBtn}
                onPress={handleCreatePass}
                disabled={submitting}
              >
                <LinearGradient
                  colors={['#7C3AED', '#8B5CF6']}
                  style={styles.saveGradient}
                >
                  {submitting ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.saveBtnText}>Issue Material Gate Pass</Text>
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
    backgroundColor: '#8B5CF6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: { padding: 16, paddingBottom: 40 },
  card: {
    borderRadius: 16,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 12,
    gap: 6,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  directionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  directionText: { fontSize: 11, fontWeight: '800' },
  passTypeBadge: {
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  passTypeText: { fontSize: 10, fontWeight: '700' },
  passCodeTitle: { fontSize: 16, fontWeight: '900', letterSpacing: 0.5 },
  vendorText: { fontSize: 14 },
  bold: { fontWeight: '700' },
  metaRowText: { fontSize: 12 },
  itemsBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 10,
    marginVertical: 4,
  },
  itemsText: { fontSize: 13, flex: 1 },
  cardFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(150,150,150,0.2)',
    paddingTop: 8,
    marginTop: 4,
  },
  timeText: { fontSize: 11 },
  emptyWrap: { alignItems: 'center', paddingVertical: 60 },
  emptyTitle: { fontSize: 17, fontWeight: '800', marginTop: 14 },
  emptySub: { fontSize: 13, textAlign: 'center', marginTop: 6, maxWidth: 260 },
  createFirstBtn: {
    backgroundColor: '#8B5CF6',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 18,
  },
  createFirstBtnText: { color: '#FFFFFF', fontWeight: '800' },
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
  label: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5, marginTop: 12, marginBottom: 6 },
  toggleRow: { flexDirection: 'row', gap: 8 },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  toggleText: { fontSize: 12, fontWeight: '700' },
  input: {
    height: 44,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  twoColRow: { flexDirection: 'row', alignItems: 'center' },
  flex1: { flex: 1 },
  colSpacer: { width: 10 },
  textArea: {
    height: 70,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingTop: 8,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  saveBtn: { marginTop: 24, borderRadius: 12, overflow: 'hidden' },
  saveGradient: { alignItems: 'center', justifyContent: 'center', paddingVertical: 14 },
  saveBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
});
