import React from 'react';
import {
  FileTextOutlined,
  UserOutlined,
  SendOutlined,
  ApiOutlined,
} from '@ant-design/icons';
import useScrollReveal from '../../hooks/useScrollReveal';
import useSiteBrand from '../../hooks/useSiteBrand';
import './FeaturesSection.css';

const features = [
  {
    icon: <FileTextOutlined />,
    title: 'AI 大纲生成',
    description: '输入小说标题与基本设定，AI 自动分析题材并生成完整的故事框架与章节规划，让你的创意快速成形。',
    color: 'blue',
  },
  {
    icon: <UserOutlined />,
    title: '智能角色塑造',
    description: '自动生成有血有肉的人物设定，包含性格特质、背景故事与成长弧线，每个角色都有独特的生命力。',
    color: 'amber',
  },
  {
    icon: <SendOutlined />,
    title: '流式逐章写作',
    description: '支持流式实时输出，边写边看边改。AI 逐章推进故事情节，保持创作节奏不中断。',
    color: 'purple',
  },
  {
    icon: <ApiOutlined />,
    title: '多模型支持',
    description: '兼容多种大语言模型，自由切换选择最适合当前创作风格的写作伙伴，灵活高效。',
    color: 'green',
  },
];

const FeaturesSection: React.FC = () => {
  const { ref, isVisible } = useScrollReveal({ threshold: 0.1 });
  const { siteName } = useSiteBrand();

  return (
    <section id="features" className="landing-section features-section" ref={ref}>
      <div className="section-label">核心功能</div>
      <h2 className="section-heading">为什么选择 {siteName}？</h2>
      <p className="section-subheading">
        我们将最先进的 AI 技术与小说创作流程深度融合，为你提供一站式写作体验
      </p>

      <div className={`features-grid${isVisible ? ' features-visible' : ''}`}>
        {features.map((f, i) => (
          <div
            key={i}
            className="feature-card"
            style={{ transitionDelay: `${i * 0.12}s` }}
          >
            <div className={`feature-icon-wrap ${f.color}`}>
              {f.icon}
            </div>
            <h3 className="feature-card-title">{f.title}</h3>
            <p className="feature-card-desc">{f.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
};

export default FeaturesSection;
