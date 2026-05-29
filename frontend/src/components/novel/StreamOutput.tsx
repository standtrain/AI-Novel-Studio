import React, { useEffect, useRef } from 'react';
import { Typography, Spin } from 'antd';

const { Paragraph } = Typography;

interface StreamOutputProps {
  text: string;
  isStreaming: boolean;
}

const StreamOutput: React.FC<StreamOutputProps> = ({ text, isStreaming }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [text]);

  if (!text && !isStreaming) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className="stream-output-container"
      style={{
        maxHeight: 400,
        overflow: 'auto',
        padding: 16,
        background: 'rgba(15,23,42,0.85)',
        borderRadius: 8,
        border: '1px solid rgba(99,102,241,0.2)',
        whiteSpace: 'pre-wrap',
        lineHeight: 1.8,
        fontSize: 15,
        color: '#e2e8f0',
        wordBreak: 'break-word',
      }}
    >
      {isStreaming && !text && <Spin tip="正在生成..." />}
      {text}
      {isStreaming && text && <span className="stream-cursor" />}
    </div>
  );
};

export default StreamOutput;
