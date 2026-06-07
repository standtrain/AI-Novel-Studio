import React, { useEffect, useState } from 'react';
import useSiteBrand from '../../hooks/useSiteBrand';
import { withAssetVersion } from '../../utils/favicon';

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
  const { faviconUrl, brandVersion } = useSiteBrand();
  const [imageFailed, setImageFailed] = useState(false);
  const iconSize = sizeMap[size];
  const normalizedFaviconUrl = faviconUrl || '/favicon.svg';
  const imageSrc = withAssetVersion(normalizedFaviconUrl, brandVersion);

  useEffect(() => {
    setImageFailed(false);
  }, [imageSrc]);

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

export default BrandIcon;
