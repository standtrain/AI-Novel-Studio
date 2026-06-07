import React, { Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, App as AntApp, theme, Spin } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { useAuthStore } from './store/authStore';
import AppLayout from './components/layout/AppLayout';
import ProtectedRoute from './components/shared/ProtectedRoute';
import useSiteBrand from './hooks/useSiteBrand';
import { updateDocumentFavicon } from './utils/favicon';

// 路由级代码分割：页面组件懒加载
const LoginPage = React.lazy(() => import('./pages/LoginPage'));
const RegisterPage = React.lazy(() => import('./pages/RegisterPage'));
const ForgotPasswordPage = React.lazy(() => import('./pages/ForgotPasswordPage'));
const HomePage = React.lazy(() => import('./pages/HomePage'));
const DashboardPage = React.lazy(() => import('./pages/DashboardPage'));
const NovelPage = React.lazy(() => import('./pages/NovelPage'));
const ChapterEditPage = React.lazy(() => import('./pages/ChapterEditPage'));
const AdminPage = React.lazy(() => import('./pages/AdminPage'));
const SettingsPage = React.lazy(() => import('./pages/SettingsPage'));
const AdvancedSettingsPage = React.lazy(() => import('./pages/AdvancedSettingsPage'));
const TemplateStorePage = React.lazy(() => import('./pages/TemplateStorePage'));
const LandingPage = React.lazy(() => import('./pages/LandingPage'));

const SiteDocumentMeta: React.FC = () => {
  const { siteName, siteDescription, faviconUrl, brandVersion } = useSiteBrand();

  useEffect(() => {
    document.title = siteDescription ? `${siteName} - ${siteDescription}` : siteName;
    updateDocumentFavicon(faviconUrl, brandVersion);
  }, [siteName, siteDescription, faviconUrl, brandVersion]);

  return null;
};

const App: React.FC = () => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  // Ant Design 暗色主题配置
  const themeConfig = {
    algorithm: theme.darkAlgorithm,
    token: {
      colorPrimary: '#6366f1',
      colorBgContainer: 'rgba(30,41,59,0.9)',
      colorBgElevated: 'rgba(30,41,59,0.95)',
      colorBgLayout: '#0f172a',
      colorText: '#f1f5f9',
      colorTextSecondary: '#94a3b8',
      colorTextTertiary: '#64748b',
      colorBorder: 'rgba(99,102,241,0.2)',
      colorBorderSecondary: 'rgba(99,102,241,0.1)',
      colorError: '#f87171',
      colorWarning: '#fbbf24',
      borderRadius: 12,
      fontFamily: 'var(--font-sans)',
      fontFamilyCode: 'var(--font-mono)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.4), 0 0 60px rgba(99,102,241,0.1)',
      boxShadowSecondary: '0 4px 16px rgba(0,0,0,0.3)',
    },
    components: {
      Button: {
        primaryShadow: '0 4px 12px rgba(99,102,241,0.4)',
        defaultBg: 'rgba(30,41,59,0.8)',
        defaultBorderColor: 'rgba(99,102,241,0.3)',
      },
      Input: {
        activeBorderColor: '#6366f1',
        hoverBorderColor: '#818cf8',
        colorBgContainer: 'rgba(15,23,42,0.5)',
      },
      Card: {
        colorBgContainer: 'rgba(30,41,59,0.8)',
        colorBorderSecondary: 'rgba(99,102,241,0.15)',
      },
      Modal: {
        contentBg: 'rgba(30,41,59,0.95)',
        headerBg: 'rgba(30,41,59,0.95)',
      },
      Menu: {
        darkItemBg: 'transparent',
        darkSubMenuItemBg: 'transparent',
        darkItemSelectedBg: 'rgba(99,102,241,0.15)',
        darkItemHoverBg: 'rgba(99,102,241,0.1)',
      },
      Form: {
        labelColor: '#cbd5e1',
        errorIconColor: '#f87171',
      },
      Steps: {
        colorPrimary: '#6366f1',
        colorTextDescription: '#94a3b8',
      },
    },
  };

  return (
    <ConfigProvider locale={zhCN} theme={themeConfig}>
      <AntApp>
      <SiteDocumentMeta />
      <BrowserRouter>
        <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#0f172a' }}><Spin size="large" /></div>}>
        <Routes>
          {/* 已登录用户进入根路径时默认进入首页，未登录用户仍显示落地页。 */}
          <Route path="/" element={isAuthenticated ? <Navigate to="/home" replace /> : <LandingPage />} />

          <Route path="/login" element={isAuthenticated ? <Navigate to="/home" replace /> : <LoginPage />} />
          <Route path="/register" element={isAuthenticated ? <Navigate to="/home" replace /> : <RegisterPage />} />
          <Route path="/forgot-password" element={isAuthenticated ? <Navigate to="/home" replace /> : <ForgotPasswordPage />} />

          <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
            <Route path="/home" element={<HomePage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/novel/:id" element={<NovelPage />} />
            <Route path="/novel/:id/chapter/:num" element={<ChapterEditPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/advanced" element={<AdvancedSettingsPage />} />
            <Route path="/templates" element={<TemplateStorePage />} />
            <Route path="/admin" element={<AdminPage />} />
          </Route>

          {/* 未知路由按登录态回到对应入口。 */}
          <Route path="*" element={<Navigate to={isAuthenticated ? '/home' : '/'} replace />} />
        </Routes>
        </Suspense>
      </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  );
};

export default App;
