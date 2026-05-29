import React, { useEffect, useState } from 'react';
import {
  Table, Button, Modal, Tag, Typography, Space, message, Descriptions,
  Radio, Card, Popconfirm, Badge, Input, Select, Divider,
} from 'antd';
import {
  CheckCircleOutlined, CloseCircleOutlined, ClockCircleOutlined,
  SettingOutlined, ReloadOutlined,
  EyeOutlined, UndoOutlined,
  RobotOutlined,
} from '@ant-design/icons';
import {
  getBansApi, unbanUserApi,
  getAppealsApi, reviewAppealApi,
  getAppealReviewModeConfigApi, setAppealReviewModeConfigApi,
  getAppealAiReviewConfigApi, setAppealAiReviewConfigApi,
  BanRecord, AppealRecord, AppealReviewModeConfig, AppealAiReviewConfig,
} from '../../api/admin';

const { Text, Title } = Typography;

const BanManager: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'bans' | 'appeals'>('bans');
  const [bans, setBans] = useState<BanRecord[]>([]);
  const [appeals, setAppeals] = useState<AppealRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [reviewConfig, setReviewConfig] = useState<AppealReviewModeConfig | null>(null);
  const [aiReviewConfig, setAiReviewConfig] = useState<AppealAiReviewConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(false);

  // 申诉详情弹窗
  const [appealDetail, setAppealDetail] = useState<AppealRecord | null>(null);
  const [reviewNote, setReviewNote] = useState('');

  useEffect(() => { loadData(); loadConfig(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [bRes, aRes] = await Promise.all([
        getBansApi({ limit: 100 }),
        getAppealsApi({ limit: 100 }),
      ]);
      setBans(bRes.rows || []);
      setAppeals(aRes.rows || []);
    } catch { message.error('加载数据失败'); }
    finally { setLoading(false); }
  };

  const loadConfig = async () => {
    setConfigLoading(true);
    try {
      const [mode, ai] = await Promise.all([
        getAppealReviewModeConfigApi(),
        getAppealAiReviewConfigApi(),
      ]);
      setReviewConfig(mode);
      setAiReviewConfig(ai);
    } catch { /* ignore */ } finally { setConfigLoading(false); }
  };

  const handleSetMode = async (mode: string) => {
    try {
      await setAppealReviewModeConfigApi(mode);
      message.success('审核模式已更新');
      loadConfig();
    } catch (err: any) { message.error(err?.response?.data?.error || '设置失败'); }
  };

  const handleSetAiConfig = async (providerName: string, modelName: string) => {
    try {
      await setAppealAiReviewConfigApi(providerName, modelName);
      message.success('AI审核模型已更新');
      loadConfig();
    } catch (err: any) { message.error(err?.response?.data?.error || '设置失败'); }
  };

  const handleUnban = async (banId: number) => {
    try {
      await unbanUserApi(banId);
      message.success('封禁已解除');
      loadData();
    } catch (err: any) { message.error(err?.response?.data?.error || '解封失败'); }
  };

  const handleReviewAppeal = async (appealId: number, action: 'approve' | 'reject') => {
    try {
      await reviewAppealApi(appealId, action, action === 'reject' ? (reviewNote || undefined) : undefined);
      message.success(action === 'approve' ? '申诉已通过' : '申诉已拒绝');
      setAppealDetail(null);
      setReviewNote('');
      loadData();
    } catch (err: any) { message.error(err?.response?.data?.error || '操作失败'); }
  };

  const banColumns = [
    { title: 'ID', dataIndex: 'id', width: 50 },
    { title: '用户', dataIndex: 'username', width: 100, ellipsis: true },
    { title: '邮箱', dataIndex: 'email', width: 160, ellipsis: true },
    {
      title: '类型', dataIndex: 'type', width: 70,
      render: (t: string) => t === 'ban' ? <Tag color="red">封禁</Tag> : <Tag>注销</Tag>,
    },
    {
      title: '原因', dataIndex: 'reason', ellipsis: true,
      render: (r: string) => r ? <Text style={{ maxWidth: 200 }} ellipsis>{r}</Text> : <Text type="secondary">-</Text>,
    },
    { title: '操作人', dataIndex: 'operator_name', width: 80, render: (n: string) => n || '-' },
    {
      title: '状态', dataIndex: 'status', width: 70,
      render: (s: string) => s === 'active' ? <Tag color="red">生效中</Tag> : <Tag color="green">已解除</Tag>,
    },
    {
      title: '时间', dataIndex: 'created_at', width: 110,
      render: (v: string) => new Date(v).toLocaleDateString('zh-CN'),
    },
    {
      title: '操作', key: 'actions', width: 80,
      render: (_: any, record: BanRecord) => (
        record.status === 'active' ? (
          <Popconfirm title="确定解除此封禁？" onConfirm={() => handleUnban(record.id)}>
            <Button type="link" size="small" icon={<UndoOutlined />}>解封</Button>
          </Popconfirm>
        ) : null
      ),
    },
  ];

  const appealColumns = [
    { title: 'ID', dataIndex: 'id', width: 50 },
    { title: '用户', dataIndex: 'username', width: 100, ellipsis: true },
    {
      title: '封禁类型', dataIndex: 'ban_type', width: 70,
      render: (t: string) => t === 'ban' ? <Tag color="red">封禁</Tag> : <Tag>注销</Tag>,
    },
    {
      title: '状态', dataIndex: 'status', width: 70,
      render: (s: string) => {
        if (s === 'pending') return <Tag color="orange">待审核</Tag>;
        if (s === 'approved') return <Tag color="green">已通过</Tag>;
        return <Tag color="red">已拒绝</Tag>;
      },
    },
    {
      title: '申诉内容', dataIndex: 'content', ellipsis: true,
      render: (c: string) => <Text style={{ maxWidth: 250 }} ellipsis>{c}</Text>,
    },
    {
      title: 'AI结果', dataIndex: 'ai_result', width: 80,
      render: (ai: any) => {
        if (!ai) return <Text type="secondary">-</Text>;
        if (typeof ai === 'string') {
          try { ai = JSON.parse(ai); } catch { return <Text type="secondary">-</Text>; }
        }
        return ai.approved ? <Tag color="green">建议通过</Tag> : <Tag color="red">建议拒绝</Tag>;
      },
    },
    {
      title: '提交时间', dataIndex: 'created_at', width: 110,
      render: (v: string) => new Date(v).toLocaleDateString('zh-CN'),
    },
    {
      title: '操作', key: 'actions', width: 80,
      render: (_: any, record: AppealRecord) => (
        <Button type="link" size="small" icon={<EyeOutlined />}
          onClick={() => { setAppealDetail(record); setReviewNote(''); }}>详情</Button>
      ),
    },
  ];

  const pendingCount = appeals.filter(a => a.status === 'pending').length;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>封禁与申诉管理</Title>
          <Text type="secondary">
            待处理申诉：<Badge count={pendingCount} style={{ backgroundColor: pendingCount > 0 ? '#f59e0b' : '#22c55e' }} />
          </Text>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading}>刷新</Button>
        </div>
      </div>

      {/* 申诉审核模式设置 */}
      <Card size="small" style={{ marginBottom: 16, borderRadius: 10, background: 'rgba(15,23,42,0.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Text strong><SettingOutlined /> 申诉审核模式：</Text>
          {configLoading ? <Text type="secondary">加载中...</Text> : (
            <Radio.Group value={reviewConfig?.mode} onChange={(e) => handleSetMode(e.target.value)}>
              {reviewConfig?.modes.map(m => (
                <Radio.Button key={m.value} value={m.value}>
                  <div>
                    <Text strong>{m.label}</Text>
                    <br />
                    <Text type="secondary" style={{ fontSize: 11 }}>{m.desc}</Text>
                  </div>
                </Radio.Button>
              ))}
            </Radio.Group>
          )}
        </div>
        <Divider style={{ margin: '10px 0' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Text strong><RobotOutlined /> AI审核模型：</Text>
          {configLoading ? <Text type="secondary">加载中...</Text> : (
            <Space>
              <Select
                placeholder="选择Provider"
                allowClear
                style={{ minWidth: 160 }}
                value={aiReviewConfig?.providerName || undefined}
                onChange={(val) => handleSetAiConfig(val || '', aiReviewConfig?.modelName || '')}
                options={(aiReviewConfig?.providers || []).map(p => ({ value: p.name, label: p.name }))}
              />
              <Select
                placeholder="选择模型"
                allowClear
                style={{ minWidth: 180 }}
                value={aiReviewConfig?.modelName || undefined}
                onChange={(val) => handleSetAiConfig(aiReviewConfig?.providerName || '', val || '')}
                options={(aiReviewConfig?.providers || [])
                  .find(p => p.name === aiReviewConfig?.providerName)
                  ?.models.map(m => ({ value: m.name, label: m.name })) || []}
                disabled={!aiReviewConfig?.providerName}
              />
            </Space>
          )}
          <Text type="secondary" style={{ fontSize: 11 }}>用于AI自动审核用户申诉</Text>
        </div>
      </Card>

      {/* Tab 切换 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <Tag color={activeTab === 'bans' ? 'red' : undefined}
          style={{ cursor: 'pointer', padding: '4px 12px' }}
          onClick={() => setActiveTab('bans')}>封禁记录 ({bans.length})</Tag>
        <Tag color={activeTab === 'appeals' ? 'orange' : undefined}
          style={{ cursor: 'pointer', padding: '4px 12px' }}
          onClick={() => setActiveTab('appeals')}>
          申诉管理 <Badge count={pendingCount} size="small" style={{ marginLeft: 4 }} />
        </Tag>
      </div>

      {activeTab === 'bans' ? (
        <Table columns={banColumns} dataSource={bans} rowKey="id"
          loading={loading} size="small" pagination={{ pageSize: 20 }} />
      ) : (
        <Table columns={appealColumns} dataSource={appeals} rowKey="id"
          loading={loading} size="small" pagination={{ pageSize: 20 }} />
      )}

      {/* 申诉详情弹窗 */}
      <Modal title="申诉详情" open={!!appealDetail}
        onCancel={() => { setAppealDetail(null); setReviewNote(''); }}
        footer={null} width={640} destroyOnClose>
        {appealDetail && (
          <div>
            <Descriptions column={2} size="small" bordered>
              <Descriptions.Item label="用户">{appealDetail.username}</Descriptions.Item>
              <Descriptions.Item label="邮箱">{appealDetail.email}</Descriptions.Item>
              <Descriptions.Item label="封禁类型">
                {appealDetail.ban_type === 'ban' ? <Tag color="red">封禁</Tag> : <Tag>注销</Tag>}
              </Descriptions.Item>
              <Descriptions.Item label="封禁原因">{appealDetail.ban_reason || '-'}</Descriptions.Item>
              <Descriptions.Item label="申诉状态">
                {appealDetail.status === 'pending' ? <Tag color="orange">待审核</Tag>
                  : appealDetail.status === 'approved' ? <Tag color="green">已通过</Tag>
                    : <Tag color="red">已拒绝</Tag>}
              </Descriptions.Item>
              <Descriptions.Item label="审核人">{appealDetail.reviewer_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="申诉内容" span={2}>
                <Text style={{ whiteSpace: 'pre-wrap' }}>{appealDetail.content}</Text>
              </Descriptions.Item>
              {appealDetail.ai_result && (
                <Descriptions.Item label="AI审核结果" span={2}>
                  {(() => {
                    let ai = appealDetail.ai_result;
                    if (typeof ai === 'string') { try { ai = JSON.parse(ai); } catch { return <Text>-</Text>; } }
                    return (
                      <div>
                        <Tag color={ai.approved ? 'green' : 'red'}>
                          {ai.approved ? '建议通过' : '建议拒绝'} (置信度: {ai.confidence}%)
                        </Tag>
                        <Text type="secondary"> {ai.reason}</Text>
                      </div>
                    );
                  })()}
                </Descriptions.Item>
              )}
              <Descriptions.Item label="审核备注" span={2}>
                {appealDetail.review_note || '-'}
              </Descriptions.Item>
            </Descriptions>

            {appealDetail.status === 'pending' && (
              <>
                <Divider />
                <div style={{ display: 'flex', gap: 8 }}>
                  <Popconfirm title="确定通过此申诉？将自动解封用户"
                    onConfirm={() => handleReviewAppeal(appealDetail.id, 'approve')}>
                    <Button type="primary" icon={<CheckCircleOutlined />}
                      style={{ flex: 1, background: '#22c55e', borderColor: '#22c55e' }}>通过申诉</Button>
                  </Popconfirm>
                  <Popconfirm
                    title="拒绝原因（选填）"
                    description={<Input.TextArea rows={2} value={reviewNote}
                      onChange={e => setReviewNote(e.target.value)} placeholder="请输入拒绝原因..." />}
                    onConfirm={() => handleReviewAppeal(appealDetail.id, 'reject')}
                    okText="确认拒绝">
                    <Button danger icon={<CloseCircleOutlined />} style={{ flex: 1 }}>拒绝申诉</Button>
                  </Popconfirm>
                </div>
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default BanManager;
