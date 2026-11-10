/*
 * POSTA PER AREE – sw.js (8.25): il pezzetto dell'app che resta installato nel telefono o nel computer.
 * Quando l'app su Google "bussa" (notifica push senza contenuto), il dispositivo sveglia questo file anche ad app chiusa:
 * chiede all'app cosa c'è (notifichePerDispositivo), mostra l'avviso e mette il numero sull'icona.
 * Nessun dato resta qui. L'indirizzo del servizio è in config.js (lo stesso della pagina).
 */
/* global POSTA_EXEC */
try { importScripts('config.js'); } catch (e) { /* senza: si mostra un avviso generico */ }

function execNot() {
  return String((typeof POSTA_EXEC !== 'undefined' && POSTA_EXEC) || '').trim()
    .replace(/\/a\/macros\/[^\/]+\/s\//, '/macros/s/').replace(/\/a\/[^\/]+\/macros\/s\//, '/macros/s/');
}
function chiamaNot(fn, args) {
  var url = execNot();
  if (!/^https:\/\/script\.google\.com\/.*\/exec$/.test(url)) return Promise.reject(new Error('indirizzo del servizio mancante'));
  return fetch(url, { method: 'POST', body: JSON.stringify({ fn: fn, args: args }), headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    credentials: 'omit', redirect: 'follow', cache: 'no-store' })
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function (o) { if (!o.ok) throw new Error(o.errore || 'errore'); return o.v; });
}
var IOS = /iPad|iPhone|iPod/.test(self.navigator.userAgent) || (/Macintosh/.test(self.navigator.userAgent) && self.navigator.maxTouchPoints > 1);

self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener('push', function (e) {
  e.waitUntil(self.registration.pushManager.getSubscription().then(function (sub) {
    if (!sub) return null;
    return chiamaNot('notifichePerDispositivo', [sub.endpoint]).catch(function () { return null; });
  }).then(function (d) {
    d = d || { titolo: 'Posta per aree', testo: 'Ci sono novità: apri l\'app per vederle.', n: null };
    // numero sull'icona (Windows, Mac, iPhone; su Android lo mette il sistema quando c'è una notifica)
    try {
      if (typeof d.n === 'number' && self.navigator.setAppBadge) { if (d.n > 0) self.navigator.setAppBadge(d.n); else self.navigator.clearAppBadge(); }
    } catch (x) { /* non disponibile */ }
    return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (finestre) {
      // con l'app aperta davanti agli occhi l'avviso lo dà già la pagina (campanella e suono); su iPhone si mostra sempre
      var davanti = finestre.some(function (c) { return c.focused || c.visibilityState === 'visible'; });
      if (davanti && !IOS && !d.prova) return null;
      if (d.vuota && !IOS && !d.testo) return null;
      return self.registration.showNotification(d.titolo || 'Posta per aree', {
        body: d.testo || '', icon: 'icona-192.png', tag: 'posta-per-aree', renotify: true, lang: 'it',
        data: { url: self.registration.scope }
      });
    });
  }));
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || self.registration.scope;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (finestre) {
    for (var i = 0; i < finestre.length; i++) {
      if (finestre[i].url.indexOf(self.registration.scope) === 0 && 'focus' in finestre[i]) return finestre[i].focus();
    }
    return self.clients.openWindow ? self.clients.openWindow(url) : null;
  }));
});

// il browser a volte cambia l'indirizzo push: si avvisa l'app (vale solo se quello vecchio era registrato)
self.addEventListener('pushsubscriptionchange', function (e) {
  var vecchio = e.oldSubscription;
  var chiave = vecchio && vecchio.options && vecchio.options.applicationServerKey;
  if (!vecchio || !chiave) return;
  e.waitUntil(self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chiave }).then(function (nuovo) {
    return chiamaNot('notificheCambioIndirizzo', [vecchio.endpoint, nuovo.endpoint]);
  }).catch(function () { /* al prossimo accesso la pagina la registra di nuovo */ }));
});
