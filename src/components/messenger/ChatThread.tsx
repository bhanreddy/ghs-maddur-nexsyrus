/**
 * ChatThread — WhatsApp-style thread view reused by every portal's messenger.
 * Handles an existing conversation OR a brand-new recipient (creates the
 * conversation on first send). Renders the SchoolBackground behind messages.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  TextInput,
  FlatList,
  KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

import { SchoolBackground } from '@/components/SchoolBackground';
import { useThreadMessages } from '@/src/hooks/useMessages';
import {
  MessagesService,
  type Conversation,
  type LiveState,
  type Message,
  type MessageStatus,
  type Recipient,
} from '@/src/services/messagesService';
import { Avatar, DateSeparator, MessageBubble, PressScale, SecurityBanner, formatDayLabel } from './parts';

// A rendered row is either a message or a day separator.
type Row =
  | { type: 'msg'; key: string; msg: Message; groupStart: boolean }
  | { type: 'sep'; key: string; label: string };

interface Props {
  conversation: Conversation | null;
  recipient: Recipient | null;
  currentUserId: string | null | undefined;
  onBack: () => void;
  onConversationCreated?: (c: Conversation) => void;
}

type Presence = NonNullable<LiveState['presence']>;

/** "Online" / "Last seen today at 2:15 PM" / "Last seen yesterday" / "Last seen recently". */
function formatPresence(presence: Presence, t: (k: string, d?: string) => string): string {
  if (presence.online) return t('messages.online', 'Online');
  if (!presence.last_active_at) return t('messages.last_seen_recently', 'Last seen recently');
  const d = new Date(presence.last_active_at);
  const now = new Date();
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return `${t('messages.last_seen_today', 'Last seen today at')} ${time}`;
  if (d.toDateString() === yesterday.toDateString()) return t('messages.last_seen_yesterday', 'Last seen yesterday');
  const daysAgo = (now.getTime() - d.getTime()) / 86_400_000;
  if (daysAgo > 7) return t('messages.last_seen_recently', 'Last seen recently');
  return `${t('messages.last_seen_on', 'Last seen')} ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

export default function ChatThread({ conversation, recipient, currentUserId, onBack, onConversationCreated }: Props) {
  const { t } = useTranslation();
  const [localConv, setLocalConv] = useState<Conversation | null>(conversation);
  const activeConv = localConv || conversation;
  const [inputText, setInputText] = useState('');

  // Smart auto-scroll state. Inverted list → the bottom is scroll offset ~0.
  const listRef = useRef<FlatList>(null);
  const atBottomRef = useRef(true);
  const prevLenRef = useRef(0);
  const [showNewPill, setShowNewPill] = useState(false);
  const scrollToBottom = useCallback(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
    setShowNewPill(false);
  }, []);

  const { messages, live, sendMessage, retryMessage, loadOlder, notifyTyping } = useThreadMessages(activeConv?.id || null);

  const isGroup = !!activeConv?.is_group;
  const readOnly = isGroup && activeConv?.group_mode === 'broadcast' && !activeConv?.is_group_admin;

  const title = isGroup
    ? activeConv?.group_name || t('messages.group', 'Group')
    : activeConv?.other_user_name || recipient?.display_name || t('messages.chat', 'Chat');

  const baseSubtitle = isGroup
    ? `${activeConv?.member_count ?? 0} ${t('messages.members', 'members')}${activeConv?.group_mode === 'broadcast' ? ` · ${t('messages.broadcast', 'Broadcast')}` : ''}`
    : activeConv?.student_name || recipient?.student_name
      ? `${t('student', 'Student')}: ${activeConv?.student_name || recipient?.student_name}`
      : null;

  // Live header line: typing > online/last-seen > base subtitle.
  const isTyping = (live?.typing?.length ?? 0) > 0;
  const subtitle = isTyping
    ? isGroup
      ? `${live!.typing[0].display_name.split(' ')[0]} ${t('messages.is_typing', 'is typing…')}`
      : t('messages.typing', 'typing…')
    : !isGroup && live?.presence
      ? formatPresence(live.presence, t as unknown as (k: string, d?: string) => string)
      : baseSubtitle;
  const subtitleActive = isTyping || (!isGroup && !!live?.presence?.online);

  // Per-message delivery/seen status for MY messages, from receipt high-water marks.
  const receipts = live?.receipts;
  const statusFor = (m: Message): MessageStatus | undefined => {
    if (m.sender_user_id !== currentUserId) return undefined;
    if (m._status === 'sending' || m._status === 'failed') return undefined;
    if (!receipts) return 'sent';
    const ts = new Date(m.created_at).getTime();
    const seen = receipts.last_seen_at ? new Date(receipts.last_seen_at).getTime() : 0;
    const delivered = receipts.last_delivered_at ? new Date(receipts.last_delivered_at).getTime() : 0;
    if (seen >= ts) return 'seen';
    if (delivered >= ts) return 'delivered';
    return 'sent';
  };

  // The FlatList is `inverted`, which renders index 0 at the visual BOTTOM.
  // `messages` arrives ascending (oldest→newest) from the hook, so we reverse to
  // newest-first here — otherwise new messages stack UPWARD from the bottom.
  // Newest-first also makes `ordered[i + 1]` the genuinely older message, which
  // the run-grouping + day-separator logic below relies on.
  const tt = t as unknown as (k: string, d?: string) => string;
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    const ordered = [...messages].reverse();

    for (let i = 0; i < ordered.length; i++) {
      const m = ordered[i];
      const d = new Date(m.created_at);

      const olderMessage = ordered[i + 1];
      let groupStart = true;
      if (olderMessage) {
        const gapMin = (d.getTime() - new Date(olderMessage.created_at).getTime()) / 60000;
        groupStart = m.sender_user_id !== olderMessage.sender_user_id || gapMin > 5;
      }

      out.push({ type: 'msg', key: m.id, msg: m, groupStart });
      
      const dayKey = d.toDateString();
      const olderDayKey = olderMessage ? new Date(olderMessage.created_at).toDateString() : null;
      
      if (dayKey !== olderDayKey) {
        out.push({ type: 'sep', key: `sep_${dayKey}`, label: formatDayLabel(d, tt) });
      }
    }
    return out;
  }, [messages, tt]);

  const handleSend = async () => {
    if (!inputText.trim()) return;
    const text = inputText.trim();
    setInputText('');

    if (activeConv) {
      await sendMessage(text);
      return;
    }
    if (recipient) {
      try {
        const conv = await MessagesService.createConversation({
          recipient_user_id: recipient.user_id,
          student_id: recipient.student_id,
        });
        setLocalConv(conv);
        onConversationCreated?.(conv);
        await MessagesService.sendMessage(conv.id, text);
      } catch (err) {
        console.warn('Failed to start conversation', err);
      }
    }
  };

  return (
    <Animated.View entering={FadeInDown.duration(300)} exiting={FadeOut.duration(200)} style={styles.container}>
      <View style={styles.header}>
        <PressScale onPress={onBack} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#1E293B" />
        </PressScale>
        <Avatar
          name={title}
          size={38}
          role={recipient?.role}
          isGroup={isGroup}
          uri={isGroup ? undefined : activeConv?.other_user_photo || recipient?.photo_url}
        />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text numberOfLines={1} style={styles.headerTitle}>
            {title}
          </Text>
          {!!subtitle && (
            <Text numberOfLines={1} style={[styles.headerSub, subtitleActive && styles.headerSubActive]}>
              {subtitle}
            </Text>
          )}
        </View>
      </View>

      <View style={{ flex: 1 }}>
        <SchoolBackground />
        <FlatList
          data={rows}
          keyExtractor={(item: Row) => item.key}
          renderItem={({ item }: { item: Row }) => {
            if (item.type === 'sep') return <DateSeparator label={item.label} />;
            const m = item.msg;
            return (
              <MessageBubble
                item={m}
                isMine={m.sender_user_id === currentUserId}
                showSender={isGroup}
                status={statusFor(m)}
                groupStart={item.groupStart}
                onRetry={() => retryMessage(m.id)}
              />
            );
          }}
          inverted
          style={{ backgroundColor: 'transparent' }}
          contentContainerStyle={{ padding: 16 }}
          onEndReached={loadOlder}
          onEndReachedThreshold={0.5}
          // Inverted list → footer renders at the visual TOP (above the oldest message).
          ListFooterComponent={<SecurityBanner />}
          // ── Perf (#8): keep 60fps on very large chats ──────────────────────
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          removeClippedSubviews
          initialNumToRender={20}
          maxToRenderPerBatch={12}
          windowSize={11}
          updateCellsBatchingPeriod={40}
        />
      </View>

      {readOnly ? (
        <View style={styles.readOnlyBar}>
          <Ionicons name="megaphone-outline" size={16} color="#94A3B8" />
          <Text style={styles.readOnlyText}>{t('messages.broadcast_readonly', 'Only admins can post in this broadcast group')}</Text>
        </View>
      ) : (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.inputBar}>
            <View style={styles.inputWrapper}>
              <TextInput
                value={inputText}
                onChangeText={(v) => {
                  setInputText(v);
                  notifyTyping();
                }}
                placeholder={t('messages.type_message', 'Type a message...')}
                placeholderTextColor="#94A3B8"
                multiline
                maxLength={4000}
                style={styles.input}
                onKeyPress={(e: any) => {
                  if (Platform.OS === 'web' && e.nativeEvent.key === 'Enter' && !e.nativeEvent.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
              />
            </View>
            <PressScale onPress={handleSend} disabled={!inputText.trim()} style={[styles.sendBtn, !inputText.trim() && { opacity: 0.5 }]}>
              <Ionicons name="send" size={20} color="#FFFFFF" />
            </PressScale>
          </View>
        </KeyboardAvoidingView>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 60,
    paddingHorizontal: 8,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    ...(Platform.OS === 'android'
      ? { elevation: 2 }
      : { shadowColor: '#6B7A99', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4 }),
  },
  backBtn: { padding: 8, marginRight: 2 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#0F172A', letterSpacing: -0.2 },
  headerSub: { fontSize: 12, color: '#64748B', marginTop: 1 },
  headerSubActive: { color: '#22C55E', fontWeight: '600' },
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
  readOnlyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    backgroundColor: '#F8FAFC',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  readOnlyText: { fontSize: 13, color: '#94A3B8' },
});
