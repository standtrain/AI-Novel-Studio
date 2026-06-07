import React from 'react';
import { Button } from 'antd';
import { RocketOutlined, BookOutlined } from '@ant-design/icons';
import useScrollReveal from '../../hooks/useScrollReveal';
import './CTASection.css';

interface CTASectionProps {
  isAuthenticated: boolean;
  onStart: () => void;
}

const CTASection: React.FC<CTASectionProps> = ({ isAuthenticated, onStart }) => {
  const { ref, isVisible } = useScrollReveal({ threshold: 0.15 });

  return (
    <section className="cta-section gradient-blue" ref={ref}>
      <div className={`cta-content${isVisible ? ' cta-visible' : ''}`}>
        <h2 className="cta-heading">
          {isAuthenticated ? '继续你的创作之旅' : '准备好开始你的 AI 创作之旅了吗？'}
        </h2>
        <p className="cta-subtitle">
          {isAuthenticated
            ? '返回工作台，继续书写属于你的故事'
            : '免费注册，即刻体验 AI 驱动的小说创作。无需任何写作经验'}
        </p>

        <div className="cta-actions">
          <Button
            type="primary"
            size="large"
            icon={isAuthenticated ? <BookOutlined /> : <RocketOutlined />}
            onClick={onStart}
            className="cta-btn-primary"
          >
            {isAuthenticated ? '进入创作' : '立即开始'}
          </Button>
          <Button
            size="large"
            onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
            className="cta-btn-ghost"
          >
            了解更多
          </Button>
        </div>
      </div>
    </section>
  );
};

export default CTASection;
