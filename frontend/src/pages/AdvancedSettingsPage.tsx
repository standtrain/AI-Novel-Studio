import React, { useState, useCallback } from 'react';
import { Tabs, Typography } from 'antd';
import { ExperimentOutlined, LinkOutlined, RobotOutlined, EditOutlined } from '@ant-design/icons';
import SkillsConfig from '../components/settings/SkillsConfig';
import McpConfig from '../components/settings/McpConfig';
import ModelPreference from '../components/settings/ModelPreference';
import GlobalPromptConfig from '../components/settings/GlobalPromptConfig';

const { Title } = Typography;

// Tab 懒渲染：仅在首次激活后渲染子组件，切换后保留已渲染的内容
const useLazyTabs = (defaultKey: string) => {
  const [activeKey, setActiveKey] = useState(defaultKey);
  const [renderedKeys, setRenderedKeys] = useState<Set<string>>(new Set([defaultKey]));

  const onChange = useCallback((key: string) => {
    setActiveKey(key);
    setRenderedKeys((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }, []);

  return { activeKey, renderedKeys, onChange };
};

const AdvancedSettingsPage: React.FC = () => {
  const { activeKey, renderedKeys, onChange } = useLazyTabs('skills');

  const tabItems = [
    {
      key: 'skills',
      label: <span><ExperimentOutlined /> Skills 提示词增强</span>,
      children: renderedKeys.has('skills') ? <SkillsConfig /> : null,
    },
    {
      key: 'mcp',
      label: <span><LinkOutlined /> MCP 工具连接</span>,
      children: renderedKeys.has('mcp') ? <McpConfig /> : null,
    },
    {
      key: 'model',
      label: <span><RobotOutlined /> 模型偏好</span>,
      children: renderedKeys.has('model') ? <ModelPreference /> : null,
    },
    {
      key: 'prompt',
      label: <span><EditOutlined /> 全局提示词</span>,
      children: renderedKeys.has('prompt') ? <GlobalPromptConfig /> : null,
    },
  ];

  return (
    <div>
      <Title level={4}>高级设置</Title>
      <Tabs activeKey={activeKey} onChange={onChange} items={tabItems} />
    </div>
  );
};

export default AdvancedSettingsPage;
