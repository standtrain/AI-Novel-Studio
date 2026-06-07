import { useEffect, useState } from 'react';
import { getSiteInfoApi, type SiteInfo } from '../api/site';

export interface SiteBrandInfo extends SiteInfo {
  brandVersion: number;
}

let brandVersion = Date.now();

const DEFAULT_SITE_INFO: SiteBrandInfo = {
  siteName: 'AI Novel Studio',
  siteDescription: '基于 AI 的小说创作平台',
  faviconUrl: '/favicon.svg',
  brandVersion,
};

let cachedSiteInfo: SiteBrandInfo | null = null;
let loadingPromise: Promise<SiteBrandInfo> | null = null;
let requestSerial = 0;

const loadSiteInfo = async () => {
  if (loadingPromise) return loadingPromise;

  const currentSerial = requestSerial;
  loadingPromise = getSiteInfoApi()
    .then((info) => {
      const nextInfo = { ...DEFAULT_SITE_INFO, ...info, brandVersion };
      if (currentSerial === requestSerial) {
        cachedSiteInfo = nextInfo;
      }
      return cachedSiteInfo || nextInfo;
    })
    .catch(() => {
      const nextInfo = { ...DEFAULT_SITE_INFO, brandVersion };
      if (currentSerial === requestSerial) {
        cachedSiteInfo = nextInfo;
      }
      return cachedSiteInfo || nextInfo;
    })
    .finally(() => {
      loadingPromise = null;
    });

  return loadingPromise;
};

export const refreshSiteBrand = () => {
  requestSerial += 1;
  cachedSiteInfo = null;
  loadingPromise = null;
  brandVersion = Date.now();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('site-brand-refresh'));
  }
};

const useSiteBrand = () => {
  const [siteInfo, setSiteInfo] = useState<SiteBrandInfo>(cachedSiteInfo || DEFAULT_SITE_INFO);

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
