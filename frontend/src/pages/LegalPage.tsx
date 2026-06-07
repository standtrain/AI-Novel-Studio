import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Skeleton, Typography, message } from 'antd';
import { HomeOutlined, LoginOutlined, ReloadOutlined } from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { getLegalDocumentApi, type LegalDocument, type LegalDocumentType } from '../api/site';
import useSiteBrand from '../hooks/useSiteBrand';
import BrandIcon from '../components/shared/BrandIcon';
import './LegalPage.css';

const { Title, Text, Paragraph } = Typography;

const LEGAL_PAGE_META: Record<LegalDocumentType, { title: string; description: string }> = {
  terms: {
    title: '服务条款',
    description: '了解账号使用、内容创作、AI 生成与平台服务规则。',
  },
  privacy: {
    title: '隐私政策',
    description: '了解本站如何收集、使用、存储和保护你的信息。',
  },
};

interface LegalPageProps {
  type: LegalDocumentType;
}

const LegalPage: React.FC<LegalPageProps> = ({ type }) => {
  const [document, setDocument] = useState<LegalDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { siteName } = useSiteBrand();
  const navigate = useNavigate();
  const meta = LEGAL_PAGE_META[type];

  const loadDocument = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getLegalDocumentApi(type);
      setDocument(data);
    } catch (err: any) {
      const msg = err.response?.data?.error || '协议内容加载失败';
      setError(msg);
      message.error(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocument();
  }, [type]);

  const displayTitle = document?.title || meta.title;

  const paragraphs = useMemo(() => {
    const rawContent = document?.content || '';
    const lines = rawContent.trimStart().split(/\r?\n/);
    const contentWithoutRepeatedTitle = lines[0]?.trim() === displayTitle
      ? lines.slice(1).join('\n').trimStart()
      : rawContent;
    return contentWithoutRepeatedTitle
      .trim()
      .split(/\n{2,}/)
      .map(part => part.trim())
      .filter(Boolean);
  }, [displayTitle, document?.content]);

  return (
    <div className="legal-page-shell">
      <div className="legal-bg-grid" />
      <main className="legal-layout">
        <header className="legal-header">
          <Link to="/" className="legal-brand">
            <BrandIcon size="sm" />
            <span>{siteName}</span>
          </Link>
          <div className="legal-header-actions">
            <Button icon={<HomeOutlined />} onClick={() => navigate('/')}>返回首页</Button>
            <Link to="/login">
              <Button type="primary" icon={<LoginOutlined />}>登录</Button>
            </Link>
          </div>
        </header>

        <Card className="legal-card" styles={{ body: { padding: 0 } }}>
          <section className="legal-hero">
            <Text className="legal-kicker">站点协议</Text>
            <Title className="legal-title">{displayTitle}</Title>
            <Paragraph className="legal-subtitle">{meta.description}</Paragraph>
          </section>

          <section className="legal-content">
            {loading ? (
              <Skeleton active paragraph={{ rows: 10 }} />
            ) : error ? (
              <Alert
                type="error"
                showIcon
                message={error}
                action={<Button size="small" icon={<ReloadOutlined />} onClick={loadDocument}>重试</Button>}
              />
            ) : (
              paragraphs.map((paragraph, index) => (
                <Paragraph className="legal-document-paragraph" key={`${type}-${index}`}>
                  {paragraph}
                </Paragraph>
              ))
            )}
          </section>
        </Card>
      </main>
    </div>
  );
};

export default LegalPage;
