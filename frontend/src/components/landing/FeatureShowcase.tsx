import React from 'react';
import { CheckCircleOutlined, ThunderboltOutlined, SafetyOutlined } from '@ant-design/icons';
import useScrollReveal from '../../hooks/useScrollReveal';
import './FeatureShowcase.css';

const showcases = [
  {
    title: '智能大纲，结构化创作',
    description: '告别写作前的迷茫。AI 深入分析你的故事创意，自动生成包含起承转合的完整章节大纲，让你对整本小说的结构一目了然。',
    bullets: ['自动识别故事类型与风格', '生成包含核心冲突的章节规划', '支持随时调整与重新生成'],
    visual: (
      <div className="showcase-visual-box">
        <div className="visual-outline">
          <div className="visual-chapter"><span className="ch-dot" />第一章：开端</div>
          <div className="visual-chapter"><span className="ch-dot" />第二章：发展</div>
          <div className="visual-chapter"><span className="ch-dot" />第三章：转折</div>
          <div className="visual-chapter"><span className="ch-dot" />第四章：高潮</div>
          <div className="visual-chapter"><span className="ch-dot" />第五章：结局</div>
        </div>
      </div>
    ),
  },
  {
    title: '流式写作，实时交互',
    description: 'AI 逐字逐句生成内容，你可以实时看到每一个字的诞生。随时暂停、修改、引导方向，创作过程完全掌控在你手中。',
    bullets: ['毫秒级流式输出，所见即所得', '随时中断并调整创作方向', '保持上下文连贯不丢失'],
    visual: (
      <div className="showcase-visual-box dark">
        <div className="visual-stream">
          <div className="stream-line"><span className="stream-cursor" />夜幕降临，城市的天际线...</div>
          <div className="stream-line dim">她站在窗前，回想起那个雨天。</div>
          <div className="stream-line dim">雨水顺着玻璃滑落，像极了...</div>
        </div>
      </div>
    ),
  },
];

const FeatureShowcase: React.FC = () => {
  return (
    <section id="showcase" className="landing-section showcase-section">
      <div className="section-label">能力展示</div>
      <h2 className="section-heading">深入体验 AI 创作的力量</h2>
      <p className="section-subheading">
        每一项功能都为创作者精心设计，让技术服务于创意
      </p>

      {showcases.map((item, i) => {
        const isReversed = i % 2 === 1;
        const { ref, isVisible } = useScrollReveal({ threshold: 0.15 });

        return (
          <div
            key={i}
            ref={ref}
            className={`showcase-row${isReversed ? ' reversed' : ''}${isVisible ? ' showcase-visible' : ''}`}
          >
            <div className="showcase-text">
              <div className="showcase-icon-row">
                {i === 0 ? <ThunderboltOutlined /> : <SafetyOutlined />}
              </div>
              <h3 className="showcase-title">{item.title}</h3>
              <p className="showcase-desc">{item.description}</p>
              <ul className="showcase-bullets">
                {item.bullets.map((b, bi) => (
                  <li key={bi}>
                    <CheckCircleOutlined className="bullet-icon" />
                    {b}
                  </li>
                ))}
              </ul>
            </div>
            <div className="showcase-visual">
              {item.visual}
            </div>
          </div>
        );
      })}
    </section>
  );
};

export default FeatureShowcase;
