import { TourTarget } from '@/src/features/app-tour';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  TextInput,
  FlatList,
  ScrollView,
  Image,
  InteractionManager,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Animated, { Easing, FadeIn, FadeInDown, FadeInRight, FadeOutLeft } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useRequireRole } from '@/src/hooks/useRequireRole';
import { useAuth } from '@/src/hooks/useAuth';
import {
  useConversations,
  useThreadMessages,
  useEligibleRecipients,
  useSupportContact,
} from '@/src/hooks/useMessages';
import { MessagesService, type Conversation, type Message, type Recipient } from '@/src/services/messagesService';

import ScreenLayout from '@/src/components/ScreenLayout';
import StudentHeader from '@/src/components/StudentHeader';
import ClayIconButton from '@/src/components/ClayIconButton';
import { useTheme } from '@/src/hooks/useTheme';
import { SchoolBackground } from '@/components/SchoolBackground';
import KeyboardAwareScreen from '@/components/keyboard/KeyboardAwareScreen';
import ProfilePhotoViewer from '@/src/components/messenger/ProfilePhotoViewer';
import {
  DeleteMessageDialog,
  EditComposerPreview,
  ForwardMessageModal,
  type MessageActionAnchor,
  MessageActionSheet,
  ReplyComposerPreview,
} from '@/src/components/messenger/MessageActions';
import SwipeToReply from '@/src/components/messenger/SwipeToReply';
import { Spacing } from '@/src/theme/themes';
import * as Haptics from '@/src/utils/haptics';
import { isTelugu as isTeluguCheck } from '@/src/utils/lang';

// ─── Design tokens (Mode A clay) ─────────────────────────────────────────────
const ACCENT = '#4F46E5';
const CLAY_BG_LIGHT = '#E9EDF6';
const CLAY_ACCENT = '#7C6BB8';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PressScaleInline = ({ children, onPress, style, disabled, accessibilityLabel }: any) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    accessibilityLabel={accessibilityLabel}
    style={({ pressed }) => [
      style,
      {
        opacity: disabled ? 0.45 : pressed ? 0.92 : 1,
        transform: [{ scale: pressed && !disabled ? 0.975 : 1 }],
      },
    ]}
  >
    {children}
  </Pressable>
);

const roleTint: Record<string, { bg: string; fg: string; ring: string }> = {
  admin: { bg: '#FFE9D6', fg: '#C2410C', ring: 'rgba(194,65,12,0.22)' },
  teacher: { bg: '#E3EAFF', fg: '#2A50D8', ring: 'rgba(42,80,216,0.20)' },
  parent: { bg: '#DCFCE7', fg: '#15803D', ring: 'rgba(21,128,61,0.20)' },
  student: { bg: '#DCFCE7', fg: '#15803D', ring: 'rgba(21,128,61,0.20)' },
  support: { bg: '#E8E7FF', fg: '#4F46E5', ring: 'rgba(79,70,229,0.28)' },
};

function formatRelativeTime(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const diff = Math.max(0, Date.now() - d.getTime());
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const Avatar = ({ name, size = 44, role, photoUrl }: { name: string; size?: number; role?: string; photoUrl?: string | null }) => {
  const tint = roleTint[role || 'teacher'] || roleTint.teacher;
  const ring = size >= 40 ? 2.5 : 2;
  const inner = size - ring * 2;

  if (photoUrl) {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          padding: ring,
          backgroundColor: tint.ring,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Image
          source={{ uri: photoUrl }}
          style={{ width: inner, height: inner, borderRadius: inner / 2, backgroundColor: tint.bg }}
          resizeMode="cover"
        />
      </View>
    );
  }

  const initials = (name || '?')
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        padding: ring,
        backgroundColor: tint.ring,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          width: inner,
          height: inner,
          borderRadius: inner / 2,
          backgroundColor: tint.bg,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        <LinearGradient
          colors={['rgba(255,255,255,0.45)', 'rgba(255,255,255,0)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.7, y: 0.9 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        {role === 'support' ? (
          <Ionicons name="headset" size={inner * 0.46} color={tint.fg} />
        ) : (
          <Text style={{ fontSize: inner * 0.34, fontWeight: '700', color: tint.fg }}>{initials}</Text>
        )}
      </View>
    </View>
  );
};

function AmbientCanvas({ isDark }: { isDark: boolean }) {
  if (isDark) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={styles.blobA} />
      <View style={styles.blobB} />
      <View style={styles.blobC} />
    </View>
  );
}

// ─── Sub-Components ───────────────────────────────────────────────────────────

/** A tappable "start a chat with this person" row (used in empty-state + picker). */
const RecipientRow = React.memo(
  ({ item, onPress, pinned }: { item: Recipient; onPress: () => void; pinned?: boolean }) => {
    const { t } = useTranslation();
    const { theme, isDark } = useTheme();
    const roleLabel =
      item.role === 'admin'
        ? t('roles.admin_singular', 'Admin')
        : item.role === 'teacher'
          ? t('roles.teacher_singular', 'Teacher')
          : t('roles.parent_singular', 'Parent');
    return (
      <PressScaleInline
        onPress={onPress}
        style={[
          styles.recipientRow,
          {
            backgroundColor: isDark ? theme.colors.surface : '#FFFFFF',
            borderColor: isDark ? theme.colors.border : 'rgba(76,90,120,0.06)',
          },
        ]}
      >
        {!isDark && (
          <LinearGradient
            colors={['rgba(255,255,255,0.55)', 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
        )}
        <Avatar name={item.display_name} size={44} role={item.role} photoUrl={item.photo_url} />
        <View style={{ marginLeft: 12, flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text numberOfLines={1} style={[styles.recipientName, { color: theme.colors.textStrong }]}>
              {item.display_name}
            </Text>
            {pinned && (
              <View style={[styles.pinChip, { backgroundColor: theme.colors.navPill }]}>
                <Ionicons name="pin" size={10} color={theme.colors.textMuted} />
              </View>
            )}
          </View>
          <Text numberOfLines={1} style={[styles.recipientSub, { color: theme.colors.textSecondary }]}>
            {roleLabel}
            {item.student_name ? ` · ${item.student_name}` : ''}
          </Text>
        </View>
        <View style={[styles.chatChip, { backgroundColor: theme.colors.navPill }]}>
          <Ionicons name="chatbubble-ellipses" size={15} color={theme.colors.primary} />
        </View>
      </PressScaleInline>
    );
  },
);

const ConversationRow = React.memo(({ item, onPress }: { item: Conversation; onPress: () => void }) => {
  const { t } = useTranslation();
  const { theme, isDark } = useTheme();
  const dateStr = formatRelativeTime(item.last_message_at);
  const hasUnread = item.unread_count > 0;

  return (
    <PressScaleInline onPress={onPress} accessibilityLabel={`Chat with ${item.other_user_name || 'contact'}`}>
      <View
        style={[
          styles.convoRow,
          {
            backgroundColor: hasUnread
              ? (isDark ? 'rgba(99,102,241,0.12)' : '#F7F8FF')
              : (isDark ? theme.colors.surface : '#FFFFFF'),
            borderColor: hasUnread
              ? (isDark ? 'rgba(129,140,248,0.28)' : 'rgba(79,70,229,0.12)')
              : (isDark ? theme.colors.border : 'rgba(76,90,120,0.055)'),
          },
        ]}
      >
        {!isDark && (
          <LinearGradient
            colors={
              hasUnread
                ? ['rgba(238,242,255,0.95)', 'rgba(255,255,255,0.35)']
                : ['rgba(255,255,255,0.55)', 'rgba(255,255,255,0)']
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 0.6, y: 1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
        )}
        {hasUnread && <View style={[styles.convoUnreadBar, { backgroundColor: theme.colors.primary }]} />}
        <Avatar name={item.other_user_name || ''} size={46} photoUrl={item.other_user_photo} />
        <View style={{ flex: 1, marginLeft: 12, justifyContent: 'center', minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <Text
              numberOfLines={1}
              style={[
                styles.convoTitle,
                { color: theme.colors.textStrong },
                hasUnread && styles.convoTitleUnread,
              ]}
            >
              {item.other_user_name || ''}
            </Text>
            {!!dateStr && (
              <Text
                style={[
                  styles.convoDate,
                  { color: hasUnread ? theme.colors.primary : theme.colors.textMuted },
                  hasUnread && { fontWeight: '700' },
                ]}
              >
                {dateStr}
              </Text>
            )}
          </View>
          <Text
            numberOfLines={1}
            style={[
              styles.convoPreview,
              {
                color: hasUnread ? theme.colors.textPrimary : theme.colors.textSecondary,
                fontWeight: hasUnread ? '600' : '400',
              },
            ]}
          >
            {item.last_message_preview || t('messages.no_messages', 'No messages yet')}
          </Text>
        </View>
        {hasUnread ? (
          <View style={[styles.unreadBadge, { backgroundColor: theme.colors.primary }]}>
            <Text style={styles.unreadBadgeText}>
              {item.unread_count > 99 ? '99+' : item.unread_count}
            </Text>
          </View>
        ) : (
          <Ionicons name="chevron-forward" size={16} color={isDark ? '#64748B' : '#CBD5E1'} style={{ marginLeft: 4 }} />
        )}
      </View>
    </PressScaleInline>
  );
});

function LoadingPlaceholders({ isDark }: { isDark: boolean }) {
  return (
    <View style={{ gap: 10, paddingTop: 4 }}>
      {[0, 1, 2, 3].map((i) => (
        <View
          key={i}
          style={[
            styles.skeletonRow,
            { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.75)' },
          ]}
        >
          <View style={[styles.skeletonAvatar, { backgroundColor: isDark ? '#334155' : '#E2E8F0' }]} />
          <View style={{ flex: 1, gap: 8 }}>
            <View style={[styles.skeletonLine, { width: '42%', backgroundColor: isDark ? '#334155' : '#E2E8F0' }]} />
            <View style={[styles.skeletonLine, { width: '72%', opacity: 0.55, backgroundColor: isDark ? '#334155' : '#E2E8F0' }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Compact clay chrome for the inbox — soft, tactile, more room for chats. */
function MessagesListHeader({
  title,
  subtitle,
  onBack,
  onOpenSettings,
}: {
  title: string;
  subtitle: string;
  onBack: () => void;
  onOpenSettings: () => void;
}) {
  const { i18n } = useTranslation();
  const { isDark, theme } = useTheme();
  const [isTeluguLang, setIsTeluguLang] = useState(isTeluguCheck(i18n.language));

  useEffect(() => {
    setIsTeluguLang(isTeluguCheck(i18n.language));
  }, [i18n.language]);

  const toggleLanguage = async () => {
    const newLang = isTeluguLang ? 'en' : 'te';
    setIsTeluguLang(!isTeluguLang);
    i18n.changeLanguage(newLang);
    await AsyncStorage.setItem('appLanguage', newLang);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  return (
    <View
      style={[
        styles.listHeader,
        {
          backgroundColor: isDark ? theme.colors.surface : 'rgba(255,255,255,0.88)',
          borderBottomColor: isDark ? theme.colors.border : 'rgba(76,90,120,0.08)',
        },
      ]}
    >
      <ClayIconButton
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onBack();
        }}
        isDark={isDark}
        accent={CLAY_ACCENT}
        size={42}
      >
        <Ionicons name="arrow-back" size={19} color={isDark ? '#F4F0FB' : '#1E293B'} />
      </ClayIconButton>

      <View style={styles.listHeaderCenter}>
        <Text style={[styles.listHeaderTitle, { color: theme.colors.textStrong }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.listHeaderSub, { color: theme.colors.textMuted }]} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>

      <View style={styles.listHeaderLang}>
        <Text style={[styles.langLabel, { color: theme.colors.textStrong, opacity: !isTeluguLang ? 1 : 0.4 }]}>En</Text>
        <Switch
          value={isTeluguLang}
          onValueChange={toggleLanguage}
          trackColor={{ false: isDark ? 'rgba(255,255,255,0.22)' : 'rgba(15,23,42,0.14)', true: 'rgba(79,70,229,0.45)' }}
          thumbColor="#FFFFFF"
          style={{ transform: [{ scaleX: 0.72 }, { scaleY: 0.72 }] }}
        />
        <Text style={[styles.langLabel, { color: theme.colors.textStrong, opacity: isTeluguLang ? 1 : 0.4 }]}>Te</Text>
      </View>

      <ClayIconButton
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onOpenSettings();
        }}
        isDark={isDark}
        accent={CLAY_ACCENT}
        round
        size={40}
      >
        <Ionicons name="settings-outline" size={16} color={isDark ? '#F4F0FB' : '#475569'} />
      </ClayIconButton>
    </View>
  );
}

const MessageBubble = React.memo(function MessageBubble({
  item,
  isMine,
  status,
  onRetry,
  onOpenActions,
  onReply,
  theme,
}: {
  item: Message;
  isMine: boolean;
  status?: string;
  onRetry: () => void;
  onOpenActions: (message: Message, anchor?: MessageActionAnchor) => void;
  onReply: (message: Message) => void;
  theme: any;
}) {
  const { t } = useTranslation();
  const timeStr = new Date(item.created_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const deleted = !!item.deleted_at;

  return (
    <View style={{ flexDirection: 'row', justifyContent: isMine ? 'flex-end' : 'flex-start', marginVertical: 3 }}>
      <SwipeToReply
        enabled={!deleted}
        onReply={() => onReply(item)}
        accentColor={theme.colors.primary}
      >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={deleted
          ? t('messages.message_deleted', 'This message was deleted')
          : `${item.sender_name || 'Message'}: ${item.body}. Swipe right to reply, or tap for actions`}
        onPress={(event) =>
          !deleted && onOpenActions(item, {
            x: event.nativeEvent.pageX,
            y: event.nativeEvent.pageY,
          })
        }
        onLongPress={(event) =>
          !deleted && onOpenActions(item, {
            x: event.nativeEvent.pageX,
            y: event.nativeEvent.pageY,
          })
        }
        delayLongPress={280}
        style={[
          styles.bubble,
          isMine
            ? { backgroundColor: theme.colors.primary, borderBottomRightRadius: 4 }
            : { backgroundColor: theme.colors.surface, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: theme.colors.border },
          { opacity: status === 'sending' ? 0.7 : 1 },
        ]}
      >
        {!deleted && (
          <View style={styles.bubbleMenuHint}>
            <Ionicons
              name="chevron-down"
              size={14}
              color={isMine ? 'rgba(255,255,255,0.78)' : theme.colors.textSecondary}
            />
          </View>
        )}
        {!deleted && !!item.forwarded_from_message_id && (
          <View style={styles.forwardedLabel}>
            <Ionicons
              name="arrow-redo-outline"
              size={12}
              color={isMine ? 'rgba(255,255,255,0.72)' : theme.colors.textSecondary}
            />
            <Text style={[styles.forwardedText, { color: isMine ? 'rgba(255,255,255,0.72)' : theme.colors.textSecondary }]}>
              Forwarded
            </Text>
          </View>
        )}
        {!deleted && !!item.reply_to_message_id && (
          <View
            style={[
              styles.quotedMessage,
              { backgroundColor: isMine ? 'rgba(15,23,42,0.17)' : theme.colors.background },
            ]}
          >
            <View style={styles.quoteAccent} />
            <View style={styles.quoteContent}>
              <Text numberOfLines={1} style={[styles.quoteSender, isMine && { color: '#A7F3D0' }]}>
                {item.reply_to_sender_name || 'Message'}
              </Text>
              <Text
                numberOfLines={2}
                style={[
                  styles.quoteBody,
                  { color: isMine ? 'rgba(255,255,255,0.82)' : theme.colors.textSecondary },
                ]}
              >
                {item.reply_to_body || 'Original message unavailable'}
              </Text>
            </View>
          </View>
        )}
        {deleted ? (
          <View style={styles.deletedMessage}>
            <Ionicons
              name="ban-outline"
              size={16}
              color={isMine ? 'rgba(255,255,255,0.76)' : theme.colors.textSecondary}
            />
            <Text
              style={[
                styles.deletedMessageText,
                { color: isMine ? 'rgba(255,255,255,0.78)' : theme.colors.textSecondary },
              ]}
            >
              {t('messages.message_deleted', 'This message was deleted')}
            </Text>
          </View>
        ) : (
          <Text style={{ fontSize: 15, color: isMine ? '#FFFFFF' : theme.colors.textStrong, lineHeight: 21 }}>{item.body}</Text>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 3, gap: 4 }}>
          {!!item.edited_at && !deleted && (
            <Text
              style={[
                styles.editedLabel,
                { color: isMine ? 'rgba(255,255,255,0.68)' : theme.colors.textSecondary },
              ]}
            >
              {t('messages.edited', 'Edited')}
            </Text>
          )}
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
      </Pressable>
      </SwipeToReply>
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

  const hasPreselectedRecipient = Array.isArray(preselectUserId)
    ? Boolean(preselectUserId[0])
    : Boolean(preselectUserId);
  const [view, setView] = useState<'list' | 'thread' | 'new' | 'resolving'>(
    hasPreselectedRecipient ? 'resolving' : 'list'
  );
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [activeRecipient, setActiveRecipient] = useState<Recipient | null>(null);
  const [inputText, setInputText] = useState('');
  const [search, setSearch] = useState('');
  const [profilePhotoVisible, setProfilePhotoVisible] = useState(false);
  const [actionMessage, setActionMessage] = useState<Message | null>(null);
  const [actionAnchor, setActionAnchor] = useState<MessageActionAnchor | undefined>();
  const [forwardingMessage, setForwardingMessage] = useState<Message | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [deletingMessage, setDeletingMessage] = useState<Message | null>(null);
  const [editError, setEditError] = useState('');
  const draftBeforeEditRef = useRef('');
  const inputRef = useRef<TextInput>(null);
  const preselectionScheduledRef = useRef(false);

  const {
    data: conversations,
    refetch: refetchConvos,
    loading: loadingConvos,
    isRefreshing: conversationsRefreshing,
  } = useConversations();
  const {
    messages,
    sendMessage,
    editMessage,
    deleteMessage,
    retryMessage,
    loadOlder,
    live,
  } = useThreadMessages(activeConv?.id || null);
  const {
    data: recipients,
    loading: loadingRecipients,
    isRefreshing: recipientsRefreshing,
  } = useEligibleRecipients();
  const { data: support } = useSupportContact();
  const supportConversation = useMemo(
    () => support ? conversations?.find((c) => c.other_user_id === support.user_id && c.pair_type === 'support') || null : null,
    [support, conversations],
  );
  const regularConversations = useMemo(
    () => (conversations || []).filter((c) => c.pair_type !== 'support'),
    [conversations],
  );

  const unreadTotal = useMemo(
    () =>
      regularConversations.reduce((n, c) => n + (c.unread_count || 0), 0) +
      (supportConversation?.unread_count || 0),
    [regularConversations, supportConversation],
  );

  const filteredConversations = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || view !== 'list') return regularConversations;
    return regularConversations.filter((c) => {
      const hay = [c.other_user_name, c.last_message_preview].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [regularConversations, search, view]);

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
      setReplyingTo(null);
      setEditingMessage(null);
      setDeletingMessage(null);
      setEditError('');
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
      accessibilityLabel="Nexsyrus Support"
      style={[
        styles.supportCard,
        {
          borderColor: isDark ? 'rgba(129,140,248,0.28)' : 'rgba(79,70,229,0.14)',
        },
      ]}
    >
      {!isDark && (
        <>
          <LinearGradient
            colors={['#F8F7FF', '#EEF2FF', '#E8E7FF']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={['rgba(255,255,255,0.72)', 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0.55, y: 0.9 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <View style={styles.supportGlow} />
        </>
      )}
      {isDark && <View style={[StyleSheet.absoluteFill, { backgroundColor: '#24233B' }]} />}
      <View style={[styles.supportAccentBar, { backgroundColor: theme.colors.primary }]} />
      <Avatar name="Nexsyrus Support" size={46} role="support" photoUrl={support.photo_url} />
      <View style={{ flex: 1, marginLeft: 12, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
          <Text style={[styles.supportTitle, { color: isDark ? '#F5F3FF' : '#1E1B4B' }]}>Nexsyrus Support</Text>
          <View style={[styles.verifiedPill, { backgroundColor: isDark ? 'rgba(129,140,248,0.18)' : 'rgba(79,70,229,0.10)' }]}>
            <Ionicons name="shield-checkmark" size={11} color={isDark ? '#A5B4FC' : ACCENT} />
            <Text style={[styles.verifiedText, { color: isDark ? '#A5B4FC' : ACCENT }]}>
              {t('messages.official', 'Official')}
            </Text>
          </View>
        </View>
        <Text
          numberOfLines={1}
          style={[
            styles.supportSub,
            {
              color: supportConversation?.unread_count
                ? (isDark ? '#C7D2FE' : '#4338CA')
                : (isDark ? '#B8B7D4' : '#63668A'),
              fontWeight: supportConversation?.unread_count ? '600' : '400',
            },
          ]}
        >
          {supportConversation?.last_message_preview || t('messages.support_hint', 'Product help, onboarding & issue resolution')}
        </Text>
      </View>
      {supportConversation?.unread_count ? (
        <View style={styles.supportUnread}>
          <Text style={styles.supportUnreadText}>
            {supportConversation.unread_count > 99 ? '99+' : supportConversation.unread_count}
          </Text>
        </View>
      ) : (
        <View style={[styles.supportChat, { backgroundColor: theme.colors.primary }]}>
          <Ionicons name="chatbubble-ellipses" size={15} color="#FFFFFF" />
        </View>
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
    if (
      !preselectUserId
      || (view !== 'list' && view !== 'resolving')
      || loadingConvos
      || loadingRecipients
      || preselectionScheduledRef.current
    ) return;
    const targetId = Array.isArray(preselectUserId) ? preselectUserId[0] : preselectUserId;
    if (!targetId) return;

    const existing = conversations?.find(c => c.other_user_id === targetId && !c.is_group);
    const target = recipients?.find(r => r.user_id === targetId);
    if ((!existing && conversationsRefreshing) || (!target && recipientsRefreshing)) return;
    preselectionScheduledRef.current = true;

    // Let the router's native screen transition finish before mounting the
    // message list and SVG backdrop. Competing for the same opening frames was
    // the main source of the visible stutter from the Contact Teacher shortcut.
    InteractionManager.runAfterInteractions(() => {
      if (existing) {
        setActiveConv(existing);
        setActiveRecipient(null);
        setView('thread');
      } else if (target) {
        startWithRecipient(target);
      } else {
        setView('list');
      }
    });
  }, [
    preselectUserId,
    conversations,
    recipients,
    view,
    loadingConvos,
    loadingRecipients,
    conversationsRefreshing,
    recipientsRefreshing,
    startWithRecipient,
  ]);

  const handleSend = async () => {
    if (!inputText.trim()) return;
    const text = inputText.trim();
    if (editingMessage) {
      if (text === editingMessage.body) return;
      const saved = await editMessage(editingMessage.id, text);
      if (!saved) {
        setEditError(t('messages.edit_failed', 'Could not save your changes. Please try again.'));
        return;
      }
      setEditingMessage(null);
      setEditError('');
      setInputText('');
      refetchConvos();
      return;
    }
    const replyTarget = replyingTo;
    setInputText('');
    setReplyingTo(null);

    if (activeConv) {
      await sendMessage(text, replyTarget);
    } else if (activeRecipient) {
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

  const handleForward = async (conversationIds: string[]) => {
    if (!forwardingMessage) return;
    const nonce = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    await Promise.all(
      conversationIds.map((conversationId, index) =>
        MessagesService.sendMessage(
          conversationId,
          forwardingMessage.body,
          `forward_${nonce}_${index}`,
          { forwardedFromMessageId: forwardingMessage.id },
        ),
      ),
    );
  };

  const openMessageActions = (message: Message, anchor?: MessageActionAnchor) => {
    setActionMessage(message);
    setActionAnchor(anchor);
  };

  const closeMessageActions = () => {
    setActionMessage(null);
    setActionAnchor(undefined);
  };

  const startReply = (message: Message) => {
    if (editingMessage) {
      setEditingMessage(null);
      setEditError('');
      setInputText(draftBeforeEditRef.current);
    }
    setReplyingTo(message);
    setTimeout(() => inputRef.current?.focus(), 80);
  };

  const startEdit = (message: Message) => {
    if (!editingMessage) draftBeforeEditRef.current = inputText;
    setReplyingTo(null);
    setEditingMessage(message);
    setEditError('');
    setInputText(message.body);
    setTimeout(() => inputRef.current?.focus(), 80);
  };

  const cancelEdit = () => {
    setEditingMessage(null);
    setEditError('');
    setInputText(draftBeforeEditRef.current);
  };

  const confirmDelete = async () => {
    if (!deletingMessage) return false;
    const deleted = await deleteMessage(deletingMessage.id);
    if (deleted) {
      if (editingMessage?.id === deletingMessage.id) cancelEdit();
      refetchConvos();
    }
    return !!deleted;
  };

  const sendDisabled =
    !inputText.trim()
    || (!!editingMessage && inputText.trim() === editingMessage.body);

  // ─── Empty state: tappable teacher + admin list ───────────────────────────────
  const renderQuickStart = () => (
    <Animated.View entering={FadeInDown.duration(280)} style={styles.emptyWrap}>
      <View style={styles.emptyHero}>
        <LinearGradient
          colors={isDark ? ['#312E81', '#1E1B4B'] : ['#EEF2FF', '#E0E7FF']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.emptyOrb}
        >
          {!isDark && (
            <LinearGradient
              colors={['rgba(255,255,255,0.7)', 'rgba(255,255,255,0)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0.7, y: 0.9 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
          )}
          <Ionicons name="chatbubble-ellipses" size={34} color={isDark ? '#A5B4FC' : ACCENT} />
        </LinearGradient>
        {!isDark && (
          <>
            <View style={styles.emptySparkleA} />
            <View style={styles.emptySparkleB} />
          </>
        )}
      </View>
      <Text style={[styles.emptyTitle, { color: theme.colors.textStrong }]}>
        {t('messages.empty_title', 'Start a conversation')}
      </Text>
      <Text style={[styles.emptyDesc, { color: theme.colors.textSecondary }]}>
        {t('messages.quick_start_desc', 'Tap your school admin or a teacher below to send a message.')}
      </Text>

      {orderedRecipients.length === 0 ? (
        <Text style={[styles.noRecipients, { color: theme.colors.textMuted }]}>
          {t('messages.no_recipients', 'No one is available to message right now.')}
        </Text>
      ) : (
        <View style={{ marginTop: 18, width: '100%' }}>
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

      {support && (
        <PressScaleInline onPress={openSupport} style={[styles.emptySupportBtn, { backgroundColor: theme.colors.primary }]}>
          <Ionicons name="headset" size={16} color="#FFFFFF" />
          <Text style={styles.emptySupportText}>{t('messages.message_support', 'Message Support')}</Text>
        </PressScaleInline>
      )}
    </Animated.View>
  );

  // ─── Render list view ───────────────────────────────────────────────────────
  const renderList = () => (
    <Animated.View entering={FadeIn.duration(180)} style={styles.viewContainer}>
      <AmbientCanvas isDark={isDark} />
      <MessagesListHeader
        title={t('messages.title', 'Messages')}
        subtitle={
          unreadTotal > 0
            ? `${unreadTotal} ${t('messages.unread', 'unread')}`
            : t('messages.all_caught_up', 'All caught up')
        }
        onBack={handleBack}
        onOpenSettings={() => router.push('/Screen/settings' as any)}
      />

      {regularConversations.length > 0 && (
        <Animated.View entering={FadeIn.duration(200)} style={[styles.inboxStrip, {
          backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.72)',
          borderColor: isDark ? theme.colors.border : 'rgba(255,255,255,0.95)',
        }]}>
          <View style={[styles.inboxIcon, { backgroundColor: theme.colors.navPill }]}>
            <Ionicons
              name={unreadTotal > 0 ? 'mail-unread-outline' : 'checkmark-circle'}
              size={14}
              color={unreadTotal > 0 ? theme.colors.primary : '#059669'}
            />
          </View>
          <Text style={[styles.inboxText, { color: theme.colors.textSecondary }]}>
            {unreadTotal > 0
              ? `${unreadTotal} ${t('messages.waiting_for_you', 'waiting for you')}`
              : t('messages.inbox_clear', "You're all caught up — nice work")}
          </Text>
        </Animated.View>
      )}

      <View style={styles.searchBarWrap}>
        <View
          style={[
            styles.searchBar,
            {
              backgroundColor: isDark ? theme.colors.surface : '#FFFFFF',
              borderColor: isDark ? theme.colors.border : 'rgba(76,90,120,0.07)',
            },
          ]}
        >
          <Ionicons name="search" size={18} color={theme.colors.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={t('messages.search_chats', 'Search conversations…')}
            placeholderTextColor={theme.colors.textMuted}
            style={[styles.searchInput, { color: theme.colors.textPrimary }]}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {!!search && Platform.OS !== 'ios' && (
            <Pressable onPress={() => setSearch('')} hitSlop={10} accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={18} color={theme.colors.textMuted} />
            </Pressable>
          )}
        </View>
      </View>

      <FlatList
        data={filteredConversations}
        keyExtractor={(item: Conversation) => item.id}
        renderItem={({ item }: { item: Conversation }) => (
          <ConversationRow
            item={item}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setActiveConv(item);
              setActiveRecipient(null);
              setView('thread');
            }}
          />
        )}
        contentContainerStyle={styles.listContent}
        refreshing={loadingConvos}
        onRefresh={refetchConvos}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        removeClippedSubviews
        windowSize={7}
        maxToRenderPerBatch={8}
        initialNumToRender={10}
        ListHeaderComponent={
          support && !search.trim() ? <View style={{ marginBottom: 2 }}>{renderSupportCard()}</View> : null
        }
        ListEmptyComponent={
          loadingConvos ? (
            <LoadingPlaceholders isDark={isDark} />
          ) : search.trim() ? (
            <View style={styles.emptyCompact}>
              <View style={[styles.emptyIconSoft, { backgroundColor: theme.colors.navPill }]}>
                <Ionicons name="search-outline" size={26} color={theme.colors.primary} />
              </View>
              <Text style={[styles.emptyTitle, { color: theme.colors.textStrong }]}>
                {t('messages.no_results', 'No matches found.')}
              </Text>
              <Text style={[styles.emptyDesc, { color: theme.colors.textSecondary }]}>
                {t('messages.try_another_name', 'Try another name or clear the search.')}
              </Text>
            </View>
          ) : (
            renderQuickStart()
          )
        }
        ListFooterComponent={
          filteredConversations.length > 0 ? (
            <View style={styles.listFooterHint}>
              <Ionicons name="sparkles" size={13} color={isDark ? '#818CF8' : '#A5B4FC'} />
              <Text style={[styles.listFooterText, { color: theme.colors.textMuted }]}>
                {t('messages.footer_hint', 'Pull down to refresh · Tap a chat to open')}
              </Text>
            </View>
          ) : null
        }
      />

      <PressScaleInline
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setSearch('');
          setView('new');
        }}
        accessibilityLabel={t('messages.new_message', 'New Message')}
        style={styles.fab}
      >
        <LinearGradient
          colors={['#6366F1', '#4F46E5']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fabGrad}
        >
          <LinearGradient
            colors={['rgba(255,255,255,0.28)', 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0.7, y: 1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <Ionicons name="create" size={22} color="#FFFFFF" />
        </LinearGradient>
      </PressScaleInline>
    </Animated.View>
  );

  // ─── Render thread view (WhatsApp-style, SchoolBackground behind) ─────────────
  const headerName = activeConv?.other_user_name || activeRecipient?.display_name || t('messages.chat', 'Chat');
  const headerPhotoUrl = activeConv?.other_user_photo || activeRecipient?.photo_url;
  const renderThread = () => (
    <Animated.View
      entering={FadeInRight.duration(230).easing(Easing.out(Easing.cubic))}
      exiting={FadeOutLeft.duration(160).easing(Easing.in(Easing.quad))}
      style={styles.viewContainer}
      renderToHardwareTextureAndroid
      shouldRasterizeIOS
    >
      <KeyboardAwareScreen
        variant="fixed"
        stickyContent={
          <View style={[styles.inputDock, { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.border }]}>
            {!!replyingTo && (
              <ReplyComposerPreview
                message={replyingTo}
                currentUserId={user?.userId}
                onCancel={() => setReplyingTo(null)}
              />
            )}
            {!!editingMessage && (
              <EditComposerPreview
                message={editingMessage}
                error={editError}
                onCancel={cancelEdit}
              />
            )}
            <View style={[styles.inputBar, { backgroundColor: isDark ? theme.colors.surface : '#FFFFFF' }]}>
              <View
                style={[
                  styles.inputWrapper,
                  {
                    backgroundColor: isDark ? theme.colors.background : '#F1F5F9',
                    borderWidth: 1,
                    borderColor: isDark ? theme.colors.border : 'rgba(76,90,120,0.08)',
                  },
                ]}
              >
                <TextInput
                  ref={inputRef}
                  value={inputText}
                  onChangeText={(value) => {
                    setInputText(value);
                    setEditError('');
                  }}
                  placeholder={editingMessage
                    ? t('messages.edit_message_placeholder', 'Edit message…')
                    : t('messages.type_message', 'Type a message...')}
                  placeholderTextColor={theme.colors.textMuted}
                  multiline
                  maxLength={4000}
                  style={[styles.input, { color: theme.colors.textPrimary }]}
                />
              </View>
              <PressScaleInline
                onPress={handleSend}
                disabled={sendDisabled}
                style={[styles.sendBtn, { backgroundColor: theme.colors.primary, shadowColor: theme.colors.primary }, sendDisabled && { opacity: 0.5 }]}
              >
                <Ionicons name={editingMessage ? 'checkmark' : 'send'} size={20} color="#FFFFFF" />
              </PressScaleInline>
            </View>
          </View>
        }
      >
        <View style={[styles.header, styles.threadHeader, { backgroundColor: isDark ? theme.colors.surface : 'rgba(255,255,255,0.94)', borderBottomColor: theme.colors.border }]}>
          <ClayIconButton
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              handleBack();
            }}
            isDark={isDark}
            accent={CLAY_ACCENT}
            size={40}
          >
            <Ionicons name="arrow-back" size={18} color={isDark ? '#F4F0FB' : '#1E293B'} />
          </ClayIconButton>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`View ${headerName} profile photo`}
            hitSlop={6}
            onPress={() => setProfilePhotoVisible(true)}
            style={({ pressed }) => [{ marginLeft: 6 }, pressed && { opacity: 0.72 }]}
          >
            <Avatar name={headerName} size={40} role={activeRecipient?.role} photoUrl={headerPhotoUrl} />
          </Pressable>
          <View style={{ flex: 1, marginLeft: 10, minWidth: 0 }}>
            <Text numberOfLines={1} style={[styles.headerTitle, { color: theme.colors.textStrong }]}>
              {headerName}
            </Text>
            <Text style={{ fontSize: 12, color: theme.colors.textMuted, marginTop: 1 }} numberOfLines={1}>
              {t('messages.tap_photo', 'Tap photo to view')}
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
                  <MessageBubble
                    item={item}
                    isMine={isMine}
                    status={deliveryStatus}
                    onRetry={() => retryMessage(item.id)}
                    onOpenActions={openMessageActions}
                    onReply={startReply}
                    theme={theme}
                  />
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
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            removeClippedSubviews={Platform.OS === 'android'}
            initialNumToRender={16}
            maxToRenderPerBatch={10}
            windowSize={7}
            updateCellsBatchingPeriod={40}
          />
        </View>
      </KeyboardAwareScreen>
    </Animated.View>
  );

  // ─── Render new conversation picker (searchable) ──────────────────────────────
  const renderNew = () => (
    <Animated.View entering={FadeInRight.duration(210).easing(Easing.out(Easing.cubic))} exiting={FadeOutLeft.duration(150)} style={styles.viewContainer}>
      <AmbientCanvas isDark={isDark} />
      <View
        style={[
          styles.listHeader,
          {
            backgroundColor: isDark ? theme.colors.surface : 'rgba(255,255,255,0.88)',
            borderBottomColor: isDark ? theme.colors.border : 'rgba(76,90,120,0.08)',
          },
        ]}
      >
        <ClayIconButton
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            handleBack();
          }}
          isDark={isDark}
          accent={CLAY_ACCENT}
          size={42}
        >
          <Ionicons name="arrow-back" size={19} color={isDark ? '#F4F0FB' : '#1E293B'} />
        </ClayIconButton>
        <View style={[styles.listHeaderCenter, { marginLeft: 8 }]}>
          <Text style={[styles.listHeaderTitle, { color: theme.colors.textStrong }]}>
            {t('messages.new_message', 'New Message')}
          </Text>
          <Text style={[styles.listHeaderSub, { color: theme.colors.textMuted }]}>
            {t('messages.pick_someone', 'Pick someone to chat with')}
          </Text>
        </View>
      </View>

      <View style={styles.searchBarWrap}>
        <View
          style={[
            styles.searchBar,
            {
              backgroundColor: isDark ? theme.colors.surface : '#FFFFFF',
              borderColor: isDark ? theme.colors.border : 'rgba(76,90,120,0.07)',
            },
          ]}
        >
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
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 8, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {support && !search.trim() && (
          <View style={{ marginBottom: 4 }}>{renderSupportCard()}</View>
        )}
        {filteredRecipients.length === 0 ? (
          <Text style={[styles.noRecipients, { color: theme.colors.textMuted }]}>
            {t('messages.no_recipients', 'No one is available to message right now.')}
          </Text>
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
    <TourTarget id="screen.screen-messages.overview" style={{ flex: 1 }}><TourTarget id="screen.screen-messages.workspace" style={{ flex: 1 }}><ScreenLayout style={{ backgroundColor: isDark ? theme.colors.background : CLAY_BG_LIGHT }}>
      {view === 'resolving' && (
        <View style={styles.viewContainer}>
          <StudentHeader showBackButton title={t('messages.chat', 'Chat')} />
          <View style={styles.resolvingState}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
          </View>
        </View>
      )}
      {view === 'list' && renderList()}
      {view === 'thread' && renderThread()}
      {view === 'new' && renderNew()}
      <ProfilePhotoViewer
        visible={view === 'thread' && profilePhotoVisible}
        name={headerName}
        imageUrl={headerPhotoUrl}
        role={activeRecipient?.role}
        onClose={() => setProfilePhotoVisible(false)}
      />
      <MessageActionSheet
        visible={!!actionMessage}
        message={actionMessage}
        currentUserId={user?.userId}
        anchor={actionAnchor}
        onClose={closeMessageActions}
        onReply={startReply}
        onForward={setForwardingMessage}
        onEdit={startEdit}
        onDelete={setDeletingMessage}
      />
      <ForwardMessageModal
        visible={!!forwardingMessage}
        message={forwardingMessage}
        conversations={(conversations || []).filter((item) => item.id !== activeConv?.id)}
        onClose={() => setForwardingMessage(null)}
        onForward={handleForward}
      />
      <DeleteMessageDialog
        visible={!!deletingMessage}
        message={deletingMessage}
        onClose={() => setDeletingMessage(null)}
        onConfirm={confirmDelete}
      />
    </ScreenLayout></TourTarget></TourTarget>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  viewContainer: { flex: 1 },
  resolvingState: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  blobA: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    top: -40,
    right: -60,
    backgroundColor: 'rgba(99,102,241,0.10)',
  },
  blobB: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    top: 180,
    left: -70,
    backgroundColor: 'rgba(167,139,250,0.09)',
  },
  blobC: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    bottom: 80,
    right: 20,
    backgroundColor: 'rgba(129,140,248,0.08)',
  },

  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 64,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    ...Platform.select({
      ios: { shadowColor: '#6B7A99', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 10 },
      android: { elevation: 2 },
      default: {},
    }),
  },
  listHeaderCenter: { flex: 1, minWidth: 0, marginLeft: 2 },
  listHeaderTitle: { fontSize: 17, fontWeight: '700', letterSpacing: -0.3 },
  listHeaderSub: { fontSize: 12, fontWeight: '500', marginTop: 1 },
  listHeaderLang: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  langLabel: { fontSize: 11, fontWeight: '700' },

  inboxStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: Spacing.md,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderBottomWidth: 1.5,
    borderBottomColor: 'rgba(76,90,120,0.08)',
  },
  inboxIcon: {
    width: 26,
    height: 26,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inboxText: { flex: 1, fontSize: 12.5, fontWeight: '600' },

  searchBarWrap: { paddingHorizontal: Spacing.md, paddingTop: 10 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    height: 46,
    borderRadius: 16,
    borderWidth: 1,
    borderBottomWidth: 1.5,
    borderBottomColor: 'rgba(76,90,120,0.11)',
  },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 0 },

  listContent: { padding: Spacing.md, paddingTop: 12, paddingBottom: 110, flexGrow: 1 },
  listFooterHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 16,
    marginBottom: 8,
    opacity: 0.9,
  },
  listFooterText: { fontSize: 12, fontWeight: '500' },

  fab: {
    position: 'absolute',
    right: 18,
    bottom: 22,
    width: 56,
    height: 56,
    borderRadius: 20,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#4F46E5', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.32, shadowRadius: 16 },
      android: { elevation: 6 },
      default: {},
    }),
  },
  fabGrad: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    borderBottomWidth: 2,
    borderBottomColor: 'rgba(15,23,42,0.18)',
  },

  supportCard: {
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 20,
    borderWidth: 1,
    borderBottomWidth: 2,
    borderBottomColor: 'rgba(79,70,229,0.16)',
    marginBottom: 10,
    ...Platform.select({
      ios: { shadowColor: '#4F46E5', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 14 },
      android: { elevation: 3 },
      default: {},
    }),
  },
  supportGlow: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: 55,
    right: -36,
    top: -56,
    backgroundColor: 'rgba(99,102,241,0.14)',
  },
  supportAccentBar: {
    position: 'absolute',
    left: 0,
    top: 10,
    bottom: 10,
    width: 3.5,
    borderRadius: 4,
    opacity: 0.85,
  },
  supportTitle: { fontSize: 15, fontWeight: '750' as any, letterSpacing: -0.2 },
  verifiedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 999,
  },
  verifiedText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.2 },
  supportSub: { fontSize: 12.5, lineHeight: 17, marginTop: 3 },
  supportChat: {
    width: 36,
    height: 36,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
    borderBottomWidth: 1.5,
    borderBottomColor: 'rgba(15,23,42,0.18)',
  },
  supportUnread: {
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    paddingHorizontal: 7,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  supportUnreadText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 64,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
  },
  threadHeader: {
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    ...Platform.select({
      ios: { shadowColor: '#6B7A99', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4 },
      android: { elevation: 2 },
      default: {},
    }),
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A', letterSpacing: -0.2 },

  convoRow: {
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    marginBottom: 9,
    borderWidth: 1,
    borderBottomWidth: 1.5,
    borderBottomColor: 'rgba(76,90,120,0.09)',
  },
  convoUnreadBar: {
    position: 'absolute',
    left: 0,
    top: 12,
    bottom: 12,
    width: 3.5,
    borderRadius: 4,
  },
  convoTitle: { fontSize: 15, fontWeight: '600', flex: 1, letterSpacing: -0.15 },
  convoTitleUnread: { fontWeight: '750' as any },
  convoDate: { fontSize: 11.5, fontWeight: '500' },
  convoPreview: { fontSize: 13, marginTop: 3 },
  unreadBadge: {
    borderRadius: 11,
    minWidth: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    marginLeft: 6,
  },
  unreadBadgeText: { fontSize: 11, fontWeight: '800', color: '#FFFFFF' },

  recipientRow: {
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    marginBottom: 9,
    borderWidth: 1,
    borderBottomWidth: 1.5,
    borderBottomColor: 'rgba(76,90,120,0.10)',
  },
  recipientName: { fontSize: 15, fontWeight: '650' as any, flexShrink: 1 },
  recipientSub: { fontSize: 12.5, marginTop: 2 },
  pinChip: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatChip: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
    borderBottomWidth: 1.5,
    borderBottomColor: 'rgba(79,70,229,0.12)',
  },

  emptyWrap: { alignItems: 'center', paddingTop: 20, paddingHorizontal: 4, flexGrow: 1 },
  emptyCompact: { alignItems: 'center', marginTop: 48, paddingHorizontal: 24 },
  emptyHero: { width: 96, height: 96, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyOrb: {
    width: 84,
    height: 84,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderBottomWidth: 2,
    borderBottomColor: 'rgba(79,70,229,0.16)',
    ...Platform.select({
      ios: { shadowColor: '#4F46E5', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.18, shadowRadius: 18 },
      android: { elevation: 5 },
      default: {},
    }),
  },
  emptySparkleA: {
    position: 'absolute',
    top: 6,
    right: 2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#A5B4FC',
    opacity: 0.85,
  },
  emptySparkleB: {
    position: 'absolute',
    bottom: 10,
    left: 0,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#C7D2FE',
  },
  emptyIconSoft: {
    width: 64,
    height: 64,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    borderBottomWidth: 1.5,
    borderBottomColor: 'rgba(79,70,229,0.14)',
  },
  emptyTitle: { fontSize: 20, fontWeight: '750' as any, letterSpacing: -0.3, textAlign: 'center' },
  emptyDesc: {
    fontSize: 14.5,
    lineHeight: 21,
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 12,
    maxWidth: 340,
  },
  emptySupportBtn: {
    marginTop: 18,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    height: 44,
    borderRadius: 16,
    ...Platform.select({
      ios: { shadowColor: '#4F46E5', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.28, shadowRadius: 12 },
      android: { elevation: 4 },
      default: {},
    }),
  },
  emptySupportText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  noRecipients: { fontSize: 14, textAlign: 'center', marginTop: 24 },

  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: 18,
    borderBottomWidth: 1.5,
    borderBottomColor: 'rgba(76,90,120,0.08)',
  },
  skeletonAvatar: { width: 44, height: 44, borderRadius: 22 },
  skeletonLine: { height: 10, borderRadius: 6 },

  bubble: {
    borderRadius: 18,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  bubbleMenuHint: {
    position: 'absolute',
    top: 5,
    right: 7,
    zIndex: 1,
  },
  forwardedLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
    paddingRight: 18,
  },
  forwardedText: { fontSize: 11, fontStyle: 'italic' },
  quotedMessage: {
    minWidth: 180,
    marginBottom: 6,
    flexDirection: 'row',
    overflow: 'hidden',
    borderRadius: 10,
  },
  quoteAccent: { width: 3.5, backgroundColor: '#22C55E' },
  quoteContent: { flex: 1, paddingHorizontal: 9, paddingVertical: 6 },
  quoteSender: { fontSize: 11.5, fontWeight: '700', color: '#4F46E5' },
  quoteBody: { marginTop: 2, fontSize: 11.5, lineHeight: 15 },
  deletedMessage: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingRight: 4 },
  deletedMessageText: { fontSize: 14, fontStyle: 'italic', lineHeight: 20 },
  editedLabel: { fontSize: 10, fontStyle: 'italic' },

  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
  },
  inputDock: {
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  inputWrapper: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    borderRadius: 18,
    minHeight: 44,
    maxHeight: 120,
    marginRight: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  input: { flex: 1, fontSize: 16, color: '#1E293B', paddingTop: 0, paddingBottom: 0 },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 1.5,
    borderBottomColor: 'rgba(15,23,42,0.18)',
    ...Platform.select({
      ios: { shadowColor: '#4F46E5', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.28, shadowRadius: 8 },
      android: { elevation: 3 },
      default: {},
    }),
  },
});
