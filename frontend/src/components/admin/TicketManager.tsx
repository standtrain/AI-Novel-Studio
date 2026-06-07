import React, { useEffect, useState, useRef } from 'react';
import {
  Badge, Button, Card, Descriptions, Divider, Input, Modal, Radio, Select,
  Space, Table, Tag, Typography, message,
} from 'antd';
import {
  CheckCircleOutlined, CloseCircleOutlined, ClockCircleOutlined, EyeOutlined,
  ReloadOutlined, RobotOutlined, SendOutlined, SettingOutlined,
} from '@ant-design/icons';
import {
  AppealAiReviewConfig,
  AppealReviewModeConfig,
  getAppealAiReviewConfigApi,
  getAppealReviewModeConfigApi,
  setAppealAiReviewConfigApi,
  setAppealReviewModeConfigApi,
} from '../../api/admin';
import {
  TicketAiReplyMode,
  TicketAiReplyModeConfig,
  TicketPriority,
  TicketRecord,
  TicketReply,
  TicketStatus,
  adminReplyTicketApi,
  generateAdminTicketAiReplyApi,
  getAdminTicketAiReplyModeConfigApi,
  getAdminTicketDetailApi,
  getAdminTicketsApi,
  resolveAdminTicketApi,
  setAdminTicketAiReplyModeConfigApi,
} from '../../api/tickets';

const { Text, Title, Paragraph } = Typography;
const { TextArea } = Input;

const statusMeta: Record<TicketStatus, { label: string; color: string }> = {
  open: { label: '待人工处理', color: 'red' },
  answered: { label: '已回复', color: 'blue' },
  resolved: { label: '已解决', color: 'green' },
  closed: { label: '已关闭', color: 'default' },
};

const appealStatusMeta: Record<string, { label: string; color: string }> = {
  pending: { label: '待审核', color: 'orange' },
  approved: { label: '已通过', color: 'green' },
  rejected: { label: '已拒绝', color: 'red' },
};

const priorityMeta: Record<string, { label: string; color: string }> = {
  low: { label: '低', color: 'default' },
  normal: { label: '普通', color: 'blue' },
  high: { label: '高', color: 'orange' },
  urgent: { label: '紧急', color: 'red' },
};

function formatDate(value?: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString('zh-CN');
}

function renderTicketType(ticket: TicketRecord) {
  return ticket.type === 'appeal'
    ? <Tag color="volcano">申诉工单</Tag>
    : <Tag color="cyan">普通工单</Tag>;
}

function renderPriority(priority: TicketPriority | string) {
  const meta = priorityMeta[priority] || priorityMeta.normal;
  return <Tag color={meta.color}>{meta.label}</Tag>;
}

function renderStatus(status: TicketStatus) {
  const meta = statusMeta[status] || { label: status, color: 'default' };
  return <Tag color={meta.color}>{meta.label}</Tag>;
}

function renderSender(reply: TicketReply) {
  if (reply.sender_type === 'user') return reply.sender_name || '用户';
  if (reply.sender_type === 'admin') return reply.sender_name || '管理员';
  if (reply.sender_type === 'ai') return 'AI 助手';
  return '系统';
}

const TicketManager: React.FC = () => {
  const [tickets, setTickets] = useState<TicketRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [priorityFilter, setPriorityFilter] = useState<TicketPriority | undefined>();
  const [statusFilter, setStatusFilter] = useState<TicketStatus | undefined>();
  const [keyword, setKeyword] = useState('');
  const keywordTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialTicketsLoadFinishedRef = useRef(false);

  const [detail, setDetail] = useState<TicketRecord | null>(null);
  const [replies, setReplies] = useState<TicketReply[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [resolveNote, setResolveNote] = useState('');
  const [sending, setSending] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [draftFromAi, setDraftFromAi] = useState(false);

  const [reviewConfig, setReviewConfig] = useState<AppealReviewModeConfig | null>(null);
  const [aiReviewConfig, setAiReviewConfig] = useState<AppealAiReviewConfig | null>(null);
  const [ticketAiReplyConfig, setTicketAiReplyConfig] = useState<TicketAiReplyModeConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(false);

  const loadTickets = async () => {
    setLoading(true);
    try {
      const result = await getAdminTicketsApi({
        limit: 100,
        priority: priorityFilter,
        status: statusFilter,
        q: keyword.trim() || undefined,
      });
      setTickets(result.rows || []);
    } catch {
      message.error('加载工单列表失败');
    } finally {
      setLoading(false);
      initialTicketsLoadFinishedRef.current = true;
    }
  };

  const loadConfig = async () => {
    setConfigLoading(true);
    try {
      const [mode, ai, ticketAiReply] = await Promise.all([
        getAppealReviewModeConfigApi(),
        getAppealAiReviewConfigApi(),
        getAdminTicketAiReplyModeConfigApi(),
      ]);
      setReviewConfig(mode);
      setAiReviewConfig(ai);
      setTicketAiReplyConfig(ticketAiReply);
    } catch {
      message.warning('申诉与工单AI配置加载失败');
    } finally {
      setConfigLoading(false);
    }
  };

  useEffect(() => { loadTickets(); }, [priorityFilter, statusFilter]);

  // 关键词变更防抖搜索
  useEffect(() => {
    if (!initialTicketsLoadFinishedRef.current) return;
    if (keywordTimerRef.current) clearTimeout(keywordTimerRef.current);
    keywordTimerRef.current = setTimeout(() => {
      loadTickets();
    }, 300);
    return () => {
      if (keywordTimerRef.current) clearTimeout(keywordTimerRef.current);
    };
  }, [keyword]);

  useEffect(() => { loadConfig(); }, []);

  const openDetail = async (ticketId: number) => {
    setDetailLoading(true);
    setReplyText('');
    setResolveNote('');
    setDraftFromAi(false);
    try {
      const result = await getAdminTicketDetailApi(ticketId);
      setDetail(result.ticket);
      setReplies(result.replies || []);
    } catch {
      message.error('加载工单详情失败');
    } finally {
      setDetailLoading(false);
    }
  };

  const refreshDetail = async () => {
    if (!detail) return;
    const result = await getAdminTicketDetailApi(detail.id);
    setDetail(result.ticket);
    setReplies(result.replies || []);
  };

  const handleSetMode = async (mode: string) => {
    try {
      await setAppealReviewModeConfigApi(mode);
      message.success('审核模式已更新');
      loadConfig();
    } catch (err: any) {
      message.error(err?.response?.data?.error || '设置失败');
    }
  };

  const handleSetAiConfig = async (providerName: string, modelName: string) => {
    try {
      await setAppealAiReviewConfigApi(providerName, modelName);
      message.success('AI审核模型已更新');
      loadConfig();
    } catch (err: any) {
      message.error(err?.response?.data?.error || '设置失败');
    }
  };

  const handleSetTicketAiReplyMode = async (mode: TicketAiReplyMode) => {
    try {
      const nextConfig = await setAdminTicketAiReplyModeConfigApi(mode);
      setTicketAiReplyConfig(nextConfig);
      message.success('工单AI回复模式已更新');
    } catch (err: any) {
      message.error(err?.response?.data?.error || '设置失败');
    }
  };

  const handleGenerateDraft = async () => {
    if (!detail) return;
    setAiLoading(true);
    try {
      const result = await generateAdminTicketAiReplyApi(detail.id);
      setReplyText(result.draft);
      setDraftFromAi(true);
      message.success('AI回复草稿已生成');
    } catch (err: any) {
      message.error(err?.response?.data?.error || '生成AI回复失败');
    } finally {
      setAiLoading(false);
    }
  };

  const handleSendReply = async () => {
    if (!detail || !replyText.trim()) {
      message.warning('请先填写回复内容');
      return;
    }
    setSending(true);
    try {
      const result = await adminReplyTicketApi(detail.id, {
        content: replyText.trim(),
        senderType: draftFromAi ? 'ai' : 'admin',
        isAi: draftFromAi,
      });
      setDetail(result.ticket);
      setReplies(result.replies || []);
      setReplyText('');
      setDraftFromAi(false);
      message.success('已回复并通知用户');
      loadTickets();
    } catch (err: any) {
      message.error(err?.response?.data?.error || '回复失败');
    } finally {
      setSending(false);
    }
  };

  const handleResolve = async (action?: 'approve' | 'reject') => {
    if (!detail) return;
    setSending(true);
    try {
      await resolveAdminTicketApi(detail.id, {
        action,
        note: resolveNote.trim() || undefined,
      });
      message.success(detail.type === 'appeal' ? '申诉已处理并通知用户' : '工单已处理');
      await refreshDetail();
      loadTickets();
    } catch (err: any) {
      message.error(err?.response?.data?.error || '处理失败');
    } finally {
      setSending(false);
    }
  };

  const pendingCount = tickets.filter(t => t.status === 'open').length;
  const manualReviewCount = tickets.filter(t => t.needs_manual_review).length;

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 64 },
    {
      title: '标题',
      dataIndex: 'title',
      ellipsis: true,
      render: (title: string, record: TicketRecord) => (
        <Space direction="vertical" size={2}>
          <Space size={6} wrap>
            {renderPriority(record.priority)}
            {record.needs_manual_review && <Tag color="red">需人工</Tag>}
            {renderTicketType(record)}
            <Text strong ellipsis style={{ maxWidth: 280 }}>{title}</Text>
          </Space>
          <Text type="secondary" style={{ fontSize: 12 }}>{record.username || '-'} · {formatDate(record.updated_at)}</Text>
          {record.needs_manual_review && (
            <Text type="danger" style={{ fontSize: 12, fontWeight: 600 }}>
              {record.ai_manual_reason ? `AI判断：${record.ai_manual_reason}` : 'AI已回复，等待人工二次处理'}
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: '紧急度',
      dataIndex: 'priority',
      width: 90,
      render: (priority: TicketPriority) => renderPriority(priority),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (status: TicketStatus) => renderStatus(status),
    },
    {
      title: '申诉状态',
      dataIndex: 'appeal_status',
      width: 110,
      render: (status: string, record: TicketRecord) => {
        if (record.type !== 'appeal') return <Text type="secondary">-</Text>;
        const meta = appealStatusMeta[status] || { label: status || '-', color: 'default' };
        return <Tag color={meta.color}>{meta.label}</Tag>;
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 90,
      render: (_: any, record: TicketRecord) => (
        <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => openDetail(record.id)}>处理</Button>
      ),
    },
  ];

  const aiReviewResult = detail?.type === 'appeal' ? (detail?.appeal_ai_result || detail?.ai_result) : null;
  const ticketAiDecision = detail?.type === 'general' ? detail?.ai_result?.ticket_ai_reply : null;
  const ticketAiReplyDesc = ticketAiReplyConfig?.modes.find(mode => mode.value === ticketAiReplyConfig.mode)?.desc;
  const isGeneralTicketAutoReply = detail?.type === 'general' && ticketAiReplyConfig?.mode === 'ai_auto';
  const isGeneralTicketAiManual = detail?.type === 'general' && ticketAiReplyConfig?.mode === 'ai_manual';
  const canGenerateAiDraft = detail?.type === 'appeal';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>工单管理</Title>
          <Space size={12} wrap>
            <Text type="secondary">
              待人工处理：<Badge count={pendingCount} style={{ backgroundColor: pendingCount > 0 ? '#ef4444' : '#22c55e' }} />
            </Text>
            <Text type="secondary">
              AI转人工：<Badge count={manualReviewCount} style={{ backgroundColor: manualReviewCount > 0 ? '#dc2626' : '#22c55e' }} />
            </Text>
          </Space>
        </div>
        <Space wrap>
          <Select
            allowClear
            placeholder="紧急度"
            style={{ width: 130 }}
            value={priorityFilter}
            onChange={setPriorityFilter}
            options={[
              { value: 'low', label: '低' },
              { value: 'normal', label: '普通' },
              { value: 'high', label: '高' },
              { value: 'urgent', label: '紧急' },
            ]}
          />
          <Select
            allowClear
            placeholder="处理状态"
            style={{ width: 130 }}
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: 'open', label: '待处理' },
              { value: 'answered', label: '已回复' },
              { value: 'resolved', label: '已解决' },
              { value: 'closed', label: '已关闭' },
            ]}
          />
          <Input.Search
            allowClear
            placeholder="搜索标题/用户…"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            style={{ width: 220 }}
          />
          <Button icon={<ReloadOutlined />} onClick={loadTickets} loading={loading}>刷新</Button>
        </Space>
      </div>

      <Card size="small" style={{ marginBottom: 16, borderRadius: 10, background: 'rgba(15,23,42,0.5)' }}>
        <div style={{ marginBottom: 10 }}>
          <Text strong><SettingOutlined /> 申诉审核与AI处理</Text>
          <Text type="secondary" style={{ marginLeft: 10, fontSize: 12 }}>申诉工单按审核模式处理，普通工单按AI回复模式处理。</Text>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Text strong>申诉审核模式：</Text>
          {configLoading ? <Text type="secondary">加载中...</Text> : (
            <Radio.Group value={reviewConfig?.mode} onChange={(e) => handleSetMode(e.target.value)}>
              {reviewConfig?.modes.map((mode) => (
                <Radio.Button key={mode.value} value={mode.value}>{mode.label}</Radio.Button>
              ))}
            </Radio.Group>
          )}
        </div>
        <Divider style={{ margin: '10px 0' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Text strong><RobotOutlined /> 工单AI回复模式：</Text>
          {configLoading ? <Text type="secondary">加载中...</Text> : (
            <Radio.Group
              value={ticketAiReplyConfig?.mode}
              onChange={(e) => handleSetTicketAiReplyMode(e.target.value as TicketAiReplyMode)}
            >
              {ticketAiReplyConfig?.modes.map((mode) => (
                <Radio.Button key={mode.value} value={mode.value}>{mode.label}</Radio.Button>
              ))}
            </Radio.Group>
          )}
          <Text type="secondary" style={{ fontSize: 12 }}>{ticketAiReplyDesc || '普通工单AI回复模式未配置'}</Text>
        </div>
        <Divider style={{ margin: '10px 0' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Text strong><RobotOutlined /> AI审核模型：</Text>
          {configLoading ? <Text type="secondary">加载中...</Text> : (
            <Space wrap>
              <Select
                placeholder="选择Provider"
                allowClear
                style={{ minWidth: 160 }}
                value={aiReviewConfig?.providerName || undefined}
                onChange={(value) => handleSetAiConfig(value || '', aiReviewConfig?.modelName || '')}
                options={(aiReviewConfig?.providers || []).map((provider) => ({ value: provider.name, label: provider.name }))}
              />
              <Select
                placeholder="选择模型"
                allowClear
                style={{ minWidth: 180 }}
                value={aiReviewConfig?.modelName || undefined}
                onChange={(value) => handleSetAiConfig(aiReviewConfig?.providerName || '', value || '')}
                options={(aiReviewConfig?.providers || [])
                  .find((provider) => provider.name === aiReviewConfig?.providerName)
                  ?.models.map((model) => ({ value: model.name, label: model.name })) || []}
                disabled={!aiReviewConfig?.providerName}
              />
            </Space>
          )}
          <Text type="secondary" style={{ fontSize: 12 }}>用于申诉审核与普通工单AI回复，不会在前端暴露密钥。</Text>
        </div>
      </Card>

      <Table
        columns={columns}
        dataSource={tickets}
        rowKey="id"
        loading={loading}
        size="small"
        pagination={{ pageSize: 20 }}
        scroll={{ x: 980 }}
        rowClassName={(record) => (record.status === 'open' || record.needs_manual_review ? 'ticket-row-pending' : '')}
      />

      <Modal
        title={detail ? <Space>{renderTicketType(detail)}<span>{detail.title}</span>{renderStatus(detail.status)}</Space> : '工单详情'}
        open={!!detail}
        onCancel={() => setDetail(null)}
        footer={null}
        width={820}
        destroyOnClose
      >
        {detail && (
          <div>
            <Descriptions column={2} size="small" bordered>
              <Descriptions.Item label="用户">{detail.username || '-'}</Descriptions.Item>
              <Descriptions.Item label="邮箱">{detail.email || '-'}</Descriptions.Item>
              <Descriptions.Item label="紧急度">
                {renderPriority(detail.priority)}
              </Descriptions.Item>
              <Descriptions.Item label="更新时间">{formatDate(detail.updated_at)}</Descriptions.Item>
              {ticketAiDecision && (
                <Descriptions.Item label="AI+手动判断" span={2}>
                  <Space wrap>
                    <Tag color={ticketAiDecision.needsHuman ? 'red' : 'green'}>
                      {ticketAiDecision.needsHuman ? '需要人工二次处理' : '无需人工二次处理'}
                    </Tag>
                    <Text type={ticketAiDecision.needsHuman ? 'danger' : 'secondary'}>
                      {ticketAiDecision.reason || 'AI未返回明确原因'}
                    </Text>
                  </Space>
                </Descriptions.Item>
              )}
              {detail.type === 'appeal' && (
                <>
                  <Descriptions.Item label="申诉状态">
                    <Tag color={appealStatusMeta[detail.appeal_status || '']?.color || 'default'}>
                      {appealStatusMeta[detail.appeal_status || '']?.label || detail.appeal_status || '-'}
                    </Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="封禁状态">{detail.ban_status || '-'}</Descriptions.Item>
                  <Descriptions.Item label="封禁原因" span={2}>{detail.ban_reason || '-'}</Descriptions.Item>
                </>
              )}
              <Descriptions.Item label="工单内容" span={2}>
                <Text style={{ whiteSpace: 'pre-wrap' }}>{detail.content}</Text>
              </Descriptions.Item>
              {aiReviewResult && (
                <Descriptions.Item label="AI审核结果" span={2}>
                  <Tag color={aiReviewResult.approved ? 'green' : 'red'}>
                    {aiReviewResult.approved ? '建议通过' : '建议拒绝'}
                    {aiReviewResult.confidence !== undefined ? ` · ${aiReviewResult.confidence}%` : ''}
                  </Tag>
                  <Text type="secondary">{aiReviewResult.reason || aiReviewResult.suggestion || ''}</Text>
                </Descriptions.Item>
              )}
            </Descriptions>

            <Divider orientation="left">沟通记录</Divider>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 260, overflow: 'auto', paddingRight: 4 }}>
              {replies.map((reply) => (
                <div key={reply.id} style={{
                  padding: 12,
                  borderRadius: 8,
                  background: reply.sender_type === 'user' ? 'rgba(99,102,241,0.08)' : 'rgba(34,197,94,0.08)',
                  border: '1px solid rgba(99,102,241,0.12)',
                }}>
                  <Space style={{ marginBottom: 6 }}>
                    <Text strong>{renderSender(reply)}</Text>
                    {reply.is_ai && <Tag color="purple">AI</Tag>}
                    <Text type="secondary" style={{ fontSize: 12 }}>{formatDate(reply.created_at)}</Text>
                  </Space>
                  <Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{reply.content}</Paragraph>
                </div>
              ))}
              {replies.length === 0 && <Text type="secondary">暂无回复记录</Text>}
            </div>

            {!['resolved', 'closed'].includes(detail.status) && (
              <>
                <Divider orientation="left">回复用户</Divider>
                <Space direction="vertical" style={{ width: '100%' }} size={10}>
                  <TextArea
                    rows={4}
                    maxLength={5000}
                    showCount
                    value={replyText}
                    onChange={(e) => {
                      setReplyText(e.target.value);
                      setDraftFromAi(false);
                    }}
                    placeholder="输入回复内容，发送后会自动通过站内信通知用户"
                  />
                  <Space wrap>
                    {canGenerateAiDraft ? (
                      <Button icon={<RobotOutlined />} loading={aiLoading} onClick={handleGenerateDraft}>AI生成回复草稿</Button>
                    ) : (
                      <Tag color={isGeneralTicketAiManual || isGeneralTicketAutoReply ? 'purple' : 'default'}>
                        {isGeneralTicketAiManual
                          ? 'AI+手动已开启：用户新消息会先由AI正式回复，只有用户明确要求人工时才转人工'
                          : (isGeneralTicketAutoReply ? '普通工单AI自动回复已开启' : '当前为手动回复模式')}
                      </Tag>
                    )}
                    <Button type="primary" icon={<SendOutlined />} loading={sending} onClick={handleSendReply}>
                      发送回复并通知用户
                    </Button>
                    {draftFromAi && <Tag color="purple">当前内容来自AI草稿</Tag>}
                  </Space>
                </Space>
              </>
            )}

            {!['resolved', 'closed'].includes(detail.status) && (
              <>
                <Divider orientation="left">处理结果</Divider>
                <TextArea
                  rows={3}
                  maxLength={2000}
                  showCount
                  value={resolveNote}
                  onChange={(e) => setResolveNote(e.target.value)}
                  placeholder={detail.type === 'appeal' ? '填写申诉处理备注，可作为通知内容发送给用户' : '填写解决说明（选填）'}
                />
                <Space wrap style={{ marginTop: 10 }}>
                  {detail.type === 'appeal' && detail.appeal_status === 'pending' ? (
                    <>
                      <Button
                        type="primary"
                        icon={<CheckCircleOutlined />}
                        loading={sending}
                        onClick={() => handleResolve('approve')}
                        style={{ background: '#22c55e', borderColor: '#22c55e' }}
                      >
                        通过申诉
                      </Button>
                      <Button danger icon={<CloseCircleOutlined />} loading={sending} onClick={() => handleResolve('reject')}>
                        拒绝申诉
                      </Button>
                    </>
                  ) : (
                    <Button type="primary" icon={<ClockCircleOutlined />} loading={sending} onClick={() => handleResolve()}>
                      标记为已解决
                    </Button>
                  )}
                </Space>
              </>
            )}
          </div>
        )}
        {detailLoading && <Text type="secondary">加载中...</Text>}
      </Modal>
    </div>
  );
};

export default TicketManager;
