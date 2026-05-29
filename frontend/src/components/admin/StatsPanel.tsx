import React, { useEffect, useState } from 'react';
import { Row, Col, Card, Statistic, Typography, List, Tag } from 'antd';
import { UserOutlined, BookOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { getStatsApi } from '../../api/admin';

const StatsPanel: React.FC = () => {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    getStatsApi()
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col span={8}>
          <Card>
            <Statistic title="用户总数" value={stats?.totalUsers || 0} prefix={<UserOutlined />} loading={loading} />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic title="小说总数" value={stats?.totalNovels || 0} prefix={<BookOutlined />} loading={loading} />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic title="今日 Token 消耗" value={stats?.todayTokens || 0} prefix={<ThunderboltOutlined />} loading={loading} />
          </Card>
        </Col>
      </Row>

      {stats?.groupStats && stats.groupStats.length > 0 && (
        <Card title="分组统计" style={{ marginTop: 16 }}>
          <List
            dataSource={stats.groupStats}
            renderItem={(item: any) => (
              <List.Item>
                <Tag color="blue">{item.name}</Tag>
                用户数：{item.count}
              </List.Item>
            )}
          />
        </Card>
      )}
    </div>
  );
};

export default StatsPanel;
