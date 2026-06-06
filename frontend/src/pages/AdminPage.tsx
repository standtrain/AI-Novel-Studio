import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Tabs, Typography, Input, List, Tag, Button, message } from 'antd';
import { BarChartOutlined, TeamOutlined, SettingOutlined, ApiOutlined, BookOutlined, FolderOutlined, ThunderboltOutlined, LinkOutlined, StopOutlined, ShopOutlined, LockOutlined, SearchOutlined, EditOutlined } from '@ant-design/icons';
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
import { getConfigsApi } from '../api/admin';
import { useAuthStore } from '../store/authStore';
import { Navigate } from 'react-router-dom';

const { Title, Text } = Typography;

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

const BOOLEAN_KEYS = ['allow_registration', 'cors_enabled', 'captcha_enabled', 'email_verification_enabled', 'email_domain_whitelist_enabled'];

const AdminPage: React.FC = () => {
  const user = useAuthStore((s) => s.user);
  const { activeKey, renderedKeys, onChange } = useLazyTabs('stats');
  const [searchTerm, setSearchTerm] = useState('');
  const [configs, setConfigs] = useState<any[]>([]);
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => { loadConfigs(); }, []);

  // 点击外部关闭搜索结果
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const loadConfigs = async () => {
    try {
      const data = await getConfigsApi();
      setConfigs(data.configs || []);
    } catch { /* 静默失败 */ }
  };

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setShowResults(!!value.trim());
  };

  const filteredConfigs = searchTerm.trim()
    ? configs.filter(c => {
        const term = searchTerm.toLowerCase();
        const key = (c.config_key || '').toLowerCase();
        const desc = (c.description || '').toLowerCase();
        const val = (c.config_value || '').toLowerCase();
        return key.includes(term) || desc.includes(term) || val.includes(term);
      })
    : [];

  const handleResultClick = (configKey: string) => {
    setShowResults(false);
    onChange('config');
  };

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
      <div ref={searchRef} style={{ position: 'relative', marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <Title level={4} style={{ margin: 0 }}>管理后台</Title>
          <Input
            prefix={<SearchOutlined style={{ color: '#64748b' }} />}
            placeholder="搜索配置项（名称或描述）..."
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
            onFocus={() => { if (searchTerm.trim()) setShowResults(true); }}
            allowClear
            style={{
              width: 320,
              background: 'rgba(15,23,42,0.5)',
              borderColor: showResults ? '#6366f1' : 'rgba(99,102,241,0.3)',
              color: '#f1f5f9',
              borderRadius: 10,
              height: 40,
            }}
          />
        </div>

        {/* 搜索结果下拉面板 */}
        {showResults && searchTerm.trim() && (
          <div style={{
            position: 'absolute',
            top: 56,
            right: 0,
            width: 480,
            maxHeight: 420,
            overflow: 'auto',
            background: 'rgba(15,23,42,0.98)',
            border: '1px solid rgba(99,102,241,0.35)',
            borderRadius: 12,
            boxShadow: '0 16px 48px rgba(0,0,0,0.6), 0 0 24px rgba(99,102,241,0.15)',
            zIndex: 1000,
            backdropFilter: 'blur(12px)',
          }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(99,102,241,0.15)' }}>
              <Text style={{ color: '#94a3b8', fontSize: 12 }}>
                找到 <Text strong style={{ color: '#a5b4fc' }}>{filteredConfigs.length}</Text> 项配置
              </Text>
            </div>
            {filteredConfigs.length === 0 ? (
              <div style={{ padding: '24px 16px', textAlign: 'center' }}>
                <Text style={{ color: '#64748b' }}>无匹配结果</Text>
              </div>
            ) : (
              <List
                dataSource={filteredConfigs}
                renderItem={(item: any) => {
                  const displayValue = BOOLEAN_KEYS.includes(item.config_key)
                    ? (item.config_value === 'true' ? '已开启' : '已关闭')
                    : (item.config_value || '(空)');
                  const isBoolean = BOOLEAN_KEYS.includes(item.config_key);
                  return (
                    <List.Item
                      onClick={() => handleResultClick(item.config_key)}
                      style={{
                        padding: '10px 16px',
                        cursor: 'pointer',
                        borderBottom: '1px solid rgba(99,102,241,0.08)',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(99,102,241,0.08)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <div style={{ width: '100%' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Text code style={{ fontSize: 12, color: '#a5b4fc' }}>{item.config_key}</Text>
                          <Tag style={{
                            fontSize: 11,
                            background: isBoolean
                              ? (item.config_value === 'true' ? 'rgba(52,211,153,0.15)' : 'rgba(100,116,139,0.12)')
                              : 'rgba(99,102,241,0.1)',
                            border: 'none',
                            color: isBoolean
                              ? (item.config_value === 'true' ? '#34d399' : '#64748b')
                              : '#94a3b8',
                            maxWidth: 200,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}>
                            {displayValue}
                          </Tag>
                        </div>
                        <Text style={{ color: '#64748b', fontSize: 11, display: 'block', marginTop: 2 }}>
                          {item.description}
                        </Text>
                      </div>
                    </List.Item>
                  );
                }}
              />
            )}
            <div style={{ padding: '8px 16px', borderTop: '1px solid rgba(99,102,241,0.12)', textAlign: 'center' }}>
              <Button
                type="link"
                size="small"
                icon={<EditOutlined />}
                onClick={() => { setShowResults(false); onChange('config'); }}
                style={{ color: '#818cf8', fontSize: 12 }}
              >
                前往站点配置编辑
              </Button>
            </div>
          </div>
        )}
      </div>
      <Tabs activeKey={activeKey} onChange={onChange} items={tabItems} />
    </div>
  );
};

export default AdminPage;
