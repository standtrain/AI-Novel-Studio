import React, { useState, useEffect } from 'react';
import { Card, Form, Input, Button, Typography, message, Result } from 'antd';
import { UserOutlined, LockOutlined, MailOutlined } from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { getRegistrationStatusApi } from '../api/auth';
import useMobile from '../hooks/useMobile';

const { Title, Text } = Typography;

// 动态背景组件
const BackgroundEffects: React.FC = () => (
  <>
    {/* 主光晕 */}
    <div style={{
      position: 'absolute',
      bottom: '30%',
      left: '50%',
      transform: 'translate(-50%, 50%)',
      width: 500,
      height: 500,
      background: 'radial-gradient(circle, rgba(34,211,238,0.15) 0%, rgba(34,211,238,0.05) 40%, transparent 70%)',
      borderRadius: '50%',
      pointerEvents: 'none',
      animation: 'pulse 4s ease-in-out infinite',
    }} />
    {/* 辅助光晕 */}
    <div style={{
      position: 'absolute',
      top: '20%',
      right: '10%',
      width: 350,
      height: 350,
      background: 'radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)',
      borderRadius: '50%',
      pointerEvents: 'none',
      animation: 'pulse 5s ease-in-out infinite 1.5s',
    }} />
    {/* 装饰线 */}
    <div style={{
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundImage: `
        linear-gradient(rgba(99,102,241,0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(99,102,241,0.03) 1px, transparent 1px)
      `,
      backgroundSize: '60px 60px',
      pointerEvents: 'none',
    }} />
    <style>{`
      @keyframes pulse {
        0%, 100% { opacity: 0.6; transform: translate(-50%, 50%) scale(1); }
        50% { opacity: 1; transform: translate(-50%, 50%) scale(1.1); }
      }
      @keyframes float {
        0%, 100% { transform: translateY(0px); }
        50% { transform: translateY(-10px); }
      }
    `}</style>
  </>
);

const RegisterPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [allowRegistration, setAllowRegistration] = useState(true);
  const [focusedInput, setFocusedInput] = useState<string | null>(null);
  const register = useAuthStore((s) => s.register);
  const navigate = useNavigate();
  const isMobile = useMobile();

  useEffect(() => {
    getRegistrationStatusApi()
      .then(({ allowRegistration }) => setAllowRegistration(allowRegistration))
      .catch(() => setAllowRegistration(true))
      .finally(() => setChecking(false));
  }, []);

  const onFinish = async (values: { username: string; email: string; password: string }) => {
    setLoading(true);
    try {
      await register(values.username, values.email, values.password);
      message.success('注册成功');
      navigate('/dashboard');
    } catch (err: any) {
      message.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  // 输入框样式
  const getInputStyle = (name: string) => ({
    background: 'rgba(15,23,42,0.6)',
    borderColor: focusedInput === name ? '#6366f1' : 'rgba(99,102,241,0.3)',
    color: '#f1f5f9',
    height: 48,
    transition: 'all 0.3s ease',
    boxShadow: focusedInput === name ? '0 0 0 3px rgba(99,102,241,0.15), inset 0 1px 2px rgba(0,0,0,0.1)' : 'none',
  });

  const cardStyle = {
    width: isMobile ? 'calc(100vw - 32px)' : 420,
    maxWidth: 420,
    background: 'rgba(30,41,59,0.75)',
    backdropFilter: 'blur(20px)',
    border: '1px solid rgba(99,102,241,0.25)',
    borderRadius: 24,
    boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5), 0 0 80px rgba(34,211,238,0.1)',
  };

  const primaryBtnStyle = {
    height: 52,
    fontSize: 16,
    fontWeight: 600,
    background: 'linear-gradient(135deg, #22d3ee 0%, #06b6d4 50%, #0891b2 100%)',
    border: 'none',
    borderRadius: 14,
    boxShadow: '0 4px 15px rgba(34,211,238,0.3), inset 0 1px 0 rgba(255,255,255,0.15)',
    transition: 'all 0.3s ease' as const,
  };

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 40%, #0f172a 70%, #1a1f35 100%)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <BackgroundEffects />

      <Card style={cardStyle} styles={{ body: { padding: isMobile ? 24 : 40 } }}>
        {checking ? null : !allowRegistration ? (
          <Result
            status="info"
            title="注册已关闭"
            subTitle="站点管理员已关闭新用户注册功能。"
            extra={<Link to="/login"><Button type="primary" style={primaryBtnStyle}>前往登录</Button></Link>}
          />
        ) : (
          <>
            {/* Logo 区域 */}
            <div style={{ textAlign: 'center', marginBottom: 36 }}>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 72,
                height: 72,
                background: 'linear-gradient(135deg, rgba(34,211,238,0.2) 0%, rgba(6,182,212,0.2) 100%)',
                borderRadius: 20,
                marginBottom: 20,
                boxShadow: '0 8px 32px rgba(34,211,238,0.25), inset 0 1px 0 rgba(255,255,255,0.1)',
              }}>
                <span style={{
                  fontSize: 36,
                  background: 'linear-gradient(135deg, #67e8f9 0%, #22d3ee 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  filter: 'drop-shadow(0 0 8px rgba(34,211,238,0.5))',
                }}>✦</span>
              </div>
              <Title level={2} style={{
                color: '#f1f5f9',
                margin: 0,
                fontWeight: 700,
                letterSpacing: '-0.5px',
              }}>创建账号</Title>
              <Text style={{ color: '#94a3b8', fontSize: 15, marginTop: 8, display: 'block' }}>
                开始你的 AI 创作之旅
              </Text>
            </div>

            <Form onFinish={onFinish} size="large">
              <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }, { min: 3, message: '用户名至少3个字符' }]}>
                <Input
                  prefix={<UserOutlined style={{ color: '#22d3ee', fontSize: 18 }} />}
                  placeholder="用户名"
                  onFocus={() => setFocusedInput('username')}
                  onBlur={() => setFocusedInput(null)}
                  style={getInputStyle('username')}
                />
              </Form.Item>
              <Form.Item name="email" rules={[{ required: true, message: '请输入邮箱' }, { type: 'email', message: '请输入有效的邮箱' }]}>
                <Input
                  prefix={<MailOutlined style={{ color: '#22d3ee', fontSize: 18 }} />}
                  placeholder="邮箱"
                  onFocus={() => setFocusedInput('email')}
                  onBlur={() => setFocusedInput(null)}
                  style={getInputStyle('email')}
                />
              </Form.Item>
              <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }, { min: 6, message: '密码至少6个字符' }]}>
                <Input.Password
                  prefix={<LockOutlined style={{ color: '#22d3ee', fontSize: 18 }} />}
                  placeholder="密码"
                  onFocus={() => setFocusedInput('password')}
                  onBlur={() => setFocusedInput(null)}
                  style={getInputStyle('password')}
                />
              </Form.Item>
              <Form.Item style={{ marginBottom: 16, marginTop: 32 }}>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={loading}
                  block
                  style={primaryBtnStyle}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 8px 25px rgba(34,211,238,0.4), inset 0 1px 0 rgba(255,255,255,0.2)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 4px 15px rgba(34,211,238,0.3), inset 0 1px 0 rgba(255,255,255,0.15)';
                  }}
                >
                  注册
                </Button>
              </Form.Item>
            </Form>

            <div style={{
              textAlign: 'center',
              paddingTop: 16,
              borderTop: '1px solid rgba(99,102,241,0.1)',
            }}>
              <Text style={{ color: '#64748b' }}>已有账号？</Text>
              <Link
                to="/login"
                style={{
                  color: '#67e8f9',
                  marginLeft: 8,
                  fontWeight: 500,
                  transition: 'color 0.2s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#22d3ee'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#67e8f9'}
              >
                立即登录 →
              </Link>
            </div>
          </>
        )}
      </Card>
    </div>
  );
};

export default RegisterPage;