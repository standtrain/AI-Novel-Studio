import React, { useEffect, useState } from 'react';
import { Button, Drawer } from 'antd';
import { EditOutlined, LoginOutlined, UserAddOutlined, MenuOutlined } from '@ant-design/icons';
import { getSiteInfoApi } from '../../api/site';
import useMobile from '../../hooks/useMobile';
import './LandingHeader.css';

interface LandingHeaderProps {
  isAuthenticated: boolean;
  onLogin: () => void;
  onRegister: () => void;
  onEnterApp: () => void;
}

const LandingHeader: React.FC<LandingHeaderProps> = ({
  isAuthenticated,
  onLogin,
  onRegister,
  onEnterApp,
}) => {
  const [scrolled, setScrolled] = useState(false);
  const [siteName, setSiteName] = useState('AI小说工作室');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isMobile = useMobile();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    getSiteInfoApi()
      .then((info) => {
        if (info.siteName) setSiteName(info.siteName);
        if (info.siteDescription) document.title = info.siteName || 'AI小说工作室';
      })
      .catch(() => {});
  }, []);

  const scrollTo = (id: string) => {
    setMobileMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <header className={`landing-header${scrolled ? ' scrolled' : ''}`}>
      <div className="header-inner">
        <div className="header-logo" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          <EditOutlined className="logo-icon" />
          <span className="logo-text">{siteName}</span>
        </div>

        {/* 桌面端导航 */}
        <nav className="header-nav">
          <button className="nav-link" onClick={() => scrollTo('features')}>功能</button>
          <button className="nav-link" onClick={() => scrollTo('how-it-works')}>创作流程</button>
          <button className="nav-link" onClick={() => scrollTo('showcase')}>能力展示</button>
        </nav>

        {/* 桌面端操作按钮 */}
        <div className="header-actions">
          {isAuthenticated ? (
            <Button type="primary" icon={<EditOutlined />} onClick={onEnterApp} className="btn-primary">
              进入创作
            </Button>
          ) : (
            <>
              <Button icon={<LoginOutlined />} onClick={onLogin} className="btn-ghost">
                登录
              </Button>
              <Button type="primary" icon={<UserAddOutlined />} onClick={onRegister} className="btn-primary">
                免费注册
              </Button>
            </>
          )}
        </div>

        {/* 移动端汉堡菜单按钮 */}
        {isMobile && (
          <Button
            type="text"
            icon={<MenuOutlined style={{ fontSize: 20 }} />}
            onClick={() => setMobileMenuOpen(true)}
            className="mobile-menu-btn"
          />
        )}
      </div>

      {/* 移动端抽屉菜单 */}
      {isMobile && (
        <Drawer
          placement="right"
          open={mobileMenuOpen}
          onClose={() => setMobileMenuOpen(false)}
          width={240}
          styles={{
            body: { padding: '24px 16px', background: 'rgba(30,41,59,0.98)' },
            header: { background: 'rgba(30,41,59,0.98)', borderBottom: '1px solid rgba(99,102,241,0.15)' },
          }}
          title={<span style={{ color: '#f1f5f9', fontWeight: 600 }}>{siteName}</span>}
          closeIcon={null}
          extra={
            <span
              onClick={() => setMobileMenuOpen(false)}
              style={{ color: '#94a3b8', cursor: 'pointer', fontSize: 18 }}
            >
              ✕
            </span>
          }
        >
          <nav className="mobile-nav">
            <button className="mobile-nav-link" onClick={() => scrollTo('features')}>功能特色</button>
            <button className="mobile-nav-link" onClick={() => scrollTo('how-it-works')}>创作流程</button>
            <button className="mobile-nav-link" onClick={() => scrollTo('showcase')}>能力展示</button>
            <div className="mobile-nav-divider" />
            {isAuthenticated ? (
              <Button type="primary" block icon={<EditOutlined />} onClick={() => { setMobileMenuOpen(false); onEnterApp(); }} className="btn-primary">
                进入创作
              </Button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <Button block icon={<LoginOutlined />} onClick={() => { setMobileMenuOpen(false); onLogin(); }} className="btn-ghost">
                  登录
                </Button>
                <Button type="primary" block icon={<UserAddOutlined />} onClick={() => { setMobileMenuOpen(false); onRegister(); }} className="btn-primary">
                  免费注册
                </Button>
              </div>
            )}
          </nav>
        </Drawer>
      )}
    </header>
  );
};

export default LandingHeader;
