define(["./i18n"], function (i18n) {
  "use strict";

  var T = i18n.T;

  var MAX_FIELDS = 400, MAX_SAMPLED = 40, SAMPLE_SIZE = 5, SAMPLE_TIMEOUT = 8000, LIST_TIMEOUT = 10000, ENGINE_TIMEOUT = 30000;

  // Nenhuma chamada ao Qlik pode deixar o chat esperando para sempre.
  function withTimeout(promise, ms, message) {
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () { reject(new Error(message)); }, ms);
      Promise.resolve(promise).then(function (v) { clearTimeout(timer); resolve(v); }, function (e) { clearTimeout(timer); reject(e); });
    });
  }

  function engine(app) {
    var em = app && app.model && app.model.enigmaModel;
    if (!em) throw new Error(T("Este Qlik não expõe a API do engine para extensões (app.model.enigmaModel).", "This Qlik does not expose the engine API to extensions (app.model.enigmaModel)."));
    return em;
  }

  // Lê uma lista do Qlik uma única vez e descarta o objeto de sessão. Resolve null se falhar ou demorar.
  function listOnce(app, type) {
    return new Promise(function (resolve) {
      var done = false;
      function finish(reply) { if (!done) { done = true; resolve(reply); } }
      setTimeout(function () { if (!done) console.warn("DashBuilder AI: a lista " + type + " não respondeu."); finish(null); }, LIST_TIMEOUT);
      try {
        var p = app.getList(type, function (reply) {
          finish(reply);
          try { app.destroySessionObject(reply.qInfo.qId); } catch (e) { /* já removido */ }
        });
        if (p && p.then) p.then(null, function (e) { console.warn("DashBuilder AI: getList " + type + " falhou.", e); finish(null); });
      } catch (e) {
        console.warn("DashBuilder AI: getList " + type + " falhou.", e);
        finish(null);
      }
    });
  }

  function sampleValues(app, field) {
    return new Promise(function (resolve) {
      var done = false;
      setTimeout(function () { if (!done) { done = true; resolve([]); } }, SAMPLE_TIMEOUT);
      app.createCube({
        qDimensions: [{ qDef: { qFieldDefs: [field] }, qNullSuppression: true }],
        qInitialDataFetch: [{ qWidth: 1, qHeight: SAMPLE_SIZE }]
      }, function (reply) {
        if (done) return;
        done = true;
        var page = reply.qHyperCube.qDataPages[0];
        resolve(page ? page.qMatrix.map(function (r) { return r[0].qText; }) : []);
        try { app.destroySessionObject(reply.qInfo.qId); } catch (e) { /* já removido */ }
      });
    });
  }

  // Compara tags ignorando maiúsculas, pontos e espaços: "I.A", "i.a" e "IA" são a mesma tag.
  function normTag(t) { return String(t || "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
  function hasTag(tags, tag) {
    var want = normTag(tag);
    return !!want && (tags || []).some(function (t) { return normTag(t) === want; });
  }

  // Lista genérica via engine (itens mestres com tags e expressões), descartando o objeto depois.
  function sessionList(em, def, path) {
    return withTimeout(em.createSessionObject(def), ENGINE_TIMEOUT, T("tempo esgotado", "timed out")).then(function (obj) {
      return withTimeout(obj.getLayout(), ENGINE_TIMEOUT, T("tempo esgotado", "timed out")).then(function (layout) {
        try { em.destroySessionObject(obj.id); } catch (e) { /* já removido */ }
        return (layout[path] && layout[path].qItems) || [];
      });
    }).catch(function (e) {
      console.warn("DashBuilder AI: não foi possível ler " + path, e);
      return [];
    });
  }

  function masterMeasures(em) {
    return sessionList(em, {
      qInfo: { qType: "DashBuilderAIMeasureList" },
      qMeasureListDef: { qType: "measure", qData: { title: "/qMetaDef/title", description: "/qMetaDef/description", tags: "/qMetaDef/tags", expression: "/qMeasure/qDef", label: "/qMeasure/qLabel" } }
    }, "qMeasureList");
  }

  function masterDimensions(em) {
    return sessionList(em, {
      qInfo: { qType: "DashBuilderAIDimensionList" },
      qDimensionListDef: { qType: "dimension", qData: { title: "/qMetaDef/title", description: "/qMetaDef/description", tags: "/qMetaDef/tags", fields: "/qDim/qFieldDefs", grouping: "/qDim/qGrouping" } }
    }, "qDimensionList");
  }

  // Texto da variável de contexto (ex.: vContexto). Se a definição for uma fórmula, usa o valor calculado.
  function contextVariable(em, name) {
    if (!name) return Promise.resolve(null);
    return withTimeout(em.getVariableByName(name), ENGINE_TIMEOUT, T("tempo esgotado", "timed out")).then(function (v) {
      if (!v) return null;
      return withTimeout(Promise.all([v.getProperties(), v.getLayout()]), ENGINE_TIMEOUT, T("tempo esgotado", "timed out")).then(function (r) {
        var def = String((r[0] && r[0].qDefinition) || "");
        var text = def.charAt(0) === "=" ? String((r[1] && r[1].qText) || "") : def;
        return text.replace(/^'([\s\S]*)'$/, "$1").trim();
      });
    }).catch(function (e) {
      console.warn("DashBuilder AI: variável " + name + " não encontrada.", e);
      return null;
    });
  }

  function masterLine(it, extra) {
    var d = it.qData || {}, meta = it.qMeta || {};
    var title = d.title || meta.title || "", desc = d.description || meta.description || "";
    return "  - [" + it.qInfo.qId + "] " + title + (desc ? " — " + desc : "") + (extra ? " — " + extra : "");
  }

  // Lê o que a IA vai receber: variável de contexto, campos (os com a tag) e itens mestres com a tag.
  // opts: { tag: "I.A", contextVar: "vContexto" }
  // → { title, tag, contextVar, context (null = variável não existe), fields, tagged, allCount, measures, dims }
  function collect(app, opts) {
    var em;
    try { em = engine(app); } catch (e) { return Promise.reject(e); }
    var tag = opts.tag;
    return Promise.all([
      withTimeout(em.getAppLayout(), ENGINE_TIMEOUT, T("O Qlik demorou demais para informar os dados do app.", "Qlik took too long to report the app data.")),
      withTimeout(em.getTablesAndKeys({ qcx: 1000, qcy: 1000 }, { qcx: 0, qcy: 0 }, 30, true, false), ENGINE_TIMEOUT, T("O Qlik demorou demais para listar as tabelas do app.", "Qlik took too long to list the app tables.")),
      masterMeasures(em),
      masterDimensions(em),
      contextVariable(em, opts.contextVar)
    ]).then(function (r) {
      var layout = r[0], tables = (r[1] && (r[1].qtr || r[1])) || [], context = r[4];
      var all = [], seen = {};
      tables.forEach(function (t) {
        if (t.qIsSynthetic) return;
        (t.qFields || []).forEach(function (f) {
          if (seen[f.qName] || all.length >= MAX_FIELDS) return;
          seen[f.qName] = true;
          all.push({
            table: t.qName, rows: t.qNoOfRows, name: f.qName, distinct: f.qnTotalDistinctValues, comment: f.qComment || "",
            tags: (f.qTags || []).filter(function (x) { return x !== "$ascii"; }), key: f.qKeyType && f.qKeyType !== "NOT_KEY",
            tagged: hasTag(f.qTags, tag)
          });
        });
      });
      var tagged = all.filter(function (f) { return f.tagged; });
      return {
        title: layout.qTitle || "", tag: tag, contextVar: opts.contextVar, context: context,
        fields: tagged.length ? tagged : all, tagged: tagged.length > 0, allCount: all.length,
        measures: r[2].filter(function (it) { return hasTag(it.qData && it.qData.tags, tag); }),
        dims: r[3].filter(function (it) { return hasTag(it.qData && it.qData.tags, tag); })
      };
    });
  }

  // Monta o contexto que vai para a IA.
  // opts: { samples: bool, tag: "I.A", contextVar: "vContexto" }
  function describe(app, opts) {
    return collect(app, opts).then(function (info) {
      var tag = info.tag, context = info.context, fields = info.fields, measures = info.measures, dims = info.dims, tagged = info.tagged;
      var toSample = opts.samples ? fields.filter(function (f) {
        return !f.key && f.distinct > 0 && (f.tags.indexOf("$numeric") < 0 || f.tags.indexOf("$date") >= 0);
      }).slice(0, MAX_SAMPLED) : [];
      return Promise.all(toSample.map(function (f) { return sampleValues(app, f.name).then(function (v) { f.samples = v; }); })).then(function () {
        var out = ["Aplicativo: " + info.title];
        if (context) out.push("", "Contexto do app, escrito pelo dono do app (siga estas orientações):", context);

        out.push("", tagged.length
          ? "Campos selecionados para a IA (tag \"" + tag + "\"). Use somente estes campos:"
          : "Nenhum campo tem a tag \"" + tag + "\"; segue a lista completa de campos:");
        var lastTable = null;
        fields.forEach(function (f) {
          if (f.table !== lastTable) { out.push("- Tabela " + f.table + " (" + f.rows + " linhas)"); lastTable = f.table; }
          var sysTags = f.tags.filter(function (t) { return t.charAt(0) === "$"; });
          out.push("  - " + f.name + " [" + (sysTags.join(", ") || "sem tipo") + "] distintos=" + f.distinct + (f.key ? " (chave)" : "") +
            (f.comment ? " — " + f.comment : "") + (f.samples && f.samples.length ? " ex.: " + f.samples.join(" | ") : ""));
        });

        if (measures.length) {
          out.push("", "Medidas mestres oficiais (tag \"" + tag + "\"). Prefira estas a escrever expressões; use o id em libraryId:");
          measures.forEach(function (it) { out.push(masterLine(it, it.qData && it.qData.expression ? "expressão: " + it.qData.expression : "")); });
        }
        if (dims.length) {
          out.push("", "Dimensões mestres oficiais (tag \"" + tag + "\"). Use o id em libraryId:");
          dims.forEach(function (it) {
            var f = it.qData && it.qData.fields;
            out.push(masterLine(it, f && f.length ? "campo(s): " + f.join(", ") + (it.qData.grouping === "H" ? " (drill-down)" : "") : ""));
          });
        }
        console.info("DashBuilder AI IA: contexto com " + fields.length + " campo(s), " + measures.length + " medida(s) mestre, " + dims.length +
          " dimensão(ões) mestre" + (context ? " e a variável " + opts.contextVar : "") + ".");
        return out.join("\n");
      });
    });
  }

  function selections(app) {
    return listOnce(app, "SelectionObject").then(function (reply) {
      var list = reply && reply.qSelectionObject ? reply.qSelectionObject.qSelections : [];
      return list.map(function (s) { return s.qField + ": " + s.qSelected; });
    });
  }

  function badExpression(em, label, expr) {
    return withTimeout(em.checkExpression(expr), ENGINE_TIMEOUT, T("tempo esgotado", "timed out")).then(function (r) {
      var bad = r.qBadFieldNames && r.qBadFieldNames.length;
      if (!r.qErrorMsg && !bad) return null;
      return label + ": " + expr + " → " + (r.qErrorMsg || T("campo inexistente", "field does not exist"));
    }, function (e) { return label + ": " + expr + " → " + (e && e.message ? e.message : T("erro", "error")); });
  }

  // Valida no engine as expressões e campos do painel antes de desenhar.
  function checkDashboard(app, dashboard) {
    var em;
    try { em = engine(app); } catch (e) { return Promise.resolve([]); }
    var checks = [];
    (dashboard.tiles || []).forEach(function (t) {
      (t.dimensions || []).forEach(function (d) {
        if (d.libraryId) return;
        var f = String(d.field || "");
        checks.push(badExpression(em, t.title, f.charAt(0) === "=" ? f.slice(1) : "Count([" + f.replace(/]/g, "]]") + "])"));
      });
      (t.measures || []).forEach(function (m) {
        if (!m.libraryId) checks.push(badExpression(em, t.title, String(m.expression || "").replace(/^=/, "")));
      });
    });
    return Promise.all(checks).then(function (r) { return r.filter(Boolean); });
  }

  // Confere se cada valor do filtro do painel existe no campo (a IA às vezes erra maiúsculas ou acentos).
  function checkFilters(app, list) {
    var checks = [];
    (list || []).forEach(function (f) {
      var name = "[" + String(f.field).replace(/]/g, "]]") + "]";
      // Sem valores (campo da coluna de filtros): só confere se o campo existe.
      if (!(f.values || []).length) {
        checks.push(evaluate(app, "Count({1} DISTINCT " + name + ")").then(function (n) {
          return n > 0 ? null : T("Filtro: o campo \"{f}\" não existe ou está vazio.", "Filter: the field \"{f}\" does not exist or is empty.", { f: f.field });
        }));
      }
      (f.values || []).forEach(function (v) {
        var expr = "Count({1<" + name + "={'" + String(v).replace(/'/g, "''") + "'}>} DISTINCT " + name + ")";
        checks.push(evaluate(app, expr).then(function (n) {
          if (n > 0) return null;
          return isNaN(n) ? T("Filtro: o campo \"{f}\" não existe ou não pôde ser lido.", "Filter: the field \"{f}\" does not exist or could not be read.", { f: f.field })
            : T("Filtro: o valor \"{v}\" não existe no campo \"{f}\".", "Filter: the value \"{v}\" does not exist in the field \"{f}\".", { v: v, f: f.field });
        }));
      });
    });
    return Promise.all(checks).then(function (r) {
      return r.filter(Boolean).filter(function (e, i, a) { return a.indexOf(e) === i; });
    });
  }

  // Seleciona valores no app (seleção normal do Qlik: o usuário pode desmarcar depois).
  // Tenta pelo texto e, para códigos numéricos, também pelo número.
  function select(app, list) {
    var em = engine(app);
    return (list || []).reduce(function (p, s) {
      return p.then(function () { return em.getField(s.field); }).then(function (field) {
        var byText = s.values.map(function (v) { return { qText: String(v) }; });
        return Promise.resolve(field.selectValues(byText, false, false)).then(function (ok) {
          var nums = s.values.filter(function (v) { return /^-?\d+([.,]\d+)?$/.test(String(v).trim()); });
          if (ok !== false || !nums.length) return;
          return field.selectValues(nums.map(function (v) {
            return { qText: String(v), qIsNumeric: true, qNumber: parseFloat(String(v).replace(",", ".")) };
          }), false, false);
        });
      });
    }, Promise.resolve());
  }

  // Expressão de uma medida mestre (com o formato numérico dela), para calcular fora de um objeto.
  var masterCache = {};
  function masterMeasure(app, id) {
    if (!masterCache[id]) {
      masterCache[id] = Promise.resolve(engine(app).getMeasure(id)).then(function (m) { return m.getProperties(); }).then(function (p) {
        var q = p.qMeasure || {}, expr = String(q.qDef || "").replace(/^\s*=/, ""), f = q.qNumFormat;
        if (f && f.qFmt && f.qType && f.qType !== "U") {
          expr = "Num(" + expr + ", '" + f.qFmt.replace(/'/g, "''") + "', '" + (f.qDec || ",") + "', '" + (f.qThou || ".") + "')";
        }
        return { expr: expr, label: q.qLabel || (p.qMetaDef && p.qMetaDef.title) || "" };
      });
      masterCache[id].then(null, function () { delete masterCache[id]; });
    }
    return masterCache[id];
  }

  // Valor numérico e texto formatado de uma expressão.
  function evaluateFull(app, expr) {
    return Promise.resolve(engine(app).evaluateEx(String(expr).replace(/^\s*=/, ""))).then(function (r) {
      var v = r && (r.qValue || r) || {};
      return { num: typeof v.qNumber === "number" ? v.qNumber : NaN, text: v.qText != null ? String(v.qText) : "" };
    });
  }

  function evaluate(app, expr) {
    var s = String(expr || "").trim();
    if (!s) return Promise.resolve(NaN);
    if (/^-?[\d.,]+$/.test(s)) return Promise.resolve(parseFloat(s.indexOf(",") >= 0 ? s.replace(/\./g, "").replace(",", ".") : s));
    try {
      return engine(app).evaluateEx(s.replace(/^=/, "")).then(function (r) {
        var v = r && (r.qValue || r);
        return v && typeof v.qNumber === "number" ? v.qNumber : NaN;
      }, function () { return NaN; });
    } catch (e) { return Promise.resolve(NaN); }
  }

  return { collect: collect, engine: engine, checkFilters: checkFilters, select: select, masterMeasure: masterMeasure, evaluateFull: evaluateFull, describe: describe, selections: selections, checkDashboard: checkDashboard, evaluate: evaluate };
});
