/* ==========================================
   智交班 - Service Worker
   离线缓存策略 | 网络优先 + 缓存回退
   ========================================== */

// 缓存名称（更新版本号可强制刷新缓存）
const CACHE_NAME = 'isbar-v2';

// 需要预缓存的静态资源（使用相对路径，兼容GitHub Pages子目录部署）
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icon-192.svg',
  './icon-512.svg',
];

// ========== 安装事件：预缓存静态资源 ==========
self.addEventListener('install', (event) => {
  console.log('[SW] 安装中...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] 预缓存静态资源');
      return cache.addAll(PRECACHE_ASSETS);
    }).then(() => {
      console.log('[SW] 安装完成，跳过等待');
      return self.skipWaiting();
    })
  );
});

// ========== 激活事件：清理旧缓存 ==========
self.addEventListener('activate', (event) => {
  console.log('[SW] 激活中...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] 删除旧缓存:', name);
            return caches.delete(name);
          })
      );
    }).then(() => {
      console.log('[SW] 激活完成，立即接管所有页面');
      return self.clients.claim();
    })
  );
});

// ========== 请求拦截：智能缓存策略 ==========
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 只处理 GET 请求
  if (request.method !== 'GET') return;

  // 跳过 chrome-extension 等非HTTP请求
  if (!url.protocol.startsWith('http')) return;

  // 策略1：Tesseract.js 相关资源（CDN）—— 网络优先，失败时回退缓存
  if (url.hostname.includes('jsdelivr.net') || url.hostname.includes('tessdata')) {
    event.respondWith(networkFirstWithCache(request));
    return;
  }

  // 策略2：静态资源（HTML/CSS/JS/图标）—— 缓存优先，失败时回退网络
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirstWithNetwork(request));
    return;
  }

  // 策略3：其他请求（图片等）—— 网络优先
  event.respondWith(networkFirstWithCache(request));
});

// ========== 缓存策略实现 ==========

/** 缓存优先：先查缓存，未命中则请求网络并缓存 */
async function cacheFirstWithNetwork(request) {
  const cached = await caches.match(request);
  if (cached) {
    // 后台更新缓存（stale-while-revalidate）
    updateCache(request).catch(() => {});
    return cached;
  }
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    // 完全离线时返回缓存（如果有的话）
    const offlineCached = await caches.match(request);
    if (offlineCached) return offlineCached;
    throw err;
  }
}

/** 网络优先：先请求网络，失败时回退缓存 */
async function networkFirstWithCache(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw err;
  }
}

/** 后台静默更新缓存 */
async function updateCache(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response);
    }
  } catch (err) {
    // 后台更新失败，静默忽略
  }
}

/** 判断是否为静态资源（同源 HTML/CSS/JS/图标） */
function isStaticAsset(url) {
  // 同源请求
  if (url.origin !== self.location.origin) return false;
  // 静态资源扩展名
  const staticExts = ['.html', '.css', '.js', '.json', '.svg', '.png', '.ico', '.xml'];
  return staticExts.some(ext => url.pathname.endsWith(ext)) || url.pathname === '/' || url.pathname.endsWith('/');
}