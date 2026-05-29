import React, { useEffect, useState } from 'react';
import {
  Table, Tag, Button, Modal, Typography, App, Space, Form, Input,
  InputNumber, Switch, Popconfirm, Tooltip,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import {
  getGroupsApi, createGroupApi, updateGroupApi, deleteGroupApi,
} from '../../api/admin';

const { Text } = Typography;

interface Group {
  id: number;
  name: string;
  token_limit_per_day: number;
  rate_limit_per_minute: number;
  max_novels: number;
  max_chapters_per_novel: number;
  can_export: boolean;
  can_customize: boolean;
  can_choose_model: boolean;
  description: string;
  queue_priority: number;
  is_admin: boolean;
  user_count: number;
}

const GroupManager: React.FC = () => {
  const { message } = App.useApp();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);

  // 获取当前登录用户的 group_id，用于防止修改自己的管理员权限
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  const currentUserGroupId: number = currentUser.group?.id || 0;

  // 创建分组弹窗
  const [createModal, setCreateModal] = useState(false);
  const [createForm] = Form.useForm();
  const [creating, setCreating] = useState(false);

  // 编辑分组弹窗
  const [editModal, setEditModal] = useState(false);
  const [editGroup, setEditGroup] = useState<Group | null>(null);
  const [editForm] = Form.useForm();
  const [editing, setEditing] = useState(false);

  const loadGroups = async () => {
    setLoading(true);
    try {
      const data = await getGroupsApi();
      setGroups(data.groups || []);
    } catch {
      message.error('加载分组列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadGroups(); }, []);

  // 创建分组
  const handleCreate = async (values: any) => {
    setCreating(true);
    try {
      await createGroupApi(values);
      message.success('分组创建成功');
      setCreateModal(false);
      createForm.resetFields();
      loadGroups();
    } catch (err: any) {
      message.error(err.response?.data?.error || '创建失败');
    } finally {
      setCreating(false);
    }
  };

  // 打开编辑弹窗
  const openEdit = (group: Group) => {
    setEditGroup(group);
    // 使用 setTimeout 确保 Modal 渲染后再设置表单值
    setTimeout(() => {
      editForm.setFieldsValue({
        name: group.name,
        token_limit_per_day: group.token_limit_per_day,
        rate_limit_per_minute: group.rate_limit_per_minute,
        max_novels: group.max_novels,
        max_chapters_per_novel: group.max_chapters_per_novel,
        can_export: !!group.can_export,
        can_customize: !!group.can_customize,
        can_choose_model: !!group.can_choose_model,
        description: group.description || '',
        queue_priority: group.queue_priority ?? 10,
        is_admin: !!group.is_admin,
      });
    }, 0);
    setEditModal(true);
  };

  // 更新分组 - 直接使用 onFinish 回调传入的 values
  const handleEdit = async (values: any) => {
    if (!editGroup) return;
    setEditing(true);
    try {
      console.log('编辑表单数据:', JSON.stringify(values, null, 2));

      // 构建更新数据，确保类型正确
      const updateData: any = {};
      if (values.name !== undefined) updateData.name = values.name;
      if (values.description !== undefined) updateData.description = values.description || '';
      if (values.token_limit_per_day !== undefined) updateData.token_limit_per_day = values.token_limit_per_day;
      if (values.rate_limit_per_minute !== undefined) updateData.rate_limit_per_minute = values.rate_limit_per_minute;
      if (values.max_novels !== undefined) updateData.max_novels = values.max_novels;
      if (values.max_chapters_per_novel !== undefined) updateData.max_chapters_per_novel = values.max_chapters_per_novel;
      if (values.can_export !== undefined) updateData.can_export = values.can_export;
      if (values.can_customize !== undefined) updateData.can_customize = values.can_customize;
      if (values.can_choose_model !== undefined) updateData.can_choose_model = values.can_choose_model;
      if (values.queue_priority !== undefined) updateData.queue_priority = values.queue_priority;
      // 编辑自己所在分组时不允许修改 is_admin，防止锁死
      if (values.is_admin !== undefined && editGroup.id !== currentUserGroupId) {
        updateData.is_admin = values.is_admin;
      }

      console.log('API提交数据:', JSON.stringify(updateData, null, 2));
      const result = await updateGroupApi(editGroup.id, updateData);
      console.log('API返回:', result);
      message.success('分组更新成功');
      setEditModal(false);
      loadGroups();
    } catch (err: any) {
      if (err.errorFields) {
        message.error('请检查表单填写');
      } else {
        message.error(err.response?.data?.error || '更新失败: ' + (err.message || ''));
        console.error('更新失败详情:', err);
      }
    } finally {
      setEditing(false);
    }
  };

  // 删除分组
  const handleDelete = async (group: Group) => {
    try {
      await deleteGroupApi(group.id);
      message.success('分组已删除');
      loadGroups();
    } catch (err: any) {
      message.error(err.response?.data?.error || '删除失败');
    }
  };

  // 表格列定义
  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      width: 60,
    },
    {
      title: '分组名称',
      dataIndex: 'name',
      width: 120,
      render: (name: string) => <Tag color="blue">{name}</Tag>,
    },
    {
      title: '描述',
      dataIndex: 'description',
      width: 150,
      ellipsis: true,
    },
    {
      title: '每日Token上限',
      dataIndex: 'token_limit_per_day',
      width: 120,
      render: (v: number) => v === 0 ? <Tag color="green">不限制</Tag> : v?.toLocaleString() || '-',
    },
    {
      title: '每分钟请求',
      dataIndex: 'rate_limit_per_minute',
      width: 100,
    },
    {
      title: '小说数上限',
      dataIndex: 'max_novels',
      width: 100,
    },
    {
      title: '章节数上限',
      dataIndex: 'max_chapters_per_novel',
      width: 100,
    },
    {
      title: '可导出',
      dataIndex: 'can_export',
      width: 80,
      render: (v: boolean) => v ? <Tag color="green">是</Tag> : <Tag>否</Tag>,
    },
    {
      title: '可自定义',
      dataIndex: 'can_customize',
      width: 80,
      render: (v: boolean) => v ? <Tag color="green">是</Tag> : <Tag>否</Tag>,
    },
    {
      title: '可选模型',
      dataIndex: 'can_choose_model',
      width: 80,
      render: (v: boolean) => v ? <Tag color="green">是</Tag> : <Tag>否</Tag>,
    },
    {
      title: '排队优先级',
      dataIndex: 'queue_priority',
      width: 100,
      render: (v: number) => (
        <Text type={v >= 90 ? 'danger' : 'secondary'}>
          {v ?? 10}
          {v >= 90 && ' ⭐'}
        </Text>
      ),
    },
    {
      title: '管理员',
      dataIndex: 'is_admin',
      width: 80,
      render: (v: boolean | number) => v ? <Tag color="gold">是</Tag> : <Tag>否</Tag>,
    },
    {
      title: '用户数',
      dataIndex: 'user_count',
      width: 80,
      render: (v: number) => <Text strong>{v}</Text>,
    },
    {
      title: '操作',
      width: 120,
      fixed: 'right' as const,
      render: (_: any, record: Group) => (
        <Space size={4}>
          <Tooltip title="编辑分组配置">
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => openEdit(record)}
            />
          </Tooltip>
          <Popconfirm
            title={record.user_count > 0
              ? `该分组下有 ${record.user_count} 个用户，无法删除`
              : `确认删除分组 "${record.name}"？`}
            onConfirm={() => handleDelete(record)}
            okText="确认删除"
            cancelText="取消"
            disabled={record.user_count > 0}
          >
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              disabled={record.user_count > 0}
              title={record.user_count > 0 ? '该分组下有用户，无法删除' : '删除分组'}
            />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModal(true)}>
          新建分组
        </Button>
        <Text style={{ color: '#94a3b8' }}>共 {groups.length} 个分组</Text>
      </Space>

      <Table
        columns={columns}
        dataSource={groups}
        rowKey="id"
        loading={loading}
        pagination={false}
        scroll={{ x: 1200 }}
        size="small"
      />

      {/* 新建分组弹窗 */}
      <Modal
        title="新建分组"
        open={createModal}
        onCancel={() => { setCreateModal(false); createForm.resetFields(); }}
        onOk={() => createForm.submit()}
        confirmLoading={creating}
        width={600}
      >
        <Form form={createForm} layout="vertical" onFinish={handleCreate}>
          <Form.Item name="name" label="分组名称" rules={[{ required: true }, { max: 50 }]}>
            <Input placeholder="如：free、vip、premium" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} placeholder="分组用途说明" />
          </Form.Item>
          <Space size={16} wrap>
            <Form.Item name="token_limit_per_day" label="每日Token上限（0=不限制）" initialValue={0}>
              <InputNumber min={0} max={999999999} style={{ width: 140 }} placeholder="0表示不限制" />
            </Form.Item>
            <Form.Item name="rate_limit_per_minute" label="每分钟请求数" initialValue={5}>
              <InputNumber min={1} style={{ width: 100 }} />
            </Form.Item>
            <Form.Item name="max_novels" label="小说数上限" initialValue={3}>
              <InputNumber min={1} style={{ width: 100 }} />
            </Form.Item>
            <Form.Item name="max_chapters_per_novel" label="单本章节上限" initialValue={10}>
              <InputNumber min={1} style={{ width: 100 }} />
            </Form.Item>
          </Space>
          <Space size={24}>
            <Form.Item name="can_export" label="允许导出" valuePropName="checked" initialValue={false}>
              <Switch />
            </Form.Item>
            <Form.Item name="can_customize" label="允许自定义参数" valuePropName="checked" initialValue={false}>
              <Switch />
            </Form.Item>
            <Form.Item name="can_choose_model" label="允许选择模型" valuePropName="checked" initialValue={false} tooltip="允许用户自选首选大模型">
              <Switch />
            </Form.Item>
            <Form.Item name="is_admin" label="管理员权限" valuePropName="checked" initialValue={false} tooltip="具有管理员权限的用户可以访问后台管理">
              <Switch />
            </Form.Item>
            <Form.Item name="queue_priority" label="排队优先级" initialValue={10} tooltip="数值越高优先级越高，>90可强制插队">
              <InputNumber min={1} max={100} style={{ width: 100 }} />
            </Form.Item>
          </Space>
        </Form>
      </Modal>

      {/* 编辑分组弹窗 */}
      <Modal
        title={`编辑分组: ${editGroup?.name}`}
        open={editModal}
        onCancel={() => setEditModal(false)}
        onOk={() => editForm.submit()}
        confirmLoading={editing}
        width={600}
      >
        <Form form={editForm} layout="vertical" onFinish={handleEdit}>
          <Form.Item name="name" label="分组名称" rules={[{ required: true }, { max: 50 }]}>
            <Input placeholder="如：free、vip、premium" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} placeholder="分组用途说明" />
          </Form.Item>
          <Space size={16} wrap>
            <Form.Item name="token_limit_per_day" label="每日Token上限">
              <InputNumber min={0} style={{ width: 120 }} />
            </Form.Item>
            <Form.Item name="rate_limit_per_minute" label="每分钟请求数">
              <InputNumber min={1} style={{ width: 100 }} />
            </Form.Item>
            <Form.Item name="max_novels" label="小说数上限">
              <InputNumber min={1} style={{ width: 100 }} />
            </Form.Item>
            <Form.Item name="max_chapters_per_novel" label="单本章节上限">
              <InputNumber min={1} style={{ width: 100 }} />
            </Form.Item>
          </Space>
          <Space size={24}>
            <Form.Item name="can_export" label="允许导出" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="can_customize" label="允许自定义参数" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="can_choose_model" label="允许选择模型" valuePropName="checked" tooltip="允许用户自选首选大模型">
              <Switch />
            </Form.Item>
            <Form.Item name="is_admin" label="管理员权限" valuePropName="checked" tooltip={editGroup?.id === currentUserGroupId ? '不能修改自己所在分组的管理员权限' : '具有管理员权限的用户可以访问后台管理'}>
              <Switch disabled={editGroup?.id === currentUserGroupId} />
            </Form.Item>
            <Form.Item name="queue_priority" label="排队优先级" tooltip="数值越高优先级越高，>90可强制插队">
              <InputNumber min={1} max={100} style={{ width: 100 }} />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </div>
  );
};

export default GroupManager;