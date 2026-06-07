import React, { useState, useEffect } from 'react';
import { Card, Form, Input, Button, Typography, message, Result, Space } from 'antd';
import { UserOutlined, LockOutlined, MailOutlined, NumberOutlined, SendOutlined } from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { getRegistrationStatusApi, sendVerifyCodeApi, getCaptchaApi } from '../api/auth';
import useMobile from '../hooks/useMobile';

const { Title, Text } = Typography;

const BackgroundEffects: React.FC = () => (
  <>
    <div style={{
      position: 'absolute', bottom: '30%', left: '50%', transform: 'translate(-50%, 50%)',
      width: 500, height: 500,
      background: 'radial-gradient(circle, rgba(34,211,238,0.15) 0%, rgba(34,211,238,0.05) 40%, transparent 70%)',
      borderRadius: '50%', pointerEvents: 'none', animation: 'pulse 4s ease-in-out infinite',
    }} />
    <div style={{
      position: 'absolute', top: '20%', right: '10%',
      width: 350, height: 350,
      background: 'radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)',
      borderRadius: '50%', pointerEvents: 'none', animation: 'pulse 5s ease-in-out infinite 1.5s',
    }} />
    <div style={{
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      backgroundImage: `linear-gradient(rgba(99,102,241,0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(99,102,241,0.03) 1px, transparent 1px)`,
      backgroundSize: '60px 60px', pointerEvents: 'none',
    }} />
    <style>{`
      @keyframes pulse {
        0%, 100% { opacity: 0.6; transform: translate(-50%, 50%) scale(1); }
        50% { opacity: 1; transform: translate(-50%, 50%) scale(1.1); }
      }
    `}</style>
  </>
);

const RegisterPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [allowRegistration, setAllowRegistration] = useState(true);
  const [emailVerificationEnabled, setEmailVerificationEnabled] = useState(false);
  const [emailDomainWhitelistEnabled, setEmailDomainWhitelistEnabled] = useState(false);
  const [allowedDomains, setAllowedDomains] = useState<string[]>([]);
  const [sendingCode, setSendingCode] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [focusedInput, setFocusedInput] = useState<string | null>(null);
  const [captchaEnabled, setCaptchaEnabled] = useState(false);
  const [captchaId, setCaptchaId] = useState<string | null>(null);
  const [captchaSvg, setCaptchaSvg] = useState<string | null>(null);
  const register = useAuthStore((s) => s.register);
  const navigate = useNavigate();
  const isMobile = useMobile();

  // 发送冷却倒计时（60秒）
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown(c => c - 1), 1000);
    return () => clearInterval(timer);
  }, [cooldown > 0]);

  const refreshCaptcha = async () => {
    try {
      const res = await getCaptchaApi();
      setCaptchaEnabled(res.enabled);
      setCaptchaId(res.captchaId);
      setCaptchaSvg(res.svg);
    } catch { /* 静默 */ }
  };

  useEffect(() => {
    Promise.all([getRegistrationStatusApi(), getCaptchaApi()])
      .then(([regRes, capRes]: any[]) => {
        setAllowRegistration(regRes.allowRegistration);
        setEmailVerificationEnabled(regRes.emailVerificationEnabled || false);
        setEmailDomainWhitelistEnabled(regRes.emailDomainWhitelistEnabled || false);
        setAllowedDomains(regRes.allowedDomains || []);
        setCaptchaEnabled(capRes.enabled);
        setCaptchaId(capRes.captchaId);
        setCaptchaSvg(capRes.svg);
      })
      .catch(() => setAllowRegistration(true))
      .finally(() => setChecking(false));
  }, []);

  const handleSendCode = async () => {
    // 从表单获取邮箱
    const email = (document.getElementById('reg-email') as HTMLInputElement)?.value;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      message.warning('请先输入有效的邮箱地址');
      return;
    }
    // 客户端域名白名单校验（提前提示，避免无效请求）
    if (emailDomainWhitelistEnabled && allowedDomains.length > 0) {
      const domain = email.split('@')[1]?.toLowerCase();
      if (!allowedDomains.includes(domain)) {
        message.warning(`仅支持以下邮箱域名注册：${allowedDomains.join('、')}`);
        return;
      }
    }
    // 图形验证码校验
    let captchaCodeVal: string | undefined;
    if (captchaEnabled) {
      captchaCodeVal = (document.getElementById('reg-captcha-input') as HTMLInputElement)?.value;
      if (!captchaCodeVal) {
        message.warning('请先填写图形验证码');
        return;
      }
    }
    setSendingCode(true);
    try {
      await sendVerifyCodeApi(email, 'register', captchaId ?? undefined, captchaCodeVal);
      setCodeSent(true);
      setCooldown(60);
      message.success('验证码已发送至邮箱');
    } catch (err: any) {
      message.error(err.response?.data?.error || '发送验证码失败');
    } finally {
      setSendingCode(false);
    }
    // 无论成败，刷新验证码并清空输入框（captcha 为一次性使用）
    const input = document.getElementById('reg-captcha-input') as HTMLInputElement;
    if (input) input.value = '';
    await refreshCaptcha();
  };

  const onFinish = async (values: { username: string; email: string; password: string; code?: string }) => {
    setLoading(true);
    try {
      await register(values.username, values.email, values.password, values.code);
      message.success('注册成功');
      navigate('/dashboard');
    } catch (err: any) {
      message.error(err.message);
    } finally {
      setLoading(false);
    }
  };

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
    background: 'rgba(30,41,59,0.75)', backdropFilter: 'blur(20px)',
    border: '1px solid rgba(99,102,241,0.25)', borderRadius: 24,
    boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5), 0 0 80px rgba(34,211,238,0.1)',
  };

  const primaryBtnStyle = {
    height: 52, fontSize: 16, fontWeight: 600,
    background: 'linear-gradient(135deg, #22d3ee 0%, #06b6d4 50%, #0891b2 100%)',
    border: 'none', borderRadius: 14,
    boxShadow: '0 4px 15px rgba(34,211,238,0.3), inset 0 1px 0 rgba(255,255,255,0.15)',
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
      <Card style={cardStyle} styles={{ body: { padding: isMobile ? 24 : 40 } }}>
        {checking ? null : !allowRegistration ? (
          <Result status="info" title="注册已关闭" subTitle="站点管理员已关闭新用户注册功能。"
            extra={<Link to="/login"><Button type="primary" style={primaryBtnStyle}>前往登录</Button></Link>} />
        ) : (
          <>
            <div style={{ textAlign: 'center', marginBottom: 36 }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 72, height: 72,
                background: 'linear-gradient(135deg, rgba(34,211,238,0.2) 0%, rgba(6,182,212,0.2) 100%)',
                borderRadius: 20, marginBottom: 20,
                boxShadow: '0 8px 32px rgba(34,211,238,0.25), inset 0 1px 0 rgba(255,255,255,0.1)',
              }}>
                <span style={{
                  fontSize: 36,
                  background: 'linear-gradient(135deg, #67e8f9 0%, #22d3ee 100%)',
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                  filter: 'drop-shadow(0 0 8px rgba(34,211,238,0.5))',
                }}>✦</span>
              </div>
              <Title level={2} style={{ color: '#f1f5f9', margin: 0, fontWeight: 700, letterSpacing: 0 }}>创建账号</Title>
              <Text style={{ color: '#94a3b8', fontSize: 15, marginTop: 8, display: 'block' }}>开始你的 AI 创作之旅</Text>
            </div>

            {emailDomainWhitelistEnabled && allowedDomains.length > 0 && (
              <div style={{
                padding: '10px 16px',
                marginBottom: 20,
                background: 'rgba(99,102,241,0.08)',
                border: '1px solid rgba(99,102,241,0.2)',
                borderRadius: 10,
              }}>
                <Text style={{ color: '#94a3b8', fontSize: 13 }}>
                  仅限以下邮箱域名注册：
                </Text>
                <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {allowedDomains.map(d => (
                    <span key={d} style={{
                      padding: '2px 10px',
                      background: 'rgba(99,102,241,0.15)',
                      borderRadius: 6,
                      color: '#a5b4fc',
                      fontSize: 12,
                      fontFamily: 'var(--font-mono)',
                    }}>@{d}</span>
                  ))}
                </div>
              </div>
            )}

            <Form onFinish={onFinish} size="large">
              <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }, { min: 3, message: '用户名至少3个字符' }]}>
                <Input prefix={<UserOutlined style={{ color: '#22d3ee', fontSize: 18 }} />}
                  placeholder="用户名" onFocus={() => setFocusedInput('username')} onBlur={() => setFocusedInput(null)}
                  style={getInputStyle('username')} />
              </Form.Item>

              {/* 邮箱 + 发送验证码按钮 */}
              {emailVerificationEnabled ? (
                <>
                  <Form.Item name="email" rules={[{ required: true, message: '请输入邮箱' }, { type: 'email', message: '请输入有效的邮箱' }]}>
                    <Input id="reg-email" prefix={<MailOutlined style={{ color: '#22d3ee', fontSize: 18 }} />}
                      placeholder="邮箱" onFocus={() => setFocusedInput('email')} onBlur={() => setFocusedInput(null)}
                      style={getInputStyle('email')}
                      suffix={
                        <Button type="link" size="small" icon={<SendOutlined />}
                          loading={sendingCode} onClick={handleSendCode}
                          disabled={cooldown > 0}
                          style={{ color: cooldown > 0 ? '#64748b' : '#22d3ee', fontSize: 12 }}>
                          {cooldown > 0 ? `${cooldown}s` : codeSent ? '重新发送' : '发送验证码'}
                        </Button>
                      } />
                  </Form.Item>
                  {/* 图形验证码（管理员开启时显示，发送验证码前必填） */}
                  {captchaEnabled && (
                    <div style={{ marginBottom: 24 }}>
                      <div style={{ display: 'flex', gap: 12 }}>
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
                          id="reg-captcha-input"
                          placeholder="验证码计算结果"
                          autoComplete="off"
                          onFocus={() => setFocusedInput('captcha')}
                          onBlur={() => setFocusedInput(null)}
                          style={{ ...getInputStyle('captcha'), flex: 1 }}
                        />
                      </div>
                    </div>
                  )}
                  <Form.Item name="code" rules={[{ required: true, message: '请输入6位验证码' }, { len: 6, message: '验证码为6位数字' }]}>
                    <Input prefix={<NumberOutlined style={{ color: '#22d3ee', fontSize: 18 }} />}
                      placeholder="6位验证码" maxLength={6}
                      onFocus={() => setFocusedInput('code')} onBlur={() => setFocusedInput(null)}
                      style={{ ...getInputStyle('code'), letterSpacing: 4, textAlign: 'center' }} />
                  </Form.Item>
                </>
              ) : (
                <Form.Item name="email" rules={[{ required: true, message: '请输入邮箱' }, { type: 'email', message: '请输入有效的邮箱' }]}>
                  <Input prefix={<MailOutlined style={{ color: '#22d3ee', fontSize: 18 }} />}
                    placeholder="邮箱" onFocus={() => setFocusedInput('email')} onBlur={() => setFocusedInput(null)}
                    style={getInputStyle('email')} />
                </Form.Item>
              )}

              <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }, { min: 6, message: '密码至少6个字符' }]}>
                <Input.Password prefix={<LockOutlined style={{ color: '#22d3ee', fontSize: 18 }} />}
                  placeholder="密码" onFocus={() => setFocusedInput('password')} onBlur={() => setFocusedInput(null)}
                  style={getInputStyle('password')} />
              </Form.Item>
              <Form.Item style={{ marginBottom: 16, marginTop: 32 }}>
                <Button type="primary" htmlType="submit" loading={loading} block style={primaryBtnStyle}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 25px rgba(34,211,238,0.4), inset 0 1px 0 rgba(255,255,255,0.2)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 15px rgba(34,211,238,0.3), inset 0 1px 0 rgba(255,255,255,0.15)'; }}>
                  注册
                </Button>
              </Form.Item>
            </Form>

            <div style={{ textAlign: 'center', paddingTop: 16, borderTop: '1px solid rgba(99,102,241,0.1)' }}>
              <Text style={{ color: '#64748b' }}>已有账号？</Text>
              <Link to="/login" style={{ color: '#67e8f9', marginLeft: 8, fontWeight: 500, transition: 'color 0.2s' }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#22d3ee'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#67e8f9'}>
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
