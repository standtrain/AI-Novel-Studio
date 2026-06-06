import React, { useState } from 'react';
import { Card, Form, Input, Button, Typography, message } from 'antd';
import { LockOutlined, NumberOutlined, MailOutlined } from '@ant-design/icons';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { resetPasswordApi } from '../api/auth';
import useMobile from '../hooks/useMobile';

const { Title, Text } = Typography;

const BackgroundEffects: React.FC = () => (
  <>
    <div style={{
      position: 'absolute', top: '25%', left: '50%',
      transform: 'translate(-50%, -50%)',
      width: 500, height: 500,
      background: 'radial-gradient(circle, rgba(16,185,129,0.12) 0%, rgba(16,185,129,0.04) 40%, transparent 70%)',
      borderRadius: '50%', pointerEvents: 'none',
      animation: 'pulse 4s ease-in-out infinite',
    }} />
    <style>{`
      @keyframes pulse {
        0%, 100% { opacity: 0.6; transform: translate(-50%, -50%) scale(1); }
        50% { opacity: 1; transform: translate(-50%, -50%) scale(1.1); }
      }
    `}</style>
  </>
);

const ResetPasswordPage: React.FC = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [focusedInput, setFocusedInput] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useMobile();
  const emailFromState = (location.state as any)?.email || '';

  const onFinish = async (values: { email: string; code: string; password: string }) => {
    setLoading(true);
    try {
      await resetPasswordApi(values.email, values.code, values.password);
      setDone(true);
      message.success('密码重置成功');
    } catch (err: any) {
      message.error(err.response?.data?.error || '重置密码失败');
    } finally {
      setLoading(false);
    }
  };

  const getInputStyle = (name: string) => ({
    background: 'rgba(15,23,42,0.6)',
    borderColor: focusedInput === name ? '#10b981' : 'rgba(99,102,241,0.3)',
    color: '#f1f5f9',
    height: 48,
    transition: 'all 0.3s ease',
    boxShadow: focusedInput === name ? '0 0 0 3px rgba(16,185,129,0.15), inset 0 1px 2px rgba(0,0,0,0.1)' : 'none',
  });

  const primaryBtnStyle = {
    height: 52, fontSize: 16, fontWeight: 600,
    background: 'linear-gradient(135deg, #10b981 0%, #059669 50%, #047857 100%)',
    border: 'none', borderRadius: 14,
    boxShadow: '0 4px 15px rgba(16,185,129,0.3), inset 0 1px 0 rgba(255,255,255,0.15)',
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
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5), 0 0 80px rgba(16,185,129,0.1)',
      }} styles={{ body: { padding: isMobile ? 24 : 40 } }}>
        {done ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 64, height: 64,
              background: 'linear-gradient(135deg, rgba(16,185,129,0.15) 0%, rgba(5,150,105,0.15) 100%)',
              borderRadius: 16, marginBottom: 20,
            }}>
              <span style={{ fontSize: 28, color: '#34d399' }}>✓</span>
            </div>
            <Title level={3} style={{ color: '#f1f5f9', marginBottom: 8 }}>密码重置成功</Title>
            <Text style={{ color: '#94a3b8', fontSize: 14, display: 'block', marginBottom: 24 }}>
              请使用新密码登录
            </Text>
            <Button type="primary" block style={primaryBtnStyle}
              onClick={() => navigate('/login')}>
              前往登录
            </Button>
          </div>
        ) : (
          <>
            <div style={{ textAlign: 'center', marginBottom: 36 }}>
              <Title level={2} style={{ color: '#f1f5f9', margin: 0, fontWeight: 700 }}>
                重置密码
              </Title>
              <Text style={{ color: '#94a3b8', fontSize: 15, marginTop: 8, display: 'block' }}>
                输入邮箱收到的6位验证码和新密码
              </Text>
            </div>
            <Form form={form} onFinish={onFinish} size="large"
              initialValues={{ email: emailFromState }}>
              <Form.Item name="email" rules={[{ required: true, message: '请输入邮箱' }, { type: 'email', message: '请输入有效的邮箱' }]}>
                <Input
                  prefix={<MailOutlined style={{ color: '#10b981', fontSize: 18 }} />}
                  placeholder="注册邮箱"
                  onFocus={() => setFocusedInput('email')}
                  onBlur={() => setFocusedInput(null)}
                  style={getInputStyle('email')}
                />
              </Form.Item>
              <Form.Item name="code" rules={[{ required: true, message: '请输入验证码' }, { len: 6, message: '验证码为6位数字' }]}>
                <Input
                  prefix={<NumberOutlined style={{ color: '#10b981', fontSize: 18 }} />}
                  placeholder="6位验证码"
                  maxLength={6}
                  onFocus={() => setFocusedInput('code')}
                  onBlur={() => setFocusedInput(null)}
                  style={{ ...getInputStyle('code'), letterSpacing: 4, fontFamily: 'monospace', fontSize: 20, textAlign: 'center' }}
                />
              </Form.Item>
              <Form.Item name="password" rules={[{ required: true, message: '请输入新密码' }, { min: 6, message: '密码至少6个字符' }]}>
                <Input.Password
                  prefix={<LockOutlined style={{ color: '#10b981', fontSize: 18 }} />}
                  placeholder="新密码"
                  onFocus={() => setFocusedInput('password')}
                  onBlur={() => setFocusedInput(null)}
                  style={getInputStyle('password')}
                />
              </Form.Item>
              <Form.Item style={{ marginBottom: 16, marginTop: 32 }}>
                <Button type="primary" htmlType="submit" loading={loading} block
                  style={primaryBtnStyle}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 25px rgba(16,185,129,0.4), inset 0 1px 0 rgba(255,255,255,0.2)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 15px rgba(16,185,129,0.3), inset 0 1px 0 rgba(255,255,255,0.15)'; }}>
                  重置密码
                </Button>
              </Form.Item>
            </Form>
            <div style={{ textAlign: 'center', paddingTop: 16, borderTop: '1px solid rgba(99,102,241,0.1)' }}>
              <Link to="/login" style={{ color: '#818cf8', fontWeight: 500 }}>
                返回登录
              </Link>
            </div>
          </>
        )}
      </Card>
    </div>
  );
};

export default ResetPasswordPage;
