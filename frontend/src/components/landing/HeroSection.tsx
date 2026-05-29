import React from 'react';
import { Button } from 'antd';
import { ArrowDownOutlined, RocketOutlined } from '@ant-design/icons';
import useTypewriter from '../../hooks/useTypewriter';
import './HeroSection.css';

interface HeroSectionProps {
  onStart: () => void;
  onLearnMore: () => void;
}

const typewriterTexts = [
  '从灵感到成书,',
  'AI 驱动的小说创作,',
  '智能写作新体验,',
  '释放你的创作潜能,',
];

const HeroSection: React.FC<HeroSectionProps> = ({ onStart, onLearnMore }) => {
  const { displayText, isTyping } = useTypewriter(typewriterTexts, {
    typingSpeed: 90,
    deletingSpeed: 45,
    pauseDuration: 2200,
  });

  return (
    <section className="hero-section">
      <div className="hero-content">
        <div className="hero-badge">
          <RocketOutlined /> AI 驱动的新一代文学创作平台
        </div>

        <h1 className="hero-title">
          <span className="hero-title-line">用 AI 书写你的故事</span>
          <span className="hero-typewriter-wrapper">
            <span className="hero-typewriter">{displayText}</span>
            <span className={`hero-cursor${isTyping ? ' blinking' : ''}`}>|</span>
          </span>
        </h1>

        <p className="hero-subtitle">
          无需写作经验。输入你的创意，AI 自动生成完整大纲、角色设定与逐章内容，
          三步完成一本专业级小说。
        </p>

        <div className="hero-actions">
          <Button type="primary" size="large" icon={<RocketOutlined />} onClick={onStart} className="hero-btn-primary">
            免费试用
          </Button>
          <Button size="large" onClick={onLearnMore} className="hero-btn-ghost">
            了解更多
          </Button>
        </div>

        <div className="hero-social-proof">
          <div className="hero-proof-item">
            <span className="proof-number">10M+</span>
            <span className="proof-label">已生成文字</span>
          </div>
          <div className="hero-proof-divider" />
          <div className="hero-proof-item">
            <span className="proof-number">50K+</span>
            <span className="proof-label">已创作小说</span>
          </div>
          <div className="hero-proof-divider" />
          <div className="hero-proof-item">
            <span className="proof-number">99.7%</span>
            <span className="proof-label">内容连贯性</span>
          </div>
        </div>
      </div>

      {/* 向下滚动指示 */}
      <div className="scroll-indicator" onClick={onLearnMore}>
        <span>向下滚动</span>
        <ArrowDownOutlined className="scroll-arrow" />
      </div>
    </section>
  );
};

export default HeroSection;
