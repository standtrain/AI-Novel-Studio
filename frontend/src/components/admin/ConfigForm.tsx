import React, { useEffect, useState } from 'react';
import { Table, Input, InputNumber, Button, Switch, Typography, message, Alert, Space, Upload, Image } from 'antd';
import { SaveOutlined, ReloadOutlined, SafetyCertificateOutlined, UploadOutlined, DeleteOutlined, PictureOutlined } from '@ant-design/icons';
import { getConfigsApi, updateConfigApi, getFaviconInfoApi, uploadFaviconApi, deleteFaviconApi } from '../../api/admin';
import type { UploadFile } from 'antd/es/upload/interface';

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

// 所有站点配置项（站点信息 + 安全 + 邮件）
const SITE_CONFIG_KEYS = [
  'site_name', 'site_description',
  'max_tokens_per_request', 'default_temperature', 'chapters_per_batch',
  'allow_registration', 'cors_enabled', 'cors_origins',
  'captcha_enabled', 'login_rate_limit', 'mcp_api_key',
  'resend_api_key', 'email_from', 'email_from_name', 'email_verification_enabled',
  'email_domain_whitelist_enabled', 'email_domain_whitelist',
];

// boolean 类型的配置键
const BOOLEAN_KEYS = ['allow_registration', 'cors_enabled', 'captcha_enabled', 'email_verification_enabled', 'email_domain_whitelist_enabled'];

interface ConfigFormProps {
  searchTerm: string;
}

const ConfigForm: React.FC<ConfigFormProps> = ({ searchTerm }) => {
  const [configs, setConfigs] = useState<any[]>([]);
  const [editingValues, setEditingValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set());

  // favicon 管理
  const [faviconLoading, setFaviconLoading] = useState(false);
  const [faviconInfo, setFaviconInfo] = useState<{ hasCustom: boolean; url: string | null; originalName: string | null; size: number | null }>({ hasCustom: false, url: null, originalName: null, size: null });
  const [faviconUploading, setFaviconUploading] = useState(false);
  const [faviconDeleting, setFaviconDeleting] = useState(false);

  useEffect(() => { loadConfigs(); loadFaviconInfo(); }, []);

  const loadFaviconInfo = async () => {
    try {
      const info = await getFaviconInfoApi();
      setFaviconInfo(info);
    } catch { /* 静默失败 */ }
  };

  const handleFaviconUpload = async (file: File) => {
    setFaviconUploading(true);
    try {
      const result = await uploadFaviconApi(file);
      message.success('图标上传成功');
      setFaviconInfo({ hasCustom: true, url: result.url, originalName: result.filename, size: result.size });
    } catch (err: any) {
      message.error(err.response?.data?.error || '上传失败');
    } finally {
      setFaviconUploading(false);
    }
    return false; // 阻止默认上传行为
  };

  const handleFaviconDelete = async () => {
    setFaviconDeleting(true);
    try {
      await deleteFaviconApi();
      message.success('已恢复默认图标');
      setFaviconInfo({ hasCustom: false, url: null, originalName: null, size: null });
    } catch (err: any) {
      message.error(err.response?.data?.error || '删除失败');
    } finally {
      setFaviconDeleting(false);
    }
  };

  const loadConfigs = async () => {
    setLoading(true);
    try {
      const data = await getConfigsApi();
      setConfigs((data.configs || []).filter((c: any) => SITE_CONFIG_KEYS.includes(c.config_key)));
    } catch {
      message.error('加载配置失败');
    } finally {
      setLoading(false);
    }
  };

  // 搜索过滤：匹配 config_key 和 description
  const filteredConfigs = searchTerm.trim()
    ? configs.filter(c => {
        const term = searchTerm.toLowerCase();
        const key = (c.config_key || '').toLowerCase();
        const desc = (c.description || '').toLowerCase();
        return key.includes(term) || desc.includes(term);
      })
    : configs;

  const handleSave = async (key: string) => {
    const val = editingValues[key];
    if (val === undefined) { message.warning('没有修改'); return; }
    setSavingKeys(prev => new Set(prev).add(key));
    try {
      await updateConfigApi(key, val);
      message.success('保存成功');
      setEditingValues(prev => { const n = { ...prev }; delete n[key]; return n; });
      loadConfigs();
    } catch (err: any) {
      message.error(err.response?.data?.error || '保存失败');
    } finally {
      setSavingKeys(prev => { const n = new Set(prev); n.delete(key); return n; });
    }
  };

  const getCurrentValue = (record: any) => {
    return editingValues[record.config_key] !== undefined
      ? editingValues[record.config_key]
      : record.config_value;
  };

  const columns = [
    {
      title: '配置项', dataIndex: 'config_key', width: 180,
      render: (key: string, record: any) => (
        <div>
          <Text code style={{ fontSize: 12 }}>{key}</Text>
          <br />
          <Text style={{ color: '#64748b', fontSize: 11 }}>{record.description}</Text>
        </div>
      ),
    },
    {
      title: '配置值', dataIndex: 'config_value',
      render: (_val: string, record: any) => {
        const currentVal = getCurrentValue(record);
        const modified = editingValues[record.config_key] !== undefined;

        // boolean 类型：Switch 开关
        if (BOOLEAN_KEYS.includes(record.config_key)) {
          const checked = currentVal === 'true';
          return (
            <span>
              <Switch
                checked={checked}
                onChange={(v) => setEditingValues({ ...editingValues, [record.config_key]: v ? 'true' : 'false' })}
                style={modified ? { boxShadow: '0 0 0 2px rgba(251,191,36,0.3)' } : undefined}
              />
              <Text style={{ marginLeft: 8, color: checked ? '#34d399' : '#64748b', fontSize: 12 }}>
                {checked ? '已开启' : '已关闭'}
              </Text>
              {modified && <Text style={{ marginLeft: 8, color: '#fbbf24', fontSize: 11 }}>已修改</Text>}
            </span>
          );
        }

        // cors_origins：多行文本域
        if (record.config_key === 'cors_origins') {
          return (
            <Input.TextArea
              value={currentVal}
              onChange={(e) => setEditingValues({ ...editingValues, [record.config_key]: e.target.value })}
              rows={3}
              placeholder="每行一个域名，例如：&#10;https://example.com&#10;https://app.example.com"
              style={{
                background: modified ? 'rgba(251,191,36,0.08)' : 'rgba(15,23,42,0.5)',
                borderColor: modified ? 'rgba(251,191,36,0.4)' : 'rgba(99,102,241,0.3)',
                color: '#f1f5f9',
                fontSize: 13,
                fontFamily: 'monospace',
              }}
            />
          );
        }

        // email_domain_whitelist：多行文本域
        if (record.config_key === 'email_domain_whitelist') {
          return (
            <Input.TextArea
              value={currentVal}
              onChange={(e) => setEditingValues({ ...editingValues, [record.config_key]: e.target.value })}
              rows={4}
              placeholder="每行一个域名，例如：&#10;gmail.com&#10;outlook.com&#10;qq.com"
              style={{
                background: modified ? 'rgba(251,191,36,0.08)' : 'rgba(15,23,42,0.5)',
                borderColor: modified ? 'rgba(251,191,36,0.4)' : 'rgba(99,102,241,0.3)',
                color: '#f1f5f9',
                fontSize: 13,
                fontFamily: 'monospace',
              }}
            />
          );
        }

        // login_rate_limit：数字输入
        if (record.config_key === 'login_rate_limit') {
          return (
            <InputNumber
              value={Number(currentVal) || 5}
              onChange={(v) => setEditingValues({ ...editingValues, [record.config_key]: String(v ?? 5) })}
              min={1} max={60}
              style={{
                width: '100%',
                background: modified ? 'rgba(251,191,36,0.08)' : undefined,
                borderColor: modified ? 'rgba(251,191,36,0.4)' : undefined,
              }}
            />
          );
        }

        // mcp_api_key：密码输入 + 随机生成
        if (record.config_key === 'mcp_api_key') {
          return (
            <Space.Compact style={{ width: '100%' }}>
              <Input.Password
                value={currentVal}
                onChange={(e) => setEditingValues({ ...editingValues, [record.config_key]: e.target.value })}
                placeholder="输入 MCP API Key"
                style={{
                  background: modified ? 'rgba(251,191,36,0.08)' : undefined,
                  borderColor: modified ? 'rgba(251,191,36,0.4)' : undefined,
                }}
              />
              <Button
                icon={<ReloadOutlined />}
                onClick={() => setEditingValues({ ...editingValues, [record.config_key]: generateRandomKey() })}
              >
                随机生成
              </Button>
            </Space.Compact>
          );
        }

        // resend_api_key：密码输入
        if (record.config_key === 'resend_api_key') {
          return (
            <Input.Password
              value={currentVal}
              onChange={(e) => setEditingValues({ ...editingValues, [record.config_key]: e.target.value })}
              placeholder="输入 Resend API Key（在 resend.com/api-keys 获取）"
              style={{
                background: modified ? 'rgba(251,191,36,0.08)' : undefined,
                borderColor: modified ? 'rgba(251,191,36,0.4)' : undefined,
              }}
            />
          );
        }

        // 普通文本输入
        return (
          <Input
            value={currentVal}
            onChange={(e) => setEditingValues({ ...editingValues, [record.config_key]: e.target.value })}
            style={{
              background: modified ? 'rgba(251,191,36,0.08)' : undefined,
              borderColor: modified ? 'rgba(251,191,36,0.4)' : undefined,
            }}
          />
        );
      },
    },
    {
      title: '操作', width: 80,
      render: (_: any, record: any) => {
        const modified = editingValues[record.config_key] !== undefined;
        return (
          <Button
            type={modified ? 'primary' : 'default'}
            size="small"
            icon={<SaveOutlined />}
            onClick={() => handleSave(record.config_key)}
            loading={savingKeys.has(record.config_key)}
            disabled={!modified}
            style={modified ? { background: 'linear-gradient(135deg, #f59e0b, #d97706)', border: 'none' } : undefined}
          >
            保存
          </Button>
        );
      },
    },
  ];

  return (
    <div>
      {/* 站点图标管理 */}
      <div style={{
        marginBottom: 20,
        padding: 20,
        background: 'rgba(30,41,59,0.5)',
        border: '1px solid rgba(99,102,241,0.2)',
        borderRadius: 12,
      }}>
        <Text strong style={{ color: '#f1f5f9', fontSize: 15, display: 'block', marginBottom: 16 }}>
          <PictureOutlined style={{ marginRight: 8 }} />站点图标（Favicon）
        </Text>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          {/* 预览区 */}
          <div style={{
            width: 64, height: 64,
            borderRadius: 12,
            background: 'rgba(15,23,42,0.6)',
            border: '2px dashed rgba(99,102,241,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden',
            flexShrink: 0,
          }}>
            {faviconInfo.hasCustom && faviconInfo.url ? (
              <img src={faviconInfo.url} alt="站点图标" style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            ) : (
              <span style={{
                fontSize: 28,
                background: 'linear-gradient(135deg, #6366f1, #22d3ee)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              }}>✦</span>
            )}
          </div>

          {/* 信息区 */}
          <div style={{ flex: 1, minWidth: 200 }}>
            {faviconInfo.hasCustom ? (
              <div>
                <Text style={{ color: '#f1f5f9' }}>自定义图标</Text>
                <br />
                <Text style={{ color: '#94a3b8', fontSize: 12 }}>
                  {faviconInfo.originalName}
                  {faviconInfo.size != null && ` (${(faviconInfo.size / 1024).toFixed(1)} KB)`}
                </Text>
              </div>
            ) : (
              <Text style={{ color: '#64748b' }}>当前使用默认图标</Text>
            )}
          </div>

          {/* 操作区 */}
          <Space>
            <Upload
              accept=".png,.svg,.ico,.jpg,.jpeg"
              showUploadList={false}
              beforeUpload={(file) => { handleFaviconUpload(file as File); return false; }}
            >
              <Button
                icon={<UploadOutlined />}
                loading={faviconUploading}
                style={{
                  background: 'rgba(99,102,241,0.15)',
                  borderColor: 'rgba(99,102,241,0.4)',
                  color: '#818cf8',
                }}
              >
                上传图标
              </Button>
            </Upload>
            {faviconInfo.hasCustom && (
              <Button
                icon={<DeleteOutlined />}
                danger
                loading={faviconDeleting}
                onClick={handleFaviconDelete}
              >
                恢复默认
              </Button>
            )}
          </Space>
        </div>
        <Text style={{ display: 'block', marginTop: 12, color: '#64748b', fontSize: 11 }}>
          支持 PNG、SVG、ICO、JPG 格式，建议尺寸 64×64 或以上，文件不超过 1MB
        </Text>
      </div>

      {searchTerm.trim() && (
        <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 12, display: 'block' }}>
          找到 {filteredConfigs.length} 项匹配
        </Text>
      )}
      <Table
        columns={columns}
        dataSource={filteredConfigs}
        rowKey="config_key"
        loading={loading}
        pagination={false}
        size="small"
      />
      <Text style={{ display: 'block', marginTop: 12, color: '#64748b', fontSize: 12 }}>
        提示：CORS 跨域功能默认关闭。如需外部域名访问 API，请先开启 CORS 开关，再配置域名白名单。
        修改后约 60 秒内生效。
      </Text>

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
            <pre style={{
              background: '#0f172a', color: '#e2e8f0', padding: '12px 16px',
              borderRadius: 8, fontSize: 12, lineHeight: 1.6, overflow: 'auto', margin: 0,
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
            <Title level={5} style={{ margin: '12px 0 4px' }}>通用客户端调用示例</Title>
            <pre style={{
              background: '#0f172a', color: '#e2e8f0', padding: '12px 16px',
              borderRadius: 8, fontSize: 12, lineHeight: 1.6, overflow: 'auto', margin: 0,
            }}>{`// 1. 初始化连接
POST /api/mcp-endpoint
Content-Type: application/json
x-api-key: <MCP_API_KEY>

{
  "jsonrpc": "2.0", "id": "1",
  "method": "initialize",
  "params": {
    "protocolVersion": "2024-11-05",
    "capabilities": { "tools": {} },
    "clientInfo": { "name": "your-app", "version": "1.0" }
  }
}

// 2. 获取工具列表
{
  "jsonrpc": "2.0", "id": "2",
  "method": "tools/list", "params": {}
}

// 3. 调用工具
{
  "jsonrpc": "2.0", "id": "3",
  "method": "tools/call",
  "params": { "name": "<工具名>", "arguments": {} }
}`}</pre>
          </div>
        }
        style={{ marginTop: 16 }}
      />
    </div>
  );
};

export default ConfigForm;
