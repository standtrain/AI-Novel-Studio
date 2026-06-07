import React, { useEffect, useState, useRef } from 'react';
import { getSiteNotificationsApi } from '../../api/site';
import type { Notification } from '../../types';

const NotificationBanner: React.FC = () => {
  const [items, setItems] = useState<Notification[]>([]);
  const [current, setCurrent] = useState(0);
  const [visible, setVisible] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    getSiteNotificationsApi()
      .then((res) => setItems(res.banners || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (items.length <= 1) return;
    timerRef.current = setInterval(() => {
      setCurrent((c) => (c + 1) % items.length);
    }, 5000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [items.length]);

  if (!visible || items.length === 0) return null;

  const item = items[current];

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(99,102,241,0.15) 0%, rgba(34,211,238,0.1) 100%)',
      borderBottom: '1px solid rgba(99,102,241,0.2)',
      padding: '8px 24px',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      overflow: 'hidden',
      position: 'relative',
    }}>
      <span style={{
        background: 'rgba(99,102,241,0.2)',
        color: '#818cf8',
        padding: '2px 10px',
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 600,
        flexShrink: 0,
      }}>
        公告
      </span>
      <span style={{
        color: '#e2e8f0',
        fontSize: 13,
        flex: 1,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        transition: 'opacity 0.3s',
      }}>
        <strong>{item.title}</strong>
        {item.title && item.content ? '：' : ''}
        {item.content}
      </span>

      {items.length > 1 && (
        <span style={{ color: '#64748b', fontSize: 11, flexShrink: 0 }}>
          {current + 1}/{items.length}
        </span>
      )}

      <span
        onClick={() => setVisible(false)}
        style={{
          color: '#64748b',
          cursor: 'pointer',
          fontSize: 16,
          lineHeight: 1,
          flexShrink: 0,
          padding: '0 4px',
        }}
        title="关闭通知栏"
      >
        ×
      </span>
    </div>
  );
};

export default NotificationBanner;
