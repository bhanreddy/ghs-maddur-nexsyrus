import { api } from './apiClient';

// ─── Types ────────────────────────────────────────────────────────────────────

export type MessengerRole = 'admin' | 'teacher' | 'staff' | 'parent' | 'student' | 'support';

export interface SupportContact {
  user_id: string;
  display_name: 'Nexsyrus Support' | string;
  photo_url: string | null;
  role: 'support';
}

export interface Recipient {
  user_id: string;
  display_name: string;
  role: MessengerRole;
  student_id?: string | null;
  student_name?: string | null;
  photo_url?: string | null;
}

export type GroupMode = 'broadcast' | 'chat';

export interface Conversation {
  id: string;
  pair_type: 'parent_admin' | 'admin_teacher' | 'teacher_parent' | 'group' | 'support';
  subject: string | null;
  student_id: string | null;
  student_name: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  created_at: string;
  other_user_name: string | null;
  other_user_photo?: string | null;
  other_user_id: string | null;
  unread_count: number;
  last_read_at: string | null;
  muted: boolean;
  // Group fields (null/false for 1:1 threads)
  is_group?: boolean;
  group_name?: string | null;
  group_mode?: GroupMode | null;
  member_count?: number | null;
  is_group_admin?: boolean;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_user_id: string;
  sender_name: string;
  sender_photo?: string | null;
  body: string;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  /** Client-only: optimistic send status */
  _status?: 'sending' | 'sent' | 'failed';
}

export interface UnreadTotal {
  unread_count: number;
}

export interface LiveState {
  receipts: {
    last_delivered_at: string | null;
    last_seen_at: string | null;
    other_count: number;
  };
  typing: { user_id: string; display_name: string }[];
  presence: { user_id: string; last_active_at: string | null; online: boolean } | null;
}

/** Delivery/seen status derived from receipt high-water marks. */
export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'seen' | 'failed';

// ─── Service ──────────────────────────────────────────────────────────────────

export const MessagesService = {
  getSupportContact: (): Promise<SupportContact> =>
    api.get<SupportContact>('/messages/support-contact'),

  getEligibleRecipients: (): Promise<Recipient[]> =>
    api.get<Recipient[]>('/messages/eligible-recipients'),

  getConversations: (params?: { limit?: number; before?: string }): Promise<Conversation[]> =>
    api.get<Conversation[]>('/messages/conversations', params),

  createConversation: (data: {
    recipient_user_id: string;
    student_id?: string | null;
    subject?: string;
  }): Promise<Conversation> =>
    api.post<Conversation>('/messages/conversations', data),

  getMessages: (
    conversationId: string,
    params?: { before?: string; since?: string; limit?: number },
  ): Promise<Message[]> =>
    api.get<Message[]>(`/messages/conversations/${conversationId}/messages`, params),

  sendMessage: (conversationId: string, body: string, clientMsgId?: string): Promise<Message> =>
    api.post<Message>(`/messages/conversations/${conversationId}/messages`, {
      body,
      ...(clientMsgId ? { client_msg_id: clientMsgId } : {}),
    }),

  markRead: (conversationId: string): Promise<{ read: boolean }> =>
    api.post<{ read: boolean }>(`/messages/conversations/${conversationId}/read`),

  /** One poll → delivery/seen receipts + typing + presence (also heartbeats). */
  getLive: (conversationId: string): Promise<LiveState> =>
    api.get<LiveState>(`/messages/conversations/${conversationId}/live`),

  markTyping: (conversationId: string): Promise<{ ok: boolean }> =>
    api.post<{ ok: boolean }>(`/messages/conversations/${conversationId}/typing`),

  getUnreadTotal: (): Promise<UnreadTotal> =>
    api.get<UnreadTotal>('/messages/unread-total'),

  /** Admin-only: create a group (broadcast or open chat) with a set of members. */
  createGroup: (data: {
    group_name: string;
    group_mode: GroupMode;
    member_user_ids: string[];
  }): Promise<Conversation> =>
    api.post<Conversation>('/messages/groups', data),
};
