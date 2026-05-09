// ════════════════════════════════════════════════════════════
// YIO CucinaFlow Service Worker
// 版本号 = HTML 版本号（cucina.html 中的 v1.1.5）
// 每次发版前修改 CACHE_VERSION，触发用户端自动更新
// ════════════════════════════════════════════════════════════

const CACHE_VERSION = 'cucina-v1.1.5';
const STATIC_CACHE  = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

// 启动时立即缓存的核心资源
const CORE_ASSETS = [
  '/cucina.html',
  '/manifest-cucina.json',
  '/logo-c.png',
  '/icon.png',
];

// ── INSTALL：缓存核心资源 ──
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(STATIC_CACHE)
      .then(c => c.addAll(CORE_ASSETS).catch(err => {
        console.warn('[SW] 部分核心资源缓存失败（不影响安装）:', err);
      }))
      .then(() => self.skipWaiting())
  );
});

// ── ACTIVATE：清理旧版本缓存 ──
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k.startsWith('cucina-') && !k.startsWith(CACHE_VERSION))
            .map(k => {
              console.log('[SW] 删除旧缓存:', k);
              return caches.delete(k);
            })
      ))
      .then(() => self.clients.claim())
  );
});

// ── FETCH：智能路由 ──
self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);

  // 只处理 GET
  if (req.method !== 'GET') return;

  // ① Supabase API → 网络优先，不缓存（数据必须实时）
  if (url.hostname.includes('supabase.co')) {
    return; // 让浏览器原生处理
  }

  // ② WhatsApp 跳转链接 → 不拦截
  if (url.hostname.includes('whatsapp.com') || url.hostname.includes('wa.me')) {
    return;
  }

  // ③ HTML 文档 → 网络优先，失败回退缓存（保证拿到最新版本）
  if (req.mode === 'navigate' || req.destination === 'document') {
    e.respondWith(
      fetch(req)
        .then(resp => {
          if (resp.ok) {
            const clone = resp.clone();
            caches.open(STATIC_CACHE).then(c => c.put(req, clone));
          }
          return resp;
        })
        .catch(() => caches.match(req).then(c => c || caches.match('/cucina.html')))
    );
    return;
  }

  // ④ 静态资源（CDN / 字体 / 图标） → 缓存优先 + 后台刷新（stale-while-revalidate）
  e.respondWith(
    caches.match(req).then(cached => {
      const fetchPromise = fetch(req)
        .then(resp => {
          if (resp.ok && (resp.type === 'basic' || resp.type === 'cors')) {
            const clone = resp.clone();
            caches.open(RUNTIME_CACHE).then(c => c.put(req, clone));
          }
          return resp;
        })
        .catch(() => cached); // 网络失败 → 用缓存兜底
      return cached || fetchPromise;
    })
  );
});

// ── MESSAGE：接收主页面的更新指令 ──
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
