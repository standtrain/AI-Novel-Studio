import React, { useEffect, useState } from 'react';
import { Card, Switch, Typography, Tag, Collapse, Input, Button, message, Space, Spin } from 'antd';
import { ExperimentOutlined } from '@ant-design/icons';
import { getUserSkillsApi, toggleSkillApi, updateSkillParamsApi, UserSkill } from '../../api/skills';

const { Text, Paragraph } = Typography;

const phaseLabels: Record<string, string> = {
  all: '全部阶段',
  outline: '整书大纲',
  characters: '人物设定',
  chapters_outline: '章节大纲',
  write_chapter: '章节写作',
};

const phaseColors: Record<string, string> = {
  all: 'purple',
  outline: 'blue',
  characters: 'green',
  chapters_outline: 'orange',
  write_chapter: 'red',
};

const SkillsConfig: React.FC = () => {
  const [skills, setSkills] = useState<UserSkill[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);

  const loadSkills = async () => {
    setLoading(true);
    try {
      const { skills } = await getUserSkillsApi();
      setSkills(skills);
    } catch {
      message.error('获取技能列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadSkills(); }, []);

  const handleToggle = async (skillId: number, enabled: boolean) => {
    setSavingId(skillId);
    try {
      await toggleSkillApi(skillId, enabled);
      setSkills(prev => prev.map(s => s.id === skillId ? { ...s, user_enabled: enabled } : s));
    } catch {
      message.error('切换失败');
    } finally {
      setSavingId(null);
    }
  };

  const handleSaveParams = async (skillId: number, params: Record<string, any>) => {
    setSavingId(skillId);
    try {
      await updateSkillParamsApi(skillId, params);
      setSkills(prev => prev.map(s => s.id === skillId ? { ...s, user_parameters: params } : s));
      message.success('参数已保存');
    } catch {
      message.error('保存参数失败');
    } finally {
      setSavingId(null);
    }
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>;
  }

  if (skills.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
        <ExperimentOutlined style={{ fontSize: 48, marginBottom: 16 }} />
        <p>暂无可用技能</p>
        <Text type="secondary">请联系管理员在后台添加技能模板</Text>
      </div>
    );
  }

  return (
    <div>
      <Paragraph type="secondary" style={{ marginBottom: 16 }}>
        技能是模块化的提示词增强模板，启用后可增强 AI 在特定写作阶段的表现。您可以根据需要开关和调整参数。
      </Paragraph>
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        {skills.map(skill => {
          const isEnabled = skill.user_enabled !== false && skill.enabled;
          return (
            <Card
              key={skill.id}
              size="small"
              title={
                <Space>
                  <ExperimentOutlined />
                  <span>{skill.display_name}</span>
                  <Tag color={phaseColors[skill.phase]}>{phaseLabels[skill.phase] || skill.phase}</Tag>
                  {!skill.enabled && <Tag color="red">管理员已禁用</Tag>}
                </Space>
              }
              extra={
                <Switch
                  checked={isEnabled}
                  disabled={!skill.enabled || savingId === skill.id}
                  loading={savingId === skill.id}
                  onChange={(v) => handleToggle(skill.id, v)}
                />
              }
              styles={{ body: { padding: '12px 24px' } }}
            >
              <Text type="secondary">{skill.description}</Text>
              {skill.parameters_schema && skill.parameters_schema.properties && (
                <Collapse
                  ghost
                  size="small"
                  items={[{
                    key: 'params',
                    label: '参数配置',
                    children: <SkillParamsForm
                      skill={skill}
                      onSave={(params) => handleSaveParams(skill.id, params)}
                    />,
                  }]}
                />
              )}
            </Card>
          );
        })}
      </Space>
    </div>
  );
};

// 参数表单子组件
const SkillParamsForm: React.FC<{
  skill: UserSkill;
  onSave: (params: Record<string, any>) => void;
}> = ({ skill, onSave }) => {
  const schema = skill.parameters_schema;
  const [params, setParams] = useState<Record<string, any>>(skill.user_parameters || {});

  if (!schema || !schema.properties) return null;

  const properties = schema.properties || {};

  const getDefaultValue = (key: string, prop: any) => {
    if (params[key] !== undefined) return params[key];
    if (prop.default !== undefined) return prop.default;
    return '';
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      {Object.keys(properties).map(key => {
        const prop = properties[key];
        return (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Text style={{ minWidth: 120, textAlign: 'right' }}>{prop.title || key}：</Text>
            {prop.enum ? (
              <select
                value={getDefaultValue(key, prop)}
                onChange={(e) => setParams(prev => ({ ...prev, [key]: e.target.value }))}
                style={{ flex: 1, padding: '4px 8px', background: 'rgba(15,23,42,0.8)', color: '#f1f5f9', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 6 }}
              >
                {prop.enum.map((v: string) => <option key={v} value={v}>{v}</option>)}
              </select>
            ) : (
              <Input
                value={getDefaultValue(key, prop)}
                onChange={(e) => setParams(prev => ({ ...prev, [key]: e.target.value }))}
                style={{ flex: 1 }}
                placeholder={prop.description || ''}
              />
            )}
          </div>
        );
      })}
      <Button type="primary" size="small" onClick={() => onSave(params)}>保存参数</Button>
    </Space>
  );
};

export default SkillsConfig;
