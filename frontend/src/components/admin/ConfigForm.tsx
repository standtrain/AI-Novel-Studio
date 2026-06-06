import React, { useEffect, useState } from 'react';
import { Table, Input, InputNumber, Button, Switch, Typography, message, Alert, Space, Upload, Select, Collapse } from 'antd';
import { SaveOutlined, ReloadOutlined, SafetyCertificateOutlined, UploadOutlined, DeleteOutlined, PictureOutlined, GlobalOutlined, EditOutlined, LockOutlined, MailOutlined, ApiOutlined } from '@ant-design/icons';
import { getConfigsApi, updateConfigApi, getFaviconInfoApi, uploadFaviconApi, deleteFaviconApi } from '../../api/admin';

const { Text, Paragraph, Title } = Typography;

function generateRandomKey(length = 48): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  let result = '';
  for (let i = 0; i < length; i++) result += chars[arr[i] % chars.length];
  return result;
}

// 配置分类定义
const CONFIG_CATEGORIES: { key: string; label: string; icon: React.ReactNode; keys: string[] }[] = [
  {
    key: 'site',
    label: '站点信息',
    icon: <GlobalOutlined />,
    keys: ['site_name', 'site_description'],
  },
  {
    key: 'writing',
    label: '写作参数',
    icon: <EditOutlined />,
    keys: ['max_tokens_per_request', 'default_temperature', 'chapters_per_batch'],
  },
  {
    key: 'security',
    label: '安全设置',
    icon: <LockOutlined />,
    keys: ['allow_registration', 'cors_enabled', 'cors_origins', 'captcha_enabled', 'login_rate_limit', 'mcp_api_key'],
  },
  {
    key: 'email',
    label: '邮件设置',
    icon: <MailOutlined />,
    keys: ['email_provider', 'email_verification_enabled', 'email_domain_whitelist_enabled', 'email_domain_whitelist'],
  },
  {
    key: 'resend',
    label: 'Resend API 配置',
    icon: <ApiOutlined />,
    keys: ['resend_api_key', 'email_from', 'email_from_name'],
  },
  {
    key: 'smtp',
    label: 'SMTP 配置',
    icon: <MailOutlined />,
    keys: ['smtp_host', 'smtp_port', 'smtp_secure', 'smtp_auth_login', 'smtp_user', 'smtp_from', 'smtp_pass'],
  },
];

const ALL_SITE_CONFIG_KEYS = CONFIG_CATEGORIES.flatMap(c => c.keys);
const BOOLEAN_KEYS = ['allow_registration', 'cors_enabled', 'captcha_enabled', 'email_verification_enabled', 'email_domain_whitelist_enabled', 'smtp_secure', 'smtp_auth_login'];

interface ConfigFormProps { searchTerm: string; }

const ConfigForm: React.FC<ConfigFormProps> = ({ searchTerm }) => {
  const [configs, setConfigs] = useState<any[]>([]);
  const [editingValues, setEditingValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set());
  const [activeKeys, setActiveKeys] = useState<string[]>(['site']);

  const [faviconInfo, setFaviconInfo] = useState<{ hasCustom: boolean; url: string | null; originalName: string | null; size: number | null }>({ hasCustom: false, url: null, originalName: null, size: null });
  const [faviconUploading, setFaviconUploading] = useState(false);
  const [faviconDeleting, setFaviconDeleting] = useState(false);

  useEffect(() => { loadConfigs(); loadFaviconInfo(); }, []);

  const loadFaviconInfo = async () => {
    try { const info = await getFaviconInfoApi(); setFaviconInfo(info); } catch { /* 静默 */ }
  };

  const handleFaviconUpload = async (file: File) => {
    setFaviconUploading(true);
    try {
      const result = await uploadFaviconApi(file);
      message.success('图标上传成功');
      setFaviconInfo({ hasCustom: true, url: result.url, originalName: result.filename, size: result.size });
    } catch (err: any) { message.error(err.response?.data?.error || '上传失败'); }
    finally { setFaviconUploading(false); }
    return false;
  };

  const handleFaviconDelete = async () => {
    setFaviconDeleting(true);
    try {
      await deleteFaviconApi();
      message.success('已恢复默认图标');
      setFaviconInfo({ hasCustom: false, url: null, originalName: null, size: null });
    } catch (err: any) { message.error(err.response?.data?.error || '删除失败'); }
    finally { setFaviconDeleting(false); }
  };

  const loadConfigs = async () => {
    setLoading(true);
    try {
      const data = await getConfigsApi();
      setConfigs((data.configs || []).filter((c: any) => ALL_SITE_CONFIG_KEYS.includes(c.config_key)));
    } catch { message.error('加载配置失败'); }
    finally { setLoading(false); }
  };

  // 获取指定分类的配置项列表
  const getCategoryConfigs = (catKeys: string[]) => {
    let list = configs.filter(c => catKeys.includes(c.config_key));
    // 按 catKeys 顺序排列
    list.sort((a, b) => catKeys.indexOf(a.config_key) - catKeys.indexOf(b.config_key));
    // 搜索过滤
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      list = list.filter(c => (c.config_key || '').toLowerCase().includes(term) || (c.description || '').toLowerCase().includes(term));
    }
    return list;
  };

  const handleSave = async (key: string) => {
    const val = editingValues[key];
    if (val === undefined) { message.warning('没有修改'); return; }
    setSavingKeys(prev => new Set(prev).add(key));
    try {
      await updateConfigApi(key, val);
      message.success('保存成功');
      setEditingValues(prev => { const n = { ...prev }; delete n[key]; return n; });
      loadConfigs();
    } catch (err: any) { message.error(err.response?.data?.error || '保存失败'); }
    finally { setSavingKeys(prev => { const n = new Set(prev); n.delete(key); return n; }); }
  };

  const getCurrentValue = (record: any) => editingValues[record.config_key] !== undefined ? editingValues[record.config_key] : record.config_value;

  // 搜索时自动展开包含匹配项的分类
  useEffect(() => {
    if (!searchTerm.trim()) return;
    const matchedCategories = CONFIG_CATEGORIES
      .filter(cat => getCategoryConfigs(cat.keys).length > 0)
      .map(cat => cat.key);
    if (matchedCategories.length > 0) setActiveKeys(matchedCategories);
  }, [searchTerm, configs]);

  // 渲染单个配置行的值编辑器
  const renderValueEditor = (record: any) => {
    const currentVal = getCurrentValue(record);
    const modified = editingValues[record.config_key] !== undefined;

    if (BOOLEAN_KEYS.includes(record.config_key)) {
      const checked = currentVal === 'true';
      return (
        <span>
          <Switch checked={checked} onChange={(v) => setEditingValues({ ...editingValues, [record.config_key]: v ? 'true' : 'false' })}
            style={modified ? { boxShadow: '0 0 0 2px rgba(251,191,36,0.3)' } : undefined} />
          <Text style={{ marginLeft: 8, color: checked ? '#34d399' : '#64748b', fontSize: 12 }}>{checked ? '已开启' : '已关闭'}</Text>
          {modified && <Text style={{ marginLeft: 8, color: '#fbbf24', fontSize: 11 }}>已修改</Text>}
        </span>
      );
    }

    const inputStyle = { background: modified ? 'rgba(251,191,36,0.08)' : undefined, borderColor: modified ? 'rgba(251,191,36,0.4)' : undefined };

    if (record.config_key === 'cors_origins' || record.config_key === 'email_domain_whitelist') {
      return (
        <Input.TextArea value={currentVal} onChange={(e) => setEditingValues({ ...editingValues, [record.config_key]: e.target.value })}
          rows={record.config_key === 'email_domain_whitelist' ? 4 : 3}
          placeholder={record.config_key === 'cors_origins' ? '每行一个域名' : '每行一个域名，如 gmail.com'}
          style={{ ...inputStyle, background: inputStyle.background || 'rgba(15,23,42,0.5)', color: '#f1f5f9', fontSize: 13, fontFamily: 'monospace' }} />
      );
    }

    if (record.config_key === 'login_rate_limit' || record.config_key === 'smtp_port') {
      const def = record.config_key === 'smtp_port' ? 587 : 5;
      const max = record.config_key === 'smtp_port' ? 65535 : 60;
      return <InputNumber value={Number(currentVal) || def} onChange={(v) => setEditingValues({ ...editingValues, [record.config_key]: String(v ?? def) })} min={1} max={max} style={{ width: '100%' }} />;
    }

    if (record.config_key === 'email_provider') {
      return <Select value={currentVal || 'resend'} onChange={(v) => setEditingValues({ ...editingValues, [record.config_key]: v })} style={{ width: '100%' }}
        options={[{ value: 'resend', label: 'Resend API' }, { value: 'smtp', label: 'SMTP 服务器' }]} />;
    }

    if (record.config_key === 'mcp_api_key') {
      return (
        <Space.Compact style={{ width: '100%' }}>
          <Input.Password value={currentVal} onChange={(e) => setEditingValues({ ...editingValues, [record.config_key]: e.target.value })} placeholder="输入 MCP API Key" style={inputStyle} />
          <Button icon={<ReloadOutlined />} onClick={() => setEditingValues({ ...editingValues, [record.config_key]: generateRandomKey() })}>随机生成</Button>
        </Space.Compact>
      );
    }

    if (record.config_key === 'resend_api_key' || record.config_key === 'smtp_pass') {
      const placeholder = record.config_key === 'smtp_pass' ? '留空以保留现有凭证' : '输入 Resend API Key';
      return <Input.Password value={currentVal} onChange={(e) => setEditingValues({ ...editingValues, [record.config_key]: e.target.value })} placeholder={placeholder} style={inputStyle} />;
    }

    return <Input value={currentVal} onChange={(e) => setEditingValues({ ...editingValues, [record.config_key]: e.target.value })} style={inputStyle} />;
  };

  const configColumns = [
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
    { title: '配置值', dataIndex: 'config_value', render: (_: string, record: any) => renderValueEditor(record) },
    {
      title: '', width: 70,
      render: (_: any, record: any) => {
        const modified = editingValues[record.config_key] !== undefined;
        return (
          <Button type={modified ? 'primary' : 'default'} size="small" icon={<SaveOutlined />}
            onClick={() => handleSave(record.config_key)} loading={savingKeys.has(record.config_key)} disabled={!modified}
            style={modified ? { background: 'linear-gradient(135deg, #f59e0b, #d97706)', border: 'none' } : undefined}>保存</Button>
        );
      },
    },
  ];

  const totalFiltered = CONFIG_CATEGORIES.reduce((sum, cat) => sum + getCategoryConfigs(cat.keys).length, 0);

  return (
    <div>
      {/* 站点图标管理 */}
      <div style={{ marginBottom: 20, padding: 20, background: 'rgba(30,41,59,0.5)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 12 }}>
        <Text strong style={{ color: '#f1f5f9', fontSize: 15, display: 'block', marginBottom: 16 }}><PictureOutlined style={{ marginRight: 8 }} />站点图标（Favicon）</Text>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <div style={{ width: 64, height: 64, borderRadius: 12, background: 'rgba(15,23,42,0.6)', border: '2px dashed rgba(99,102,241,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
            {faviconInfo.hasCustom && faviconInfo.url ? (
              <img src={faviconInfo.url} alt="站点图标" style={{ width: '100%', height: '100%', objectFit: 'contain' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            ) : <span style={{ fontSize: 28, background: 'linear-gradient(135deg, #6366f1, #22d3ee)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>✦</span>}
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            {faviconInfo.hasCustom ? (
              <div><Text style={{ color: '#f1f5f9' }}>自定义图标</Text><br />
                <Text style={{ color: '#94a3b8', fontSize: 12 }}>{faviconInfo.originalName}{faviconInfo.size != null && ` (${(faviconInfo.size / 1024).toFixed(1)} KB)`}</Text></div>
            ) : <Text style={{ color: '#64748b' }}>当前使用默认图标</Text>}
          </div>
          <Space>
            <Upload accept=".png,.svg,.ico,.jpg,.jpeg" showUploadList={false} beforeUpload={(file) => { handleFaviconUpload(file as File); return false; }}>
              <Button icon={<UploadOutlined />} loading={faviconUploading} style={{ background: 'rgba(99,102,241,0.15)', borderColor: 'rgba(99,102,241,0.4)', color: '#818cf8' }}>上传图标</Button>
            </Upload>
            {faviconInfo.hasCustom && <Button icon={<DeleteOutlined />} danger loading={faviconDeleting} onClick={handleFaviconDelete}>恢复默认</Button>}
          </Space>
        </div>
        <Text style={{ display: 'block', marginTop: 12, color: '#64748b', fontSize: 11 }}>支持 PNG、SVG、ICO、JPG 格式，建议尺寸 64×64 或以上，文件不超过 1MB</Text>
      </div>

      {/* 搜索提示 */}
      {searchTerm.trim() && (
        <Text style={{ color: '#94a3b8', fontSize: 12, marginBottom: 12, display: 'block' }}>找到 {totalFiltered} 项匹配</Text>
      )}

      {/* 分类可折叠面板 */}
      {loading ? <Text style={{ color: '#64748b' }}>加载中...</Text> : (
        <Collapse activeKey={activeKeys} onChange={(keys) => setActiveKeys(Array.isArray(keys) ? keys as string[] : [keys as string])} ghost
          style={{ background: 'transparent' }}>
          {CONFIG_CATEGORIES.map(cat => {
            const catConfigs = getCategoryConfigs(cat.keys);
            // 搜索模式：没有匹配项的分类隐藏
            if (searchTerm.trim() && catConfigs.length === 0) return null;
            return (
              <Collapse.Panel
                key={cat.key}
                header={
                  <Text strong style={{ color: '#f1f5f9', fontSize: 14 }}>
                    {cat.icon} <span style={{ marginLeft: 8 }}>{cat.label}</span>
                    <Text style={{ color: '#64748b', fontSize: 11, marginLeft: 10 }}>({catConfigs.length} 项)</Text>
                  </Text>
                }
                style={{ marginBottom: 8, background: 'rgba(30,41,59,0.4)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 10, overflow: 'hidden' }}
              >
                <Table columns={configColumns} dataSource={catConfigs} rowKey="config_key" pagination={false} size="small" showHeader={false} />
              </Collapse.Panel>
            );
          })}
        </Collapse>
      )}

      {/* MCP 外部连接说明 */}
      <Alert type="info" icon={<SafetyCertificateOutlined />} message="MCP 外部连接说明" style={{ marginTop: 20 }}
        description={
          <div style={{ fontSize: 13 }}>
            <Title level={5} style={{ marginTop: 8, marginBottom: 4 }}>连接地址</Title>
            <Paragraph><Text code copyable>https://你的服务器地址/api/mcp-endpoint</Text></Paragraph>
            <Title level={5} style={{ marginBottom: 4 }}>认证方式</Title>
            <Paragraph>在请求头中携带 API Key，支持两种方式：<br />• <Text code>Authorization: Bearer {'<MCP_API_KEY>'}</Text><br />• <Text code>x-api-key: {'<MCP_API_KEY>'}</Text></Paragraph>
            <Title level={5} style={{ marginBottom: 4 }}>Claude Desktop 配置示例</Title>
            <pre style={{ background: '#0f172a', color: '#e2e8f0', padding: '12px 16px', borderRadius: 8, fontSize: 12, lineHeight: 1.6, overflow: 'auto', margin: 0 }}>{`{
  "mcpServers": {
    "bookagent": {
      "transport": "http",
      "url": "https://你的服务器地址/api/mcp-endpoint",
      "headers": { "x-api-key": "<MCP_API_KEY>" }
    }
  }
}`}</pre>
          </div>
        } />
    </div>
  );
};

export default ConfigForm;
