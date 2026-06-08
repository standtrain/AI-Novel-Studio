import React, { useEffect, useState } from 'react';
import {
  Alert, App, AutoComplete, Button, Card, Checkbox, Col, Divider, Form, Input,
  InputNumber, Modal, Popconfirm, Row, Space, Tag, Tooltip, Typography,
} from 'antd';
import {
  ApiOutlined, ArrowDownOutlined, ArrowUpOutlined, CloudDownloadOutlined,
  DeleteOutlined, EditOutlined, PlusOutlined, SaveOutlined, ThunderboltOutlined,
} from '@ant-design/icons';
import {
  fetchProviderModelsApi,
  getProvidersApi,
  saveProvidersApi,
  testProviderApi,
} from '../../api/admin';

const { Text } = Typography;

const PHASE_OPTIONS = [
  { label: '全书大纲', value: 'outline' },
  { label: '人物设定', value: 'characters' },
  { label: '章节大纲', value: 'chapters_outline' },
  { label: '章节写作', value: 'write_chapter' },
  { label: 'AI审核', value: 'review' },
];

interface ModelConfig {
  name: string;
  phases: string[];
}

interface ProviderConfig {
  name: string;
  baseUrl: string;
  apiKey: string;
  priority: number;
  maxConcurrency?: number;
  models: ModelConfig[];
}

const allPhaseValues = PHASE_OPTIONS.map(option => option.value);

function normalizeModelName(name?: string) {
  return String(name || '').trim();
}

function uniqueModelNames(names: string[]) {
  const seen = new Set<string>();
  return names
    .map(normalizeModelName)
    .filter((name) => {
      if (!name) return false;
      const key = name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

const ProviderManager: React.FC = () => {
  const { message } = App.useApp();
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [modelOptions, setModelOptions] = useState<string[]>([]);

  const [editModal, setEditModal] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number>(-1);
  const [editForm] = Form.useForm();

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [testProviderName, setTestProviderName] = useState<string>('');

  useEffect(() => { loadProviders(); }, []);

  const loadProviders = async () => {
    setLoading(true);
    try {
      const { getConfigsApi } = await import('../../api/admin');
      const [provData, configData] = await Promise.all([getProvidersApi(), getConfigsApi()]);
      let pList: ProviderConfig[] = provData.providers || [];

      if (pList.length === 0) {
        const configs: any = {};
        (configData.configs || []).forEach((config: any) => { configs[config.config_key] = config.config_value; });
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

  const openEdit = (index?: number) => {
    editForm.resetFields();
    if (index !== undefined && index >= 0) {
      const provider = providers[index];
      const models = provider.models.map(model => ({
        name: model.name,
        phases: model.phases.includes('all') ? allPhaseValues : model.phases,
      }));

      setEditingIndex(index);
      setModelOptions(uniqueModelNames(models.map(model => model.name)));
      editForm.setFieldsValue({
        name: provider.name,
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey,
        priority: provider.priority ?? 10,
        maxConcurrency: provider.maxConcurrency ?? 0,
        models,
      });
    } else {
      const defaultModels = [{ name: 'gpt-4o', phases: allPhaseValues }];
      setEditingIndex(-1);
      setModelOptions(['gpt-4o']);
      editForm.setFieldsValue({
        priority: 10,
        maxConcurrency: 0,
        models: defaultModels,
      });
    }
    setEditModal(true);
  };

  const handleFetchModels = async () => {
    const { baseUrl, apiKey } = editForm.getFieldsValue(['baseUrl', 'apiKey']);
    const normalizedBaseUrl = String(baseUrl || '').trim().replace(/\/$/, '');
    const normalizedApiKey = String(apiKey || '').trim();

    if (!normalizedBaseUrl) {
      message.warning('请先填写接口地址');
      return;
    }
    if (!normalizedApiKey) {
      message.warning('请先填写 Provider API Key');
      return;
    }

    setFetchingModels(true);
    try {
      const result = await fetchProviderModelsApi({
        baseUrl: normalizedBaseUrl,
        apiKey: normalizedApiKey,
      });
      const fetchedNames = uniqueModelNames(result.models || []);
      if (fetchedNames.length === 0) {
        message.warning('未从 Provider 返回可用模型');
        return;
      }

      const currentModels: ModelConfig[] = editForm.getFieldValue('models') || [];
      const currentNames = uniqueModelNames(currentModels.map(model => model.name));
      const mergedOptions = uniqueModelNames([...currentNames, ...fetchedNames]);
      const existingKeys = new Set(currentNames.map(name => name.toLowerCase()));
      const mergedModels = [
        ...currentModels.map(model => ({
          name: normalizeModelName(model.name),
          phases: Array.isArray(model.phases) && model.phases.length > 0 ? model.phases : allPhaseValues,
        })).filter(model => model.name),
        ...fetchedNames
          .filter(name => !existingKeys.has(name.toLowerCase()))
          .map(name => ({ name, phases: allPhaseValues })),
      ];

      setModelOptions(mergedOptions);
      editForm.setFieldsValue({ baseUrl: normalizedBaseUrl, apiKey: normalizedApiKey, models: mergedModels });
      message.success(`已拉取 ${fetchedNames.length} 个模型`);
    } catch (err: any) {
      message.error(err.response?.data?.error || '拉取模型列表失败');
    } finally {
      setFetchingModels(false);
    }
  };

  const handleEditSave = async () => {
    try {
      const values = await editForm.validateFields();
      const seenModels = new Set<string>();
      const models: ModelConfig[] = (values.models || [])
        .map((model: any) => {
          const name = normalizeModelName(model.name);
          const phases = Array.isArray(model.phases) ? model.phases : [];
          const isAll = allPhaseValues.every(phase => phases.includes(phase));
          return {
            name,
            phases: isAll ? ['all'] : phases,
          };
        })
        .filter((model: ModelConfig) => {
          const key = model.name.toLowerCase();
          if (!model.name || seenModels.has(key)) return false;
          seenModels.add(key);
          return true;
        });

      if (models.length === 0) {
        message.warning('请至少配置一个模型');
        return;
      }

      const provider: ProviderConfig = {
        name: String(values.name || '').trim(),
        baseUrl: String(values.baseUrl || '').trim().replace(/\/$/, ''),
        apiKey: String(values.apiKey || '').trim(),
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
    } catch {
      // 表单校验失败时由 antd 展示字段错误。
    }
  };

  const handleDelete = (idx: number) => {
    setProviders(providers.filter((_, i) => i !== idx));
  };

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      await saveProvidersApi(providers);
      const { updateConfigApi } = await import('../../api/admin');
      await updateConfigApi('provider_mode', providers.length > 1 ? 'multi' : 'single');
      message.success('配置已保存，立即生效');
    } catch (err: any) {
      message.error(err.response?.data?.error || '保存失败');
    } finally {
      setSaving(false);
    }
  };

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
      setTestResult({ success: false, message: err.response?.data?.error || err.message });
    } finally {
      setTesting(false);
    }
  };

  const moveProvider = (index: number, direction: 'up' | 'down') => {
    const newList = [...providers];
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= newList.length) return;
    [newList[index], newList[target]] = [newList[target], newList[index]];
    setProviders(newList);
  };

  const renderPhaseTags = (phases: string[]) => {
    if (phases.includes('all')) {
      return <Tag color="green">全部阶段</Tag>;
    }
    const labels: Record<string, string> = {
      outline: '大纲',
      characters: '人物',
      chapters_outline: '章纲',
      write_chapter: '写作',
      review: 'AI审核',
    };
    return phases.map(phase => <Tag key={phase} color="blue">{labels[phase] || phase}</Tag>);
  };

  const autoCompleteOptions = modelOptions.map(value => ({ value }));

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space>
          <Text strong style={{ fontSize: 16 }}>Provider 列表</Text>
          <Text type="secondary">({providers.length} 个)</Text>
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
          description="点击添加 Provider 配置大模型接口。至少需要一个 Provider 才能使用 AI 写作功能。"
          style={{ marginBottom: 16 }}
        />
      )}

      {providers.map((provider, idx) => (
        <Card
          key={`${provider.name}-${idx}`}
          size="small"
          style={{ marginBottom: 12 }}
          title={(
            <Space>
              <ApiOutlined />
              <Text strong>{provider.name}</Text>
              <Tag color="volcano">优先级 {provider.priority ?? 10}</Tag>
              <Tag color="purple">并发 {provider.maxConcurrency ? provider.maxConcurrency : '不限'}</Tag>
            </Space>
          )}
          extra={(
            <Space>
              <Tooltip title="上移 Provider">
                <Button
                  size="small"
                  icon={<ArrowUpOutlined />}
                  onClick={() => moveProvider(idx, 'up')}
                  disabled={idx === 0}
                />
              </Tooltip>
              <Tooltip title="下移 Provider">
                <Button
                  size="small"
                  icon={<ArrowDownOutlined />}
                  onClick={() => moveProvider(idx, 'down')}
                  disabled={idx === providers.length - 1}
                />
              </Tooltip>
              <Button
                size="small"
                icon={<ThunderboltOutlined />}
                loading={testing && testProviderName === provider.name}
                onClick={() => handleTest(provider)}
              >
                测试
              </Button>
              <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(idx)}>编辑</Button>
              <Popconfirm title="确认删除此 Provider？" onConfirm={() => handleDelete(idx)}>
                <Button size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            </Space>
          )}
        >
          <Row gutter={[24, 8]}>
            <Col span={8}>
              <Text type="secondary">接口地址：</Text>
              <Text code>{provider.baseUrl}</Text>
            </Col>
            <Col span={4}>
              <Text type="secondary">API Key：</Text>
              <Text>{provider.apiKey ? `****${provider.apiKey.slice(-4)}` : '未设置'}</Text>
            </Col>
            <Col span={12}>
              <Text type="secondary">模型顺序：</Text>
              {provider.models.map((model, modelIdx) => (
                <Tag key={`${model.name}-${modelIdx}`} color="blue" style={{ marginRight: 4 }}>
                  {modelIdx + 1}. {model.name}
                </Tag>
              ))}
            </Col>
          </Row>
          <div style={{ marginTop: 8 }}>
            {provider.models.map((model, modelIdx) => (
              <span key={`${model.name}-${modelIdx}`} style={{ marginRight: 16 }}>
                <Text type="secondary">{model.name}：</Text>
                {renderPhaseTags(model.phases)}
              </span>
            ))}
          </div>
        </Card>
      ))}

      {testResult && (
        <Alert
          type={testResult.success ? 'success' : 'error'}
          message={testResult.success
            ? `${testProviderName} 连接成功，延迟 ${testResult.latency}ms，模型 ${testResult.model}`
            : `${testProviderName} 连接失败：${testResult.message}`}
          style={{ marginTop: 12 }}
          closable
          onClose={() => setTestResult(null)}
        />
      )}

      <Modal
        title={editingIndex >= 0 ? `编辑 Provider：${providers[editingIndex]?.name || ''}` : '添加 Provider'}
        open={editModal}
        onOk={handleEditSave}
        onCancel={() => setEditModal(false)}
        width={720}
        forceRender
      >
        <Form form={editForm} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="name" label="Provider 名称" rules={[{ required: true, message: '请输入名称' }]}>
                <Input maxLength={50} placeholder="如 openai、deepseek、zhipu" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="priority" label="优先级" tooltip="数值越高越优先使用">
                <InputNumber min={1} max={100} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="maxConcurrency" label="API 并发上限" tooltip="限制此 Provider 同时运行的请求数，0 表示不限制">
            <InputNumber min={0} max={1000} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="baseUrl"
            label="接口地址"
            rules={[{ required: true, message: '请输入接口地址' }, { type: 'url', message: '请输入有效的 URL' }]}
          >
            <Input maxLength={300} placeholder="https://api.openai.com/v1" />
          </Form.Item>
          <Form.Item name="apiKey" label="API Key" rules={[{ required: true, message: '请输入 API Key' }]}>
            <Input.Password maxLength={500} placeholder="sk-..." />
          </Form.Item>

          <Divider style={{ margin: '12px 0' }} />
          <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Space direction="vertical" size={2}>
              <Text strong>模型配置</Text>
              <Text type="secondary">
                模型顺序会作为同一 Provider 内的优先顺序；拉取模型会保留已有阶段配置并追加新模型。
              </Text>
            </Space>
            <Button
              size="small"
              icon={<CloudDownloadOutlined />}
              loading={fetchingModels}
              onClick={handleFetchModels}
            >
              拉取模型列表
            </Button>
          </div>

          <Form.List name="models">
            {(fields, { add, remove, move }) => (
              <>
                {fields.map(({ key, name, ...rest }, idx) => (
                  <Card
                    key={key}
                    size="small"
                    type="inner"
                    style={{ marginBottom: 8 }}
                    title={<Text strong>#{idx + 1}</Text>}
                    extra={(
                      <Space>
                        <Tooltip title="上移模型">
                          <Button
                            size="small"
                            icon={<ArrowUpOutlined />}
                            onClick={() => move(name, name - 1)}
                            disabled={idx === 0}
                          />
                        </Tooltip>
                        <Tooltip title="下移模型">
                          <Button
                            size="small"
                            icon={<ArrowDownOutlined />}
                            onClick={() => move(name, name + 1)}
                            disabled={idx === fields.length - 1}
                          />
                        </Tooltip>
                        {fields.length > 1 && (
                          <Tooltip title="删除模型">
                            <Button size="small" danger icon={<DeleteOutlined />} onClick={() => remove(name)} />
                          </Tooltip>
                        )}
                      </Space>
                    )}
                  >
                    <Form.Item
                      {...rest}
                      name={[name, 'name']}
                      label="模型名"
                      rules={[{ required: true, whitespace: true, message: '请输入模型名' }]}
                      style={{ marginBottom: 8 }}
                    >
                      <AutoComplete
                        options={autoCompleteOptions}
                        placeholder="如 gpt-4o、gpt-4o-mini、deepseek-chat"
                        filterOption={(inputValue, option) => String(option?.value || '')
                          .toLowerCase()
                          .includes(inputValue.toLowerCase())}
                      />
                    </Form.Item>
                    <Form.Item {...rest} name={[name, 'phases']} label="适用阶段" style={{ marginBottom: 0 }}>
                      <Checkbox.Group options={PHASE_OPTIONS} />
                    </Form.Item>
                  </Card>
                ))}
                <Button
                  type="dashed"
                  size="small"
                  onClick={() => add({ name: 'gpt-4o', phases: allPhaseValues })}
                  icon={<PlusOutlined />}
                >
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
