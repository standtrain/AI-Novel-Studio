import React, { useEffect, useState } from 'react';
import {
  Card, Button, Modal, Form, Input, InputNumber, Space, Typography,
  App, Popconfirm, Row, Col, Divider, Alert, Tag, Checkbox,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, EditOutlined, ApiOutlined,
  SaveOutlined, ThunderboltOutlined,
} from '@ant-design/icons';
import { getProvidersApi, saveProvidersApi, testProviderApi } from '../../api/admin';

const { Text, Title } = Typography;

// 写作阶段选项
const PHASE_OPTIONS = [
  { label: '全书大纲', value: 'outline' },
  { label: '人物设定', value: 'characters' },
  { label: '章节大纲', value: 'chapters_outline' },
  { label: '章节写作', value: 'write_chapter' },
  { label: 'AI审核', value: 'review' },
];

interface ModelConfig { name: string; phases: string[]; }
interface ProviderConfig { name: string; baseUrl: string; apiKey: string; priority: number; maxConcurrency?: number; models: ModelConfig[]; }

const ProviderManager: React.FC = () => {
  const { message } = App.useApp();
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // 编辑弹窗
  const [editModal, setEditModal] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number>(-1);
  const [editForm] = Form.useForm();

  // 测试
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [testProviderName, setTestProviderName] = useState<string>('');

  useEffect(() => { loadProviders(); }, []);

  // 从后端加载 Provider 配置
  const loadProviders = async () => {
    setLoading(true);
    try {
      const { getConfigsApi } = await import('../../api/admin');
      const [provData, configData] = await Promise.all([getProvidersApi(), getConfigsApi()]);
      let pList: ProviderConfig[] = provData.providers || [];

      // 如果没有 Provider，从旧版 site_config 构建默认 Provider
      if (pList.length === 0) {
        const configs: any = {};
        (configData.configs || []).forEach((c: any) => { configs[c.config_key] = c.config_value; });
        const apiKey = configs.openai_api_key || '';
        const baseUrl = configs.openai_base_url || 'https://api.openai.com/v1';
        const model = configs.default_model || 'gpt-4o';
        if (apiKey) {
          pList = [{
            name: 'default',
            baseUrl,
            apiKey,
            priority: 10,
            maxConcurrency: 0,
            models: [{ name: model, phases: ['outline', 'characters', 'chapters_outline', 'write_chapter'] }],
          }];
        }
      }

      setProviders(pList);
    } catch {
      message.error('加载 Provider 配置失败');
    } finally {
      setLoading(false);
    }
  };

  // 打开编辑弹窗（p 为 null 表示新增）
  const openEdit = (index?: number) => {
    if (index !== undefined && index >= 0) {
      const p = providers[index];
      setEditingIndex(index);
      editForm.setFieldsValue({
        name: p.name,
        baseUrl: p.baseUrl,
        apiKey: p.apiKey,
        priority: p.priority ?? 10,
        maxConcurrency: p.maxConcurrency ?? 0,
        models: p.models.map(m => ({
          name: m.name,
          phases: m.phases.includes('all')
            ? PHASE_OPTIONS.map(o => o.value)
            : m.phases,
        })),
      });
    } else {
      setEditingIndex(-1);
      editForm.resetFields();
      editForm.setFieldsValue({
        priority: 10,
        maxConcurrency: 0,
        models: [{ name: 'gpt-4o', phases: PHASE_OPTIONS.map(o => o.value) }],
      });
    }
    setEditModal(true);
  };

  // 保存编辑
  const handleEditSave = async () => {
    try {
      const values = await editForm.validateFields();
      // 构建模型配置：如果全选了所有阶段，标记为 'all'
      const models: ModelConfig[] = (values.models || []).map((m: any) => {
        const allPhases = PHASE_OPTIONS.map(o => o.value);
        const isAll = allPhases.every((p: string) => (m.phases || []).includes(p));
        return {
          name: m.name.trim(),
          phases: isAll ? ['all'] : (m.phases || []),
        };
      });

      const provider: ProviderConfig = {
        name: values.name.trim(),
        baseUrl: values.baseUrl.replace(/\/$/, ''),
        apiKey: values.apiKey,
        priority: values.priority ?? 10,
        maxConcurrency: values.maxConcurrency ?? 0,
        models,
      };

      const newList = [...providers];
      if (editingIndex >= 0) {
        newList[editingIndex] = provider;
      } else {
        newList.push(provider);
      }
      setProviders(newList);
      setEditModal(false);
    } catch { /* 表单校验失败 */ }
  };

  const handleDelete = (idx: number) => {
    setProviders(providers.filter((_, i) => i !== idx));
  };

  // 保存全部到后端
  const handleSaveAll = async () => {
    setSaving(true);
    try {
      await saveProvidersApi(providers);
      // 同步更新旧版 site_config（兼容）
      const { updateConfigApi } = await import('../../api/admin');
      await updateConfigApi('provider_mode', providers.length > 1 ? 'multi' : 'single');
      message.success('配置已保存，立即生效');
    } catch (err: any) {
      message.error(err.response?.data?.error || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  // 测试连接
  const handleTest = async (provider: ProviderConfig) => {
    if (!provider.models.length) return;
    setTesting(true);
    setTestResult(null);
    setTestProviderName(provider.name);
    try {
      const result = await testProviderApi({
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey,
        model: provider.models[0].name,
      });
      setTestResult(result);
    } catch (err: any) {
      setTestResult({ success: false, message: err.message });
    } finally {
      setTesting(false);
    }
  };

  // 上移/下移调整优先级
  const moveProvider = (index: number, direction: 'up' | 'down') => {
    const newList = [...providers];
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= newList.length) return;
    [newList[index], newList[target]] = [newList[target], newList[index]];
    setProviders(newList);
  };

  // 渲染阶段标签
  const renderPhaseTags = (phases: string[]) => {
    if (phases.includes('all')) {
      return <Tag color="green">全部阶段</Tag>;
    }
    const labels: Record<string, string> = {
      outline: '大纲', characters: '人物', chapters_outline: '章纲', write_chapter: '写作', review: 'AI审核',
    };
    return phases.map(p => <Tag key={p} color="blue">{labels[p] || p}</Tag>);
  };

  return (
    <div>
      {/* 顶部操作栏 */}
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space>
          <Text strong style={{ fontSize: 16 }}>Provider 列表</Text>
          <Text type="secondary">（{providers.length} 个）</Text>
        </Space>
        <Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openEdit()}>
            添加 Provider
          </Button>
          <Button icon={<SaveOutlined />} onClick={handleSaveAll} loading={saving}>
            保存配置
          </Button>
        </Space>
      </div>

      {providers.length === 0 && !loading && (
        <Alert
          type="warning"
          message="尚未配置任何 Provider"
          description="点击「添加 Provider」配置大模型接口。至少需要一个 Provider 才能使用 AI 写作功能。"
          style={{ marginBottom: 16 }}
        />
      )}

      {/* Provider 卡片列表 */}
      {providers.map((p, idx) => (
        <Card
          key={idx}
          size="small"
          style={{ marginBottom: 12 }}
          title={
            <Space>
              <ApiOutlined />
              <Text strong>{p.name}</Text>
              <Tag color="volcano">优先级 {p.priority ?? 10}</Tag>
              <Tag color="purple">并发 {p.maxConcurrency ? p.maxConcurrency : '不限'}</Tag>
            </Space>
          }
          extra={
            <Space>
              <Button size="small" onClick={() => moveProvider(idx, 'up')} disabled={idx === 0}>↑</Button>
              <Button size="small" onClick={() => moveProvider(idx, 'down')} disabled={idx === providers.length - 1}>↓</Button>
              <Button
                size="small" icon={<ThunderboltOutlined />}
                loading={testing && testProviderName === p.name}
                onClick={() => handleTest(p)}
              >
                测试
              </Button>
              <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(idx)}>编辑</Button>
              <Popconfirm title="确认删除此 Provider？" onConfirm={() => handleDelete(idx)}>
                <Button size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            </Space>
          }
        >
          <Row gutter={[24, 8]}>
            <Col span={8}>
              <Text type="secondary">接口地址：</Text>
              <Text code>{p.baseUrl}</Text>
            </Col>
            <Col span={4}>
              <Text type="secondary">API Key：</Text>
              <Text>{p.apiKey ? '••••' + p.apiKey.slice(-4) : '未设置'}</Text>
            </Col>
            <Col span={12}>
              <Text type="secondary">模型：</Text>
              {p.models.map((m, mi) => (
                <Tag key={mi} color="blue" style={{ marginRight: 4 }}>
                  {m.name}
                </Tag>
              ))}
            </Col>
          </Row>
          <div style={{ marginTop: 8 }}>
            {p.models.map((m, mi) => (
              <span key={mi} style={{ marginRight: 16 }}>
                <Text type="secondary">{m.name}：</Text>
                {renderPhaseTags(m.phases)}
              </span>
            ))}
          </div>
        </Card>
      ))}

      {/* 测试结果 */}
      {testResult && (
        <Alert
          type={testResult.success ? 'success' : 'error'}
          message={testResult.success
            ? `${testProviderName} 连接成功 — 延迟 ${testResult.latency}ms，模型 ${testResult.model}`
            : `${testProviderName} 连接失败：${testResult.message}`}
          style={{ marginTop: 12 }} closable onClose={() => setTestResult(null)}
        />
      )}

      {/* 编辑 Provider 弹窗 */}
      <Modal
        title={editingIndex >= 0 ? `编辑 Provider：${providers[editingIndex]?.name || ''}` : '添加 Provider'}
        open={editModal}
        onOk={handleEditSave}
        onCancel={() => setEditModal(false)}
        width={640}
        forceRender
      >
        <Form form={editForm} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="name" label="Provider 名称" rules={[{ required: true, message: '请输入名称' }]}>
                <Input placeholder="如 openai、deepseek、zhipu" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="priority" label="优先级" tooltip="数值越高越优先使用，拖拽顺序即为优先级">
                <InputNumber min={1} max={100} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="maxConcurrency" label="API 并发上限" tooltip="限制此 Provider 同时运行的请求数，0 表示不限制">
            <InputNumber min={0} max={1000} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="baseUrl" label="接口地址" rules={[{ required: true, message: '请输入接口地址' }]}>
            <Input placeholder="https://api.openai.com/v1" />
          </Form.Item>
          <Form.Item name="apiKey" label="API Key" rules={[{ required: true, message: '请输入 API Key' }]}>
            <Input.Password placeholder="sk-..." />
          </Form.Item>

          <Divider style={{ margin: '12px 0' }} />
          <Text strong style={{ display: 'block', marginBottom: 12 }}>模型配置</Text>
          <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
            每个模型可指定适用的写作阶段。若全部勾选，保存后自动标记为「全部阶段」。
          </Text>

          <Form.List name="models">
            {(fields, { add, remove }) => (
              <>
                {fields.map(({ key, name, ...rest }, idx) => (
                  <Card
                    key={key}
                    size="small"
                    type="inner"
                    style={{ marginBottom: 8 }}
                    extra={
                      fields.length > 1 && (
                        <Button size="small" danger icon={<DeleteOutlined />} onClick={() => remove(name)} />
                      )
                    }
                  >
                    <Form.Item {...rest} name={[name, 'name']} label="模型名" rules={[{ required: true }]} style={{ marginBottom: 8 }}>
                      <Input placeholder="如 gpt-4o、gpt-4o-mini、deepseek-chat" />
                    </Form.Item>
                    <Form.Item {...rest} name={[name, 'phases']} label="适用阶段" style={{ marginBottom: 0 }}>
                      <Checkbox.Group options={PHASE_OPTIONS} />
                    </Form.Item>
                  </Card>
                ))}
                <Button type="dashed" size="small" onClick={() => add({ name: 'gpt-4o', phases: PHASE_OPTIONS.map(o => o.value) })} icon={<PlusOutlined />}>
                  添加模型
                </Button>
              </>
            )}
          </Form.List>
        </Form>
      </Modal>
    </div>
  );
};

export default ProviderManager;
