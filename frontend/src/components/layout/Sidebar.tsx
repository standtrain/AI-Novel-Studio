import React from 'react';
import { Layout, Menu, Button, Tooltip, Modal } from 'antd';
import { HomeOutlined, EditOutlined, SettingOutlined, UserOutlined, ExperimentOutlined, ShopOutlined, MessageOutlined, LogoutOutlined, MenuFoldOutlined, MenuUnfoldOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

const { Sider } = Layout;

// 导出菜单配置，供移动端 Drawer 复用
export const getMenuItems = (isAdmin: boolean) => [
  { key: '/home', icon: <HomeOutlined />, label: '首页' },
  { key: '/dashboard', icon: <EditOutlined />, label: '我的小说' },
  { key: '/chat', icon: <MessageOutlined />, label: 'AI 对话' },
  { key: '/templates', icon: <ShopOutlined />, label: '模板商店' },
  ...(isAdmin ? [{ key: '/admin', icon: <SettingOutlined />, label: '管理后台' }] : []),
  { key: '/advanced', icon: <ExperimentOutlined />, label: '高级设置' },
  { key: '/settings', icon: <UserOutlined />, label: '个人设置' },
];

export const getSelectedKey = (pathname: string) => {
  if (pathname.startsWith('/home')) return '/home';
  if (pathname.startsWith('/admin')) return '/admin';
  if (pathname.startsWith('/chat')) return '/chat';
  if (pathname.startsWith('/templates')) return '/templates';
  if (pathname.startsWith('/advanced')) return '/advanced';
  if (pathname.startsWith('/settings')) return '/settings';
  return '/dashboard';
};

interface SidebarProps {
  /** 移动端模式下作为 Drawer 内容时，点击菜单后回调关闭 */
  onMenuClick?: () => void;
  /** PC端侧边栏折叠状态 */
  collapsed?: boolean;
  /** PC端侧边栏折叠切换回调 */
  onCollapse?: (collapsed: boolean) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ onMenuClick, collapsed, onCollapse }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const isAdmin = !!user?.group?.isAdmin || user?.group?.name === 'admin';

  const handleMenuClick = ({ key }: { key: string }) => {
    navigate(key);
    onMenuClick?.();
  };

  const handleLogout = () => {
    Modal.confirm({
      title: <span style={{ color: '#f1f5f9' }}>确认退出</span>,
      icon: <ExclamationCircleOutlined style={{ color: '#ef4444' }} />,
      content: <span style={{ color: '#ef4444' }}>确定要退出登录吗？</span>,
      okText: '退出',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => {
        logout();
        navigate('/login');
      },
    });
  };

  const logoutBtn = collapsed ? (
    <Tooltip title="退出登录" placement="right">
      <Button
        type="text"
        icon={<LogoutOutlined />}
        onClick={handleLogout}
        style={{ color: '#ef4444', width: '100%', height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      />
    </Tooltip>
  ) : (
    <Button
      type="text"
      icon={<LogoutOutlined />}
      onClick={handleLogout}
      block
      style={{ color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'flex-start', padding: '8px 16px', height: 40, fontSize: 14 }}
    >
      退出登录
    </Button>
  );

  return (
    <Sider
      width={212}
      collapsible={collapsed !== undefined}
      collapsed={collapsed}
      onCollapse={onCollapse}
      trigger={null}
      className="app-sidebar"
      style={{
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <Menu
        mode="inline"
        selectedKeys={[getSelectedKey(location.pathname)]}
        items={getMenuItems(isAdmin)}
        onClick={handleMenuClick}
        style={{
          flex: 1,
          borderRight: 0,
          background: 'transparent',
          color: '#cbd5e1',
          paddingTop: 10,
          overflow: 'auto',
        }}
      />

      {/* 底部操作区：左侧退出登录，右侧折叠切换 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        borderTop: '1px solid rgba(99,102,241,0.12)',
        padding: collapsed ? 4 : 4,
        minHeight: 48,
      }}>
        <div style={{ flex: 1 }}>
          {logoutBtn}
        </div>
        <Tooltip title={collapsed ? '展开菜单' : '收起菜单'} placement="right">
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => onCollapse?.(!collapsed)}
            style={{
              color: '#94a3b8',
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          />
        </Tooltip>
      </div>
    </Sider>
  );
};

export default Sidebar;
