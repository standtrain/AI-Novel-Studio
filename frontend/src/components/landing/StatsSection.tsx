import React from 'react';
import useScrollReveal from '../../hooks/useScrollReveal';
import './StatsSection.css';

const capabilities = [
  {
    title: '结构化创作',
    desc: '把题材、设定、人物、大纲和章节拆成连续工作流。',
  },
  {
    title: '上下文延续',
    desc: '围绕角色动机、伏笔和节奏持续校对，减少前后割裂。',
  },
  {
    title: '灵活配置',
    desc: '提示词、模型、温度预设和站点规则可在后台统一管理。',
  },
  {
    title: '协作闭环',
    desc: '模板、导入、对话、工单与通知串联常用创作流程。',
  },
];

const StatsSection: React.FC = () => {
  const { ref, isVisible } = useScrollReveal({ threshold: 0.2 });

  return (
    <section className="stats-section gradient-blue" ref={ref}>
      <div className="stats-inner">
        {capabilities.map((item, i) => (
          <React.Fragment key={i}>
            {i > 0 && <div className="stat-divider" />}
            <div className={`stat-block${isVisible ? ' stat-block-visible' : ''}`}>
              <div className="stat-value">{item.title}</div>
              <div className="stat-label">{item.desc}</div>
            </div>
          </React.Fragment>
        ))}
      </div>
    </section>
  );
};

export default StatsSection;
