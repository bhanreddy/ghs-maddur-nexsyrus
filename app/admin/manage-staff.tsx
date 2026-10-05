import { TourTarget } from '@/src/features/app-tour';
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  StatusBar,
  Linking,
  useWindowDimensions,
  Platform,
} from 'react-native';
import AppTextInput from '../../src/components/AppTextInput';
import { styles as ds } from '../../src/theme/styles';
import { alertCompat } from '../../src/utils/crossPlatformAlert';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  Extrapolate,
  ZoomIn,
} from 'react-native-reanimated';
import { useFocusEffect, useRouter } from 'expo-router';
import AdminHeader from '../../src/components/AdminHeader';
import { StaffService } from '../../src/services/staffService';
import { useTheme } from '../../src/hooks/useTheme';
import LogoLoader from '../../src/components/LogoLoader';
import { usePermissions } from '../../src/hooks/usePermissions';
import { useAuth } from '../../src/hooks/useAuth';
import { setStaffPortalSession } from '../../src/services/staffPortalSession';
import { endStaffPortalAccess } from '../../src/services/staffPortalExit';

interface StaffMember {
  id: string;
  first_name: string;
  last_name: string;
  display_name: string;
  designation: string;
  status: string;
  photo_url: string | null;
  phone: string;
}

// ─── Status Config ────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, {
  gradient: [string, string];
  dot: string;
  darkText: string;
  lightText: string;
  darkBg: string;
  lightBg: string;
}> = {
  Active: {
    gradient: ['#34D399', '#059669'], dot: '#10B981',
    darkText: '#6EE7B7', lightText: '#047857',
    darkBg: 'rgba(16,185,129,0.14)', lightBg: '#ECFDF5',
  },
  Inactive: {
    gradient: ['#CBD5E1', '#94A3B8'], dot: '#94A3B8',
    darkText: '#CBD5E1', lightText: '#64748B',
    darkBg: 'rgba(148,163,184,0.14)', lightBg: '#F1F5F9',
  },
  Present: {
    gradient: ['#00C48C', '#00875A'],
    dot: '#00C48C',
    darkText: '#00C48C',
    lightText: '#00734F',
    darkBg: 'rgba(0,196,140,0.15)',
    lightBg: 'rgba(0,115,79,0.10)',
  },
  Leave: {
    gradient: ['#FFB800', '#E67E00'],
    dot: '#FFB800',
    darkText: '#FFB800',
    lightText: '#A85A00',
    darkBg: 'rgba(255,184,0,0.15)',
    lightBg: 'rgba(168,90,0,0.10)',
  },
  Absent: {
    gradient: ['#FF4D6A', '#C0203B'],
    dot: '#FF4D6A',
    darkText: '#FF4D6A',
    lightText: '#B0102E',
    darkBg: 'rgba(255,77,106,0.15)',
    lightBg: 'rgba(176,16,46,0.10)',
  },
};

// ─── Staff Card ───────────────────────────────────────────────────────────────
function StaffCard({
  item, index, isDark, cardBg, cardBorder, avatarBg, cardWidth, onCall, onDelete, onOpenPortal, onWriteDiary, onEdit, canEdit,
}: {
  item: StaffMember;
  index: number;
  isDark: boolean;
  cardBg: string;
  cardBorder: string;
  avatarBg: string;
  cardWidth: number;
  onCall: () => void;
  onDelete: () => void;
  onOpenPortal: () => void;
  onWriteDiary: () => void;
  onEdit?: () => void;
  canEdit?: boolean;
}) {
  const statusKey = Object.keys(STATUS_CONFIG).find((key) => key.toLowerCase() === item.status.toLowerCase());
  const cfg = STATUS_CONFIG[statusKey || 'Inactive'];
  const mutedColor = isDark ? '#94A3B8' : '#64748B';
  const actionBg = isDark ? '#202B3D' : '#F1F5F9';

  return (
    <Animated.View
      entering={FadeInDown.delay(Math.min(index, 8) * 40).duration(350)}
      style={[styles.card, { width: cardWidth, backgroundColor: cardBg, borderColor: cardBorder }]}
    >
      <TouchableOpacity
        activeOpacity={0.75}
        onPress={onOpenPortal}
        style={styles.cardHeader}
        accessibilityRole="button"
        accessibilityLabel={`Open ${item.display_name}'s staff portal`}
      >
        <View style={styles.avatarWrapper}>
          <LinearGradient colors={cfg.gradient} style={styles.avatarRing}>
            {item.photo_url ? (
              <Image source={{ uri: item.photo_url }} style={[styles.avatar, { backgroundColor: avatarBg, borderColor: cardBg }]} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: avatarBg, borderColor: cardBg }]}>
                <Text style={[styles.avatarInitials, { color: isDark ? '#C4B5FD' : '#6D28D9' }]}>
                  {item.display_name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'S'}
                </Text>
              </View>
            )}
          </LinearGradient>
        </View>
        <View style={styles.info}>
          <Text style={[styles.name, { color: isDark ? '#F8FAFC' : '#0F172A' }]} numberOfLines={1}>
            {item.display_name}
          </Text>
          <Text style={[styles.role, { color: mutedColor }]} numberOfLines={1}>{item.designation}</Text>
          <View style={[styles.statusPill, { backgroundColor: isDark ? cfg.darkBg : cfg.lightBg }]}>
            <View style={[styles.statusDot, { backgroundColor: cfg.dot }]} />
            <Text style={[styles.statusText, { color: isDark ? cfg.darkText : cfg.lightText }]}>{item.status}</Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color={mutedColor} />
      </TouchableOpacity>

      <View style={[styles.cardFooter, { borderTopColor: cardBorder }]}>
        <TouchableOpacity
          onPress={onWriteDiary}
          activeOpacity={0.8}
          style={[styles.diaryBtn, { backgroundColor: isDark ? '#312E81' : '#EEF2FF' }]}
          accessibilityRole="button"
          accessibilityLabel={`Write diary for ${item.display_name}`}
        >
          <Ionicons name="create-outline" size={17} color={isDark ? '#C7D2FE' : '#4F46E5'} />
          <Text style={[styles.diaryBtnText, { color: isDark ? '#C7D2FE' : '#4F46E5' }]}>Write diary</Text>
        </TouchableOpacity>
        <View style={styles.actions}>
          {canEdit && onEdit ? (
            <TouchableOpacity onPress={onEdit} style={[styles.actionBtn, { backgroundColor: actionBg }]} activeOpacity={0.75}
              accessibilityRole="button" accessibilityLabel={`Edit ${item.display_name}'s profile`}>
              <Ionicons name="pencil-outline" size={17} color={mutedColor} />
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity onPress={onCall} style={[styles.actionBtn, { backgroundColor: actionBg }]} activeOpacity={0.75}
            accessibilityRole="button" accessibilityLabel={`Call ${item.display_name}`}>
            <Ionicons name="call-outline" size={17} color={mutedColor} />
          </TouchableOpacity>
          <TouchableOpacity onPress={onDelete} style={[styles.actionBtn, { backgroundColor: isDark ? 'rgba(244,63,94,0.12)' : '#FFF1F2' }]} activeOpacity={0.75}
            accessibilityRole="button" accessibilityLabel={`Remove ${item.display_name}`}>
            <Ionicons name="trash-outline" size={17} color={isDark ? '#FDA4AF' : '#E11D48'} />
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
}

// ─── Stats Bar ────────────────────────────────────────────────────────────────
function StatsBar({ staffList, isDark }: { staffList: StaffMember[]; isDark: boolean }) {
  const present = staffList.filter((s) => s.status === 'Present').length;
  const absent = staffList.filter((s) => s.status === 'Absent').length;
  const leave = staffList.filter((s) => s.status === 'Leave').length;

  const barBg = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)';
  const barBorder = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
  const labelColor = isDark ? 'rgba(255,255,255,0.38)' : 'rgba(0,0,0,0.40)';
  const divColor = isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.09)';

  const chips = [
    { label: 'Total', value: staffList.length, color: '#7C6FFF' },
    { label: 'Present', value: present, color: '#00C48C' },
    { label: 'On Leave', value: leave, color: '#FFB800' },
    { label: 'Absent', value: absent, color: '#FF4D6A' },
  ];

  return (
    <Animated.View
      entering={FadeInDown.delay(100).duration(500)}
      style={[styles.statsBar, { backgroundColor: barBg, borderColor: barBorder }]}
    >
      {chips.map((c, i) => (
        <React.Fragment key={c.label}>
          <View style={styles.statChip}>
            <Text style={[styles.statValue, { color: c.color }]}>{c.value}</Text>
            <Text style={[styles.statLabel, { color: labelColor }]}>{c.label}</Text>
          </View>
          {i < chips.length - 1 && (
            <View style={[styles.statsDivider, { backgroundColor: divColor }]} />
          )}
        </React.Fragment>
      ))}
    </Animated.View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function ManageStaff() {
  const { isDark } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const [listWidth, setListWidth] = useState(windowWidth);
  const contentWidth = Math.min(listWidth, 1440);
  const numColumns = contentWidth >= 1120 ? 3 : contentWidth >= 720 ? 2 : 1;
  const cardWidth = Math.max(0, (contentWidth - 40 - 14 * (numColumns - 1)) / numColumns);
  const router = useRouter();
  const { user } = useAuth();
  const { hasPermission } = usePermissions();
  const canManageStaff = hasPermission('staff.create') || hasPermission('staff.edit');

  const [searchQuery, setSearchQuery] = useState('');
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const searchFocus = useSharedValue(0);

  // ── Theme tokens ──────────────────────────────────────────────────────────
  const pageBg = isDark ? '#0C0D14' : '#F3F4F8';
  const cardBg = isDark ? 'rgba(255,255,255,0.045)' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
  const avatarBg = isDark ? '#1E1F2B' : '#E5E7EB';
  const searchBg = isDark
    ? ['rgba(255,255,255,0.07)', 'rgba(255,255,255,0.04)'] as [string, string]
    : ['#FFFFFF', '#FFFFFF'] as [string, string];
  const searchBorder = isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.10)';
  const searchTextColor = isDark ? '#FFFFFF' : '#111827';
  const placeholderClr = isDark ? 'rgba(255,255,255,0.30)' : 'rgba(0,0,0,0.32)';
  const iconColor = isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.32)';
  const countColor = isDark ? 'rgba(255,255,255,0.42)' : 'rgba(0,0,0,0.40)';
  const sectionColor = isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)';
  const loadingColor = isDark ? 'rgba(255,255,255,0.32)' : 'rgba(0,0,0,0.35)';
  const emptyTitleColor = isDark ? 'rgba(255,255,255,0.60)' : 'rgba(0,0,0,0.52)';
  const emptySubColor = isDark ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.30)';
  const orb1Color = isDark ? 'rgba(124,111,255,0.08)' : 'rgba(124,111,255,0.06)';
  const orb2Color = isDark ? 'rgba(0,196,140,0.05)' : 'rgba(0,196,140,0.06)';

  useEffect(() => { fetchStaff(); }, []);
  useFocusEffect(React.useCallback(() => {
    void endStaffPortalAccess();
  }, []));

  const fetchStaff = async () => {
    try {
      setLoading(true);
      const data = await StaffService.getAllPages();
      const mapped: StaffMember[] = data.map((item) => ({
        id: item.id,
        first_name: item.first_name || '',
        last_name: item.last_name || '',
        display_name: item.display_name || `${item.first_name || ''} ${item.last_name || ''}`.trim(),
        designation: item.designation_name || item.designation || 'Staff',
        status: item.status_name || item.status || 'Present',
        photo_url: item.photo_url || null,
        phone: item.phone || '',
      }));
      setStaffList(mapped);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      alertCompat('Error', `Failed to load staff list\n${detail}`);
    } finally {
      setLoading(false);
    }
  };

  const filteredStaff = staffList.filter(
    (s) =>
      (s.display_name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
      (s.designation?.toLowerCase() || '').includes(searchQuery.toLowerCase())
  );

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleCall = async (phone: string, name: string) => {
    if (!phone || phone.trim() === '') {
      alertCompat('No Number', `${name} has no phone number on record.`);
      return;
    }
    const clean = phone.replace(/[\s\-\(\)]/g, '');
    const url = `tel:${clean}`;
    const can = await Linking.canOpenURL(url).catch(() => false);
    if (!can) {
      alertCompat('Cannot Call', 'Your device does not support phone calls.');
      return;
    }
    Linking.openURL(url).catch(() =>
      alertCompat('Error', `Unable to place a call to ${name}.`)
    );
  };

  const handleOpenPortal = async (item: StaffMember, pathname: '/staff/dashboard' | '/staff/diary' = '/staff/dashboard') => {
    try {
      const staff = await StaffService.getById(item.id);
      if (!staff.user_id || staff.account_status !== 'active') {
        alertCompat(
          'Staff Login Required',
          'This staff member needs an active login account before the portal can be opened in read/write mode.',
        );
        return;
      }
      const actorUserId = user?.userId;
      setStaffPortalSession(item.id, item.display_name, staff.user_id, actorUserId);
      router.push({
        pathname,
        params: {
          staffId: item.id,
          viewAsName: item.display_name,
          viewAsUserId: staff.user_id,
          viewAsActorId: actorUserId || '',
        },
      } as any);
    } catch (error: any) {
      alertCompat('Cannot Open Portal', error?.message || 'Could not validate this staff account.');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    alertCompat(
      'Remove Staff Member',
      `Permanently remove "${name}" from the system?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              await StaffService.delete(id);
              alertCompat('Done', 'Staff member removed successfully.');
              fetchStaff();
            } catch (err: any) {
              alertCompat('Error', err.message || 'Failed to delete staff');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  // ── Animated search glow ──────────────────────────────────────────────────
  const searchBorderStyle = useAnimatedStyle(() => ({
    borderColor: `rgba(124,111,255,${interpolate(
      searchFocus.value, [0, 1],
      [isDark ? 0.09 : 0.10, isDark ? 0.75 : 0.55],
      Extrapolate.CLAMP
    )})`,
    shadowOpacity: interpolate(
      searchFocus.value, [0, 1],
      [0, isDark ? 0.35 : 0.18],
      Extrapolate.CLAMP
    ),
  }));

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: pageBg }]}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor="transparent"
        translucent
      />

      {/* Ambient orbs */}
      <View style={[styles.orb1, { backgroundColor: orb1Color }]} />
      <View style={[styles.orb2, { backgroundColor: orb2Color }]} />

      {/* Header — AdminHeader uses its own theme context internally */}
      <TourTarget id="screen.admin-manage-staff.overview"><AdminHeader title="Manage Staff" showBackButton /></TourTarget>

      {canManageStaff && (
        <Animated.View entering={FadeInDown.duration(350)} style={styles.addRow}>
          <TouchableOpacity
            activeOpacity={0.88}
            onPress={() => router.push('/admin/addStaff' as any)}
            style={styles.addBtnWrap}
          >
            <LinearGradient
              colors={['#7C6FFF', '#5A4FE0']}
              style={styles.addBtn}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Ionicons name="person-add" size={18} color="#fff" />
              <Text style={styles.addBtnText}>Add Staff Member</Text>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Section label + stats */}
      <Animated.View entering={FadeInDown.duration(400)}>
        <View style={styles.sectionLabelRow}>
          <LinearGradient
            colors={['#7C6FFF', '#5A4FE0']}
            style={styles.sectionAccent}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          />
          <Text style={[styles.sectionLabel, { color: sectionColor }]}>STAFF DIRECTORY</Text>
        </View>
        {!loading && <StatsBar staffList={staffList} isDark={isDark} />}
      </Animated.View>

      {/* Search */}
      <TourTarget id="screen.admin-manage-staff.workspace"><Animated.View
        entering={FadeInDown.delay(150).duration(400)}
        style={[
          styles.searchWrapper,
          searchBorderStyle,
          { shadowColor: '#7C6FFF', borderColor: searchBorder },
        ]}
      >
        <LinearGradient
          colors={searchBg}
          style={styles.searchGrad}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
        >
          <Ionicons name="search" size={18} color={iconColor} style={{ marginRight: 10 }} />
          <AppTextInput
            style={[ds.inputInChrome, styles.searchInput, { color: searchTextColor }]}
            placeholder="Search by name or role…"
            placeholderTextColor={placeholderClr}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onFocus={() => { searchFocus.value = withTiming(1, { duration: 250 }); }}
            onBlur={() => { searchFocus.value = withTiming(0, { duration: 250 }); }}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearchQuery('')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close-circle" size={18} color={iconColor} />
            </TouchableOpacity>
          )}
        </LinearGradient>
      </Animated.View></TourTarget>

      {/* Count */}
      {!loading && (
        <Animated.View entering={FadeInDown.delay(200).duration(400)} style={styles.countRow}>
          <Text style={[styles.countText, { color: countColor }]}>
            {filteredStaff.length} {filteredStaff.length === 1 ? 'member' : 'members'}
          </Text>
          {searchQuery.length > 0 && (
            <Text style={styles.countSub}> matching &quot;{searchQuery}&quot;</Text>
          )}
        </Animated.View>
      )}

      {/* Content */}
      {loading ? (
        <View style={styles.centerContainer}>
          <LogoLoader size={60} color="#7C6FFF" />
          <Text style={[styles.loadingText, { color: loadingColor }]}>Loading staff…</Text>
        </View>
      ) : (
        <FlatList
          key={`staff-columns-${numColumns}`}
          numColumns={numColumns}
          columnWrapperStyle={numColumns > 1 ? styles.cardRow : undefined}
          onLayout={(event) => setListWidth(event.nativeEvent.layout.width)}
          data={filteredStaff}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => (
            <StaffCard
              item={item}
              index={index}
              isDark={isDark}
              cardBg={cardBg}
              cardBorder={cardBorder}
              avatarBg={avatarBg}
              cardWidth={cardWidth}
              onCall={() => handleCall(item.phone, item.display_name)}
              onDelete={() => handleDelete(item.id, item.display_name)}
              onOpenPortal={() => handleOpenPortal(item)}
              onWriteDiary={() => handleOpenPortal(item, '/staff/diary')}
              canEdit={hasPermission('staff.edit')}
              onEdit={() => router.push({ pathname: '/admin/addStaff', params: { id: item.id } } as any)}
            />
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <Animated.View entering={ZoomIn.duration(400)} style={styles.emptyContainer}>
              <LinearGradient
                colors={['rgba(124,111,255,0.15)', 'rgba(124,111,255,0.05)']}
                style={[styles.emptyIconBg, { borderColor: 'rgba(124,111,255,0.2)' }]}
              >
                <Ionicons name="people-outline" size={40} color="rgba(124,111,255,0.6)" />
              </LinearGradient>
              <Text style={[styles.emptyTitle, { color: emptyTitleColor }]}>No Members Found</Text>
              <Text style={[styles.emptySubtitle, { color: emptySubColor }]}>
                {searchQuery
                  ? `No results for "${searchQuery}"`
                  : 'Your staff directory is empty'}
              </Text>
            </Animated.View>
          }
          refreshing={loading}
          onRefresh={fetchStaff}
        />
      )}
    </View>
  );
}

// ─── Static Styles (colours are injected inline / via props — none hardcoded here) ──
const styles = StyleSheet.create({
  container: { flex: 1 },

  addRow: { paddingHorizontal: 20, marginBottom: 8 },
  addBtnWrap: { borderRadius: 14, overflow: 'hidden' },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: 14,
  },
  addBtnText: { color: '#fff', fontSize: 15, fontWeight: '700', letterSpacing: 0.2 },

  orb1: { position: 'absolute', width: 280, height: 280, borderRadius: 140, top: -70, right: -90 },
  orb2: { position: 'absolute', width: 180, height: 180, borderRadius: 90, bottom: 120, left: -60 },

  sectionLabelRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, marginTop: 6, marginBottom: 14,
  },
  sectionAccent: { width: 3, height: 13, borderRadius: 2, marginRight: 8 },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 2.4 },

  statsBar: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 20, marginBottom: 16,
    borderRadius: 14, borderWidth: 1,
    paddingVertical: 12, paddingHorizontal: 8,
  },
  statChip: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 20, fontWeight: '800', letterSpacing: -0.5 },
  statLabel: { fontSize: 10, fontWeight: '600', marginTop: 1, letterSpacing: 0.5 },
  statsDivider: { width: 1, height: 28 },

  searchWrapper: {
    marginHorizontal: 20, marginBottom: 10,
    borderRadius: 14, borderWidth: 1, overflow: 'hidden',
    shadowOffset: { width: 0, height: 0 }, shadowRadius: 12, elevation: 6,
  },
  searchGrad: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, height: 50 },
  searchInput: {
    flex: 1, fontSize: 15, fontWeight: '500',
    ...Platform.select({
      web: { outlineWidth: 0, outlineStyle: 'none' } as any,
      default: {},
    }),
  },

  countRow: { flexDirection: 'row', paddingHorizontal: 22, marginBottom: 12 },
  countText: { fontSize: 12, fontWeight: '600' },
  countSub: { fontSize: 12, fontWeight: '600', color: '#7C6FFF' },

  listContent: { width: '100%', maxWidth: 1440, alignSelf: 'center', paddingHorizontal: 20, paddingBottom: 40 },
  cardRow: { gap: 14 },
  card: { borderRadius: 20, padding: 16, marginBottom: 14, borderWidth: 1, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatarWrapper: { alignSelf: 'flex-start' },
  avatarRing: { width: 58, height: 58, borderRadius: 20, padding: 2, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 54, height: 54, borderRadius: 18, borderWidth: 2 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { fontSize: 18, fontWeight: '700' },
  info: { flex: 1, minWidth: 0 },
  name: { fontSize: 16, fontWeight: '700', letterSpacing: -0.3, marginBottom: 3 },
  role: { fontSize: 12, fontWeight: '500', marginBottom: 8 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 7, alignSelf: 'flex-start' },
  statusDot: { width: 5, height: 5, borderRadius: 3 },
  statusText: { fontSize: 10, fontWeight: '700' },
  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16, paddingTop: 12, borderTopWidth: 1 },
  diaryBtn: { flex: 1, minWidth: 0, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, height: 40, borderRadius: 11 },
  diaryBtnText: { fontSize: 12, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 6 },
  actionBtn: { width: 38, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },

  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  loadingText: { fontSize: 14, fontWeight: '500', letterSpacing: 0.5 },

  emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 12 },
  emptyIconBg: {
    width: 80, height: 80, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4, borderWidth: 1,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', letterSpacing: -0.3 },
  emptySubtitle: { fontSize: 13, fontWeight: '500', textAlign: 'center', paddingHorizontal: 40 },
});
