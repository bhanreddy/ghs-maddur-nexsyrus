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
import { visitorService } from '@/src/services/visitorService';

const ACTION_LEVELS = ['BLOCK_ENTRY', 'WARN_SECURITY', 'NOTIFY_ADMIN'];

export default function AdminWatchlistScreen() {
  const router = useRouter();
  const { isDark } = useTheme();

  const [watchlist, setWatchlist] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form Fields
  const [fullName, setFullName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [reason, setReason] = useState('');
  const [actionLevel, setActionLevel] = useState('BLOCK_ENTRY');

  const loadWatchlist = useCallback(async () => {
    try {
      const list = await visitorService.getWatchlist();
      setWatchlist(list);
    } catch (e) {
      console.warn('Failed to load watchlist:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadWatchlist();
  }, [loadWatchlist]);

  const onRefresh = () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    loadWatchlist();
  };

  const handleAddWatchlist = async () => {
    if (!fullName.trim() || !mobileNumber.trim() || !reason.trim()) {
      Alert.alert('Missing Fields', 'Please fill name, mobile number, and restriction reason.');
      return;
    }

    try {
      setSubmitting(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

      const res = await visitorService.addToWatchlist({
        fullName: fullName.trim(),
        mobileNumber: mobileNumber.trim(),
        reason: reason.trim(),
        actionLevel,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setWatchlist((prev) => [res.entry, ...prev]);
      setModalVisible(false);
      setFullName('');
      setMobileNumber('');
      setReason('');
      Alert.alert('Person Added to Watchlist', 'Security gates will instantly trigger high-priority alerts upon lookup.');
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not add to watchlist.');
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
      <TourTarget id="screen.admin-visitors-watchlist.overview" native><View style={[styles.header, { borderBottomColor: borderColor }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={textColor} />
        </TouchableOpacity>
        <View style={styles.titleCol}>
          <Text style={[styles.title, { color: textColor }]}>Campus Security Watchlist</Text>
          <Text style={[styles.subTitle, { color: subColor }]}>Restricted Individuals & Perimeter Bans</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => setModalVisible(true)}>
          <Ionicons name="add" size={22} color="#FFFFFF" />
        </TouchableOpacity>
      </View></TourTarget>

      <TourTarget id="screen.admin-visitors-watchlist.workspace" native><FlatList
        data={watchlist}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#EF4444" />
        }
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Ionicons name="shield-checkmark-outline" size={54} color="#10B981" />
            <Text style={[styles.emptyTitle, { color: textColor }]}>Watchlist is Clean</Text>
            <Text style={[styles.emptySub, { color: subColor }]}>
              No restricted or banned persons are currently listed on the security blacklist.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const isBlock = item.action_level === 'BLOCK_ENTRY';

          return (
            <View
              style={[
                styles.card,
                {
                  backgroundColor: cardBg,
                  borderColor: isBlock ? '#EF4444' : '#F59E0B',
                },
              ]}
            >
              <View style={styles.cardHeader}>
                <View style={styles.personCol}>
                  <Text style={[styles.personName, { color: textColor }]}>
                    {item.full_name || 'Individual'}
                  </Text>
                  <Text style={[styles.personMobile, { color: subColor }]}>
                    {item.mobile_number}
                  </Text>
                </View>

                <View
                  style={[
                    styles.actionPill,
                    {
                      backgroundColor: isBlock
                        ? 'rgba(239,68,68,0.2)'
                        : 'rgba(245,158,11,0.2)',
                    },
                  ]}
                >
                  <Ionicons
                    name="warning"
                    size={12}
                    color={isBlock ? '#EF4444' : '#F59E0B'}
                  />
                  <Text
                    style={[
                      styles.actionPillText,
                      { color: isBlock ? '#EF4444' : '#F59E0B' },
                    ]}
                  >
                    {item.action_level}
                  </Text>
                </View>
              </View>

              <View style={styles.reasonBox}>
                <Text style={[styles.reasonLabel, { color: subColor }]}>REASON FOR FLAG:</Text>
                <Text style={[styles.reasonText, { color: textColor }]}>{item.reason}</Text>
              </View>

              <View style={styles.cardFooter}>
                <Text style={[styles.timeText, { color: subColor }]}>
                  Added on {new Date(item.created_at).toLocaleDateString()}
                </Text>
              </View>
            </View>
          );
        }}
      /></TourTarget>

      {/* Add to Watchlist Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <SafeAreaView style={[styles.modalSheet, { backgroundColor: cardBg }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: textColor }]}>Add to Security Watchlist</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={subColor} />
              </TouchableOpacity>
            </View>

            <TourScrollView contentContainerStyle={styles.modalScroll}>
              <Text style={[styles.label, { color: subColor }]}>PERSON FULL NAME *</Text>
              <TextInput
                style={[styles.input, { color: textColor, borderColor }]}
                placeholder="e.g. Ramesh Kumar"
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

              <Text style={[styles.label, { color: subColor }]}>SECURITY ACTION LEVEL</Text>
              <View style={styles.actionLevelRow}>
                {ACTION_LEVELS.map((lvl) => {
                  const isSelected = actionLevel === lvl;
                  const isBlk = lvl === 'BLOCK_ENTRY';
                  return (
                    <TouchableOpacity
                      key={lvl}
                      style={[
                        styles.actionChip,
                        {
                          backgroundColor: isSelected
                            ? isBlk
                              ? '#EF4444'
                              : '#F59E0B'
                            : 'transparent',
                          borderColor: isBlk ? '#EF4444' : '#F59E0B',
                        },
                      ]}
                      onPress={() => setActionLevel(lvl)}
                    >
                      <Text
                        style={[
                          styles.actionChipText,
                          {
                            color: isSelected ? '#FFFFFF' : isBlk ? '#EF4444' : '#F59E0B',
                          },
                        ]}
                      >
                        {lvl.replace(/_/g, ' ')}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={[styles.label, { color: subColor }]}>REASON & EVIDENCE *</Text>
              <TextInput
                style={[styles.textArea, { color: textColor, borderColor }]}
                placeholder="Describe grounds for ban, misconduct history, or court orders"
                placeholderTextColor={subColor}
                multiline
                value={reason}
                onChangeText={setReason}
              />

              <TouchableOpacity
                style={styles.saveBtn}
                onPress={handleAddWatchlist}
                disabled={submitting}
              >
                <LinearGradient
                  colors={['#DC2626', '#EF4444']}
                  style={styles.saveGradient}
                >
                  {submitting ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.saveBtnText}>Restrict & Add to Watchlist</Text>
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
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: { padding: 16, paddingBottom: 40 },
  card: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    marginBottom: 12,
    gap: 8,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  personCol: { flex: 1 },
  personName: { fontSize: 16, fontWeight: '800' },
  personMobile: { fontSize: 12, marginTop: 2 },
  actionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  actionPillText: { fontSize: 10, fontWeight: '900' },
  reasonBox: {
    backgroundColor: 'rgba(150,150,150,0.06)',
    padding: 10,
    borderRadius: 8,
    gap: 4,
  },
  reasonLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  reasonText: { fontSize: 13, lineHeight: 18 },
  cardFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(150,150,150,0.2)',
    paddingTop: 6,
  },
  timeText: { fontSize: 11 },
  emptyWrap: { alignItems: 'center', paddingVertical: 60 },
  emptyTitle: { fontSize: 17, fontWeight: '800', marginTop: 14 },
  emptySub: { fontSize: 13, textAlign: 'center', marginTop: 6, maxWidth: 260 },
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
  actionLevelRow: { flexDirection: 'row', gap: 6, marginVertical: 4 },
  actionChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  actionChipText: { fontSize: 10, fontWeight: '800' },
  textArea: {
    height: 80,
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
