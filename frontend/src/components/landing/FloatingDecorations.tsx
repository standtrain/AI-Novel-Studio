import React from 'react';

const blobs = [
  { size: 500, top: '15%', left: '-8%', color: 'rgba(26,86,219,0.12)', delay: '0s' },
  { size: 400, top: '40%', right: '-5%', color: 'rgba(245,158,11,0.10)', delay: '2s' },
  { size: 350, top: '75%', left: '60%', color: 'rgba(26,86,219,0.08)', delay: '4s' },
  { size: 300, bottom: '10%', left: '10%', color: 'rgba(139,92,246,0.09)', delay: '1s' },
  { size: 250, top: '60%', right: '30%', color: 'rgba(245,158,11,0.07)', delay: '3s' },
];

const FloatingDecorations: React.FC = () => (
  <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden' }}>
    {blobs.map((b, i) => (
      <div
        key={i}
        style={{
          position: 'absolute',
          width: b.size,
          height: b.size,
          top: b.top,
          left: b.left,
          right: b.right,
          bottom: b.bottom,
          borderRadius: '50%',
          background: b.color,
          filter: 'blur(100px)',
          animation: `floatBlob 8s ease-in-out infinite`,
          animationDelay: b.delay,
        }}
      />
    ))}
    <style>{`
      @keyframes floatBlob {
        0%, 100% { transform: translate(0, 0) scale(1); }
        33% { transform: translate(30px, -40px) scale(1.08); }
        66% { transform: translate(-20px, 20px) scale(0.95); }
      }
    `}</style>
  </div>
);

export default FloatingDecorations;
