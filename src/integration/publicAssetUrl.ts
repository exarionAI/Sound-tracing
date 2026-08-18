let cachedPublicRootUrl: string | null = null;

export function publicAssetUrl(fileName: string): string {
  return new URL(fileName.replace(/^\/+/, ''), publicRootUrl()).href;
}

function publicRootUrl(): string {
  if (cachedPublicRootUrl) return cachedPublicRootUrl;

  const baseUrl = import.meta.env.BASE_URL;
  if (baseUrl && baseUrl !== './') {
    cachedPublicRootUrl = new URL(baseUrl, window.location.origin).href;
    return cachedPublicRootUrl;
  }

  const scripts = Array.from(document.querySelectorAll<HTMLScriptElement>('script[type="module"][src]'));
  const bundledScript = scripts.find((script) => script.src.includes('/assets/'));
  if (bundledScript) {
    cachedPublicRootUrl = new URL('../', bundledScript.src).href;
    return cachedPublicRootUrl;
  }

  cachedPublicRootUrl = new URL('/', window.location.origin).href;
  return cachedPublicRootUrl;
}
