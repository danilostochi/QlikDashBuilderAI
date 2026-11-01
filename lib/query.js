define(["qlik", "./appinfo", "./filters", "./extract", "./i18n"], function (qlik, appinfo, filters, extract, i18n) {
  "use strict";

  var T = i18n.T;

  // Consultas do modo Conversa: a IA pede números ({ dimensions, measures, filters, series }), a extensão
  // calcula no Qlik e devolve uma tabela em texto para a IA responder com valores reais.
  // As consultas seguem as seleções atuais do app; o filtro da consulta entra por cima, via set analysis.
  // Com `series`, cada período é calculado isolado (como no HTML Complexo).
  // As mesmas tabelas ficam guardadas para o usuário copiar ou baixar em Excel.
  var MAX_QUERIES = 6, MAX_ROWS = 50, TIMEOUT = 60000;

  function str(v) { return v == null ? "" : String(v); }

  // years: anos citados na pergunta; períodos de outros anos não entram nas séries.
  function normalize(list, years) {
    return (Array.isArray(list) ? list : []).map(function (q) {
      q = q || {};
      return {
        label: str(q.label) || T("Consulta", "Query"),
        dimensions: (Array.isArray(q.dimensions) ? q.dimensions : []).map(str).map(function (d) { return d.trim(); }).filter(Boolean).slice(0, 2),
        measures: (Array.isArray(q.measures) ? q.measures : []).map(function (m) {
          return { expression: str(m && m.expression), label: str(m && m.label), libraryId: str(m && m.libraryId) };
        }).filter(function (m) { return m.expression || m.libraryId; }).slice(0, 6),
        filters: filters.normalize(q.filters),
        sort: ["valueDesc", "valueAsc", "dimAsc"].indexOf(q.sort) >= 0 ? q.sort : "dimAsc",
        limit: Math.min(Math.max(parseInt(q.limit, 10) || 0, 0), MAX_ROWS) || MAX_ROWS,
        series: q.series && str(q.series.field).trim() ? {
          field: str(q.series.field).trim(), label: str(q.series.label),
          values: (Array.isArray(q.series.values) ? q.series.values : []).map(str).filter(Boolean).slice(0, 60),
          years: years || []
        } : null
      };
    }).filter(function (q) { return q.measures.length || (q.dimensions.length && !q.series); }).slice(0, MAX_QUERIES);
  }

  function withTimeout(p, ms) {
    return new Promise(function (resolve, reject) {
      var t = setTimeout(function () { reject(new Error(T("o Qlik demorou demais para responder", "Qlik took too long to respond"))); }, ms);
      Promise.resolve(p).then(function (v) { clearTimeout(t); resolve(v); }, function (e) { clearTimeout(t); reject(e); });
    });
  }

  // Expressão final de cada medida: a medida mestre vira expressão quando há filtro (precisa receber o set).
  function expressions(app, q) {
    return Promise.all(q.measures.map(function (m) {
      var label = m.label || m.expression;
      if (!m.libraryId) return { expr: filters.apply(m.expression, q.filters, false), label: label };
      if (!q.filters.length) return { libraryId: m.libraryId, label: label };
      return appinfo.masterMeasure(app, m.libraryId).then(function (x) {
        return { expr: filters.apply(x.expr, q.filters, false), label: m.label || x.label };
      });
    }));
  }

  // Tabela: { head: [], rows: [[]], total: [] | null, note: "" }
  function asText(t) {
    var line = function (r) { return r.join(" | "); };
    return [line(t.head)].concat(t.rows.map(line), t.total ? [line(t.total)] : [], t.note ? [t.note] : []).join("\n");
  }

  // 0 dimensões: um valor por medida.
  function totals(app, q, ms) {
    return Promise.all(ms.map(function (m) {
      var p = m.expr != null ? Promise.resolve(m.expr)
        : appinfo.masterMeasure(app, m.libraryId).then(function (x) { return x.expr; });
      return p.then(function (e) { return appinfo.evaluateFull(app, e); }).then(function (r) { return r.text || "-"; });
    })).then(function (vals) {
      return { head: [T("Medida", "Measure"), T("Valor", "Value")], rows: ms.map(function (m, i) { return [m.label, vals[i]]; }), total: null, note: "" };
    });
  }

  function cube(app, q, ms) {
    // Só dimensões: lista os valores existentes (com o filtro da consulta) e quantos registros cada um tem.
    if (!ms.length) {
      var d0 = q.dimensions[0];
      ms = [{ expr: filters.apply(d0.charAt(0) === "=" ? "Sum(1)" : "Count(" + filters.field(d0) + ")", q.filters, false), label: T("Registros", "Records") }];
    }
    var nd = q.dimensions.length, byValue = q.sort === "valueDesc" || q.sort === "valueAsc";
    var def = {
      qDimensions: q.dimensions.map(function (d) {
        return { qDef: { qFieldDefs: [d], qFieldLabels: [d.replace(/^=/, "")], qSortCriterias: [{ qSortByNumeric: 1, qSortByAscii: 1, qSortByLoadOrder: 1 }] }, qNullSuppression: true };
      }),
      qMeasures: ms.map(function (m, i) {
        var sortBy = byValue && i === 0 ? { qSortByNumeric: q.sort === "valueDesc" ? -1 : 1 } : {};
        return m.libraryId ? { qLibraryId: m.libraryId, qDef: { qLabel: m.label }, qSortBy: sortBy } : { qDef: { qDef: m.expr, qLabel: m.label }, qSortBy: sortBy };
      }),
      qInterColumnSortOrder: byValue
        ? [nd].concat(q.dimensions.map(function (d, i) { return i; })).concat(ms.slice(1).map(function (m, i) { return nd + 1 + i; }))
        : q.dimensions.map(function (d, i) { return i; }).concat(ms.map(function (m, i) { return nd + i; })),
      qSuppressZero: q.filters.length > 0,
      qInitialDataFetch: [{ qTop: 0, qLeft: 0, qWidth: nd + ms.length, qHeight: q.limit }]
    };
    var id = null;
    return withTimeout(new Promise(function (resolve) {
      var p = app.createCube(def, function (layout) {
        id = layout.qInfo && layout.qInfo.qId;
        resolve(layout.qHyperCube);
      });
      if (p && p.then) p.then(function (m) { if (m && m.id) id = m.id; });
    }), TIMEOUT).then(function (hc) {
      if (id) try { app.destroySessionObject(id); } catch (e) { /* já removido */ }
      var rows = ((hc.qDataPages && hc.qDataPages[0] && hc.qDataPages[0].qMatrix) || []).map(function (r) {
        return r.map(function (c) { return c.qText != null ? c.qText : "-"; });
      });
      var total = (hc.qGrandTotalRow || []).map(function (c) { return c.qText; });
      var size = hc.qSize ? hc.qSize.qcy : rows.length;
      return {
        head: q.dimensions.map(function (d) { return d.replace(/^=/, ""); }).concat(ms.map(function (m) { return m.label; })),
        rows: rows,
        total: total.length && total.some(Boolean) ? [T("Total", "Total")].concat(q.dimensions.slice(1).map(function () { return ""; }), total) : null,
        note: size > rows.length ? T("… {n} de {total} linhas", "… {n} of {total} rows", { n: rows.length, total: size }) : ""
      };
    });
  }

  function series(app, q) {
    var spec = { filters: q.filters, render: "html" };
    var t = { series: q.series, measures: q.measures.map(function (m) { return { raw: m.expression, libraryId: m.libraryId, label: m.label }; }) };
    return extract.series(app, spec, t).then(function (r) {
      return {
        head: [q.series.label || q.series.field].concat(r.labels),
        rows: r.values.map(function (v, i) { return [v].concat(r.cells[i].map(function (c) { return c.text || "-"; })); }),
        total: null,
        note: r.method === "selecao"
          ? T("(cada período calculado isolado, selecionando um por vez no app)", "(each period calculated separately, selecting one at a time in the app)")
          : T("(cada período calculado isolado, por set analysis)", "(each period calculated separately, via set analysis)")
      };
    });
  }

  function runOne(app, q) {
    var name = q.label + (q.filters.length ? " (filtro: " + filters.describe(q.filters) + ")" : "");
    var job = q.series ? series(app, q) : expressions(app, q).then(function (ms) {
      return q.dimensions.length ? cube(app, q, ms) : totals(app, q, ms);
    });
    return job.then(function (t) {
      t.name = q.label;
      return { text: "### " + name + "\n" + asText(t), table: t };
    }, function (e) {
      return { text: "### " + name + "\nERRO: " + (e && e.message ? e.message : e), table: null };
    });
  }

  // Roda uma consulta de cada vez (as séries mexem nas seleções).
  // Devolve { text: o que vai para a IA, tables: as tabelas calculadas }.
  function run(list, onStep) {
    var app = qlik.currApp(), out = [], tables = [];
    return list.reduce(function (p, q, i) {
      return p.then(function () {
        if (onStep) onStep(T("Calculando no Qlik: {label} ({i} de {n})…", "Calculating in Qlik: {label} ({i} of {n})…", { label: q.label, i: i + 1, n: list.length }));
        return runOne(app, q);
      }).then(function (r) { out.push(r.text); if (r.table) tables.push(r.table); });
    }, Promise.resolve()).then(function () { return { text: out.join("\n\n"), tables: tables }; });
  }

  return { normalize: normalize, run: run };
});
