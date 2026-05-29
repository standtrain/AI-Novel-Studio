import client from './client';

export interface SiteInfo {
  siteName: string;
  siteDescription: string;
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
