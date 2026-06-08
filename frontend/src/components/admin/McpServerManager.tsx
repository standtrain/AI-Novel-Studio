import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Form, Input, Modal, Popconfirm, Select, Space, Switch, Table, Tag, Typography, message } from 'antd';
import { DeleteOutlined, EditOutlined, KeyOutlined, LinkOutlined, PlusOutlined } from '@ant-design/icons';
import { createMcpServerApi, deleteMcpServerApi, getAdminMcpServersApi, McpServer, testMcpServerApi, updateMcpServerApi } from '../../api/mcp';

const { Text, Paragraph } = Typography;

const transportOptions = [
  { value: 'http', label: 'HTTP' },
  { value: 'sse', label: 'SSE' },
  { value: 'stdio', label: 'Stdio' },
];

const authOptions = [
  { value: 'none', label: '不使用' },
  { value: 'bearer', label: 'Bearer Token' },
  { value: 'custom', label: '自定义 Authorization' },
];

const transportColorMap: Record<string, string> = { http: 'blue', sse: 'cyan', stdio: 'orange' };

function tryParseJson(value: unknown): any {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try { return JSON.parse(String(value)); } catch { return null; }
}

function normalizeUrl(value: string): string {
  return (value || '').replace(/\s+/g, '').replace(/^https:\/(?!\/)/i, 'https://').replace(/^http:\/(?!\/)/i, 'http://');
}

function extractAuthorization(headers: unknown): { authType: string; authValue: string } {
  const parsed = tryParseJson(headers);
  const auth = parsed?.Authorization || parsed?.authorization || '';
  if (!auth) return { authType: 'none', authValue: '' };
  if (String(auth).startsWith('Bearer ')) return { authType: 'bearer', authValue: String(auth).slice(7) };
  return { authType: 'custom', authValue: String(auth) };
}

function extraHeadersToJson(headers: unknown): string {
  const parsed = tryParseJson(headers);
  if (!parsed || typeof parsed !== 'object') return '';
  const extra: Record<string, string> = {};
  Object.entries(parsed).forEach(([key, value]) => {
    if (key.toLowerCase() !== 'authorization') extra[key] = String(value ?? '');
  });
  return Object.keys(extra).length ? JSON.stringify(extra, null, 2) : '';
}

function buildHeadersFromJson(authType: string, authValue: string, extraHeadersJson: string) {
  const headers: Record<string, string> = {};
  if (extraHeadersJson?.trim()) {
    try {
      const parsed = JSON.parse(extraHeadersJson);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        Object.entries(parsed).forEach(([key, value]) => {
          const k = String(key).trim();
          const v = String(value ?? '').trim();
          if (k && v) headers[k] = v;
        });
      }
    } catch { /* 解析失败时忽略 */ }
  }
  const cleanAuth = (authValue || '').trim();
  if (authType === 'bearer' && cleanAuth) headers.Authorization = cleanAuth.startsWith('Bearer ') ? cleanAuth : `Bearer ${cleanAuth}`;
  if (authType === 'custom' && cleanAuth) headers.Authorization = cleanAuth;
  return headers;
}

const McpServerManager: React.FC = () => {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingServer, setEditingServer] = useState<McpServer | null>(null);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [extraHeadersJson, setExtraHeadersJson] = useState('');
  const [form] = Form.useForm();

  const transport = Form.useWatch('transport', form);
  const authType = Form.useWatch('authType', form) || 'none';
  const authValue = Form.useWatch('authValue', form) || '';

  const headerPreview = useMemo(() => {
    const headers = buildHeadersFromJson(authType, authValue, extraHeadersJson);
    return Object.keys(headers).length ? JSON.stringify(headers, null, 2) : '{}';
  }, [authType, authValue, extraHeadersJson]);

  const loadServers = async () => {
    setLoading(true);
    try {
      const { servers } = await getAdminMcpServersApi();
      setServers(servers);
    } catch {
      message.error('获取 MCP 服务器列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadServers(); }, []);

  const openModal = (server?: McpServer) => {
    setEditingServer(server || null);
    const auth = extractAuthorization(server?.headers);
    setExtraHeadersJson(server ? extraHeadersToJson(server.headers) : '');
    form.setFieldsValue({
      name: server?.name || '',
      transport: server?.transport || 'http',
      command: server?.command || '',
      argsText: server?.args ? JSON.stringify(server.args, null, 2) : '',
      url: server?.url || '',
      authType: auth.authType,
      authValue: auth.authValue,
      enabled: server?.enabled ?? true,
      description: server?.description || '',
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const headers = buildHeadersFromJson(values.authType, values.authValue, extraHeadersJson);
      const args = values.argsText?.trim() ? JSON.parse(values.argsText) : null;
      if (args && !Array.isArray(args)) {
        message.error('命令参数必须是 JSON 数组');
        return;
      }

      const data: Record<string, any> = {
        name: values.name.trim(),
        transport: values.transport,
        url: values.transport === 'stdio' ? null : normalizeUrl(values.url),
        command: values.transport === 'stdio' ? values.command?.trim() || null : null,
        args,
        headers: Object.keys(headers).length ? headers : null,
        enabled: values.enabled,
        description: values.description?.trim() || null,
      };

      if (editingServer) {
        await updateMcpServerApi(editingServer.id, data);
        message.success('MCP 服务器已更新');
      } else {
        await createMcpServerApi(data);
        message.success('MCP 服务器已创建');
      }
      setModalOpen(false);
      loadServers();
    } catch (err: any) {
      if (err?.errorFields) return;
      if (err instanceof SyntaxError) {
        message.error('JSON 格式无效，请检查命令参数');
        return;
      }
      message.error(err?.response?.data?.error || '操作失败');
    }
  };

  const handleDelete = async (serverId: number) => {
    try {
      await deleteMcpServerApi(serverId);
      message.success('MCP 服务器已删除');
      loadServers();
    } catch {
      message.error('删除失败');
    }
  };

  const handleTest = async (serverId: number) => {
    setTestingId(serverId);
    try {
      const result = await testMcpServerApi(serverId);
      if (result.success) {
        Modal.success({
          title: '连接成功',
          content: `发现 ${result.toolCount || 0} 个工具：${(result.tools || []).join(', ') || '无'}`,
        });
      } else {
        Modal.error({ title: '连接失败', content: result.message || '未返回错误详情' });
      }
    } catch (err: any) {
      Modal.error({ title: '测试请求失败', content: err?.response?.data?.error || err.message || '请求失败' });
    } finally {
      setTestingId(null);
    }
  };

  const columns = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      width: 160,
      ellipsis: true,
      render: (text: string, record: McpServer) => (
        <Space size={6}>
          <Text strong>{text}</Text>
          {extractAuthorization(record.headers).authType !== 'none' && <Tag color="gold">Auth</Tag>}
        </Space>
      ),
    },
    {
      title: '协议',
      dataIndex: 'transport',
      key: 'transport',
      width: 80,
      render: (t: string) => <Tag color={transportColorMap[t] || 'default'}>{String(t).toUpperCase()}</Tag>,
    },
    {
      title: '端点',
      key: 'endpoint',
      ellipsis: true,
      render: (_: any, r: McpServer) => <Text ellipsis>{r.url || r.command || '-'}</Text>,
    },
    {
      title: '启用',
      dataIndex: 'enabled',
      key: 'enabled',
      width: 70,
      render: (v: boolean) => <Tag color={v ? 'green' : 'red'}>{v ? '是' : '否'}</Tag>,
    },
    {
      title: '操作',
      key: 'actions',
      width: 128,
      render: (_: any, record: McpServer) => (
        <Space size={2}>
          <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openModal(record)} />
          <Button type="text" size="small" icon={<LinkOutlined />} loading={testingId === record.id} onClick={() => handleTest(record.id)} />
          <Popconfirm title="确定删除此 MCP 服务器？" okText="删除" cancelText="取消" onConfirm={() => handleDelete(record.id)}>
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <Space wrap>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>添加服务器</Button>
        </Space>
      </div>

      <Table columns={columns} dataSource={servers} rowKey="id" loading={loading} size="small" />

      <Modal
        title={editingServer ? '编辑 MCP 服务器' : '添加 MCP 服务器'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        width={760}
        destroyOnClose
      >
        <Form form={form} layout="vertical" initialValues={{ transport: 'http', authType: 'none', enabled: true }}>
          <Form.Item name="name" label="服务器名称" rules={[{ required: true, message: '请输入名称' }, { max: 80, message: '名称不能超过80个字符' }]}>
            <Input placeholder="anysearch" />
          </Form.Item>

          <Form.Item name="transport" label="传输协议" rules={[{ required: true }]}>
            <Select options={transportOptions} />
          </Form.Item>

          {(transport === 'http' || transport === 'sse') && (
            <Form.Item
              name="url"
              label="服务端点 URL"
              normalize={normalizeUrl}
              rules={[{ required: true, message: '请输入 URL' }]}
            >
              <Input placeholder="https://api.anysearch.com/mcp" />
            </Form.Item>
          )}

          {transport === 'stdio' && (
            <>
              <Form.Item name="command" label="启动命令" rules={[{ required: true, message: '请输入命令' }]}>
                <Input placeholder="npx" />
              </Form.Item>
              <Form.Item name="argsText" label="命令参数 JSON 数组">
                <Input placeholder='["-y", "@modelcontextprotocol/server-example"]' />
              </Form.Item>
            </>
          )}

          <Form.Item label="认证">
            <Space.Compact style={{ width: '100%' }}>
              <Form.Item name="authType" noStyle>
                <Select options={authOptions} style={{ width: 190 }} />
              </Form.Item>
              <Form.Item name="authValue" noStyle>
                <Input.Password
                  prefix={<KeyOutlined />}
                  disabled={authType === 'none'}
                  placeholder={authType === 'bearer' ? '粘贴 API Key，不需要写 Bearer' : 'Authorization 完整值'}
                  visibilityToggle
                />
              </Form.Item>
            </Space.Compact>
          </Form.Item>

          <Form.Item label="额外请求头（JSON）">
            <Input.TextArea
              rows={4}
              value={extraHeadersJson}
              onChange={(e) => setExtraHeadersJson(e.target.value)}
              placeholder='{"X-Custom-Header": "自定义值"}'
            />
          </Form.Item>

          <Alert
            type="info"
            showIcon
            message="Headers 预览"
            description={<Paragraph style={{ marginBottom: 0 }} copyable><pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{headerPreview}</pre></Paragraph>}
            style={{ marginBottom: 16 }}
          />

          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} placeholder="说明这个 MCP 服务提供哪些工具" />
          </Form.Item>

          <Form.Item name="enabled" label="全局启用" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default McpServerManager;
