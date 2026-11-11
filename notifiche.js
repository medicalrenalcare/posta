/*
 * POSTA PER AREE – notifiche.js (8.26.3). Lo carica index.html dopo la pagina dell'app.
 *  - Numero sull'icona dell'app installata (barra di Windows, Dock del Mac, iPhone) e nel titolo della finestra:
 *    sono le novità della campanella non ancora viste. Si aggiorna da solo con i controlli che l'app fa già ogni minuto.
 *  - Voce "Notifiche su questo dispositivo" nel menu con il nome: attiva o spegne le notifiche e manda una prova.
 *  - Dopo l'accesso, se le notifiche non sono ancora attive, una scheda in basso propone di attivarle (una volta ogni
 *    14 giorni se si risponde "Non ora"). Su iPhone, finché l'app non è aggiunta alla schermata Home, spiega come fare.
 *  - Con le notifiche attive, gli avvisi arrivano anche ad app chiusa (sw.js). Senza, con l'app aperta ma ridotta a
 *    icona, l'avviso del sistema lo dà comunque questa pagina (se il permesso c'è).
 * 8.26:
 *  - "Spegni su questo dispositivo" resta spento: prima, al ricaricamento della pagina, il permesso già dato lo riaccendeva;
 *  - con le notifiche bloccate nel browser compare la scheda con le istruzioni per sbloccarle (prima: niente);
 *  - risponde a sw.js se la pagina può suonare (serve un clic dopo l'apertura: il browser lo vuole) e, se sì, fa controllare
 *    subito le novità all'app (evento ppa:novita); se no, l'avviso lo dà il sistema, con il suo suono;
 *  - nella finestra: gli ultimi avvisi mandati o saltati, con il motivo, e se il giro di ogni minuto è attivo.
 * 8.26.2 (su Android l'avviso risultava mandato ma non arrivava):
 *  - sw.js tiene sul dispositivo un diario degli avvisi ricevuti; la finestra lo mostra ("Ricevuti da questo dispositivo")
 *    e dice se l'ultimo avviso mandato dall'app è arrivato qui oppure no, con cosa controllare sul dispositivo;
 *  - "Manda una prova" controlla da sola se la prova è arrivata (fino a 25 secondi) e lo dice;
 *  - "Rifai la registrazione": indirizzo push nuovo per questo dispositivo e poi una prova. Dopo l'accesso, se l'ultimo
 *    avviso non era arrivato, la registrazione si rifà da sola (al massimo una volta al giorno).
 * 8.26.3 (il numero sull'icona restava fermo dopo aver visto le novità):
 *  - il numero sull'icona si rimette a ogni controllo, anche se per la pagina non è cambiato: con l'app in secondo piano lo
 *    scrive anche sw.js (all'arrivo dell'avviso) e la pagina, che non lo sapeva, non lo toglieva più;
 *  - tornando sull'app (finestra di nuovo davanti) i numeri si controllano subito, senza aspettare il minuto.
 */
(function () {
  'use strict';
  if (window.__notifichePPA) return;
  window.__notifichePPA = true;

  var EXEC = String((window.INIZIALE && window.INIZIALE.exec) || window.POSTA_EXEC || '').trim()
    .replace(/\/a\/macros\/[^\/]+\/s\//, '/macros/s/').replace(/\/a\/[^\/]+\/macros\/s\//, '/macros/s/');
  var UA = navigator.userAgent || '';
  var IOS = /iPad|iPhone|iPod/.test(UA) || (/Macintosh/.test(UA) && navigator.maxTouchPoints > 1);
  var ANDROID = /Android/i.test(UA);
  var STANDALONE = !!((window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true);
  var PUSH = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  var S = { reg: null, sub: null, dentro: false, server: null, numero: -1, ultimaVista: 0, iscrittoQui: false, chiesto: false, cliccato: false };

  // 8.26: il browser lascia suonare la pagina solo dopo un clic o un tasto da quando è stata aperta
  ['pointerdown', 'keydown'].forEach(function (t) { document.addEventListener(t, function () { S.cliccato = true; }, { capture: true, passive: true }); });
  function puoSuonare() { return S.cliccato && !document.hidden && (!document.hasFocus || document.hasFocus()); }
  // 8.26: domande e avvisi di sw.js
  if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', function (ev) {
    var d = ev.data || {};
    if (d.ppa === 'puoiSuonare' && ev.ports && ev.ports[0]) {
      var si = puoSuonare();
      ev.ports[0].postMessage({ suona: si });
      if (si) chiediNovitaAllApp();
    } else if (d.ppa === 'novita') chiediNovitaAllApp();
  });
  function chiediNovitaAllApp() { try { window.dispatchEvent(new CustomEvent('ppa:novita')); } catch (e) { /* niente */ } }

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function token() {
    var t = '';
    try { t = sessionStorage.getItem('pa_token') || ''; } catch (e) { t = ''; }
    if (!t) { try { t = localStorage.getItem('pa_token_disp') || ''; } catch (e) { t = ''; } }
    return t;
  }
  function locale(k, v) { try { if (v === undefined) return localStorage.getItem(k) || ''; if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return ''; } return ''; }

  var fetchVero = window.fetch.bind(window);
  function chiama(fn, args) {
    return fetchVero(EXEC, { method: 'POST', body: JSON.stringify({ fn: fn, args: args }), headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      credentials: 'omit', redirect: 'follow', cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .then(function (t) { var o = JSON.parse(t); if (!o.ok) throw new Error(String(o.errore || 'errore').replace(/^\[[^\]]+\]\s*/, '')); return o.v; });
  }

  // ============================ NUMERO SULL'ICONA E NEL TITOLO ============================
  function impostaNumero(n) {
    n = Math.max(0, Number(n) || 0);
    // 8.26.3: sempre (anche se per la pagina è lo stesso numero): sull'icona scrive anche sw.js, all'arrivo di un avviso
    S.numero = n;
    try { if (navigator.setAppBadge) { if (n) navigator.setAppBadge(n); else navigator.clearAppBadge(); } } catch (e) { /* non disponibile */ }
    // il titolo si rimette ogni volta (l'app lo riscrive all'accesso)
    var base = String(document.title || 'Posta per aree').replace(/^\(\d+\+?\)\s*/, '');
    document.title = n ? '(' + (n > 99 ? '99+' : n) + ') ' + base : base;
  }

  // Le risposte che l'app riceve già (numeri ogni minuto, accesso, campanella vista, uscita): si leggono senza chiedere altro.
  window.fetch = function (url, init) {
    var p = fetchVero(url, init);
    try {
      var corpo = init && typeof init.body === 'string' ? init.body : '';
      var m = corpo.slice(0, 40).match(/^\{"fn":"(conteggi|avvio|segnaNovitaViste|esci)"/);
      if (m) p.then(function (r) { return r.clone().text(); }).then(function (t) { leggiRisposta(m[1], t); }).catch(function () { /* niente */ });
    } catch (e) { /* niente */ }
    return p;
  };
  function leggiRisposta(fn, testo) {
    var o;
    try { o = JSON.parse(testo); } catch (e) { return; }
    if (!o || !o.ok) return;
    if (fn === 'segnaNovitaViste' || fn === 'esci') { impostaNumero(0); return; }
    var nov = fn === 'conteggi' ? (o.v && o.v._novita) : (o.v && o.v.conteggi && o.v.conteggi._novita);
    if (!nov) return;
    impostaNumero(nov.nuove || 0);
    avvisoLocale(nov);
  }
  // App aperta ma ridotta a icona e notifiche push non attive qui: l'avviso del sistema lo dà la pagina.
  function avvisoLocale(nov) {
    if (!S.ultimaVista) { S.ultimaVista = nov.ultima || 1; return; }
    var nuove = (nov.recenti || []).filter(function (v) { return v.t > S.ultimaVista; });
    S.ultimaVista = Math.max(S.ultimaVista, nov.ultima || 0);
    // 8.26: anche con la pagina davanti, se non può suonare (nessun clic da quando è aperta)
    if (!nuove.length || puoSuonare() || S.iscrittoQui || !('Notification' in window) || Notification.permission !== 'granted') return;
    var titolo = nuove.length === 1 ? nuove[0].titolo : nuove.length + ' novità in Posta per aree';
    var corpo = nuove.length === 1 ? 'Posta per aree' : nuove.slice(0, 4).map(function (v) { return v.titolo; }).join('\n');
    try {
      if (S.reg) S.reg.showNotification(titolo, { body: corpo, icon: 'icona-192.png', tag: 'posta-per-aree', renotify: true, data: { url: location.href } });
      else new Notification(titolo, { body: corpo, icon: 'icona-192.png', tag: 'posta-per-aree' });
    } catch (e) { /* niente */ }
  }
  // tornando nell'app, gli avvisi già mostrati non servono più
  document.addEventListener('visibilitychange', function () {
    // 8.26.3: tornando sull'app i numeri (campanella, icona) si controllano subito, al massimo una volta ogni 20 secondi
    if (!document.hidden && S.dentro && Date.now() - (S.ultimoRitorno || 0) > 20000) { S.ultimoRitorno = Date.now(); chiediNovitaAllApp(); }
    if (document.hidden || !S.reg || !S.reg.getNotifications) return;
    S.reg.getNotifications({ tag: 'posta-per-aree' }).then(function (l) { l.forEach(function (n) { n.close(); }); }).catch(function () { /* niente */ });
  });

  // ============================ ISCRIZIONE ============================
  function chiaveInByte(b64) {
    var s = String(b64).replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    var bin = atob(s), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function nomeDispositivo() {
    var sis = IOS ? (/iPad/.test(UA) || !/iPhone/.test(UA) ? 'iPad' : 'iPhone') : ANDROID ? 'Android' : /Windows/.test(UA) ? 'Windows' : /Mac/.test(UA) ? 'Mac' : /Linux/.test(UA) ? 'Linux' : 'Dispositivo';
    var br = /Edg\//.test(UA) ? 'Edge' : /SamsungBrowser/.test(UA) ? 'Samsung Internet' : /Firefox\//.test(UA) ? 'Firefox' : /Chrome\//.test(UA) ? 'Chrome' : /Safari\//.test(UA) ? 'Safari' : 'browser';
    return sis + ' – ' + br + (STANDALONE ? ' (app installata)' : '');
  }
  function registrazione() {
    if (S.reg) return Promise.resolve(S.reg);
    if (!('serviceWorker' in navigator)) return Promise.reject(new Error('browser senza notifiche'));
    return navigator.serviceWorker.register('sw.js').then(function () { return navigator.serviceWorker.ready; }).then(function (r) { S.reg = r; return r; });
  }
  function iscrizioneAttuale() {
    return registrazione().then(function (r) { return r.pushManager.getSubscription(); }).then(function (s) { S.sub = s; return s; });
  }
  /** Chiede il permesso (se serve), iscrive il dispositivo e lo registra nell'app. Va chiamata da un tocco. */
  function attiva() {
    if (!PUSH) return Promise.reject(new Error(IOS && !STANDALONE ? 'Su iPhone le notifiche funzionano solo con l\'app aggiunta alla schermata Home.' : 'Questo browser non gestisce le notifiche.'));
    var permesso = Notification.permission === 'granted' ? Promise.resolve('granted') : Notification.requestPermission();
    return Promise.resolve(permesso).then(function (p) {
      if (p !== 'granted') throw new Error(p === 'denied' ? 'Le notifiche sono bloccate per l\'app: vedi sotto come sbloccarle.' : 'Permesso non dato.');
      return Promise.all([registrazione(), S.server && S.server.chiave ? Promise.resolve(S.server) : chiama('notificheStato', [token(), {}])]);
    }).then(function (x) {
      var r = x[0], st = x[1];
      if (!st.attive) throw new Error('Le notifiche sono spente nelle impostazioni dell\'app.');
      S.server = st;
      var chiave = chiaveInByte(st.chiave);
      var nuova = function () { return r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chiave }); };
      return r.pushManager.getSubscription().then(function (vecchia) {
        if (!vecchia) return nuova();
        // un'iscrizione fatta con un'altra chiave non vale: si rifà
        var k = vecchia.options && vecchia.options.applicationServerKey ? new Uint8Array(vecchia.options.applicationServerKey) : null;
        var uguale = k && k.length === chiave.length && Array.prototype.every.call(k, function (b, i) { return b === chiave[i]; });
        return uguale ? vecchia : vecchia.unsubscribe().then(nuova);
      });
    }).then(function (sub) {
      S.sub = sub;
      return chiama('notificheIscrivi', [token(), { endpoint: sub.endpoint, dispositivo: nomeDispositivo() }]);
    }).then(function (r) {
      S.iscrittoQui = true;
      locale('pa_notif_no', null);
      locale('pa_notif_spente', null);   // 8.26: acceso a mano
      return r;
    });
  }
  function spegni() {
    return iscrizioneAttuale().then(function (s) {
      var ep = s ? s.endpoint : '';
      return (ep ? chiama('notificheDisiscrivi', [token(), { endpoint: ep }]) : Promise.resolve()).then(function () { return s ? s.unsubscribe() : true; });
    }).then(function () { S.iscrittoQui = false; S.sub = null; locale('pa_notif_spente', String(Date.now())); });   // 8.26: resta spento
  }
  function prova() {
    return chiama('notificheProva', [token(), { endpoint: S.sub ? S.sub.endpoint : '' }]);
  }

  // ============================ 8.26.2: L'AVVISO È ARRIVATO SU QUESTO DISPOSITIVO? ============================
  // sw.js annota sul dispositivo ogni avviso che riceve (diario). Qui si confronta con quello che l'app ha mandato.

  /** Versione di sw.js ('' se è ancora quello vecchio, senza diario, o se non risponde). */
  function versioneSw() {
    return registrazione().then(function (r) {
      var sw = r && r.active;
      if (!sw) return '';
      return new Promise(function (ok) {
        var fatto = false, fine = function (v) { if (!fatto) { fatto = true; ok(v); } };
        try {
          var c = new MessageChannel();
          c.port1.onmessage = function (ev) { fine(String((ev.data && ev.data.v) || '')); };
          sw.postMessage({ ppa: 'versione' }, [c.port2]);
        } catch (e) { fine(''); return; }
        setTimeout(function () { fine(''); }, 1500);
      });
    }).catch(function () { return ''; }).then(function (v) {
      S.swNuovo = !!v;
      if (v && !locale('pa_notif_diario')) locale('pa_notif_diario', String(Date.now()));   // da quando il diario c'è
      if (!v && S.reg && S.reg.update) { try { S.reg.update(); } catch (e) { /* al prossimo avvio */ } }
      return v;
    });
  }
  /** Avvisi ricevuti da questo dispositivo, dal più recente: [{ t, server, esito, prova }] (null = non si può leggere). */
  function diarioLocale() {
    if (!('caches' in window)) return Promise.resolve(null);
    var base = (S.reg && S.reg.scope) || new URL('./', location.href).href;
    return caches.open('ppa-diagnosi').then(function (c) { return c.match(base + 'diario-push'); })
      .then(function (r) { return r ? r.json() : []; }).then(function (l) { return Array.isArray(l) ? l : []; }).catch(function () { return null; });
  }
  /** L'ultimo avviso mandato a questo dispositivo è arrivato? 'si', 'no' oppure '' (non si può dire). */
  function esitoUltimoAvviso(diario) {
    var q = S.server && S.server.questo, da = Number(locale('pa_notif_diario') || 0);
    if (!S.swNuovo || !q || !q.ultimo || !diario || !da || !/^consegnato/.test(q.esito || '')) return '';
    var t = new Date(q.ultimo).getTime();
    if (!(t > da + 60000) || Date.now() - t < 120000) return '';   // mandato prima del diario, o troppo fresco per dirlo
    return diario.some(function (x) { return x.t > t - 120000; }) ? 'si' : 'no';
  }
  /** Rifà da capo la registrazione di questo dispositivo (indirizzo push nuovo). */
  function rifaiIscrizione() {
    return iscrizioneAttuale().then(function (s) {
      if (!s) return attiva();
      return chiama('notificheDisiscrivi', [token(), { endpoint: s.endpoint }]).catch(function () { return null; })
        .then(function () { return s.unsubscribe(); }).then(function () { S.sub = null; S.iscrittoQui = false; return attiva(); });
    });
  }
  /** Manda una prova e controlla nel diario se questo dispositivo l'ha ricevuta (aspetta fino a 25 secondi). */
  function provaVerificata() {
    var t0 = Date.now();
    return prova().then(function (r) {
      if (!r.inviati) return { ok: false, testo: 'Prova non consegnata: ' + (r.esiti || []).join('; ') };
      if (!S.swNuovo) return { ok: true, testo: 'Prova inviata: tra pochi secondi deve comparire l\'avviso "Prova delle notifiche".' };
      return new Promise(function (fine) {
        var giri = 0;
        var guarda = function () {
          diarioLocale().then(function (d) {
            var v = (d || []).filter(function (x) { return x.t >= t0 - 500; })[0];   // stesso orologio: solo le bussate dopo il clic
            if (v && v.esito !== 'in corso') {
              fine(/^avviso mostrato/.test(v.esito) ? { ok: true, testo: 'Prova ricevuta da questo dispositivo: l\'avviso "Prova delle notifiche" è stato mostrato. Se non l\'hai visto né sentito, sono le impostazioni di notifica del dispositivo: ' + comeSbloccare() }
                : { ok: false, testo: 'Prova ricevuta da questo dispositivo, ma ' + v.esito + (v.server && v.server !== 'ok' ? ' (risposta dell\'app: ' + v.server + ')' : '') + '.' });
            } else if (++giri >= 12) {
              fine({ ok: false, testo: 'La prova è partita (Google l\'ha accettata) ma dopo 25 secondi questo dispositivo non l\'ha ricevuta. ' + comeSvegliare() });
            } else setTimeout(guarda, 2000);
          });
        };
        setTimeout(guarda, 2000);
      });
    });
  }
  /** Dopo l'accesso: se l'ultimo avviso non è arrivato qui, la registrazione si rifà da sola (al massimo una volta al giorno). */
  function controllaArrivo() {
    return versioneSw().then(function (v) { return v ? diarioLocale() : null; }).then(function (d) {
      S.diario = d;
      if (esitoUltimoAvviso(d) !== 'no') return null;
      if (Date.now() - Number(locale('pa_notif_rifatta') || 0) < 20 * 3600000) return null;
      locale('pa_notif_rifatta', String(Date.now()));
      return rifaiIscrizione().then(function () {
        avvisoBreve('L\'ultimo avviso non era arrivato su questo dispositivo: la registrazione delle notifiche è stata rifatta. Per controllare: menu con il tuo nome → Notifiche su questo dispositivo → Manda una prova.', 12000);
      });
    }).catch(function () { /* si riprova al prossimo accesso */ });
  }
  function comeSvegliare() {
    if (IOS) return 'Su iPhone: controlla che non sia attiva una "Full immersion" (Non disturbare) e apri l\'app dalla schermata Home.';
    if (ANDROID) return 'Sul telefono: 1) Impostazioni → App → Chrome → Batteria → "Senza restrizioni" (o "Non ottimizzare"); se tra le app c\'è anche "Posta per aree", lo stesso. ' +
      '2) Spegni "Risparmio energetico" e "Risparmio dati". 3) Su Xiaomi, Oppo, Realme, Huawei, Honor: attiva "Avvio automatico" per Chrome. 4) Non chiudere Chrome con "Chiudi tutto". Poi premi "Rifai la registrazione".';
    return 'Sul computer il browser deve poter restare attivo in sottofondo. Edge: Impostazioni → Sistema e prestazioni → "Continua a eseguire le estensioni e le app in background quando Microsoft Edge è chiuso" acceso. ' +
      'Chrome: Impostazioni → Sistema → "Continua a eseguire le app in background dopo la chiusura di Google Chrome" acceso.';
  }

  /** Dopo l'accesso: lo stato dal server; se il permesso c'è già si (ri)registra il dispositivo senza chiedere niente. */
  function dopoAccesso() {
    aggiungiVoceMenu();
    if (!EXEC) return;
    var dopo = function (st) {
      S.server = st;
      if (!st || !st.attive) return;
      if (typeof st.nuove === 'number') impostaNumero(st.nuove);
      S.iscrittoQui = !!(st.questo && st.questo.attivo);
      if (S.iscrittoQui && PUSH) controllaArrivo();   // 8.26.2: l'ultimo avviso è arrivato qui? Se no, la registrazione si rifà
      if (S.iscrittoQui || !PUSH) { if (!PUSH && IOS && !STANDALONE) proponi(); return; }
      if (locale('pa_notif_spente')) return;   // 8.26: spente a mano su questo dispositivo: restano spente
      if (Notification.permission === 'denied') { proponi(); return; }   // 8.26: bloccate: si spiega come sbloccarle
      if (Notification.permission === 'granted') {
        // permesso già dato (prima installazione, altro utente su questo dispositivo, indirizzo cambiato): si registra da solo
        attiva().catch(function () { proponi(); });
      } else if (Notification.permission === 'default') proponi();
    };
    if (PUSH) iscrizioneAttuale().catch(function () { return null; }).then(function (s) { return chiama('notificheStato', [token(), { endpoint: s ? s.endpoint : '' }]); }).then(dopo).catch(function () { /* niente */ });
    else chiama('notificheStato', [token(), {}]).then(dopo).catch(function () { /* niente */ });
  }

  // ============================ ASPETTO ============================
  var stile = document.createElement('style');
  stile.textContent =
    '#ntf-scheda{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:9998;max-width:min(520px,calc(100vw - 24px));background:#fff;color:#1d2b2c;' +
      'border:1px solid #cfdcdc;border-left:5px solid #0F5257;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.18);padding:12px 14px;font:14px/1.45 system-ui,-apple-system,"Segoe UI",Arial,sans-serif}' +
    '#ntf-scheda b{display:block;margin-bottom:4px}#ntf-scheda .ntf-bottoni{display:flex;gap:8px;justify-content:flex-end;margin-top:10px;flex-wrap:wrap}' +
    '.ntf-btn{font:inherit;padding:7px 14px;border-radius:6px;border:1px solid #0F5257;background:#fff;color:#0F5257;cursor:pointer}.ntf-btn.ntf-pri{background:#0F5257;color:#fff}' +
    '.ntf-btn[disabled]{opacity:.6;cursor:default}' +
    '#ntf-velo{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;padding:12px}' +
    '#ntf-finestra{background:#fff;color:#1d2b2c;border-radius:12px;max-width:560px;width:100%;max-height:calc(100vh - 24px);overflow:auto;padding:18px 20px;box-shadow:0 10px 40px rgba(0,0,0,.25);font:14px/1.5 system-ui,-apple-system,"Segoe UI",Arial,sans-serif}' +
    '#ntf-finestra h2{font-size:18px;margin:0 0 8px}#ntf-finestra .ntf-stato{padding:8px 10px;border-radius:8px;background:#eef4f4;margin:8px 0}' +
    '#ntf-finestra .ntf-registro{margin-top:8px}#ntf-finestra .ntf-registro ul{margin:6px 0;padding-left:18px;max-height:180px;overflow:auto}#ntf-finestra .ntf-registro li{margin:2px 0}' +
    '#ntf-finestra .ntf-ok{background:#e6f4ea}#ntf-finestra .ntf-no{background:#fdecea}#ntf-finestra ol{padding-left:20px;margin:6px 0}#ntf-finestra .ntf-aiuto{color:#5b6b6a;font-size:13px}' +
    'html[data-tema="scuro"] #ntf-scheda,html[data-tema="scuro"] #ntf-finestra{background:#1f2b2c;color:#e7eeee;border-color:#355}' +
    'html[data-tema="scuro"] #ntf-finestra .ntf-stato{background:#26393a}html[data-tema="scuro"] .ntf-btn{background:transparent;color:#9fd3d6;border-color:#9fd3d6}' +
    'html[data-tema="scuro"] .ntf-btn.ntf-pri{background:#0F5257;color:#fff}';
  document.head.appendChild(stile);

  function chiudiScheda() { var s = $('ntf-scheda'); if (s) s.parentNode.removeChild(s); }
  /** Scheda in basso: proposta di attivare (o, su iPhone fuori dalla schermata Home, come fare). */
  function proponi() {
    if ($('ntf-scheda') || S.chiesto) return;
    var no = Number(locale('pa_notif_no') || 0);
    if (no && Date.now() - no < 14 * 86400000) return;
    S.chiesto = true;
    var d = document.createElement('div');
    d.id = 'ntf-scheda'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-label', 'Notifiche');
    if (IOS && !STANDALONE) {
      d.innerHTML = '<b>Vuoi le notifiche anche su iPhone?</b>Su iPhone arrivano solo se l\'app è sulla schermata Home: tocca <strong>Condividi</strong> (il quadrato con la freccia in su) → ' +
        '<strong>Aggiungi alla schermata Home</strong>, poi apri l\'app da lì e accetta le notifiche.' +
        '<div class="ntf-bottoni"><button type="button" class="ntf-btn" id="ntf-no">Ho capito</button></div>';
    } else if (PUSH && Notification.permission === 'denied') {   // 8.26
      d.innerHTML = '<b>Le notifiche sono bloccate su questo ' + (ANDROID || IOS ? 'telefono' : 'computer') + '</b>Il browser non lascia arrivare gli avvisi dell\'app. ' + esc(comeSbloccare()) +
        ' Poi ricarica la pagina.<div class="ntf-bottoni"><button type="button" class="ntf-btn" id="ntf-no">Non ora</button><button type="button" class="ntf-btn ntf-pri" id="ntf-come">Come si fa</button></div>';
    } else {
      d.innerHTML = '<b>Vuoi le notifiche su questo ' + (ANDROID || IOS ? 'telefono' : 'computer') + '?</b>Quando arriva un\'email nelle tue aree, un messaggio o un promemoria, ' +
        'ti avvisa anche con l\'app chiusa e mette il numero sull\'icona. Si possono spegnere quando vuoi dal menu con il tuo nome.' +
        '<div class="ntf-bottoni"><button type="button" class="ntf-btn" id="ntf-no">Non ora</button><button type="button" class="ntf-btn ntf-pri" id="ntf-si">Attiva le notifiche</button></div>';
    }
    document.body.appendChild(d);
    $('ntf-no').onclick = function () { locale('pa_notif_no', String(Date.now())); chiudiScheda(); };
    if ($('ntf-come')) $('ntf-come').onclick = function () { chiudiScheda(); apriFinestra(''); aggiornaStato().then(function () { disegnaFinestra(); }); };
    if ($('ntf-si')) $('ntf-si').onclick = function () {
      var b = this; b.disabled = true; b.textContent = 'Attivazione…';
      attiva().then(function () { chiudiScheda(); avvisoBreve('Notifiche attive su questo dispositivo.'); })
        .catch(function (e) { chiudiScheda(); apriFinestra(String(e && e.message || e)); });
    };
  }
  function avvisoBreve(t, ms) {
    var d = document.createElement('div');
    d.id = 'ntf-scheda'; d.innerHTML = esc(t);
    chiudiScheda(); document.body.appendChild(d);
    setTimeout(function () { if ($('ntf-scheda') === d) chiudiScheda(); }, ms || 5000);
  }

  function comeSbloccare() {
    if (IOS) return 'Su iPhone: Impostazioni → Notifiche → Posta → attiva "Consenti notifiche" (e "Badge" per il numero sull\'icona).';
    if (ANDROID) return 'Su Android: tieni premuto sull\'icona dell\'app → Informazioni app (ⓘ) → Notifiche → attiva. Se usi l\'app dal browser: menu ⋮ → Impostazioni → Impostazioni sito → Notifiche.';
    return 'Sul computer: clic sull\'icona a sinistra dell\'indirizzo (o sui tre puntini dell\'app installata → Informazioni sull\'app) → Notifiche → Consenti. ' +
      'Controlla anche Windows: Impostazioni → Sistema → Notifiche → che Chrome o Edge (o l\'app Posta) siano accesi e che "Non disturbare" sia spento.';
  }
  /** Finestra "Notifiche su questo dispositivo". */
  function apriFinestra(messaggio) {
    chiudiScheda();
    var v = $('ntf-velo');
    if (v) v.parentNode.removeChild(v);
    v = document.createElement('div');
    v.id = 'ntf-velo';
    v.innerHTML = '<div id="ntf-finestra" role="dialog" aria-modal="true" aria-label="Notifiche"><h2>Notifiche su questo dispositivo</h2><div id="ntf-corpo">Controllo…</div>' +
      '<div class="ntf-bottoni" style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:12px" id="ntf-azioni"></div></div>';
    document.body.appendChild(v);
    v.onclick = function (ev) { if (ev.target === v) chiudiFinestra(); };
    disegnaFinestra(messaggio);
  }
  function chiudiFinestra() { var v = $('ntf-velo'); if (v) v.parentNode.removeChild(v); }
  function disegnaFinestra(messaggio) {
    var corpo = $('ntf-corpo'), az = $('ntf-azioni');
    if (!corpo) return;
    var stato = !PUSH ? 'senza' : Notification.permission === 'denied' ? 'bloccate' : S.iscrittoQui ? 'attive' : 'spente';
    var h = messaggio ? '<div class="ntf-stato ntf-no">' + esc(messaggio) + '</div>' : '';
    if (stato === 'senza') {
      h += IOS && !STANDALONE
        ? '<div class="ntf-stato">Su iPhone e iPad le notifiche arrivano solo se l\'app è aggiunta alla schermata Home.</div><ol><li>In Safari tocca <strong>Condividi</strong> (il quadrato con la freccia in su).</li>' +
          '<li>Scegli <strong>Aggiungi alla schermata Home</strong> → <strong>Aggiungi</strong>.</li><li>Chiudi Safari e apri <strong>Posta</strong> dall\'icona sulla schermata Home.</li>' +
          '<li>Accedi e premi <strong>Attiva le notifiche</strong>.</li></ol><p class="ntf-aiuto">Serve iOS 16.4 o più recente (Impostazioni → Generali → Info).</p>'
        : '<div class="ntf-stato ntf-no">Questo browser non gestisce le notifiche. Usa Chrome o Edge sul computer, Chrome su Android, Safari su iPhone.</div>';
    } else if (stato === 'bloccate') {
      h += '<div class="ntf-stato ntf-no">Le notifiche sono <strong>bloccate</strong> per l\'app in questo browser.</div><p>' + esc(comeSbloccare()) + '</p><p class="ntf-aiuto">Poi ricarica la pagina e torna qui.</p>';
    } else if (stato === 'attive') {
      var q = S.server && S.server.questo;
      h += '<div class="ntf-stato ntf-ok"><strong>Attive.</strong> Ti arriva un avviso per ogni novità della campanella (email delle tue aree, assegnazioni, messaggi, promemoria, ticket), ' +
        'anche con l\'app chiusa, e il numero compare sull\'icona.</div>' +
        (q ? '<p class="ntf-aiuto">Dispositivo: ' + esc(q.dispositivo) + (q.ultimo ? ' · ultimo avviso ' + esc(new Date(q.ultimo).toLocaleString('it-IT')) + ' (' + esc(q.esito) + ')' : '') + '</p>' : '') +
        '<p class="ntf-aiuto">Nell\'avviso ci sono solo chi scrive e l\'area, mai l\'oggetto o il testo. Le email arrivano subito dopo lo smistamento (di solito entro un minuto), messaggi e assegnazioni entro un minuto. ' +
        'Se la prova non arriva: ' + esc(comeSbloccare()) + '</p>';
      // 8.26.2: l'ultimo avviso è arrivato su questo dispositivo? (diario scritto da sw.js)
      var arr = esitoUltimoAvviso(S.diario), ora = function (t) { return new Date(t).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); };
      if (arr === 'no') h += '<div class="ntf-stato ntf-no"><strong>L\'ultimo avviso (' + esc(ora(q.ultimo)) + ') è partito ma questo dispositivo non l\'ha ricevuto.</strong> Google l\'ha accettato, ma il dispositivo non ha svegliato l\'app. ' + esc(comeSvegliare()) + '</div>';
      if (S.swNuovo && S.diario) {
        h += '<details class="ntf-registro"' + (arr === 'no' ? ' open' : '') + '><summary>Ricevuti da questo dispositivo</summary>' + (S.diario.length ? '<ul>' + S.diario.slice(0, 8).map(function (x) {
          return '<li><span class="ntf-aiuto">' + esc(ora(x.t)) + '</span> ' + (x.prova ? 'prova: ' : '') + esc(x.esito || '') + (x.server && x.server !== 'ok' ? ' <span class="ntf-aiuto">(risposta dell\'app: ' + esc(x.server) + ')</span>' : '') + '</li>';
        }).join('') + '</ul>' : '<p class="ntf-aiuto">Ancora nessuno (il diario parte dalla versione 8.26.2).</p>') + '</details>';
      }
    } else {
      h += '<div class="ntf-stato">Spente su questo dispositivo.</div><p>Con le notifiche attive ti arriva un avviso per ogni novità (email delle tue aree, assegnazioni, messaggi, promemoria, ticket), anche con l\'app chiusa, e il numero sull\'icona.</p>' +
        (IOS ? '' : '<p class="ntf-aiuto">Per un\'app vera e propria: ' + (ANDROID ? 'menu ⋮ di Chrome → <strong>Installa app</strong> (o Aggiungi a schermata Home).' : 'Chrome o Edge → icona <strong>Installa</strong> nella barra dell\'indirizzo (o menu → App → Installa questo sito come app).') + '</p>');
    }
    if (S.server && S.server.altri && S.server.altri.length) h += '<p class="ntf-aiuto">Attive anche su: ' + S.server.altri.map(function (x) { return esc(x.dispositivo); }).join(', ') + '.</p>';
    // 8.26: gli ultimi avvisi (mandati, saltati con il motivo, errori) e il giro di ogni minuto
    var sv = S.server || {};
    if (sv.giro && (S.iscrittoQui || (sv.altri || []).length)) {
      var vivo = sv.giro.ultimo ? Math.round((Date.now() - new Date(sv.giro.ultimo).getTime()) / 60000) : -1;
      h += '<p class="ntf-aiuto">Controllo delle novità: ' + (vivo < 0 ? 'non ancora partito (parte entro un minuto)' : vivo <= 2 ? 'attivo, ultimo ' + (vivo < 1 ? 'adesso' : vivo + ' min fa') :
        '<strong>fermo da ' + vivo + ' minuti</strong>: l\'app lo sta riavviando') + '.</p>';
    }
    if ((sv.registro || []).length) {
      var nomi = { INVIATO: 'mandato', SALTATO: 'non mandato', ERRORE: 'errore', INFO: '' };
      h += '<details class="ntf-registro"' + (sv.registro.some(function (x) { return x.tipo !== 'INVIATO' && x.tipo !== 'INFO'; }) ? ' open' : '') + '><summary>Ultimi avvisi</summary><ul>' +
        sv.registro.map(function (x) {
          return '<li><span class="ntf-aiuto">' + esc(new Date(x.t).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })) + '</span> ' +
            (nomi[x.tipo] ? '<strong>' + esc(nomi[x.tipo]) + '</strong>: ' : '') + esc(x.testo) + '</li>';
        }).join('') + '</ul></details>';
    }
    corpo.innerHTML = h;
    var bottoni = [];
    if (stato === 'spente') bottoni.push('<button type="button" class="ntf-btn ntf-pri" id="ntf-attiva">Attiva le notifiche</button>');
    if (stato === 'attive') bottoni.push('<button type="button" class="ntf-btn" id="ntf-spegni">Spegni su questo dispositivo</button>', '<button type="button" class="ntf-btn" id="ntf-rifai" title="Indirizzo push nuovo per questo dispositivo, poi una prova">Rifai la registrazione</button>', '<button type="button" class="ntf-btn ntf-pri" id="ntf-prova">Manda una prova</button>');
    bottoni.push('<button type="button" class="ntf-btn" id="ntf-chiudi">Chiudi</button>');
    az.innerHTML = bottoni.join('');
    $('ntf-chiudi').onclick = chiudiFinestra;
    var lavora = function (b, testo, fn) {
      b.disabled = true; b.textContent = testo;
      fn().then(function (m) { aggiornaStato().then(function () { disegnaFinestra(); if (m && typeof m === 'object') avvisoInFinestra(m.testo, m.ok); else if (m) avvisoInFinestra(m, true); }); })
        .catch(function (e) { aggiornaStato().then(function () { disegnaFinestra(String(e && e.message || e)); }); });
    };
    if ($('ntf-attiva')) $('ntf-attiva').onclick = function () { lavora(this, 'Attivazione…', function () { return attiva().then(function () { return 'Notifiche attive. Prova con "Manda una prova".'; }); }); };
    if ($('ntf-spegni')) $('ntf-spegni').onclick = function () { lavora(this, 'Spegnimento…', function () { return spegni().then(function () { return 'Notifiche spente su questo dispositivo.'; }); }); };
    // 8.26.2: la prova controlla da sola se questo dispositivo l'ha ricevuta
    if ($('ntf-prova')) $('ntf-prova').onclick = function () { lavora(this, 'Invio e controllo (fino a 25 secondi)…', provaVerificata); };
    if ($('ntf-rifai')) $('ntf-rifai').onclick = function () {
      lavora(this, 'Registrazione…', function () { locale('pa_notif_rifatta', String(Date.now())); return rifaiIscrizione().then(provaVerificata); });
    };
  }
  function avvisoInFinestra(t, ok) {
    var c = $('ntf-corpo');
    if (!c) return;
    var d = document.createElement('div');
    d.className = 'ntf-stato ' + (ok ? 'ntf-ok' : 'ntf-no'); d.textContent = t;
    c.insertBefore(d, c.firstChild);
  }
  function aggiornaStato() {
    var ep = Promise.resolve(null);
    if (PUSH) ep = iscrizioneAttuale().catch(function () { return null; });
    return ep.then(function (s) { return chiama('notificheStato', [token(), { endpoint: s ? s.endpoint : '' }]); })
      .then(function (st) { S.server = st; S.iscrittoQui = !!(st && st.questo && st.questo.attivo && S.sub); })
      .catch(function () { /* resta lo stato di prima */ })
      .then(function () { return PUSH ? versioneSw().then(function (v) { return v ? diarioLocale() : null; }).then(function (d) { S.diario = d; }) : null; })   // 8.26.2
      .catch(function () { /* senza diario */ });
  }

  /** Voce nel menu con il nome dell'utente (prima di "Cambia password"). */
  function aggiungiVoceMenu() {
    var menu = $('menu-utente-voci');
    if (!menu || $('voce-notifiche')) return;
    var b = document.createElement('button');
    b.id = 'voce-notifiche'; b.className = 'menu-voce'; b.type = 'button'; b.textContent = 'Notifiche su questo dispositivo';
    var prima = $('voce-password') || $('voce-esci');
    if (prima && prima.parentNode === menu) menu.insertBefore(b, prima); else menu.appendChild(b);
    b.onclick = function () {
      menu.hidden = true;
      if ($('menu-utente')) $('menu-utente').setAttribute('aria-expanded', 'false');
      apriFinestra('');
      aggiornaStato().then(function () { disegnaFinestra(); });
    };
  }

  // ============================ AVVIO ============================
  if ('serviceWorker' in navigator) registrazione().catch(function () { /* senza notifiche */ });
  function controlla() {
    var app = $('schermata-app');
    var dentro = !!(token() && app && !app.hidden);
    if (dentro && !S.dentro) { S.dentro = true; S.ultimaVista = 0; dopoAccesso(); }
    else if (!dentro && S.dentro) { S.dentro = false; S.chiesto = false; chiudiScheda(); impostaNumero(0); }
  }
  controlla();
  setInterval(controlla, 2500);
})();
