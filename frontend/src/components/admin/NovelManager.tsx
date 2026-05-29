import React, { useEffect, useState } from 'react';
import { Table, Tag, Button, Typography, message, Popconfirm, Space, Modal, Descriptions, List } from 'antd';
import { DeleteOutlined, EyeOutlined } from '@ant-design/icons';
import { getAdminNovelsApi, getAdminNovelDetailApi, deleteAdminNovelApi } from '../../api/admin';

const { Text } = Typography;

const statusMap: Record<string, { color: string; label: string }> = {
  draft: { color: 'default', label: '草稿' },
  outline: { color: 'blue', label: '已生成大纲' },
  characters: { color: 'cyan', label: '已设定人物' },
  chapters_outline: { color: 'geekblue', label: '已规划章节' },
  writing: { color: 'orange', label: '创作中' },
  completed: { color: 'green', label: '已完成' },
};

const NovelManager: React.FC = () => {
  const [novels, setNovels] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  // 详情弹窗
  const [detail, setDetail] = useState<any>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  useEffect(() => { loadNovels(); }, [page]);

  const loadNovels = async () => {
    setLoading(true);
    try {
      const data = await getAdminNovelsApi({ page, limit: 20 });
      setNovels(data.rows || []);
      setTotal(data.total);
    } catch {
      message.error('加载小说列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleView = async (novelId: number) => {
    try {
      const data = await getAdminNovelDetailApi(novelId);
      setDetail(data.novel);
      setDetailOpen(true);
    } catch {
      message.error('加载详情失败');
    }
  };

  const handleDelete = async (novelId: number) => {
    try {
      await deleteAdminNovelApi(novelId);
      message.success('小说已删除');
      loadNovels();
    } catch {
      message.error('删除失败');
    }
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 50 },
    { title: '标题', dataIndex: 'title', width: 180, ellipsis: true },
    { title: '作者', dataIndex: 'username', width: 100 },
    {
      title: '状态', dataIndex: 'status', width: 110,
      render: (s: string) => {
        const info = statusMap[s] || statusMap.draft;
        return <Tag color={info.color}>{info.label}</Tag>;
      },
    },
    { title: '章节', dataIndex: 'chapter_count', width: 60, align: 'center' as const },
    {
      title: '更新时间', dataIndex: 'updated_at', width: 110,
      render: (v: string) => v ? new Date(v).toLocaleDateString('zh-CN') : '-',
    },
    {
      title: '操作', width: 120,
      render: (_: any, record: any) => (
        <Space size={4}>
          <Button size="small" icon={<EyeOutlined />} onClick={() => handleView(record.id)}>查看</Button>
          <Popconfirm
            title={`确认删除小说 "${record.title}"？此操作不可恢复！`}
            onConfirm={() => handleDelete(record.id)}
            okText="确认删除" cancelText="取消"
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Text style={{ color: '#94a3b8', display: 'block', marginBottom: 16 }}>共 {total} 部小说</Text>

      <Table
        columns={columns}
        dataSource={novels}
        rowKey="id"
        loading={loading}
        pagination={{ current: page, total, pageSize: 20, onChange: setPage }}
        scroll={{ x: 800 }}
        size="small"
      />

      {/* 详情弹窗 */}
      <Modal
        title={detail?.title || '小说详情'}
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        footer={null}
        width={600}
      >
        {detail && (
          <>
            <Descriptions column={2} size="small" bordered>
              <Descriptions.Item label="作者">{detail.username}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={(statusMap[detail.status] || statusMap.draft).color}>
                  {(statusMap[detail.status] || statusMap.draft).label}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="类型">{detail.genre || '-'}</Descriptions.Item>
              <Descriptions.Item label="主题">{detail.theme || '-'}</Descriptions.Item>
              <Descriptions.Item label="章节数">{detail.chapter_count || 0}</Descriptions.Item>
              <Descriptions.Item label="创建时间">{new Date(detail.created_at).toLocaleDateString('zh-CN')}</Descriptions.Item>
            </Descriptions>

            {detail.characters?.length > 0 && (
              <>
                <Text strong style={{ display: 'block', marginTop: 12, marginBottom: 4 }}>角色 ({detail.characters.length})</Text>
                <List size="small" dataSource={detail.characters} renderItem={(c: any) => (
                  <List.Item><Text strong>{c.name}</Text> — {c.role || '-'}</List.Item>
                )} />
              </>
            )}

            {detail.chapters?.length > 0 && (
              <>
                <Text strong style={{ display: 'block', marginTop: 12, marginBottom: 4 }}>章节 ({detail.chapters.length})</Text>
                <List size="small" dataSource={detail.chapters} renderItem={(ch: any) => (
                  <List.Item>
                    <Tag color="blue">第{ch.chapter_number}章</Tag>
                    {ch.title}
                    <Tag style={{ marginLeft: 8 }}>{ch.status === 'completed' ? '已写完' : '大纲'}</Tag>
                  </List.Item>
                )} />
              </>
            )}
          </>
        )}
      </Modal>
    </div>
  );
};

export default NovelManager;
