import React, { useState, useCallback } from 'react';
import { Tabs, Typography } from 'antd';
import { BarChartOutlined, TeamOutlined, SettingOutlined, ApiOutlined, BookOutlined, FolderOutlined, ThunderboltOutlined, LinkOutlined, StopOutlined, ShopOutlined, LockOutlined } from '@ant-design/icons';
import StatsPanel from '../components/admin/StatsPanel';
import UserTable from '../components/admin/UserTable';
import GroupManager from '../components/admin/GroupManager';
import ConfigForm from '../components/admin/ConfigForm';
import ProviderManager from '../components/admin/ProviderManager';
import NovelManager from '../components/admin/NovelManager';
import SkillsManager from '../components/admin/SkillsManager';
import McpServerManager from '../components/admin/McpServerManager';
import ModelTokenLimitManager from '../components/admin/ModelTokenLimitManager';
import TemplateReview from '../components/admin/TemplateReview';
import BanManager from '../components/admin/BanManager';
import { useAuthStore } from '../store/authStore';
import { Navigate } from 'react-router-dom';

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

const AdminPage: React.FC = () => {
  const user = useAuthStore((s) => s.user);
  const { activeKey, renderedKeys, onChange } = useLazyTabs('stats');

  if (user?.group?.name !== 'admin') {
    return <Navigate to="/dashboard" />;
  }

  const tabItems = [
    { key: 'stats', label: <span><BarChartOutlined /> 仪表盘</span>, children: renderedKeys.has('stats') ? <StatsPanel /> : null },
    { key: 'users', label: <span><TeamOutlined /> 用户管理</span>, children: renderedKeys.has('users') ? <UserTable /> : null },
    { key: 'groups', label: <span><FolderOutlined /> 分组管理</span>, children: renderedKeys.has('groups') ? <GroupManager /> : null },
    { key: 'novels', label: <span><BookOutlined /> 小说管理</span>, children: renderedKeys.has('novels') ? <NovelManager /> : null },
    { key: 'providers', label: <span><ApiOutlined /> 模型管理</span>, children: renderedKeys.has('providers') ? <ProviderManager /> : null },
    { key: 'token_limits', label: <span><StopOutlined /> Token 限额</span>, children: renderedKeys.has('token_limits') ? <ModelTokenLimitManager /> : null },
    { key: 'skills', label: <span><ThunderboltOutlined /> 技能管理</span>, children: renderedKeys.has('skills') ? <SkillsManager /> : null },
    { key: 'mcp', label: <span><LinkOutlined /> MCP 服务器</span>, children: renderedKeys.has('mcp') ? <McpServerManager /> : null },
    { key: 'config', label: <span><SettingOutlined /> 站点配置</span>, children: renderedKeys.has('config') ? <ConfigForm /> : null },
    { key: 'templates', label: <span><ShopOutlined /> 模板审核</span>, children: renderedKeys.has('templates') ? <TemplateReview /> : null },
    { key: 'bans', label: <span><LockOutlined /> 封禁管理</span>, children: renderedKeys.has('bans') ? <BanManager /> : null },
  ];

  return (
    <div>
      <Title level={4}>管理后台</Title>
      <Tabs activeKey={activeKey} onChange={onChange} items={tabItems} />
    </div>
  );
};

export default AdminPage;
