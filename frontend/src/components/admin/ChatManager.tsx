import React, { useEffect, useState, useRef } from 'react';
import { Table, Button, Modal, Typography, Input, App, Tag, Space, Popconfirm } from 'antd';
import { SearchOutlined, EyeOutlined, DeleteOutlined, ReloadOutlined } from '@ant-design/icons';
import {
  getAdminConversationsApi,
  getAdminConversationDetailApi,
  deleteAdminConversationApi,
} from '../../api/admin';

const { Text } = Typography;

interface ConvRow {
  id: number;
  user_id: number;
  title: string;
  username?: string;
  email?: string;
  created_at: string;
  updated_at: string;
}

interface MsgItem {
  id: number;
  role: string;
  content: string;
  created_at: string;
}

const ChatManager: React.FC = () => {
  const { message: msgApi } = App.useApp();

  const [data, setData] = useState<ConvRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [total, setTotal] = useState(0);
  const [keyword, setKeyword] = useState('');
  const keywordTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialLoadFinishedRef = useRef(false);

  // 详情弹窗
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailMessages, setDetailMessages] = useState<MsgItem[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTitle, setDetailTitle] = useState('');

  const load = async (p = page, kw = keyword) => {
    setLoading(true);
    try {
      const res = await getAdminConversationsApi({
        page: p,
        limit,
        keyword: kw || undefined,
      });
      setData(res.rows || []);
      setTotal(res.total || 0);
      setPage(p);
    } catch {
      msgApi.error('加载对话列表失败');
    } finally {
      setLoading(false);
      initialLoadFinishedRef.current = true;
    }
  };

  useEffect(() => {
    load();
  }, []);

  // 关键词变更时防抖搜索
  useEffect(() => {
    if (!initialLoadFinishedRef.current) return;
    if (keywordTimerRef.current) clearTimeout(keywordTimerRef.current);
    keywordTimerRef.current = setTimeout(() => {
      load(1, keyword);
    }, 300);
    return () => {
      if (keywordTimerRef.current) clearTimeout(keywordTimerRef.current);
    };
  }, [keyword]);

  const handleRefresh = () => {
    if (keywordTimerRef.current) clearTimeout(keywordTimerRef.current);
    setKeyword('');
    load(1, '');
  };

  const handleView = async (id: number, title: string) => {
    setDetailTitle(title);
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailMessages([]);
    try {
      const res = await getAdminConversationDetailApi(id);
      setDetailMessages(res.messages || []);
    } catch {
      msgApi.error('加载对话详情失败');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteAdminConversationApi(id);
      msgApi.success('对话已删除');
      load(page, keyword);
    } catch {
      msgApi.error('删除对话失败');
    }
  };

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 70,
    },
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
      render: (t: string) => (
        <Text style={{ color: '#f1f5f9' }}>{t}</Text>
      ),
    },
    {
      title: '用户',
      key: 'user',
      width: 160,
      render: (_: any, r: ConvRow) => (
        <span>
          <Text style={{ color: '#cbd5e1' }}>{r.username || '—'}</Text>
          <br />
          <Text style={{ color: '#64748b', fontSize: 12 }}>{r.email || ''}</Text>
        </span>
      ),
    },
    {
      title: '更新时间',
      dataIndex: 'updated_at',
      key: 'updated_at',
      width: 170,
      render: (t: string) => (
        <Text style={{ color: '#94a3b8', fontSize: 13 }}>
          {new Date(t).toLocaleString('zh-CN')}
        </Text>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 150,
      render: (_: any, r: ConvRow) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => handleView(r.id, r.title)}
            style={{ padding: 0 }}
          >
            查看
          </Button>
          <Popconfirm
            title="确认删除该对话？"
            onConfirm={() => handleDelete(r.id)}
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
          >
            <Button
              type="link"
              size="small"
              danger
              icon={<DeleteOutlined />}
              style={{ padding: 0 }}
            >
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      {/* 工具栏 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <Input
          placeholder="搜索对话标题..."
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          style={{ width: 240, background: 'rgba(15,23,42,0.5)', borderColor: 'rgba(99,102,241,0.3)', color: '#f1f5f9' }}
          prefix={<SearchOutlined style={{ color: '#64748b' }} />}
          allowClear
        />
        <Button onClick={handleRefresh} icon={<ReloadOutlined />} size="small">
          刷新
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={data}
        rowKey="id"
        loading={loading}
        size="small"
        pagination={{
          current: page,
          pageSize: limit,
          total,
          showSizeChanger: false,
          showTotal: (t) => `共 ${t} 条`,
          onChange: (p) => load(p, keyword),
        }}
        locale={{ emptyText: '暂无对话记录' }}
      />

      {/* 详情弹窗 */}
      <Modal
        title={
          <span style={{ color: '#f1f5f9' }}>
            对话详情 — {detailTitle}
          </span>
        }
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        footer={null}
        width={700}
        styles={{ body: { maxHeight: '60vh', overflowY: 'auto', background: '#0f172a' } }}
      >
        {detailLoading ? (
          <Text style={{ color: '#94a3b8' }}>加载中...</Text>
        ) : detailMessages.length === 0 ? (
          <Text style={{ color: '#64748b' }}>暂无消息</Text>
        ) : (
          <div>
            {detailMessages.map((msg) => (
              <div
                key={msg.id}
                style={{
                  marginBottom: 12,
                  display: 'flex',
                  justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                }}
              >
                <div
                  style={{
                    maxWidth: '80%',
                    padding: '8px 14px',
                    borderRadius: 12,
                    background:
                      msg.role === 'user'
                        ? 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)'
                        : 'rgba(30,41,59,0.85)',
                    border:
                      msg.role === 'user'
                        ? 'none'
                        : '1px solid rgba(99,102,241,0.15)',
                  }}
                >
                  <div style={{ marginBottom: 4 }}>
                    <Tag
                      color={msg.role === 'user' ? 'blue' : 'green'}
                      style={{ fontSize: 11, lineHeight: '16px' }}
                    >
                      {msg.role === 'user' ? '用户' : 'AI'}
                    </Tag>
                    <Text style={{ color: '#64748b', fontSize: 11, marginLeft: 4 }}>
                      {new Date(msg.created_at).toLocaleString('zh-CN')}
                    </Text>
                  </div>
                  <Text
                    style={{
                      color: '#f1f5f9',
                      fontSize: 13,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {msg.content}
                  </Text>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default ChatManager;
