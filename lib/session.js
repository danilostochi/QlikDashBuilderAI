define(["qlik", "./i18n"], function (qlik, i18n) {
  "use strict";

  var T = i18n.T;

  // Sessão própria do app, aberta com uma "identity" (o mesmo que abrir .../state/analysis/identity/x):
  // tem seleções independentes das do usuário, no estado padrão. O HTML Complexo e as séries período
  // a período calculam aqui, então a tela do usuário não pisca e as seleções dele não mudam.
  // Cada nome ("snap", "serie") é uma sessão; ela fecha quando o último uso termina.
  var OPEN_TIMEOUT = 30000;
  var uid = Math.random().toString(36).slice(2, 8), pool = {}, enabled = true;

  // Propriedade "Calcular numa sessão separada" (md.separateSession). Desligada, open() recusa e
  // quem chama cai no caminho da sessão do usuário (estado alternativo ou favorito temporário).
  function setEnabled(on) { enabled = on !== false; }

  function withTimeout(p, ms, msg) {
    return new Promise(function (resolve, reject) {
      var t = setTimeout(function () { reject(new Error(msg)); }, ms);
      Promise.resolve(p).then(function (v) { clearTimeout(t); resolve(v); }, function (e) { clearTimeout(t); reject(e); });
    });
  }

  function appId() {
    var a = qlik.currApp();
    return a && (a.id || (a.model && a.model.id)) || "";
  }

  // Espera o app da nova sessão abrir (o enigmaModel só existe depois disso).
  function whenOpen(app) {
    var w = app.model && app.model.waitForOpen;
    if (w && w.promise) return Promise.resolve(w.promise);
    return new Promise(function (resolve) {
      (function check() {
        if (app.model && app.model.enigmaModel) return resolve();
        setTimeout(check, 100);
      })();
    });
  }

  function open(name) {
    var s = pool[name];
    if (s) { s.refs++; return s.ready; }
    if (!enabled) return Promise.reject(new Error(T("sessão separada desligada nas propriedades do objeto", "separate session turned off in the object properties")));
    if (typeof qlik.openApp !== "function" || !appId()) return Promise.reject(new Error(T("o Qlik não permite abrir outra sessão aqui", "Qlik does not allow opening another session here")));
    s = pool[name] = { refs: 1, app: null };
    s.ready = Promise.resolve().then(function () {
      s.app = qlik.openApp(appId(), { identity: "dashbuilderai-" + name + "-" + uid });
      return withTimeout(whenOpen(s.app), OPEN_TIMEOUT, T("a sessão separada do app não abriu a tempo", "the separate app session did not open in time"));
    }).then(function () {
      // Uma sessão com a mesma identity pode ter sobrado: começa sempre sem seleções.
      return Promise.resolve(s.app.model.enigmaModel.clearAll(false)).then(function () { return s.app; });
    });
    s.ready.then(null, function () { close(name, s); });
    return s.ready;
  }

  function close(name, s) {
    if (pool[name] === s) delete pool[name];
    if (s.app) try { s.app.close(); } catch (e) { /* já fechada */ }
  }

  function release(name) {
    var s = pool[name];
    if (s && --s.refs <= 0) close(name, s);
  }

  // Roda fn(app) numa sessão separada e fecha a sessão no fim (com sucesso ou erro).
  function use(name, fn) {
    return open(name).then(function (app) {
      return Promise.resolve().then(function () { return fn(app); }).then(function (r) { release(name); return r; }, function (e) { release(name); throw e; });
    });
  }

  return { open: open, release: release, use: use, setEnabled: setEnabled };
});
