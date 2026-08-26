import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import AdminHeader from '../AdminHeader';
import LogoLoader from '../LogoLoader';
import { useAccountsWebChrome } from '../../contexts/AccountsWebChromeContext';
import { useTheme } from '../../hooks/useTheme';
import {
  HostelBlock,
  HostelPermissionRequest,
  HostelRoom,
  HostelService,
  HostelStudent,
  HostelSummary,
} from '../../services/hostelService';
import { alertCompat } from '../../utils/crossPlatformAlert';

type Scope = 'admin' | 'accounts';
type Tab = 'overview' | 'setup' | 'students' | 'requests';

const EMPTY_SUMMARY: HostelSummary = { blocks: 0, rooms: 0, beds: 0, occupied: 0, pending_requests: 0 };
const REQUEST_LABELS: Record<string, string> = {
  outing: 'Outing',
  overnight_leave: 'Overnight leave',
  late_return: 'Late return',
  visitor: 'Visitor permission',
  other: 'Other',
};

function money(value?: number | null) {
  if (value == null) return 'Not set';
  return `₹${Number(value).toLocaleString('en-IN')}`;
}

function shortDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function HostelManagementScreen({ scope }: { scope: Scope }) {
  const { theme, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const styles = useMemo(() => createStyles(theme, isDark), [theme, isDark]);
  const accountsChrome = useAccountsWebChrome();
  const shellActive = scope === 'accounts' && accountsChrome.shellActive;
  const isWide = width >= 900;

  const [tab, setTab] = useState<Tab>(scope === 'accounts' ? 'students' : 'overview');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState<HostelSummary>(EMPTY_SUMMARY);
  const [academicYear, setAcademicYear] = useState<{ id: string; code: string } | null>(null);
  const [blocks, setBlocks] = useState<HostelBlock[]>([]);
  const [rooms, setRooms] = useState<HostelRoom[]>([]);
  const [students, setStudents] = useState<HostelStudent[]>([]);
  const [requests, setRequests] = useState<HostelPermissionRequest[]>([]);
  const [query, setQuery] = useState('');

  const [blockModal, setBlockModal] = useState(false);
  const [editingBlock, setEditingBlock] = useState<HostelBlock | null>(null);
  const [blockName, setBlockName] = useState('');
  const [blockCode, setBlockCode] = useState('');

  const [roomModal, setRoomModal] = useState(false);
  const [editingRoom, setEditingRoom] = useState<HostelRoom | null>(null);
  const [roomBlockId, setRoomBlockId] = useState('');
  const [roomNo, setRoomNo] = useState('');
  const [roomFloor, setRoomFloor] = useState('');
  const [roomCapacity, setRoomCapacity] = useState('2');
  const [roomType, setRoomType] = useState('shared');
  const [roomFee, setRoomFee] = useState('');

  const [assignStudent, setAssignStudent] = useState<HostelStudent | null>(null);
  const [assignRoomId, setAssignRoomId] = useState('');
  const [assignBedNo, setAssignBedNo] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const [blockRows, roomRows, summaryRow] = await Promise.all([
        HostelService.getBlocks(),
        HostelService.getRooms(),
        HostelService.getSummary(),
      ]);
      setBlocks(blockRows);
      setRooms(roomRows);
      setSummary(summaryRow);
      try {
        const year = await HostelService.getCurrentAcademicYear();
        const studentPayload = await HostelService.getStudents(year.id);
        setAcademicYear(year);
        setStudents(studentPayload.students);
      } catch {
        setAcademicYear(null);
        setStudents([]);
      }
      if (scope === 'admin') setRequests(await HostelService.getRequests('all'));
    } catch (error: any) {
      alertCompat('Hostel unavailable', error?.message || 'Could not load hostel data. Run the hostel migration and retry.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [scope]);

  useEffect(() => { void loadData(); }, [loadData]);

  const visibleStudents = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return students;
    return students.filter((student) =>
      [student.student_name, student.admission_no, student.class_name, student.section_name, student.block_name, student.room_no]
        .some((value) => String(value || '').toLowerCase().includes(needle)),
    );
  }, [students, query]);

  const tabs = useMemo(() => scope === 'accounts'
    ? [{ key: 'students' as const, label: 'Students', icon: 'people-outline' as const }]
    : [
        { key: 'overview' as const, label: 'Overview', icon: 'grid-outline' as const },
        { key: 'setup' as const, label: 'Blocks & fees', icon: 'business-outline' as const },
        { key: 'students' as const, label: 'Students', icon: 'people-outline' as const },
        { key: 'requests' as const, label: 'Permissions', icon: 'shield-checkmark-outline' as const },
      ], [scope]);

  const openBlock = (block?: HostelBlock) => {
    setEditingBlock(block || null);
    setBlockName(block?.name || '');
    setBlockCode(block?.code || '');
    setBlockModal(true);
  };

  const saveBlock = async () => {
    if (!blockName.trim()) return alertCompat('Block name required', 'Example: Boys Block A or Girls Residence.');
    setSaving(true);
    try {
      if (editingBlock) await HostelService.updateBlock(editingBlock.id, { name: blockName.trim(), code: blockCode.trim() });
      else await HostelService.createBlock({ name: blockName.trim(), code: blockCode.trim() });
      setBlockModal(false);
      await loadData(true);
    } catch (error: any) {
      alertCompat('Could not save block', error?.message || 'Please try again.');
    } finally { setSaving(false); }
  };

  const openRoom = (room?: HostelRoom, blockId?: string) => {
    setEditingRoom(room || null);
    setRoomBlockId(room?.block_id || blockId || blocks[0]?.id || '');
    setRoomNo(room?.room_no || '');
    setRoomFloor(room?.floor == null ? '' : String(room.floor));
    setRoomCapacity(String(room?.capacity || 2));
    setRoomType(room?.room_type || 'shared');
    setRoomFee(room?.monthly_fee == null ? '' : String(room.monthly_fee));
    setRoomModal(true);
  };

  const saveRoom = async () => {
    const capacity = Number(roomCapacity);
    const fee = roomFee.trim() === '' ? null : Number(roomFee);
    if (!roomBlockId || !roomNo.trim()) return alertCompat('Room details required', 'Select a block and enter a room number.');
    if (!Number.isInteger(capacity) || capacity < 1) return alertCompat('Invalid capacity', 'Enter a whole number such as 2 or 4.');
    if (fee != null && (!Number.isFinite(fee) || fee < 0)) return alertCompat('Invalid fee', 'Enter zero or a positive monthly fee.');
    const input = {
      block_id: roomBlockId,
      room_no: roomNo.trim(),
      floor: roomFloor.trim() === '' ? null : Number(roomFloor),
      capacity,
      room_type: roomType.trim() || 'shared',
      monthly_fee: fee,
    };
    setSaving(true);
    try {
      if (editingRoom) await HostelService.updateRoom(editingRoom.id, input);
      else await HostelService.createRoom(input);
      setRoomModal(false);
      await loadData(true);
    } catch (error: any) {
      alertCompat('Could not save room', error?.message || 'Please try again.');
    } finally { setSaving(false); }
  };

  const confirmDeleteBlock = (block: HostelBlock) => alertCompat(
    'Delete hostel block?',
    `${block.name} can be deleted only after every student is vacated.`,
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void HostelService.deleteBlock(block.id)
        .then(() => loadData(true))
        .catch((error: any) => alertCompat('Could not delete block', error?.message)) },
    ],
  );

  const confirmDeleteRoom = (room: HostelRoom) => alertCompat(
    'Delete room?',
    `${room.block_name} · Room ${room.room_no} can be deleted only when empty.`,
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void HostelService.deleteRoom(room.id)
        .then(() => loadData(true))
        .catch((error: any) => alertCompat('Could not delete room', error?.message)) },
    ],
  );

  const openAssignment = (student: HostelStudent) => {
    setAssignStudent(student);
    setAssignRoomId(student.room_id || rooms.find((room) => room.is_available && room.occupied_beds < room.capacity)?.id || '');
    setAssignBedNo(student.bed_no == null ? '' : String(student.bed_no));
  };

  const saveAssignment = async () => {
    if (!assignStudent || !assignRoomId || !academicYear) return alertCompat('Room required', 'Select an available room.');
    const bedNo = assignBedNo.trim() === '' ? null : Number(assignBedNo);
    if (bedNo != null && (!Number.isInteger(bedNo) || bedNo < 1)) return alertCompat('Invalid bed', 'Enter a whole bed number such as 1 or 2.');
    setSaving(true);
    try {
      await HostelService.assignStudent({ student_id: assignStudent.id, room_id: assignRoomId, academic_year_id: academicYear.id, bed_no: bedNo });
      setAssignStudent(null);
      await loadData(true);
    } catch (error: any) {
      alertCompat('Could not assign student', error?.message || 'Please try another room or bed.');
    } finally { setSaving(false); }
  };

  const confirmRemoveStudent = (student: HostelStudent) => {
    if (!student.allocation_id) return;
    alertCompat('Remove student from hostel?', `${student.student_name} will be vacated from ${student.block_name} · Room ${student.room_no}.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => void HostelService.removeStudent(student.allocation_id!)
        .then(() => loadData(true))
        .catch((error: any) => alertCompat('Could not remove student', error?.message)) },
    ]);
  };

  const approveRequest = async (request: HostelPermissionRequest) => {
    try {
      await HostelService.approveRequest(request.id);
      await loadData(true);
    } catch (error: any) { alertCompat('Could not approve request', error?.message); }
  };

  const deleteRequest = (request: HostelPermissionRequest) => alertCompat(
    'Delete permission request?',
    'This permanently removes the parent request and its decision history.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void HostelService.deleteRequest(request.id)
        .then(() => loadData(true))
        .catch((error: any) => alertCompat('Could not delete request', error?.message)) },
    ],
  );

  if (loading) return (
    <View style={styles.root}>
      {!shellActive && <AdminHeader title={scope === 'admin' ? 'Hostel Management' : 'Hostel Students'} showBackButton={scope === 'admin'} onMenuPress={scope === 'accounts' ? accountsChrome.openMobileNav : undefined} />}
      <LogoLoader />
    </View>
  );

  return (
    <View style={styles.root}>
      {!shellActive && <AdminHeader title={scope === 'admin' ? 'Hostel Management' : 'Hostel Students'} showBackButton={scope === 'admin'} onMenuPress={scope === 'accounts' ? accountsChrome.openMobileNav : undefined} />}
      <ScrollView
        contentContainerStyle={[styles.content, isWide && styles.contentWide]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void loadData(true); }} tintColor="#4F46E5" />}
      >
        <LinearGradient colors={isDark ? ['#1E1B4B', '#312E81'] : ['#312E81', '#6366F1']} style={styles.hero}>
          <View style={styles.heroIcon}><Ionicons name="bed-outline" size={30} color="#FFFFFF" /></View>
          <View style={styles.heroCopy}>
            <Text style={styles.heroEyebrow}>{academicYear?.code || 'CURRENT YEAR'}</Text>
            <Text style={styles.heroTitle}>{scope === 'admin' ? 'Hostel operations' : 'Student room assignments'}</Text>
            <Text style={styles.heroText}>{scope === 'admin' ? 'Manage blocks, rooms, monthly fees, students and parent permissions.' : 'Assign, move or vacate students. Block setup and hostel fees stay admin-only.'}</Text>
          </View>
          <View style={styles.heroPill}><Text style={styles.heroPillText}>{summary.occupied}/{summary.beds} beds</Text></View>
        </LinearGradient>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {tabs.map((item) => (
            <Pressable key={item.key} onPress={() => setTab(item.key)} style={[styles.tab, tab === item.key && styles.tabActive]}>
              <Ionicons name={item.icon} size={16} color={tab === item.key ? '#FFFFFF' : theme.colors.textSecondary} />
              <Text style={[styles.tabText, tab === item.key && styles.tabTextActive]}>{item.label}</Text>
              {item.key === 'requests' && summary.pending_requests > 0 ? <View style={styles.badge}><Text style={styles.badgeText}>{summary.pending_requests}</Text></View> : null}
            </Pressable>
          ))}
        </ScrollView>

        {tab === 'overview' ? (
          <View style={styles.grid}>
            {[
              ['business-outline', 'Blocks', summary.blocks, '#4F46E5'],
              ['key-outline', 'Rooms', summary.rooms, '#0EA5E9'],
              ['bed-outline', 'Available beds', Math.max(0, summary.beds - summary.occupied), '#10B981'],
              ['shield-checkmark-outline', 'Pending permissions', summary.pending_requests, '#F59E0B'],
            ].map(([icon, label, value, color]) => (
              <View key={String(label)} style={[styles.statCard, isWide && styles.statCardWide]}>
                <View style={[styles.statIcon, { backgroundColor: `${color}18` }]}><Ionicons name={icon as any} size={22} color={String(color)} /></View>
                <Text style={styles.statValue}>{String(value)}</Text><Text style={styles.statLabel}>{String(label)}</Text>
              </View>
            ))}
            <View style={styles.callout}>
              <Ionicons name="information-circle-outline" size={20} color="#4F46E5" />
              <Text style={styles.calloutText}>Admin controls hostel fees and setup. Accountant authority is deliberately limited to assigning and removing hostel students.</Text>
            </View>
          </View>
        ) : null}

        {tab === 'setup' ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View><Text style={styles.sectionTitle}>Blocks and rooms</Text><Text style={styles.sectionSub}>Monthly room fee is the fee shown to parents.</Text></View>
              <TouchableOpacity style={styles.primaryButton} onPress={() => openBlock()}><Ionicons name="add" size={18} color="#fff" /><Text style={styles.primaryButtonText}>Block</Text></TouchableOpacity>
            </View>
            {blocks.length === 0 ? <Empty icon="business-outline" title="No hostel blocks" text="Create a block first, then add rooms and fees." styles={styles} /> : blocks.map((block) => (
              <View key={block.id} style={styles.blockCard}>
                <View style={styles.blockHeader}>
                  <View style={{ flex: 1 }}><Text style={styles.cardTitle}>{block.name}</Text><Text style={styles.cardMeta}>{block.code || 'No code'} · {block.occupied_beds}/{block.total_capacity} occupied</Text></View>
                  <IconButton icon="create-outline" onPress={() => openBlock(block)} styles={styles} />
                  <IconButton icon="trash-outline" danger onPress={() => confirmDeleteBlock(block)} styles={styles} />
                </View>
                <View style={styles.roomList}>
                  {rooms.filter((room) => room.block_id === block.id).map((room) => (
                    <View key={room.id} style={styles.roomRow}>
                      <View style={styles.roomIcon}><Ionicons name="bed-outline" size={18} color="#4F46E5" /></View>
                      <View style={{ flex: 1 }}><Text style={styles.roomName}>Room {room.room_no}</Text><Text style={styles.cardMeta}>{room.room_type} · {room.occupied_beds}/{room.capacity} beds · {money(room.monthly_fee)}/month</Text></View>
                      <IconButton icon="create-outline" onPress={() => openRoom(room)} styles={styles} />
                      <IconButton icon="trash-outline" danger onPress={() => confirmDeleteRoom(room)} styles={styles} />
                    </View>
                  ))}
                  <TouchableOpacity style={styles.addRoomButton} onPress={() => openRoom(undefined, block.id)}><Ionicons name="add-circle-outline" size={18} color="#4F46E5" /><Text style={styles.addRoomText}>Add room to {block.name}</Text></TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {tab === 'students' ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>Student assignments</Text><Text style={styles.sectionSub}>{students.filter((s) => s.allocation_id).length} currently assigned</Text></View></View>
            <View style={styles.searchBox}><Ionicons name="search" size={18} color={theme.colors.textSecondary} /><TextInput value={query} onChangeText={setQuery} placeholder="Search name, admission no, class or room" placeholderTextColor={theme.colors.textMuted} style={styles.searchInput} /></View>
            {!academicYear ? <Empty icon="calendar-outline" title="No active academic year" text="Create or activate an academic year before assigning hostel students." styles={styles} /> : visibleStudents.length === 0 ? <Empty icon="people-outline" title="No matching students" text="Try a different name or admission number." styles={styles} /> : visibleStudents.map((student) => (
              <View key={student.id} style={styles.studentRow}>
                <View style={styles.avatar}><Text style={styles.avatarText}>{student.student_name?.[0]?.toUpperCase() || '?'}</Text></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{student.student_name}</Text>
                  <Text style={styles.cardMeta}>{student.admission_no} · {[student.class_name, student.section_name].filter(Boolean).join(' ') || 'Class not assigned'}</Text>
                  <Text style={[styles.assignmentText, !student.allocation_id && styles.unassignedText]}>{student.allocation_id ? `${student.block_name} · Room ${student.room_no}${student.bed_no ? ` · Bed ${student.bed_no}` : ''}` : 'Not assigned to hostel'}</Text>
                </View>
                <View style={styles.rowActions}>
                  <TouchableOpacity style={styles.assignButton} onPress={() => openAssignment(student)}><Text style={styles.assignButtonText}>{student.allocation_id ? 'Move' : 'Assign'}</Text></TouchableOpacity>
                  {student.allocation_id ? <TouchableOpacity style={styles.removeButton} onPress={() => confirmRemoveStudent(student)}><Ionicons name="person-remove-outline" size={17} color="#DC2626" /></TouchableOpacity> : null}
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {tab === 'requests' ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>Parent permission requests</Text><Text style={styles.sectionSub}>Approve valid requests or permanently delete them.</Text></View></View>
            {requests.length === 0 ? <Empty icon="shield-checkmark-outline" title="No permission requests" text="Parent requests will appear here." styles={styles} /> : requests.map((request) => (
              <View key={request.id} style={styles.requestCard}>
                <View style={styles.requestTop}><View style={[styles.statusPill, request.status === 'approved' && styles.approvedPill]}><Text style={[styles.statusText, request.status === 'approved' && styles.approvedText]}>{request.status.toUpperCase()}</Text></View><Text style={styles.requestType}>{REQUEST_LABELS[request.request_type] || request.request_type}</Text></View>
                <Text style={styles.cardTitle}>{request.student_name || 'Student'} <Text style={styles.cardMeta}>({request.admission_no})</Text></Text>
                <Text style={styles.cardMeta}>{request.block_name || 'Hostel'} · Room {request.room_no || '—'} · {shortDate(request.starts_on)} to {shortDate(request.ends_on)}</Text>
                <Text style={styles.reason}>{request.reason}</Text>
                <View style={styles.requestActions}>
                  {request.status === 'pending' ? <TouchableOpacity style={styles.approveButton} onPress={() => void approveRequest(request)}><Ionicons name="checkmark-circle-outline" size={18} color="#fff" /><Text style={styles.approveTextButton}>Approve</Text></TouchableOpacity> : null}
                  <TouchableOpacity style={styles.deleteRequestButton} onPress={() => deleteRequest(request)}><Ionicons name="trash-outline" size={17} color="#DC2626" /><Text style={styles.deleteRequestText}>Delete</Text></TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>

      <EditorModal visible={blockModal} title={editingBlock ? 'Edit hostel block' : 'Create hostel block'} onClose={() => setBlockModal(false)} onSave={() => void saveBlock()} saving={saving} styles={styles}>
        <Field label="Block name" value={blockName} onChangeText={setBlockName} placeholder="Example: Boys Block A" styles={styles} />
        <Field label="Short code" value={blockCode} onChangeText={setBlockCode} placeholder="Example: B-A" styles={styles} />
      </EditorModal>

      <EditorModal visible={roomModal} title={editingRoom ? 'Edit room and fee' : 'Add hostel room'} onClose={() => setRoomModal(false)} onSave={() => void saveRoom()} saving={saving} styles={styles}>
        {!editingRoom ? <><Text style={styles.fieldLabel}>Block</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choiceRow}>{blocks.map((block) => <Pressable key={block.id} onPress={() => setRoomBlockId(block.id)} style={[styles.choiceChip, roomBlockId === block.id && styles.choiceChipActive]}><Text style={[styles.choiceText, roomBlockId === block.id && styles.choiceTextActive]}>{block.name}</Text></Pressable>)}</ScrollView></> : null}
        <Field label="Room number" value={roomNo} onChangeText={setRoomNo} placeholder="Example: 101" styles={styles} />
        <View style={styles.twoFields}><View style={{ flex: 1 }}><Field label="Floor" value={roomFloor} onChangeText={setRoomFloor} placeholder="0" keyboardType="number-pad" styles={styles} /></View><View style={{ flex: 1 }}><Field label="Bed capacity" value={roomCapacity} onChangeText={setRoomCapacity} placeholder="2" keyboardType="number-pad" styles={styles} /></View></View>
        <Field label="Room type" value={roomType} onChangeText={setRoomType} placeholder="shared or single" styles={styles} />
        <Field label="Monthly hostel fee" value={roomFee} onChangeText={setRoomFee} placeholder="Example: 4500" keyboardType="decimal-pad" styles={styles} />
        <Text style={styles.fieldHint}>Parents see this monthly fee and its 12-month annual estimate.</Text>
      </EditorModal>

      <EditorModal visible={Boolean(assignStudent)} title={`Assign ${assignStudent?.student_name || 'student'}`} onClose={() => setAssignStudent(null)} onSave={() => void saveAssignment()} saving={saving} styles={styles}>
        <Text style={styles.fieldLabel}>Available room</Text>
        <ScrollView style={{ maxHeight: 260 }} contentContainerStyle={{ gap: 8 }}>
          {rooms.filter((room) => room.is_available && (room.occupied_beds < room.capacity || room.id === assignStudent?.room_id)).map((room) => (
            <Pressable key={room.id} onPress={() => setAssignRoomId(room.id)} style={[styles.roomChoice, assignRoomId === room.id && styles.roomChoiceActive]}>
              <View style={{ flex: 1 }}><Text style={styles.roomName}>{room.block_name} · Room {room.room_no}</Text><Text style={styles.cardMeta}>{room.occupied_beds}/{room.capacity} occupied · {money(room.monthly_fee)}/month</Text></View>
              {assignRoomId === room.id ? <Ionicons name="checkmark-circle" size={22} color="#4F46E5" /> : null}
            </Pressable>
          ))}
        </ScrollView>
        <Field label="Bed number (optional)" value={assignBedNo} onChangeText={setAssignBedNo} placeholder="Example: 1" keyboardType="number-pad" styles={styles} />
      </EditorModal>
    </View>
  );
}

function IconButton({ icon, danger, onPress, styles }: any) {
  return <Pressable onPress={onPress} style={[styles.iconButton, danger && styles.iconButtonDanger]}><Ionicons name={icon} size={17} color={danger ? '#DC2626' : '#4F46E5'} /></Pressable>;
}

function Empty({ icon, title, text, styles }: any) {
  return <View style={styles.empty}><Ionicons name={icon} size={32} color="#94A3B8" /><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptyText}>{text}</Text></View>;
}

function Field({ label, styles, ...props }: any) {
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput {...props} placeholderTextColor="#94A3B8" style={styles.input} /></View>;
}

function EditorModal({ visible, title, children, onClose, onSave, saving, styles }: any) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}><Text style={styles.modalTitle}>{title}</Text><Pressable onPress={onClose}><Ionicons name="close" size={24} color="#64748B" /></Pressable></View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalBody}>{children}</ScrollView>
          <View style={styles.modalFooter}><TouchableOpacity style={styles.cancelButton} onPress={onClose}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity><TouchableOpacity disabled={saving} style={[styles.saveButton, saving && { opacity: 0.6 }]} onPress={onSave}><Text style={styles.saveText}>{saving ? 'Saving…' : 'Save'}</Text></TouchableOpacity></View>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(theme: any, isDark: boolean) {
  const card = theme.colors.card;
  const border = theme.colors.border;
  const text = theme.colors.text;
  const secondary = theme.colors.textSecondary;
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.colors.background },
    content: { padding: 16, paddingBottom: 48, gap: 16 },
    contentWide: { width: '100%', maxWidth: 1180, alignSelf: 'center', padding: 28 },
    hero: { borderRadius: 24, padding: 22, flexDirection: 'row', alignItems: 'center', gap: 16, overflow: 'hidden' },
    heroIcon: { width: 58, height: 58, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
    heroCopy: { flex: 1 }, heroEyebrow: { color: '#C7D2FE', fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
    heroTitle: { color: '#fff', fontSize: 22, fontWeight: '900', marginTop: 3 }, heroText: { color: 'rgba(255,255,255,0.72)', fontSize: 12, lineHeight: 18, marginTop: 5 },
    heroPill: { backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 }, heroPillText: { color: '#fff', fontWeight: '800', fontSize: 11 },
    tabs: { gap: 8, paddingVertical: 2 }, tab: { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: card, borderWidth: 1, borderColor: border },
    tabActive: { backgroundColor: '#4F46E5', borderColor: '#4F46E5' }, tabText: { color: secondary, fontWeight: '700', fontSize: 12 }, tabTextActive: { color: '#fff' },
    badge: { minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#F59E0B', alignItems: 'center', justifyContent: 'center' }, badgeText: { color: '#fff', fontSize: 10, fontWeight: '900' },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, statCard: { width: '48%', minWidth: 145, backgroundColor: card, borderRadius: 18, padding: 18, borderWidth: 1, borderColor: border }, statCardWide: { flex: 1, minWidth: 190 },
    statIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginBottom: 14 }, statValue: { color: text, fontSize: 25, fontWeight: '900' }, statLabel: { color: secondary, fontSize: 12, fontWeight: '600', marginTop: 3 },
    callout: { width: '100%', flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: isDark ? 'rgba(79,70,229,0.12)' : '#EEF2FF', borderRadius: 15, padding: 15 }, calloutText: { color: text, flex: 1, fontSize: 12, lineHeight: 18, fontWeight: '600' },
    section: { gap: 12 }, sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }, sectionTitle: { color: text, fontSize: 19, fontWeight: '900' }, sectionSub: { color: secondary, fontSize: 11, marginTop: 3 },
    primaryButton: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#4F46E5', borderRadius: 11, paddingHorizontal: 13, paddingVertical: 9 }, primaryButtonText: { color: '#fff', fontWeight: '800', fontSize: 12 },
    blockCard: { backgroundColor: card, borderRadius: 18, borderWidth: 1, borderColor: border, overflow: 'hidden' }, blockHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 16 }, cardTitle: { color: text, fontSize: 14, fontWeight: '800' }, cardMeta: { color: secondary, fontSize: 11, marginTop: 3 },
    iconButton: { width: 34, height: 34, borderRadius: 10, backgroundColor: isDark ? 'rgba(99,102,241,0.13)' : '#EEF2FF', alignItems: 'center', justifyContent: 'center' }, iconButtonDanger: { backgroundColor: isDark ? 'rgba(220,38,38,0.12)' : '#FEF2F2' },
    roomList: { borderTopWidth: 1, borderTopColor: border }, roomRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: border }, roomIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: isDark ? 'rgba(99,102,241,0.13)' : '#EEF2FF', alignItems: 'center', justifyContent: 'center' }, roomName: { color: text, fontSize: 13, fontWeight: '800' },
    addRoomButton: { flexDirection: 'row', alignItems: 'center', gap: 7, padding: 14 }, addRoomText: { color: '#4F46E5', fontSize: 12, fontWeight: '800' },
    searchBox: { flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: card, borderWidth: 1, borderColor: border, borderRadius: 13, paddingHorizontal: 13 }, searchInput: { flex: 1, color: text, paddingVertical: Platform.OS === 'web' ? 12 : 10, outlineStyle: 'none' } as any,
    studentRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: card, borderRadius: 16, borderWidth: 1, borderColor: border, padding: 14 }, avatar: { width: 42, height: 42, borderRadius: 13, backgroundColor: '#4F46E5', alignItems: 'center', justifyContent: 'center' }, avatarText: { color: '#fff', fontWeight: '900', fontSize: 16 },
    assignmentText: { color: '#059669', fontSize: 11, fontWeight: '700', marginTop: 5 }, unassignedText: { color: '#D97706' }, rowActions: { flexDirection: 'row', alignItems: 'center', gap: 7 }, assignButton: { backgroundColor: '#EEF2FF', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 }, assignButtonText: { color: '#4F46E5', fontSize: 11, fontWeight: '900' }, removeButton: { width: 34, height: 34, backgroundColor: '#FEF2F2', borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    requestCard: { backgroundColor: card, borderRadius: 17, borderWidth: 1, borderColor: border, padding: 16, gap: 7 }, requestTop: { flexDirection: 'row', alignItems: 'center', gap: 8 }, requestType: { color: '#4F46E5', fontWeight: '800', fontSize: 12 }, statusPill: { backgroundColor: '#FEF3C7', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 }, approvedPill: { backgroundColor: '#D1FAE5' }, statusText: { color: '#B45309', fontSize: 9, fontWeight: '900' }, approvedText: { color: '#047857' }, reason: { color: text, fontSize: 12, lineHeight: 18, marginTop: 3 },
    requestActions: { flexDirection: 'row', gap: 8, marginTop: 6 }, approveButton: { flexDirection: 'row', gap: 6, alignItems: 'center', backgroundColor: '#059669', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 }, approveTextButton: { color: '#fff', fontWeight: '800', fontSize: 11 }, deleteRequestButton: { flexDirection: 'row', gap: 6, alignItems: 'center', backgroundColor: '#FEF2F2', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 }, deleteRequestText: { color: '#DC2626', fontWeight: '800', fontSize: 11 },
    empty: { alignItems: 'center', padding: 36, backgroundColor: card, borderRadius: 18, borderWidth: 1, borderColor: border }, emptyTitle: { color: text, fontWeight: '800', fontSize: 15, marginTop: 10 }, emptyText: { color: secondary, fontSize: 11, marginTop: 4, textAlign: 'center' },
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.60)', alignItems: 'center', justifyContent: 'center', padding: 18 }, modalCard: { width: '100%', maxWidth: 560, maxHeight: '88%', backgroundColor: card, borderRadius: 22, overflow: 'hidden' }, modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18, borderBottomWidth: 1, borderBottomColor: border }, modalTitle: { color: text, fontSize: 17, fontWeight: '900' }, modalBody: { padding: 18, gap: 14 }, modalFooter: { flexDirection: 'row', justifyContent: 'flex-end', gap: 9, padding: 16, borderTopWidth: 1, borderTopColor: border },
    field: { gap: 6 }, fieldLabel: { color: text, fontSize: 11, fontWeight: '800' }, input: { color: text, backgroundColor: theme.colors.background, borderWidth: 1, borderColor: border, borderRadius: 11, paddingHorizontal: 12, paddingVertical: 11, outlineStyle: 'none' } as any, fieldHint: { color: secondary, fontSize: 10, lineHeight: 15 }, twoFields: { flexDirection: 'row', gap: 10 },
    choiceRow: { gap: 8, paddingVertical: 4 }, choiceChip: { borderRadius: 10, borderWidth: 1, borderColor: border, paddingHorizontal: 12, paddingVertical: 8 }, choiceChipActive: { backgroundColor: '#4F46E5', borderColor: '#4F46E5' }, choiceText: { color: secondary, fontWeight: '700', fontSize: 11 }, choiceTextActive: { color: '#fff' }, roomChoice: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: border }, roomChoiceActive: { borderColor: '#4F46E5', backgroundColor: isDark ? 'rgba(79,70,229,0.10)' : '#EEF2FF' },
    cancelButton: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: theme.colors.background }, cancelText: { color: secondary, fontWeight: '800' }, saveButton: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, backgroundColor: '#4F46E5' }, saveText: { color: '#fff', fontWeight: '900' },
  });
}
