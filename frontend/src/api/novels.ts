import client from './client';
import type { Novel, NovelDetail, PaginatedResponse, ImportNovelData } from '../types';

export async function listNovelsApi(page = 1, limit = 10): Promise<PaginatedResponse<Novel>> {
  const { data } = await client.get('/novels', { params: { page, limit } });
  return data;
}

export async function createNovelApi(title: string, genre?: string): Promise<{ novel: Novel }> {
  const { data } = await client.post('/novels', { title, genre });
  return data;
}

export async function getNovelApi(id: number, lightweight = false): Promise<{ novel: NovelDetail }> {
  const { data } = await client.get(`/novels/${id}`, { params: lightweight ? { lightweight: 'true' } : {} });
  return data;
}

// 获取单个章节完整内容（含审查/提取结果）
export async function getChapterContentApi(novelId: number, chapterNum: number): Promise<{ chapter: any }> {
  const { data } = await client.get(`/novels/${novelId}/chapters/${chapterNum}`);
  return data;
}

export async function updateNovelApi(id: number, updates: Partial<Novel>): Promise<{ novel: Novel }> {
  const { data } = await client.put(`/novels/${id}`, updates);
  return data;
}

export async function deleteNovelApi(id: number): Promise<void> {
  await client.delete(`/novels/${id}`);
}

// 导入小说
export async function importNovelApi(importData: ImportNovelData): Promise<{ novel: NovelDetail }> {
  const { data } = await client.post('/novels/import', importData);
  return data;
}

// 导出小说
export async function exportNovelApi(
  novelId: number,
  params: { format: string; scope: string; chapters?: string; chapterNum?: number }
): Promise<Blob> {
  const response = await client.get(`/novels/${novelId}/export`, {
    params,
    responseType: 'blob',
  });
  return response.data;
}
