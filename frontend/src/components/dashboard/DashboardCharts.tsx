import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Empty, Progress, Spin, Typography } from 'antd';
import { useAuthStore } from '../../store/authStore';
import useMobile from '../../hooks/useMobile';
import type { Novel } from '../../types';

const { Text } = Typography;

declare global {
  interface Window {
    echarts?: any;
  }
}

interface DashboardChartsProps {
  novels: Novel[];
  statusLabelMap: Record<string, string>;
}

const ECHARTS_CDN = 'https://cdn.jsdelivr.net/npm/echarts@5.5.1/dist/echarts.min.js';

let echartsLoader: Promise<any> | null = null;

const loadECharts = () => {
  if (window.echarts) return Promise.resolve(window.echarts);
  if (echartsLoader) return echartsLoader;

  echartsLoader = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-dashboard-echarts="true"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(window.echarts));
      existing.addEventListener('error', reject);
      return;
    }

    const script = document.createElement('script');
    script.src = ECHARTS_CDN;
    script.async = true;
    script.dataset.dashboardEcharts = 'true';
    script.onload = () => resolve(window.echarts);
    script.onerror = () => reject(new Error('ECharts 加载失败'));
    document.head.appendChild(script);
  });

  return echartsLoader;
};

const monthKey = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '未知';
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const DashboardCharts: React.FC<DashboardChartsProps> = ({ novels, statusLabelMap }) => {
  const user = useAuthStore((s) => s.user);
  const isMobile = useMobile();
  const statusChartRef = useRef<HTMLDivElement>(null);
  const chapterChartRef = useRef<HTMLDivElement>(null);
  const updateChartRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const chartData = useMemo(() => {
    const statusData = Object.entries(
      novels.reduce<Record<string, number>>((acc, novel) => {
        acc[novel.status] = (acc[novel.status] || 0) + 1;
        return acc;
      }, {}),
    ).map(([status, count]) => ({
      name: statusLabelMap[status] || status,
      value: count,
    }));

    const chapterData = [...novels]
      .sort((a, b) => (b.chapter_count || 0) - (a.chapter_count || 0))
      .slice(0, 8)
      .reverse()
      .map((novel) => ({
        name: novel.title || '未命名小说',
        value: novel.chapter_count || 0,
      }));

    const updateMap = novels.reduce<Record<string, number>>((acc, novel) => {
      const key = monthKey(novel.updated_at || novel.created_at);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const updateData = Object.entries(updateMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-8);

    const totalChapters = novels.reduce((sum, novel) => sum + (novel.chapter_count || 0), 0);
    const activeCount = novels.filter((novel) => novel.status !== 'completed').length;
    const completedCount = novels.filter((novel) => novel.status === 'completed').length;

    return { statusData, chapterData, updateData, totalChapters, activeCount, completedCount };
  }, [novels, statusLabelMap]);

  const tokenStats = useMemo(() => {
    const used = user?.dailyTokensUsed || 0;
    const limit = user?.group?.tokenLimitPerDay || 0;
    const percent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
    const remaining = limit > 0 ? Math.max(0, limit - used) : null;
    return { used, limit, percent, remaining };
  }, [user]);

  useEffect(() => {
    if (!novels.length) {
      setLoading(false);
      return;
    }

    let disposed = false;
    let rotateTimer: number | undefined;
    let resizeObserver: ResizeObserver | undefined;
    let cleanupCharts: (() => void) | undefined;

    loadECharts()
      .then((echarts) => {
        if (disposed || !statusChartRef.current || !chapterChartRef.current || !updateChartRef.current) return;

        const statusChart = echarts.init(statusChartRef.current);
        const chapterChart = echarts.init(chapterChartRef.current);
        const updateChart = echarts.init(updateChartRef.current);

        const textColor = '#cbd5e1';
        const gridLine = 'rgba(148,163,184,0.12)';

        statusChart.setOption({
          animationDuration: 900,
          tooltip: { trigger: 'item', backgroundColor: 'rgba(15,23,42,0.92)', borderColor: 'rgba(99,102,241,0.25)', textStyle: { color: '#f8fafc' } },
          legend: { bottom: 0, textStyle: { color: textColor } },
          series: [{
            name: '作品状态',
            type: 'pie',
            radius: ['48%', '72%'],
            center: ['50%', '44%'],
            avoidLabelOverlap: true,
            itemStyle: { borderRadius: 8, borderColor: '#0f172a', borderWidth: 2 },
            label: { color: textColor },
            data: chartData.statusData,
          }],
          color: ['#818cf8', '#22d3ee', '#34d399', '#f59e0b', '#f97316', '#a78bfa'],
        });

        chapterChart.setOption({
          animationDuration: 1000,
          tooltip: { trigger: 'axis', backgroundColor: 'rgba(15,23,42,0.92)', borderColor: 'rgba(99,102,241,0.25)', textStyle: { color: '#f8fafc' } },
          grid: { left: 16, right: 20, top: 20, bottom: 24, containLabel: true },
          xAxis: { type: 'value', axisLabel: { color: textColor }, splitLine: { lineStyle: { color: gridLine } } },
          yAxis: {
            type: 'category',
            axisLabel: {
              color: textColor,
              width: 92,
              overflow: 'truncate',
            },
            data: chartData.chapterData.map((item) => item.name),
          },
          series: [{
            name: '章节数',
            type: 'bar',
            barWidth: 14,
            data: chartData.chapterData.map((item) => item.value),
            itemStyle: {
              borderRadius: [0, 8, 8, 0],
              color: {
                type: 'linear',
                x: 0,
                y: 0,
                x2: 1,
                y2: 0,
                colorStops: [
                  { offset: 0, color: '#6366f1' },
                  { offset: 1, color: '#22d3ee' },
                ],
              },
            },
          }],
        });

        updateChart.setOption({
          animationDuration: 1000,
          tooltip: { trigger: 'axis', backgroundColor: 'rgba(15,23,42,0.92)', borderColor: 'rgba(99,102,241,0.25)', textStyle: { color: '#f8fafc' } },
          grid: { left: 28, right: 18, top: 24, bottom: 28 },
          xAxis: {
            type: 'category',
            boundaryGap: false,
            axisLabel: { color: textColor },
            data: chartData.updateData.map(([key]) => key),
          },
          yAxis: { type: 'value', minInterval: 1, axisLabel: { color: textColor }, splitLine: { lineStyle: { color: gridLine } } },
          series: [{
            name: '更新作品',
            type: 'line',
            smooth: true,
            symbolSize: 8,
            data: chartData.updateData.map(([, value]) => value),
            areaStyle: { color: 'rgba(99,102,241,0.16)' },
            lineStyle: { width: 3, color: '#818cf8' },
            itemStyle: { color: '#22d3ee' },
          }],
        });

        // 动态轮播高亮，让图表在首页有实时感。
        let activeIndex = 0;
        rotateTimer = window.setInterval(() => {
          if (!chartData.statusData.length) return;
          statusChart.dispatchAction({ type: 'downplay', seriesIndex: 0 });
          statusChart.dispatchAction({ type: 'highlight', seriesIndex: 0, dataIndex: activeIndex });
          statusChart.dispatchAction({ type: 'showTip', seriesIndex: 0, dataIndex: activeIndex });
          activeIndex = (activeIndex + 1) % chartData.statusData.length;
        }, 2400);

        const resize = () => {
          statusChart.resize();
          chapterChart.resize();
          updateChart.resize();
        };
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(statusChartRef.current);
        resizeObserver.observe(chapterChartRef.current);
        resizeObserver.observe(updateChartRef.current);
        window.addEventListener('resize', resize);

        setLoading(false);

        cleanupCharts = () => {
          window.removeEventListener('resize', resize);
          resizeObserver?.disconnect();
          if (rotateTimer) window.clearInterval(rotateTimer);
          statusChart.dispose();
          chapterChart.dispose();
          updateChart.dispose();
        };
      })
      .catch(() => {
        if (!disposed) {
          setLoadError('ECharts 脚本加载失败，已保留数据摘要。');
          setLoading(false);
        }
      });

    return () => {
      disposed = true;
      if (rotateTimer) window.clearInterval(rotateTimer);
      resizeObserver?.disconnect();
      cleanupCharts?.();
    };
  }, [chartData, novels.length]);

  if (!novels.length) {
    return <Empty description="暂无作品数据" />;
  }

  return (
    <div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: 12,
        marginBottom: 14,
      }}>
        {[
          { label: '作品总数', value: novels.length },
          { label: '创作中', value: chartData.activeCount },
          { label: '已完成', value: chartData.completedCount },
          { label: '累计章节', value: chartData.totalChapters },
        ].map((item) => (
          <div key={item.label} style={{
            padding: '14px 16px',
            borderRadius: 12,
            background: 'rgba(15,23,42,0.42)',
            border: '1px solid rgba(99,102,241,0.14)',
          }}>
            <Text style={{ color: '#94a3b8', fontSize: 12 }}>{item.label}</Text>
            <div style={{ color: '#f8fafc', fontSize: 24, fontWeight: 700, marginTop: 4 }}>{item.value}</div>
          </div>
        ))}
      </div>

      {loadError && <Alert type="warning" showIcon message={loadError} style={{ marginBottom: 14, borderRadius: 10 }} />}
      {loading && (
        <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Spin tip="正在加载 ECharts..." />
        </div>
      )}

      <div style={{
        display: loading ? 'none' : 'grid',
        gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, minmax(0, 1fr))',
        gap: 14,
      }}>
        <div style={chartCardStyle}>
          <Text style={chartTitleStyle}>作品状态分布</Text>
          <div ref={statusChartRef} style={{ height: 260 }} />
        </div>
        <div style={{ ...chartCardStyle, gridColumn: isMobile ? undefined : 'span 2' }}>
          <Text style={chartTitleStyle}>章节规模排行</Text>
          <div ref={chapterChartRef} style={{ height: 260 }} />
        </div>
        <div style={chartCardStyle}>
          <Text style={chartTitleStyle}>Token 消耗</Text>
          <div style={{
            height: 260,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}>
            <div>
              <Text style={{ color: '#94a3b8', fontSize: 12 }}>今日已用</Text>
              <div style={{ color: '#f8fafc', fontSize: 30, fontWeight: 700, marginTop: 6 }}>
                {tokenStats.used.toLocaleString()}
              </div>
              <Text style={{ color: '#94a3b8', fontSize: 12 }}>
                {tokenStats.limit > 0 ? `每日额度 ${tokenStats.limit.toLocaleString()}` : '每日额度不限'}
              </Text>
            </div>

            <Progress
              percent={tokenStats.limit > 0 ? tokenStats.percent : 100}
              showInfo={false}
              strokeColor={tokenStats.percent >= 90 ? '#f87171' : tokenStats.percent >= 70 ? '#f59e0b' : '#22d3ee'}
              trailColor="rgba(148,163,184,0.14)"
            />

            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 10,
            }}>
              <div style={tokenCellStyle}>
                <Text style={tokenLabelStyle}>使用率</Text>
                <div style={tokenValueStyle}>{tokenStats.limit > 0 ? `${tokenStats.percent}%` : '不限'}</div>
              </div>
              <div style={tokenCellStyle}>
                <Text style={tokenLabelStyle}>剩余额度</Text>
                <div style={tokenValueStyle}>
                  {tokenStats.remaining === null ? '不限' : tokenStats.remaining.toLocaleString()}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div style={{ ...chartCardStyle, gridColumn: '1 / -1' }}>
          <Text style={chartTitleStyle}>近期更新趋势</Text>
          <div ref={updateChartRef} style={{ height: 250 }} />
        </div>
      </div>
    </div>
  );
};

const chartCardStyle: React.CSSProperties = {
  minWidth: 0,
  minHeight: 304,
  padding: 16,
  borderRadius: 14,
  background: 'rgba(15,23,42,0.36)',
  border: '1px solid rgba(99,102,241,0.14)',
};

const chartTitleStyle: React.CSSProperties = {
  display: 'block',
  color: '#e2e8f0',
  fontWeight: 600,
  marginBottom: 8,
};

const tokenCellStyle: React.CSSProperties = {
  minWidth: 0,
  padding: '12px 10px',
  borderRadius: 10,
  background: 'rgba(15,23,42,0.42)',
  border: '1px solid rgba(99,102,241,0.12)',
};

const tokenLabelStyle: React.CSSProperties = {
  display: 'block',
  color: '#94a3b8',
  fontSize: 12,
  marginBottom: 4,
};

const tokenValueStyle: React.CSSProperties = {
  color: '#f8fafc',
  fontSize: 18,
  fontWeight: 700,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

export default DashboardCharts;
