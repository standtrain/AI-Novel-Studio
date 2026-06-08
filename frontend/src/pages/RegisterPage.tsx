import React, { useEffect, useState } from 'react';
import { Button, Card, Checkbox, Form, Input, Result, Typography, message } from 'antd';
import {
  LockOutlined,
  MailOutlined,
  NumberOutlined,
  RocketOutlined,
  SafetyCertificateOutlined,
  SendOutlined,
  UserAddOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { getCaptchaApi, getRegistrationStatusApi, sendVerifyCodeApi } from '../api/auth';
import useSiteBrand from '../hooks/useSiteBrand';
import BrandIcon from '../components/shared/BrandIcon';

const { Title, Text, Paragraph } = Typography;

interface RegisterFormValues {
  username: string;
  email: string;
  password: string;
  code?: string;
  agreement?: boolean;
}

const RegisterPage: React.FC = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [allowRegistration, setAllowRegistration] = useState(true);
  const [emailVerificationEnabled, setEmailVerificationEnabled] = useState(false);
  const [emailDomainWhitelistEnabled, setEmailDomainWhitelistEnabled] = useState(false);
  const [allowedDomains, setAllowedDomains] = useState<string[]>([]);
  const [sendingCode, setSendingCode] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [captchaEnabled, setCaptchaEnabled] = useState(false);
  const [captchaId, setCaptchaId] = useState<string | null>(null);
  const [captchaSvg, setCaptchaSvg] = useState<string | null>(null);
  const register = useAuthStore((s) => s.register);
  const navigate = useNavigate();
  const { siteName, siteDescription } = useSiteBrand();

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => setCooldown(c => c - 1), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  const refreshCaptcha = async () => {
    try {
      const res = await getCaptchaApi();
      setCaptchaEnabled(res.enabled);
      setCaptchaId(res.captchaId);
      setCaptchaSvg(res.svg);
    } catch {
      // 验证码状态加载失败不阻塞注册页展示。
    }
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

  const validateEmailDomain = (email: string) => {
    if (!emailDomainWhitelistEnabled || allowedDomains.length === 0) return true;
    const domain = email.split('@')[1]?.toLowerCase();
    return allowedDomains.includes(domain);
  };

  const handleSendCode = async () => {
    try {
      await form.validateFields(['email']);
    } catch {
      message.warning('请先输入有效的邮箱地址');
      return;
    }

    const email = String(form.getFieldValue('email') || '').trim();
    if (!validateEmailDomain(email)) {
      message.warning(`仅支持以下邮箱域名注册：${allowedDomains.join('、')}`);
      return;
    }

    const captchaCode = String(form.getFieldValue('captchaCode') || '').trim();
    if (captchaEnabled && !captchaCode) {
      message.warning('请先填写图形验证码');
      return;
    }

    setSendingCode(true);
    try {
      await sendVerifyCodeApi(email, 'register', captchaId ?? undefined, captchaCode || undefined);
      setCodeSent(true);
      setCooldown(60);
      message.success('验证码已发送至邮箱');
    } catch (err: any) {
      message.error(err.response?.data?.error || '发送验证码失败');
    } finally {
      setSendingCode(false);
      form.setFieldValue('captchaCode', '');
      await refreshCaptcha();
    }
  };

  const onFinish = async (values: RegisterFormValues) => {
    const email = values.email.trim();
    if (!validateEmailDomain(email)) {
      message.warning(`仅支持以下邮箱域名注册：${allowedDomains.join('、')}`);
      return;
    }

    setLoading(true);
    try {
      await register(values.username.trim(), email, values.password, values.code);
      message.success('注册成功');
      navigate('/home');
    } catch (err: any) {
      message.error(err.message || '注册失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page-shell auth-page-register">
      <div className="auth-bg-grid" />
      <main className="auth-layout">
        <section className="auth-intro" aria-label="注册说明">
          <div className="auth-brand-chip">
            <BrandIcon size="sm" />
            <span>{siteName}</span>
          </div>
          <Title className="auth-title">创建你的创作空间</Title>
          {siteDescription && <Paragraph className="auth-subtitle">{siteDescription}</Paragraph>}
          <div className="auth-benefit-grid">
            <div className="auth-benefit-item">
              <RocketOutlined />
              <span>保存长期创作进度</span>
            </div>
            <div className="auth-benefit-item">
              <SafetyCertificateOutlined />
              <span>邮箱验证保护账号</span>
            </div>
          </div>
        </section>

        <Card className="auth-card" styles={{ body: { padding: 0 } }}>
          <div className="auth-card-inner">
            {checking ? (
              <div className="auth-loading-state">
                <BrandIcon size="md" />
                <Text type="secondary">正在检查注册状态...</Text>
              </div>
            ) : !allowRegistration ? (
              <Result
                status="info"
                title="注册已关闭"
                subTitle="站点管理员已关闭新用户注册功能。"
                extra={(
                  <Link to="/login">
                    <Button type="primary" className="auth-submit-btn">前往登录</Button>
                  </Link>
                )}
              />
            ) : (
              <>
                <div className="auth-card-header">
                  <BrandIcon size="md" />
                  <div>
                    <Title level={2} className="auth-card-title">注册账号</Title>
                    <Text className="auth-card-subtitle">几步之后就能开始创作</Text>
                  </div>
                </div>

                <Form
                  form={form}
                  className="auth-form"
                  onFinish={onFinish}
                  size="large"
                  layout="vertical"
                >
                  <Form.Item
                    name="username"
                    label="用户名"
                    rules={[
                      { required: true, message: '请输入用户名' },
                      { min: 3, message: '用户名至少3个字符' },
                      { max: 60, message: '用户名不能超过60个字符' },
                    ]}
                  >
                    <Input
                      className="auth-input"
                      prefix={<UserOutlined />}
                      placeholder="设置用户名"
                      autoComplete="username"
                    />
                  </Form.Item>

                  <Form.Item
                    name="email"
                    label="邮箱"
                    rules={[
                      { required: true, message: '请输入邮箱' },
                      { type: 'email', message: '请输入有效的邮箱' },
                      {
                        validator: (_, value) => {
                          if (!value || validateEmailDomain(String(value).trim())) return Promise.resolve();
                          return Promise.reject(new Error(`仅支持：${allowedDomains.join('、')}`));
                        },
                      },
                    ]}
                  >
                    <Input
                      className="auth-input"
                      prefix={<MailOutlined />}
                      placeholder="输入邮箱地址"
                      autoComplete="email"
                      suffix={emailVerificationEnabled ? (
                        <Button
                          type="link"
                          size="small"
                          icon={<SendOutlined />}
                          loading={sendingCode}
                          onClick={handleSendCode}
                          disabled={cooldown > 0}
                          className="auth-inline-action"
                        >
                          {cooldown > 0 ? `${cooldown}s` : codeSent ? '重发' : '发送'}
                        </Button>
                      ) : null}
                    />
                  </Form.Item>

                  {emailVerificationEnabled && captchaEnabled && (
                    <Form.Item label="图形验证码" required>
                      <div className="auth-captcha-row">
                        <button
                          type="button"
                          className="auth-captcha-preview"
                          onClick={refreshCaptcha}
                          title="点击刷新验证码"
                          dangerouslySetInnerHTML={{ __html: captchaSvg || '' }}
                        />
                        <Form.Item name="captchaCode" noStyle>
                          <Input className="auth-input" placeholder="计算结果" autoComplete="off" />
                        </Form.Item>
                      </div>
                    </Form.Item>
                  )}

                  {emailVerificationEnabled && (
                    <Form.Item
                      name="code"
                      label="邮箱验证码"
                      rules={[
                        { required: true, message: '请输入6位验证码' },
                        { len: 6, message: '验证码为6位数字' },
                        { pattern: /^\d{6}$/, message: '验证码为6位数字' },
                      ]}
                    >
                      <Input
                        className="auth-input auth-code-input"
                        prefix={<NumberOutlined />}
                        placeholder="6位验证码"
                        maxLength={6}
                        inputMode="numeric"
                        autoComplete="one-time-code"
                      />
                    </Form.Item>
                  )}

                  <Form.Item
                    name="password"
                    label="密码"
                    rules={[
                      { required: true, message: '请输入密码' },
                      { min: 6, message: '密码至少6个字符' },
                      { max: 128, message: '密码长度异常' },
                    ]}
                  >
                    <Input.Password
                      className="auth-input"
                      prefix={<LockOutlined />}
                      placeholder="设置登录密码"
                      autoComplete="new-password"
                    />
                  </Form.Item>

                  <Form.Item
                    name="agreement"
                    valuePropName="checked"
                    className="auth-agreement-item"
                    rules={[
                      {
                        validator: (_, checked) => (
                          checked
                            ? Promise.resolve()
                            : Promise.reject(new Error('请先阅读并同意服务条款和隐私政策'))
                        ),
                      },
                    ]}
                  >
                    <Checkbox>
                      我已阅读并同意
                      <Link to="/terms" target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}> 服务条款 </Link>
                      和
                      <Link to="/privacy" target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}> 隐私政策</Link>
                    </Checkbox>
                  </Form.Item>

                  <Button
                    className="auth-submit-btn"
                    type="primary"
                    htmlType="submit"
                    loading={loading}
                    icon={<UserAddOutlined />}
                    block
                  >
                    注册
                  </Button>
                </Form>

                <div className="auth-link-stack">
                  <div>
                    <Text className="auth-muted-text">已有账号？</Text>
                    <Link to="/login" className="auth-main-link">立即登录</Link>
                  </div>
                </div>
              </>
            )}
          </div>
        </Card>
      </main>
    </div>
  );
};

export default RegisterPage;
