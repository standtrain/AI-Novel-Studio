import React from 'react';
import { List, Tag, Typography, Button } from 'antd';
import { PlayCircleOutlined } from '@ant-design/icons';

const { Text, Paragraph } = Typography;

interface ChapterOutlineListProps {
  chapters: any[];
  onWriteChapter?: (chapterNumber: number) => void;
  writtenChapterNumbers?: Set<number>;
}

const ChapterOutlineList: React.FC<ChapterOutlineListProps> = ({ chapters, onWriteChapter, writtenChapterNumbers }) => {
  if (!chapters || chapters.length === 0) return null;

  return (
    <List
      dataSource={chapters}
      renderItem={(ch: any) => {
        const chNum = ch.chapter || ch.chapter_number;
        const isWritten = writtenChapterNumbers?.has(chNum);
        return (
          <List.Item>
            <div style={{ width: '100%', padding: '12px 16px', background: 'rgba(15,23,42,0.5)', borderRadius: 8, border: '1px solid rgba(99,102,241,0.15)' }}>
              <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>
                  <Tag color="blue">第{chNum}章</Tag>
                  <Text strong style={{ fontSize: 15, color: '#f1f5f9' }}>{ch.title}</Text>
                </span>
                {onWriteChapter && (
                  isWritten ? (
                    <Tag color="green" style={{ cursor: 'default' }}>已写</Tag>
                  ) : (
                    <Button size="small" type="primary" ghost icon={<PlayCircleOutlined />}
                      onClick={() => onWriteChapter(chNum)}>
                      写此章
                    </Button>
                  )
                )}
              </div>
              {ch.synopsis && <Paragraph style={{ marginBottom: 6, color: '#cbd5e1' }}><Text strong style={{ color: '#f1f5f9' }}>梗概：</Text>{ch.synopsis}</Paragraph>}
              {ch.openingHook && <Paragraph style={{ marginBottom: 6, color: '#cbd5e1' }}><Text strong style={{ color: '#f1f5f9' }}>开篇：</Text>{ch.openingHook}</Paragraph>}
              {ch.scenes && Array.isArray(ch.scenes) && (
                <div style={{ marginBottom: 6 }}>
                  <Text strong style={{ color: '#f1f5f9' }}>场景：</Text>
                  {ch.scenes.map((s: any, i: number) => {
                    if (typeof s === 'string') return <Tag key={i} style={{ marginBottom: 4 }}>{s}</Tag>;
                    if (typeof s === 'object') {
                      return (
                        <div key={i} style={{ marginLeft: 16, marginBottom: 8, padding: '4px 8px', background: 'rgba(30,41,59,0.5)', borderRadius: 4, border: '1px solid rgba(99,102,241,0.1)' }}>
                          <Text strong style={{ color: '#f1f5f9' }}>#{s.number || i + 1}</Text>
                          {s.location && <Tag color="geekblue">{s.location}</Tag>}
                          {s.timeOfDay && <Text style={{ color: '#94a3b8' }}> {s.timeOfDay}</Text>}
                          {s.description && <div style={{ color: '#94a3b8', fontSize: 13 }}>{s.description}</div>}
                        </div>
                      );
                    }
                    return null;
                  })}
                </div>
              )}
              {ch.conflict && <Paragraph style={{ marginBottom: 6, color: '#cbd5e1' }}><Text strong style={{ color: '#f1f5f9' }}>核心冲突：</Text>{ch.conflict}</Paragraph>}
              {ch.turningPoint && <Paragraph style={{ marginBottom: 6, color: '#cbd5e1' }}><Text strong style={{ color: '#f1f5f9' }}>转折点：</Text>{ch.turningPoint}</Paragraph>}
              {ch.emotionalTone && <Paragraph style={{ marginBottom: 6, color: '#cbd5e1' }}><Text strong style={{ color: '#f1f5f9' }}>情感基调：</Text>{ch.emotionalTone}</Paragraph>}
              {ch.endingHook && <Paragraph style={{ marginBottom: 6, color: '#cbd5e1' }}><Text strong style={{ color: '#f1f5f9' }}>结尾悬念：</Text>{ch.endingHook}</Paragraph>}
              {ch.characterDevelopment && typeof ch.characterDevelopment === 'object' && (
                <div style={{ marginBottom: 6 }}>
                  <Text strong style={{ color: '#f1f5f1' }}>角色发展：</Text>
                  {Object.entries(ch.characterDevelopment as Record<string, string>).map(([name, desc]) => (
                    <div key={name} style={{ marginLeft: 16, fontSize: 13, color: '#94a3b8' }}>
                      <Tag color="purple">{name}</Tag> {String(desc)}
                    </div>
                  ))}
                </div>
              )}
              {ch.subplotProgress && <Paragraph style={{ marginBottom: 6, color: '#cbd5e1' }}><Text strong style={{ color: '#f1f5f9' }}>支线推进：</Text>{ch.subplotProgress}</Paragraph>}
              {ch.foreshadowing && <Paragraph style={{ marginBottom: 6, color: '#cbd5e1' }}><Text strong style={{ color: '#f1f5f9' }}>伏笔：</Text>{ch.foreshadowing}</Paragraph>}
              {ch.charactersInvolved && (
                <Paragraph style={{ marginBottom: 0, color: '#cbd5e1' }}>
                  <Text strong style={{ color: '#f1f5f9' }}>出场人物：</Text>
                  {Array.isArray(ch.charactersInvolved)
                    ? ch.charactersInvolved.map((name: string, i: number) => (
                        <Tag key={i} color="purple">{name}</Tag>
                      ))
                    : String(ch.charactersInvolved)}
                </Paragraph>
              )}
            </div>
          </List.Item>
        );
      }}
    />
  );
};

export default ChapterOutlineList;
