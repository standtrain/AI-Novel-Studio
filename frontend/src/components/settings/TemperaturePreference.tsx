import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, Divider, InputNumber, Slider, Space, Switch, Typography, message, Spin } from 'antd';
import { ClearOutlined, FireOutlined, SaveOutlined } from '@ant-design/icons';
import { getUserTemperatureConfigApi, saveUserTemperatureConfigApi } from '../../api/auth';
import type { UserPhaseTemperature } from '../../types';

const { Text, Title } = Typography;

const TemperaturePreference: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [phases, setPhases] = useState<UserPhaseTemperature[]>([]);
  const [overrides, setOverrides] = useState<Record<string, number | null>>({});
  const [dirty, setDirty] = useState<Record<string, number | null>>({});

  // 合并后的阶段列表（含当前有效值）
  const mergedPhases = useMemo(() => {
    return phases.map(p => ({
      ...p,
      overrideValue: dirty[p.phase] !== undefined ? dirty[p.phase] : (overrides[p.phase] ?? null),
    }));
  }, [phases, overrides, dirty]);

  // 加载配置
  useEffect(() => {
    (async () => {
      try {
        const data = await getUserTemperatureConfigApi();
        setPhases(data.phases.map(p => ({
          ...p,
          currentValue: data.overrides[p.phase] ?? null,
        })));
        setOverrides(data.overrides);
      } catch (err: any) {
        message.error(err.response?.data?.error || '加载温度配置失败');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // 修改某个阶段的温度
  const handleChange = useCallback((phase: string, value: number | null) => {
    setDirty(prev => ({ ...prev, [phase]: value }));
  }, []);

  // 切换是否使用自定义值
  const handleToggleCustom = useCallback((phase: string, enabled: boolean, defaultValue: number) => {
    setDirty(prev => ({
      ...prev,
      [phase]: enabled ? (prev[phase] ?? defaultValue) : null,
    }));
  }, []);

  // 保存
  const handleSave = async () => {
    setSaving(true);
    try {
      // 合并 dirty 到 overrides
      const configs: Record<string, number | null> = { ...overrides };
      for (const [phase, value] of Object.entries(dirty)) {
        configs[phase] = value;
      }
      const result = await saveUserTemperatureConfigApi(configs);
      setOverrides(result.overrides);
      setDirty({});
      message.success('温度配置已保存');
    } catch (err: any) {
      message.error(err.response?.data?.error || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  // 全部恢复默认
  const handleResetAll = () => {
    const reset: Record<string, null> = {};
    for (const p of phases) {
      reset[p.phase] = null;
    }
    setDirty(reset);
  };

  // 判断是否有修改
  const hasChanges = Object.keys(dirty).length > 0;

  const effectiveValue = (phase: UserPhaseTemperature): number => {
    const dv = dirty[phase.phase];
    if (dv !== undefined) return dv ?? phase.defaultValue;
    const ov = overrides[phase.phase];
    if (ov !== undefined && ov !== null) return ov;
    return phase.defaultValue;
  };

  const isCustomized = (phase: UserPhaseTemperature): boolean => {
    const dv = dirty[phase.phase];
    if (dv !== undefined) return dv !== null;
    return overrides[phase.phase] !== undefined;
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 40 }}><Spin tip="加载温度配置..." /></div>;
  }

  // 按类别分组
  const creativePhases = mergedPhases.filter(p => p.phase !== 'template');
  const otherPhases = mergedPhases.filter(p => p.phase === 'template');

  return (
    <div>
      <Space align="center" style={{ marginBottom: 12 }}>
        <FireOutlined style={{ color: '#f59e0b' }} />
        <Title level={5} style={{ margin: 0 }}>创作温度</Title>
        <Text type="secondary" style={{ fontSize: 12 }}>
          为每个创作阶段单独设置温度值，留空则使用系统默认
        </Text>
      </Space>

      <Card size="small" style={{ marginBottom: 16 }}>
        {creativePhases.map(item => {
          const val = effectiveValue(item);
          const customized = isCustomized(item);
          return (
            <div key={item.phase} style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <Space size={8}>
                  <Text strong style={{ fontSize: 13 }}>{item.label}</Text>
                  <Text type="secondary" style={{ fontSize: 11 }}>默认 {item.defaultValue.toFixed(2)}</Text>
                  {customized && <Text style={{ color: '#f59e0b', fontSize: 11 }}>已自定义</Text>}
                </Space>
                <Space size={8}>
                  <Switch
                    size="small"
                    checked={customized}
                    onChange={(enabled) => handleToggleCustom(item.phase, enabled, item.defaultValue)}
                  />
                  <InputNumber
                    min={0}
                    max={2}
                    step={0.05}
                    size="small"
                    style={{ width: 72 }}
                    value={val}
                    disabled={!customized}
                    onChange={(v) => handleChange(item.phase, typeof v === 'number' ? v : null)}
                  />
                </Space>
              </div>
              <Slider
                min={0}
                max={2}
                step={0.05}
                value={val}
                disabled={!customized}
                onChange={(v) => handleChange(item.phase, v as number)}
                tooltip={{ formatter: (v) => v?.toFixed(2) }}
              />
            </div>
          );
        })}
      </Card>

      {otherPhases.length > 0 && (
        <>
          <Divider style={{ margin: '12px 0' }} />
          <Text type="secondary" style={{ fontSize: 12, marginBottom: 8, display: 'block' }}>其他</Text>
          <Card size="small" style={{ marginBottom: 16 }}>
            {otherPhases.map(item => {
              const val = effectiveValue(item);
              const customized = isCustomized(item);
              return (
                <div key={item.phase} style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <Space size={8}>
                      <Text strong style={{ fontSize: 13 }}>{item.label}</Text>
                      <Text type="secondary" style={{ fontSize: 11 }}>默认 {item.defaultValue.toFixed(2)}</Text>
                      {customized && <Text style={{ color: '#f59e0b', fontSize: 11 }}>已自定义</Text>}
                    </Space>
                    <Space size={8}>
                      <Switch
                        size="small"
                        checked={customized}
                        onChange={(enabled) => handleToggleCustom(item.phase, enabled, item.defaultValue)}
                      />
                      <InputNumber
                        min={0}
                        max={2}
                        step={0.05}
                        size="small"
                        style={{ width: 72 }}
                        value={val}
                        disabled={!customized}
                        onChange={(v) => handleChange(item.phase, typeof v === 'number' ? v : null)}
                      />
                    </Space>
                  </div>
                  <Slider
                    min={0}
                    max={2}
                    step={0.05}
                    value={val}
                    disabled={!customized}
                    onChange={(v) => handleChange(item.phase, v as number)}
                    tooltip={{ formatter: (v) => v?.toFixed(2) }}
                  />
                </div>
              );
            })}
          </Card>
        </>
      )}

      <Space>
        <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving} disabled={!hasChanges}>
          保存配置
        </Button>
        <Button icon={<ClearOutlined />} onClick={handleResetAll} disabled={!hasChanges && Object.keys(overrides).length === 0}>
          全部恢复默认
        </Button>
      </Space>
    </div>
  );
};

export default TemperaturePreference;
