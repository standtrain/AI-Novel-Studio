import { useEffect, useState } from 'react';
import { getSiteInfoApi, type SiteInfo } from '../api/site';

const DEFAULT_SITE_INFO: SiteInfo = {
  siteName: 'AI Novel Studio',
  siteDescription: '基于 AI 的小说创作平台',
  faviconUrl: '/favicon.svg',
};

let cachedSiteInfo: SiteInfo | null = null;
let loadingPromise: Promise<SiteInfo> | null = null;

const loadSiteInfo = async () => {
  if (loadingPromise) return loadingPromise;

  loadingPromise = getSiteInfoApi()
    .then((info) => {
      cachedSiteInfo = { ...DEFAULT_SITE_INFO, ...info };
      return cachedSiteInfo;
    })
    .catch(() => {
      cachedSiteInfo = DEFAULT_SITE_INFO;
      return cachedSiteInfo;
    })
    .finally(() => {
      loadingPromise = null;
    });

  return loadingPromise;
};

export const refreshSiteBrand = () => {
  cachedSiteInfo = null;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('site-brand-refresh'));
  }
};

const useSiteBrand = () => {
  const [siteInfo, setSiteInfo] = useState<SiteInfo>(cachedSiteInfo || DEFAULT_SITE_INFO);

  useEffect(() => {
    let mounted = true;

    const refresh = async () => {
      const info = await loadSiteInfo();
      if (mounted) setSiteInfo(info);
    };

    refresh();
    window.addEventListener('site-brand-refresh', refresh);

    return () => {
      mounted = false;
      window.removeEventListener('site-brand-refresh', refresh);
    };
  }, []);

  return siteInfo;
};

export default useSiteBrand;
