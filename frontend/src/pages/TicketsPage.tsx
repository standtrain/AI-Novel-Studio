import React, { useEffect, useMemo, useState } from 'react';
import {
  Button, Card, Divider, Empty, Form, Input, List, Modal, Select, Space,
  Table, Tag, Typography, message,
} from 'antd';
import {
  CloseCircleOutlined, CustomerServiceOutlined, EyeOutlined, ReloadOutlined,
  SendOutlined,
} from '@ant-design/icons';
import useMobile from '../hooks/useMobile';
import PageShell from '../components/shared/PageShell';
import {
  TicketPriority, TicketRecord, TicketReply, TicketStatus,
  closeTicketApi, createTicketApi, getTicketDetailApi, getTicketsApi, replyTicketApi,
} from '../api/tickets';

const { Text, Paragraph } = Typography;
const { TextArea } = Input;

const statusMeta: Record<TicketStatus, { label: string; color: string }> = {
  open: { label: '待处理', color: 'orange' },
  answered: { label: '已回复', color: 'blue' },
  resolved: { label: '已解决', color: 'green' },
  closed: { label: '已关闭', color: 'default' },
};

const priorityMeta: Record<TicketPriority, { label: string; color: string }> = {
  low: { label: '低', color: 'default' },
  normal: { label: '普通', color: 'blue' },
  high: { label: '高', color: 'orange' },
  urgent: { label: '紧急', color: 'red' },
};

function formatDate(value?: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString('zh-CN');
}

function renderStatus(status: TicketStatus) {
  const meta = statusMeta[status] || { label: status, color: 'default' };
  return <Tag color={meta.color}>{meta.label}</Tag>;
}

function renderType(ticket: TicketRecord) {
  return ticket.type === 'appeal'
    ? <Tag color="volcano">申诉工单</Tag>
    : <Tag color="cyan">普通工单</Tag>;
}

function renderPriority(priority: TicketPriority) {
  const meta = priorityMeta[priority] || priorityMeta.normal;
  return <Tag color={meta.color}>紧急度：{meta.label}</Tag>;
}

function renderSender(reply: TicketReply) {
  if (reply.sender_type === 'user') return '我';
  if (reply.sender_type === 'admin') return reply.sender_name || '管理员';
  if (reply.sender_type === 'ai') return 'AI 助手';
  return '系统';
}

const TicketsPage: React.FC = () => {
  const isMobile = useMobile();
  const [form] = Form.useForm();
  const [tickets, setTickets] = useState<TicketRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [statusFilter, setStatusFilter] = useState<TicketStatus | undefined>();
  const [selected, setSelected] = useState<TicketRecord | null>(null);
  const [replies, setReplies] = useState<TicketReply[]>([]);
  const [replyText, setReplyText] = useState('');
  const [replying, setReplying] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadTickets = async () => {
    setLoading(true);
    try {
      const result = await getTicketsApi({ limit: 100, status: statusFilter });
      setTickets(result.rows || []);
    } catch (err: any) {
      message.error(err?.response?.data?.error || '加载工单失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadTickets(); }, [statusFilter]);

  const counts = useMemo(() => {
    return tickets.reduce<Record<string, number>>((acc, ticket) => {
      acc[ticket.status] = (acc[ticket.status] || 0) + 1;
      return acc;
    }, {});
  }, [tickets]);

  const openDetail = async (ticketId: number) => {
    setDetailLoading(true);
    setReplyText('');
    try {
      const result = await getTicketDetailApi(ticketId);
      setSelected(result.ticket);
      setReplies(result.replies || []);
    } catch (err: any) {
      message.error(err?.response?.data?.error || '加载详情失败');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleCreate = async (values: { title: string; content: string; priority?: TicketPriority }) => {
    setCreating(true);
    try {
      const result = await createTicketApi({
        title: values.title.trim(),
        content: values.content.trim(),
        priority: values.priority || 'normal',
      });
      message.success('工单已提交');
      form.resetFields();
      await loadTickets();
      setSelected(result.ticket);
      setReplies(result.replies || []);
    } catch (err: any) {
      message.error(err?.response?.data?.error || '提交失败');
    } finally {
      setCreating(false);
    }
  };

  const refreshSelected = async () => {
    if (!selected) return;
    const result = await getTicketDetailApi(selected.id);
    setSelected(result.ticket);
    setReplies(result.replies || []);
  };

  const handleReply = async () => {
    if (!selected || !replyText.trim()) {
      message.warning('请先填写回复内容');
      return;
    }
    setReplying(true);
    try {
      const result = await replyTicketApi(selected.id, replyText.trim());
      setSelected(result.ticket);
      setReplies(result.replies || []);
      setReplyText('');
      message.success('回复已提交');
      loadTickets();
    } catch (err: any) {
      message.error(err?.response?.data?.error || '回复失败');
    } finally {
      setReplying(false);
    }
  };

  const handleClose = async () => {
    if (!selected) return;
    setReplying(true);
    try {
      const result = await closeTicketApi(selected.id);
      setSelected(result.ticket);
      setReplies(result.replies || []);
      message.success('工单已关闭');
      loadTickets();
    } catch (err: any) {
      message.error(err?.response?.data?.error || '关闭失败');
    } finally {
      setReplying(false);
    }
  };

  const columns = [
    {
      title: '工单',
      dataIndex: 'title',
      ellipsis: true,
      render: (title: string, record: TicketRecord) => (
        <Space direction="vertical" size={2}>
          <Space size={6} wrap>
            {renderPriority(record.priority)}
            {renderType(record)}
            <Text strong ellipsis style={{ maxWidth: isMobile ? 180 : 340 }}>{title}</Text>
          </Space>
          <Text type="secondary" style={{ fontSize: 12 }}>{formatDate(record.updated_at)}</Text>
        </Space>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (status: TicketStatus) => renderStatus(status),
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      render: (_: any, record: TicketRecord) => (
        <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => openDetail(record.id)}>查看</Button>
      ),
    },
  ];

  return (
    <PageShell
      title="提交工单"
      subtitle="提交问题、查看处理进度，并继续补充信息"
      icon={<CustomerServiceOutlined />}
      actions={(
        <Space wrap>
          <Tag color="orange">待处理 {counts.open || 0}</Tag>
          <Tag color="blue">已回复 {counts.answered || 0}</Tag>
          <Button icon={<ReloadOutlined />} onClick={loadTickets} loading={loading}>刷新</Button>
        </Space>
      )}
    >

      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : 'minmax(320px, 0.8fr) minmax(0, 1.4fr)',
        gap: 18,
        alignItems: 'start',
      }}>
        <Card
          title={<span><SendOutlined /> 新建工单</span>}
          style={{ borderRadius: 12, background: 'rgba(30,41,59,0.72)', borderColor: 'rgba(99,102,241,0.18)' }}
        >
          <Form form={form} layout="vertical" onFinish={handleCreate} initialValues={{ priority: 'normal' }}>
            <Form.Item
              name="title"
              label="标题"
              rules={[{ required: true, message: '请输入标题' }, { min: 2, max: 120, message: '标题长度需为2-120个字符' }]}
            >
              <Input maxLength={120} placeholder="例如：章节生成失败" />
            </Form.Item>
            <Form.Item name="priority" label="紧急度" rules={[{ required: true }]}>
              <Select
                options={[
                  { value: 'low', label: '低' },
                  { value: 'normal', label: '普通' },
                  { value: 'high', label: '高' },
                  { value: 'urgent', label: '紧急' },
                ]}
              />
            </Form.Item>
            <Form.Item
              name="content"
              label="内容"
              rules={[{ required: true, message: '请输入工单内容' }, { min: 5, max: 5000, message: '内容长度需为5-5000个字符' }]}
            >
              <TextArea rows={7} maxLength={5000} showCount placeholder="描述你遇到的问题、期望结果和相关小说/章节信息" />
            </Form.Item>
            <Button type="primary" htmlType="submit" loading={creating} icon={<SendOutlined />} block>
              提交工单
            </Button>
          </Form>
        </Card>

        <Card
          title={<span><CustomerServiceOutlined /> 我的工单</span>}
          extra={(
            <Select
              allowClear
              placeholder="筛选状态"
              style={{ width: 128 }}
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: 'open', label: '待处理' },
                { value: 'answered', label: '已回复' },
                { value: 'resolved', label: '已解决' },
                { value: 'closed', label: '已关闭' },
              ]}
            />
          )}
          style={{ borderRadius: 12, background: 'rgba(30,41,59,0.72)', borderColor: 'rgba(99,102,241,0.18)' }}
        >
          {tickets.length === 0 && !loading ? (
            <Empty description="暂无工单" />
          ) : (
            <Table
              columns={columns}
              dataSource={tickets}
              rowKey="id"
              loading={loading}
              size="small"
              pagination={{ pageSize: 10 }}
              scroll={{ x: 620 }}
            />
          )}
        </Card>
      </div>

      <Modal
        title={selected ? <Space>{renderType(selected)}<span>{selected.title}</span>{renderStatus(selected.status)}</Space> : '工单详情'}
        open={!!selected}
        onCancel={() => setSelected(null)}
        footer={null}
        width={isMobile ? '95vw' : 720}
        destroyOnClose
      >
        {selected && (
          <div>
            <Space wrap style={{ marginBottom: 12 }}>
              {renderPriority(selected.priority)}
              <Text type="secondary">创建于 {formatDate(selected.created_at)}</Text>
              <Text type="secondary">更新于 {formatDate(selected.updated_at)}</Text>
            </Space>
            <Card size="small" style={{ background: 'rgba(15,23,42,0.45)', borderColor: 'rgba(99,102,241,0.12)', marginBottom: 12 }}>
              <Paragraph style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>{selected.content}</Paragraph>
            </Card>

            <Divider orientation="left">沟通记录</Divider>
            <List
              dataSource={replies}
              loading={detailLoading}
              locale={{ emptyText: '暂无回复' }}
              renderItem={(reply) => (
                <List.Item style={{ borderBlockEnd: '1px solid rgba(99,102,241,0.08)' }}>
                  <List.Item.Meta
                    title={(
                      <Space>
                        <Text strong>{renderSender(reply)}</Text>
                        {reply.is_ai && <Tag color="purple">AI</Tag>}
                        <Text type="secondary" style={{ fontSize: 12 }}>{formatDate(reply.created_at)}</Text>
                      </Space>
                    )}
                    description={<Paragraph style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>{reply.content}</Paragraph>}
                  />
                </List.Item>
              )}
            />

            {!['resolved', 'closed'].includes(selected.status) && (
              <>
                <Divider />
                <TextArea
                  rows={4}
                  maxLength={5000}
                  showCount
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="继续补充信息"
                />
                <Space wrap style={{ marginTop: 12 }}>
                  <Button type="primary" icon={<SendOutlined />} loading={replying} onClick={handleReply}>提交回复</Button>
                  {selected.type === 'general' && (
                    <Button icon={<CloseCircleOutlined />} loading={replying} onClick={handleClose}>关闭工单</Button>
                  )}
                  <Button onClick={refreshSelected}>刷新详情</Button>
                </Space>
              </>
            )}
          </div>
        )}
      </Modal>
    </PageShell>
  );
};

export default TicketsPage;
