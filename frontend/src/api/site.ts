import client from './client';

export interface SiteInfo {
  siteName: string;
  siteDescription: string;
  faviconUrl?: string;
}

export async function getSiteInfoApi(): Promise<SiteInfo> {
  const { data } = await client.get('/site/info');
  return data;
}

export async function getWritingPromptApi(): Promise<{ prompt: string }> {
  const { data } = await client.get('/site/writing-prompt');
  return data;
}

export async function updateWritingPromptApi(prompt: string): Promise<{ success: boolean }> {
  const { data } = await client.put('/site/writing-prompt', { prompt });
  return data;
}

import type { Notification } from '../types';

export async function getSiteNotificationsApi(): Promise<{ banners: Notification[]; popups: Notification[] }> {
  const { data } = await client.get('/site/notifications');
  return data;
}
