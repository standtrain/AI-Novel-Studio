import React, { useState } from 'react';
import { Card, Form, Input, Button, Typography, message, Result } from 'antd';
import { MailOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { forgotPasswordApi, sendVerifyCodeApi } from '../api/auth';
import useMobile from '../hooks/useMobile';

const { Title, Text } = Typography;

const BackgroundEffects: React.FC = () => (
  <>
    <div style={{
      position: 'absolute', top: '25%', left: '50%',
      transform: 'translate(-50%, -50%)',
      width: 500, height: 500,
      background: 'radial-gradient(circle, rgba(245,158,11,0.15) 0%, rgba(245,158,11,0.05) 40%, transparent 70%)',
      borderRadius: '50%', pointerEvents: 'none',
      animation: 'pulse 4s ease-in-out infinite',
    }} />
    <div style={{
      position: 'absolute', bottom: '20%', right: '15%',
      width: 300, height: 300,
      background: 'radial-gradient(circle, rgba(245,158,11,0.1) 0%, transparent 70%)',
      borderRadius: '50%', pointerEvents: 'none',
      animation: 'pulse 5s ease-in-out infinite 1s',
    }} />
    <style>{`
      @keyframes pulse {
        0%, 100% { opacity: 0.6; transform: translate(-50%, -50%) scale(1); }
        50% { opacity: 1; transform: translate(-50%, -50%) scale(1.1); }
      }
    `}</style>
  </>
);

const ForgotPasswordPage: React.FC = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [sentEmail, setSentEmail] = useState('');
  const [focusedInput, setFocusedInput] = useState<string | null>(null);
  const navigate = useNavigate();
  const isMobile = useMobile();

  const onFinish = async (values: { email: string }) => {
    setLoading(true);
    try {
      await sendVerifyCodeApi(values.email, 'reset_password');
      setSentEmail(values.email);
      setSent(true);
      message.success('验证码已发送，请检查邮箱');
    } catch (err: any) {
      message.error(err.response?.data?.error || '发送验证码失败');
    } finally {
      setLoading(false);
    }
  };

  const getInputStyle = (name: string) => ({
    background: 'rgba(15,23,42,0.6)',
    borderColor: focusedInput === name ? '#f59e0b' : 'rgba(99,102,241,0.3)',
    color: '#f1f5f9',
    height: 48,
    transition: 'all 0.3s ease',
    boxShadow: focusedInput === name ? '0 0 0 3px rgba(245,158,11,0.15), inset 0 1px 2px rgba(0,0,0,0.1)' : 'none',
  });

  const primaryBtnStyle = {
    height: 52, fontSize: 16, fontWeight: 600,
    background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 50%, #b45309 100%)',
    border: 'none', borderRadius: 14,
    boxShadow: '0 4px 15px rgba(245,158,11,0.3), inset 0 1px 0 rgba(255,255,255,0.15)',
    transition: 'all 0.3s ease' as const,
  };

  return (
    <div style={{
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 40%, #0f172a 70%, #1a1f35 100%)',
      position: 'relative', overflow: 'hidden',
    }}>
      <BackgroundEffects />
      <Card style={{
        width: isMobile ? 'calc(100vw - 32px)' : 420, maxWidth: 420,
        background: 'rgba(30,41,59,0.75)', backdropFilter: 'blur(20px)',
        border: '1px solid rgba(99,102,241,0.25)', borderRadius: 24,
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5), 0 0 80px rgba(245,158,11,0.1)',
      }} styles={{ body: { padding: isMobile ? 24 : 40 } }}>
        {sent ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 64, height: 64,
              background: 'linear-gradient(135deg, rgba(16,185,129,0.15) 0%, rgba(5,150,105,0.15) 100%)',
              borderRadius: 16, marginBottom: 20,
            }}>
              <MailOutlined style={{ fontSize: 28, color: '#34d399' }} />
            </div>
            <Title level={3} style={{ color: '#f1f5f9', marginBottom: 8 }}>验证码已发送</Title>
            <Text style={{ color: '#94a3b8', fontSize: 14, display: 'block', marginBottom: 24 }}>
              一封包含6位验证码的邮件已发送至<br/><strong style={{ color: '#f1f5f9' }}>{sentEmail}</strong><br/>请在10分钟内使用该验证码重置密码
            </Text>
            <Button type="primary" block style={primaryBtnStyle}
              onClick={() => navigate('/reset-password', { state: { email: sentEmail } })}>
              前往重置密码
            </Button>
            <Text style={{ display: 'block', marginTop: 16 }}>
              <Link to="/forgot-password" style={{ color: '#f59e0b' }} onClick={() => setSent(false)}>
                未收到邮件？重新发送
              </Link>
            </Text>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 8 }}>
              <Button type="link" icon={<ArrowLeftOutlined />}
                onClick={() => navigate('/login')}
                style={{ color: '#94a3b8', padding: 0 }}>
                返回登录
              </Button>
            </div>
            <div style={{ textAlign: 'center', marginBottom: 36 }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 72, height: 72,
                background: 'linear-gradient(135deg, rgba(245,158,11,0.15) 0%, rgba(217,119,6,0.15) 100%)',
                borderRadius: 20, marginBottom: 20,
                boxShadow: '0 8px 32px rgba(245,158,11,0.2), inset 0 1px 0 rgba(255,255,255,0.1)',
              }}>
                <span style={{
                  fontSize: 36,
                  background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                }}>✦</span>
              </div>
              <Title level={2} style={{ color: '#f1f5f9', margin: 0, fontWeight: 700 }}>
                忘记密码
              </Title>
              <Text style={{ color: '#94a3b8', fontSize: 15, marginTop: 8, display: 'block' }}>
                输入注册邮箱，我们将发送验证码
              </Text>
            </div>
            <Form form={form} onFinish={onFinish} size="large">
              <Form.Item name="email" rules={[{ required: true, message: '请输入邮箱' }, { type: 'email', message: '请输入有效的邮箱' }]}>
                <Input
                  prefix={<MailOutlined style={{ color: '#f59e0b', fontSize: 18 }} />}
                  placeholder="注册邮箱"
                  onFocus={() => setFocusedInput('email')}
                  onBlur={() => setFocusedInput(null)}
                  style={getInputStyle('email')}
                />
              </Form.Item>
              <Form.Item style={{ marginBottom: 16, marginTop: 32 }}>
                <Button type="primary" htmlType="submit" loading={loading} block
                  style={primaryBtnStyle}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 25px rgba(245,158,11,0.4), inset 0 1px 0 rgba(255,255,255,0.2)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 15px rgba(245,158,11,0.3), inset 0 1px 0 rgba(255,255,255,0.15)'; }}>
                  发送验证码
                </Button>
              </Form.Item>
            </Form>
          </>
        )}
      </Card>
    </div>
  );
};

export default ForgotPasswordPage;
