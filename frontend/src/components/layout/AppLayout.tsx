import React, { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Drawer, Menu } from 'antd';
import Header from './Header';
import Sidebar, { getMenuItems, getSelectedKey } from './Sidebar';
import useMobile from '../../hooks/useMobile';
import { useAuthStore } from '../../store/authStore';

const { Content } = Layout;

const AppLayout: React.FC = () => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const isMobile = useMobile();
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.group?.name === 'admin';

  const handleMenuClick = ({ key }: { key: string }) => {
    navigate(key);
    setDrawerOpen(false);
  };

  return (
    <Layout className="app-shell">
      <Header onMenuToggle={() => setDrawerOpen(true)} />
      <Layout style={{ background: 'transparent' }}>
        {/* 桌面端：固定侧边栏 */}
        {!isMobile && <Sidebar />}

        {/* 移动端：抽屉式菜单 */}
        {isMobile && (
          <Drawer
            placement="left"
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            width={220}
            styles={{
              body: { padding: 0, background: 'rgba(30,41,59,0.98)' },
              header: { background: 'rgba(30,41,59,0.98)', borderBottom: '1px solid rgba(99,102,241,0.15)' },
            }}
            title={
              <span style={{ color: '#f1f5f9', fontWeight: 600 }}>
                <span style={{ color: 'var(--lp-primary)', marginRight: 8 }}>✦</span>
                AI Novel Studio
              </span>
            }
            closeIcon={null}
            extra={
              <span
                onClick={() => setDrawerOpen(false)}
                style={{ color: '#94a3b8', cursor: 'pointer', fontSize: 18 }}
              >
                ✕
              </span>
            }
          >
            <Menu
              mode="inline"
              selectedKeys={[getSelectedKey(location.pathname)]}
              items={getMenuItems(isAdmin)}
              onClick={handleMenuClick}
              style={{
                background: 'transparent',
                color: '#cbd5e1',
                borderRight: 0,
              }}
            />
          </Drawer>
        )}

        <Layout className="app-main-wrap" style={{ padding: isMobile ? 12 : 24, background: 'transparent' }}>
          <Content
            className="glass-card app-content-panel"
            style={{
              borderRadius: isMobile ? 12 : 16,
              padding: isMobile ? 16 : 24,
            }}
          >
            <Outlet />
          </Content>
        </Layout>
      </Layout>
    </Layout>
  );
};

export default AppLayout;
