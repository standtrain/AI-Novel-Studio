import React, { useEffect, useState } from 'react';
import {
  Card, Table, Button, Modal, Form, InputNumber, Space,
  Typography, App, Popconfirm, Tag, Switch, Row, Col, Select,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, StopOutlined } from '@ant-design/icons';
import {
  getModelTokenLimitsApi, saveModelTokenLimitApi, deleteModelTokenLimitApi,
  getProvidersApi,
} from '../../api/admin';

const { Text } = Typography;

interface TokenLimit {
  id: number;
  provider_name: string;
  model_name: string;
  daily_limit: number;
  monthly_limit: number;
  daily_used: number;
  monthly_used: number;
  enabled: boolean;
}

interface ProviderOption {
  name: string;
  models: { name: string }[];
}

const ModelTokenLimitManager: React.FC = () => {
  const { message } = App.useApp();
  const [limits, setLimits] = useState<TokenLimit[]>([]);
  const [loading, setLoading] = useState(false);

  // Provider 列表（用于下拉选择）
  const [providerOptions, setProviderOptions] = useState<ProviderOption[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editLimit, setEditLimit] = useState<TokenLimit | null>(null);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  // 当前选中的 Provider（用于联动模型下拉）
  const [selectedProvider, setSelectedProvider] = useState<string>('');

  useEffect(() => {
    loadLimits();
    loadProviders();
  }, []);

  const loadProviders = async () => {
    try {
      const data = await getProvidersApi();
      setProviderOptions(data.providers || []);
    } catch {
      // 静默失败，不影响主功能
    }
  };

  const loadLimits = async () => {
    setLoading(true);
    try {
      const data = await getModelTokenLimitsApi();
      setLimits(data.limits || []);
    } catch {
      message.error('加载 Token 限额失败');
    } finally {
      setLoading(false);
    }
  };

  // 当前选中 Provider 的模型列表
  const currentModels = providerOptions.find(p => p.name === selectedProvider)?.models || [];

  const openModal = (limit?: TokenLimit) => {
    if (limit) {
      setEditLimit(limit);
      setSelectedProvider(limit.provider_name);
      form.setFieldsValue({
        providerName: limit.provider_name,
        modelName: limit.model_name,
        dailyLimit: limit.daily_limit,
        monthlyLimit: limit.monthly_limit,
        enabled: !!limit.enabled,
      });
    } else {
      setEditLimit(null);
      setSelectedProvider('');
      form.resetFields();
    }
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      await saveModelTokenLimitApi({
        providerName: values.providerName,
        modelName: values.modelName,
        dailyLimit: values.dailyLimit ?? 0,
        monthlyLimit: values.monthlyLimit ?? 0,
        enabled: values.enabled,
      });
      message.success('限额配置已保存');
      setModalOpen(false);
      loadLimits();
    } catch (err: any) {
      if (err.errorFields) return;
      message.error(err.response?.data?.error || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteModelTokenLimitApi(id);
      message.success('已删除');
      setLimits(limits.filter(l => l.id !== id));
    } catch (err: any) {
      message.error(err.response?.data?.error || '删除失败');
    }
  };

  const columns = [
    { title: 'Provider', dataIndex: 'provider_name', key: 'provider_name', width: 120 },
    { title: '模型', dataIndex: 'model_name', key: 'model_name', width: 160 },
    {
      title: '每日用量', key: 'daily', width: 180,
      render: (_: any, r: TokenLimit) => {
        const pct = r.daily_limit > 0 ? Math.round((r.daily_used / r.daily_limit) * 100) : 0;
        return (
          <Space>
            <Text>{r.daily_used.toLocaleString()}</Text>
            <Text type="secondary">/</Text>
            <Text>{r.daily_limit > 0 ? r.daily_limit.toLocaleString() : '不限'}</Text>
            {pct >= 80 && <Tag color={pct >= 100 ? 'red' : 'orange'}>{pct}%</Tag>}
          </Space>
        );
      },
    },
    {
      title: '每月用量', key: 'monthly', width: 180,
      render: (_: any, r: TokenLimit) => {
        const pct = r.monthly_limit > 0 ? Math.round((r.monthly_used / r.monthly_limit) * 100) : 0;
        return (
          <Space>
            <Text>{r.monthly_used.toLocaleString()}</Text>
            <Text type="secondary">/</Text>
            <Text>{r.monthly_limit > 0 ? r.monthly_limit.toLocaleString() : '不限'}</Text>
            {pct >= 80 && <Tag color={pct >= 100 ? 'red' : 'orange'}>{pct}%</Tag>}
          </Space>
        );
      },
    },
    {
      title: '启用', dataIndex: 'enabled', key: 'enabled', width: 70,
      render: (v: boolean) => v ? <Tag color="green">是</Tag> : <Tag color="red">否</Tag>,
    },
    {
      title: '操作', key: 'action', width: 120,
      render: (_: any, r: TokenLimit) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openModal(r)}>编辑</Button>
          <Popconfirm title="确认删除？" onConfirm={() => handleDelete(r.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space>
          <StopOutlined />
          <Text strong style={{ fontSize: 16 }}>模型 Token 限额</Text>
          <Text type="secondary">（{limits.length} 条规则）</Text>
        </Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>
          添加限额
        </Button>
      </div>

      <Card size="small">
        {limits.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}>
            暂无限额配置。添加限额后，可限制每个模型的每日/每月最大 Token 用量。
            <br />
            0 表示不限制。达到上限时系统将自动切换到下一优先级的模型。
          </div>
        ) : (
          <Table
            columns={columns}
            dataSource={limits}
            rowKey="id"
            loading={loading}
            size="small"
            pagination={false}
          />
        )}
      </Card>

      <Modal
        title={editLimit ? '编辑 Token 限额' : '添加 Token 限额'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        confirmLoading={saving}
        width={480}
        forceRender
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="providerName" label="Provider" rules={[{ required: true, message: '请选择' }]}>
                <Select
                  placeholder="选择 Provider"
                  onChange={val => {
                    setSelectedProvider(val);
                    // 切换 Provider 时清空模型选择
                    form.setFieldValue('modelName', undefined);
                  }}
                  options={providerOptions.map(p => ({
                    label: p.name,
                    value: p.name,
                  }))}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="modelName" label="模型" rules={[{ required: true, message: '请选择' }]}>
                <Select
                  placeholder={selectedProvider ? '选择模型' : '请先选 Provider'}
                  disabled={!selectedProvider}
                  options={currentModels.map(m => ({
                    label: m.name,
                    value: m.name,
                  }))}
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="dailyLimit" label="每日上限" tooltip="0 = 不限制">
                <InputNumber min={0} style={{ width: '100%' }} placeholder="0" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="monthlyLimit" label="每月上限" tooltip="0 = 不限制">
                <InputNumber min={0} style={{ width: '100%' }} placeholder="0" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="enabled" label="启用" valuePropName="checked" initialValue={true}>
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ModelTokenLimitManager;
