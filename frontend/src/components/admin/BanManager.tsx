import React, { useEffect, useState } from 'react';
import { Table, Button, Tag, Typography, Popconfirm, message } from 'antd';
import { ReloadOutlined, UndoOutlined } from '@ant-design/icons';
import { getBansApi, unbanUserApi, BanRecord } from '../../api/admin';

const { Text, Title } = Typography;

const BanManager: React.FC = () => {
  const [bans, setBans] = useState<BanRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const result = await getBansApi({ limit: 100 });
      setBans(result.rows || []);
    } catch {
      message.error('加载封禁记录失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleUnban = async (banId: number) => {
    try {
      await unbanUserApi(banId);
      message.success('封禁已解除');
      loadData();
    } catch (err: any) {
      message.error(err?.response?.data?.error || '解封失败');
    }
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '用户', dataIndex: 'username', width: 120, ellipsis: true },
    { title: '邮箱', dataIndex: 'email', width: 180, ellipsis: true },
    {
      title: '类型',
      dataIndex: 'type',
      width: 90,
      render: (type: string) => type === 'ban' ? <Tag color="red">封禁</Tag> : <Tag>注销</Tag>,
    },
    {
      title: '原因',
      dataIndex: 'reason',
      ellipsis: true,
      render: (reason: string) => reason
        ? <Text style={{ maxWidth: 260 }} ellipsis>{reason}</Text>
        : <Text type="secondary">-</Text>,
    },
    { title: '操作人', dataIndex: 'operator_name', width: 100, render: (name: string) => name || '-' },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (status: string) => status === 'active'
        ? <Tag color="red">生效中</Tag>
        : <Tag color="green">已解除</Tag>,
    },
    {
      title: '时间',
      dataIndex: 'created_at',
      width: 130,
      render: (value: string) => new Date(value).toLocaleDateString('zh-CN'),
    },
    {
      title: '操作',
      key: 'actions',
      width: 100,
      render: (_: any, record: BanRecord) => (
        record.status === 'active' ? (
          <Popconfirm title="确定解除此封禁？" onConfirm={() => handleUnban(record.id)}>
            <Button type="link" size="small" icon={<UndoOutlined />}>解封</Button>
          </Popconfirm>
        ) : null
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>封禁管理</Title>
          <Text type="secondary">查看账号封禁记录，并处理需要人工解除的封禁状态。</Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading}>刷新</Button>
      </div>

      <Table
        columns={columns}
        dataSource={bans}
        rowKey="id"
        loading={loading}
        size="small"
        pagination={{ pageSize: 20 }}
        scroll={{ x: 980 }}
      />
    </div>
  );
};

export default BanManager;
