import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  TextInput,
  FlatList,
  ScrollView,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

import { useRequireRole } from '@/src/hooks/useRequireRole';
import { useAuth } from '@/src/hooks/useAuth';
import {
  useConversations,
  useThreadMessages,
  useEligibleRecipients,
  useSupportContact,
} from '@/src/hooks/useMessages';
import type { Conversation, Message, Recipient } from '@/src/services/messagesService';

import ScreenLayout from '@/src/components/ScreenLayout';
import StudentHeader from '@/src/components/StudentHeader';
import { useTheme } from '@/src/hooks/useTheme';
import { SchoolBackground } from '@/components/SchoolBackground';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PressScaleInline = ({ children, onPress, style, disabled }: any) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    style={({ pressed }) => [style, { opacity: pressed ? 0.7 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] }]}
  >
    {children}
  </Pressable>
);

const roleTint: Record<string, { bg: string; fg: string }> = {
  admin: { bg: '#FFE9D6', fg: '#C2410C' },
  teacher: { bg: '#E3EAFF', fg: '#2A50D8' },
  parent: { bg: '#DCFCE7', fg: '#15803D' },
  student: { bg: '#DCFCE7', fg: '#15803D' },
  support: { bg: '#E8E7FF', fg: '#4F46E5' },
};

const Avatar = ({ name, size = 44, role, photoUrl }: { name: string; size?: number; role?: string; photoUrl?: string | null }) => {
  if (photoUrl) {
    return (
      <Image
        source={{ uri: photoUrl }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        resizeMode="cover"
      />
    );
  }

  const initials = (name || '?')
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const tint = roleTint[role || 'teacher'] || roleTint.teacher;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: tint.bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {role === 'support' ? (
        <Ionicons name="headset" size={size * 0.46} color={tint.fg} />
      ) : (
        <Text style={{ fontSize: size * 0.36, fontWeight: '700', color: tint.fg }}>{initials}</Text>
      )}
    </View>
  );
};

// ─── Sub-Components ───────────────────────────────────────────────────────────

/** A tappable "start a chat with this person" row (used in empty-state + picker). */
const RecipientRow = React.memo(
  ({ item, onPress, pinned }: { item: Recipient; onPress: () => void; pinned?: boolean }) => {
    const { t } = useTranslation();
    const { theme } = useTheme();
    const roleLabel =
      item.role === 'admin'
        ? t('roles.admin_singular', 'Admin')
        : item.role === 'teacher'
          ? t('roles.teacher_singular', 'Teacher')
          : t('roles.parent_singular', 'Parent');
    return (
      <PressScaleInline onPress={onPress} style={[styles.recipientRow, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
        <Avatar name={item.display_name} size={46} role={item.role} photoUrl={item.photo_url} />
        <View style={{ marginLeft: 12, flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text numberOfLines={1} style={[styles.recipientName, { color: theme.colors.textStrong }]}>
              {item.display_name}
            </Text>
            {pinned && <Ionicons name="pin" size={13} color={theme.colors.textMuted} />}
          </View>
          <Text numberOfLines={1} style={[styles.recipientSub, { color: theme.colors.textSecondary }]}>
            {roleLabel}
            {item.student_name ? ` · ${item.student_name}` : ''}
          </Text>
        </View>
        <View style={[styles.chatChip, { backgroundColor: theme.colors.navPill }]}>
          <Ionicons name="chatbubble-ellipses" size={16} color={theme.colors.primary} />
        </View>
      </PressScaleInline>
    );
  },
);

const ConversationRow = React.memo(({ item, onPress }: { item: Conversation; onPress: () => void }) => {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const dateStr = item.last_message_at
    ? new Date(item.last_message_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : '';

  return (
    <PressScaleInline onPress={onPress}>
      <View style={[styles.convoRow, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
        <Avatar name={item.other_user_name || ''} size={48} photoUrl={item.other_user_photo} />
        <View style={{ flex: 1, marginLeft: 14, justifyContent: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: '600', color: theme.colors.textStrong, flex: 1 }}>
              {item.other_user_name || ''}
            </Text>
            {!!dateStr && <Text style={{ fontSize: 12, color: theme.colors.textMuted, marginLeft: 8 }}>{dateStr}</Text>}
          </View>

          <Text numberOfLines={1} style={{ fontSize: 14, color: theme.colors.textSecondary, marginTop: 4 }}>
            {item.last_message_preview || t('messages.no_messages', 'No messages yet')}
          </Text>
        </View>
        {item.unread_count > 0 && (
          <View style={styles.unreadBadge}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#FFFFFF' }}>
              {item.unread_count > 99 ? '99+' : item.unread_count}
            </Text>
          </View>
        )}
      </View>
    </PressScaleInline>
  );
});

const MessageBubble = React.memo(({ item, isMine, status, onRetry, theme }: { item: Message; isMine: boolean; status?: string; onRetry: () => void; theme: any }) => {
  const timeStr = new Date(item.created_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  return (
    <View style={{ flexDirection: 'row', justifyContent: isMine ? 'flex-end' : 'flex-start', marginVertical: 3 }}>
      <View
        style={[
          styles.bubble,
          isMine
            ? { backgroundColor: theme.colors.primary, borderBottomRightRadius: 4 }
            : { backgroundColor: theme.colors.surface, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: theme.colors.border },
          { opacity: status === 'sending' ? 0.7 : 1 },
        ]}
      >
        <Text style={{ fontSize: 15, color: isMine ? '#FFFFFF' : theme.colors.textStrong, lineHeight: 21 }}>{item.body}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 3, gap: 4 }}>
          <Text style={{ fontSize: 10.5, color: isMine ? 'rgba(255,255,255,0.75)' : theme.colors.textSecondary }}>{timeStr}</Text>
          {isMine && status === 'sending' && <Ionicons name="time-outline" size={13} color="rgba(255,255,255,0.8)" />}
          {isMine && status === 'sent' && <Ionicons name="checkmark-outline" size={14} color="rgba(255,255,255,0.85)" />}
          {isMine && status === 'delivered' && <Ionicons name="checkmark-done-outline" size={14} color="rgba(255,255,255,0.85)" />}
          {isMine && status === 'seen' && <Ionicons name="checkmark-done" size={14} color="#7DD3FC" />}
          {isMine && status === 'failed' && (
            <Pressable onPress={onRetry} hitSlop={8}>
              <Ionicons name="alert-circle" size={14} color={theme.colors.danger} />
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
});

// ─── Main Screen Component ────────────────────────────────────────────────────

export default function MessagesScreen() {
  useRequireRole('admin', 'teacher', 'parent', 'student');
  const { user } = useAuth();
  const { t } = useTranslation();
  const { theme, isDark } = useTheme();
  const router = useRouter();
  const { preselectUserId } = useLocalSearchParams();

  const [view, setView] = useState<'list' | 'thread' | 'new'>('list');
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [activeRecipient, setActiveRecipient] = useState<Recipient | null>(null);
  const [inputText, setInputText] = useState('');
  const [search, setSearch] = useState('');

  const { data: conversations, refetch: refetchConvos, loading: loadingConvos } = useConversations();
  const { messages, sendMessage, retryMessage, loadOlder, live } = useThreadMessages(activeConv?.id || null);
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

  const reversedMessages = useMemo(() => [...(messages || [])].reverse(), [messages]);

  // Admin pinned first, then teachers — the parent's quick "who can I message" list.
  // Collapse multiple admin accounts into a SINGLE admin card.
  const orderedRecipients = useMemo(() => {
    const list = recipients || [];
    const rank = (r: Recipient) => (r.role === 'admin' ? 0 : r.role === 'teacher' ? 1 : 2);
    const sorted = [...list].sort((a, b) => rank(a) - rank(b) || a.display_name.localeCompare(b.display_name));
    let adminKept = false;
    return sorted.filter((r) => {
      if (r.role === 'admin') {
        if (adminKept) return false;
        adminKept = true;
      }
      return true;
    });
  }, [recipients]);

  const filteredRecipients = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orderedRecipients;
    return orderedRecipients.filter(
      (r) =>
        r.display_name.toLowerCase().includes(q) ||
        (r.student_name || '').toLowerCase().includes(q),
    );
  }, [orderedRecipients, search]);

  // ─── Callbacks ──────────────────────────────────────────────────────────────

  const handleBack = () => {
    if (view !== 'list') {
      setView('list');
      setActiveConv(null);
      setActiveRecipient(null);
      setInputText('');
      setSearch('');
      refetchConvos();
      router.setParams({ preselectUserId: undefined });
    } else {
      router.back();
    }
  };

  const startWithRecipient = useCallback((rec: Recipient) => {
    setActiveConv(null);
    setActiveRecipient(rec);
    setInputText('');
    setView('thread');
  }, []);

  const openSupport = useCallback(() => {
    if (!support) return;
    if (supportConversation) {
      setActiveConv(supportConversation);
      setActiveRecipient(null);
      setView('thread');
    } else {
      startWithRecipient(support);
    }
  }, [support, supportConversation, startWithRecipient]);

  const renderSupportCard = () => support ? (
    <PressScaleInline
      onPress={openSupport}
      style={[styles.supportCard, { backgroundColor: isDark ? '#24233B' : '#F7F7FF', borderColor: isDark ? 'rgba(129,140,248,0.28)' : 'rgba(79,70,229,0.18)' }]}
    >
      <Avatar name="Nexsyrus Support" size={50} role="support" photoUrl={support.photo_url} />
      <View style={{ flex: 1, marginLeft: 13 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Text style={[styles.supportTitle, { color: isDark ? '#F5F3FF' : '#1E1B4B' }]}>Nexsyrus Support</Text>
          <Ionicons name="shield-checkmark" size={15} color={isDark ? '#A5B4FC' : '#4F46E5'} />
        </View>
        <Text numberOfLines={1} style={[styles.supportSub, { color: isDark ? '#B8B7D4' : '#63668A' }]}>
          {supportConversation?.last_message_preview || 'Product help, onboarding and issue resolution'}
        </Text>
      </View>
      {supportConversation?.unread_count ? (
        <View style={styles.supportUnread}><Text style={styles.supportUnreadText}>{supportConversation.unread_count > 99 ? '99+' : supportConversation.unread_count}</Text></View>
      ) : (
        <View style={styles.supportChat}><Ionicons name="chatbubble-ellipses" size={17} color="#FFFFFF" /></View>
      )}
    </PressScaleInline>
  ) : null;

  // Auto-open a thread when navigated here with ?preselectUserId=<user_id>
  // (e.g. tapping "Contact" on the Academic Advisor card). Prefer an existing
  // conversation with that user so their history shows; otherwise open a fresh
  // thread with them as the recipient.
  useEffect(() => {
    // Wait for the conversation list to settle so we can prefer an existing
    // thread instead of racing into a fresh one.
    if (!preselectUserId || view !== 'list' || loadingConvos) return;
    const targetId = Array.isArray(preselectUserId) ? preselectUserId[0] : preselectUserId;
    if (!targetId) return;

    const existing = conversations?.find(c => c.other_user_id === targetId && !c.is_group);
    if (existing) {
      setActiveConv(existing);
      setActiveRecipient(null);
      setView('thread');
      return;
    }
    const target = recipients?.find(r => r.user_id === targetId);
    if (target) {
      startWithRecipient(target);
    }
  }, [preselectUserId, conversations, recipients, view, loadingConvos, startWithRecipient]);

  const handleSend = async () => {
    if (!inputText.trim()) return;
    const text = inputText.trim();
    setInputText('');

    if (activeConv) {
      await sendMessage(text);
    } else if (activeRecipient) {
      const { MessagesService } = require('@/src/services/messagesService');
      try {
        const conv = await MessagesService.createConversation({
          recipient_user_id: activeRecipient.user_id,
          student_id: activeRecipient.student_id,
        });
        setActiveConv(conv);
        await MessagesService.sendMessage(conv.id, text);
        refetchConvos();
      } catch (err) {
        console.warn('Failed to start conversation', err);
      }
    }
  };

  // ─── Empty state: tappable teacher + admin list ───────────────────────────────
  const renderQuickStart = () => (
    <View style={{ paddingHorizontal: 16, paddingTop: 24 }}>
      <View style={[styles.emptyIconWrap, { backgroundColor: theme.colors.navPill }]}>
        <Ionicons name="chatbubbles-outline" size={30} color={theme.colors.primary} />
      </View>
      <Text style={[styles.emptyTitle, { color: theme.colors.textStrong }]}>{t('messages.empty_title', 'Start a conversation')}</Text>
      <Text style={[styles.emptyDesc, { color: theme.colors.textSecondary }]}>
        {t('messages.quick_start_desc', 'Tap your school admin or a teacher below to send a message.')}
      </Text>

      {orderedRecipients.length === 0 ? (
        <Text style={[styles.noRecipients, { color: theme.colors.textMuted }]}>
          {t('messages.no_recipients', 'No one is available to message right now.')}
        </Text>
      ) : (
        <View style={{ marginTop: 12 }}>
          {orderedRecipients.map((rec) => (
            <RecipientRow
              key={`${rec.user_id}_${rec.student_id || 'none'}`}
              item={rec}
              pinned={rec.role === 'admin'}
              onPress={() => startWithRecipient(rec)}
            />
          ))}
        </View>
      )}
    </View>
  );

  // ─── Render list view ───────────────────────────────────────────────────────
  const renderList = () => (
    <Animated.View entering={FadeInDown.duration(300)} exiting={FadeOut.duration(200)} style={styles.viewContainer}>
      <StudentHeader
        showBackButton
        title={t('messages.title', 'Messages')}
        rightAction={{ icon: 'create-outline', onPress: () => setView('new') }}
      />

      <FlatList
        data={regularConversations}
        keyExtractor={(item: Conversation) => item.id}
        renderItem={({ item }: { item: Conversation }) => (
          <ConversationRow
            item={item}
            onPress={() => {
              setActiveConv(item);
              setActiveRecipient(null);
              setView('thread');
            }}
          />
        )}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        refreshing={loadingConvos}
        onRefresh={refetchConvos}
        ListHeaderComponent={support ? <View style={{ marginBottom: 2 }}>{renderSupportCard()}</View> : null}
        ListEmptyComponent={!loadingConvos ? renderQuickStart() : null}
      />
    </Animated.View>
  );

  // ─── Render thread view (WhatsApp-style, SchoolBackground behind) ─────────────
  const headerName = activeConv?.other_user_name || activeRecipient?.display_name || t('messages.chat', 'Chat');
  const headerStudent = activeConv?.student_name || activeRecipient?.student_name;

  const renderThread = () => (
    <Animated.View entering={FadeInDown.duration(300)} exiting={FadeOut.duration(200)} style={styles.viewContainer}>
      <View style={[styles.header, styles.threadHeader, { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.border }]}>
        <PressScaleInline onPress={handleBack} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.textPrimary} />
        </PressScaleInline>
        <Avatar name={headerName} size={38} role={activeRecipient?.role} photoUrl={activeConv?.other_user_photo || activeRecipient?.photo_url} />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text numberOfLines={1} style={[styles.headerTitle, { color: theme.colors.textStrong }]}>
            {headerName}
          </Text>
        </View>
      </View>

      <View style={{ flex: 1 }}>
        <SchoolBackground />
        <FlatList
          data={reversedMessages}
          keyExtractor={(item: Message) => item.id}
          renderItem={({ item, index }: { item: Message; index: number }) => {
            const isMine = item.sender_user_id === user?.userId;
            
            // Check if date changed
            const nextItem = reversedMessages[index + 1];
            let showDateHeader = false;
            let dateLabel = '';
            
            const currentItemDate = new Date(item.created_at);
            if (nextItem) {
              const nextItemDate = new Date(nextItem.created_at);
              if (currentItemDate.toDateString() !== nextItemDate.toDateString()) {
                showDateHeader = true;
              }
            } else {
              showDateHeader = true; // Oldest message
            }
            
            if (showDateHeader) {
              const today = new Date();
              const yesterday = new Date();
              yesterday.setDate(yesterday.getDate() - 1);
              
              if (currentItemDate.toDateString() === today.toDateString()) {
                dateLabel = t('messages.today', 'Today');
              } else if (currentItemDate.toDateString() === yesterday.toDateString()) {
                dateLabel = t('messages.yesterday', 'Yesterday');
              } else {
                dateLabel = currentItemDate.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
              }
            }

            // Determine read status for mine
            let deliveryStatus: string | undefined = item._status;
            if (isMine && !item._status) {
              const cTime = currentItemDate.getTime();
              const sTime = live?.receipts?.last_seen_at ? new Date(live.receipts.last_seen_at).getTime() : 0;
              const dTime = live?.receipts?.last_delivered_at ? new Date(live.receipts.last_delivered_at).getTime() : 0;
              
              if (sTime >= cTime) deliveryStatus = 'seen';
              else if (dTime >= cTime) deliveryStatus = 'delivered';
              else deliveryStatus = 'sent';
            }

            return (
              <View>
                {showDateHeader && (
                  <View style={{ alignItems: 'center', marginVertical: 12 }}>
                    <View style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.08)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 }}>
                      <Text style={{ fontSize: 12, color: theme.colors.textSecondary, fontWeight: '500' }}>{dateLabel}</Text>
                    </View>
                  </View>
                )}
                <MessageBubble item={item} isMine={isMine} status={deliveryStatus} onRetry={() => retryMessage(item.id)} theme={theme} />
              </View>
            );
          }}
          inverted
          style={{ backgroundColor: 'transparent' }}
          contentContainerStyle={{ padding: 16 }}
          ListFooterComponent={() => (
            <View style={{ alignItems: 'center', marginTop: 20, marginBottom: 10 }}>
              <View style={{ backgroundColor: theme.colors.alertBg, borderWidth: 1, borderColor: theme.colors.alertBorder, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, maxWidth: '85%', flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="lock-closed" size={12} color={theme.colors.alertIcon} style={{ marginRight: 6 }} />
                <Text style={{ fontSize: 11, color: theme.colors.alertText, textAlign: 'center', flex: 1, lineHeight: 16 }}>
                  {t('messages.e2ee_notice', 'Messages and calls are end-to-end encrypted. No one outside of this chat can read or listen to them.')}
                </Text>
              </View>
            </View>
          )}
          onEndReached={loadOlder}
          onEndReachedThreshold={0.5}
        />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.inputBar, { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.border }]}>
          <View style={[styles.inputWrapper, { backgroundColor: theme.colors.background }]}>
            <TextInput
              value={inputText}
              onChangeText={setInputText}
              placeholder={t('messages.type_message', 'Type a message...')}
              placeholderTextColor={theme.colors.textMuted}
              multiline
              maxLength={4000}
              style={[styles.input, { color: theme.colors.textPrimary }]}
            />
          </View>
          <PressScaleInline
            onPress={handleSend}
            disabled={!inputText.trim()}
            style={[styles.sendBtn, { backgroundColor: theme.colors.primary, shadowColor: theme.colors.primary }, !inputText.trim() && { opacity: 0.5 }]}
          >
            <Ionicons name="send" size={20} color="#FFFFFF" />
          </PressScaleInline>
        </View>
      </KeyboardAvoidingView>
    </Animated.View>
  );

  // ─── Render new conversation picker (searchable) ──────────────────────────────
  const renderNew = () => (
    <Animated.View entering={FadeInDown.duration(300)} exiting={FadeOut.duration(200)} style={styles.viewContainer}>
      <View style={[styles.header, { backgroundColor: theme.colors.surface }]}>
        <PressScaleInline onPress={handleBack} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.textPrimary} />
        </PressScaleInline>
        <Text style={[styles.headerTitle, { color: theme.colors.textStrong }]}>{t('messages.new_message', 'New Message')}</Text>
      </View>

      <View style={[styles.searchBar, { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border }]}>
        <Ionicons name="search" size={18} color={theme.colors.textMuted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={t('messages.search_recipient', 'Search admin or teacher...')}
          placeholderTextColor={theme.colors.textMuted}
          style={[styles.searchInput, { color: theme.colors.textPrimary }]}
        />
        {!!search && (
          <Pressable onPress={() => setSearch('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={theme.colors.textMuted} />
          </Pressable>
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {filteredRecipients.length === 0 ? (
          <Text style={[styles.noRecipients, { color: theme.colors.textMuted }]}>{t('messages.no_recipients', 'No one is available to message right now.')}</Text>
        ) : (
          filteredRecipients.map((rec) => (
            <RecipientRow
              key={`${rec.user_id}_${rec.student_id || 'none'}`}
              item={rec}
              pinned={rec.role === 'admin'}
              onPress={() => startWithRecipient(rec)}
            />
          ))
        )}
      </ScrollView>
    </Animated.View>
  );

  return (
    <ScreenLayout style={{ backgroundColor: theme.colors.background }}>
      {view === 'list' && renderList()}
      {view === 'thread' && renderThread()}
      {view === 'new' && renderNew()}
    </ScreenLayout>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  viewContainer: { flex: 1 },
  supportCard: { overflow: 'hidden', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, paddingVertical: 14, borderRadius: 21, borderWidth: 1, marginBottom: 15 },
  supportTitle: { fontSize: 16, fontWeight: '750' as any },
  supportSub: { fontSize: 12.5, lineHeight: 17, marginTop: 3 },
  supportChat: { width: 36, height: 36, borderRadius: 13, backgroundColor: '#4F46E5', alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  supportUnread: { minWidth: 26, height: 26, borderRadius: 13, paddingHorizontal: 7, backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  supportUnreadText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 60,
    paddingHorizontal: 8,
    backgroundColor: '#FFFFFF',
  },
  threadHeader: {
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    ...(Platform.OS === 'android'
      ? { elevation: 2 }
      : { shadowColor: '#6B7A99', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4 }),
  },
  backBtn: { padding: 8, marginRight: 4 },
  iconBtn: { padding: 8 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: '#0F172A', letterSpacing: -0.2 },

  // Conversation row
  convoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(76,90,120,0.06)',
    ...(Platform.OS === 'android'
      ? { elevation: 2 }
      : { shadowColor: '#6B7A99', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8 }),
  },
  unreadBadge: {
    backgroundColor: '#EF4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    marginLeft: 12,
  },

  // Recipient row (quick-start + picker)
  recipientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(76,90,120,0.07)',
    ...(Platform.OS === 'android'
      ? { elevation: 1 }
      : { shadowColor: '#6B7A99', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 6 }),
  },
  recipientName: { fontSize: 16, fontWeight: '600', color: '#1E293B', flexShrink: 1 },
  recipientSub: { fontSize: 13, color: '#64748B', marginTop: 2 },
  chatChip: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },

  // Empty state
  emptyIconWrap: {
    alignSelf: 'center',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A', textAlign: 'center' },
  emptyDesc: { fontSize: 14, color: '#64748B', marginTop: 6, textAlign: 'center', paddingHorizontal: 12 },
  noRecipients: { fontSize: 14, color: '#94A3B8', textAlign: 'center', marginTop: 24 },

  // Message bubbles
  bubble: {
    maxWidth: '82%',
    borderRadius: 16,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  // Removed unused bubbleMine and bubbleTheirs as they are now dynamically styled using theme

  // Input
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  inputWrapper: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    borderRadius: 20,
    minHeight: 40,
    maxHeight: 120,
    marginRight: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  input: { flex: 1, fontSize: 16, color: '#1E293B', paddingTop: 0, paddingBottom: 0 },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#4F6EF7',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'android'
      ? { elevation: 3 }
      : { shadowColor: '#4F6EF7', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 6 }),
  },

  // Search
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    paddingHorizontal: 14,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
  },
  searchInput: { flex: 1, fontSize: 15, color: '#1E293B' },
});
