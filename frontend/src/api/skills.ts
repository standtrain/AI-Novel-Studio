import client from './client';
import type { Skill, UserSkill } from '../types';

// 用户端点
export async function getUserSkillsApi(): Promise<{ skills: UserSkill[] }> {
  const { data } = await client.get('/skills');
  return data;
}

export async function toggleSkillApi(skillId: number, enabled: boolean) {
  const { data } = await client.put(`/skills/${skillId}/toggle`, { enabled });
  return data;
}

export async function updateSkillParamsApi(skillId: number, parameters: Record<string, any>) {
  const { data } = await client.put(`/skills/${skillId}/params`, { parameters });
  return data;
}

// 管理员端点
export async function getAdminSkillsApi(): Promise<{ skills: Skill[] }> {
  const { data } = await client.get('/admin/skills');
  return data;
}

export async function createSkillApi(skillData: Partial<Skill>) {
  const { data } = await client.post('/admin/skills', skillData);
  return data;
}

export async function updateSkillApi(skillId: number, skillData: Partial<Skill>) {
  const { data } = await client.put(`/admin/skills/${skillId}`, skillData);
  return data;
}

export async function deleteSkillApi(skillId: number) {
  const { data } = await client.delete(`/admin/skills/${skillId}`);
  return data;
}
