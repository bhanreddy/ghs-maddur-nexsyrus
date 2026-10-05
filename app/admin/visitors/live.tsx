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
import { visitorService, type InsideVisitor } from '@/src/services/visitorService';

export default function AdminVisitorsLiveScreen() {
  const router = useRouter();
  const { isDark } = useTheme();

  const [visitors, setVisitors] = useState<InsideVisitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterOverstayOnly, setFilterOverstayOnly] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const list = await visitorService.getCurrentlyInside();
      setVisitors(list);
    } catch (e) {
      console.warn('Failed to load inside visitors:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const timer = setInterval(loadData, 20000);
    return () => clearInterval(timer);
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    loadData();
  };

  const handleAdminCheckOut = (v: InsideVisitor) => {
    Alert.alert('Force Check-Out', `Check out ${v.visitor_name} from the campus register?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm Exit',
        style: 'destructive',
        onPress: async () => {
          try {
            await visitorService.checkOutVisitor({ checkinId: v.checkin_id });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setVisitors((prev) => prev.filter((item) => item.checkin_id !== v.checkin_id));
          } catch (e: any) {
            Alert.alert('Error', e?.message || 'Failed to check out visitor.');
          }
        },
      },
    ]);
  };

  const filteredVisitors = visitors.filter((v) => {
    if (filterOverstayOnly && !v.isOverstayed) return false;
    const q = searchQuery.toLowerCase();
    return (
      v.visitor_name.toLowerCase().includes(q) ||
      v.visitor_mobile.includes(q) ||
      (v.destination_department && v.destination_department.toLowerCase().includes(q))
    );
  });

  const bgColor = isDark ? '#0B0F17' : '#F8FAFC';
  const cardBg = isDark ? '#161E2E' : '#FFFFFF';
  const textColor = isDark ? '#F1F5F9' : '#0F172A';
  const subColor = isDark ? '#94A3B8' : '#64748B';
  const borderColor = isDark ? '#26334A' : '#E2E8F0';

  const overstayCount = visitors.filter((v) => v.isOverstayed).length;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: bgColor }]}>
      {/* Header */}
      <TourTarget id="screen.admin-visitors-live.overview" native><View style={[styles.header, { borderBottomColor: borderColor }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={textColor} />
        </TouchableOpacity>
        <View style={styles.titleCol}>
          <Text style={[styles.title, { color: textColor }]}>Live Campus Perimeter</Text>
          <Text style={[styles.subTitle, { color: subColor }]}>
            {visitors.length} inside campus • {overstayCount} overstayed
          </Text>
        </View>
      </View></TourTarget>

      {/* Filter Row */}
      <TourTarget id="screen.admin-visitors-live.workspace" native><View style={styles.topFilterRow}>
        <View style={[styles.searchBox, { backgroundColor: cardBg, borderColor }]}>
          <Ionicons name="search" size={16} color={subColor} />
          <TextInput
            style={[styles.searchInput, { color: textColor }]}
            placeholder="Search active visitors..."
            placeholderTextColor={subColor}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        <TouchableOpacity
          style={[
            styles.overstayFilterChip,
            {
              backgroundColor: filterOverstayOnly ? '#EF4444' : cardBg,
              borderColor: filterOverstayOnly ? '#EF4444' : borderColor,
            },
          ]}
          onPress={() => setFilterOverstayOnly((v) => !v)}
        >
          <Ionicons
            name="alert-circle"
            size={14}
            color={filterOverstayOnly ? '#FFFFFF' : '#EF4444'}
          />
          <Text
            style={[
              styles.overstayFilterText,
              { color: filterOverstayOnly ? '#FFFFFF' : textColor },
            ]}
          >
            Overstayed ({overstayCount})
          </Text>
        </TouchableOpacity>
      </View></TourTarget>

      <FlatList
        data={filteredVisitors}
        keyExtractor={(item) => item.checkin_id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10B981" />
        }
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Ionicons name="shield-checkmark" size={54} color="#10B981" />
            <Text style={[styles.emptyTitle, { color: textColor }]}>No Active Visitors</Text>
            <Text style={[styles.emptySub, { color: subColor }]}>
              {visitors.length === 0
                ? 'Campus is currently cleared of visitors.'
                : 'No visitors match the filter criteria.'}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          return (
            <View
              style={[
                styles.card,
                {
                  backgroundColor: cardBg,
                  borderColor: item.isOverstayed ? '#EF4444' : borderColor,
                },
              ]}
            >
              <View style={styles.cardHeader}>
                <View style={styles.visitorMetaCol}>
                  <Text style={[styles.visitorName, { color: textColor }]}>{item.visitor_name}</Text>
                  <Text style={[styles.visitorPhone, { color: subColor }]}>
                    {item.visitor_mobile} • {item.visitor_type}
                  </Text>
                </View>

                {item.isOverstayed ? (
                  <View style={styles.overstayPill}>
                    <Text style={styles.overstayPillText}>+{item.overstayMinutes}m OVERSTAY</Text>
                  </View>
                ) : (
                  <View style={styles.durationPill}>
                    <Text style={styles.durationPillText}>{item.elapsedMinutes}m on site</Text>
                  </View>
                )}
              </View>

              <Text style={[styles.purposeText, { color: textColor }]}>{item.purpose}</Text>

              <View style={styles.metaRow}>
                {item.destination_department ? (
                  <Text style={[styles.metaDetail, { color: subColor }]}>
                    Meeting: {item.destination_department}
                  </Text>
                ) : null}
                {item.gate_name ? (
                  <Text style={[styles.metaDetail, { color: subColor }]}>Gate: {item.gate_name}</Text>
                ) : null}
                {item.vehicle_number ? (
                  <Text style={[styles.metaDetail, { color: subColor }]}>
                    Vehicle: {item.vehicle_number}
                  </Text>
                ) : null}
              </View>

              <View style={styles.cardFooter}>
                <TouchableOpacity
                  style={styles.callBtn}
                  onPress={() => Linking.openURL(`tel:${item.visitor_mobile}`)}
                >
                  <Ionicons name="call-outline" size={14} color="#10B981" />
                  <Text style={styles.callBtnText}>Call</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.checkOutBtn}
                  onPress={() => handleAdminCheckOut(item)}
                >
                  <Ionicons name="log-out-outline" size={14} color="#FFFFFF" />
                  <Text style={styles.checkOutBtnText}>Check Out</Text>
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
  titleCol: { flex: 1, marginLeft: 10 },
  title: { fontSize: 18, fontWeight: '800' },
  subTitle: { fontSize: 12 },
  topFilterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    alignItems: 'center',
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 40,
    borderRadius: 10,
    paddingHorizontal: 10,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  searchInput: { flex: 1, fontSize: 13 },
  overstayFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  overstayFilterText: { fontSize: 12, fontWeight: '800' },
  listContent: { padding: 16, paddingBottom: 40 },
  card: {
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
    marginBottom: 12,
    gap: 6,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  visitorMetaCol: { flex: 1 },
  visitorName: { fontSize: 15, fontWeight: '800' },
  visitorPhone: { fontSize: 12, marginTop: 2 },
  overstayPill: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  overstayPillText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900' },
  durationPill: {
    backgroundColor: 'rgba(16,185,129,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  durationPillText: { color: '#10B981', fontSize: 10, fontWeight: '800' },
  purposeText: { fontSize: 13 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metaDetail: { fontSize: 11 },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(150,150,150,0.2)',
  },
  callBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#10B981',
  },
  callBtnText: { color: '#10B981', fontSize: 12, fontWeight: '700' },
  checkOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#10B981',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  checkOutBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  emptyWrap: { alignItems: 'center', paddingVertical: 60 },
  emptyTitle: { fontSize: 17, fontWeight: '800', marginTop: 14 },
  emptySub: { fontSize: 13, textAlign: 'center', marginTop: 6 },
});
