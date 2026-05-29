import client from './client';

export interface NovelTemplate {
  id: number;
  name: string;
  display_name: string;
  description: string;
  category: string;
  cover_gradient: string;
  icon: string;
  genre?: string;
  title_example?: string;
  theme?: string;
  setting?: string;
  main_plot?: string;
  is_official: boolean;
  creator_id?: number;
  creator_username?: string;
  is_public: boolean;
  review_status: 'pending' | 'approved' | 'rejected' | null;
  review_note?: string;
  usage_count: number;
  sort_order: number;
  enabled: boolean;
  created_at: string;
}

export interface TemplateReviewModeConfig {
  mode: string;
  modes: { value: string; label: string; desc: string }[];
}

// ---- 公开接口 ----

// 获取公开模板列表
export async function getTemplatesApi(): Promise<{ templates: NovelTemplate[] }> {
  const { data } = await client.get('/templates');
  return data;
}

// 获取模板分类列表（所有分类）
export interface TemplateCategory {
  id: number;
  name: string;
  sort_order: number;
  enabled: boolean;
}

// 获取模板分类
export async function getTemplateCategoriesApi(): Promise<{ categories: string[] }> {
  const { data } = await client.get('/templates/categories');
  return data;
}

// 获取模板详情
export async function getTemplateApi(id: number): Promise<{ template: NovelTemplate }> {
  const { data } = await client.get(`/templates/${id}`);
  return data;
}

// 从模板创建小说
export async function createNovelFromTemplateApi(
  templateId: number,
  overrides?: { title?: string; genre?: string },
): Promise<{ novel: any; template: NovelTemplate }> {
  const { data } = await client.post(`/templates/${templateId}/use`, overrides || {});
  return data;
}

// ---- 用户自有模板 ----

// 获取我的模板列表
export async function getMyTemplatesApi(): Promise<{ templates: NovelTemplate[] }> {
  const { data } = await client.get('/templates/my/list');
  return data;
}

// 创建我的模板
export async function createMyTemplateApi(templateData: Partial<NovelTemplate>): Promise<{ template: NovelTemplate }> {
  const { data } = await client.post('/templates/my', templateData);
  return data;
}

// 更新我的模板
export async function updateMyTemplateApi(id: number, templateData: Partial<NovelTemplate>): Promise<{ template: NovelTemplate }> {
  const { data } = await client.put(`/templates/my/${id}`, templateData);
  return data;
}

// 删除我的模板
export async function deleteMyTemplateApi(id: number): Promise<{ message: string }> {
  const { data } = await client.delete(`/templates/my/${id}`);
  return data;
}

// 提交模板审核
export async function submitTemplateForReviewApi(id: number): Promise<{
  review_status: string;
  message: string;
  mode?: string;
  aiResult?: any;
}> {
  const { data } = await client.post(`/templates/my/${id}/submit`);
  return data;
}

// ---- 管理员接口 ----

// 获取所有模板
export async function getAllTemplatesAdminApi(): Promise<{ templates: NovelTemplate[] }> {
  const { data } = await client.get('/templates/admin/all');
  return data;
}

// 获取待审核列表
export async function getPendingTemplatesApi(): Promise<{ templates: NovelTemplate[] }> {
  const { data } = await client.get('/templates/admin/pending');
  return data;
}

// 审核模板
export async function reviewTemplateApi(id: number, action: 'approve' | 'reject', note?: string): Promise<{ review_status: string }> {
  const { data } = await client.post(`/templates/admin/review/${id}`, { action, note });
  return data;
}

// 获取审核模式配置
export async function getReviewModeConfigApi(): Promise<TemplateReviewModeConfig> {
  const { data } = await client.get('/templates/admin/review-mode');
  return data;
}

// AI 审核 Provider 配置
export interface AiReviewProviderConfig {
  providerName: string;
  modelName: string;
  providers: { name: string; baseUrl: string; models: { name: string }[] }[];
}

export async function getAiReviewConfigApi(): Promise<AiReviewProviderConfig> {
  const { data } = await client.get('/templates/admin/ai-review-config');
  return data;
}

export async function setAiReviewConfigApi(providerName: string, modelName: string): Promise<{ providerName: string; modelName: string }> {
  const { data } = await client.put('/templates/admin/ai-review-config', { providerName, modelName });
  return data;
}

// 设置审核模式
export async function setReviewModeConfigApi(mode: string): Promise<{ mode: string }> {
  const { data } = await client.put('/templates/admin/review-mode', { mode });
  return data;
}

// 管理员更新模板
export async function updateTemplateAdminApi(id: number, templateData: Partial<NovelTemplate>): Promise<{ template: NovelTemplate; message: string }> {
  const { data } = await client.put(`/templates/admin/${id}`, templateData);
  return data;
}

// 管理员删除模板
export async function deleteTemplateAdminApi(id: number): Promise<{ message: string }> {
  const { data } = await client.delete(`/templates/admin/${id}`);
  return data;
}

// ---- 分类管理 ----

export async function getAllCategoriesAdminApi(): Promise<{ categories: TemplateCategory[] }> {
  const { data } = await client.get('/templates/admin/categories/all');
  return data;
}

export async function createCategoryApi(name: string, sort_order?: number): Promise<{ category: TemplateCategory }> {
  const { data } = await client.post('/templates/admin/categories', { name, sort_order });
  return data;
}

export async function updateCategoryApi(id: number, updates: Partial<TemplateCategory>): Promise<{ message: string }> {
  const { data } = await client.put(`/templates/admin/categories/${id}`, updates);
  return data;
}

export async function deleteCategoryApi(id: number): Promise<{ message: string }> {
  const { data } = await client.delete(`/templates/admin/categories/${id}`);
  return data;
}
