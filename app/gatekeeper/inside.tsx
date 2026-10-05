import { TourTarget } from '@/src/features/app-tour';
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  Image,
  Alert,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from '@/src/utils/haptics';
import { useTheme } from '@/src/hooks/useTheme';
import { visitorService, type InsideVisitor, type SchoolGate } from '@/src/services/visitorService';

const CATEGORIES = ['ALL', 'PARENT', 'VENDOR', 'CONTRACTOR', 'GUEST', 'OVERSTAYED'];

export default function GatekeeperInsideRegisterScreen() {
  const router = useRouter();
  const { isDark } = useTheme();

  const [visitors, setVisitors] = useState<InsideVisitor[]>([]);
  const [currentGate, setCurrentGate] = useState<SchoolGate | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [checkingOutId, setCheckingOutId] = useState<string | null>(null);

  const loadInsideVisitors = useCallback(async () => {
    try {
      const [list, gateData] = await Promise.all([
        visitorService.getCurrentlyInside(),
        visitorService.getMyGate().catch(() => null),
      ]);
      setVisitors(list);
      if (gateData?.currentGate) setCurrentGate(gateData.currentGate);
    } catch (e) {
      console.warn('Failed to load inside visitors:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadInsideVisitors();
    const interval = setInterval(loadInsideVisitors, 20000); // Auto-refresh every 20s
    return () => clearInterval(interval);
  }, [loadInsideVisitors]);

  const onRefresh = () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    loadInsideVisitors();
  };

  const handleCheckOut = (item: InsideVisitor) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      'Confirm Check-Out',
      `Check out ${item.visitor_name} from campus premises?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm Exit',
          style: 'destructive',
          onPress: async () => {
            try {
              setCheckingOutId(item.checkin_id);
              await visitorService.checkOutVisitor({
                checkinId: item.checkin_id,
                exitGateId: currentGate?.id,
              });
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              setVisitors((prev) => prev.filter((v) => v.checkin_id !== item.checkin_id));
            } catch (err: any) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              Alert.alert('Check-Out Failed', err?.message || 'Could not complete check-out.');
            } finally {
              setCheckingOutId(null);
            }
          },
        },
      ]
    );
  };

  const filteredVisitors = visitors.filter((v) => {
    const matchesSearch =
      v.visitor_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.visitor_mobile.includes(searchQuery) ||
      (v.vehicle_number && v.vehicle_number.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (v.destination_department && v.destination_department.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;

    if (selectedCategory === 'ALL') return true;
    if (selectedCategory === 'OVERSTAYED') return v.isOverstayed;
    return v.visitor_type.toUpperCase() === selectedCategory;
  });

  const bgColor = isDark ? '#0B0F17' : '#F4F6F9';
  const cardBg = isDark ? '#161E2E' : '#FFFFFF';
  const textColor = isDark ? '#F1F5F9' : '#0F172A';
  const subColor = isDark ? '#94A3B8' : '#64748B';
  const borderColor = isDark ? '#26334A' : '#E2E8F0';

  const overstayCount = visitors.filter((v) => v.isOverstayed).length;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: bgColor }]}>
      {/* Header */}
      <TourTarget id="screen.gatekeeper-inside.overview" native><View style={[styles.header, { borderBottomColor: borderColor }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={textColor} />
        </TouchableOpacity>
        <View style={styles.headerTitleCol}>
          <Text style={[styles.headerTitle, { color: textColor }]}>Live Inside Campus</Text>
          <Text style={[styles.headerSub, { color: subColor }]}>
            {visitors.length} on site • {overstayCount} overstayed
          </Text>
        </View>
        <TouchableOpacity
          style={styles.scanBtn}
          onPress={() => router.push('/gatekeeper/scanner' as any)}
        >
          <Ionicons name="qr-code-outline" size={20} color="#10B981" />
        </TouchableOpacity>
      </View></TourTarget>

      {/* Search & Filter Bar */}
      <TourTarget id="screen.gatekeeper-inside.workspace" native><View style={[styles.searchWrap, { backgroundColor: cardBg, borderColor }]}>
        <Ionicons name="search" size={18} color={subColor} />
        <TextInput
          style={[styles.searchInput, { color: textColor }]}
          placeholder="Search by name, mobile, vehicle..."
          placeholderTextColor={subColor}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery ? (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={18} color={subColor} />
          </TouchableOpacity>
        ) : null}
      </View></TourTarget>

      {/* Category Pills */}
      <View style={styles.categoryWrap}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={CATEGORIES}
          keyExtractor={(item) => item}
          renderItem={({ item }) => {
            const isSelected = selectedCategory === item;
            const isAlert = item === 'OVERSTAYED';
            return (
              <TouchableOpacity
                style={[
                  styles.categoryChip,
                  {
                    backgroundColor: isSelected
                      ? isAlert
                        ? '#EF4444'
                        : '#10B981'
                      : 'transparent',
                    borderColor: isSelected
                      ? isAlert
                        ? '#EF4444'
                        : '#10B981'
                      : borderColor,
                  },
                ]}
                onPress={() => setSelectedCategory(item)}
              >
                <Text
                  style={[
                    styles.categoryChipText,
                    { color: isSelected ? '#FFFFFF' : textColor },
                  ]}
                >
                  {item} {isAlert && overstayCount > 0 ? `(${overstayCount})` : ''}
                </Text>
              </TouchableOpacity>
            );
          }}
          contentContainerStyle={styles.categoryList}
        />
      </View>

      {/* List of Inside Visitors */}
      <FlatList
        data={filteredVisitors}
        keyExtractor={(item) => item.checkin_id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10B981" />
        }
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Ionicons name="checkmark-circle-outline" size={54} color="#10B981" />
            <Text style={[styles.emptyTitle, { color: textColor }]}>Campus Cleared</Text>
            <Text style={[styles.emptySub, { color: subColor }]}>
              {visitors.length === 0
                ? 'No visitors are currently inside the campus.'
                : 'No visitors match the selected filters.'}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const isOverstayed = item.isOverstayed;
          const isBusy = checkingOutId === item.checkin_id;

          return (
            <View
              style={[
                styles.card,
                {
                  backgroundColor: cardBg,
                  borderColor: isOverstayed ? '#EF4444' : borderColor,
                },
              ]}
            >
              {/* Card Header */}
              <View style={styles.cardHeader}>
                <View style={styles.visitorRow}>
                  <View style={styles.avatar}>
                    {item.photo_url ? (
                      <Image source={{ uri: item.photo_url }} style={styles.avatarImg} />
                    ) : (
                      <Ionicons name="person" size={24} color="#10B981" />
                    )}
                  </View>
                  <View style={styles.visitorMeta}>
                    <Text style={[styles.nameText, { color: textColor }]}>{item.visitor_name}</Text>
                    <Text style={[styles.phoneText, { color: subColor }]}>
                      {item.visitor_mobile} • {item.visitor_type}
                    </Text>
                  </View>
                </View>

                {/* Overstay or Duration Pill */}
                {isOverstayed ? (
                  <View style={styles.overstayBadge}>
                    <Ionicons name="alert-circle" size={13} color="#FFFFFF" />
                    <Text style={styles.overstayText}>OVERSTAY (+{item.overstayMinutes}m)</Text>
                  </View>
                ) : (
                  <View style={styles.durationBadge}>
                    <Ionicons name="time-outline" size={13} color="#10B981" />
                    <Text style={styles.durationText}>{item.elapsedMinutes}m on site</Text>
                  </View>
                )}
              </View>

              {/* Purpose & Host */}
              <View style={styles.purposeBox}>
                <Text style={[styles.purposeText, { color: textColor }]} numberOfLines={2}>
                  {item.purpose || 'Campus Visit'}
                </Text>
                {item.destination_department ? (
                  <Text style={[styles.hostText, { color: subColor }]}>
                    Meeting: <Text style={styles.bold}>{item.destination_department}</Text>
                  </Text>
                ) : null}
              </View>

              {/* Meta pills: Vehicle / Items / Gate */}
              <View style={styles.pillsRow}>
                {item.vehicle_number ? (
                  <View style={styles.smallPill}>
                    <Ionicons name="car" size={12} color={subColor} />
                    <Text style={[styles.smallPillText, { color: subColor }]}>
                      {item.vehicle_number}
                    </Text>
                  </View>
                ) : null}
                {item.gate_name ? (
                  <View style={styles.smallPill}>
                    <Ionicons name="log-in" size={12} color={subColor} />
                    <Text style={[styles.smallPillText, { color: subColor }]}>{item.gate_name}</Text>
                  </View>
                ) : null}
              </View>

              {/* Card Footer: Action Buttons */}
              <View style={styles.cardFooter}>
                <TouchableOpacity
                  style={styles.callVisitorBtn}
                  onPress={() => Linking.openURL(`tel:${item.visitor_mobile}`)}
                >
                  <Ionicons name="call-outline" size={16} color="#10B981" />
                  <Text style={styles.callVisitorText}>Call</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.checkOutBtn, isBusy && styles.btnDisabled]}
                  onPress={() => handleCheckOut(item)}
                  disabled={isBusy}
                >
                  <Ionicons name="log-out-outline" size={16} color="#FFFFFF" />
                  <Text style={styles.checkOutBtnText}>
                    {isBusy ? 'Checking out...' : 'Check Out'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
      />
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
  scanBtn: { padding: 8 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 42,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14 },
  categoryWrap: { marginTop: 10, marginBottom: 6 },
  categoryList: { paddingHorizontal: 16, gap: 8 },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  categoryChipText: { fontSize: 11, fontWeight: '800' },
  listContent: { padding: 16, paddingBottom: 40 },
  card: {
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  visitorRow: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(16,185,129,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  visitorMeta: { marginLeft: 10, flex: 1 },
  nameText: { fontSize: 15, fontWeight: '800' },
  phoneText: { fontSize: 12, marginTop: 2 },
  overstayBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EF4444',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  overstayText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900' },
  durationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(16,185,129,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  durationText: { color: '#10B981', fontSize: 10, fontWeight: '800' },
  purposeBox: { marginTop: 10, gap: 2 },
  purposeText: { fontSize: 13, lineHeight: 17 },
  hostText: { fontSize: 12 },
  bold: { fontWeight: '700' },
  pillsRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
  smallPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(150,150,150,0.1)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  smallPillText: { fontSize: 10, fontWeight: '600' },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(150,150,150,0.2)',
  },
  callVisitorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#10B981',
  },
  callVisitorText: { color: '#10B981', fontSize: 12, fontWeight: '700' },
  checkOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#10B981',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  checkOutBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  btnDisabled: { opacity: 0.6 },
  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyTitle: { fontSize: 17, fontWeight: '800', marginTop: 14 },
  emptySub: { fontSize: 13, textAlign: 'center', marginTop: 6, maxWidth: 260 },
});
