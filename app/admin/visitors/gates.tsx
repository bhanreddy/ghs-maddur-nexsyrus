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
  Switch,
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

const GATE_TYPES = ['MAIN', 'PEDESTRIAN', 'VEHICLE', 'SERVICE', 'BUS_BAY'];

export default function AdminGatesManagementScreen() {
  const router = useRouter();
  const { isDark } = useTheme();

  const [gates, setGates] = useState<SchoolGate[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form Fields
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [gateType, setGateType] = useState('MAIN');
  const [allowVisitors, setAllowVisitors] = useState(true);
  const [allowStudents, setAllowStudents] = useState(true);
  const [allowDeliveries, setAllowDeliveries] = useState(true);
  const [allowVehicles, setAllowVehicles] = useState(true);

  const loadGates = useCallback(async () => {
    try {
      const list = await visitorService.getGates();
      setGates(list);
    } catch (e) {
      console.warn('Failed to load gates:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadGates();
  }, [loadGates]);

  const onRefresh = () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    loadGates();
  };

  const handleCreateGate = async () => {
    if (!name.trim() || !code.trim()) {
      Alert.alert('Missing Fields', 'Please enter gate name and code.');
      return;
    }

    try {
      setSubmitting(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const res = await visitorService.createGate({
        name: name.trim(),
        code: code.trim().toUpperCase(),
        description: description.trim() || undefined,
        gate_type: gateType,
        allow_visitors: allowVisitors,
        allow_students: allowStudents,
        allow_deliveries: allowDeliveries,
        allow_vehicles: allowVehicles,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setGates((prev) => [...prev, res.gate]);
      setModalVisible(false);
      setName('');
      setCode('');
      setDescription('');
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not create gate.');
    } finally {
      setSubmitting(false);
    }
  };

  const bgColor = isDark ? '#0B0F17' : '#F8FAFC';
  const cardBg = isDark ? '#161E2E' : '#FFFFFF';
  const textColor = isDark ? '#F1F5F9' : '#0F172A';
  const subColor = isDark ? '#94A3B8' : '#64748B';
  const borderColor = isDark ? '#26334A' : '#E2E8F0';

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: bgColor }]}>
      {/* Header */}
      <TourTarget id="screen.admin-visitors-gates.overview" native><View style={[styles.header, { borderBottomColor: borderColor }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={textColor} />
        </TouchableOpacity>
        <View style={styles.titleCol}>
          <Text style={[styles.title, { color: textColor }]}>School Gates</Text>
          <Text style={[styles.subTitle, { color: subColor }]}>Perimeter Ingress & Egress Control</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => setModalVisible(true)}>
          <Ionicons name="add" size={22} color="#FFFFFF" />
        </TouchableOpacity>
      </View></TourTarget>

      <TourTarget id="screen.admin-visitors-gates.workspace" native><FlatList
        data={gates}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10B981" />
        }
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Ionicons name="git-network-outline" size={54} color={subColor} />
            <Text style={[styles.emptyTitle, { color: textColor }]}>No Gates Configured</Text>
            <Text style={[styles.emptySub, { color: subColor }]}>
              Define entry points, security gates, and perimeter barriers.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          return (
            <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
              <View style={styles.cardHeader}>
                <View style={styles.nameRow}>
                  <Text style={[styles.gateName, { color: textColor }]}>{item.name}</Text>
                  <View style={styles.codePill}>
                    <Text style={styles.codePillText}>{item.code}</Text>
                  </View>
                </View>
                <View style={styles.typeBadge}>
                  <Text style={styles.typeBadgeText}>{item.gate_type}</Text>
                </View>
              </View>

              {item.description ? (
                <Text style={[styles.descText, { color: subColor }]}>{item.description}</Text>
              ) : null}

              <View style={styles.capabilitiesRow}>
                {item.allow_visitors && (
                  <View style={styles.capPill}>
                    <Ionicons name="people" size={12} color="#10B981" />
                    <Text style={styles.capText}>Visitors</Text>
                  </View>
                )}
                {item.allow_students && (
                  <View style={styles.capPill}>
                    <Ionicons name="school" size={12} color="#6366F1" />
                    <Text style={styles.capText}>Students</Text>
                  </View>
                )}
                {item.allow_deliveries && (
                  <View style={styles.capPill}>
                    <Ionicons name="cube" size={12} color="#F59E0B" />
                    <Text style={styles.capText}>Deliveries</Text>
                  </View>
                )}
                {item.allow_vehicles && (
                  <View style={styles.capPill}>
                    <Ionicons name="car" size={12} color="#0EA5E9" />
                    <Text style={styles.capText}>Vehicles</Text>
                  </View>
                )}
              </View>
            </View>
          );
        }}
      /></TourTarget>

      {/* Add Gate Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <SafeAreaView style={[styles.modalSheet, { backgroundColor: cardBg }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: textColor }]}>Configure New Gate</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={subColor} />
              </TouchableOpacity>
            </View>

            <TourScrollView contentContainerStyle={styles.modalScroll}>
              <Text style={[styles.label, { color: subColor }]}>GATE NAME *</Text>
              <TextInput
                style={[styles.input, { color: textColor, borderColor }]}
                placeholder="e.g. North Gate / Main Entrance"
                placeholderTextColor={subColor}
                value={name}
                onChangeText={setName}
              />

              <Text style={[styles.label, { color: subColor }]}>GATE CODE *</Text>
              <TextInput
                style={[styles.input, { color: textColor, borderColor }]}
                placeholder="e.g. GATE-1"
                placeholderTextColor={subColor}
                autoCapitalize="characters"
                value={code}
                onChangeText={setCode}
              />

              <Text style={[styles.label, { color: subColor }]}>GATE TYPE</Text>
              <TourScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeRow}>
                {GATE_TYPES.map((t) => {
                  const isSelected = gateType === t;
                  return (
                    <TouchableOpacity
                      key={t}
                      style={[
                        styles.typeChip,
                        {
                          backgroundColor: isSelected ? '#10B981' : 'transparent',
                          borderColor: isSelected ? '#10B981' : borderColor,
                        },
                      ]}
                      onPress={() => setGateType(t)}
                    >
                      <Text style={[styles.typeText, { color: isSelected ? '#FFFFFF' : textColor }]}>
                        {t}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </TourScrollView>

              <Text style={[styles.label, { color: subColor }]}>PERMITTED TRAFFIC</Text>
              <View style={styles.switchRow}>
                <Text style={[styles.switchLabel, { color: textColor }]}>Allow Visitors</Text>
                <Switch value={allowVisitors} onValueChange={setAllowVisitors} trackColor={{ true: '#10B981' }} />
              </View>
              <View style={styles.switchRow}>
                <Text style={[styles.switchLabel, { color: textColor }]}>Allow Students</Text>
                <Switch value={allowStudents} onValueChange={setAllowStudents} trackColor={{ true: '#10B981' }} />
              </View>
              <View style={styles.switchRow}>
                <Text style={[styles.switchLabel, { color: textColor }]}>Allow Deliveries</Text>
                <Switch value={allowDeliveries} onValueChange={setAllowDeliveries} trackColor={{ true: '#10B981' }} />
              </View>
              <View style={styles.switchRow}>
                <Text style={[styles.switchLabel, { color: textColor }]}>Allow Vehicles</Text>
                <Switch value={allowVehicles} onValueChange={setAllowVehicles} trackColor={{ true: '#10B981' }} />
              </View>

              <TouchableOpacity
                style={styles.saveBtn}
                onPress={handleCreateGate}
                disabled={submitting}
              >
                <LinearGradient
                  colors={['#059669', '#10B981']}
                  style={styles.saveGradient}
                >
                  {submitting ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.saveBtnText}>Save Gate Configuration</Text>
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
  titleCol: { flex: 1, marginLeft: 10 },
  title: { fontSize: 18, fontWeight: '800' },
  subTitle: { fontSize: 12 },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: { padding: 16, paddingBottom: 40 },
  card: {
    borderRadius: 16,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 12,
    gap: 8,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  gateName: { fontSize: 16, fontWeight: '800' },
  codePill: {
    backgroundColor: 'rgba(16,185,129,0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  codePillText: { color: '#10B981', fontSize: 10, fontWeight: '800' },
  typeBadge: {
    backgroundColor: 'rgba(150,150,150,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  typeBadgeText: { fontSize: 10, fontWeight: '700' },
  descText: { fontSize: 12 },
  capabilitiesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  capPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(150,150,150,0.08)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  capText: { fontSize: 11, fontWeight: '600' },
  emptyWrap: { alignItems: 'center', paddingVertical: 60 },
  emptyTitle: { fontSize: 17, fontWeight: '800', marginTop: 14 },
  emptySub: { fontSize: 13, textAlign: 'center', marginTop: 6 },
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
  label: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5, marginTop: 12, marginBottom: 4 },
  input: {
    height: 44,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  typeRow: { flexDirection: 'row', marginVertical: 4 },
  typeChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 14,
    borderWidth: 1,
    marginRight: 6,
  },
  typeText: { fontSize: 12, fontWeight: '700' },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  switchLabel: { fontSize: 14, fontWeight: '600' },
  saveBtn: { marginTop: 24, borderRadius: 12, overflow: 'hidden' },
  saveGradient: { alignItems: 'center', justifyContent: 'center', paddingVertical: 14 },
  saveBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
});
