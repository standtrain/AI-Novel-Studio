const DEFAULT_FAVICON_URL = '/favicon.svg';

function getIconMimeType(url: string) {
  const cleanUrl = url.split('?')[0].split('#')[0].toLowerCase();
  if (cleanUrl.endsWith('.svg')) return 'image/svg+xml';
  if (cleanUrl.endsWith('.ico')) return 'image/x-icon';
  if (cleanUrl.endsWith('.jpg') || cleanUrl.endsWith('.jpeg')) return 'image/jpeg';
  if (cleanUrl.endsWith('.png')) return 'image/png';
  return 'image/png';
}

export function withAssetVersion(url: string | undefined, version: number | string) {
  const normalizedUrl = url || DEFAULT_FAVICON_URL;
  const separator = normalizedUrl.includes('?') ? '&' : '?';
  return `${normalizedUrl}${separator}v=${encodeURIComponent(String(version))}`;
}

export function updateDocumentFavicon(faviconUrl: string | undefined, version: number | string) {
  if (typeof document === 'undefined') return;

  const normalizedUrl = faviconUrl || DEFAULT_FAVICON_URL;
  const href = withAssetVersion(normalizedUrl, version);
  const type = getIconMimeType(normalizedUrl);
  const rels = ['icon', 'shortcut icon', 'alternate icon', 'apple-touch-icon'];

  // 浏览器会优先读取 head 中的 favicon link；这里统一更新所有常见 rel，避免某些标签仍指向旧图标。
  rels.forEach((rel) => {
    let link = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
    if (!link) {
      link = document.createElement('link');
      link.rel = rel;
      document.head.appendChild(link);
    }
    link.href = href;
    if (rel !== 'apple-touch-icon') {
      link.type = type;
    }
  });
}
