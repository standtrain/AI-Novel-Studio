import React, { useState, useCallback } from 'react';
import { Tabs, Typography, Input } from 'antd';
import { BarChartOutlined, TeamOutlined, SettingOutlined, ApiOutlined, BookOutlined, FolderOutlined, ThunderboltOutlined, LinkOutlined, StopOutlined, ShopOutlined, LockOutlined, SearchOutlined } from '@ant-design/icons';
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
  const [searchTerm, setSearchTerm] = useState('');

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
    { key: 'config', label: <span><SettingOutlined /> 站点配置</span>, children: renderedKeys.has('config') ? <ConfigForm searchTerm={searchTerm} /> : null },
    { key: 'templates', label: <span><ShopOutlined /> 模板审核</span>, children: renderedKeys.has('templates') ? <TemplateReview /> : null },
    { key: 'bans', label: <span><LockOutlined /> 封禁管理</span>, children: renderedKeys.has('bans') ? <BanManager /> : null },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <Title level={4} style={{ margin: 0 }}>管理后台</Title>
        <Input
          prefix={<SearchOutlined style={{ color: '#64748b' }} />}
          placeholder="搜索配置项（名称或描述）..."
          value={searchTerm}
          onChange={(e) => { setSearchTerm(e.target.value); if (e.target.value.trim()) onChange('config'); }}
          allowClear
          style={{
            width: 320,
            background: 'rgba(15,23,42,0.5)',
            borderColor: 'rgba(99,102,241,0.3)',
            color: '#f1f5f9',
            borderRadius: 10,
            height: 40,
          }}
        />
      </div>
      <Tabs activeKey={activeKey} onChange={onChange} items={tabItems} />
    </div>
  );
};

export default AdminPage;
