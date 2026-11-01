define(["./appinfo", "./filters", "./session", "./i18n"], function (appinfo, filters, session, i18n) {
  "use strict";

  var T = i18n.T;

  // Extração período a período para indicadores consolidados (ex.: % turnover mensal).
  // Faz o que o usuário faria à mão: guarda as seleções num favorito temporário, aplica os filtros
  // fixos do painel como seleção, seleciona um período, guarda os valores, passa para o próximo e,
  // no fim, devolve as seleções do usuário. Assim medidas que dependem da seleção
  // (ex.: $(=Max(Competência)), GetFieldSelections, Only(Competência)) dão o valor certo de cada mês.
  // Os resultados ficam em cache na sessão e as extrações rodam uma de cada vez.
  var MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  // Também aceita os meses em inglês (jan, feb, apr, may, aug, sep, oct, dec…); os em português têm prioridade.
  var MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  function monthIndex(s) { var i = MESES.indexOf(s); return i >= 0 ? i : MONTHS.indexOf(s); }
  var MAX_PERIODS = 60;
  var cache = {}, queue = Promise.resolve(), listeners = [];

  function progress(text) { listeners.forEach(function (fn) { try { fn(text); } catch (e) { /* ignorado */ } }); }
  function listen(fn) {
    listeners.push(fn);
    return function () { listeners = listeners.filter(function (x) { return x !== fn; }); };
  }

  // Chave de ordenação de um período: 01/2026, 2026-01, jan/2026, Jan, 2026 ou número.
  function periodKey(v) {
    var s = String(v).trim().toLowerCase(), m;
    if ((m = /^(\d{1,2})[\/\-.](\d{4})$/.exec(s))) return +m[2] * 100 + +m[1];
    if ((m = /^(\d{4})[\/\-.](\d{1,2})$/.exec(s))) return +m[1] * 100 + +m[2];
    if ((m = /^((?:19|20)\d{2})(0[1-9]|1[0-2])$/.exec(s))) return +m[1] * 100 + +m[2];
    if ((m = /^([a-zç]{3})[a-zç]*[\/\-. ]?(\d{2,4})?$/.exec(s)) && monthIndex(m[1]) >= 0) {
      var y = m[2] ? (m[2].length === 2 ? 2000 + +m[2] : +m[2]) : 0;
      return y * 100 + monthIndex(m[1]) + 1;
    }
    var n = parseFloat(s.replace(",", "."));
    return isFinite(n) ? n : null;
  }

  // Ano de um período (01/2026, 2026-01, jan/26, 202601, 2026); null quando não dá para saber.
  function periodYear(v) {
    var k = periodKey(v);
    if (k == null) return null;
    if (k >= 190001 && k <= 210012) return Math.floor(k / 100);
    if (k >= 1900 && k <= 2100 && k === Math.floor(k)) return k;
    return null;
  }

  // Trava dos anos pedidos pelo usuário: períodos de outros anos não entram na série.
  function keepYears(values, years) {
    if (!years || !years.length) return values;
    return values.filter(function (v) { var y = periodYear(v); return y == null || years.indexOf(y) >= 0; });
  }

  // Valores pedidos pela IA, já sem os anos que o usuário não pediu. Sem nenhum, lista todos os do campo.
  function periodsOf(s, list) {
    var asked = keepYears(s.values, s.years);
    if (asked.length) return Promise.resolve(asked.slice(0, MAX_PERIODS));
    return list().then(function (all) { return keepYears(all, s.years).slice(0, MAX_PERIODS); });
  }

  function sortPeriods(values) {
    var keys = values.map(periodKey);
    if (keys.some(function (k) { return k == null; })) return values;
    return values.map(function (v, i) { return { v: v, k: keys[i] }; }).sort(function (a, b) { return a.k - b.k; }).map(function (x) { return x.v; });
  }

  function measures(app, t) {
    return Promise.all(t.measures.map(function (m) {
      if (!m.libraryId) return { expr: m.raw, label: m.label };
      return appinfo.masterMeasure(app, m.libraryId).then(function (x) { return { expr: x.expr, label: m.label || x.label }; });
    }));
  }

  // all: devolve todos (o corte em MAX_PERIODS vem depois da trava de anos).
  function listValues(app, field, base, ignore, all) {
    var f = filters.field(field);
    return appinfo.evaluateFull(app, filters.apply("Concat(DISTINCT " + f + ", '|', " + f + ")", base, ignore)).then(function (r) {
      var v = sortPeriods(r.text ? r.text.split("|").filter(Boolean) : []);
      return all ? v : v.slice(0, MAX_PERIODS);
    });
  }

  // Limpa as seleções, aplica os filtros fixos e seleciona um período por vez, guardando os valores.
  function walk(app, spec, t, method) {
    var em = appinfo.engine(app), s = t.series;
    var include = spec.filters.filter(function (f) { return !f.exclude && f.field !== s.field; });
    var exclude = spec.filters.filter(function (f) { return f.exclude && f.field !== s.field; });
    return Promise.all([measures(app, t), Promise.resolve(em.clearAll(false))]).then(function (r) {
      var ms = r[0];
      return appinfo.select(app, include).then(function () {
        return periodsOf(s, function () { return listValues(app, s.field, [], false, true); });
      }).then(function (values) {
        if (!values.length) throw new Error(T("Nenhum período encontrado em {f} com os filtros do painel.", "No period found in {f} with the dashboard filters.", { f: s.field }));
        var cells = [];
        return values.reduce(function (p, v, i) {
          return p.then(function () {
            progress(T("Filtrando {f} = {v} ({i} de {n}) e guardando os valores…", "Filtering {f} = {v} ({i} of {n}) and storing the values…", { f: s.field, v: v, i: i + 1, n: values.length }));
            return appinfo.select(app, [{ field: s.field, values: [v] }]);
          }).then(function () {
            return Promise.all(ms.map(function (m) { return appinfo.evaluateFull(app, filters.apply(m.expr, exclude, false)); }));
          }).then(function (row) { cells[i] = row; });
        }, Promise.resolve()).then(function () {
          return { values: values, labels: ms.map(function (m) { return m.label; }), cells: cells, method: method };
        });
      });
    });
  }

  // Caminho principal: uma sessão separada do app (identity), no estado padrão, com seleções próprias.
  // As seleções do usuário nem são tocadas.
  function bySession(spec, t) {
    progress(T("Abrindo uma sessão separada do app para filtrar sem mexer nas suas seleções…", "Opening a separate app session to filter without touching your selections…"));
    return session.use("serie", function (app) { return walk(app, spec, t, "sessao"); });
  }

  // Sem sessão separada: seleções reais na sessão do usuário, que são guardadas num favorito e devolvidas no fim.
  function bySelection(app, spec, t) {
    var em = appinfo.engine(app), bookmarkId = null;
    var restore = function () {
      if (!bookmarkId) return Promise.resolve();
      progress(T("Devolvendo as suas seleções…", "Restoring your selections…"));
      return Promise.resolve(em.applyBookmark(bookmarkId)).then(null, function (e) { console.warn("DashBuilder AI: restaurar seleções", e); })
        .then(function () { return em.destroyBookmark(bookmarkId); }).then(null, function () { /* já removido */ });
    };
    progress(T("Guardando as suas seleções…", "Saving your selections…"));
    return Promise.resolve(em.createBookmark({
      qInfo: { qType: "bookmark" },
      qMetaDef: {
        title: T("DashBuilder AI (temporário)", "DashBuilder AI (temporary)"),
        description: T("Criado e apagado automaticamente durante a extração do HTML Complexo.", "Created and deleted automatically during the Complex HTML extraction.")
      }
    })).then(function (bm) {
      bookmarkId = bm.id || (bm.qInfo && bm.qInfo.qId);
      if (!bookmarkId) throw new Error(T("O Qlik não devolveu o favorito temporário.", "Qlik did not return the temporary bookmark."));
      return walk(app, spec, t, "selecao");
    }).then(function (res) {
      return restore().then(function () { return res; });
    }, function (err) {
      return restore().then(function () { throw err; });
    });
  }

  // Alternativa sem mexer nas seleções (sem permissão para favoritos): set analysis por período.
  function bySet(app, spec, t) {
    var s = t.series, ignore = spec.render === "simples";
    var base = spec.filters.filter(function (f) { return f.field !== s.field; });
    return Promise.all([periodsOf(s, function () { return listValues(app, s.field, base, ignore, true); }), measures(app, t)]).then(function (r) {
      var values = r[0], ms = r[1];
      if (!values.length) throw new Error(T("Nenhum período encontrado em {f}.", "No period found in {f}.", { f: s.field }));
      return Promise.all(values.map(function (v) {
        var fl = base.concat([{ field: s.field, values: [v], exclude: false }]);
        return Promise.all(ms.map(function (m) { return appinfo.evaluateFull(app, filters.apply(m.expr, fl, ignore)); }));
      })).then(function (cells) {
        return { values: values, labels: ms.map(function (m) { return m.label; }), cells: cells, method: "set" };
      });
    });
  }

  // { values, labels, cells[periodo][medida] = { num, text }, method }
  function series(app, spec, t) {
    var key = JSON.stringify([spec.filters, t.series, t.measures.map(function (m) { return [m.raw, m.libraryId]; })]);
    if (cache[key]) return cache[key];
    var job = queue.then(function () {
      return bySession(spec, t).then(null, function (err) {
        console.warn("DashBuilder AI: sessão separada indisponível; filtrando na sessão do usuário.", err);
        return bySelection(app, spec, t);
      }).then(null, function (err) {
        console.warn("DashBuilder AI: extração por seleção falhou; usando set analysis por período.", err);
        progress(T("Não deu para selecionar no app; calculando cada período por set analysis…", "Could not select in the app; calculating each period via set analysis…"));
        return bySet(app, spec, t);
      });
    });
    queue = job.then(null, function () { /* a fila segue */ });
    cache[key] = job;
    job.then(function () { progress(""); }, function () { delete cache[key]; progress(""); });
    return job;
  }

  // Anos citados num texto ("2026", "jan/26" não conta): usados para travar as séries.
  function yearsIn(text) {
    var out = [];
    String(text || "").replace(/\b(19[5-9]\d|20\d{2})\b/g, function (m) { if (out.indexOf(+m) < 0) out.push(+m); return m; });
    return out;
  }

  return { series: series, listen: listen, sortPeriods: sortPeriods, yearsIn: yearsIn, keepYears: keepYears };
});
