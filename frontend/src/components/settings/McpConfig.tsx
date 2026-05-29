import React, { useEffect, useState } from 'react';
import { Card, Switch, Typography, message, Space, Spin, Tag } from 'antd';
import { LinkOutlined, ApiOutlined } from '@ant-design/icons';
import { getUserMcpServersApi, saveUserMcpConfigApi, UserMcpConfig } from '../../api/mcp';

const { Text, Paragraph } = Typography;

const transportLabels: Record<string, string> = { http: 'HTTP', sse: 'SSE', stdio: 'Stdio' };
const transportColors: Record<string, string> = { http: 'blue', sse: 'cyan', stdio: 'orange' };

const McpConfig: React.FC = () => {
  const [servers, setServers] = useState<UserMcpConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);

  const loadServers = async () => {
    setLoading(true);
    try {
      const { servers } = await getUserMcpServersApi();
      setServers(servers);
    } catch {
      message.error('获取 MCP 服务器列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadServers(); }, []);

  const handleToggle = async (serverId: number, enabled: boolean) => {
    setSavingId(serverId);
    try {
      await saveUserMcpConfigApi(serverId, { enabled });
      setServers(prev => prev.map(s => s.id === serverId ? { ...s, user_enabled: enabled } : s));
      message.success(enabled ? '已启用' : '已禁用');
    } catch {
      message.error('操作失败');
    } finally {
      setSavingId(null);
    }
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>;
  }

  if (servers.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
        <ApiOutlined style={{ fontSize: 48, marginBottom: 16 }} />
        <p>暂无可用 MCP 服务器</p>
        <Text type="secondary">请联系管理员在后台配置 MCP 服务器</Text>
      </div>
    );
  }

  return (
    <div>
      <Paragraph type="secondary" style={{ marginBottom: 16 }}>
        MCP（Model Context Protocol）允许 AI 写作助手连接外部工具服务。您可以启用或禁用可用的 MCP 服务器连接。API Key 由管理员统一配置。
      </Paragraph>
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        {servers.map(server => {
          const isEnabled = server.user_enabled !== false && server.enabled;
          return (
            <Card
              key={server.id}
              size="small"
              title={
                <Space>
                  <LinkOutlined />
                  <span>{server.name}</span>
                  <Tag color={transportColors[server.transport]}>{transportLabels[server.transport] || server.transport}</Tag>
                  {!server.enabled && <Tag color="red">管理员已禁用</Tag>}
                </Space>
              }
              extra={
                <Switch
                  checked={isEnabled}
                  disabled={!server.enabled || savingId === server.id}
                  loading={savingId === server.id}
                  onChange={(v) => handleToggle(server.id, v)}
                />
              }
              styles={{ body: { padding: '12px 24px' } }}
            >
              {server.description && <Paragraph type="secondary">{server.description}</Paragraph>}
              <Text type="secondary">连接地址：{server.url || server.command || '未配置'}</Text>
              {server.headers && (
                <Paragraph type="secondary" style={{ marginTop: 8, fontSize: 12 }}>
                  认证方式：由管理员统一配置
                </Paragraph>
              )}
            </Card>
          );
        })}
      </Space>
    </div>
  );
};

export default McpConfig;
