import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Button, Input, Typography, message, Space } from 'antd';
import { ArrowLeftOutlined, SaveOutlined } from '@ant-design/icons';
import client from '../api/client';
import type { Chapter } from '../types';

const { Title } = Typography;
const { TextArea } = Input;

const ChapterEditPage: React.FC = () => {
  const { id, num } = useParams<{ id: string; num: string }>();
  const navigate = useNavigate();
  const novelId = parseInt(id!, 10);
  const chapterNum = parseInt(num!, 10);

  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadChapter();
  }, [novelId, chapterNum]);

  const loadChapter = async () => {
    try {
      const { data } = await client.get(`/novels/${novelId}/chapters/${chapterNum}`);
      setChapter(data.chapter);
      setContent(data.chapter.content || '');
    } catch (err: any) {
      message.error('加载章节失败');
      navigate(`/novel/${novelId}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await client.put(`/novels/${novelId}/chapters/${chapterNum}`, { content });
      message.success('保存成功');
    } catch (err: any) {
      message.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return null;

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} type="link" onClick={() => navigate(`/novel/${novelId}`)} style={{ color: 'var(--lp-accent)' }}>
          返回创作工作台
        </Button>
      </Space>

      <Title level={3} style={{ color: '#f1f5f9' }}>第{chapterNum}章 {chapter?.title || ''}</Title>

      <Card
        style={{
          background: 'rgba(30,41,59,0.6)',
          border: '1px solid rgba(99,102,241,0.2)',
          borderRadius: 12
        }}
      >
        <TextArea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={20}
          style={{
            fontSize: 15,
            lineHeight: 1.8,
            background: 'rgba(15,23,42,0.5)',
            borderColor: 'rgba(99,102,241,0.3)',
            color: '#f1f5f9'
          }}
        />
        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#64748b' }}>字数：{content.length}</span>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={handleSave}
            loading={saving}
            style={{
              background: 'linear-gradient(135deg, var(--lp-primary) 0%, var(--lp-primary-dark) 100%)',
              border: 'none'
            }}
          >
            保存
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default ChapterEditPage;
