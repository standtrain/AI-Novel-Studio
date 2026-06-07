import React, { useEffect, useRef, useState } from 'react';
import {
  Table, Tag, Select, Button, Modal, Typography, message, Space,
  Input, Form, Popconfirm, Tooltip,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, LockOutlined, EditOutlined, StopOutlined,
} from '@ant-design/icons';
import {
  getUsersApi, updateUserApi, createUserApi, deleteUserApi, banUserApi, getGroupsApi,
} from '../../api/admin';
import { useAuthStore } from '../../store/authStore';

const { Text } = Typography;

// 高亮搜索匹配文本
const highlightText = (text: string, term: string): React.ReactNode => {
  if (!term.trim()) return text;
  const parts: React.ReactNode[] = [];
  const lower = text.toLowerCase();
  const t = term.toLowerCase();
  let lastIdx = 0;
  let pos = 0;
  while ((pos = lower.indexOf(t, pos)) !== -1) {
    if (pos > lastIdx) parts.push(text.slice(lastIdx, pos));
    parts.push(<span key={pos} style={{ background: 'rgba(251,191,36,0.35)', borderRadius: 2, padding: '0 1px' }}>{text.slice(pos, pos + t.length)}</span>);
    pos += t.length;
    lastIdx = pos;
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));
  return <>{parts}</>;
};

const statusOptions = [
  { value: 'active', label: '正常' },
  { value: 'disabled', label: '已禁用' },
];

interface UserTableProps { searchTerm: string; }

const UserTable: React.FC<UserTableProps> = ({ searchTerm }) => {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [groups, setGroups] = useState<any[]>([]);

  // 新增用户弹窗
  const [createModal, setCreateModal] = useState(false);
  const [createForm] = Form.useForm();
  const [creating, setCreating] = useState(false);

  // 编辑用户弹窗
  const [editModal, setEditModal] = useState(false);
  const [editUser, setEditUser] = useState<any>(null);
  const [editForm] = Form.useForm();
  const [editing, setEditing] = useState(false);

  // 封禁用户弹窗
  const [banModal, setBanModal] = useState(false);
  const [banTarget, setBanTarget] = useState<any>(null);
  const [banReason, setBanReason] = useState('');
  const [banning, setBanning] = useState(false);

  const currentUser = useAuthStore((s) => s.user);
  const currentUserId = currentUser?.id;
  const prevSearchTermRef = useRef(searchTerm);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const q = searchTerm.trim() || undefined;
      const data = await getUsersApi({ page, limit: 20, q });
      setUsers(data.rows || []);
      setTotal(data.total);
    } catch {
      message.error('加载用户列表失败');
    } finally {
      setLoading(false);
    }
  };

  const loadGroups = async () => {
    try {
      const data = await getGroupsApi();
      setGroups(data.groups || []);
    } catch {
      // 分组加载失败不阻塞用户列表
    }
  };

  useEffect(() => { loadGroups(); }, []);

  useEffect(() => {
    if (prevSearchTermRef.current !== searchTerm && page !== 1) {
      prevSearchTermRef.current = searchTerm;
      setPage(1);
      return;
    }
    prevSearchTermRef.current = searchTerm;
    loadUsers();
  }, [page, searchTerm]);

  // ---------- 操作处理 ----------

  const handleStatusChange = async (userId: number, newStatus: string) => {
    if (userId === currentUserId) {
      message.warning('不能修改自己的状态');
      return;
    }
    try {
      await updateUserApi(userId, { status: newStatus });
      message.success('更新成功');
      loadUsers();
    } catch (err: any) {
      message.error(err.response?.data?.error || '更新失败');
    }
  };

  const handleGroupChange = async (userId: number, newGroupId: number) => {
    if (userId === currentUserId) {
      message.warning('不能修改自己的分组');
      return;
    }
    try {
      await updateUserApi(userId, { group_id: newGroupId });
      message.success('更新成功');
      loadUsers();
    } catch (err: any) {
      message.error(err.response?.data?.error || '更新失败');
    }
  };

  const handleDelete = async (userId: number) => {
    if (userId === currentUserId) {
      message.warning('不能删除自己的账号');
      return;
    }
    try {
      await deleteUserApi(userId);
      message.success('用户已从数据库移除');
      loadUsers();
    } catch (err: any) {
      message.error(err.response?.data?.error || '删除失败');
    }
  };

  const handleCreate = async (values: { username: string; email: string; password: string; group_id: number }) => {
    setCreating(true);
    try {
      await createUserApi(values);
      message.success('用户创建成功');
      setCreateModal(false);
      createForm.resetFields();
      loadUsers();
    } catch (err: any) {
      message.error(err.response?.data?.error || '创建失败');
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (record: any) => {
    if (record.id === currentUserId) {
      message.warning('不能修改自己的账号，请让其他管理员操作');
      return;
    }
    setEditUser(record);
    editForm.setFieldsValue({ email: record.email, username: record.username, password: '' });
    setEditModal(true);
  };

  const handleEdit = async (values: { email: string; username: string; password: string }) => {
    setEditing(true);
    try {
      const data: any = { email: values.email };
      if (values.username && values.username !== editUser.username) data.username = values.username;
      if (values.password) data.password = values.password;
      await updateUserApi(editUser.id, data);
      message.success('修改成功');
      setEditModal(false);
      loadUsers();
    } catch (err: any) {
      message.error(err.response?.data?.error || '修改失败');
    } finally {
      setEditing(false);
    }
  };

  const openBan = (record: any) => {
    if (record.id === currentUserId) {
      message.warning('不能封禁自己的账号');
      return;
    }
    setBanTarget(record);
    setBanReason('');
    setBanModal(true);
  };

  const handleBan = async () => {
    setBanning(true);
    try {
      await banUserApi(banTarget.id, banReason.trim() || undefined);
      message.success(`用户 "${banTarget.username}" 已封禁`);
      setBanModal(false);
      loadUsers();
    } catch (err: any) {
      message.error(err?.response?.data?.error || '封禁失败');
    } finally {
      setBanning(false);
    }
  };

  // ---------- 列定义 ----------
  const isSelf = (record: any) => record.id === currentUserId;

  const isRowMatch = (record: any): boolean => {
    if (!searchTerm.trim()) return false;
    const term = searchTerm.toLowerCase();
    return (record.username || '').toLowerCase().includes(term) || (record.email || '').toLowerCase().includes(term);
  };

  const columns = [
    {
      title: 'ID', dataIndex: 'id', width: 50,
      render: (id: number, record: any) => (
        <Space size={4}>
          {id}
          {isSelf(record) && <Tooltip title="当前登录账号"><LockOutlined style={{ color: '#1677ff', fontSize: 12 }} /></Tooltip>}
        </Space>
      ),
    },
    {
      title: '用户名', dataIndex: 'username', width: 100,
      render: (name: string, record: any) => (
        <span>
          {highlightText(name, searchTerm)}
          {isSelf(record) && <Tag color="blue" style={{ marginLeft: 4, fontSize: 10 }}>我</Tag>}
        </span>
      ),
    },
    {
      title: '邮箱', dataIndex: 'email', width: 180,
      render: (email: string) => highlightText(email, searchTerm),
    },
    {
      title: '分组', dataIndex: 'group_name', width: 100,
      render: (_: string, record: any) => (
        <Select
          size="small"
          value={record.group_id}
          onChange={(val) => handleGroupChange(record.id, val)}
          options={groups.map(g => ({ value: g.id, label: g.name }))}
          style={{ width: 90 }}
          disabled={isSelf(record)}
        />
      ),
    },
    {
      title: '状态', dataIndex: 'status', width: 90,
      render: (status: string, record: any) => (
        <Select
          size="small"
          value={status}
          onChange={(val) => handleStatusChange(record.id, val)}
          options={statusOptions}
          style={{ width: 80 }}
          disabled={isSelf(record)}
        />
      ),
    },
    {
      title: '今日Token', width: 120,
      render: (_: any, record: any) => (
        <Text>{record.daily_tokens_used || 0} / {record.token_limit_per_day}</Text>
      ),
    },
    {
      title: '最后登录', dataIndex: 'last_login_at', width: 110,
      render: (v: string) => v ? new Date(v).toLocaleString('zh-CN') : <Text style={{ color: '#64748b' }}>从未登录</Text>,
    },
    {
      title: '注册时间', dataIndex: 'created_at', width: 110,
      render: (v: string) => v ? new Date(v).toLocaleDateString('zh-CN') : '-',
    },
    {
      title: '操作', width: 160, fixed: 'right' as const,
      render: (_: any, record: any) => (
        <Space size={4}>
          <Tooltip title={isSelf(record) ? '不能修改自己' : '修改邮箱/密码'}>
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => openEdit(record)}
              disabled={isSelf(record)}
            />
          </Tooltip>
          <Tooltip title={isSelf(record) ? '不能封禁自己' : (record.status === 'disabled' ? '该账号已被禁用' : '封禁用户')}>
            <Button
              size="small"
              icon={<StopOutlined />}
              onClick={() => openBan(record)}
              disabled={isSelf(record) || record.status === 'disabled'}
            />
          </Tooltip>
          <Popconfirm
            title={isSelf(record) ? '不能删除自己的账号' : `确认从数据库删除用户 "${record.username}"？此操作不可恢复！`}
            onConfirm={() => handleDelete(record.id)}
            okText="确认删除"
            cancelText="取消"
            disabled={isSelf(record)}
          >
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              disabled={isSelf(record)}
              title={isSelf(record) ? '不能删除自己' : '从数据库删除'}
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
          添加用户
        </Button>
        <Text style={{ color: '#94a3b8' }}>共 {total} 个用户</Text>
      </Space>

      <Table
        columns={columns}
        dataSource={users}
        rowKey="id"
        loading={loading}
        pagination={{ current: page, total, pageSize: 20, onChange: setPage }}
        scroll={{ x: 1150 }}
        size="small"
        onRow={(record: any) => {
          if (!searchTerm.trim()) return {};
          return isRowMatch(record) ? { style: { background: 'rgba(251,191,36,0.06)' } } : {};
        }}
      />

      {/* 新增用户弹窗 */}
      <Modal
        title="添加用户"
        open={createModal}
        onCancel={() => { setCreateModal(false); createForm.resetFields(); }}
        onOk={() => createForm.submit()}
        confirmLoading={creating}
      >
        <Form form={createForm} layout="vertical" onFinish={handleCreate}>
          <Form.Item name="username" label="用户名" rules={[{ required: true }, { min: 3 }]}>
            <Input placeholder="3-50个字符" maxLength={50} />
          </Form.Item>
          <Form.Item name="email" label="邮箱" rules={[{ required: true }, { type: 'email' }]}>
            <Input placeholder="user@example.com" />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true }, { min: 6 }]}>
            <Input.Password placeholder="至少6个字符" />
          </Form.Item>
          <Form.Item name="group_id" label="分组" initialValue={1}>
            <Select options={groups.map(g => ({ value: g.id, label: g.name }))} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 编辑用户弹窗（邮箱/密码） */}
      <Modal
        title={`修改用户: ${editUser?.username || ''}`}
        open={editModal}
        onCancel={() => setEditModal(false)}
        onOk={() => editForm.submit()}
        confirmLoading={editing}
      >
        <Form form={editForm} layout="vertical" onFinish={handleEdit}>
          <Form.Item name="username" label="用户名" rules={[{ required: true }, { min: 3, message: '至少3个字符' }, { max: 50, message: '最多50个字符' }]}>
            <Input placeholder="用户名" />
          </Form.Item>
          <Form.Item name="email" label="邮箱" rules={[{ required: true }, { type: 'email' }]}>
            <Input placeholder="user@example.com" />
          </Form.Item>
          <Form.Item name="password" label="新密码（留空不修改）">
            <Input.Password placeholder="留空则不修改密码" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 封禁用户弹窗 */}
      <Modal
        title={`封禁用户: ${banTarget?.username || ''}`}
        open={banModal}
        onOk={handleBan}
        onCancel={() => setBanModal(false)}
        confirmLoading={banning}
        okText="确认封禁"
        okButtonProps={{ danger: true }}
      >
        <div>
          <Text strong>封禁原因（选填）</Text>
          <Input.TextArea
            value={banReason}
            onChange={e => setBanReason(e.target.value)}
            placeholder="封禁原因，用户登录时可见..."
            rows={3}
            style={{ marginTop: 8 }}
          />
          <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
            封禁后用户将无法登录，可以在"封禁管理"中解封或查看申诉
          </Text>
        </div>
      </Modal>
    </div>
  );
};

export default UserTable;
