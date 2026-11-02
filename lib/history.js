define([], function () {
  "use strict";

  // Histórico de conversas do assistente, só no navegador (localStorage), sem banco de dados.
  // O localStorage do Qlik Cloud é dividido com o próprio Qlik, então o histórico tem teto:
  // até MAX_PER_APP conversas por app, MAX_ENTRY bytes por conversa e MAX_TOTAL no total.
  var KEY = "qdashbuilder.history", MAX_PER_APP = 15, MAX_ENTRY = 300000, MAX_TOTAL = 1500000;

  function readAll() {
    try {
      var list = JSON.parse(localStorage.getItem(KEY) || "[]");
      return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
  }

  // Grava descartando as conversas mais antigas até caber no teto e na cota do navegador.
  function writeAll(list) {
    list.sort(function (a, b) { return b.at - a.at; });
    var text = JSON.stringify(list);
    while (list.length && text.length > MAX_TOTAL) { list.pop(); text = JSON.stringify(list); }
    for (;;) {
      try {
        if (list.length) localStorage.setItem(KEY, text); else localStorage.removeItem(KEY);
        return true;
      } catch (e) {
        if (!list.length) return false;
        list.pop();
        text = JSON.stringify(list);
      }
    }
  }

  // Imagens anexadas não são guardadas (chegam a 5 MB); fica só a marca no texto.
  function noImages(history) {
    return (history || []).map(function (m) {
      if (m.role !== "user" || !Array.isArray(m.parts)) return m;
      return { role: "user", parts: m.parts.map(function (p) { return p.type === "image" ? { type: "text", text: "(imagem anexada, não guardada no histórico)" } : p; }) };
    });
  }

  // Conversa grande: primeiro sai o contexto da IA (a conversa ainda pode ser lida),
  // depois as tabelas completas do Qlik. Se nem assim couber, não é guardada.
  function compact(entry) {
    var e = Object.assign({}, entry, { history: noImages(entry.history) });
    if (JSON.stringify(e).length <= MAX_ENTRY) return e;
    e.history = [];
    e.noContext = true;
    if (JSON.stringify(e).length <= MAX_ENTRY) return e;
    e.log = e.log.map(function (m) { return m.tables && m.tables.length ? Object.assign({}, m, { tables: [] }) : m; });
    return JSON.stringify(e).length <= MAX_ENTRY ? e : null;
  }

  function list(appId) {
    return readAll().filter(function (e) { return e.appId === appId; }).sort(function (a, b) { return b.at - a.at; });
  }

  function get(id) {
    return readAll().filter(function (e) { return e.id === id; })[0] || null;
  }

  // entry: { id, appId, title, provider, log, history, reports }
  function save(entry) {
    var e = compact(Object.assign({}, entry, { at: Date.now() }));
    if (!e) return false;
    var all = readAll().filter(function (x) { return x.id !== e.id; });
    var same = all.filter(function (x) { return x.appId === e.appId; }).sort(function (a, b) { return b.at - a.at; });
    var drop = same.slice(MAX_PER_APP - 1).map(function (x) { return x.id; });
    all = all.filter(function (x) { return drop.indexOf(x.id) < 0; });
    all.push(e);
    return writeAll(all);
  }

  function remove(id) {
    writeAll(readAll().filter(function (e) { return e.id !== id; }));
  }

  function clear(appId) {
    writeAll(readAll().filter(function (e) { return e.appId !== appId; }));
  }

  function newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  return { list: list, get: get, save: save, remove: remove, clear: clear, newId: newId, MAX_PER_APP: MAX_PER_APP };
});
