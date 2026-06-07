import React, { useEffect, useState } from 'react';
import useSiteBrand from '../../hooks/useSiteBrand';

type BrandIconSize = 'sm' | 'md' | 'lg';

interface BrandIconProps {
  size?: BrandIconSize;
  className?: string;
}

const sizeMap: Record<BrandIconSize, number> = {
  sm: 28,
  md: 34,
  lg: 72,
};

const BrandIcon: React.FC<BrandIconProps> = ({ size = 'md', className }) => {
  const { faviconUrl } = useSiteBrand();
  const [imageFailed, setImageFailed] = useState(false);
  const [version, setVersion] = useState(() => Date.now());
  const iconSize = sizeMap[size];
  const normalizedFaviconUrl = faviconUrl || '/favicon.svg';
  const imageSrc = `${normalizedFaviconUrl}${normalizedFaviconUrl.includes('?') ? '&' : '?'}v=${version}`;

  useEffect(() => {
    const nextVersion = Date.now();
    setVersion(nextVersion);
    setImageFailed(false);
    updateDocumentFavicon(normalizedFaviconUrl, nextVersion);
  }, [normalizedFaviconUrl]);

  return (
    <span
      className={`brand-icon brand-icon-${size}${className ? ` ${className}` : ''}`}
      style={{ width: iconSize, height: iconSize, borderRadius: size === 'lg' ? 20 : 10 }}
    >
      {!imageFailed ? (
        <img src={imageSrc} alt="站点图标" onError={() => setImageFailed(true)} />
      ) : (
        <span className="brand-icon-fallback">AI</span>
      )}
    </span>
  );
};

const updateDocumentFavicon = (faviconUrl: string, version: number) => {
  const href = `${faviconUrl}${faviconUrl.includes('?') ? '&' : '?'}v=${version}`;
  const rels = ['icon', 'shortcut icon'];

  rels.forEach((rel) => {
    let link = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
    if (!link) {
      link = document.createElement('link');
      link.rel = rel;
      document.head.appendChild(link);
    }
    link.href = href;
  });
};

export default BrandIcon;
