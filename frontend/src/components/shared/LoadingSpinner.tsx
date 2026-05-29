import React from 'react';
import { Spin } from 'antd';

const LoadingSpinner: React.FC<{ tip?: string }> = ({ tip = '加载中...' }) => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 100 }}>
    <Spin size="large" tip={tip}>
      <div style={{ padding: 50 }} />
    </Spin>
  </div>
);

export default LoadingSpinner;
