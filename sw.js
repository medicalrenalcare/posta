/*
 * POSTA PER AREE – sw.js (8.26.2): il pezzetto dell'app che resta installato nel telefono o nel computer.
 * Quando l'app su Google "bussa" (notifica push senza contenuto), il dispositivo sveglia questo file anche ad app chiusa:
 * chiede all'app cosa c'è (notifichePerDispositivo), mostra l'avviso e mette il numero sull'icona.
 * Nessun dato resta qui. L'indirizzo del servizio è in config.js (lo stesso della pagina).
 *
 * 8.26:
 *  - con l'app aperta davanti agli occhi l'avviso del sistema si salta solo se la pagina conferma che può suonare lei
 *    (il browser lascia suonare una pagina solo dopo un primo clic: di mattina, con l'app aperta da sola, non può).
 *    In quel caso la pagina controlla subito le novità, così l'avviso dell'app arriva insieme al push e non un minuto dopo;
 *  - Safari (anche sul Mac) e Firefox: l'avviso si mostra sempre (se un push resta senza avviso, Safari spegne le notifiche).
 *
 * 8.26.2 (su Android l'avviso risultava mandato ma non arrivava):
 *  - diario sul dispositivo: ogni "bussata" ricevuta si annota qui (ora, risposta dell'app, avviso mostrato o no). La pagina lo
 *    legge nella finestra "Notifiche su questo dispositivo": così si vede se il telefono ha ricevuto l'avviso e cosa ne ha fatto;
 *  - se la richiesta all'app non riesce (telefono appena sveglio, rete non pronta) si riprova una volta dopo 2,5 secondi;
 *  - la pagina può chiedere la versione di questo file (per sapere se il diario c'è).
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

var VERSIONE_SW = '8.26.2';
var DIARIO = 'ppa-diagnosi';
function chiaveDiario() { return self.registration.scope + 'diario-push'; }
function leggiDiario() {
  return caches.open(DIARIO).then(function (c) { return c.match(chiaveDiario()); }).then(function (r) { return r ? r.json() : []; }).catch(function () { return []; });
}
/** Annota (o aggiorna) una bussata nel diario del dispositivo: le ultime 12. */
function scriviDiario(voce) {
  return leggiDiario().then(function (l) {
    l = (Array.isArray(l) ? l : []).filter(function (x) { return x && x.t !== voce.t; });
    l.unshift(voce);
    return caches.open(DIARIO).then(function (c) {
      return c.put(chiaveDiario(), new Response(JSON.stringify(l.slice(0, 12)), { headers: { 'Content-Type': 'application/json' } }));
    });
  }).catch(function () { /* il diario è facoltativo */ });
}
function breve(e) { return String(e && e.message || e).slice(0, 120); }

self.addEventListener('message', function (e) {
  if (e.data && e.data.ppa === 'versione' && e.ports && e.ports[0]) e.ports[0].postMessage({ v: VERSIONE_SW });
});

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
  var voce = { t: Date.now(), server: '', esito: 'in corso' };   // 8.26.2: diario del dispositivo
  var chiedi = function (sub) {
    return chiamaNot('notifichePerDispositivo', [sub.endpoint]).catch(function () {
      return new Promise(function (ok) { setTimeout(ok, 2500); }).then(function () { return chiamaNot('notifichePerDispositivo', [sub.endpoint]); });
    });
  };
  e.waitUntil(scriviDiario(voce).then(function () { return self.registration.pushManager.getSubscription(); }).then(function (sub) {
    if (!sub) { voce.server = 'iscrizione non trovata'; return null; }
    return chiedi(sub).then(function (d) { voce.server = 'ok'; return d; }, function (err) { voce.server = 'errore: ' + breve(err); return null; });
  }).then(function (d) {
    d = d || { titolo: 'Posta per aree', testo: 'Ci sono novità: apri l\'app per vederle.', n: null };
    if (d.prova) voce.prova = true;
    // numero sull'icona (Windows, Mac, iPhone; su Android lo mette il sistema quando c'è una notifica)
    try {
      if (typeof d.n === 'number' && self.navigator.setAppBadge) { if (d.n > 0) self.navigator.setAppBadge(d.n); else self.navigator.clearAppBadge(); }
    } catch (x) { /* non disponibile */ }
    var mostra = function () {
      return self.registration.showNotification(d.titolo || 'Posta per aree', {
        body: d.testo || 'Apri l\'app per vedere le novità', icon: 'icona-192.png', badge: 'icona-192.png', tag: 'posta-per-aree', renotify: true, lang: 'it',
        data: { url: self.registration.scope }
      }).then(function () { voce.esito = 'avviso mostrato'; }, function (err) { voce.esito = 'avviso NON mostrato: ' + breve(err); });
    };
    if (d.prova || !CHROMIUM) return mostra();
    return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (finestre) {
      var davanti = finestre.filter(function (c) { return c.focused || c.visibilityState === 'visible'; });
      if (!davanti.length) return mostra();
      return paginaPuoSuonare(davanti[0]).then(function (suona) {
        if (!suona) return mostra();
        // la pagina dà l'avviso con il suono: le si chiede di guardare subito le novità
        davanti.forEach(function (c) { try { c.postMessage({ ppa: 'novita' }); } catch (x) { /* niente */ } });
        voce.esito = 'app aperta davanti: avviso dato dall\'app';
        return null;
      });
    });
  }).then(function () { return scriviDiario(voce); }, function (err) { voce.esito = 'errore: ' + breve(err); return scriviDiario(voce); }));
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
