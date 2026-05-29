import React from 'react';
import { Card, Typography, Tag, Space, Button, Collapse, List, Badge, Popconfirm } from 'antd';
import { EditOutlined, AuditOutlined, NodeIndexOutlined, WarningOutlined, ReloadOutlined, RobotOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import type { Chapter, ReviewIssue, ExtractionResult } from '../../types';

const {  Paragraph, Text } = Typography;

interface ChapterContentProps {
  chapter: Chapter;
  novelId: number;
  reviewResult?: { issues: ReviewIssue[]; summary: string } | null;
  extractionResult?: ExtractionResult | null;
  onRegenerate: () => void;
  onEdit: () => void;
  onChat: () => void;
  onReview: () => void;
  onExtract: () => void;
  isStreaming: boolean;
  isChatting: boolean;
}

const severityColors: Record<string, string> = {
  critical: 'red', high: 'orange', medium: 'gold', low: 'blue',
};

const categoryLabels: Record<string, string> = {
  setting: '设定', timeline: '时间线', continuity: '连贯性',
  character: '角色', logic: '逻辑', ai_flavor: 'AI味',
  pacing: '节奏', other: '其他',
};

const ChapterContent: React.FC<ChapterContentProps> = ({
  chapter, novelId, reviewResult, extractionResult,
  onRegenerate, onEdit, onChat, onReview, onExtract,
  isStreaming, isChatting,
}) => {
  const navigate = useNavigate();

  const issues = reviewResult?.issues || [];
  const blockingCount = issues.filter(i => i.blocking).length;

  return (
    <div>
      {/* 章节操作按钮行 */}
      <div className="chapter-actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <Space size="small" wrap>
          <Tag color="green">第{chapter.chapter_number}章</Tag>
          <span style={{ fontWeight: 600 }}>{chapter.title}</span>
          <Tag>{chapter.word_count} 字</Tag>
          {reviewResult && (
            <Badge
              count={`${issues.length}个问题`}
              style={{ backgroundColor: blockingCount > 0 ? '#ef4444' : '#f59e0b' }}
            />
          )}
        </Space>
        <Space size="small" wrap style={{ width: '100%', justifyContent: 'flex-end' }}>
          <Button size="small" icon={<AuditOutlined />} onClick={onReview} disabled={isStreaming}>
            {reviewResult ? '重新审查' : '审查'}
          </Button>
          <Button size="small" icon={<NodeIndexOutlined />} onClick={onExtract} disabled={isStreaming}>
            {extractionResult ? '重新提取' : '提取'}
          </Button>
          <Button size="small" icon={<RobotOutlined />} onClick={onChat} loading={isChatting} disabled={isStreaming}>
            AI 修订
          </Button>
          <Button size="small" icon={<EditOutlined />} onClick={onEdit} disabled={isStreaming}>
            编辑
          </Button>
          <Popconfirm title="确认重新生成？当前内容将被覆盖。" onConfirm={onRegenerate} okText="确认" cancelText="取消" disabled={isStreaming}>
            <Button size="small" icon={<ReloadOutlined />} disabled={isStreaming} loading={isStreaming}>
              重写
            </Button>
          </Popconfirm>
        </Space>
      </div>

      {chapter.summary && (
        <Paragraph style={{ color: '#94a3b8', fontStyle: 'italic' }}>
          摘要：{extractionResult?.summary_text || chapter.summary}
        </Paragraph>
      )}

      {/* 审查结果 */}
      {reviewResult && issues.length > 0 && (
        <Collapse
          ghost
          size="small"
          items={[{
            key: 'review',
            label: (
              <Space>
                <WarningOutlined style={{ color: blockingCount > 0 ? '#ef4444' : '#f59e0b' }} />
                <span>审查报告：{reviewResult.summary}</span>
              </Space>
            ),
            children: (
              <List
                size="small"
                dataSource={issues}
                renderItem={(issue: ReviewIssue) => (
                  <List.Item>
                    <List.Item.Meta
                      avatar={
                        <Space direction="vertical" size={0} style={{ textAlign: 'center', minWidth: 60 }}>
                          <Tag color={severityColors[issue.severity] || 'default'} style={{ margin: 0 }}>
                            {issue.severity}
                          </Tag>
                          <Text style={{ fontSize: 11, color: '#94a3b8' }}>
                            {categoryLabels[issue.category] || issue.category}
                          </Text>
                        </Space>
                      }
                      title={
                        <Space>
                          <span>{issue.description}</span>
                          {issue.blocking && <Tag color="red">阻断</Tag>}
                        </Space>
                      }
                      description={
                        <div>
                          <Text style={{ color: '#94a3b8', fontSize: 12 }}>
                            位置：{issue.location}
                          </Text>
                          {issue.evidence && (
                            <div style={{ marginTop: 4, padding: '4px 8px', background: 'rgba(255,255,255,0.04)', borderRadius: 4, fontSize: 12 }}>
                              <Text style={{ color: '#6366f1' }}>证据：</Text>
                              <Text style={{ color: '#c4b5fd' }}>{issue.evidence}</Text>
                            </div>
                          )}
                          {issue.fix_hint && (
                            <div style={{ marginTop: 2 }}>
                              <Text style={{ color: '#34d399', fontSize: 12 }}>💡 {issue.fix_hint}</Text>
                            </div>
                          )}
                        </div>
                      }
                    />
                  </List.Item>
                )}
              />
            ),
          }]}
        />
      )}

      {/* 数据提取结果 */}
      {extractionResult && (extractionResult.entities_appeared?.length > 0 || extractionResult.scenes?.length > 0) && (
        <Collapse
          ghost
          size="small"
          style={{ marginTop: 8 }}
          items={[{
            key: 'extraction',
            label: (
              <Space>
                <NodeIndexOutlined style={{ color: '#6366f1' }} />
                <span>
                  数据提取：
                  {extractionResult.entities_appeared?.length || 0}个实体，
                  {extractionResult.state_deltas?.length || 0}处变更，
                  {extractionResult.scenes?.length || 0}个场景
                  {extractionResult.hook_type && ` · 钩子：${extractionResult.hook_type}(${extractionResult.hook_strength})`}
                </span>
              </Space>
            ),
            children: (
              <div>
                {extractionResult.scenes?.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <Text strong style={{ fontSize: 13 }}>场景切分：</Text>
                    <List
                      size="small"
                      dataSource={extractionResult.scenes}
                      renderItem={(scene: any) => (
                        <List.Item style={{ padding: '4px 0' }}>
                          <Tag color="blue">场景{scene.index}</Tag>
                          <Text style={{ color: '#e2e8f0', fontSize: 13 }}>{scene.summary}</Text>
                          <Text style={{ color: '#94a3b8', fontSize: 11, marginLeft: 8 }}>
                            📍{scene.location} · 👤{(scene.characters || []).join(', ')}
                          </Text>
                        </List.Item>
                      )}
                    />
                  </div>
                )}
                {extractionResult.state_deltas?.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <Text strong style={{ fontSize: 13 }}>状态变更：</Text>
                    {extractionResult.state_deltas.map((d: any, i: number) => (
                      <Tag key={i} style={{ margin: 2 }}>
                        {d.entity_id}.{d.field}: {d.old || '?'} → {d.new}
                      </Tag>
                    ))}
                  </div>
                )}
                {extractionResult.entities_appeared?.length > 0 && (
                  <div>
                    <Text strong style={{ fontSize: 13 }}>出场实体：</Text>
                    {extractionResult.entities_appeared.map((e: any) => (
                      <Tag key={e.id} color={e.is_new ? 'green' : 'default'} style={{ margin: 2 }}>
                        {e.name}{e.is_new ? '🆕' : ''}
                      </Tag>
                    ))}
                  </div>
                )}
              </div>
            ),
          }]}
        />
      )}

      <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.8, fontSize: 15, marginTop: 12 }}>
        {chapter.content || '(尚未生成内容)'}
      </div>
    </div>
  );
};

export default ChapterContent;
