import React, { useEffect, useRef, useState } from 'react';
import { Button, Card, Descriptions, Form, Input, Modal, Segmented, Space, Tag, Typography, message } from 'antd';
import {
  ExclamationCircleOutlined,
  LockOutlined,
  LoginOutlined,
  MailOutlined,
  NumberOutlined,
  RocketOutlined,
  SafetyCertificateOutlined,
  SendOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { getCaptchaApi, getEmailVerificationStatusApi, loginWithEmailCodeApi, sendVerifyCodeApi } from '../api/auth';
import { submitAppealApi } from '../api/admin';
import useMobile from '../hooks/useMobile';
import useSiteBrand from '../hooks/useSiteBrand';
import BrandIcon from '../components/shared/BrandIcon';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

const LoginPage: React.FC = () => {
  const [form] = Form.useForm();
  const [loginMode, setLoginMode] = useState<'password' | 'email'>('password');
  const [loading, setLoading] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [captchaEnabled, setCaptchaEnabled] = useState(false);
  const [captchaId, setCaptchaId] = useState<string | null>(null);
  const [captchaSvg, setCaptchaSvg] = useState<string | null>(null);
  const [emailVerificationEnabled, setEmailVerificationEnabled] = useState(false);
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();
  const isMobile = useMobile();
  const { siteName, siteDescription } = useSiteBrand();

  const [banInfo, setBanInfo] = useState<any>(null);
  const [appealContent, setAppealContent] = useState('');
  const [appealSubmitting, setAppealSubmitting] = useState(false);
  const appealSubmittingRef = useRef(false);

  const refreshCaptcha = async () => {
    try {
      const res = await getCaptchaApi();
      setCaptchaEnabled(res.enabled);
      setCaptchaId(res.captchaId);
      setCaptchaSvg(res.svg);
    } catch {
      // 验证码状态加载失败不阻塞登录页展示。
    }
  };

  useEffect(() => {
    refreshCaptcha();
    getEmailVerificationStatusApi()
      .then(res => setEmailVerificationEnabled(res.enabled))
      .catch(() => setEmailVerificationEnabled(false));
    const saved = localStorage.getItem('banInfo');
    if (!saved) return;
    try {
      setBanInfo(JSON.parse(saved));
      localStorage.removeItem('banInfo');
    } catch {
      localStorage.removeItem('banInfo');
    }
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => setCooldown(c => c - 1), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  const handleSendEmailCode = async () => {
    if (!emailVerificationEnabled) {
      message.warning('邮箱验证码功能未启用');
      return;
    }

    try {
      await form.validateFields(['email']);
    } catch {
      message.warning('请先输入有效的邮箱地址');
      return;
    }

    const captchaCode = String(form.getFieldValue('captchaCode') || '').trim();
    if (captchaEnabled && !captchaCode) {
      message.warning('请先填写图形验证码');
      return;
    }

    setSendingCode(true);
    try {
      const email = String(form.getFieldValue('email') || '').trim();
      const result = await sendVerifyCodeApi(email, 'login', captchaId ?? undefined, captchaCode || undefined);
      setCodeSent(true);
      setCooldown(60);
      message.success(result.message || '验证码已发送至邮箱');
    } catch (err: any) {
      message.error(err.response?.data?.error || '发送验证码失败');
    } finally {
      setSendingCode(false);
      form.setFieldValue('captchaCode', '');
      await refreshCaptcha();
    }
  };

  const onFinish = async (values: { username?: string; password?: string; email?: string; code?: string; captchaCode?: string }) => {
    setLoading(true);
    try {
      if (loginMode === 'email') {
        const result = await loginWithEmailCodeApi(
          String(values.email || '').trim(),
          String(values.code || '').trim(),
          captchaId ?? undefined,
          values.captchaCode
        );
        useAuthStore.getState().setUser(result.user, result.token);
      } else {
        await login(String(values.username || '').trim(), String(values.password || ''), captchaId ?? undefined, values.captchaCode);
      }
      message.success('登录成功');
      navigate('/home');
    } catch (err: any) {
      if (err.banInfo) {
        setBanInfo({ ...err.banInfo, username: values.username });
      } else {
        message.error(err.message || '登录失败');
      }
      refreshCaptcha();
    } finally {
      setLoading(false);
    }
  };

  const switchLoginMode = (mode: 'password' | 'email') => {
    setLoginMode(mode);
    setCodeSent(false);
    setCooldown(0);
    form.resetFields();
    refreshCaptcha();
  };

  const handleSubmitAppeal = async () => {
    const content = appealContent.trim();
    if (content.length < 5) {
      message.warning('申诉内容至少需要5个字符');
      return;
    }
    if (appealSubmittingRef.current) return;
    appealSubmittingRef.current = true;
    setAppealSubmitting(true);
    try {
      await submitAppealApi(banInfo.banId, banInfo.userId, content);
      message.success('申诉已提交，请等待管理员审核');
      setBanInfo(null);
      setAppealContent('');
    } catch (err: any) {
      message.error(err?.response?.data?.error || '提交申诉失败');
    } finally {
      appealSubmittingRef.current = false;
      setAppealSubmitting(false);
    }
  };

  return (
    <div className="auth-page-shell auth-page-login">
      <div className="auth-bg-grid" />
      <main className="auth-layout">
        <section className="auth-intro" aria-label="登录说明">
          <div className="auth-brand-chip">
            <BrandIcon size="sm" />
            <span>{siteName}</span>
          </div>
          <Title className="auth-title">欢迎回来</Title>
          {siteDescription && <Paragraph className="auth-subtitle">{siteDescription}</Paragraph>}
          <div className="auth-benefit-grid">
            <div className="auth-benefit-item">
              <RocketOutlined />
              <span>快速回到创作进度</span>
            </div>
            <div className="auth-benefit-item">
              <SafetyCertificateOutlined />
              <span>账号与会话安全保护</span>
            </div>
          </div>
        </section>

        <Card className="auth-card" styles={{ body: { padding: 0 } }}>
          <div className="auth-card-inner">
            <div className="auth-card-header">
              <BrandIcon size="md" />
              <div>
                <Title level={2} className="auth-card-title">登录账号</Title>
                <Text className="auth-card-subtitle">使用你的账号继续创作</Text>
              </div>
            </div>

            <Form form={form} className="auth-form" onFinish={onFinish} size="large" layout="vertical">
              <Segmented
                block
                value={loginMode}
                onChange={(value) => switchLoginMode(value as 'password' | 'email')}
                options={[
                  { label: '密码登录', value: 'password' },
                  { label: '邮箱验证码', value: 'email', disabled: !emailVerificationEnabled },
                ]}
                style={{ marginBottom: 18 }}
              />

              {loginMode === 'password' ? (
                <>
                  <Form.Item
                    name="username"
                    label="用户名或邮箱"
                    rules={[{ required: true, message: '请输入用户名或邮箱' }, { max: 120, message: '账号长度异常' }]}
                  >
                    <Input
                      className="auth-input"
                      prefix={<UserOutlined />}
                      placeholder="输入用户名或邮箱"
                      autoComplete="username"
                    />
                  </Form.Item>

                  <Form.Item
                    name="password"
                    label="密码"
                    rules={[{ required: true, message: '请输入密码' }, { max: 128, message: '密码长度异常' }]}
                  >
                    <Input.Password
                      className="auth-input"
                      prefix={<LockOutlined />}
                      placeholder="输入密码"
                      autoComplete="current-password"
                    />
                  </Form.Item>
                </>
              ) : (
                <>
                  <Form.Item
                    name="email"
                    label="邮箱"
                    rules={[
                      { required: true, message: '请输入邮箱' },
                      { type: 'email', message: '请输入有效的邮箱' },
                      { max: 120, message: '邮箱长度异常' },
                    ]}
                  >
                    <Input
                      className="auth-input"
                      prefix={<MailOutlined />}
                      placeholder="输入邮箱地址"
                      autoComplete="email"
                      suffix={(
                        <Button
                          type="link"
                          size="small"
                          icon={<SendOutlined />}
                          loading={sendingCode}
                          onClick={handleSendEmailCode}
                          disabled={cooldown > 0}
                          className="auth-inline-action"
                        >
                          {cooldown > 0 ? `${cooldown}s` : codeSent ? '重发' : '发送'}
                        </Button>
                      )}
                    />
                  </Form.Item>

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
                </>
              )}

              {captchaEnabled && (
                <Form.Item label="图形验证码" required>
                  <div className="auth-captcha-row">
                    <button
                      type="button"
                      className="auth-captcha-preview"
                      onClick={refreshCaptcha}
                      title="点击刷新验证码"
                      dangerouslySetInnerHTML={{ __html: captchaSvg || '' }}
                    />
                    <Form.Item
                      name="captchaCode"
                      noStyle
                      rules={[{ required: true, message: '请输入验证码结果' }, { max: 12, message: '验证码长度异常' }]}
                    >
                      <Input className="auth-input" placeholder="计算结果" autoComplete="off" />
                    </Form.Item>
                  </div>
                </Form.Item>
              )}

              <Button
                className="auth-submit-btn"
                type="primary"
                htmlType="submit"
                loading={loading}
                icon={<LoginOutlined />}
                block
              >
                登录
              </Button>
            </Form>

            <div className="auth-link-stack">
              <Link to="/forgot-password" className="auth-muted-link">忘记密码？</Link>
              <div>
                <Text className="auth-muted-text">还没有账号？</Text>
                <Link to="/register" className="auth-main-link">立即注册</Link>
              </div>
            </div>
          </div>
        </Card>
      </main>

      <Modal
        title={<span><ExclamationCircleOutlined style={{ color: '#ef4444' }} /> 账号已被禁用</span>}
        open={!!banInfo}
        onCancel={() => setBanInfo(null)}
        footer={null}
        width={isMobile ? '92vw' : 520}
        destroyOnClose
      >
        {banInfo && (
          <div>
            <Descriptions column={1} size="small" bordered style={{ marginBottom: 16 }}>
              <Descriptions.Item label="禁用类型">
                <Tag color={banInfo.type === 'ban' ? 'red' : 'default'}>
                  {banInfo.type === 'ban' ? '管理员封禁' : '账号注销'}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="封禁原因">{banInfo.reason || '未提供原因'}</Descriptions.Item>
              <Descriptions.Item label="封禁时间">
                {new Date(banInfo.createdAt).toLocaleString('zh-CN')}
              </Descriptions.Item>
            </Descriptions>

            {banInfo.canAppeal ? (
              <div className="auth-helper-panel">
                <Text strong style={{ display: 'block', marginBottom: 8 }}>提交申诉</Text>
                <TextArea
                  rows={4}
                  maxLength={2000}
                  showCount
                  value={appealContent}
                  onChange={e => setAppealContent(e.target.value)}
                  placeholder="请说明申诉理由，管理员审核后将决定是否解封"
                  style={{ marginBottom: 12 }}
                />
                <Button
                  type="primary"
                  icon={<ExclamationCircleOutlined />}
                  loading={appealSubmitting}
                  onClick={handleSubmitAppeal}
                  block
                >
                  提交申诉
                </Button>
              </div>
            ) : (
              <div className="auth-helper-panel auth-helper-muted">
                <Text type="secondary">
                  {banInfo.type === 'deactivate'
                    ? '自助注销的账号不支持在线申诉，如需恢复请联系管理员'
                    : '请通过站内消息、邮件或其他联系方式联系管理员申请恢复账号'}
                </Text>
              </div>
            )}

            <Space direction="vertical" size={4} style={{ width: '100%', textAlign: 'center', marginTop: 16 }}>
              <Text type="secondary">如需其他帮助，请联系管理员</Text>
            </Space>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default LoginPage;
