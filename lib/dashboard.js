define(["qlik", "./util", "./data", "./charts", "./tables", "./appinfo", "./filters", "./sidebar", "./extract", "./i18n"], function (qlik, u, data, charts, tables, appinfo, filters, sidebar, extract, i18n) {
  "use strict";

  var T = i18n.T;
  var esc = u.esc;
  var CHARTS = ["numero", "kpi", "linha", "area", "colunas", "ranking", "empilhado", "combo", "rosca", "medidor", "calor", "bolhas", "funil", "tabela"];
  var WIDTHS = ["3", "4", "6", "8", "12"];
  var HEIGHTS = { small: 150, medium: 290, large: 400 };
  var PALETTES = Object.keys(u.PALETTES);

  function str(v) { return v == null ? "" : String(v); }

  // Aceita só o que o renderizador sabe desenhar; o resto é descartado ou recebe um padrão.
  // O filtro do painel ("filters") já sai aplicado nas expressões das medidas e da meta.
  function normalize(spec) {
    if (!spec || !Array.isArray(spec.tiles)) return null;
    var ids = {}, fl = filters.normalize(spec.filters);
    var render = ["qlik", "simples"].indexOf(spec.render) >= 0 ? spec.render : "html";
    // Série por período só existe no HTML Complexo (cada período é calculado isolado e consolidado).
    if (spec.tiles.some(function (t) { return t && t.series && str(t.series.field).trim(); })) render = "simples";
    // HTML Complexo: todas as agregações ignoram as seleções do app ({1}).
    var fx = function (e) { return filters.apply(e, fl, render === "simples"); };
    return {
      filters: fl,
      filterText: filters.describe(fl),
      // Campos de filtro (seleções do app) na coluna da esquerda. O HTML Complexo é estático e não tem.
      sidebar: render === "simples" ? [] : sidebar.normalize(spec.sidebar),
      title: str(spec.title),
      subtitle: str(spec.subtitle),
      palette: PALETTES.indexOf(spec.palette) >= 0 ? spec.palette : "padrao",
      render: render,
      tiles: spec.tiles.filter(function (t) { return t && CHARTS.indexOf(t.chart) >= 0; }).map(function (t, i) {
        var id = str(t.id).replace(/[^\w-]/g, "") || "t" + i;
        while (ids[id]) id += "x";
        ids[id] = true;
        return {
          id: id,
          title: str(t.title),
          chart: t.chart,
          width: WIDTHS.indexOf(str(t.width)) >= 0 ? str(t.width) : "6",
          height: HEIGHTS[t.height] ? t.height : "medium",
          dimensions: (t.dimensions || []).slice(0, 3).map(function (d) { return { field: str(d.field), label: str(d.label), libraryId: str(d.libraryId) }; }),
          measures: (t.measures || []).slice(0, 6).map(function (m) { return { expression: fx(str(m.expression)), raw: str(m.expression), label: str(m.label), libraryId: str(m.libraryId) }; }),
          series: t.series && str(t.series.field).trim() ? {
            field: str(t.series.field).trim(), label: str(t.series.label),
            values: (Array.isArray(t.series.values) ? t.series.values : []).map(str).filter(Boolean).slice(0, 60),
            years: (Array.isArray(t.series.years) ? t.series.years : []).map(Number).filter(function (y) { return y >= 1900 && y <= 2100; })
          } : null,
          sort: ["valueDesc", "valueAsc", "dimAsc", "none"].indexOf(t.sort) >= 0 ? t.sort : "none",
          limit: Math.min(Math.max(parseInt(t.limit, 10) || 0, 0), 1000),
          target: fx(str(t.target)),
          insight: str(t.insight),
          filtered: fl.length > 0 || render === "simples",
          filterText: filters.describe(fl)
        };
      })
    };
  }

  function parse(json) {
    if (!json) return null;
    try { return normalize(JSON.parse(json)); } catch (e) { return null; }
  }

  function cubeDef(t, stateName) {
    var byValue = t.sort === "valueDesc" || t.sort === "valueAsc";
    var dimSort = t.sort === "none" ? { qSortByLoadOrder: 1 } : { qSortByNumeric: 1, qSortByAscii: 1, qSortByLoadOrder: 1 };
    var dims = t.dimensions.map(function (d) {
      if (d.libraryId) return { qLibraryId: d.libraryId, qNullSuppression: true, qDef: { qSortCriterias: [dimSort] } };
      return { qDef: { qFieldDefs: [d.field], qFieldLabels: [d.label || d.field], qSortCriterias: [dimSort] }, qNullSuppression: true };
    });
    var meas = t.measures.map(function (m) {
      var sortBy = { qSortByNumeric: t.sort === "valueAsc" ? 1 : -1 };
      if (m.libraryId) return { qLibraryId: m.libraryId, qSortBy: sortBy };
      return { qDef: { qDef: m.expression, qLabel: m.label }, qSortBy: sortBy };
    });
    var order = [], i;
    if (byValue && meas.length) { order.push(dims.length); for (i = 0; i < dims.length; i++) order.push(i); for (i = 1; i < meas.length; i++) order.push(dims.length + i); }
    else { for (i = 0; i < dims.length + meas.length; i++) order.push(i); }
    var width = Math.max(dims.length + meas.length, 1);
    return {
      qDimensions: dims,
      qMeasures: meas,
      qInterColumnSortOrder: order,
      qSuppressZero: !!t.filtered, // com filtro, some com os itens que ficaram de fora
      qSuppressMissing: true,
      qStateName: stateName || undefined,
      qInitialDataFetch: [{ qTop: 0, qLeft: 0, qWidth: width, qHeight: Math.min(t.limit || 500, Math.floor(10000 / width)) }]
    };
  }

  // Série por período: a medida é calculada uma vez por período (o módulo extract seleciona cada
  // período no app, guarda os valores e devolve as seleções do usuário) e os resultados viram as
  // linhas do bloco. Serve para indicadores que não podem ser segmentados por período (ex.: % turnover).
  function loadSeries(state, root, t, cfg, gen, spec, app) {
    extract.series(app, spec, t).then(function (r) {
      if (gen !== state.gen) return;
      var rows = r.values.map(function (v, i) {
        return [{ qText: v, qNum: NaN, qElemNumber: i }].concat(r.cells[i].map(function (c) { return { qText: c.text, qNum: c.num, qElemNumber: 0 }; }));
      });
      state.models[t.id] = data.buildModel({
        qDimensionInfo: [{ qFallbackTitle: t.series.label || t.series.field }],
        qMeasureInfo: r.labels.map(function (l) { return { qFallbackTitle: l }; }),
        qSize: { qcy: rows.length }, qGrandTotalRow: []
      }, rows);
      state.seriesMethod = r.method;
      drawTile(state, root, t, cfg);
    }).then(null, function (err) {
      if (gen !== state.gen) return;
      state.failed[t.id] = true;
      var node = root.querySelector('[data-tile-body="' + t.id + '"]');
      if (node && !state.summary) node.innerHTML = '<div class="md-error">' + esc(err && err.message ? err.message : T("Erro ao calcular a série.", "Error calculating the series.")) + "</div>";
    });
  }

  function newState() { return { gen: 0, key: null, spec: null, cubes: [], objs: {}, models: {}, targets: {}, failed: {} }; }

  function destroy(state) {
    state.gen++;
    var app = state.app || qlik.currApp();
    state.cubes.forEach(function (id) { try { app.destroySessionObject(id); } catch (e) { /* já removido */ } });
    state.cubes = [];
    state.objs = {};
    state.models = {};
    state.targets = {};
    state.failed = {};
    state.key = null;
  }

  function tileHtml(t) {
    return '<div class="md-tile" data-tile="' + t.id + '" style="grid-column: span ' + t.width + "; height: " + HEIGHTS[t.height] + 'px">' +
      (t.chart === "numero" ? "" : '<div class="md-tile-head">' + esc(t.title) + "</div>") +
      '<div class="md-tile-body' + (t.chart === "tabela" ? " md-scroll" : "") + '" data-tile-body="' + t.id + '"><div class="md-msg">' + T("Carregando…", "Loading…") + "</div></div>" +
      (t.insight ? '<div class="md-tile-note">' + esc(t.insight) + "</div>" : "") + "</div>";
  }

  function drawTile(state, root, t, cfg) {
    var node = root.querySelector('[data-tile-body="' + t.id + '"]'), model = state.models[t.id];
    if (!node || !model || state.summary) return;
    if (t.chart === "tabela") { node.innerHTML = tables.table(model); return; }
    node.innerHTML = charts.render(t.chart, model, {
      palette: state.spec.palette || cfg.palette,
      customColors: cfg.customColors,
      target: state.targets[t.id],
      topN: t.limit || 10,
      showValues: cfg.showValues,
      barWidth: cfg.barWidth,
      lineWidth: cfg.lineWidth,
      ringWidth: cfg.ringWidth
    }, node.clientWidth || 300, node.clientHeight || HEIGHTS[t.height] - 40);
  }

  function emptyHtml() {
    return '<div class="md-empty"><div class="md-empty-icon">✨</div><b>' + T("Seu painel ainda está vazio", "Your panel is still empty") + "</b>" +
      "<span>" + T("Abra o assistente e peça, por exemplo: “analise meus dados e crie um painel executivo”.", "Open the assistant and ask, for example: “analyze my data and create an executive panel”.") + "</span>" +
      '<button class="md-ai-send" data-ai-open="1">' + T("Abrir assistente", "Open assistant") + "</button></div>";
  }

  // Quando o painel está em outros objetos da pasta, o assistente vira uma faixa com o resumo.
  function summaryHtml(spec) {
    var simple = spec.render === "simples";
    var text = spec.render === "qlik"
      ? T("{n} objeto(s) nativo(s) do Qlik nesta pasta · ajuste no modo de edição ou peça ao assistente", "{n} native Qlik object(s) on this sheet · adjust them in edit mode or ask the assistant", { n: spec.tiles.length })
      : simple ? T("HTML Complexo com dados fixos, que não mudam com as seleções do Qlik · baixe ou abra pelo assistente", "Complex HTML with fixed data that does not change with Qlik selections · download or open it from the assistant")
      : T("Painel num objeto separado nesta pasta · quando terminar, você pode excluir este assistente", "Panel in a separate object on this sheet · when you are done, you can delete this assistant");
    if (spec.filterText) text = "🔎 " + spec.filterText + " · " + text;
    return '<div class="md-sum"><span class="md-sum-icon">' + (spec.render === "qlik" ? "📊" : simple ? "🧩" : "🎨") + "</span>" +
      '<div class="md-sum-text"><b>' + esc(spec.title || T("Painel", "Panel")) + "</b><span>" + esc(text) + "</span></div>" +
      '<button class="md-ai-send" data-ai-open="1">✨ ' + T("Abrir assistente", "Open assistant") + "</button></div>";
  }

  // Desenha o painel inteiro e cria um cubo por bloco. Cada cubo chama de volta a cada seleção.
  // opts.summary: o painel está em outros objetos da pasta; aqui fica só o resumo (os cubos
  // continuam, para a IA receber os valores). opts.standalone: objeto "somente painel", sem assistente.
  function mount(state, root, json, cfg, opts) {
    destroy(state);
    opts = opts || {};
    var spec = parse(json), gen = state.gen, app = opts.app || qlik.currApp();
    state.app = app;
    state.key = json || "";
    state.spec = spec;
    state.summary = !!(opts.summary && spec && spec.tiles.length);
    if (!spec || !spec.tiles.length) {
      root.innerHTML = opts.standalone ? '<div class="md-msg">' + T("Painel vazio. Gere o painel pelo assistente ou cole o JSON nas propriedades.", "Empty panel. Generate the panel with the assistant or paste the JSON in the properties.") + "</div>" : emptyHtml();
      return;
    }
    var useSide = !state.summary && !opts.noSidebar && spec.sidebar.length > 0;
    if (state.summary) root.innerHTML = summaryHtml(spec);
    else root.innerHTML = '<div class="md-p-head">' + (spec.title ? "<h2>" + esc(spec.title) + "</h2>" : "") + (spec.subtitle ? "<p>" + esc(spec.subtitle) + "</p>" : "") +
      (spec.filterText ? '<div class="md-filter" title="' + esc(T("Filtro fixo do painel, somado às seleções do app", "Fixed panel filter, combined with the app selections")) + '">🔎 ' + esc(spec.filterText) + "</div>" : "") +
      "</div>" + (useSide ? '<div class="md-body">' + sidebar.shellHtml(spec.sidebar) : "") +
      '<div class="md-grid">' + spec.tiles.map(tileHtml).join("") + "</div>" + (useSide ? "</div>" : "");
    root.classList.toggle("md-narrow", root.clientWidth < 700);
    if (useSide) sidebar.mount(state, root, spec.sidebar, gen);
    spec.tiles.forEach(function (t) {
      if (t.target) appinfo.evaluate(app, t.target).then(function (v) {
        if (gen !== state.gen) return;
        state.targets[t.id] = v;
        drawTile(state, root, t, cfg);
      });
      if (t.series) return loadSeries(state, root, t, cfg, gen, spec, app);
      app.createCube(cubeDef(t, opts.stateName), function (reply) {
        if (gen !== state.gen) return;
        var hc = reply.qHyperCube, page = hc.qDataPages[0];
        state.models[t.id] = data.buildModel(hc, page ? page.qMatrix : []);
        drawTile(state, root, t, cfg);
      }).then(function (obj) {
        if (gen !== state.gen) { try { app.destroySessionObject(obj.id); } catch (e) { /* já removido */ } return; }
        state.cubes.push(obj.id);
        state.objs[t.id] = obj;
      }, function (err) {
        state.failed[t.id] = true;
        var node = root.querySelector('[data-tile-body="' + t.id + '"]');
        if (node) node.innerHTML = '<div class="md-error">' + esc(err && err.message ? err.message : T("Erro ao criar o bloco.", "Error creating the block.")) + "</div>";
      });
    });
  }

  function redraw(state, root, cfg) {
    if (!state.spec) return;
    root.classList.toggle("md-narrow", root.clientWidth < 700);
    state.spec.tiles.forEach(function (t) { drawTile(state, root, t, cfg); });
  }

  function select(state, tileId, dimIdx, elem) {
    var obj = state.objs[tileId];
    if (obj && obj.selectHyperCubeValues) return obj.selectHyperCubeValues("/qHyperCubeDef", dimIdx, [elem], true);
  }

  // Resumo dos valores que cada bloco está mostrando, para a IA comentar números reais.
  function snapshot(state) {
    if (!state.spec) return "";
    return state.spec.tiles.map(function (t) {
      var m = state.models[t.id];
      if (!m) return "";
      var head = m.dims.concat(m.meas).map(function (c) { return c.label; }).join(" | ");
      var rows = m.rows.slice(0, 15).map(function (r) { return r.map(function (c) { return c.qText; }).join(" | "); });
      return "### " + (t.title || t.id) + " (" + t.chart + ")\n" + head + "\n" + rows.join("\n") + (m.rows.length > 15 ? "\n… (" + T("{n} linhas", "{n} rows", { n: m.rows.length }) + ")" : "");
    }).filter(Boolean).join("\n\n");
  }

  // Resolve quando todos os blocos receberam dados (e meta) ou falharam. Usado para gerar o HTML Complexo.
  function whenReady(state, timeout) {
    var gen = state.gen, start = Date.now();
    return new Promise(function (resolve) {
      (function check() {
        var spec = state.spec;
        if (gen !== state.gen || !spec) return resolve(false);
        var done = spec.tiles.every(function (t) {
          return state.failed[t.id] || (state.models[t.id] && (!t.target || t.id in state.targets));
        });
        if (done || Date.now() - start > (timeout || 60000)) return resolve(done);
        setTimeout(check, 150);
      })();
    });
  }

  return { CHARTS: CHARTS, newState: newState, mount: mount, whenReady: whenReady, redraw: redraw, destroy: destroy, select: select, snapshot: snapshot, parse: parse };
});
