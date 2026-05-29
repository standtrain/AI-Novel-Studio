import client from './client';
import type { McpServerConfig, UserMcpConfig } from '../types';

export type McpServer = McpServerConfig;
export type { UserMcpConfig };

// 用户端点
export async function getUserMcpServersApi(): Promise<{ servers: UserMcpConfig[] }> {
  const { data } = await client.get('/mcp/servers');
  return data;
}

export async function saveUserMcpConfigApi(
  serverId: number,
  config: { enabled?: boolean; extra_config?: Record<string, any> }
) {
  const { data } = await client.put(`/mcp/servers/${serverId}/config`, config);
  return data;
}

export async function deleteUserMcpConfigApi(serverId: number) {
  const { data } = await client.delete(`/mcp/servers/${serverId}/config`);
  return data;
}

// 管理员端点
export async function getAdminMcpServersApi(): Promise<{ servers: McpServer[] }> {
  const { data } = await client.get('/admin/mcp/servers');
  return data;
}

export async function createMcpServerApi(serverData: Partial<McpServer>) {
  const { data } = await client.post('/admin/mcp/servers', serverData);
  return data;
}

export async function updateMcpServerApi(serverId: number, serverData: Partial<McpServer>) {
  const { data } = await client.put(`/admin/mcp/servers/${serverId}`, serverData);
  return data;
}

export async function deleteMcpServerApi(serverId: number) {
  const { data } = await client.delete(`/admin/mcp/servers/${serverId}`);
  return data;
}

export async function testMcpServerApi(serverId: number): Promise<{ success: boolean; tools?: string[]; toolCount?: number; message?: string }> {
  const { data } = await client.post(`/admin/mcp/servers/${serverId}/test`);
  return data;
}
