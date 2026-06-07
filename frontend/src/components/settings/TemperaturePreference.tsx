import React, { useMemo, useState } from 'react';
import { Button, Card, InputNumber, Radio, Slider, Space, Typography, message } from 'antd';
import { CheckOutlined, FireOutlined, SaveOutlined } from '@ant-design/icons';
import { updateTemperaturePreferenceApi } from '../../api/auth';
import { useAuthStore } from '../../store/authStore';
import type { TemperaturePreset } from '../../types';

const { Text, Title } = Typography;

const PRESETS: Array<{
  key: TemperaturePreset;
  label: string;
  value: number;
  desc: string;
}> = [
  { key: 'precise', label: '稳健', value: 0.35, desc: '设定更稳，逻辑更紧' },
  { key: 'balanced', label: '均衡', value: 0.7, desc: '默认推荐，兼顾稳定与想象力' },
  { key: 'creative', label: '发散', value: 0.9, desc: '表达更鲜活，转折更大胆' },
  { key: 'wild', label: '大胆', value: 1.1, desc: '更适合脑洞、强风格和实验写法' },
  { key: 'custom', label: '自定义', value: 0.7, desc: '手动设置创作温度' },
];

const TemperaturePreference: React.FC = () => {
  const { user, token, setUser } = useAuthStore();
  const [preset, setPreset] = useState<TemperaturePreset>(user?.temperaturePreset || 'balanced');
  const [customTemperature, setCustomTemperature] = useState<number>(user?.customTemperature ?? 0.7);
  const [saving, setSaving] = useState(false);

  const effectiveTemperature = useMemo(() => {
    if (preset === 'custom') return customTemperature;
    return PRESETS.find(item => item.key === preset)?.value ?? 0.7;
  }, [customTemperature, preset]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const result = await updateTemperaturePreferenceApi(preset, preset === 'custom' ? customTemperature : null);
      if (token && result.user) {
        setUser(result.user, token);
      }
      message.success('创作温度已保存');
    } catch (err: any) {
      message.error(err.response?.data?.error || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <Space align="center" style={{ marginBottom: 12 }}>
        <FireOutlined style={{ color: '#f59e0b' }} />
        <Title level={5} style={{ margin: 0 }}>创作温度</Title>
      </Space>

      <Radio.Group
        value={preset}
        onChange={event => setPreset(event.target.value)}
        style={{ width: '100%' }}
      >
        <div className="temperature-preset-grid">
          {PRESETS.map(item => {
            const selected = preset === item.key;
            return (
              <label
                key={item.key}
                className={`temperature-preset-card${selected ? ' is-selected' : ''}`}
              >
                <Radio value={item.key} className="temperature-preset-radio" />
                <span className="temperature-preset-main">
                  <span className="temperature-preset-title">
                    <Text strong>{item.label}</Text>
                    <Text type="secondary">{item.key === 'custom' ? '手动' : item.value.toFixed(2)}</Text>
                  </span>
                  <Text type="secondary">{item.desc}</Text>
                </span>
                {selected && <CheckOutlined className="temperature-preset-check" />}
              </label>
            );
          })}
        </div>
      </Radio.Group>

      <Card size="small" className="temperature-custom-panel">
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
            <Text strong>当前温度：{effectiveTemperature.toFixed(2)}</Text>
            <InputNumber
              min={0}
              max={2}
              step={0.05}
              value={preset === 'custom' ? customTemperature : effectiveTemperature}
              disabled={preset !== 'custom'}
              onChange={value => setCustomTemperature(typeof value === 'number' ? value : 0.7)}
            />
          </Space>
          <Slider
            min={0}
            max={2}
            step={0.05}
            value={preset === 'custom' ? customTemperature : effectiveTemperature}
            disabled={preset !== 'custom'}
            onChange={setCustomTemperature}
            marks={{ 0: '0', 0.7: '0.7', 1.1: '1.1', 2: '2' }}
          />
        </Space>
      </Card>

      <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving}>
        保存温度
      </Button>
    </div>
  );
};

export default TemperaturePreference;
