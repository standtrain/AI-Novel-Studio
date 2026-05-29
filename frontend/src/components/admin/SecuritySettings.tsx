import React, { useEffect, useState } from 'react';
import { Form, Switch, Input, InputNumber, Button, message, Typography, Card, Alert } from 'antd';
import { SafetyCertificateOutlined, ReloadOutlined } from '@ant-design/icons';
import { getConfigsApi, updateConfigApi } from '../../api/admin';

const { Text, Paragraph, Title } = Typography;

// 生成随机安全字符串
function generateRandomKey(length = 48): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[arr[i] % chars.length];
  }
  return result;
}

interface SecurityValues {
  captcha_enabled: boolean;
  cors_origins: string;
  login_rate_limit: number;
  mcp_api_key: string;
}

const SecuritySettings: React.FC = () => {
  const [form] = Form.useForm<SecurityValues>();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadSettings(); }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const { configs } = await getConfigsApi();
      const map: Record<string, string> = {};
      configs.forEach((c: any) => { map[c.config_key] = c.config_value; });

      form.setFieldsValue({
        captcha_enabled: map.captcha_enabled === 'true',
        cors_origins: map.cors_origins || '',
        login_rate_limit: parseInt(map.login_rate_limit, 10) || 5,
        mcp_api_key: map.mcp_api_key || '',
      });
    } catch {
      message.error('加载安全设置失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);

      const entries: [string, string][] = [
        ['captcha_enabled', values.captcha_enabled ? 'true' : 'false'],
        ['cors_origins', values.cors_origins || ''],
        ['login_rate_limit', String(values.login_rate_limit)],
        ['mcp_api_key', values.mcp_api_key || ''],
      ];

      for (const [key, value] of entries) {
        await updateConfigApi(key, value);
      }
      message.success('安全设置已保存');
    } catch (err: any) {
      if (err?.errorFields) return; // 表单校验错误，Form 自行展示
      message.error(err.response?.data?.error || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card
      title={<span><SafetyCertificateOutlined /> 安全设置</span>}
      loading={loading}
      style={{ maxWidth: 700 }}
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="captcha_enabled"
          label="登录验证码"
          valuePropName="checked"
          extra="启用后，登录时需输入数学算式验证码，有效防止机器人暴力破解"
        >
          <Switch />
        </Form.Item>

        <Form.Item
          name="login_rate_limit"
          label="登录频率限制（次/分钟）"
          extra="同一IP每分钟最多允许的登录尝试次数，默认5次"
          rules={[{ required: true, message: '请输入限制次数' }]}
        >
          <InputNumber min={1} max={60} style={{ width: '100%' }} />
        </Form.Item>

        <Form.Item
          name="cors_origins"
          label="CORS 域名白名单"
          extra={
            <span>
              填写允许跨域访问的域名，每行一个。如 <Text code>http://localhost:5173</Text>。
              留空则仅允许本地开发地址（localhost:5173 和 localhost:3000）。
            </span>
          }
        >
          <Input.TextArea
            rows={4}
            placeholder={`http://localhost:5173\nhttp://localhost:3000\nhttps://yourdomain.com`}
          />
        </Form.Item>

        <Form.Item
          name="mcp_api_key"
          label="MCP API Key"
          extra="外部AI应用连接MCP服务时需提供的密钥。留空则拒绝所有外部MCP请求"
          rules={[{ min: 16, message: '建议密钥长度至少16个字符' }]}
        >
          <Input.Password
            placeholder="输入 MCP API Key（建议使用下方按钮生成随机密钥）"
            addonAfter={
              <Button
                type="text"
                size="small"
                icon={<ReloadOutlined />}
                onClick={() => form.setFieldsValue({ mcp_api_key: generateRandomKey() })}
                style={{ color: '#6366f1', padding: 0 }}
              >
                随机生成
              </Button>
            }
          />
        </Form.Item>

        {/* MCP 外部连接说明 */}
        <Alert
          type="info"
          icon={<SafetyCertificateOutlined />}
          message="MCP 外部连接说明"
          description={
            <div style={{ fontSize: 13 }}>
              <Title level={5} style={{ marginTop: 8, marginBottom: 4 }}>连接地址</Title>
              <Paragraph>
                <Text code copyable>https://你的服务器地址/api/mcp-endpoint</Text>
              </Paragraph>

              <Title level={5} style={{ marginBottom: 4 }}>认证方式</Title>
              <Paragraph>
                在请求头中携带 API Key，支持两种方式：
                <br />• <Text code>Authorization: Bearer {'<MCP_API_KEY>'}</Text>
                <br />• <Text code>x-api-key: {'<MCP_API_KEY>'}</Text>
              </Paragraph>

              <Title level={5} style={{ marginBottom: 4 }}>Claude Desktop 配置示例</Title>
              <Paragraph>
                在 Claude Desktop 的配置文件中添加（{'"transport"'}: {'"http"'} 模式）：
              </Paragraph>
              <pre style={{
                background: '#0f172a',
                color: '#e2e8f0',
                padding: '12px 16px',
                borderRadius: 8,
                fontSize: 12,
                lineHeight: 1.6,
                overflow: 'auto',
                margin: 0,
              }}>{`{
  "mcpServers": {
    "bookagent": {
      "transport": "http",
      "url": "https://你的服务器地址/api/mcp-endpoint",
      "headers": {
        "x-api-key": "<MCP_API_KEY>"
      }
    }
  }
}`}</pre>

              <Title level={5} style={{ marginBottom: 4 }}>通用客户端调用示例</Title>
              <pre style={{
                background: '#0f172a',
                color: '#e2e8f0',
                padding: '12px 16px',
                borderRadius: 8,
                fontSize: 12,
                lineHeight: 1.6,
                overflow: 'auto',
                margin: '8px 0 0',
              }}>{`// 1. 初始化连接
POST /api/mcp-endpoint
Content-Type: application/json
x-api-key: <MCP_API_KEY>

{
  "jsonrpc": "2.0",
  "id": "1",
  "method": "initialize",
  "params": {
    "protocolVersion": "2024-11-05",
    "capabilities": { "tools": {} },
    "clientInfo": { "name": "your-app", "version": "1.0" }
  }
}

// 2. 获取工具列表
{
  "jsonrpc": "2.0",
  "id": "2",
  "method": "tools/list",
  "params": {}
}

// 3. 调用工具
{
  "jsonrpc": "2.0",
  "id": "3",
  "method": "tools/call",
  "params": { "name": "<工具名>", "arguments": {} }
}`}</pre>
            </div>
          }
          style={{ marginBottom: 24 }}
        />

        <Form.Item>
          <Button
            type="primary"
            onClick={handleSave}
            loading={saving}
            icon={<SafetyCertificateOutlined />}
            style={{ paddingLeft: 24, paddingRight: 24 }}
          >
            保存全部
          </Button>
        </Form.Item>
      </Form>
    </Card>
  );
};

export default SecuritySettings;
