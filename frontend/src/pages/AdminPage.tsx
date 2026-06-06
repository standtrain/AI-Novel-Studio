import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Tabs, Typography, Input, List, Tag, Button, message, Divider } from 'antd';
import { BarChartOutlined, TeamOutlined, SettingOutlined, ApiOutlined, BookOutlined, FolderOutlined, ThunderboltOutlined, LinkOutlined, StopOutlined, ShopOutlined, LockOutlined, SearchOutlined, UserOutlined, FileTextOutlined, ToolOutlined } from '@ant-design/icons';
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
import { adminSearchApi, AdminSearchResult } from '../api/admin';
import { useAuthStore } from '../store/authStore';
import { Navigate } from 'react-router-dom';

const { Title, Text } = Typography;

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

const statusColorMap: Record<string, string> = {
  active: '#34d399', disabled: '#f87171', banned: '#f87171',
  draft: '#64748b', writing: '#fbbf24', completed: '#34d399', paused: '#f59e0b',
};

const statusLabelMap: Record<string, string> = {
  active: '正常', disabled: '已禁用', banned: '已封禁',
  draft: '草稿', writing: '写作中', completed: '已完成', paused: '已暂停',
};

const AdminPage: React.FC = () => {
  const user = useAuthStore((s) => s.user);
  const { activeKey, renderedKeys, onChange } = useLazyTabs('stats');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResult, setSearchResult] = useState<AdminSearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

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

  const doSearch = async (q: string) => {
    if (!q.trim()) { setSearchResult(null); return; }
    setSearching(true);
    try {
      const result = await adminSearchApi(q.trim());
      setSearchResult(result);
    } catch { setSearchResult(null); }
    finally { setSearching(false); }
  };

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    clearTimeout(timerRef.current);
    if (!value.trim()) {
      setSearchResult(null);
      setShowResults(false);
      return;
    }
    setShowResults(true);
    timerRef.current = setTimeout(() => doSearch(value), 300);
  };

  const totalHits = searchResult
    ? searchResult.users.length + searchResult.novels.length + searchResult.configs.length
    : 0;

  // 点击搜索结果跳转到对应 tab
  const handleResultClick = (_type: string) => {
    setShowResults(false);
    if (_type === 'user') onChange('users');
    else if (_type === 'novel') onChange('novels');
    else if (_type === 'config') onChange('config');
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
    { key: 'config', label: <span><SettingOutlined /> 站点配置</span>, children: renderedKeys.has('config') ? <ConfigForm searchTerm="" /> : null },
    { key: 'templates', label: <span><ShopOutlined /> 模板审核</span>, children: renderedKeys.has('templates') ? <TemplateReview /> : null },
    { key: 'bans', label: <span><LockOutlined /> 封禁管理</span>, children: renderedKeys.has('bans') ? <BanManager /> : null },
  ];

  return (
    <div>
      <div ref={searchRef} style={{ position: 'relative', marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <Title level={4} style={{ margin: 0 }}>管理后台</Title>
          <Input.Search
            prefix={<SearchOutlined style={{ color: '#64748b' }} />}
            placeholder="全局搜索（用户、小说、配置）..."
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
            onFocus={() => { if (searchTerm.trim()) setShowResults(true); }}
            onSearch={(v) => doSearch(v)}
            loading={searching}
            allowClear
            style={{ width: 360 }}
          />
        </div>

        {/* 全局搜索结果下拉面板 */}
        {showResults && searchTerm.trim() && (
          <div style={{
            position: 'absolute',
            top: 56,
            right: 0,
            width: 520,
            maxHeight: 480,
            overflow: 'auto',
            background: 'rgba(15,23,42,0.98)',
            border: '1px solid rgba(99,102,241,0.35)',
            borderRadius: 12,
            boxShadow: '0 16px 48px rgba(0,0,0,0.6), 0 0 24px rgba(99,102,241,0.15)',
            zIndex: 1000,
            backdropFilter: 'blur(12px)',
          }}>
            <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(99,102,241,0.15)' }}>
              <Text style={{ color: '#94a3b8', fontSize: 12 }}>
                {searching ? '搜索中...' : <>找到 <Text strong style={{ color: '#a5b4fc' }}>{totalHits}</Text> 项结果（用户、小说、配置）</>}
              </Text>
            </div>
            {!searchResult || totalHits === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center' }}>
                <Text style={{ color: '#64748b' }}>{searching ? '...' : '无匹配结果'}</Text>
              </div>
            ) : (
              <>
                {/* 用户 */}
                {searchResult.users.length > 0 && (
                  <>
                    <div style={{ padding: '8px 16px', background: 'rgba(99,102,241,0.06)' }}>
                      <Text style={{ color: '#818cf8', fontSize: 11, fontWeight: 600 }}>
                        <TeamOutlined style={{ marginRight: 6 }} />用户
                      </Text>
                    </div>
                    <List
                      dataSource={searchResult.users}
                      renderItem={(item: any) => (
                        <List.Item onClick={() => handleResultClick('user')} style={resultItemStyle}>
                          <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <Text style={{ color: '#f1f5f9', fontSize: 13 }}>{item.username}</Text>
                              <Text style={{ color: '#64748b', fontSize: 11, marginLeft: 8 }}>{item.email}</Text>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <Tag style={{ fontSize: 10, background: 'rgba(99,102,241,0.1)', border: 'none', color: '#a5b4fc' }}>
                                {item.group_name || '默认'}
                              </Tag>
                              <Tag style={{
                                fontSize: 10, border: 'none',
                                background: `${statusColorMap[item.status] || '#64748b'}22`,
                                color: statusColorMap[item.status] || '#64748b',
                              }}>
                                {statusLabelMap[item.status] || item.status}
                              </Tag>
                            </div>
                          </div>
                        </List.Item>
                      )}
                    />
                  </>
                )}

                {/* 小说 */}
                {searchResult.novels.length > 0 && (
                  <>
                    <div style={{ padding: '8px 16px', background: 'rgba(99,102,241,0.06)' }}>
                      <Text style={{ color: '#818cf8', fontSize: 11, fontWeight: 600 }}>
                        <BookOutlined style={{ marginRight: 6 }} />小说
                      </Text>
                    </div>
                    <List
                      dataSource={searchResult.novels}
                      renderItem={(item: any) => (
                        <List.Item onClick={() => handleResultClick('novel')} style={resultItemStyle}>
                          <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <Text style={{ color: '#f1f5f9', fontSize: 13 }}>{item.title}</Text>
                              <Text style={{ color: '#64748b', fontSize: 11, marginLeft: 8 }}>by {item.author}</Text>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              {item.genre && <Tag style={{ fontSize: 10, background: 'rgba(99,102,241,0.1)', border: 'none', color: '#a5b4fc' }}>{item.genre}</Tag>}
                              <Tag style={{
                                fontSize: 10, border: 'none',
                                background: `${statusColorMap[item.status] || '#64748b'}22`,
                                color: statusColorMap[item.status] || '#64748b',
                              }}>
                                {statusLabelMap[item.status] || item.status}
                              </Tag>
                            </div>
                          </div>
                        </List.Item>
                      )}
                    />
                  </>
                )}

                {/* 配置项 */}
                {searchResult.configs.length > 0 && (
                  <>
                    <div style={{ padding: '8px 16px', background: 'rgba(99,102,241,0.06)' }}>
                      <Text style={{ color: '#818cf8', fontSize: 11, fontWeight: 600 }}>
                        <SettingOutlined style={{ marginRight: 6 }} />配置项
                      </Text>
                    </div>
                    <List
                      dataSource={searchResult.configs}
                      renderItem={(item: any) => {
                        const displayValue = BOOLEAN_KEYS.includes(item.config_key)
                          ? (item.config_value === 'true' ? '已开启' : '已关闭')
                          : (item.config_value || '(空)');
                        return (
                          <List.Item onClick={() => handleResultClick('config')} style={resultItemStyle}>
                            <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <Text code style={{ fontSize: 11, color: '#a5b4fc' }}>{item.config_key}</Text>
                                <Text style={{ color: '#64748b', fontSize: 11, display: 'block', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.description}</Text>
                              </div>
                              <Tag style={{
                                fontSize: 10, border: 'none', marginLeft: 8, flexShrink: 0, maxWidth: 140,
                                overflow: 'hidden', textOverflow: 'ellipsis',
                                background: 'rgba(100,116,139,0.12)', color: '#94a3b8',
                              }}>
                                {displayValue}
                              </Tag>
                            </div>
                          </List.Item>
                        );
                      }}
                    />
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>
      <Tabs activeKey={activeKey} onChange={onChange} items={tabItems} />
    </div>
  );
};

const resultItemStyle: React.CSSProperties = {
  padding: '10px 16px',
  cursor: 'pointer',
  borderBottom: '1px solid rgba(99,102,241,0.06)',
  transition: 'background 0.15s',
};

export default AdminPage;
