/**
 * Shared messenger UI parts used by the admin, teacher and parent messengers.
 */
import React from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import type { Conversation, Message, MessageStatus, Recipient, MessengerRole, SupportContact } from '@/src/services/messagesService';

export const PressScale = ({ children, onPress, style, disabled }: any) => (
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
  staff: { bg: '#E3EAFF', fg: '#2A50D8' },
  parent: { bg: '#DCFCE7', fg: '#15803D' },
  student: { bg: '#DCFCE7', fg: '#15803D' },
  group: { bg: '#EDE9FE', fg: '#6D28D9' },
  support: { bg: '#E8E7FF', fg: '#4F46E5' },
};

export const Avatar = ({
  name,
  size = 46,
  role,
  isGroup,
  uri,
}: {
  name: string;
  size?: number;
  role?: string;
  isGroup?: boolean;
  uri?: string | null;
}) => {
  const tint = roleTint[isGroup ? 'group' : role || 'teacher'] || roleTint.teacher;
  const initials = (name || '?')
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  // Real profile photo (cached to memory+disk by expo-image so scrolling is smooth
  // and it never refetches). Falls back to the initials/group placeholder.
  if (uri && !isGroup) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: tint.bg }}
        cachePolicy="memory-disk"
        contentFit="cover"
        transition={120}
      />
    );
  }

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
      {isGroup ? (
        <Ionicons name="people" size={size * 0.5} color={tint.fg} />
      ) : role === 'support' ? (
        <Ionicons name="headset" size={size * 0.48} color={tint.fg} />
      ) : (
        <Text style={{ fontSize: size * 0.36, fontWeight: '700', color: tint.fg }}>{initials}</Text>
      )}
    </View>
  );
};

const roleLabel = (role: MessengerRole, t: (k: string, d?: string) => string): string =>
  role === 'support'
    ? t('messages.nexsyrus_support', 'Official support')
    : role === 'admin'
    ? t('roles.admin_singular', 'Admin')
    : role === 'teacher' || role === 'staff'
      ? t('roles.teacher_singular', 'Teacher')
      : t('roles.student_singular', 'Student');

export const PinnedSupportCard = React.memo(function PinnedSupportCard({
  support,
  conversation,
  onPress,
}: {
  support: SupportContact;
  conversation?: Conversation | null;
  onPress: () => void;
}) {
  return (
    <PressScale onPress={onPress} style={styles.supportCard}>
      <View style={styles.supportGlow} />
      <Avatar name={support.display_name} size={50} role="support" uri={support.photo_url} />
      <View style={{ flex: 1, marginLeft: 13 }}>
        <View style={styles.supportTitleRow}>
          <Text style={styles.supportTitle}>Nexsyrus Support</Text>
          <Ionicons name="shield-checkmark" size={15} color="#4F46E5" />
        </View>
        <Text numberOfLines={1} style={styles.supportSub}>
          {conversation?.last_message_preview || 'Product help, onboarding and issue resolution'}
        </Text>
      </View>
      {conversation?.unread_count ? (
        <View style={styles.supportUnread}>
          <Text style={styles.supportUnreadText}>{conversation.unread_count > 99 ? '99+' : conversation.unread_count}</Text>
        </View>
      ) : (
        <View style={styles.supportChat}><Ionicons name="chatbubble-ellipses" size={17} color="#FFFFFF" /></View>
      )}
    </PressScale>
  );
});

/** Tappable directory row: "start a chat with this person". */
export const RecipientRow = React.memo(
  ({ item, onPress, pinned }: { item: Recipient; onPress: () => void; pinned?: boolean }) => {
    const { t } = useTranslation();
    return (
      <PressScale onPress={onPress} style={styles.recipientRow}>
        <Avatar name={item.display_name} size={46} role={item.role} uri={item.photo_url} />
        <View style={{ marginLeft: 12, flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text numberOfLines={1} style={styles.recipientName}>
              {item.display_name}
            </Text>
            {pinned && <Ionicons name="pin" size={13} color="#94A3B8" />}
          </View>
          <Text numberOfLines={1} style={styles.recipientSub}>
            {roleLabel(item.role, t as unknown as (k: string, d?: string) => string)}
            {item.student_name && item.role !== 'student' ? ` · ${item.student_name}` : ''}
          </Text>
        </View>
        <View style={styles.chatChip}>
          <Ionicons name="chatbubble-ellipses" size={16} color="#4F6EF7" />
        </View>
      </PressScale>
    );
  },
);

/** A conversation row (1:1 or group). */
export const ConversationRow = React.memo(
  ({ item, onPress }: { item: Conversation; onPress: () => void }) => {
    const { t } = useTranslation();
    const isGroup = !!item.is_group;
    const title = isGroup ? item.group_name || t('messages.group', 'Group') : item.other_user_name || '—';
    const dateStr = item.last_message_at
      ? new Date(item.last_message_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      : '';
    const subtitle = isGroup
      ? `${item.member_count ?? 0} ${t('messages.members', 'members')}${item.group_mode === 'broadcast' ? ` · ${t('messages.broadcast', 'Broadcast')}` : ''}`
      : item.student_name
        ? `${t('student', 'Student')}: ${item.student_name}`
        : null;

    return (
      <PressScale onPress={onPress}>
        <View style={styles.convoRow}>
          <Avatar name={title} size={48} role={undefined} isGroup={isGroup} uri={isGroup ? undefined : item.other_user_photo} />
          <View style={{ flex: 1, marginLeft: 14, justifyContent: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text numberOfLines={1} style={styles.convoTitle}>
                {title}
              </Text>
              {!!dateStr && <Text style={styles.convoDate}>{dateStr}</Text>}
            </View>
            {!!subtitle && (
              <Text numberOfLines={1} style={styles.convoMeta}>
                {subtitle}
              </Text>
            )}
            <Text numberOfLines={1} style={styles.convoPreview}>
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
      </PressScale>
    );
  },
);

const StatusTicks = ({ status, onRetry }: { status: MessageStatus; onRetry: () => void }) => {
  if (status === 'sending') return <Ionicons name="time-outline" size={13} color="rgba(255,255,255,0.8)" />;
  if (status === 'failed')
    return (
      <Pressable onPress={onRetry} hitSlop={8}>
        <Ionicons name="alert-circle" size={14} color="#FDA4AF" />
      </Pressable>
    );
  if (status === 'seen') return <Ionicons name="checkmark-done" size={15} color="#7FE0FF" />; // blue = seen
  if (status === 'delivered') return <Ionicons name="checkmark-done" size={15} color="rgba(255,255,255,0.85)" />;
  return <Ionicons name="checkmark" size={14} color="rgba(255,255,255,0.85)" />; // sent
};

export const MessageBubble = React.memo(
  ({
    item,
    isMine,
    showSender,
    status,
    groupStart = true,
    onRetry,
  }: {
    item: Message;
    isMine: boolean;
    showSender?: boolean;
    /** Resolved delivery/seen status for the caller's OWN messages. */
    status?: MessageStatus;
    /** First message of a consecutive same-sender run (wider gap + tail + name). */
    groupStart?: boolean;
    onRetry: () => void;
  }) => {
    const timeStr = new Date(item.created_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    const st: MessageStatus = item._status === 'failed' ? 'failed' : item._status === 'sending' ? 'sending' : status || 'sent';
    // Only the first bubble of a run gets a tail; the rest are evenly rounded (grouped).
    const tail = isMine ? { borderTopRightRadius: 6 } : { borderTopLeftRadius: 6 };
    return (
      <View
        style={{
          flexDirection: 'row',
          justifyContent: isMine ? 'flex-end' : 'flex-start',
          marginTop: groupStart ? 8 : 2,
          marginBottom: 1,
        }}
      >
        <View
          style={[
            styles.bubble,
            isMine ? styles.bubbleMine : styles.bubbleTheirs,
            groupStart ? tail : null,
            { opacity: item._status === 'sending' ? 0.7 : 1 },
          ]}
        >
          {groupStart && showSender && !isMine && !!item.sender_name && (
            <Text style={styles.bubbleSender}>{item.sender_name}</Text>
          )}
          <Text style={{ fontSize: 15, color: isMine ? '#FFFFFF' : '#1E293B', lineHeight: 21 }}>{item.body}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 3, gap: 4 }}>
            <Text style={{ fontSize: 10.5, color: isMine ? 'rgba(255,255,255,0.75)' : '#94A3B8' }}>{timeStr}</Text>
            {isMine && <StatusTicks status={st} onRetry={onRetry} />}
          </View>
        </View>
      </View>
    );
  },
);

/** Today / Yesterday / date label for a day's first message. */
export function formatDayLabel(d: Date, t: (k: string, def?: string) => string): string {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return t('messages.today', 'Today');
  if (d.toDateString() === yesterday.toDateString()) return t('messages.yesterday', 'Yesterday');
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

export const DateSeparator = React.memo(({ label }: { label: string }) => (
  <View style={styles.dateSepWrap}>
    <View style={styles.dateSepPill}>
      <Text style={styles.dateSepText}>{label}</Text>
    </View>
  </View>
));

/**
 * Truthful security notice. The system is NOT end-to-end encrypted (messages are
 * stored readable server-side), so this deliberately does NOT claim E2EE.
 */
export const SecurityBanner = React.memo(() => {
  const { t } = useTranslation();
  return (
    <View style={styles.securityBanner}>
      <Ionicons name="lock-closed" size={12} color="#8A6D3B" />
      <Text style={styles.securityText}>
        {t(
          'messages.security_notice',
          'Messages are encrypted in transit and visible only to people in this chat and your school administrators.',
        )}
      </Text>
    </View>
  );
});

export const styles = StyleSheet.create({
  supportCard: {
    overflow: 'hidden', flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 15, paddingVertical: 14, marginBottom: 15,
    borderRadius: 21, backgroundColor: '#F7F7FF', borderWidth: 1,
    borderColor: 'rgba(79,70,229,0.18)',
    ...(Platform.OS === 'android' ? { elevation: 3 } : { shadowColor: '#4F46E5', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.12, shadowRadius: 13 }),
  },
  supportGlow: { position: 'absolute', width: 110, height: 110, borderRadius: 55, right: -35, top: -55, backgroundColor: 'rgba(99,102,241,0.10)' },
  supportTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  supportTitle: { fontSize: 16, fontWeight: '750' as any, color: '#1E1B4B' },
  supportSub: { marginTop: 3, fontSize: 12.5, lineHeight: 17, color: '#63668A' },
  supportChat: { width: 36, height: 36, borderRadius: 13, backgroundColor: '#4F46E5', alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  supportUnread: { minWidth: 26, height: 26, borderRadius: 13, paddingHorizontal: 7, backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  supportUnreadText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  securityBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 6,
    maxWidth: '88%',
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginVertical: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(253, 246, 220, 0.92)',
  },
  securityText: { flex: 1, fontSize: 11.5, lineHeight: 16, color: '#8A6D3B', textAlign: 'center' },
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
  convoTitle: { fontSize: 16, fontWeight: '600', color: '#1E293B', flex: 1 },
  convoDate: { fontSize: 12, color: '#94A3B8', marginLeft: 8 },
  convoMeta: { fontSize: 12, color: '#64748B', marginTop: 2 },
  convoPreview: { fontSize: 14, color: '#64748B', marginTop: 4 },
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
  bubble: { maxWidth: '82%', borderRadius: 16, paddingHorizontal: 13, paddingVertical: 8 },
  bubbleMine: { backgroundColor: '#4F6EF7', borderBottomRightRadius: 4 },
  bubbleTheirs: {
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(76,90,120,0.08)',
    ...(Platform.OS === 'android'
      ? { elevation: 1 }
      : { shadowColor: '#6B7A99', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 }),
  },
  bubbleSender: { fontSize: 12, fontWeight: '700', color: '#6D28D9', marginBottom: 2 },
  dateSepWrap: { alignItems: 'center', marginVertical: 10 },
  dateSepPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: 'rgba(226, 232, 240, 0.95)',
  },
  dateSepText: { fontSize: 11.5, fontWeight: '600', color: '#475569' },
});
