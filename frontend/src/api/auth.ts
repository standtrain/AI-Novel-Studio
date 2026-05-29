import client from './client';
import type { UserInfo } from '../types';

interface AuthResponse {
  token: string;
  user: UserInfo;
}

export async function loginApi(
  username: string,
  password: string,
  captchaId?: string,
  captchaCode?: string
): Promise<AuthResponse> {
  const { data } = await client.post('/auth/login', { username, password, captchaId, captchaCode });
  return data;
}

export async function registerApi(
  username: string,
  email: string,
  password: string
): Promise<AuthResponse> {
  const { data } = await client.post('/auth/register', { username, email, password });
  return data;
}

export async function getRegistrationStatusApi(): Promise<{ allowRegistration: boolean }> {
  const { data } = await client.get('/auth/register-status');
  return data;
}

export async function getMeApi(): Promise<{ user: UserInfo }> {
  const { data } = await client.get('/auth/me');
  return data;
}

// 更新用户首选模型偏好
export async function updatePreferredModelApi(modelName: string | null): Promise<{ user: UserInfo }> {
  const { data } = await client.put('/auth/me/preferred-model', { modelName });
  return data;
}

// 获取可选模型列表
export async function getAvailableModelsApi(): Promise<{ models: any[]; canChoose: boolean }> {
  const { data } = await client.get('/auth/available-models');
  return data;
}

// 获取登录验证码
export async function getCaptchaApi(): Promise<{
  captchaId: string | null;
  svg: string | null;
  enabled: boolean;
}> {
  const { data } = await client.get('/auth/captcha');
  return data;
}
