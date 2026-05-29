import React from 'react';
import { EditOutlined, FileTextOutlined, BookOutlined } from '@ant-design/icons';
import useScrollReveal from '../../hooks/useScrollReveal';
import './HowItWorksSection.css';

const steps = [
  {
    number: 1,
    icon: <EditOutlined />,
    title: '输入标题',
    description: '输入你的小说标题与基本设定，告诉 AI 你想要创作的类型、风格和世界观方向。',
  },
  {
    number: 2,
    icon: <FileTextOutlined />,
    title: 'AI 生成大纲',
    description: 'AI 自动分析并生成完整的故事框架与章节大纲，你可以随时调整和优化。',
  },
  {
    number: 3,
    icon: <BookOutlined />,
    title: '逐章创作',
    description: 'AI 按章节顺序逐章生成内容，流式实时输出，你可以在过程中随时修改与引导方向。',
  },
];

const HowItWorksSection: React.FC = () => {
  const { ref, isVisible } = useScrollReveal({ threshold: 0.15 });

  return (
    <section id="how-it-works" className="how-it-works-section" ref={ref}>
      <div className="landing-section" style={{ padding: '0' }}>
        <div className="section-label">创作流程</div>
        <h2 className="section-heading">三步完成你的小说</h2>
        <p className="section-subheading">
          从灵感到成书，只需简单三步。AI 全程陪伴，让创作变得轻松愉快
        </p>

        <div className={`steps-container${isVisible ? ' steps-visible' : ''}`}>
          {steps.map((step, i) => (
            <div
              key={i}
              className="step-item"
              style={{ transitionDelay: `${i * 0.15}s` }}
            >
              <div className="step-number-wrap">
                <div className="step-number">{step.number}</div>
                <div className="step-icon">{step.icon}</div>
              </div>
              <h3 className="step-title">{step.title}</h3>
              <p className="step-desc">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HowItWorksSection;
