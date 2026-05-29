import React, { useEffect, useState } from 'react';
import { Card, Radio, Space, Typography, Tag, Divider, message, Spin, Alert, Button } from 'antd';
import { RobotOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { getAvailableModelsApi, updatePreferredModelApi } from '../../api/auth';
import { useAuthStore } from '../../store/authStore';
import type { SelectableModel } from '../../types';

const { Text, Title } = Typography;

const ModelPreference: React.FC = () => {
  const { user, token, setUser } = useAuthStore();
  const [models, setModels] = useState<SelectableModel[]>([]);
  const [canChoose, setCanChoose] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>(
    user?.preferredModel || '',
  );

  useEffect(() => {
    loadModels();
  }, []);

  const loadModels = async () => {
    try {
      const data = await getAvailableModelsApi();
      setModels(data.models || []);
      setCanChoose(data.canChoose);
    } catch {
      message.error('加载可选模型列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const result = await updatePreferredModelApi(selectedModel || null);
      if (token && result.user) {
        setUser(result.user, token);
      }
      message.success('模型偏好已保存');
    } catch (err: any) {
      message.error(err.response?.data?.error || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Spin />;

  if (!canChoose) {
    return (
      <Alert
        type="info"
        message="无权限"
        description="你的用户组不允许自定义模型选择，将使用管理员配置的默认优先级顺序。如需自定义，请联系管理员。"
      />
    );
  }

  return (
    <div>
      <Title level={5}><RobotOutlined /> 模型偏好</Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
        选择你希望优先使用的大模型。选择"默认"将按管理员配置的优先级顺序自动选择。
        若所选模型不可用（达Token上限等），系统将自动回退到默认顺序并通知你。
      </Text>
      <Divider />

      <Radio.Group
        value={selectedModel}
        onChange={e => setSelectedModel(e.target.value)}
        style={{ width: '100%' }}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          {/* "默认" 选项 */}
          <Card size="small" hoverable>
            <Radio value="">
              <Space>
                <Text strong>默认</Text>
                <Text type="secondary">按管理员设置的优先级顺序自动选择模型</Text>
              </Space>
            </Radio>
          </Card>

          {/* 按 Provider 分组展示模型 */}
          {models.map(provider => (
            <Card
              key={provider.providerName}
              size="small"
              title={<Text strong><ThunderboltOutlined /> {provider.providerName}</Text>}
            >
              {provider.models.map(m => {
                const modelKey = `${provider.providerName}::${m.name}`;
                return (
                  <Card
                    key={modelKey}
                    size="small"
                    type="inner"
                    style={{ marginBottom: 8 }}
                  >
                    <Radio value={modelKey}>
                      <Space>
                        <Text strong>{m.name}</Text>
                        {m.phases.map(p => (
                          <Tag key={p} color="blue">{p}</Tag>
                        ))}
                      </Space>
                    </Radio>
                  </Card>
                );
              })}
            </Card>
          ))}
        </Space>
      </Radio.Group>

      <Divider />
      <Button type="primary" onClick={handleSave} loading={saving}>
        保存偏好
      </Button>
    </div>
  );
};

export default ModelPreference;
