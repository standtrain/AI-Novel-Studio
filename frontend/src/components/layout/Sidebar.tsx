import React from 'react';
import { Layout, Menu } from 'antd';
import { EditOutlined, SettingOutlined, UserOutlined, ExperimentOutlined, ShopOutlined } from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

const { Sider } = Layout;

// 导出菜单配置，供移动端 Drawer 复用
export const getMenuItems = (isAdmin: boolean) => [
  { key: '/dashboard', icon: <EditOutlined />, label: '我的小说' },
  { key: '/templates', icon: <ShopOutlined />, label: '模板商店' },
  ...(isAdmin ? [{ key: '/admin', icon: <SettingOutlined />, label: '管理后台' }] : []),
  { key: '/advanced', icon: <ExperimentOutlined />, label: '高级设置' },
  { key: '/settings', icon: <UserOutlined />, label: '个人设置' },
];

export const getSelectedKey = (pathname: string) => {
  if (pathname.startsWith('/admin')) return '/admin';
  if (pathname.startsWith('/templates')) return '/templates';
  if (pathname.startsWith('/advanced')) return '/advanced';
  if (pathname.startsWith('/settings')) return '/settings';
  return '/dashboard';
};

interface SidebarProps {
  /** 移动端模式下作为 Drawer 内容时，点击菜单后回调关闭 */
  onMenuClick?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ onMenuClick }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.group?.name === 'admin';

  const handleMenuClick = ({ key }: { key: string }) => {
    navigate(key);
    onMenuClick?.();
  };

  return (
    <Sider width={200} style={{
      background: 'rgba(30,41,59,0.5)',
      backdropFilter: 'blur(12px)',
      borderRight: '1px solid rgba(99,102,241,0.15)'
    }}>
      <Menu
        mode="inline"
        selectedKeys={[getSelectedKey(location.pathname)]}
        items={getMenuItems(isAdmin)}
        onClick={handleMenuClick}
        style={{
          height: '100%',
          borderRight: 0,
          background: 'transparent',
          color: '#cbd5e1'
        }}
      />
    </Sider>
  );
};

export default Sidebar;
