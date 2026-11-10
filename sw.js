/*
 * POSTA PER AREE – sw.js (8.26): il pezzetto dell'app che resta installato nel telefono o nel computer.
 * Quando l'app su Google "bussa" (notifica push senza contenuto), il dispositivo sveglia questo file anche ad app chiusa:
 * chiede all'app cosa c'è (notifichePerDispositivo), mostra l'avviso e mette il numero sull'icona.
 * Nessun dato resta qui. L'indirizzo del servizio è in config.js (lo stesso della pagina).
 *
 * 8.26:
 *  - con l'app aperta davanti agli occhi l'avviso del sistema si salta solo se la pagina conferma che può suonare lei
 *    (il browser lascia suonare una pagina solo dopo un primo clic: di mattina, con l'app aperta da sola, non può).
 *    In quel caso la pagina controlla subito le novità, così l'avviso dell'app arriva insieme al push e non un minuto dopo;
 *  - Safari (anche sul Mac) e Firefox: l'avviso si mostra sempre (se un push resta senza avviso, Safari spegne le notifiche).
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
var UA = self.navigator.userAgent || '';
var IOS = /iPad|iPhone|iPod/.test(UA) || (/Macintosh/.test(UA) && self.navigator.maxTouchPoints > 1);
// solo i browser basati su Chromium (Chrome, Edge, Samsung, Opera) accettano un push senza avviso quando la pagina è davanti
var CHROMIUM = !IOS && /Chrome\/|Chromium\/|Edg\/|OPR\/|SamsungBrowser\//.test(UA);

self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

/** Chiede a una finestra aperta se può dare lei l'avviso con il suono (risposta entro 1,5 secondi, altrimenti no). */
function paginaPuoSuonare(c) {
  return new Promise(function (ok) {
    var fatto = false, canale;
    var fine = function (v) { if (!fatto) { fatto = true; ok(v); } };
    try {
      canale = new MessageChannel();
      canale.port1.onmessage = function (ev) { fine(!!(ev.data && ev.data.suona)); };
      c.postMessage({ ppa: 'puoiSuonare' }, [canale.port2]);
    } catch (x) { fine(false); return; }
    setTimeout(function () { fine(false); }, 1500);
  });
}

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
    var mostra = function () {
      return self.registration.showNotification(d.titolo || 'Posta per aree', {
        body: d.testo || 'Apri l\'app per vedere le novità', icon: 'icona-192.png', badge: 'icona-192.png', tag: 'posta-per-aree', renotify: true, lang: 'it',
        data: { url: self.registration.scope }
      });
    };
    if (d.prova || !CHROMIUM) return mostra();
    return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (finestre) {
      var davanti = finestre.filter(function (c) { return c.focused || c.visibilityState === 'visible'; });
      if (!davanti.length) return mostra();
      return paginaPuoSuonare(davanti[0]).then(function (suona) {
        if (!suona) return mostra();
        // la pagina dà l'avviso con il suono: le si chiede di guardare subito le novità
        davanti.forEach(function (c) { try { c.postMessage({ ppa: 'novita' }); } catch (x) { /* niente */ } });
        return null;
      });
    });
  }));
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || self.registration.scope;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (finestre) {
    for (var i = 0; i < finestre.length; i++) {
      if (finestre[i].url.indexOf(self.registration.scope) === 0 && 'focus' in finestre[i]) {
        try { finestre[i].postMessage({ ppa: 'novita' }); } catch (x) { /* niente */ }
        return finestre[i].focus();
      }
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
