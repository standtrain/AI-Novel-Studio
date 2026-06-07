// 对话 CRUD API
import apiClient from './client';
import type { Conversation, PaginatedResponse } from '../types';

export async function listConversationsApi(
  page = 1,
  limit = 20
): Promise<PaginatedResponse<Conversation>> {
  const { data } = await apiClient.get('/chat/conversations', {
    params: { page, limit },
  });
  return data;
}

export async function createConversationApi(title: string): Promise<Conversation> {
  const { data } = await apiClient.post('/chat/conversations', { title });
  return data;
}

export async function getConversationApi(id: number): Promise<Conversation> {
  const { data } = await apiClient.get(`/chat/conversations/${id}`);
  return data;
}

export async function deleteConversationApi(id: number): Promise<void> {
  await apiClient.delete(`/chat/conversations/${id}`);
}
