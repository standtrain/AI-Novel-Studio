import React, { useState, useEffect, useRef } from 'react';
import { Card, Form, Input, Button, Typography, message, Modal, Descriptions, Tag } from 'antd';
import { UserOutlined, LockOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { getCaptchaApi } from '../api/auth';
import { submitAppealApi } from '../api/admin';
import useMobile from '../hooks/useMobile';
import useSiteBrand from '../hooks/useSiteBrand';
import BrandIcon from '../components/shared/BrandIcon';

const { Title, Text } = Typography;

// 动态背景组件
const BackgroundEffects: React.FC = () => (
  <>
    {/* 主光晕 */}
    <div style={{
      position: 'absolute',
      top: '25%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: 500,
      height: 500,
      background: 'radial-gradient(circle, rgba(99,102,241,0.2) 0%, rgba(99,102,241,0.05) 40%, transparent 70%)',
      borderRadius: '50%',
      pointerEvents: 'none',
      animation: 'pulse 4s ease-in-out infinite',
    }} />
    {/* 辅助光晕 */}
    <div style={{
      position: 'absolute',
      bottom: '20%',
      right: '15%',
      width: 300,
      height: 300,
      background: 'radial-gradient(circle, rgba(139,92,246,0.15) 0%, transparent 70%)',
      borderRadius: '50%',
      pointerEvents: 'none',
      animation: 'pulse 5s ease-in-out infinite 1s',
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
        0%, 100% { opacity: 0.6; transform: translate(-50%, -50%) scale(1); }
        50% { opacity: 1; transform: translate(-50%, -50%) scale(1.1); }
      }
      @keyframes float {
        0%, 100% { transform: translateY(0px); }
        50% { transform: translateY(-10px); }
      }
    `}</style>
  </>
);

const LoginPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [focusedInput, setFocusedInput] = useState<string | null>(null);
  const [captchaEnabled, setCaptchaEnabled] = useState(false);
  const [captchaId, setCaptchaId] = useState<string | null>(null);
  const [captchaSvg, setCaptchaSvg] = useState<string | null>(null);
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();
  const isMobile = useMobile();
  const { siteName } = useSiteBrand();

  // 封禁信息弹窗
  const [banInfo, setBanInfo] = useState<any>(null);
  const [appealContent, setAppealContent] = useState('');
  const [appealSubmitting, setAppealSubmitting] = useState(false);
  const appealSubmittingRef = useRef(false);

  // 刷新验证码
  const refreshCaptcha = async () => {
    try {
      const res = await getCaptchaApi();
      setCaptchaEnabled(res.enabled);
      setCaptchaId(res.captchaId);
      setCaptchaSvg(res.svg);
    } catch {
      // 静默失败
    }
  };

  // 页面加载时获取验证码状态，并检查是否有保存的封禁信息
  useEffect(() => {
    refreshCaptcha();
    const saved = localStorage.getItem('banInfo');
    if (saved) {
      try {
        setBanInfo(JSON.parse(saved));
        localStorage.removeItem('banInfo');
      } catch { /* ignore */ }
    }
  }, []);

  const onFinish = async (values: { username: string; password: string; captchaCode?: string }) => {
    setLoading(true);
    try {
      await login(values.username, values.password, captchaId ?? undefined, values.captchaCode);
      message.success('登录成功');
      navigate('/home');
    } catch (err: any) {
      if (err.banInfo) {
        // 被封禁，显示详情弹窗
        setBanInfo({ ...err.banInfo, username: values.username });
      } else {
        message.error(err.message);
      }
      refreshCaptcha();
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitAppeal = async () => {
    if (!appealContent.trim()) { message.warning('请输入申诉内容'); return; }
    if (appealSubmittingRef.current) return;
    appealSubmittingRef.current = true;
    setAppealSubmitting(true);
    try {
      await submitAppealApi(banInfo.banId, banInfo.userId, appealContent.trim());
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

  // 输入框样式
  const getInputStyle = (name: string) => ({
    background: 'rgba(15,23,42,0.6)',
    borderColor: focusedInput === name ? '#6366f1' : 'rgba(99,102,241,0.3)',
    color: '#f1f5f9',
    height: 48,
    transition: 'all 0.3s ease',
    boxShadow: focusedInput === name ? '0 0 0 3px rgba(99,102,241,0.15), inset 0 1px 2px rgba(0,0,0,0.1)' : 'none',
  });

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

      <Card
        style={{
          width: isMobile ? 'calc(100vw - 32px)' : 420,
          maxWidth: 420,
          background: 'rgba(30,41,59,0.75)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(99,102,241,0.25)',
          borderRadius: 24,
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5), 0 0 80px rgba(99,102,241,0.15)',
        }}
        styles={{ body: { padding: isMobile ? 24 : 40 } }}
      >
        {/* Logo 区域 */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <BrandIcon size="lg" />
          <Title level={2} style={{
            color: '#f1f5f9',
            margin: 0,
            fontWeight: 700,
            letterSpacing: 0,
          }}>{siteName}</Title>
          <Text style={{ color: '#94a3b8', fontSize: 15, marginTop: 8, display: 'block' }}>
            登录以开始你的 AI 创作之旅
          </Text>
        </div>

        <Form onFinish={onFinish} size="large">
          <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input
              prefix={<UserOutlined style={{ color: '#6366f1', fontSize: 18 }} />}
              placeholder="用户名"
              onFocus={() => setFocusedInput('username')}
              onBlur={() => setFocusedInput(null)}
              style={getInputStyle('username')}
            />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password
              prefix={<LockOutlined style={{ color: '#6366f1', fontSize: 18 }} />}
              placeholder="密码"
              onFocus={() => setFocusedInput('password')}
              onBlur={() => setFocusedInput(null)}
              style={getInputStyle('password')}
            />
          </Form.Item>

          {/* 验证码区域（仅在管理员启用时显示） */}
          {captchaEnabled && (
            <Form.Item name="captchaCode" rules={[{ required: true, message: '请输入验证码结果' }]}>
              <div style={{ display: 'flex', gap: 12 }}>
                <div
                  style={{
                    flexShrink: 0,
                    cursor: 'pointer',
                    borderRadius: 8,
                    overflow: 'hidden',
                    border: '1px solid rgba(99,102,241,0.3)',
                    background: '#f0f2f5',
                    lineHeight: 0,
                    height: 48,
                  }}
                  dangerouslySetInnerHTML={{ __html: captchaSvg || '' }}
                  onClick={refreshCaptcha}
                  title="点击刷新验证码"
                />
                <Input
                  placeholder="验证码计算结果"
                  autoComplete="off"
                  onFocus={() => setFocusedInput('captchaCode')}
                  onBlur={() => setFocusedInput(null)}
                  style={{ ...getInputStyle('captchaCode'), flex: 1 }}
                />
              </div>
              </Form.Item>
          )}

          <Form.Item style={{ marginBottom: 16, marginTop: 32 }}>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              block
              style={{
                height: 52,
                fontSize: 16,
                fontWeight: 600,
                background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 50%, #7c3aed 100%)',
                border: 'none',
                borderRadius: 14,
                boxShadow: '0 4px 15px rgba(99,102,241,0.4), inset 0 1px 0 rgba(255,255,255,0.15)',
                transition: 'all 0.3s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 8px 25px rgba(99,102,241,0.5), inset 0 1px 0 rgba(255,255,255,0.2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 15px rgba(99,102,241,0.4), inset 0 1px 0 rgba(255,255,255,0.15)';
              }}
            >
              登录
            </Button>
          </Form.Item>
        </Form>

        <div style={{
          textAlign: 'center',
          paddingTop: 16,
          borderTop: '1px solid rgba(99,102,241,0.1)',
        }}>
          <Link
            to="/forgot-password"
            style={{
              color: '#64748b',
              fontSize: 13,
              transition: 'color 0.2s',
              display: 'block',
              marginBottom: 12,
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = '#f59e0b'}
            onMouseLeave={(e) => e.currentTarget.style.color = '#64748b'}
          >
            忘记密码？
          </Link>
          <Text style={{ color: '#64748b' }}>还没有账号？</Text>
          <Link
            to="/register"
            style={{
              color: '#818cf8',
              marginLeft: 8,
              fontWeight: 500,
              transition: 'color 0.2s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = '#a78bfa'}
            onMouseLeave={(e) => e.currentTarget.style.color = '#818cf8'}
          >
            立即注册 →
          </Link>
        </div>
      </Card>

      {/* 封禁信息弹窗 */}
      <Modal
        title={<span><ExclamationCircleOutlined style={{ color: '#ef4444' }} /> 账号已被禁用</span>}
        open={!!banInfo}
        onCancel={() => setBanInfo(null)}
        footer={null}
        width={500}
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
              <Descriptions.Item label="封禁原因">
                {banInfo.reason || '未提供原因'}
              </Descriptions.Item>
              <Descriptions.Item label="封禁时间">
                {new Date(banInfo.createdAt).toLocaleString('zh-CN')}
              </Descriptions.Item>
            </Descriptions>

            {banInfo.canAppeal ? (
              <div style={{ padding: 16, background: 'rgba(99,102,241,0.06)', borderRadius: 8 }}>
                <Text strong style={{ display: 'block', marginBottom: 8 }}>提交申诉</Text>
                <Input.TextArea
                  rows={4}
                  value={appealContent}
                  onChange={e => setAppealContent(e.target.value)}
                  placeholder="请详细说明申诉理由，管理员审核后将决定是否解封..."
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
            ) : banInfo.type === 'deactivate' ? (
              <div style={{ padding: 16, background: 'rgba(100,116,139,0.1)', borderRadius: 8, textAlign: 'center' }}>
                <Text type="secondary">
                  自助注销的账号不支持在线申诉，如需恢复请联系管理员
                </Text>
              </div>
            ) : (
              <div style={{ padding: 16, background: 'rgba(100,116,139,0.1)', borderRadius: 8, textAlign: 'center' }}>
                <Text type="secondary">
                  请通过站内消息、邮件或其他联系方式联系管理员申请恢复账号
                </Text>
              </div>
            )}

            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <Text type="secondary">如需其他帮助，请联系管理员</Text>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default LoginPage;
