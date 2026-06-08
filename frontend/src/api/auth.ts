import client from './client';
import type { TemperaturePreset, UserInfo } from '../types';

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
  password: string,
  code?: string
): Promise<AuthResponse> {
  const { data } = await client.post('/auth/register', { username, email, password, code });
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

// 更新创作温度偏好
export async function updateTemperaturePreferenceApi(
  preset: TemperaturePreset,
  customTemperature?: number | null
): Promise<{ user: UserInfo }> {
  const { data } = await client.put('/auth/me/temperature-preference', { preset, customTemperature });
  return data;
}

// 获取用户逐阶段温度配置
export async function getUserTemperatureConfigApi(): Promise<{
  phases: Array<{ phase: string; configKey: string; defaultValue: number; label: string }>;
  overrides: Record<string, number>;
}> {
  const { data } = await client.get('/auth/me/temperature-config');
  return data;
}

// 保存用户逐阶段温度配置
export async function saveUserTemperatureConfigApi(
  configs: Record<string, number | null>
): Promise<{ overrides: Record<string, number> }> {
  const { data } = await client.put('/auth/me/temperature-config', { configs });
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

// 发送邮箱验证码
export async function sendVerifyCodeApi(
  email: string,
  type: 'register' | 'reset_password',
  captchaId?: string,
  captchaCode?: string
): Promise<{ success: boolean; message: string }> {
  const { data } = await client.post('/auth/send-verify-code', { email, type, captchaId, captchaCode });
  return data;
}

// 忘记密码
export async function forgotPasswordApi(
  email: string,
  captchaId?: string,
  captchaCode?: string
): Promise<{ success: boolean; message: string }> {
  const { data } = await client.post('/auth/forgot-password', { email, captchaId, captchaCode });
  return data;
}

// 重置密码
export async function resetPasswordApi(email: string, code: string, password: string): Promise<{ success: boolean; message: string }> {
  const { data } = await client.post('/auth/reset-password', { email, code, password });
  return data;
}

// 发送邮箱变更验证码（需登录）
export async function sendChangeEmailCodeApi(
  email: string,
  captchaId?: string,
  captchaCode?: string
): Promise<{ success: boolean; message: string }> {
  const { data } = await client.post('/auth/me/send-change-email-code', { email, captchaId, captchaCode });
  return data;
}

// 完成邮箱变更（需登录）
export async function changeEmailApi(newEmail: string, code: string): Promise<{ success: boolean; message: string; user: any }> {
  const { data } = await client.post('/auth/me/change-email', { newEmail, code });
  return data;
}

// 检查邮箱验证是否启用
export async function getEmailVerificationStatusApi(): Promise<{ enabled: boolean }> {
  const { data } = await client.get('/auth/email-verification-status');
  return data;
}
