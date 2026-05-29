import React, { useState } from 'react';
import {
  Card, Form, Input, Button, Typography, message, Divider, Popconfirm, Space,
} from 'antd';
import { UserOutlined, MailOutlined, LockOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import client from '../api/client';

const { Title, Text } = Typography;

const SettingsPage: React.FC = () => {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  // 邮箱修改
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailForm] = Form.useForm();

  // 密码修改
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordForm] = Form.useForm();

  // 注销
  const [cancelLoading, setCancelLoading] = useState(false);

  const handleUpdateEmail = async (values: { email: string }) => {
    setEmailLoading(true);
    try {
      await client.put('/auth/me', { email: values.email });
      message.success('邮箱修改成功');
      emailForm.resetFields();
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

      {/* 邮箱 */}
      <Card
        title={<span style={{ color: '#f1f5f9' }}><MailOutlined /> 修改邮箱</span>}
        style={{
          marginBottom: 16,
          background: 'rgba(30,41,59,0.6)',
          border: '1px solid rgba(99,102,241,0.2)',
          borderRadius: 12
        }}
        styles={{ body: { color: '#cbd5e1' } }}
      >
        <Form form={emailForm} layout="vertical" onFinish={handleUpdateEmail}>
          <Form.Item label={<span style={{ color: '#cbd5e1' }}>当前邮箱</span>}>
            <Input value={user?.email || ''} disabled placeholder="当前邮箱" style={{ background: 'rgba(15,23,42,0.5)', borderColor: 'rgba(99,102,241,0.3)', color: '#94a3b8' }} />
          </Form.Item>
          <Form.Item name="email" label={<span style={{ color: '#cbd5e1' }}>新邮箱</span>} rules={[{ required: true, message: '请输入新邮箱地址' }, { type: 'email', message: '请输入有效的邮箱格式' }]}>
            <Input placeholder="输入新邮箱地址" style={{ background: 'rgba(15,23,42,0.5)', borderColor: 'rgba(99,102,241,0.3)', color: '#f1f5f9' }} />
          </Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            loading={emailLoading}
            style={{ background: 'linear-gradient(135deg, var(--lp-primary) 0%, var(--lp-primary-dark) 100%)', border: 'none' }}
          >
            保存
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
          <Button
            type="primary"
            htmlType="submit"
            loading={passwordLoading}
            style={{ background: 'linear-gradient(135deg, var(--lp-primary) 0%, var(--lp-primary-dark) 100%)', border: 'none' }}
          >
            修改密码
          </Button>
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
    </div>
  );
};

export default SettingsPage;
