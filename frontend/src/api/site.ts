import client from './client';

export interface SiteInfo {
  siteName: string;
  siteDescription: string;
  faviconUrl?: string;
  footerContent?: string;
}

export type LegalDocumentType = 'terms' | 'privacy';

export interface LegalDocument {
  type: LegalDocumentType;
  title: string;
  content: string;
}

export async function getSiteInfoApi(): Promise<SiteInfo> {
  const { data } = await client.get('/site/info');
  return data;
}

export interface WritingPromptConfig {
  prompt: string;
  defaultPrompt: string;
  enabled: boolean;
  source: 'default' | 'user' | 'disabled';
}

export async function getWritingPromptApi(): Promise<WritingPromptConfig> {
  const { data } = await client.get('/site/writing-prompt');
  return data;
}

export async function getLegalDocumentApi(type: LegalDocumentType): Promise<LegalDocument> {
  const { data } = await client.get(`/site/legal/${type}`);
  return data;
}

export async function updateWritingPromptApi(prompt: string): Promise<{ success: boolean } & WritingPromptConfig> {
  const { data } = await client.put('/site/writing-prompt', { prompt });
  return data;
}

import type { Notification } from '../types';

export async function getSiteNotificationsApi(): Promise<{ banners: Notification[]; popups: Notification[] }> {
  const { data } = await client.get('/site/notifications');
  return data;
}

// 站内信
import type { Inmail } from '../types';

export async function getInmailUnreadCountApi(): Promise<{ count: number }> {
  const { data } = await client.get('/inmails/count');
  return data;
}

export async function getInmailsApi(params?: { page?: number; limit?: number; unread?: boolean }): Promise<{ rows: Inmail[]; total: number; page: number; limit: number }> {
  const { data } = await client.get('/inmails', { params });
  return data;
}

export async function markInmailReadApi(id: number): Promise<{ success: boolean }> {
  const { data } = await client.put(`/inmails/${id}/read`);
  return data;
}

export async function markAllInmailReadApi(): Promise<{ success: boolean }> {
  const { data } = await client.put('/inmails/read-all');
  return data;
}
