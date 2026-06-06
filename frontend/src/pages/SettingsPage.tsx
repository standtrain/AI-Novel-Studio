import React, { useState, useEffect } from 'react';
import {
  Card, Form, Input, Button, Typography, message, Modal, Popconfirm, Space,
} from 'antd';
import { UserOutlined, MailOutlined, LockOutlined, ExclamationCircleOutlined, ClockCircleOutlined, CalendarOutlined, SendOutlined, NumberOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { sendChangeEmailCodeApi, changeEmailApi, getCaptchaApi, sendVerifyCodeApi, resetPasswordApi } from '../api/auth';
import client from '../api/client';

const { Title, Text } = Typography;

const SettingsPage: React.FC = () => {
  const { user, token, logout, setUser } = useAuthStore();
  const navigate = useNavigate();

  // 邮箱修改
  const [emailForm] = Form.useForm();
  const [emailLoading, setEmailLoading] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [captchaEnabled, setCaptchaEnabled] = useState(false);
  const [captchaId, setCaptchaId] = useState<string | null>(null);
  const [captchaSvg, setCaptchaSvg] = useState<string | null>(null);

  // 密码修改
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordForm] = Form.useForm();

  // 忘记密码弹窗
  const [forgotModalOpen, setForgotModalOpen] = useState(false);
  const [forgotStep, setForgotStep] = useState<'send' | 'reset'>('send');
  const [forgotSending, setForgotSending] = useState(false);
  const [forgotCooldown, setForgotCooldown] = useState(0);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotCaptchaEnabled, setForgotCaptchaEnabled] = useState(false);
  const [forgotCaptchaId, setForgotCaptchaId] = useState<string | null>(null);
  const [forgotCaptchaSvg, setForgotCaptchaSvg] = useState<string | null>(null);
  const [forgotForm] = Form.useForm();

  // 注销
  const [cancelLoading, setCancelLoading] = useState(false);

  // 忘记密码 — 冷却倒计时
  useEffect(() => {
    if (forgotCooldown <= 0) return;
    const timer = setInterval(() => setForgotCooldown(c => c - 1), 1000);
    return () => clearInterval(timer);
  }, [forgotCooldown > 0]);

  // 打开忘记密码弹窗
  const openForgotModal = async () => {
    setForgotStep('send');
    forgotForm.resetFields();
    setForgotCooldown(0);
    try {
      const res = await getCaptchaApi();
      setForgotCaptchaEnabled(res.enabled);
      setForgotCaptchaId(res.captchaId);
      setForgotCaptchaSvg(res.svg);
    } catch { /* 静默 */ }
    setForgotModalOpen(true);
  };

  // 忘记密码 — 发送验证码
  const handleForgotSendCode = async () => {
    let captchaCodeVal: string | undefined;
    if (forgotCaptchaEnabled) {
      const capInput = document.getElementById('forgot-captcha-input') as HTMLInputElement;
      captchaCodeVal = capInput?.value;
      if (!captchaCodeVal) { message.warning('请先填写图形验证码'); return; }
    }
    setForgotSending(true);
    try {
      const result = await sendVerifyCodeApi(user!.email, 'reset_password', forgotCaptchaId ?? undefined, captchaCodeVal);
      if (result.message && result.message.includes('如果该邮箱已注册')) {
        message.warning(result.message);
        return;
      }
      setForgotStep('reset');
      setForgotCooldown(60);
      message.success(result.message || '验证码已发送至您的邮箱');
    } catch (err: any) {
      message.error(err.response?.data?.error || '发送验证码失败');
    } finally {
      setForgotSending(false);
      const capInput = document.getElementById('forgot-captcha-input') as HTMLInputElement;
      if (capInput) capInput.value = '';
      try {
        const res = await getCaptchaApi();
        setForgotCaptchaEnabled(res.enabled);
        setForgotCaptchaId(res.captchaId);
        setForgotCaptchaSvg(res.svg);
      } catch { /* 静默 */ }
    }
  };

  // 忘记密码 — 重置密码
  const handleForgotReset = async (values: { code: string; newPassword: string }) => {
    setForgotLoading(true);
    try {
      await resetPasswordApi(user!.email, values.code, values.newPassword);
      message.success('密码重置成功，请重新登录');
      setForgotModalOpen(false);
      setTimeout(() => { logout(); navigate('/login'); }, 1500);
    } catch (err: any) {
      message.error(err.response?.data?.error || '重置失败');
    } finally {
      setForgotLoading(false);
    }
  };

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

  // 发送新邮箱验证码
  const handleSendChangeEmailCode = async () => {
    const newEmail = emailForm.getFieldValue('newEmail');
    if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      message.warning('请先输入有效的新邮箱地址');
      return;
    }
    if (newEmail === user?.email) {
      message.warning('新邮箱与当前邮箱相同');
      return;
    }
    if (captchaEnabled) {
      const capInput = document.getElementById('settings-captcha-input') as HTMLInputElement;
      if (!capInput?.value) {
        message.warning('请先填写图形验证码');
        return;
      }
    }
    setSendingCode(true);
    try {
      await sendChangeEmailCodeApi(newEmail);
      setCodeSent(true);
      setCooldown(60);
      message.success('验证码已发送至新邮箱');
    } catch (err: any) {
      message.error(err.response?.data?.error || '发送验证码失败');
    } finally {
      setSendingCode(false);
      const capInput = document.getElementById('settings-captcha-input') as HTMLInputElement;
      if (capInput) capInput.value = '';
      await refreshCaptcha();
    }
  };

  // 确认修改邮箱（验证码校验）
  const handleConfirmChangeEmail = async (values: { newEmail: string; code: string }) => {
    setEmailLoading(true);
    try {
      const result = await changeEmailApi(values.newEmail, values.code);
      message.success('邮箱修改成功');
      setUser(result.user, token!);
      emailForm.resetFields();
      setCodeSent(false);
    } catch (err: any) {
      message.error(err.response?.data?.error || '修改失败');
    } finally {
      setEmailLoading(false);
    }
  };

  const handleChangePassword = async (values: { currentPassword: string; newPassword: string }) => {
    setPasswordLoading(true);
    try {
      await client.put('/auth/me', {
        currentPassword: values.currentPassword,
        password: values.newPassword,
      });
      message.success('密码修改成功，请重新登录');
      passwordForm.resetFields();
      setTimeout(() => { logout(); navigate('/login'); }, 1500);
    } catch (err: any) {
      message.error(err.response?.data?.error || '修改失败');
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleCancel = async () => {
    setCancelLoading(true);
    try {
      await client.post('/auth/cancel');
      message.success('账号已注销');
      logout();
      navigate('/login');
    } catch {
      message.error('注销失败');
    } finally {
      setCancelLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 500 }}>
      <Title level={4} style={{ color: '#f1f5f9' }}>个人设置</Title>

      {/* 账户信息 */}
      <Card
        title={<span style={{ color: '#f1f5f9' }}><UserOutlined /> 账户信息</span>}
        style={{
          marginBottom: 16,
          background: 'rgba(30,41,59,0.6)',
          border: '1px solid rgba(99,102,241,0.2)',
          borderRadius: 12,
        }}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Text style={{ color: '#94a3b8' }}>用户名</Text>
            <Text style={{ color: '#f1f5f9' }}>{user?.username}</Text>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Text style={{ color: '#94a3b8' }}>角色</Text>
            <Text style={{ color: '#f1f5f9' }}>{user?.group?.name === 'admin' ? '管理员' : '普通用户'}</Text>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Text style={{ color: '#94a3b8' }}><CalendarOutlined /> 注册时间</Text>
            <Text style={{ color: '#f1f5f9' }}>
              {user?.createdAt ? new Date(user.createdAt).toLocaleString('zh-CN') : '-'}
            </Text>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Text style={{ color: '#94a3b8' }}><ClockCircleOutlined /> 最后登录</Text>
            <Text style={{ color: '#f1f5f9' }}>
              {user?.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString('zh-CN') : '暂无记录'}
            </Text>
          </div>
        </Space>
      </Card>

      {/* 邮箱 */}
      <Card
        title={<span style={{ color: '#f1f5f9' }}><MailOutlined /> 修改邮箱</span>}
        style={{
          marginBottom: 16,
          background: 'rgba(30,41,59,0.6)',
          border: '1px solid rgba(99,102,241,0.2)',
          borderRadius: 12
        }}
      >
        <Form form={emailForm} layout="vertical" onFinish={handleConfirmChangeEmail}>
          <Form.Item label={<span style={{ color: '#cbd5e1' }}>当前邮箱</span>}>
            <Input value={user?.email || ''} disabled style={{ background: 'rgba(15,23,42,0.5)', borderColor: 'rgba(99,102,241,0.3)', color: '#94a3b8' }} />
          </Form.Item>

          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <Form.Item name="newEmail" label={<span style={{ color: '#cbd5e1' }}>新邮箱</span>} rules={[{ required: true, message: '请输入新邮箱地址' }, { type: 'email', message: '请输入有效的邮箱格式' }]} style={{ flex: 1 }}>
              <Input placeholder="输入新邮箱地址" style={{ background: 'rgba(15,23,42,0.5)', borderColor: 'rgba(99,102,241,0.3)', color: '#f1f5f9' }} />
            </Form.Item>
            <Button icon={<SendOutlined />} loading={sendingCode} disabled={cooldown > 0} onClick={handleSendChangeEmailCode}
              style={{ marginTop: 30, color: cooldown > 0 ? '#64748b' : '#22d3ee', borderColor: cooldown > 0 ? 'rgba(100,116,139,0.3)' : 'rgba(34,211,238,0.4)', background: 'rgba(34,211,238,0.08)' }}>
              {cooldown > 0 ? `${cooldown}s` : codeSent ? '重新发送' : '发送验证码'}
            </Button>
          </div>

          {/* 图形验证码 */}
          {captchaEnabled && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', gap: 12 }}>
                <div
                  style={{ flexShrink: 0, cursor: 'pointer', borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(99,102,241,0.3)', background: '#f0f2f5', lineHeight: 0, height: 40 }}
                  dangerouslySetInnerHTML={{ __html: captchaSvg || '' }}
                  onClick={refreshCaptcha}
                  title="点击刷新验证码"
                />
                <Input id="settings-captcha-input" placeholder="验证码计算结果" autoComplete="off"
                  style={{ background: 'rgba(15,23,42,0.5)', borderColor: 'rgba(99,102,241,0.3)', color: '#f1f5f9', flex: 1 }} />
              </div>
            </div>
          )}

          <Form.Item name="code" label={<span style={{ color: '#cbd5e1' }}>验证码</span>} rules={[{ required: true, message: '请输入6位验证码' }, { len: 6, message: '验证码为6位数字' }]}>
            <Input prefix={<NumberOutlined style={{ color: '#22d3ee' }} />} placeholder="输入邮件中的6位验证码" maxLength={6}
              style={{ background: 'rgba(15,23,42,0.5)', borderColor: 'rgba(99,102,241,0.3)', color: '#f1f5f9', letterSpacing: 4, fontFamily: 'monospace', fontSize: 18, textAlign: 'center' }} />
          </Form.Item>

          <Button type="primary" htmlType="submit" loading={emailLoading}
            style={{ background: 'linear-gradient(135deg, var(--lp-primary) 0%, var(--lp-primary-dark) 100%)', border: 'none' }}>
            确认修改
          </Button>
        </Form>
      </Card>

      {/* 密码 */}
      <Card
        title={<span style={{ color: '#f1f5f9' }}><LockOutlined /> 修改密码</span>}
        style={{
          marginBottom: 16,
          background: 'rgba(30,41,59,0.6)',
          border: '1px solid rgba(99,102,241,0.2)',
          borderRadius: 12
        }}
      >
        <Form form={passwordForm} layout="vertical" onFinish={handleChangePassword}>
          <Form.Item name="currentPassword" label={<span style={{ color: '#cbd5e1' }}>当前密码</span>} rules={[{ required: true }]}>
            <Input.Password placeholder="输入当前密码" style={{ background: 'rgba(15,23,42,0.5)', borderColor: 'rgba(99,102,241,0.3)', color: '#f1f5f9' }} />
          </Form.Item>
          <Form.Item name="newPassword" label={<span style={{ color: '#cbd5e1' }}>新密码</span>} rules={[{ required: true, min: 6, message: '至少6个字符' }]}>
            <Input.Password placeholder="输入新密码" style={{ background: 'rgba(15,23,42,0.5)', borderColor: 'rgba(99,102,241,0.3)', color: '#f1f5f9' }} />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            label={<span style={{ color: '#cbd5e1' }}>确认新密码</span>}
            dependencies={['newPassword']}
            rules={[
              { required: true },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('newPassword') === value) return Promise.resolve();
                  return Promise.reject(new Error('两次密码不一致'));
                },
              }),
            ]}
          >
            <Input.Password placeholder="再次输入新密码" style={{ background: 'rgba(15,23,42,0.5)', borderColor: 'rgba(99,102,241,0.3)', color: '#f1f5f9' }} />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Button
              type="primary"
              htmlType="submit"
              loading={passwordLoading}
              style={{ background: 'linear-gradient(135deg, var(--lp-primary) 0%, var(--lp-primary-dark) 100%)', border: 'none' }}
            >
              修改密码
            </Button>
            <Button type="link" style={{ color: '#f59e0b', fontSize: 13, padding: 0 }} onClick={openForgotModal}>
              使用邮箱修改密码
            </Button>
          </div>
        </Form>
      </Card>

      {/* 注销 */}
      <Card
        title={<span style={{ color: '#ff4d4f' }}><ExclamationCircleOutlined /> 危险操作</span>}
        style={{
          background: 'rgba(30,41,59,0.6)',
          border: '1px solid rgba(255,77,79,0.2)',
          borderRadius: 12
        }}
      >
        <Text style={{ color: '#94a3b8' }}>
          注销后账号将被禁用，您将无法登录。如需恢复请联系管理员。
        </Text>
        <div style={{ marginTop: 16 }}>
          <Popconfirm
            title="确认注销账号？注销后将无法登录。"
            onConfirm={handleCancel}
            okText="确认注销"
            cancelText="取消"
            okButtonProps={{ danger: true }}
          >
            <Button danger loading={cancelLoading}>
              注销账号
            </Button>
          </Popconfirm>
        </div>
      </Card>

      {/* 忘记密码弹窗 */}
      <Modal
        title={<span style={{ color: '#f1f5f9' }}>使用邮箱修改密码</span>}
        open={forgotModalOpen}
        onCancel={() => setForgotModalOpen(false)}
        footer={null}
        destroyOnClose
        styles={{
          header: { background: '#1e293b', borderBottom: '1px solid rgba(99,102,241,0.15)' },
          body: { background: '#1e293b', padding: 24 },
          content: { background: '#1e293b' },
        }}
      >
        {/* 步骤一：发送验证码 */}
        {forgotStep === 'send' && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <Text style={{ color: '#94a3b8', fontSize: 13 }}>验证码将发送至您的注册邮箱</Text>
              <Input value={user?.email || ''} disabled style={{ marginTop: 6, background: 'rgba(15,23,42,0.5)', borderColor: 'rgba(99,102,241,0.3)', color: '#94a3b8' }} />
            </div>
            {forgotCaptchaEnabled && (
              <div style={{ marginBottom: 16, display: 'flex', gap: 12 }}>
                <div
                  style={{ flexShrink: 0, cursor: 'pointer', borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(99,102,241,0.3)', background: '#f0f2f5', lineHeight: 0, height: 40 }}
                  dangerouslySetInnerHTML={{ __html: forgotCaptchaSvg || '' }}
                  onClick={async () => {
                    try {
                      const res = await getCaptchaApi();
                      setForgotCaptchaEnabled(res.enabled);
                      setForgotCaptchaId(res.captchaId);
                      setForgotCaptchaSvg(res.svg);
                    } catch { /* 静默 */ }
                  }}
                  title="点击刷新验证码"
                />
                <Input id="forgot-captcha-input" placeholder="验证码计算结果" autoComplete="off"
                  style={{ background: 'rgba(15,23,42,0.5)', borderColor: 'rgba(99,102,241,0.3)', color: '#f1f5f9', flex: 1 }} />
              </div>
            )}
            <Button type="primary" block loading={forgotSending} disabled={forgotCooldown > 0}
              onClick={handleForgotSendCode}
              style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', border: 'none', height: 44 }}>
              {forgotCooldown > 0 ? `请等待 ${forgotCooldown} 秒后重新发送` : '发送验证码'}
            </Button>
          </div>
        )}

        {/* 步骤二：输入验证码和新密码 */}
        {forgotStep === 'reset' && (
          <Form form={forgotForm} layout="vertical" onFinish={handleForgotReset}>
            <div style={{ marginBottom: 16 }}>
              <Text style={{ color: '#94a3b8', fontSize: 13 }}>验证码已发送至 <Text strong style={{ color: '#f1f5f9' }}>{user?.email}</Text></Text>
            </div>
            <Form.Item name="code" label={<span style={{ color: '#cbd5e1' }}>验证码</span>} rules={[{ required: true, message: '请输入6位验证码' }, { len: 6, message: '验证码为6位数字' }]}>
              <Input prefix={<NumberOutlined style={{ color: '#f59e0b' }} />} placeholder="输入邮件中的6位验证码" maxLength={6}
                style={{ background: 'rgba(15,23,42,0.5)', borderColor: 'rgba(99,102,241,0.3)', color: '#f1f5f9', letterSpacing: 4, fontFamily: 'monospace', fontSize: 18, textAlign: 'center' }} />
            </Form.Item>
            <Form.Item name="newPassword" label={<span style={{ color: '#cbd5e1' }}>新密码</span>} rules={[{ required: true, min: 6, message: '密码至少6个字符' }]}>
              <Input.Password placeholder="输入新密码" style={{ background: 'rgba(15,23,42,0.5)', borderColor: 'rgba(99,102,241,0.3)', color: '#f1f5f9' }} />
            </Form.Item>
            <Form.Item name="confirmPassword" label={<span style={{ color: '#cbd5e1' }}>确认新密码</span>}
              dependencies={['newPassword']}
              rules={[
                { required: true, message: '请再次输入新密码' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('newPassword') === value) return Promise.resolve();
                    return Promise.reject(new Error('两次密码不一致'));
                  },
                }),
              ]}
            >
              <Input.Password placeholder="再次输入新密码" style={{ background: 'rgba(15,23,42,0.5)', borderColor: 'rgba(99,102,241,0.3)', color: '#f1f5f9' }} />
            </Form.Item>
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <Button onClick={() => { setForgotStep('send'); forgotForm.resetFields(); }}>返回上一步</Button>
              <Button type="primary" htmlType="submit" loading={forgotLoading}
                style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', border: 'none' }}>
                重置密码
              </Button>
            </Space>
          </Form>
        )}
      </Modal>
    </div>
  );
};

export default SettingsPage;
