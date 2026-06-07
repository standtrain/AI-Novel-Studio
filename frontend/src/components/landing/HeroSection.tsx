import React from 'react';
import { Button } from 'antd';
import { ArrowDownOutlined, CheckCircleOutlined, RocketOutlined, ThunderboltOutlined } from '@ant-design/icons';
import useTypewriter from '../../hooks/useTypewriter';
import useSiteBrand from '../../hooks/useSiteBrand';
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
  const { siteName } = useSiteBrand();
  const { displayText, isTyping } = useTypewriter(typewriterTexts, {
    typingSpeed: 90,
    deletingSpeed: 45,
    pauseDuration: 2200,
  });

  return (
    <section className="hero-section">
      <div className="hero-shell">
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
            从灵感、设定、大纲到逐章正文，{siteName} 帮你把零散创意组织成可持续创作的长篇作品。
          </p>

          <div className="hero-actions">
            <Button type="primary" size="large" icon={<RocketOutlined />} onClick={onStart} className="hero-btn-primary">
              立即开始创作
            </Button>
            <Button size="large" onClick={onLearnMore} className="hero-btn-ghost">
              查看功能
            </Button>
          </div>

          <div className="hero-social-proof">
            <div className="hero-proof-item">
              <span className="proof-number">灵感梳理</span>
              <span className="proof-label">把零散想法归档成设定</span>
            </div>
            <div className="hero-proof-divider" />
            <div className="hero-proof-item">
              <span className="proof-number">长篇规划</span>
              <span className="proof-label">从大纲延伸到章节节奏</span>
            </div>
            <div className="hero-proof-divider" />
            <div className="hero-proof-item">
              <span className="proof-number">持续打磨</span>
              <span className="proof-label">多轮修改保持上下文</span>
            </div>
          </div>
        </div>

        <div className="hero-preview" aria-hidden="true">
          <div className="preview-toolbar">
            <span />
            <span />
            <span />
            <strong>创作工作台</strong>
          </div>

          <div className="preview-main">
            <div className="preview-sidebar">
              <div className="preview-book active">主线设定</div>
              <div className="preview-book">人物关系</div>
              <div className="preview-book">章节节奏</div>
            </div>

            <div className="preview-panel">
              <div className="preview-panel-head">
                <div>
                  <span className="preview-kicker">故事设定 / 大纲 / 正文协作</span>
                  <h3>长篇创作项目</h3>
                </div>
                <span className="preview-status">持续推进</span>
              </div>

              <div className="preview-progress">
                <div>
                  <span>创作阶段</span>
                  <strong>大纲到正文</strong>
                </div>
                <div className="preview-progress-track">
                  <span style={{ width: '58%' }} />
                </div>
              </div>

              <div className="preview-chapters">
                {['近期情节节点', '角色动机回收', '伏笔与节奏校对'].map((title, index) => (
                  <div className="preview-chapter" key={title}>
                    <CheckCircleOutlined />
                    <span>{title}</span>
                    <em>{index === 0 ? '已整理' : '待打磨'}</em>
                  </div>
                ))}
              </div>

              <div className="preview-ai-card">
                <ThunderboltOutlined />
                <span>AI 正在根据上下文保持人物动机、伏笔与章节节奏一致</span>
              </div>
            </div>
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
