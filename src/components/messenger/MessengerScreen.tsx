/**
 * MessengerScreen — shared directory-style messenger for admin & teacher portals.
 *   • A "Chats" tab (conversations incl. groups)
 *   • One or more directory tabs (filtered by role) to start new 1:1 chats
 *   • Optional admin-only group creation (broadcast or open chat)
 */
import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Platform, TextInput, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

import ScreenLayout from '@/src/components/ScreenLayout';
import { useAuth } from '@/src/hooks/useAuth';
import { useConversations, useEligibleRecipients, useSupportContact } from '@/src/hooks/useMessages';
import {
  MessagesService,
  type Conversation,
  type GroupMode,
  type MessengerRole,
  type Recipient,
} from '@/src/services/messagesService';
import ChatThread from './ChatThread';
import { Avatar, ConversationRow, PinnedSupportCard, PressScale, RecipientRow } from './parts';

export interface DirectoryTab {
  key: string;
  label: string;
  roles: MessengerRole[];
}

interface Props {
  title: string;
  directoryTabs: DirectoryTab[];
  pinAdminInDirectory?: boolean;
  canCreateGroup?: boolean;
  /**
   * Render the list-view header using the host portal's common header
   * (StaffHeader / AdminHeader) so the messenger matches every other page in
   * that login. Receives `onBack` and, for `canCreateGroup` portals,
   * `onCreateGroup` to wire into the header's right action. Falls back to the
   * built-in header when omitted.
   */
  renderHeader?: (opts: { onBack: () => void; onCreateGroup: () => void }) => React.ReactNode;
}

const rank = (r: Recipient, pinAdmin?: boolean) =>
  pinAdmin && r.role === 'admin' ? 0 : 1;

export default function MessengerScreen({ title, directoryTabs, pinAdminInDirectory, canCreateGroup, renderHeader }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const router = useRouter();

  const [view, setView] = useState<'list' | 'thread' | 'group'>('list');
  const [tab, setTab] = useState<string>('chats');
  const [search, setSearch] = useState('');
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [activeRecipient, setActiveRecipient] = useState<Recipient | null>(null);

  // Group-create form state
  const [groupName, setGroupName] = useState('');
  const [groupMode, setGroupMode] = useState<GroupMode>('chat');
  const [selected, setSelected] = useState<Record<string, Recipient>>({});
  const [creating, setCreating] = useState(false);

  const { data: conversations, refetch: refetchConvos, loading: loadingConvos } = useConversations();
  const { data: recipients } = useEligibleRecipients();
  const { data: support } = useSupportContact();
  const supportConversation = useMemo(
    () => support ? conversations?.find((c) => c.other_user_id === support.user_id && c.pair_type === 'support') || null : null,
    [support, conversations],
  );
  const regularConversations = useMemo(
    () => (conversations || []).filter((c) => c.pair_type !== 'support'),
    [conversations],
  );

  const activeDirTab = directoryTabs.find((d) => d.key === tab);

  const directoryList = useMemo(() => {
    if (!activeDirTab || !recipients) return [];
    const q = search.trim().toLowerCase();
    const sorted = recipients
      .filter((r) => activeDirTab.roles.includes(r.role))
      .filter((r) => !q || r.display_name.toLowerCase().includes(q) || (r.student_name || '').toLowerCase().includes(q))
      .sort(
        (a, b) => rank(a, pinAdminInDirectory) - rank(b, pinAdminInDirectory) || a.display_name.localeCompare(b.display_name),
      );
    // Collapse multiple admin accounts into a SINGLE pinned admin card.
    let adminKept = false;
    return sorted.filter((r) => {
      if (r.role === 'admin') {
        if (adminKept) return false;
        adminKept = true;
      }
      return true;
    });
  }, [activeDirTab, recipients, search, pinAdminInDirectory]);

  // Members admin can add to a group (teachers + students/parents).
  const groupCandidates = useMemo(() => {
    if (!recipients) return [];
    const q = search.trim().toLowerCase();
    const seen = new Set<string>();
    return recipients
      .filter((r) => r.role !== 'admin')
      .filter((r) => {
        if (seen.has(r.user_id)) return false;
        seen.add(r.user_id);
        return true;
      })
      .filter((r) => !q || r.display_name.toLowerCase().includes(q))
      .sort((a, b) => a.display_name.localeCompare(b.display_name));
  }, [recipients, search]);

  const openConversation = useCallback((c: Conversation) => {
    setActiveConv(c);
    setActiveRecipient(null);
    setView('thread');
  }, []);

  const openRecipient = useCallback((r: Recipient) => {
    setActiveRecipient(r);
    setActiveConv(null);
    setView('thread');
  }, []);

  const openSupport = useCallback(() => {
    if (!support) return;
    if (supportConversation) openConversation(supportConversation);
    else openRecipient(support);
  }, [support, supportConversation, openConversation, openRecipient]);

  const handleBack = () => {
    if (view === 'thread' || view === 'group') {
      setView('list');
      setActiveConv(null);
      setActiveRecipient(null);
      setSearch('');
      refetchConvos();
    } else {
      router.back();
    }
  };

  const selectedCount = Object.keys(selected).length;

  const toggleMember = (r: Recipient) =>
    setSelected((prev) => {
      const next = { ...prev };
      if (next[r.user_id]) delete next[r.user_id];
      else next[r.user_id] = r;
      return next;
    });

  const handleCreateGroup = async () => {
    if (!groupName.trim() || selectedCount === 0 || creating) return;
    setCreating(true);
    try {
      const conv = await MessagesService.createGroup({
        group_name: groupName.trim(),
        group_mode: groupMode,
        member_user_ids: Object.keys(selected),
      });
      setGroupName('');
      setSelected({});
      setSearch('');
      refetchConvos();
      openConversation(conv);
    } catch (err) {
      console.warn('Failed to create group', err);
    } finally {
      setCreating(false);
    }
  };

  // ─── Thread ──────────────────────────────────────────────────────────────────
  if (view === 'thread') {
    return (
      <ScreenLayout style={{ backgroundColor: '#F8FAFC' }}>
        <ChatThread
          conversation={activeConv}
          recipient={activeRecipient}
          currentUserId={user?.userId}
          onBack={handleBack}
          onConversationCreated={(c) => setActiveConv(c)}
        />
      </ScreenLayout>
    );
  }

  // ─── Group create ─────────────────────────────────────────────────────────────
  if (view === 'group') {
    return (
      <ScreenLayout style={{ backgroundColor: '#F8FAFC' }}>
        <Animated.View entering={FadeInDown.duration(250)} style={{ flex: 1 }}>
          <View style={styles.header}>
            <PressScale onPress={handleBack} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={24} color="#1E293B" />
            </PressScale>
            <Text style={styles.headerTitle}>{t('messages.new_group', 'New Group')}</Text>
            <PressScale
              onPress={handleCreateGroup}
              disabled={!groupName.trim() || selectedCount === 0 || creating}
              style={[styles.createBtn, (!groupName.trim() || selectedCount === 0 || creating) && { opacity: 0.4 }]}
            >
              <Text style={styles.createBtnText}>{t('messages.create', 'Create')}</Text>
            </PressScale>
          </View>

          <FlatList
            data={groupCandidates}
            keyExtractor={(r: Recipient) => r.user_id}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={
              <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
                <TextInput
                  value={groupName}
                  onChangeText={setGroupName}
                  placeholder={t('messages.group_name', 'Group name')}
                  placeholderTextColor="#94A3B8"
                  style={styles.groupNameInput}
                  maxLength={120}
                />
                <View style={styles.modeRow}>
                  {(['chat', 'broadcast'] as GroupMode[]).map((m) => (
                    <Pressable key={m} onPress={() => setGroupMode(m)} style={[styles.modeChip, groupMode === m && styles.modeChipActive]}>
                      <Ionicons
                        name={m === 'chat' ? 'chatbubbles-outline' : 'megaphone-outline'}
                        size={15}
                        color={groupMode === m ? '#4F6EF7' : '#64748B'}
                      />
                      <Text style={[styles.modeChipText, groupMode === m && { color: '#4F6EF7' }]}>
                        {m === 'chat' ? t('messages.mode_chat', 'Group chat') : t('messages.mode_broadcast', 'Broadcast')}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <View style={styles.searchBar}>
                  <Ionicons name="search" size={18} color="#94A3B8" />
                  <TextInput
                    value={search}
                    onChangeText={setSearch}
                    placeholder={t('messages.search_members', 'Search teachers or students...')}
                    placeholderTextColor="#94A3B8"
                    style={styles.searchInput}
                  />
                </View>
                <Text style={styles.sectionLabel}>
                  {selectedCount > 0
                    ? `${selectedCount} ${t('messages.selected', 'selected')}`
                    : t('messages.add_members', 'Add members')}
                </Text>
              </View>
            }
            renderItem={({ item }: { item: Recipient }) => {
              const isSel = !!selected[item.user_id];
              return (
                <Pressable onPress={() => toggleMember(item)} style={[styles.memberRow, isSel && styles.memberRowSel]}>
                  <Avatar name={item.display_name} size={40} role={item.role} />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text numberOfLines={1} style={styles.memberName}>
                      {item.display_name}
                    </Text>
                    <Text style={styles.memberSub}>
                      {item.role === 'teacher' || item.role === 'staff'
                        ? t('roles.teacher_singular', 'Teacher')
                        : t('roles.student_singular', 'Student')}
                    </Text>
                  </View>
                  <Ionicons
                    name={isSel ? 'checkmark-circle' : 'ellipse-outline'}
                    size={24}
                    color={isSel ? '#4F6EF7' : '#CBD5E1'}
                  />
                </Pressable>
              );
            }}
            contentContainerStyle={{ paddingBottom: 40 }}
          />
        </Animated.View>
      </ScreenLayout>
    );
  }

  // ─── List (Chats + directory tabs) ────────────────────────────────────────────
  const showingChats = tab === 'chats';

  const openGroupCreate = () => { setSearch(''); setView('group'); };

  return (
    <ScreenLayout style={{ backgroundColor: '#F8FAFC' }}>
      <Animated.View entering={FadeInDown.duration(250)} exiting={FadeOut.duration(150)} style={{ flex: 1 }}>
        {renderHeader ? (
          renderHeader({ onBack: handleBack, onCreateGroup: openGroupCreate })
        ) : (
          <View style={styles.header}>
            <PressScale onPress={handleBack} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={24} color="#1E293B" />
            </PressScale>
            <Text style={styles.headerTitle}>{title}</Text>
            {canCreateGroup && (
              <PressScale onPress={openGroupCreate} style={styles.iconBtn}>
                <Ionicons name="people-circle-outline" size={26} color="#4F6EF7" />
              </PressScale>
            )}
          </View>
        )}

        {/* Segmented tabs */}
        <View style={styles.tabBar}>
          {[{ key: 'chats', label: t('messages.tab_chats', 'Chats') }, ...directoryTabs].map((tb) => (
            <Pressable
              key={tb.key}
              onPress={() => { setTab(tb.key); setSearch(''); }}
              style={[styles.tabItem, tab === tb.key && styles.tabItemActive]}
            >
              <Text style={[styles.tabText, tab === tb.key && styles.tabTextActive]}>{tb.label}</Text>
            </Pressable>
          ))}
        </View>

        {!showingChats && (
          <View style={styles.searchBarWrap}>
            <View style={styles.searchBar}>
              <Ionicons name="search" size={18} color="#94A3B8" />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder={t('messages.search_recipient', 'Search by name...')}
                placeholderTextColor="#94A3B8"
                style={styles.searchInput}
              />
              {!!search && (
                <Pressable onPress={() => setSearch('')} hitSlop={8}>
                  <Ionicons name="close-circle" size={18} color="#CBD5E1" />
                </Pressable>
              )}
            </View>
          </View>
        )}

        {showingChats ? (
          <FlatList
            data={regularConversations}
            keyExtractor={(item: Conversation) => item.id}
            renderItem={({ item }: { item: Conversation }) => (
              <ConversationRow item={item} onPress={() => openConversation(item)} />
            )}
            contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
            refreshing={loadingConvos}
            onRefresh={refetchConvos}
            ListHeaderComponent={support ? <PinnedSupportCard support={support} conversation={supportConversation} onPress={openSupport} /> : null}
            ListEmptyComponent={
              !loadingConvos ? (
                <View style={styles.empty}>
                  <View style={styles.emptyIcon}>
                    <Ionicons name="chatbubbles-outline" size={28} color="#4F6EF7" />
                  </View>
                  <Text style={styles.emptyTitle}>{t('messages.empty_title', 'No conversations yet')}</Text>
                  <Text style={styles.emptyDesc}>
                    {t('messages.directory_hint', 'Use the tabs above to find someone and start chatting.')}
                  </Text>
                </View>
              ) : null
            }
          />
        ) : (
          <FlatList
            data={directoryList}
            keyExtractor={(r: Recipient) => `${r.user_id}_${r.student_id || 'none'}`}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }: { item: Recipient }) => (
              <RecipientRow item={item} onPress={() => openRecipient(item)} pinned={pinAdminInDirectory && item.role === 'admin'} />
            )}
            contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
            ListEmptyComponent={<Text style={styles.noResults}>{t('messages.no_results', 'No matches found.')}</Text>}
          />
        )}
      </Animated.View>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 60,
    paddingHorizontal: 8,
    backgroundColor: '#FFFFFF',
  },
  backBtn: { padding: 8, marginRight: 4 },
  iconBtn: { padding: 8 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: '#0F172A', letterSpacing: -0.2 },
  createBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14, backgroundColor: '#4F6EF7' },
  createBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },

  tabBar: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  tabItem: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F1F5F9' },
  tabItemActive: { backgroundColor: '#EEF2FF' },
  tabText: { fontSize: 14, fontWeight: '600', color: '#64748B' },
  tabTextActive: { color: '#4F6EF7' },

  searchBarWrap: { paddingHorizontal: 16, paddingTop: 12 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    marginTop: 12,
  },
  searchInput: { flex: 1, fontSize: 15, color: '#1E293B' },

  empty: { alignItems: 'center', marginTop: 60, paddingHorizontal: 24 },
  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#0F172A' },
  emptyDesc: { fontSize: 14, color: '#64748B', marginTop: 6, textAlign: 'center' },
  noResults: { textAlign: 'center', color: '#94A3B8', marginTop: 40, fontSize: 14 },

  // Group create
  groupNameInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 16,
    height: 50,
    fontSize: 16,
    color: '#1E293B',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modeRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  modeChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modeChipActive: { borderColor: '#4F6EF7', backgroundColor: '#EEF2FF' },
  modeChipText: { fontSize: 13, fontWeight: '600', color: '#64748B' },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: '#475569', marginTop: 18, marginBottom: 4 },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(76,90,120,0.07)',
  },
  memberRowSel: { borderColor: '#4F6EF7', backgroundColor: '#F5F7FF' },
  memberName: { fontSize: 15, fontWeight: '600', color: '#1E293B' },
  memberSub: { fontSize: 12, color: '#64748B', marginTop: 1 },
});
