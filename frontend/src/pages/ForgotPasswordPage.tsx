import React, { useState, useEffect } from 'react';
import { Card, Form, Input, Button, Typography, message } from 'antd';
import { MailOutlined, ArrowLeftOutlined, LockOutlined, NumberOutlined, SendOutlined } from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { sendVerifyCodeApi, resetPasswordApi, getCaptchaApi } from '../api/auth';
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
  const [sending, setSending] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [focusedInput, setFocusedInput] = useState<string | null>(null);
  const [captchaEnabled, setCaptchaEnabled] = useState(false);
  const [captchaId, setCaptchaId] = useState<string | null>(null);
  const [captchaSvg, setCaptchaSvg] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const navigate = useNavigate();
  const isMobile = useMobile();

  const refreshCaptcha = async () => {
    try {
      const res = await getCaptchaApi();
      setCaptchaEnabled(res.enabled);
      setCaptchaId(res.captchaId);
      setCaptchaSvg(res.svg);
    } catch { /* 静默 */ }
  };

  useEffect(() => { refreshCaptcha(); }, []);

  // 发送冷却倒计时
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown(c => c - 1), 1000);
    return () => clearInterval(timer);
  }, [cooldown > 0]);

  // 发送验证码
  const handleSendCode = async () => {
    let captchaCodeVal: string | undefined;
    if (captchaEnabled) {
      const capInput = document.getElementById('forgot-captcha-input') as HTMLInputElement;
      captchaCodeVal = capInput?.value;
      if (!captchaCodeVal) { message.warning('请先填写图形验证码'); return; }
    }

    let emailVal: string;
    try {
      const values = await form.validateFields(['email']);
      emailVal = values.email;
    } catch { return; }

    setSending(true);
    try {
      const result = await sendVerifyCodeApi(emailVal, 'reset_password', captchaId ?? undefined, captchaCodeVal);
      if (result.message && result.message.includes('如果该邮箱已注册')) {
        message.warning(result.message);
        return;
      }
      setCodeSent(true);
      setCooldown(60);
      message.success(result.message || '验证码已发送至您的邮箱');
    } catch (err: any) {
      message.error(err.response?.data?.error || '发送验证码失败');
    } finally {
      setSending(false);
      const capInput = document.getElementById('forgot-captcha-input') as HTMLInputElement;
      if (capInput) capInput.value = '';
      await refreshCaptcha();
    }
  };

  // 提交重置密码
  const handleResetPassword = async (values: { email: string; code: string; password: string; confirmPassword: string }) => {
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

  const getInputStyle = (name: string, color = '#f59e0b') => ({
    background: 'rgba(15,23,42,0.6)',
    borderColor: focusedInput === name ? color : 'rgba(99,102,241,0.3)',
    color: '#f1f5f9',
    height: 48,
    transition: 'all 0.3s ease',
    boxShadow: focusedInput === name ? `0 0 0 3px rgba(245,158,11,0.15), inset 0 1px 2px rgba(0,0,0,0.1)` : 'none',
  });

  const primaryBtnStyle = {
    height: 52, fontSize: 16, fontWeight: 600,
    background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 50%, #b45309 100%)',
    border: 'none', borderRadius: 14,
    boxShadow: '0 4px 15px rgba(245,158,11,0.3), inset 0 1px 0 rgba(255,255,255,0.15)',
    transition: 'all 0.3s ease' as const,
  };

  const successBtnStyle = {
    height: 52, fontSize: 16, fontWeight: 600,
    background: 'linear-gradient(135deg, #10b981 0%, #059669 50%, #047857 100%)',
    border: 'none', borderRadius: 14,
    boxShadow: '0 4px 15px rgba(16,185,129,0.3), inset 0 1px 0 rgba(255,255,255,0.15)',
    transition: 'all 0.3s ease' as const,
  };

  // ---- 完成状态 ----
  if (done) {
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
            <Button type="primary" block style={successBtnStyle}
              onClick={() => navigate('/login')}>
              前往登录
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // ---- 主表单（邮箱 + 验证码 + 重置密码合一） ----
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
            输入注册邮箱获取验证码，即可重置密码
          </Text>
        </div>

        <Form form={form} onFinish={handleResetPassword} size="large">
          {/* 邮箱 */}
          <Form.Item name="email" rules={[{ required: true, message: '请输入邮箱' }, { type: 'email', message: '请输入有效的邮箱' }]}>
            <Input
              prefix={<MailOutlined style={{ color: '#f59e0b', fontSize: 18 }} />}
              placeholder="注册邮箱"
              disabled={codeSent}
              onFocus={() => setFocusedInput('email')}
              onBlur={() => setFocusedInput(null)}
              style={codeSent ? { ...getInputStyle('email'), opacity: 0.7 } : getInputStyle('email')}
            />
          </Form.Item>

          {/* 图形验证码 + 发送按钮 */}
          {captchaEnabled && (
            <div style={{ marginBottom: 24, display: 'flex', gap: 12 }}>
              <div
                style={{
                  flexShrink: 0, cursor: 'pointer', borderRadius: 8, overflow: 'hidden',
                  border: '1px solid rgba(99,102,241,0.3)', background: '#f0f2f5',
                  lineHeight: 0, height: 48,
                }}
                dangerouslySetInnerHTML={{ __html: captchaSvg || '' }}
                onClick={refreshCaptcha}
                title="点击刷新验证码"
              />
              <Input
                id="forgot-captcha-input"
                placeholder="验证码计算结果"
                autoComplete="off"
                onFocus={() => setFocusedInput('captcha')}
                onBlur={() => setFocusedInput(null)}
                style={{ ...getInputStyle('captcha'), flex: 1 }}
              />
            </div>
          )}

          {/* 发送验证码按钮 */}
          <Form.Item style={{ marginBottom: codeSent ? 8 : 24 }}>
            <Button type="default" block loading={sending} disabled={cooldown > 0}
              onClick={handleSendCode}
              icon={<SendOutlined />}
              style={{
                height: 48, fontSize: 15, fontWeight: 500, borderRadius: 12,
                color: '#f59e0b', borderColor: 'rgba(245,158,11,0.4)',
                background: 'rgba(245,158,11,0.08)',
                transition: 'all 0.3s ease',
              }}>
              {cooldown > 0 ? `${cooldown}s 后重新发送` : codeSent ? '重新发送验证码' : '发送验证码'}
            </Button>
          </Form.Item>

          {/* 验证码已发送提示 */}
          {codeSent && (
            <Text style={{ display: 'block', marginBottom: 16, color: '#34d399', fontSize: 13, textAlign: 'center' }}>
              验证码已发送，请查收邮件
            </Text>
          )}

          {/* 验证码输入 */}
          <Form.Item name="code" rules={[{ required: true, message: '请输入验证码' }, { len: 6, message: '验证码为6位数字' }]}>
            <Input
              prefix={<NumberOutlined style={{ color: '#f59e0b', fontSize: 18 }} />}
              placeholder="6位验证码"
              maxLength={6}
              onFocus={() => setFocusedInput('code')}
              onBlur={() => setFocusedInput(null)}
              style={{ ...getInputStyle('code'), letterSpacing: 4, textAlign: 'center' }}
            />
          </Form.Item>

          {/* 新密码 */}
          <Form.Item name="password" rules={[{ required: true, message: '请输入新密码' }, { min: 6, message: '密码至少6个字符' }]}>
            <Input.Password
              prefix={<LockOutlined style={{ color: '#f59e0b', fontSize: 18 }} />}
              placeholder="新密码"
              onFocus={() => setFocusedInput('password')}
              onBlur={() => setFocusedInput(null)}
              style={getInputStyle('password')}
            />
          </Form.Item>

          {/* 确认新密码 */}
          <Form.Item
            name="confirmPassword"
            dependencies={['password']}
            rules={[
              { required: true, message: '请确认新密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('password') === value) return Promise.resolve();
                  return Promise.reject(new Error('两次输入的密码不一致'));
                },
              }),
            ]}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: '#f59e0b', fontSize: 18 }} />}
              placeholder="确认新密码"
              onFocus={() => setFocusedInput('confirm')}
              onBlur={() => setFocusedInput(null)}
              style={getInputStyle('confirm')}
            />
          </Form.Item>

          {/* 提交按钮 */}
          <Form.Item style={{ marginBottom: 0, marginTop: 8 }}>
            <Button type="primary" htmlType="submit" loading={loading} block
              style={primaryBtnStyle}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 25px rgba(245,158,11,0.4), inset 0 1px 0 rgba(255,255,255,0.2)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 15px rgba(245,158,11,0.3), inset 0 1px 0 rgba(255,255,255,0.15)'; }}>
              重置密码
            </Button>
          </Form.Item>
        </Form>

        <div style={{ textAlign: 'center', paddingTop: 16, marginTop: 8, borderTop: '1px solid rgba(99,102,241,0.1)' }}>
          <Link to="/login" style={{ color: '#818cf8', fontWeight: 500, fontSize: 14 }}>
            返回登录
          </Link>
        </div>
      </Card>
    </div>
  );
};

export default ForgotPasswordPage;
