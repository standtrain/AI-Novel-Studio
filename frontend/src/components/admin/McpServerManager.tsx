import React, { useEffect, useState } from 'react';
import { Table, Button, Modal, Form, Input, Select, Switch, Popconfirm, Tag, Space, Typography, message } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, LinkOutlined, KeyOutlined } from '@ant-design/icons';
import { getAdminMcpServersApi, createMcpServerApi, updateMcpServerApi, deleteMcpServerApi, testMcpServerApi, McpServer } from '../../api/mcp';

const { TextArea } = Input;
const { Text } = Typography;

const transportOptions = [
  { value: 'http', label: 'HTTP' },
  { value: 'sse', label: 'SSE' },
  { value: 'stdio', label: 'Stdio' },
];

const transportColorMap: Record<string, string> = { http: 'blue', sse: 'cyan', stdio: 'orange' };

// 从 headers 中提取 API Key（Authorization: Bearer xxx）
function extractApiKey(headers: Record<string, string> | null | undefined | string): string {
  if (!headers) return '';
  const h = typeof headers === 'string' ? tryParseJson(headers) : headers;
  if (!h || typeof h !== 'object') return '';
  const auth = h['Authorization'] || h['authorization'] || '';
  return auth.startsWith('Bearer ') ? auth.slice(7) : auth;
}

function tryParseJson(val: string): any {
  try { return JSON.parse(val); } catch { return null; }
}

const McpServerManager: React.FC = () => {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingServer, setEditingServer] = useState<McpServer | null>(null);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [form] = Form.useForm();

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

  const handleCreate = () => {
    setEditingServer(null);
    form.resetFields();
    form.setFieldsValue({ transport: 'http', enabled: true });
    setModalOpen(true);
  };

  const handleEdit = (server: McpServer) => {
    setEditingServer(server);
    form.setFieldsValue({
      name: server.name,
      transport: server.transport,
      command: server.command || '',
      args: server.args ? JSON.stringify(server.args) : '',
      url: server.url || '',
      apiKey: extractApiKey(server.headers),
      headers: server.headers ? JSON.stringify(server.headers, null, 2) : '',
      enabled: server.enabled,
      description: server.description || '',
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();

      // 处理 headers：合并 API Key 和自定义 headers
      let headers: Record<string, string> = {};
      if (values.headers) {
        headers = typeof values.headers === 'string' ? JSON.parse(values.headers) : values.headers;
      }
      // API Key 写入 Authorization header
      if (values.apiKey) {
        headers['Authorization'] = `Bearer ${values.apiKey}`;
      }

      const data: Record<string, any> = {
        name: values.name,
        transport: values.transport,
        url: values.url || null,
        command: values.command || null,
        args: values.args ? JSON.parse(values.args) : null,
        headers: Object.keys(headers).length > 0 ? headers : null,
        enabled: values.enabled,
        description: values.description || null,
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
        message.error('JSON 格式无效，请检查请求头配置');
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
        message.success(`连接成功！发现 ${result.toolCount || 0} 个工具：${(result.tools || []).join(', ') || '无'}`);
      } else {
        message.error(`连接失败：${result.message}`);
      }
    } catch {
      message.error('测试请求失败');
    } finally {
      setTestingId(null);
    }
  };

  const columns = [
    { title: '名称', dataIndex: 'name', key: 'name', width: 130, ellipsis: true,
      render: (text: string, record: McpServer) => (
        <Space size={4}>
          <span>{text}</span>
          {record.headers && extractApiKey(record.headers) && (
            <Tag color="gold" style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>🔑</Tag>
          )}
        </Space>
      ),
    },
    {
      title: '协议', dataIndex: 'transport', key: 'transport', width: 70,
      render: (t: string) => <Tag color={transportColorMap[t] || 'default'}>{t.toUpperCase()}</Tag>,
    },
    {
      title: '地址', key: 'endpoint', ellipsis: true,
      render: (_: any, r: McpServer) => <Text ellipsis>{r.url || r.command || '-'}</Text>,
    },
    {
      title: '启用', dataIndex: 'enabled', key: 'enabled', width: 60,
      render: (v: boolean) => <Tag color={v ? 'green' : 'red'}>{v ? '是' : '否'}</Tag>,
    },
    {
      title: '操作', key: 'actions', width: 100,
      render: (_: any, record: McpServer) => (
        <Space size={0}>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          <Button type="link" size="small" icon={<LinkOutlined />} loading={testingId === record.id} onClick={() => handleTest(record.id)} />
          <Popconfirm title="确定删除？" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const transport = Form.useWatch('transport', form);

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>添加服务器</Button>
      </div>
      <Table columns={columns} dataSource={servers} rowKey="id" loading={loading} size="small" />
      <Modal
        title={editingServer ? '编辑 MCP 服务器' : '添加 MCP 服务器'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        width={640}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="服务器名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="如：Context7 文档搜索" />
          </Form.Item>
          <Form.Item name="transport" label="传输协议" rules={[{ required: true }]}>
            <Select options={transportOptions} />
          </Form.Item>
          {(transport === 'http' || transport === 'sse') && (
            <Form.Item name="url" label="服务端点 URL" rules={[{ required: true, message: '请输入 URL' }]}>
              <Input placeholder="https://example.com/mcp" />
            </Form.Item>
          )}
          {transport === 'stdio' && (
            <>
              <Form.Item name="command" label="启动命令" rules={[{ required: true, message: '请输入命令' }]}>
                <Input placeholder="npx" />
              </Form.Item>
              <Form.Item name="args" label="命令参数（JSON 数组）">
                <Input placeholder='["-y", "@modelcontextprotocol/server-example"]' />
              </Form.Item>
            </>
          )}
          <Form.Item name="apiKey" label="API Key（可选）" extra="需要认证的服务器填写，自动设为 Authorization: Bearer">
            <Input.Password
              prefix={<KeyOutlined />}
              placeholder="部分 MCP 服务器不需要 API Key，可留空"
              visibilityToggle
            />
          </Form.Item>
          <Form.Item name="headers" label="自定义请求头 — JSON（可选）" extra="高级配置，如需额外请求头可在此填写">
            <TextArea rows={3} placeholder='{"X-Custom-Header": "value"}' />
          </Form.Item>
          <Form.Item name="description" label="描述（可选）">
            <TextArea rows={2} placeholder="服务器功能说明" />
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
