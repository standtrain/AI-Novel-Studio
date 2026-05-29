import React from 'react';
import { Card, List, Tag, Typography } from 'antd';
import type { Character } from '../../types';

const { Text, Paragraph } = Typography;

const roleColorMap: Record<string, string> = {
  '主角': 'red',
  '配角': 'blue',
  '反派': 'volcano',
};

interface CharacterListProps {
  characters: Character[];
}

const CharacterList: React.FC<CharacterListProps> = ({ characters }) => {
  if (characters.length === 0) return null;

  return (
      <List
        dataSource={characters}
        renderItem={(c) => (
          <List.Item>
            <Card size="small" style={{ width: '100%' }} title={
              <span>{c.name} <Tag color={roleColorMap[c.role || ''] || 'default'}>{c.role || '未知'}</Tag></span>
            }>
              <Paragraph><Text strong>年龄：</Text>{c.age || '-'}（{c.gender || '-'}）</Paragraph>
              {c.appearance && <Paragraph><Text strong>外貌：</Text>{c.appearance}</Paragraph>}
              {c.personality && <Paragraph><Text strong>性格：</Text>{c.personality}</Paragraph>}
              {c.background && <Paragraph><Text strong>背景：</Text>{c.background}</Paragraph>}
              {c.motivation && <Paragraph><Text strong>动机：</Text>{c.motivation}</Paragraph>}
              {c.arc && <Paragraph><Text strong>成长弧线：</Text>{c.arc}</Paragraph>}
              {c.relationships && c.relationships.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <Text strong>关系：</Text>
                  {Array.isArray(c.relationships) && c.relationships.map((r: any, i: number) => {
                    if (typeof r === 'string') return <Tag key={i}>{r}</Tag>;
                    // 对象格式：{with, type, dynamic}
                    return (
                      <div key={i} style={{ marginLeft: 16, marginBottom: 4 }}>
                        <Tag color="purple">{r.with || '?'}</Tag>
                        <Text style={{ color: '#94a3b8' }}>{r.type || ''}</Text>
                        {r.dynamic && <div style={{ marginLeft: 48, color: '#666', fontSize: 13 }}>{r.dynamic}</div>}
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </List.Item>
        )}
      />
  );
};

export default CharacterList;
