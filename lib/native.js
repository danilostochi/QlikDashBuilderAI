define(["qlik", "./appinfo", "./i18n"], function (qlik, appinfo, i18n) {
  "use strict";

  var T = i18n.T;

  // Objetos nativos do Qlik equivalentes a cada gráfico do catálogo (sem calor e funil nativos: viram pivô e barras).
  var NATIVE = {
    numero: "kpi", kpi: "kpi", linha: "linechart", area: "linechart", colunas: "barchart", ranking: "barchart",
    empilhado: "barchart", combo: "combochart", rosca: "piechart", medidor: "gauge", calor: "pivot-table",
    bolhas: "scatterplot", funil: "barchart", tabela: "table"
  };
  var NATIVE_MAX_MEAS = { kpi: 2, gauge: 1, piechart: 1, combochart: 2, scatterplot: 3 };
  // Altura dos blocos em linhas de uma pasta de 12 linhas por tela.
  var ROWS = { small: 2, medium: 4, large: 6 };

  function nativeCols(t, type) {
    var noDims = type === "kpi" || type === "gauge";
    var firstExpr = t.measures[0] && !t.measures[0].libraryId ? t.measures[0].expression : "";
    var dims = noDims ? [] : t.dimensions.map(function (d, i) {
      var sort = { qSortByNumeric: 1, qSortByAscii: 1, qSortByLoadOrder: 1 };
      if (t.sort === "none") sort = { qSortByLoadOrder: 1 };
      else if (i === 0 && firstExpr && (t.sort === "valueDesc" || t.sort === "valueAsc")) {
        sort = { qSortByExpression: t.sort === "valueAsc" ? 1 : -1, qExpression: { qv: firstExpr } };
      }
      var col = d.libraryId ? { qLibraryId: d.libraryId, qType: "dimension", qDef: { autoSort: false, qSortCriterias: [sort] } }
        : { qDef: { qFieldDefs: [d.field], qFieldLabels: [d.label || d.field], autoSort: false, qSortCriterias: [sort] } };
      col.qNullSuppression = true;
      if (i === 0 && t.limit > 0 && type !== "table") {
        col.qOtherTotalSpec = {
          qOtherMode: "OTHER_COUNTED", qOtherCounted: { qv: String(t.limit) }, qSuppressOther: true,
          qOtherSortMode: t.sort === "valueAsc" ? "OTHER_SORT_ASCENDING" : "OTHER_SORT_DESCENDING"
        };
      }
      return col;
    });
    var meas = t.measures.slice(0, NATIVE_MAX_MEAS[type] || 6).map(function (m, i) {
      var col = m.libraryId ? { qLibraryId: m.libraryId, qType: "measure", qDef: {} } : { qDef: { qDef: m.expression, qLabel: m.label } };
      if (type === "combochart") col.qDef.series = i === 0 ? { type: "bar", axis: 0 } : { type: "line", axis: 1 };
      return col;
    });
    return { dims: dims, meas: meas };
  }

  function nativeOptions(t, type, max) {
    var o = { title: t.title, showTitles: true };
    if (t.filterText) o.subtitle = T("Filtro: {f}", "Filter: {f}", { f: t.filterText });
    if (t.insight) o.footnote = t.insight;
    if (t.chart === "ranking" || t.chart === "funil") o.orientation = "horizontal";
    if (t.chart === "empilhado") o.barGrouping = { grouping: "stacked" };
    if (t.chart === "area") o.lineType = "area";
    if (t.chart === "rosca") o.donut = { showAsDonut: true };
    if (type === "gauge" && max > 0) o.measureAxis = { min: 0, max: max };
    return o;
  }

  // Propriedades mínimas, usadas quando o Qlik não deixa ler as propriedades completas do objeto de sessão.
  function manualProps(t, type, max) {
    var c = nativeCols(t, type);
    var strip = function (col) { var x = JSON.parse(JSON.stringify(col)); delete x.qType; return x; };
    var width = Math.max(c.dims.length + c.meas.length, 1);
    return Object.assign({
      qInfo: { qType: type },
      visualization: type,
      qHyperCubeDef: {
        qDimensions: c.dims.map(strip), qMeasures: c.meas.map(strip), qInterColumnSortOrder: [],
        qMode: type === "pivot-table" ? "P" : "S", qAlwaysFullyExpanded: true, qSuppressZero: !!t.filtered, qSuppressMissing: true,
        qInitialDataFetch: [{ qTop: 0, qLeft: 0, qWidth: width, qHeight: Math.floor(10000 / width) }]
      }
    }, nativeOptions(t, type, max));
  }

  function propsOf(vis) {
    var m = vis && vis.model;
    if (m && m.getProperties) return m.getProperties();
    if (m && m.enigmaModel && m.enigmaModel.getProperties) return m.enigmaModel.getProperties();
    return Promise.reject(new Error("sem getProperties"));
  }

  // Monta as propriedades completas do objeto como o Qlik faria ao arrastar o gráfico para a pasta:
  // cria um objeto de sessão, copia as propriedades e o descarta. Se o tipo não existir, usa tabela.
  function buildProps(app, t) {
    var type = NATIVE[t.chart];
    var maxExpr = t.target || (t.chart === "medidor" && t.measures[1] && !t.measures[1].libraryId ? t.measures[1].expression : "");
    var maxP = type === "gauge" && maxExpr ? appinfo.evaluate(app, maxExpr) : Promise.resolve(NaN);
    return maxP.then(function (max) {
      function create(ty) {
        var c = nativeCols(t, ty);
        return Promise.resolve(app.visualization.create(ty, c.dims.concat(c.meas), nativeOptions(t, ty, max))).then(function (vis) {
          return Promise.resolve(propsOf(vis)).then(function (p) {
            try { vis.close(); } catch (e) { /* já fechado */ }
            p = JSON.parse(JSON.stringify(p));
            p.qInfo = { qType: p.qInfo && p.qInfo.qType || ty };
            if (t.filtered && p.qHyperCubeDef) p.qHyperCubeDef.qSuppressZero = true;
            delete p.qMetaDef;
            return { type: ty, props: p };
          }, function () {
            try { vis.close(); } catch (e) { /* já fechado */ }
            return { type: ty, props: manualProps(t, ty, max) };
          });
        });
      }
      return create(type).then(null, function (err) {
        console.warn("DashBuilder AI: o Qlik recusou " + type + "; usando tabela.", err);
        return create("table");
      });
    });
  }

  function currentSheetId() {
    var nav = qlik.navigation, r = nav && nav.getCurrentSheetId && nav.getCurrentSheetId();
    return r && r.success !== false ? r.sheetId : null;
  }

  // Linhas da grade que cabem numa tela: o Qlik usa 12 linhas para 24 colunas (e proporcional nas outras grades).
  function screenRows(cols) { return Math.max(Math.round(cols / 2), 6); }

  // Agrupa os blocos em faixas (como a IA pensou o layout: cada faixa soma até 12 colunas).
  // Cada faixa ocupa a largura toda e os blocos de uma faixa ficam com a mesma altura.
  // Se o painel couber na tela, as faixas crescem para preencher o espaço visível sem rolagem.
  // left: colunas reservadas à esquerda (painel de filtros); os blocos ocupam o resto.
  function layoutBands(items, cols, top, unit, screen, left) {
    left = left || 0;
    var span = cols - left;
    var bands = [], cur = null;
    items.forEach(function (it) {
      if (!cur || cur.sum + it.w12 > 12) bands.push(cur = { items: [], sum: 0, h: 0 });
      cur.items.push(it);
      cur.sum += it.w12;
      cur.h = Math.max(cur.h, it.h);
    });
    var total = bands.reduce(function (s, b) { return s + b.h; }, 0), avail = screen - top;
    if (total > 0 && total < avail) {
      // Distribui as linhas que sobram proporcionalmente, sem passar do dobro da altura base.
      var acc = 0, given = 0;
      bands.forEach(function (b) {
        acc += b.h;
        var target = Math.round(acc / total * avail) - given;
        b.h = Math.max(Math.min(target, b.h * 2), b.h);
        given += b.h;
      });
    }
    var out = {}, row = top;
    bands.forEach(function (b) {
      var acc = 0;
      b.items.forEach(function (it) {
        var from = Math.round(acc / b.sum * span);
        acc += it.w12;
        out[it.key] = { row: row, col: left + from, colspan: Math.max(Math.round(acc / b.sum * span) - from, 1), rowspan: b.h };
      });
      row += b.h;
    });
    out.height = row - top;
    return out;
  }

  // Altura do painel HTML em linhas da grade, estimada pelos pixels que os blocos ocupam.
  function htmlRows(spec, screen) {
    var px = { small: 150, medium: 290, large: 400 }, sum = 0, total = 70, band = 0;
    spec.tiles.forEach(function (t) {
      if (sum + (+t.width) > 12) { total += band + 12; sum = 0; band = 0; }
      sum += +t.width;
      band = Math.max(band, px[t.height] || 290);
    });
    total += band + 30;
    var rowPx = Math.max((window.innerHeight || 900) - 160, 400) / screen;
    return Math.max(Math.ceil(total / rowPx), 3);
  }

  function setBounds(c, cols, rows) {
    c.bounds = { y: c.row / rows * 100, x: c.col / cols * 100, width: c.colspan / cols * 100, height: c.rowspan / rows * 100 };
  }

  function cellsOf(props, cols, rows) {
    return (props.cells || []).map(function (c) {
      if (c.col == null && c.bounds) {
        c.col = Math.round(c.bounds.x / 100 * cols); c.row = Math.round(c.bounds.y / 100 * rows);
        c.colspan = Math.max(Math.round(c.bounds.width / 100 * cols), 1); c.rowspan = Math.max(Math.round(c.bounds.height / 100 * rows), 1);
      }
      return c;
    });
  }

  function friendly(err) {
    var msg = err && err.message ? err.message : String(err);
    if (/access|denied|permission|5\d\d\b|read.?only|publish/i.test(msg) || (err && err.code === 5)) {
      return new Error(T("O Qlik não deixou criar objetos nesta pasta ({msg}). A pasta precisa ser sua e não publicada: duplique a pasta ou use uma pasta pessoal.",
        "Qlik did not allow creating objects on this sheet ({msg}). The sheet must be yours and not published: duplicate the sheet or use a personal sheet.", { msg: msg }));
    }
    return err instanceof Error ? err : new Error(msg);
  }

  var HTML_KEY = "__painel_html", SIDE_KEY = "__filtros";

  // Painel de filtros nativo (filterpane com uma listbox por campo), na coluna da esquerda.
  function filterPane(fields) {
    return {
      type: "filterpane",
      props: { qInfo: { qType: "filterpane" }, visualization: "filterpane", showTitles: false, title: "", qChildListDef: { qData: { info: "/qInfo" } } },
      after: function (pane) {
        return fields.reduce(function (p, f) {
          return p.then(function () {
            return pane.createChild({
              qInfo: { qType: "listbox" }, visualization: "listbox", title: f.label || f.field, showTitles: true,
              qListObjectDef: {
                qStateName: "$",
                qDef: { qFieldDefs: [f.field], qFieldLabels: [f.label || f.field], autoSort: true,
                  qSortCriterias: [{ qSortByState: 1, qSortByNumeric: 1, qSortByAscii: 1, qSortByLoadOrder: 1 }] },
                qShowAlternatives: true,
                qInitialDataFetch: [{ qTop: 0, qLeft: 0, qWidth: 1, qHeight: 10000 }]
              }
            });
          });
        }, Promise.resolve());
      }
    };
  }

  // Propriedades do objeto separado que mostra o painel em HTML (a própria extensão, no modo "dashboard").
  function htmlProps(o) {
    var md = Object.assign({}, o.cfg, { mode: "dashboard", dashboard: o.json, nativeObjects: "", iconOnly: false, bgMode: "auto" });
    return {
      qInfo: { qType: o.extType },
      visualization: o.extType,
      showTitles: false, title: "", subtitle: "", footnote: "",
      qHyperCubeDef: { qDimensions: [], qMeasures: [], qInitialDataFetch: [{ qWidth: 15, qHeight: 600 }], qSuppressZero: false, qSuppressMissing: true },
      md: md
    };
  }

  // Deixa a pasta atual com os objetos do painel, fora do assistente:
  //  - modo "qlik": um objeto nativo por bloco;
  //  - modo "html": um objeto da extensão no modo "somente painel" (o assistente pode ser excluído depois).
  // map = { sheetId, sig, items: { chave: { id, type, hash } } } guarda o que o assistente criou.
  // Itens que a IA não mudou não são tocados. Objetos apagados à mão (id null) só voltam se a IA mudar o bloco.
  // O layout é refeito quando os blocos entram, saem ou mudam de tamanho. spec null remove tudo.
  // o: { selfId, extType, cfg, json }
  function sync(app, spec, map, o) {
    var sheetId = currentSheetId();
    if (!sheetId) return Promise.reject(new Error(T("Não encontrei a pasta atual para criar os objetos.", "Could not find the current sheet to create the objects.")));
    map = map && map.sheetId === sheetId ? JSON.parse(JSON.stringify(map)) : { sheetId: sheetId, items: {} };
    // HTML Complexo não cria objetos na pasta (a página é externa).
    var items = !spec || !spec.tiles.length || spec.render === "simples" ? [] : spec.render === "qlik"
      ? spec.tiles.map(function (t) { return { key: t.id, tile: t, hash: JSON.stringify(t), w12: +t.width, hc: t.height }; })
      : [{ key: HTML_KEY, html: true, hash: o.json, w12: 12 }];
    // No modo nativo os filtros viram um painel de filtros do Qlik; no HTML eles ficam dentro do objeto do painel.
    if (spec && spec.render === "qlik" && spec.tiles.length && spec.sidebar.length) {
      items.push({ key: SIDE_KEY, side: true, fields: spec.sidebar, hash: JSON.stringify(spec.sidebar), w12: 0 });
    }
    if (!items.length && !Object.keys(map.items).length) return Promise.resolve({ map: map, created: 0, updated: 0, removed: 0 });
    var eng = appinfo.engine(app), sheet, count = { created: 0, updated: 0, removed: 0 };

    return Promise.resolve(eng.getObject(sheetId)).then(function (s) {
      sheet = s;
      return sheet.getProperties();
    }).then(function (props) {
      var cols = props.columns || 24, rows = props.rows || 12, unit = cols / 24, screen = screenRows(cols);
      var cells = cellsOf(props, cols, rows), before = JSON.stringify(cells.map(function (c) { return [c.name, c.row, c.col, c.colspan, c.rowspan]; }));
      var onSheet = {};
      cells.forEach(function (c) { onSheet[c.name] = c; });
      var wanted = {};
      items.forEach(function (it) { wanted[it.key] = it; });
      var steps = [], firstTime = !Object.keys(map.items).some(function (k) { return map.items[k].id && onSheet[map.items[k].id]; });

      Object.keys(map.items).forEach(function (key) {
        var it = map.items[key];
        if (it.id && !onSheet[it.id]) it.id = null; // apagado à mão
        if (wanted[key]) return;
        delete map.items[key];
        if (!it.id) return;
        cells = cells.filter(function (c) { return c.name !== it.id; });
        count.removed++;
        steps.push(function () { return Promise.resolve(sheet.destroyChild(it.id)).then(null, function () { /* já removido */ }); });
      });

      // Quais itens vão existir na pasta depois desta sincronização. Um objeto apagado à mão só
      // fica de fora se o resto do painel continua na pasta; se o painel todo sumiu, ele é refeito.
      var live = items.filter(function (it) {
        var m = map.items[it.key];
        return firstTime || !(m && !m.id && m.hash === it.hash);
      });
      live.forEach(function (it) { it.h = it.html ? htmlRows(spec, screen) : Math.max(Math.round((ROWS[it.hc] || 4) * unit), 1); });
      var sig = live.map(function (it) { return it.key + ":" + it.w12 + ":" + (it.html ? "h" : it.side ? "s" : it.hc); }).join("|");
      var relayout = firstTime || sig !== map.sig || live.some(function (it) { var m = map.items[it.key]; return !m || !m.id; });
      map.sig = sig;

      var managed = {};
      Object.keys(map.items).forEach(function (k) { if (map.items[k].id) managed[map.items[k].id] = true; });
      var spots = {};
      if (relayout) {
        // Na primeira montagem o assistente vira uma faixa fina no topo, para o painel ficar na tela.
        var self = onSheet[o.selfId], strip = Math.max(Math.round(screen / 12), 1);
        if (firstTime && self && self.rowspan > strip) self.rowspan = strip;
        var top = cells.reduce(function (m, c) { return managed[c.name] ? m : Math.max(m, c.row + c.rowspan); }, 0);
        var side = live.filter(function (it) { return it.side; })[0], left = side ? Math.max(Math.round(cols / 6), 2) : 0;
        spots = layoutBands(live.filter(function (it) { return !it.side; }), cols, top, unit, screen, left);
        if (side) spots[SIDE_KEY] = { row: top, col: 0, colspan: left, rowspan: Math.max(spots.height, Math.round(4 * unit)) };
      }

      live.forEach(function (it) {
        var m = map.items[it.key], spot = spots[it.key] || (m && m.id && onSheet[m.id]);
        var place = function (id, type) {
          var c = onSheet[id] || { name: id };
          if (!onSheet[id]) { cells.push(c); onSheet[id] = c; }
          c.name = id; c.type = type;
          if (spot) { c.row = spot.row; c.col = spot.col; c.colspan = spot.colspan; c.rowspan = spot.rowspan; }
        };
        if (m && m.id && m.hash === it.hash) { place(m.id, m.type); return; }
        steps.push(function () {
          var built = it.html ? Promise.resolve({ type: o.extType, props: htmlProps(o) })
            : it.side ? Promise.resolve(filterPane(it.fields)) : buildProps(app, it.tile);
          return built.then(function (b) {
            if (m && m.id && m.type === b.type && !it.side) {
              // Mesmo tipo: atualiza no lugar.
              return Promise.resolve(eng.getObject(m.id)).then(function (obj) {
                if (!it.html) { b.props.qInfo = { qId: m.id, qType: b.type }; return obj.setProperties(b.props); }
                return Promise.resolve(obj.getProperties()).then(function (p) {
                  p.md = Object.assign({}, p.md, { mode: "dashboard", dashboard: o.json });
                  return obj.setProperties(p);
                });
              }).then(function () {
                m.hash = it.hash;
                place(m.id, m.type);
                count.updated++;
              });
            }
            var old = m && m.id;
            var drop = old ? Promise.resolve(sheet.destroyChild(old)).then(null, function () { /* já removido */ }) : Promise.resolve();
            return drop.then(function () { return sheet.createChild(b.props); }).then(function (obj) {
              return b.after ? Promise.resolve(b.after(obj)).then(function () { return obj; }) : obj;
            }).then(function (obj) {
              var id = obj.id || (obj.qInfo && obj.qInfo.qId);
              if (old) {
                // Tipo trocado: o objeto novo herda o lugar do antigo.
                var prev = onSheet[old];
                cells = cells.filter(function (c) { return c.name !== old; });
                delete onSheet[old];
                if (prev && !spot) spot = prev;
                count.updated++;
              } else count.created++;
              map.items[it.key] = { id: id, type: b.type, hash: it.hash };
              place(id, b.type);
            });
          });
        });
      });

      return steps.reduce(function (p, step) { return p.then(step); }, Promise.resolve()).then(function () {
        var after = JSON.stringify(cells.map(function (c) { return [c.name, c.row, c.col, c.colspan, c.rowspan]; }));
        if (after === before) return;
        // createChild não mexe em "cells": a posição dos objetos é gravada aqui, numa única escrita.
        return Promise.resolve(sheet.getProperties()).then(function (latest) {
          var need = Math.max(cells.reduce(function (m, c) { return Math.max(m, c.row + c.rowspan); }, 0), screen);
          if (need > screen && latest.layoutOptions) latest.layoutOptions = Object.assign({}, latest.layoutOptions, { extendable: true });
          cells.forEach(function (c) { setBounds(c, cols, need); });
          latest.rows = need;
          latest.cells = cells;
          return sheet.setProperties(latest);
        });
      });
    }).then(function () {
      return { map: map, created: count.created, updated: count.updated, removed: count.removed, html: !!(spec && spec.render === "html") };
    }, function (err) {
      throw friendly(err);
    });
  }

  // O painel está fora do assistente (objetos nesta pasta)?
  function hasObjects(map) {
    return !!(map && map.sheetId === currentSheetId() && Object.keys(map.items || {}).some(function (k) { return map.items[k].id; }));
  }

  // O painel tinha objetos nesta pasta, mas todos foram apagados à mão?
  function missing(app, map) {
    if (!hasObjects(map)) return Promise.resolve(false);
    return Promise.resolve(appinfo.engine(app).getObject(map.sheetId)).then(function (sheet) {
      return sheet.getProperties();
    }).then(function (props) {
      var onSheet = {};
      (props.cells || []).forEach(function (c) { onSheet[c.name] = true; });
      return !Object.keys(map.items).some(function (k) { return map.items[k].id && onSheet[map.items[k].id]; });
    }).then(null, function () { return false; });
  }

  function describe(res) {
    if (res.html) {
      if (res.created) return T("Criei o painel num objeto separado nesta pasta. Quando terminar de usar o assistente, você pode excluí-lo: o painel continua.",
        "I created the panel in a separate object on this sheet. When you are done with the assistant, you can delete it: the panel stays.");
      if (res.updated) return T("Painel atualizado no objeto separado.", "Panel updated in the separate object.");
      return "";
    }
    var parts = [];
    if (res.created) parts.push(T("criados {n}", "{n} created", { n: res.created }));
    if (res.updated) parts.push(T("atualizados {n}", "{n} updated", { n: res.updated }));
    if (res.removed) parts.push(T("removidos {n}", "{n} removed", { n: res.removed }));
    if (!parts.length) return "";
    if (!res.created && !res.updated) return T("Objetos do painel anterior removidos da pasta.", "Objects from the previous panel removed from the sheet.");
    return T("Objetos nativos na pasta: {parts}.", "Native objects on the sheet: {parts}.", { parts: parts.join(", ") }) +
      (res.created ? T(" Eles ficam fora do assistente e podem ser ajustados normalmente no modo de edição.", " They live outside the assistant and can be adjusted normally in edit mode.") : "");
  }

  return { NATIVE: NATIVE, sync: sync, describe: describe, hasObjects: hasObjects, missing: missing, currentSheetId: currentSheetId };
});
