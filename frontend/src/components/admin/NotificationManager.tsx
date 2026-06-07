import React, { useState, useEffect, useCallback } from 'react';
import { Table, Button, Modal, Form, Input, Switch, InputNumber, Space, Tag, message, Popconfirm } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, BellOutlined } from '@ant-design/icons';
import { getNotificationsApi, createNotificationApi, updateNotificationApi, deleteNotificationApi } from '../../api/admin';
import type { Notification } from '../../types';

const { TextArea } = Input;

const NotificationManager: React.FC = () => {
  const [data, setData] = useState<Notification[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  const fetchData = useCallback(async (p?: number) => {
    setLoading(true);
    try {
      const res = await getNotificationsApi({ page: p || page, limit: 20 });
      setData(res.rows);
      setTotal(res.total);
    } catch { message.error('获取通知列表失败'); }
    finally { setLoading(false); }
  }, [page]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openCreate = () => {
    setEditingId(null);
    form.resetFields();
    form.setFieldsValue({ show_popup: false, show_banner: true, enabled: true, sort_order: 0 });
    setModalOpen(true);
  };

  const openEdit = (record: Notification) => {
    setEditingId(record.id);
    form.setFieldsValue(record);
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      if (editingId) {
        await updateNotificationApi(editingId, values);
        message.success('通知已更新');
      } else {
        await createNotificationApi(values);
        message.success('通知已创建');
      }
      setModalOpen(false);
      fetchData();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.response?.data?.error || '操作失败');
    } finally { setSubmitting(false); }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteNotificationApi(id);
      message.success('通知已删除');
      fetchData();
    } catch { message.error('删除失败'); }
  };

  const toggleSwitch = async (record: Notification, field: 'enabled' | 'show_popup' | 'show_banner', value: boolean) => {
    try {
      await updateNotificationApi(record.id, { [field]: value });
      message.success('已更新');
      fetchData();
    } catch { message.error('更新失败'); }
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '标题', dataIndex: 'title', ellipsis: true, width: 180 },
    {
      title: '内容', dataIndex: 'content', ellipsis: true, width: 260,
      render: (v: string) => <span style={{ color: '#94a3b8' }}>{v}</span>,
    },
    {
      title: '弹窗', dataIndex: 'show_popup', width: 70,
      render: (v: boolean, record: Notification) => (
        <Switch size="small" checked={v} onChange={(val) => toggleSwitch(record, 'show_popup', val)} />
      ),
    },
    {
      title: '滚动栏', dataIndex: 'show_banner', width: 80,
      render: (v: boolean, record: Notification) => (
        <Switch size="small" checked={v} onChange={(val) => toggleSwitch(record, 'show_banner', val)} />
      ),
    },
    {
      title: '启用', dataIndex: 'enabled', width: 70,
      render: (v: boolean, record: Notification) => (
        <Switch size="small" checked={v} onChange={(val) => toggleSwitch(record, 'enabled', val)} />
      ),
    },
    {
      title: '排序', dataIndex: 'sort_order', width: 70, align: 'center' as const,
    },
    {
      title: '创建时间', dataIndex: 'created_at', width: 150,
      render: (v: string) => new Date(v).toLocaleString('zh-CN').slice(0, -3),
    },
    {
      title: '操作', width: 130,
      render: (_: any, record: Notification) => (
        <Space size="small">
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>
            编辑
          </Button>
          <Popconfirm title="确定删除此通知？" onConfirm={() => handleDelete(record.id)} okText="删除" cancelText="取消">
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ color: '#94a3b8', fontSize: 13 }}>
          共 {total} 条通知 | 弹窗：登录后展示 | 滚动栏：首页顶部滚动展示
        </span>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>添加通知</Button>
      </div>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={data}
        loading={loading}
        pagination={{ current: page, total, pageSize: 20, onChange: (p: number) => { setPage(p); fetchData(p); } }}
        size="small"
        scroll={{ x: 1050 }}
      />

      <Modal
        title={editingId ? '编辑通知' : '添加通知'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        confirmLoading={submitting}
        okText="保存"
        cancelText="取消"
        destroyOnClose
        width={560}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="title" label="标题" rules={[{ required: true, message: '请填写标题' }]}>
            <Input placeholder="通知标题" />
          </Form.Item>
          <Form.Item name="content" label="内容" rules={[{ required: true, message: '请填写内容' }]}>
            <TextArea rows={4} placeholder="通知正文内容" />
          </Form.Item>
          <Space size="large">
            <Form.Item name="show_popup" label="登录弹窗" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="show_banner" label="首页滚动栏" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="enabled" label="启用" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="sort_order" label="排序权重">
              <InputNumber min={0} max={999} style={{ width: 80 }} />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </div>
  );
};

export default NotificationManager;
