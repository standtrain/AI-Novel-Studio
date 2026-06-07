import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, Empty, Space, Tag, Typography, message } from 'antd';
import { BarChartOutlined, BookOutlined, EnterOutlined, HomeOutlined, PlusOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import DashboardCharts from '../components/dashboard/DashboardCharts';
import LoadingSpinner from '../components/shared/LoadingSpinner';
import PageShell from '../components/shared/PageShell';
import useMobile from '../hooks/useMobile';
import { listNovelsApi } from '../api/novels';
import type { Novel } from '../types';

const { Title, Text } = Typography;

const statusLabelMap: Record<string, string> = {
  draft: '草稿',
  outline: '大纲',
  characters: '人物设定',
  chapters_outline: '章节大纲',
  writing: '写作中',
  completed: '已完成',
};

const statusColorMap: Record<string, string> = {
  draft: 'default',
  outline: 'blue',
  characters: 'green',
  chapters_outline: 'orange',
  writing: 'volcano',
  completed: 'purple',
};

const getNovelTime = (novel: Novel) => new Date(novel.updated_at || novel.created_at).getTime() || 0;

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const isMobile = useMobile();
  const [novels, setNovels] = useState<Novel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const data = await listNovelsApi(1, 50);
        setNovels(data.rows || []);
      } catch (err: any) {
        message.error(err.response?.data?.error || '加载首页数据失败');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const sortedNovels = useMemo(
    () => [...novels].sort((a, b) => getNovelTime(b) - getNovelTime(a)),
    [novels],
  );

  const continueNovel = useMemo(
    () => sortedNovels.find((novel) => novel.status !== 'completed') || sortedNovels[0],
    [sortedNovels],
  );

  if (loading) return <LoadingSpinner tip="加载首页数据..." />;

  return (
    <PageShell
      title="首页"
      subtitle="查看创作概览，快速回到最近的小说工作台"
      icon={<HomeOutlined />}
      actions={(
        <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/dashboard')}>
          新建或管理小说
        </Button>
      )}
    >
      {continueNovel ? (
        <div className="unified-page-feature-card" style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) auto',
          gap: 18,
          alignItems: 'center',
          padding: 26,
          background: 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(34,211,238,0.1))',
          border: '1px solid rgba(129,140,248,0.28)',
          borderRadius: 8,
          boxShadow: '0 18px 44px rgba(15,23,42,0.32)',
        }}>
          <div style={{ minWidth: 0 }}>
            <Space size={8} wrap style={{ marginBottom: 12 }}>
              <Tag color={continueNovel.status === 'completed' ? 'green' : 'blue'} style={{ borderRadius: 8 }}>
                {continueNovel.status === 'completed' ? '最近作品' : '继续创作'}
              </Tag>
              <Text style={{ color: '#94a3b8', fontSize: 13 }}>
                更新于 {new Date(continueNovel.updated_at).toLocaleDateString('zh-CN')}
              </Text>
            </Space>
            <Title level={3} style={{
              color: '#f8fafc',
              margin: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              《{continueNovel.title || '未命名小说'}》
            </Title>
            <Space size={10} wrap style={{ marginTop: 12 }}>
              {continueNovel.genre && <Text style={{ color: '#a5b4fc', fontSize: 15 }}>{continueNovel.genre}</Text>}
              <Tag color={statusColorMap[continueNovel.status] || 'blue'} style={{ borderRadius: 8 }}>
                {statusLabelMap[continueNovel.status] || continueNovel.status}
              </Tag>
              <Text style={{ color: '#94a3b8', fontSize: 15 }}>共 {continueNovel.chapter_count || 0} 章</Text>
            </Space>
          </div>
          <Button
            type="primary"
            icon={<EnterOutlined />}
            onClick={() => navigate(`/novel/${continueNovel.id}`)}
            style={{ height: 42, borderRadius: 10, fontWeight: 600 }}
          >
            进入工作台
          </Button>
        </div>
      ) : (
        <Card
          style={{
            background: 'rgba(30,41,59,0.52)',
            border: '1px dashed rgba(99,102,241,0.22)',
          }}
        >
          <Empty
            image={<BookOutlined style={{ color: '#818cf8', fontSize: 42 }} />}
            description={<span style={{ color: '#94a3b8' }}>还没有小说，先创建一部作品吧</span>}
          >
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/dashboard')}>
              去创建小说
            </Button>
          </Empty>
        </Card>
      )}

      <Card
        title={<span style={{ color: '#f1f5f9' }}><BarChartOutlined /> 创作数据</span>}
        bordered={false}
        style={{
          background: 'rgba(30,41,59,0.52)',
          border: '1px solid rgba(99,102,241,0.16)',
        }}
      >
        <DashboardCharts novels={novels} statusLabelMap={statusLabelMap} />
      </Card>
    </PageShell>
  );
};

export default HomePage;
