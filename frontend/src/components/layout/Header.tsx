import React from 'react';
import { Layout, Button, Space, Dropdown, Modal } from 'antd';
import { UserOutlined, LogoutOutlined, HomeOutlined, EditOutlined, SettingOutlined, MenuOutlined, ShopOutlined, ExperimentOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import useMobile from '../../hooks/useMobile';

const { Header: AntHeader } = Layout;

interface HeaderProps {
  onMenuToggle?: () => void;
}

const Header: React.FC<HeaderProps> = ({ onMenuToggle }) => {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const isMobile = useMobile();
  const isAdmin = user?.group?.name === 'admin';

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

  const menuItems = {
    items: [
      { key: 'home', icon: <HomeOutlined />, label: '首页', onClick: () => navigate('/home') },
      { key: 'dashboard', icon: <EditOutlined />, label: '我的小说', onClick: () => navigate('/dashboard') },
      { key: 'templates', icon: <ShopOutlined />, label: '模板商店', onClick: () => navigate('/templates') },
      ...(isAdmin ? [{ key: 'admin', icon: <SettingOutlined />, label: '管理后台', onClick: () => navigate('/admin') }] : []),
      { key: 'advanced', icon: <ExperimentOutlined />, label: '高级设置', onClick: () => navigate('/advanced') },
      { key: 'settings', icon: <UserOutlined />, label: '个人设置', onClick: () => navigate('/settings') },
      { type: 'divider' as const },
      { key: 'logout', icon: <LogoutOutlined />, label: '退出登录', onClick: handleLogout, danger: true },
    ],
  };

  return (
    <AntHeader className="app-header" style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: isMobile ? '0 12px' : '0 24px',
      borderBottom: '1px solid rgba(99,102,241,0.2)',
      position: 'sticky',
      top: 0,
      zIndex: 1000
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {isMobile && (
          <Button
            type="text"
            icon={<MenuOutlined />}
            onClick={onMenuToggle}
            style={{ color: '#cbd5e1', fontSize: 18 }}
          />
        )}
        <div style={{
          color: '#f1f5f9',
          fontSize: isMobile ? 15 : 18,
          fontWeight: 700,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 10
        }} onClick={() => navigate('/home')}>
          <span className="brand-mark">✦</span>
          {!isMobile && 'AI Novel Studio'}
        </div>
      </div>
      <Space>
        <Dropdown menu={menuItems} placement="bottomRight">
          <Button
            type="text"
            icon={<UserOutlined />}
            style={{
              color: '#cbd5e1',
              padding: isMobile ? '4px 8px' : '4px 14px',
              background: 'rgba(99,102,241,0.08)',
              border: '1px solid rgba(99,102,241,0.16)',
            }}
          >
            {isMobile ? null : user?.username || '用户'}
          </Button>
        </Dropdown>
      </Space>
    </AntHeader>
  );
};

export default Header;
