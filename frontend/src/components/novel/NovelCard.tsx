import React from 'react';
import { Card, Tag, Typography, Space } from 'antd';
import { BookOutlined, ClockCircleOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import type { Novel } from '../../types';
import ExportButton from './ExportButton';

const { Text } = Typography;

const statusMap: Record<string, { color: string; label: string; bg: string }> = {
  draft: { color: '#94a3b8', label: '草稿', bg: 'rgba(148,163,184,0.1)' },
  outline: { color: '#60a5fa', label: '已生成大纲', bg: 'rgba(96,165,250,0.1)' },
  characters: { color: '#22d3ee', label: '已设定人物', bg: 'rgba(34,211,238,0.1)' },
  chapters_outline: { color: '#a78bfa', label: '已规划章节', bg: 'rgba(167,139,250,0.1)' },
  writing: { color: '#fbbf24', label: '创作中', bg: 'rgba(251,191,36,0.1)' },
  completed: { color: '#34d399', label: '已完成', bg: 'rgba(52,211,153,0.1)' },
};

interface NovelCardProps {
  novel: Novel;
  onClick: () => void;
  onDelete?: () => void;
}

const NovelCard: React.FC<NovelCardProps> = ({ novel, onClick, onDelete }) => {
  const statusInfo = statusMap[novel.status] || statusMap.draft;

  return (
    <>
      <div
        className="novel-card-wrapper"
        style={{
        cursor: 'pointer',
        transition: 'all 0.3s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-8px) scale(1.02)';
        e.currentTarget.querySelector('.card-inner')?.setAttribute('style',
          'box-shadow: 0 20px 40px rgba(0,0,0,0.4), 0 0 30px rgba(99,102,241,0.2); border-color: rgba(99,102,241,0.4);'
        );
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0) scale(1)';
        e.currentTarget.querySelector('.card-inner')?.setAttribute('style',
          'box-shadow: 0 8px 32px rgba(0,0,0,0.3), 0 0 20px rgba(99,102,241,0.1); border-color: rgba(99,102,241,0.15);'
        );
      }}
    >
      <Card
        hoverable
        onClick={onClick}
        className="card-inner"
        style={{
          height: '100%',
          background: 'rgba(30,41,59,0.7)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(99,102,241,0.15)',
          borderRadius: 20,
          boxShadow: '0 8px 32px rgba(0,0,0,0.3), 0 0 20px rgba(99,102,241,0.1)',
          transition: 'all 0.3s ease',
          overflow: 'hidden',
        }}
        styles={{
          body: { padding: 0 },
        }}
      >
        {/* 顶部渐变装饰条 */}
        <div style={{
          height: 6,
          background: 'linear-gradient(90deg, #6366f1 0%, #8b5cf6 50%, #a78bfa 100%)',
          borderRadius: '20px 20px 0 0',
        }} />

        <div style={{ padding: 20, position: 'relative' }}>
          {/* 删除按钮 — 悬停时显示 */}
          {onDelete && (
            <div
              className="novel-card-delete-btn"
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              title="删除小说"
              style={{
                position: 'absolute',
                top: 8,
                right: 12,
                width: 32,
                height: 32,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 8,
                background: 'rgba(239,68,68,0.1)',
                color: '#ef4444',
                cursor: 'pointer',
                opacity: 0,
                transition: 'all 0.2s ease',
                zIndex: 10,
              }}
            >
              <DeleteOutlined style={{ fontSize: 15 }} />
            </div>
          )}
          {/* 标题区域 */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 16 }}>
            <div style={{
              width: 48,
              height: 48,
              background: 'linear-gradient(135deg, rgba(99,102,241,0.15) 0%, rgba(139,92,246,0.15) 100%)',
              borderRadius: 14,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              boxShadow: '0 4px 12px rgba(99,102,241,0.15)',
            }}>
              <BookOutlined style={{ fontSize: 22, color: '#818cf8' }} />
            </div>
            <div style={{ flex: 1, minWidth: 0, paddingRight: onDelete ? 28 : 0 }}>
              <h3 style={{
                color: '#f1f5f9',
                margin: 0,
                fontSize: 17,
                fontWeight: 600,
                lineHeight: 1.4,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {novel.title || '未命名小说'}
              </h3>
              {novel.genre && (
                <Text style={{ color: '#818cf8', fontSize: 12, fontWeight: 500 }}>
                  {novel.genre}
                </Text>
              )}
            </div>
          </div>

          {/* 信息区域 */}
          <Space direction="vertical" size={8} style={{ width: '100%', marginBottom: 16 }}>
            {(novel.chapter_count ?? 0) > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <EditOutlined style={{ color: '#64748b', fontSize: 13 }} />
                <Text style={{ color: '#94a3b8', fontSize: 13 }}>
                  {novel.status === 'completed' ? `已完成 ${novel.chapter_count} 章` : `共 ${novel.chapter_count} 章`}
                </Text>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ClockCircleOutlined style={{ color: '#64748b', fontSize: 13 }} />
              <Text style={{ color: '#94a3b8', fontSize: 13 }}>
                {new Date(novel.updated_at).toLocaleDateString('zh-CN')}
              </Text>
            </div>
          </Space>

          {/* 导出按钮 */}
          <div onClick={(e) => e.stopPropagation()} style={{ marginBottom: 8, textAlign: 'center' }}>
            <ExportButton novelId={novel.id} variant="cardAction" chapterCount={novel.chapter_count || 0} />
          </div>

          {/* 状态标签 */}
          <div style={{
            padding: '10px 14px',
            background: statusInfo.bg,
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <Tag
              style={{
                margin: 0,
                background: 'transparent',
                border: `1px solid ${statusInfo.color}`,
                color: statusInfo.color,
                fontWeight: 500,
                fontSize: 13,
                padding: '4px 12px',
                borderRadius: 8,
              }}
            >
              {statusInfo.label}
            </Tag>
          </div>
        </div>
      </Card>
    </div>
    <style>{`
      .novel-card-wrapper:hover .novel-card-delete-btn {
        opacity: 1 !important;
      }
      .novel-card-delete-btn:hover {
        background: rgba(239,68,68,0.2) !important;
        color: #dc2626 !important;
      }
    `}</style>
    </>
  );
};

export default NovelCard;