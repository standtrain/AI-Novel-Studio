import React from 'react';
import useScrollReveal from '../../hooks/useScrollReveal';
import useCountUp from '../../hooks/useCountUp';
import './StatsSection.css';

const stats = [
  { end: 10_000_000, suffix: '+', label: '已生成文字总量', fmt: (v: number) => (v / 1_000_000).toFixed(0) + 'M' },
  { end: 50_000, suffix: '+', label: '已创作小说', fmt: (v: number) => v.toLocaleString() },
  { end: 100_000, suffix: '+', label: '活跃创作者', fmt: (v: number) => v.toLocaleString() },
  { end: 99.7, suffix: '%', label: '内容连贯性评分', fmt: (v: number) => v.toFixed(1) },
];

const StatBlock: React.FC<{ end: number; suffix: string; label: string; fmt: (v: number) => string; enabled: boolean }> = ({
  end, suffix, label, fmt, enabled,
}) => {
  const value = useCountUp(end, { duration: 2200, enabled, formatter: fmt });
  return (
    <div className="stat-block">
      <div className="stat-value">
        <span>{value}</span>
        <span className="stat-suffix">{suffix}</span>
      </div>
      <div className="stat-label">{label}</div>
    </div>
  );
};

const StatsSection: React.FC = () => {
  const { ref, isVisible } = useScrollReveal({ threshold: 0.2 });

  return (
    <section className="stats-section gradient-blue" ref={ref}>
      <div className="stats-inner">
        {stats.map((s, i) => (
          <React.Fragment key={i}>
            {i > 0 && <div className="stat-divider" />}
            <StatBlock {...s} enabled={isVisible} />
          </React.Fragment>
        ))}
      </div>
    </section>
  );
};

export default StatsSection;
