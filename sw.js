/* =====================================================================
   HidroAlerta Río Cazones · Service worker
   - Guarda la página, letras, fotos e íconos para que la app abra aunque no haya internet.
   - La página siempre se pide primero a internet (así nadie se queda con una versión vieja);
     solo si no hay conexión se usa la copia guardada.
   - Los datos del río NO se guardan aquí: la página guarda la última lectura por su cuenta.
   - Muestra las notificaciones de alerta que manda Supabase.
   Si cambias la lista de archivos, sube el número de VERSION.
   ===================================================================== */
var VERSION = "hidroalerta-v1";
var ARCHIVOS = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "fondo-rio.jpg",
  "fondo-rio-movil.jpg",
  "barlow-condensed-600.woff2",
  "barlow-condensed-700.woff2",
  "barlow-condensed-800.woff2",
  "public-sans-400.woff2",
  "public-sans-600.woff2",
  "public-sans-700.woff2",
  "icon-192.png",
  "icon-512.png",
  "apple-touch-icon.png",
  "favicon-32.png"
];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) {
    /* si algún archivo falta, los demás se guardan igual */
    return Promise.all(ARCHIVOS.map(function (a) { return c.add(a).catch(function () {}); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function conTiempo(promesa, ms) {
  return new Promise(function (ok, fail) {
    var t = setTimeout(function () { fail(new Error("tiempo")); }, ms);
    promesa.then(function (r) { clearTimeout(t); ok(r); }, function (e) { clearTimeout(t); fail(e); });
  });
}

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;          /* Supabase, Telegram, mapas: directo a internet */
  if (/panel\.html$/.test(url.pathname)) return;             /* el panel del equipo nunca se guarda */

  if (req.mode === "navigate") {
    /* Página: primero internet (8 s máximo); sin conexión, la copia guardada */
    e.respondWith(conTiempo(fetch(req), 8000).then(function (r) {
      if (r.ok) { var copia = r.clone(); caches.open(VERSION).then(function (c) { c.put("./", copia); }); }
      return r;
    }).catch(function () {
      return caches.match("./").then(function (r) { return r || caches.match("index.html"); });
    }));
    return;
  }

  /* Letras, fotos e íconos: la copia guardada al instante y se actualiza por detrás */
  e.respondWith(caches.open(VERSION).then(function (c) {
    return c.match(req).then(function (guardado) {
      var red = fetch(req).then(function (r) { if (r.ok) c.put(req, r.clone()); return r; }).catch(function () { return guardado; });
      return guardado || red;
    });
  }));
});

/* ---------- Notificaciones de alerta ---------- */
self.addEventListener("push", function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { cuerpo: e.data ? e.data.text() : "" }; }
  var titulo = d.titulo || "HidroAlerta Río Cazones";
  e.waitUntil(self.registration.showNotification(titulo, {
    body: d.cuerpo || "Revisa el nivel del río.",
    icon: "icon-192.png",
    tag: "hidroalerta",                    /* una alerta nueva reemplaza a la anterior */
    renotify: true,
    requireInteraction: d.tipo === "critico",
    vibrate: d.tipo === "critico" ? [400, 150, 400, 150, 400] : [200, 100, 200],
    data: { url: "./" }
  }));
});

self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (ws) {
    for (var i = 0; i < ws.length; i++) { if ("focus" in ws[i]) { ws[i].navigate("./").catch(function () {}); return ws[i].focus(); } }
    return self.clients.openWindow("./");
  }));
});
