import React, { useEffect, useState, useCallback } from 'react';
import { Modal } from 'antd';
import { ExclamationCircleOutlined } from '@ant-design/icons';
import { getSiteNotificationsApi } from '../../api/site';
import type { Notification } from '../../types';

const STORAGE_KEY = 'dismissed_notifications';

const NotificationPopup: React.FC = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [current, setCurrent] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    getSiteNotificationsApi()
      .then((res) => {
        const popups: Notification[] = res.popups || [];
        if (popups.length === 0) return;

        // 读取已关闭列表，过滤掉已关闭的通知
        let dismissed: number[] = [];
        try {
          dismissed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        } catch { dismissed = []; }
        const unread = popups.filter((n) => !dismissed.includes(n.id));
        if (unread.length > 0) {
          setNotifications(unread);
          setVisible(true);
        }
      })
      .catch(() => {});
  }, []);

  const dismiss = useCallback((id: number) => {
    try {
      const dismissed: number[] = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      if (!dismissed.includes(id)) {
        dismissed.push(id);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(dismissed));
      }
    } catch { /* ignore */ }
  }, []);

  const handleClose = () => {
    if (current < notifications.length - 1) {
      dismiss(notifications[current].id);
      setCurrent((c) => c + 1);
    } else {
      dismiss(notifications[current]?.id);
      setVisible(false);
    }
  };

  if (!visible || notifications.length === 0) return null;

  const item = notifications[current];
  const isLast = current >= notifications.length - 1;

  return (
    <Modal
      title={
        <span style={{ color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}>
          <ExclamationCircleOutlined style={{ color: '#f59e0b' }} />
          {item.title}
          {notifications.length > 1 && (
            <span style={{ color: '#64748b', fontSize: 12, fontWeight: 400 }}>
              ({current + 1}/{notifications.length})
            </span>
          )}
        </span>
      }
      open={visible}
      onCancel={handleClose}
      footer={null}
      width={480}
      closable={false}
      maskClosable={false}
    >
      <div style={{ color: '#cbd5e1', fontSize: 14, lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
        {item.content}
      </div>
      <div style={{ textAlign: 'right', marginTop: 20 }}>
        <button
          onClick={handleClose}
          style={{
            background: 'linear-gradient(135deg, #6366f1, #7c3aed)',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            padding: '8px 24px',
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          {isLast ? '知道了' : '下一条'}
        </button>
      </div>
    </Modal>
  );
};

export default NotificationPopup;
