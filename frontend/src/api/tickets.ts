import client from './client';

export type TicketType = 'general' | 'appeal';
export type TicketStatus = 'open' | 'answered' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';
export type TicketSenderType = 'user' | 'admin' | 'ai' | 'system';
export type TicketAiReplyMode = 'manual' | 'ai_manual' | 'ai_auto';

export interface TicketRecord {
  id: number;
  user_id: number;
  username?: string;
  email?: string;
  type: TicketType;
  title: string;
  content: string;
  status: TicketStatus;
  priority: TicketPriority;
  source_type?: 'appeal' | 'manual' | null;
  source_id?: number | null;
  ai_result?: any;
  appeal_id?: number | null;
  appeal_status?: 'pending' | 'approved' | 'rejected' | null;
  appeal_review_note?: string | null;
  appeal_reviewer_name?: string | null;
  appeal_ai_result?: any;
  ban_type?: string | null;
  ban_reason?: string | null;
  ban_status?: string | null;
  needs_manual_review?: boolean;
  ai_manual_reason?: string;
  closed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TicketReply {
  id: number;
  ticket_id: number;
  sender_id: number | null;
  sender_type: TicketSenderType;
  sender_name?: string | null;
  content: string;
  is_ai: boolean;
  notification_sent_at?: string | null;
  created_at: string;
}

export interface TicketDetailResponse {
  ticket: TicketRecord;
  replies: TicketReply[];
}

export interface TicketListParams {
  page?: number;
  limit?: number;
  type?: TicketType;
  priority?: TicketPriority;
  status?: TicketStatus;
  q?: string;
}

export interface TicketAiReplyModeConfig {
  mode: TicketAiReplyMode;
  modes: { value: TicketAiReplyMode; label: string; desc: string }[];
}

export async function getTicketsApi(params?: TicketListParams) {
  const { data } = await client.get('/tickets', { params });
  return data as { rows: TicketRecord[]; total: number; page: number; limit: number };
}

export async function createTicketApi(payload: { title: string; content: string; priority?: TicketPriority }) {
  const { data } = await client.post('/tickets', payload);
  return data as TicketDetailResponse;
}

export async function getTicketDetailApi(id: number) {
  const { data } = await client.get(`/tickets/${id}`);
  return data as TicketDetailResponse;
}

export async function replyTicketApi(id: number, content: string) {
  const { data } = await client.post(`/tickets/${id}/replies`, { content });
  return data as TicketDetailResponse;
}

export async function closeTicketApi(id: number) {
  const { data } = await client.post(`/tickets/${id}/close`);
  return data as TicketDetailResponse;
}

export async function getAdminTicketsApi(params?: TicketListParams) {
  const { data } = await client.get('/admin/tickets', { params });
  return data as { rows: TicketRecord[]; total: number; page: number; limit: number };
}

export async function getAdminTicketDetailApi(id: number) {
  const { data } = await client.get(`/admin/tickets/${id}`);
  return data as TicketDetailResponse;
}

export async function adminReplyTicketApi(id: number, payload: { content: string; senderType?: 'admin' | 'ai'; isAi?: boolean }) {
  const { data } = await client.post(`/admin/tickets/${id}/replies`, payload);
  return data as TicketDetailResponse;
}

export async function resolveAdminTicketApi(id: number, payload: { note?: string; action?: 'approve' | 'reject' }) {
  const { data } = await client.post(`/admin/tickets/${id}/resolve`, payload);
  return data as { message: string; ticket?: TicketRecord; status?: string };
}

export async function generateAdminTicketAiReplyApi(id: number) {
  const { data } = await client.post(`/admin/tickets/${id}/ai-reply`);
  return data as { draft: string };
}

export async function getAdminTicketAiReplyModeConfigApi() {
  const { data } = await client.get('/admin/ticket-ai-reply-mode');
  return data as TicketAiReplyModeConfig;
}

export async function setAdminTicketAiReplyModeConfigApi(mode: TicketAiReplyMode) {
  const { data } = await client.put('/admin/ticket-ai-reply-mode', { mode });
  return data as TicketAiReplyModeConfig;
}
