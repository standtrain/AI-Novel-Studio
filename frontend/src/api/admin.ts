import client from './client';

export async function getStatsApi() {
  const { data } = await client.get('/admin/stats');
  return data;
}

export async function getUsersApi(params?: { page?: number; limit?: number; status?: string; group_id?: number }) {
  const { data } = await client.get('/admin/users', { params });
  return data;
}

export async function getUserDetailApi(userId: number) {
  const { data } = await client.get(`/admin/users/${userId}`);
  return data;
}

export async function updateUserApi(userId: number, updates: { status?: string; group_id?: number; email?: string; username?: string }) {
  const { data } = await client.put(`/admin/users/${userId}`, updates);
  return data;
}

export async function createUserApi(userData: { username: string; email: string; password: string; group_id?: number }) {
  const { data } = await client.post('/admin/users', userData);
  return data;
}

export async function deleteUserApi(userId: number) {
  const { data } = await client.delete(`/admin/users/${userId}`);
  return data;
}

export async function getConfigsApi() {
  const { data } = await client.get('/admin/config');
  return data;
}

export interface AdminSearchResult {
  users: Array<{ id: number; username: string; email: string; status: string; group_name: string; _type: 'user' }>;
  novels: Array<{ id: number; title: string; genre: string; status: string; author: string; _type: 'novel' }>;
  configs: Array<{ config_key: string; config_value: string; description: string; _type: 'config' }>;
}

export async function adminSearchApi(q: string): Promise<AdminSearchResult> {
  const { data } = await client.get('/admin/search', { params: { q } });
  return data;
}

export async function updateConfigApi(key: string, value: string) {
  const { data } = await client.put(`/admin/config/${key}`, { value });
  return data;
}

export async function getUsageLogsApi(params?: { page?: number; limit?: number; user_id?: number }) {
  const { data } = await client.get('/admin/usage', { params });
  return data;
}

// Provider 管理
export async function getProvidersApi() {
  const { data } = await client.get('/admin/providers');
  return data;
}

export async function saveProvidersApi(providers: any[]) {
  const { data } = await client.put('/admin/providers', { providers });
  return data;
}

export async function testProviderApi(provider: { baseUrl: string; apiKey: string; model: string }) {
  const { data } = await client.post('/admin/providers/test', { provider });
  return data;
}

// 模型 Token 限额管理
export async function getModelTokenLimitsApi() {
  const { data } = await client.get('/admin/model-limits');
  return data;
}

export async function saveModelTokenLimitApi(config: {
  providerName: string; modelName: string;
  dailyLimit?: number; monthlyLimit?: number; enabled?: boolean;
}) {
  const { data } = await client.put('/admin/model-limits', config);
  return data;
}

export async function deleteModelTokenLimitApi(id: number) {
  const { data } = await client.delete(`/admin/model-limits/${id}`);
  return data;
}

export async function getSelectableModelsApi() {
  const { data } = await client.get('/admin/selectable-models');
  return data;
}

// 小说管理
export async function getAdminNovelsApi(params?: { page?: number; limit?: number; user_id?: number; status?: string }) {
  const { data } = await client.get('/admin/novels', { params });
  return data;
}

export async function getAdminNovelDetailApi(novelId: number) {
  const { data } = await client.get(`/admin/novels/${novelId}`);
  return data;
}

export async function deleteAdminNovelApi(novelId: number) {
  const { data } = await client.delete(`/admin/novels/${novelId}`);
  return data;
}

// 分组管理
export interface GroupData {
  name: string;
  token_limit_per_day?: number;
  rate_limit_per_minute?: number;
  max_novels?: number;
  max_chapters_per_novel?: number;
  can_export?: boolean;
  can_customize?: boolean;
  can_choose_model?: boolean;
  description?: string;
  queue_priority?: number;
  is_admin?: boolean;
}

export async function getGroupsApi() {
  const { data } = await client.get('/admin/groups');
  return data;
}

export async function getGroupDetailApi(groupId: number) {
  const { data } = await client.get(`/admin/groups/${groupId}`);
  return data;
}

export async function createGroupApi(groupData: GroupData) {
  const { data } = await client.post('/admin/groups', groupData);
  return data;
}

export async function updateGroupApi(groupId: number, groupData: Partial<GroupData>) {
  const { data } = await client.put(`/admin/groups/${groupId}`, groupData);
  return data;
}

export async function deleteGroupApi(groupId: number) {
  const { data } = await client.delete(`/admin/groups/${groupId}`);
  return data;
}

// ==================== 封禁/申诉管理 ====================

export interface BanRecord {
  id: number;
  user_id: number;
  username: string;
  email: string;
  type: 'ban' | 'deactivate';
  reason?: string;
  operator_id?: number;
  operator_name?: string;
  status: 'active' | 'lifted';
  created_at: string;
  updated_at: string;
}

export interface AppealRecord {
  id: number;
  ban_id: number;
  user_id: number;
  username: string;
  email: string;
  content: string;
  ban_type: string;
  ban_reason?: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by?: number;
  reviewer_name?: string;
  review_note?: string;
  ai_result?: any;
  created_at: string;
  updated_at: string;
}

export interface AppealReviewModeConfig {
  mode: string;
  modes: { value: string; label: string; desc: string }[];
}

export interface AppealAiReviewConfig {
  providerName: string;
  modelName: string;
  providers: { name: string; baseUrl: string; models: { name: string }[] }[];
}

export async function getBansApi(params?: { page?: number; limit?: number; status?: string }) {
  const { data } = await client.get('/admin/bans', { params });
  return data;
}

export async function banUserApi(userId: number, reason?: string) {
  const { data } = await client.post(`/admin/users/${userId}/ban`, { reason });
  return data;
}

export async function unbanUserApi(banId: number) {
  const { data } = await client.post(`/admin/bans/${banId}/unban`);
  return data;
}

export async function getAppealsApi(params?: { page?: number; limit?: number; status?: string }) {
  const { data } = await client.get('/admin/appeals', { params });
  return data;
}

export async function reviewAppealApi(appealId: number, action: 'approve' | 'reject', note?: string) {
  const { data } = await client.post(`/admin/appeals/${appealId}/review`, { action, note });
  return data;
}

export async function getAppealReviewModeConfigApi(): Promise<AppealReviewModeConfig> {
  const { data } = await client.get('/admin/appeal-review-mode');
  return data;
}

export async function setAppealReviewModeConfigApi(mode: string) {
  const { data } = await client.put('/admin/appeal-review-mode', { mode });
  return data;
}

export async function getAppealAiReviewConfigApi(): Promise<AppealAiReviewConfig> {
  const { data } = await client.get('/admin/appeal-ai-review-config');
  return data;
}

export async function setAppealAiReviewConfigApi(providerName: string, modelName: string) {
  const { data } = await client.put('/admin/appeal-ai-review-config', { providerName, modelName });
  return data;
}

// 用户申诉（公开接口，无需登录）
export async function submitAppealApi(banId: number, userId: number, content: string) {
  const { data } = await client.post('/auth/appeal', { banId, userId, content });
  return data;
}

// ==================== favicon 管理 ====================

export interface FaviconInfo {
  hasCustom: boolean;
  url: string | null;
  originalName: string | null;
  size: number | null;
}

export async function getFaviconInfoApi(): Promise<FaviconInfo> {
  const { data } = await client.get('/admin/favicon');
  return data;
}

export async function uploadFaviconApi(file: File): Promise<{ url: string; filename: string; size: number }> {
  const formData = new FormData();
  formData.append('favicon', file);
  const { data } = await client.post('/admin/favicon', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function deleteFaviconApi(): Promise<{ success: boolean; message: string }> {
  const { data } = await client.delete('/admin/favicon');
  return data;
}
