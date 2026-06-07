import React, { useState, useEffect, useCallback } from 'react';
import { Popover, List, Badge, Button, Empty, Typography, Space } from 'antd';
import { MailOutlined } from '@ant-design/icons';
import { getInmailsApi, getInmailUnreadCountApi, markInmailReadApi, markAllInmailReadApi } from '../../api/site';
import type { Inmail } from '../../types';

const { Text, Paragraph } = Typography;

interface Props {
  children: React.ReactNode;
}

const InmailPanel: React.FC<Props> = ({ children }) => {
  const [unreadCount, setUnreadCount] = useState(0);
  const [messages, setMessages] = useState<Inmail[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await getInmailUnreadCountApi();
      setUnreadCount(res.count);
    } catch { /* ignore */ }
  }, []);

  const fetchMessages = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getInmailsApi({ page: 1, limit: 20 });
      setMessages(res.rows);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchUnreadCount();
    const timer = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(timer);
  }, [fetchUnreadCount]);

  const handleOpen = (visible: boolean) => {
    setOpen(visible);
    if (visible) fetchMessages();
  };

  const handleMarkRead = async (id: number) => {
    try {
      await markInmailReadApi(id);
      setMessages(prev => prev.map(m => m.id === id ? { ...m, is_read: true } : m));
      setUnreadCount(c => Math.max(0, c - 1));
    } catch { /* ignore */ }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllInmailReadApi();
      setMessages(prev => prev.map(m => ({ ...m, is_read: true })));
      setUnreadCount(0);
    } catch { /* ignore */ }
  };

  const content = (
    <div style={{ width: 360, maxHeight: 420 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Text strong style={{ fontSize: 14, color: '#f1f5f9' }}>站内信</Text>
        {unreadCount > 0 && (
          <Button type="link" size="small" onClick={handleMarkAllRead}>全部已读</Button>
        )}
      </div>
      {messages.length === 0 ? (
        <Empty description="暂无消息" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <List
          loading={loading}
          dataSource={messages}
          style={{ maxHeight: 340, overflow: 'auto' }}
          renderItem={(item) => (
            <List.Item
              key={item.id}
              onClick={() => !item.is_read && handleMarkRead(item.id)}
              style={{
                cursor: item.is_read ? 'default' : 'pointer',
                padding: '10px 12px',
                borderRadius: 8,
                marginBottom: 4,
                background: item.is_read ? 'transparent' : 'rgba(99,102,241,0.08)',
                border: 'none',
              }}
            >
              <List.Item.Meta
                title={
                  <Space>
                    {!item.is_read && <Badge status="processing" />}
                    <Text
                      strong={!item.is_read}
                      style={{ fontSize: 13, color: item.is_read ? '#94a3b8' : '#e2e8f0' }}
                    >
                      {item.title}
                    </Text>
                  </Space>
                }
                description={
                  <div>
                    <Paragraph
                      ellipsis={{ rows: 2 }}
                      style={{ fontSize: 12, color: '#64748b', margin: '4px 0' }}
                    >
                      {item.content}
                    </Paragraph>
                    <Text style={{ fontSize: 11, color: '#475569' }}>
                      {new Date(item.created_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </div>
                }
              />
            </List.Item>
          )}
        />
      )}
    </div>
  );

  return (
    <Popover
      content={content}
      trigger="click"
      open={open}
      onOpenChange={handleOpen}
      placement="bottomRight"
      overlayStyle={{ maxWidth: 400 }}
    >
      <Badge count={unreadCount} size="small" offset={[-2, 2]}>
        {children}
      </Badge>
    </Popover>
  );
};

export default InmailPanel;
