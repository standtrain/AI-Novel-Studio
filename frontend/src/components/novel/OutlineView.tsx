import React from 'react';
import { Descriptions, Tag, List, Typography } from 'antd';

const { Title, Text } = Typography;

interface OutlineViewProps {
  outline: any;
}

const OutlineView: React.FC<OutlineViewProps> = ({ outline }) => {
  if (!outline) return null;

  return (
    <>
      <Descriptions column={1} bordered size="small">
        <Descriptions.Item label="标题"><strong>{outline.title || '-'}</strong></Descriptions.Item>
        <Descriptions.Item label="类型">{outline.genre || '-'}</Descriptions.Item>
        <Descriptions.Item label="主题">{outline.theme || '-'}</Descriptions.Item>
        <Descriptions.Item label="世界观">{outline.setting || '-'}</Descriptions.Item>
        <Descriptions.Item label="主线剧情">{outline.mainPlot || outline.main_plot || '-'}</Descriptions.Item>
        <Descriptions.Item label="总章数">{outline.chapterCount || outline.chapter_count || '-'}</Descriptions.Item>
      </Descriptions>

      {outline.subPlots?.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <Title level={5}>支线剧情</Title>
          <List
            size="small"
            dataSource={outline.subPlots || []}
            renderItem={(item: string) => <List.Item>{item}</List.Item>}
          />
        </div>
      )}

      {outline.chapterOverview?.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <Title level={5}>章节概览</Title>
          <List
            size="small"
            dataSource={outline.chapterOverview || []}
            renderItem={(ch: any) => (
              <List.Item>
                <Tag color="blue">第{ch.chapter}章</Tag>
                <Text strong>{ch.title}</Text>
                <Text style={{ color: '#94a3b8', marginLeft: 8 }}>— {ch.brief}</Text>
              </List.Item>
            )}
          />
        </div>
      )}
    </>
  );
};

export default OutlineView;
