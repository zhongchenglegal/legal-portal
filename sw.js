/* ZHONG CHENG · 众诚 — служебный скрипт портала (PWA).
   Делает две вещи: показывает push-уведомления, когда портал закрыт, и открывает нужное дело по нажатию.
   Данные портала в нём НЕ хранятся: страница каждый раз берётся с сайта, а при отсутствии сети показывается последняя
   загруженная (чтобы значок не открывал пустое окно). Версия скрипта ниже меняется, когда меняется этот файл. */
const SW_VERSION = "4";
const SHELL = "zc-shell-" + SW_VERSION;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith("zc-shell-") && k !== SHELL) await caches.delete(k);
  await self.clients.claim();
})()));

/* страница: сначала сеть и всегда свежая (кэш браузера сайта — до 10 минут — пропускается, чтобы после публикации
   открывалась новая версия без Ctrl+Shift+R); без сети — последняя сохранённая */
self.addEventListener("fetch", e => {
  const r = e.request;
  if (r.method !== "GET" || r.mode !== "navigate") return;
  e.respondWith((async () => {
    try {
      const res = await fetch(r.url, { cache: "no-cache", credentials: "same-origin", redirect: "follow" });
      if (res && res.ok && new URL(r.url).origin === self.location.origin) { const c = await caches.open(SHELL); c.put("./", res.clone()).catch(() => {}); }
      return res;
    } catch (err) {
      const c = await caches.open(SHELL); const hit = await c.match("./");
      if (hit) return hit;
      throw err;
    }
  })());
});

/* push: сервер присылает {title, body, url, tag}; текст — тот, что человек выбрал в настройках уведомлений.
   Уведомление не исчезает само (requireInteraction), пока сотрудник его не закроет или не нажмёт; кнопка ведёт
   прямо на место уведомления: переписку, дело, задачи, клиента. На iPhone кнопок нет — там открывает нажатие. */
const ACT = url => url.includes("#/chats/") ? "Открыть сообщение · 打开消息" : url.includes("#/matter/") ? "Открыть дело · 打开案件"
  : url.includes("#/tasks") ? "Открыть задачи · 打开任务" : url.includes("#/client/") ? "Открыть клиента · 打开客户" : "Открыть портал · 打开门户";
/* ОШ-0080 (версия 3.2, вариант б, решение владельца 04.11.2026): уведомление о сообщении сервер шлёт всегда; показ гасится
   только когда у получателя открыт именно этот чат и окно портала видно и в фокусе. Страница сообщает сюда {type:"zc-view",
   chat, visible}; сведения старше двух минут не считаются (скрипт мог перезапуститься — тогда уведомление показывается). */
let view = null;
self.addEventListener("message", e => { const d = e.data || {}; if (d.type === "zc-view") view = { chat: d.chat ? String(d.chat) : null, visible: !!d.visible, at: Date.now() }; });
const chatOf = url => { const m = /#[/]chats[/]([^/?#]+)/.exec(String(url || "")); try { return m ? decodeURIComponent(m[1]) : null; } catch (_) { return m ? m[1] : null; } };
const quiet = (url, v, clients, now) => { const k = chatOf(url); if (!k || !v || !v.visible || v.chat !== k || now - v.at > 120000) return false;
  return (clients || []).some(c => c.visibilityState === "visible" && c.focused !== false); };
self.chatOf52 = chatOf; self.quiet52 = quiet;
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : "" }; }
  const title = String(d.title || "ZHONG CHENG · 众诚").slice(0, 120);
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true }).catch(() => []);
    if (quiet(d.url, view, all, Date.now())) return;
    await self.registration.showNotification(title, {
    body: String(d.body || "").slice(0, 400),
    icon: "icons/icon-192.png?v=2", badge: "icons/badge-96.png?v=2",
    tag: d.tag ? String(d.tag) : undefined, data: { url: typeof d.url === "string" ? d.url : "./" },
    requireInteraction: true, actions: [{ action: "open", title: ACT(typeof d.url === "string" ? d.url : "") }]
  }); })());
});

/* нажатие на уведомление или на кнопку «Открыть …»: открыть окно портала на нужной странице (или вывести уже открытое вперёд) */
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
