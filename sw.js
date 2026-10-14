/* ZHONG CHENG · 众诚 — служебный скрипт портала (PWA).
   Делает две вещи: показывает push-уведомления, когда портал закрыт, и открывает нужное дело по нажатию.
   Данные портала в нём НЕ хранятся: страница каждый раз берётся с сайта, а при отсутствии сети показывается последняя
   загруженная (чтобы значок не открывал пустое окно). Версия скрипта ниже меняется, когда меняется этот файл. */
const SW_VERSION = "1";
const SHELL = "zc-shell-" + SW_VERSION;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith("zc-shell-") && k !== SHELL) await caches.delete(k);
  await self.clients.claim();
})()));

/* страница: сначала сеть (чтобы новая версия портала подхватывалась сразу), при ошибке — последняя сохранённая */
self.addEventListener("fetch", e => {
  const r = e.request;
  if (r.method !== "GET" || r.mode !== "navigate") return;
  e.respondWith((async () => {
    try {
      const res = await fetch(r);
      if (res && res.ok && new URL(r.url).origin === self.location.origin) { const c = await caches.open(SHELL); c.put("./", res.clone()).catch(() => {}); }
      return res;
    } catch (err) {
      const c = await caches.open(SHELL); const hit = await c.match("./");
      if (hit) return hit;
      throw err;
    }
  })());
});

/* push: сервер присылает {title, body, url, tag}; текст — тот, что человек выбрал в настройках уведомлений */
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : "" }; }
  const title = String(d.title || "ZHONG CHENG · 众诚").slice(0, 120);
  e.waitUntil(self.registration.showNotification(title, {
    body: String(d.body || "").slice(0, 400),
    icon: "icons/icon-192.png", badge: "icons/badge-96.png",
    tag: d.tag ? String(d.tag) : undefined, data: { url: typeof d.url === "string" ? d.url : "./" }
  }));
});

/* нажатие: открыть окно портала на нужной странице (или вывести уже открытое вперёд) */
self.addEventListener("notificationclick", e => {
  e.notification.close();
  let url = new URL("./", self.location.href).href;
  try { const u = new URL((e.notification.data && e.notification.data.url) || "./", self.location.href); if (u.origin === self.location.origin) url = u.href; } catch (_) {}
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      if (new URL(c.url).origin !== self.location.origin) continue;
      await c.focus().catch(() => {});
      c.postMessage({ type: "zc-open", url });   // страница сама переходит по ссылке — без перезагрузки и потери набранного
      return;
    }
    await self.clients.openWindow(url);
  })());
});

/* ключ подписки изменился (браузер обновил): сообщить странице — она запишет новую подписку */
self.addEventListener("pushsubscriptionchange", e => {
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    all.forEach(c => c.postMessage({ type: "zc-push-changed" }));
  })());
});
