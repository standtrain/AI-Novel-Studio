import React from 'react';
import { Layout, Typography } from 'antd';
import { GithubOutlined } from '@ant-design/icons';
import useSiteBrand from '../../hooks/useSiteBrand';

const { Text } = Typography;
const { Footer: AntFooter } = Layout;

const SiteFooter: React.FC = () => {
  const { footerContent } = useSiteBrand();
  const year = new Date().getFullYear();

  return (
    <AntFooter
      style={{
        textAlign: 'center',
        padding: '16px 24px',
        background: 'transparent',
        borderTop: '1px solid rgba(99,102,241,0.08)',
      }}
    >
      {footerContent ? (
        <Text style={{ color: '#94a3b8', fontSize: 13, display: 'block', marginBottom: 6 }}>
          {footerContent}
        </Text>
      ) : null}
      <Text style={{ color: '#64748b', fontSize: 12 }}>
        Copyright &copy; {year} AI-Novel-Studio. All rights reserved.
        {' '}由项目贡献者设计与开发。
      </Text>
      <br />
      <a
        href="https://github.com/standtrain/AI-Novel-Studio"
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: '#818cf8', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4 }}
      >
        <GithubOutlined />
        standtrain/AI-Novel-Studio
      </a>
    </AntFooter>
  );
};

export default SiteFooter;
