define(["qlik", "./util", "./ai", "./appinfo", "./dashboard", "./extract", "./query", "./xlsx", "./i18n"], function (qlik, u, ai, appinfo, dash, extract, query, xlsx, i18n) {
  "use strict";

  var esc = u.esc;
  var T = i18n.T;
  var IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
  // Textos da tela resolvidos na hora de desenhar (o idioma pode mudar entre um paint e outro).
  function suggestions(kind) {
    return kind === "chat"
      ? [T("Quais campos e medidas eu tenho neste app?", "Which fields and measures do I have in this app?"),
        T("Resuma os principais números do app agora", "Summarize the app's key numbers right now"),
        T("Quais são os 5 maiores valores e quanto cada um representa do total?", "What are the top 5 values and how much of the total does each one represent?")]
      : [T("Analise meus dados e crie um painel executivo", "Analyze my data and create an executive dashboard"),
        T("Crie um painel por mês e por região, com ranking dos 10 maiores", "Create a dashboard by month and region, with a top 10 ranking"),
        T("Monte uma visão só de uma região (diga qual)", "Build a view of a single region (tell me which)")];
  }

  var STR = { type: "string" };
  var ITEM = function (props) {
    return { type: "object", additionalProperties: false, required: Object.keys(props), properties: props };
  };
  var FILTER = ITEM({ field: STR, values: { type: "array", items: STR }, exclude: { type: "boolean" } });
  var SERIES = ITEM({ field: STR, label: STR, values: { type: "array", items: STR } });
  var MEASURE = ITEM({ expression: STR, label: STR, libraryId: STR });
  var SPEC_SCHEMA = ITEM({
    reply: STR,
    changed: { type: "boolean" },
    queries: {
      type: "array",
      items: ITEM({
        label: STR,
        dimensions: { type: "array", items: STR },
        measures: { type: "array", items: MEASURE },
        filters: { type: "array", items: FILTER },
        sort: { type: "string", enum: ["valueDesc", "valueAsc", "dimAsc"] },
        limit: { type: "integer" },
        series: SERIES
      })
    },
    selections: { type: "array", items: ITEM({ field: STR, values: { type: "array", items: STR } }) },
    useSimples: { type: "boolean" },
    dashboard: ITEM({
      title: STR,
      subtitle: STR,
      palette: { type: "string", enum: Object.keys(u.PALETTES) },
      filters: { type: "array", items: FILTER },
      sidebar: { type: "array", items: ITEM({ field: STR, label: STR }) },
      tiles: {
        type: "array",
        items: ITEM({
          id: STR,
          title: STR,
          chart: { type: "string", enum: dash.CHARTS },
          width: { type: "string", enum: ["3", "4", "6", "8", "12"] },
          height: { type: "string", enum: ["small", "medium", "large"] },
          dimensions: { type: "array", items: ITEM({ field: STR, label: STR, libraryId: STR }) },
          measures: { type: "array", items: MEASURE },
          sort: { type: "string", enum: ["valueDesc", "valueAsc", "dimAsc", "none"] },
          limit: { type: "integer" },
          target: STR,
          insight: STR,
          series: SERIES
        })
      }
    })
  });

  function systemPrompt(schemaText) {
    return [
      "You are a BI assistant embedded in Qlik DashBuilder AI, a Qlik Sense extension. You analyze the user's Qlik app (data model below) and design dashboards that the extension renders from your JSON.",
      "",
      "Write `reply` in " + (i18n.isEn() ? "English" : "Brazilian Portuguese") + ", 2-6 short sentences: what you built or changed and, when current values are provided, the main insights with real numbers. In the Conversa mode the reply is the answer itself: direct, with the real numbers; short bullet lists (\"- \") and small tables (\"| a | b |\") are allowed, and **bold** for the key figures.",
      "",
      i18n.isEn() ? "LANGUAGE: the user interface is in English. Write ALL text the user sees in English: `reply`, dashboard `title` and `subtitle`, tile titles, every `label` (measures, dimensions, series, sidebar, queries), `insight` and any description of filters or periods. Keep field names, master item names and ids (`libraryId`), Qlik expressions and data values (selection/filter values, period values) exactly as they are in the app, even when they are in Portuguese. The user may write in English: map their words to the Portuguese field names of the data model. When you mention the modes to the user, use their English names: Conversa = Chat, Objetos Qlik = Qlik Objects, Visual HTML = Visual HTML, HTML Complexo = Complex HTML.\n" : null,
      "Rules for the JSON:",
      "- `changed`: true when you create or modify the dashboard; false when you only answer a question. When false, return the current dashboard unchanged (or an empty one with no tiles if none exists).",
      "- `queries`: the numbers you need from Qlik before answering. When the answer needs values you don't have (they are not in \"Valores que os blocos estão mostrando agora\" nor in previous query results), return up to 6 queries with `changed` false; the rest of that answer is ignored. The extension calculates them now in Qlik and sends you the results, then you answer with `queries` []. Never invent numbers: use only values you received. When you don't need data, `queries` is [].",
      "  Each query: `label`; `dimensions` (0-2 field names, or a calculated dimension starting with \"=\"; [] = one total per measure); `measures` (same format as tiles); `filters` (fixed set analysis added on top of the current app selections, same format as dashboard filters; [] for none); `sort`; `limit` (rows, at most 50; 0 = 50); `series` (period-consolidated measures: { field, label, values } calculates each period isolated, like tile series, with `dimensions` []; otherwise { field: \"\", label: \"\", values: [] }). Respect the governance rules: a measure that can't be segmented by period uses `series`, never a period dimension.",
      "- When changing a dashboard, return it complete with the change applied and everything else kept as it was. Keep tile ids stable.",
      "- The app owner curated the data model below: follow the app context text, read each field comment to understand its meaning, and prefer the official master measures and dimensions (via libraryId) whenever one fits the request.",
      "- Use only fields listed in the data model, spelled exactly. Wrap names that contain spaces or special characters in square brackets, e.g. Sum([Valor Venda]).",
      "- Measures are Qlik expressions (Sum, Count(Distinct ...), Avg, set analysis, etc.). Format inside the expression with explicit separators: Num(x, '#.##0', ',', '.') for integers, Num(x, '#.##0,00', ',', '.') for decimals, Num(x, '0,0%', ',', '.') for percentages, Money(x, 'R$ #.##0,00', ',', '.') for currency.",
      "- To use a master item put its id in `libraryId` and still fill `label`; otherwise libraryId is \"\" (empty).",
      "- Dimension `field` is a field name, or a calculated dimension starting with \"=\". Up to 2 dimensions per tile (3 only in tabela).",
      "",
      "Chart catalog (chart: data it needs):",
      "- numero: 0 dimensions, 1 measure (optional 2nd measure = comparison such as previous period). Big KPI number.",
      "- kpi: 1 time dimension + 1 measure. Total with trend sparkline and last-vs-previous badge.",
      "- linha: 1 dimension (usually time) + 1-4 measures.",
      "- area: 1 time dimension + 1-3 measures.",
      "- colunas: 1 dimension + 1-3 measures.",
      "- ranking: 1 dimension + 1 measure; use sort valueDesc and limit 10.",
      "- empilhado: 2 dimensions + 1 measure, or 1 dimension + 2-6 measures.",
      "- combo: 1 dimension + exactly 2 measures (bars + line on separate axes).",
      "- rosca: 1 dimension with few categories (8 or fewer shown) + 1 measure.",
      "- medidor: 0 dimensions; measure 1 = actual, measure 2 = target (or use `target`).",
      "- calor: 2 dimensions + 1 measure.",
      "- bolhas: 1 dimension + 2-3 measures (x, y, bubble size).",
      "- funil: 1 dimension with ordered stages + 1 measure.",
      "- tabela: 1-3 dimensions + 1-6 measures. Detail table.",
      "",
      "Segmenting the data — two tools, pick by what the user wants:",
      "1) `selections` (default for \"visão da filial 10002\", \"mostre só o Sul\", \"filtre 2024\"): normal Qlik selections applied to the app right after your answer. The dashboard follows them and the user can clear them later to see everything again. Each item is { field, values } with real values written exactly as in the data (check the sample values; mind capitalization, accents and leading zeros). Also put every selected field in `dashboard.sidebar`, so the user sees and changes the filter on the left of the dashboard. Return `selections` only when the user asks to filter/segment now; otherwise []. You may answer with selections and `changed` false when the dashboard itself does not need to change.",
      "2) `dashboard.filters` (fixed filter): set analysis the extension adds to every measure, which selections cannot undo. Use it ONLY when the user explicitly wants a fixed/locked view (\"fixo\", \"sempre\", \"independente das seleções\") or in the HTML Complexo mode. Each item is { field, values, exclude }; `exclude` true removes the values. Do not write that set analysis yourself; measures with `libraryId` cannot receive it, so write their expression instead while a fixed filter exists. To remove it, return []. When there is none, `filters` is [].",
      "`dashboard.sidebar`: filter fields shown on the left of the dashboard ({ field, label }; field spelled exactly as in the data model). Include the fields of `selections` and, when the user asks for filters, 2-5 useful slicers (period, unit/filial, region, category…). Keep the existing sidebar when changing other things; [] when the user wants no filters. In HTML Complexo mode the sidebar must be [] (the page is static).",
      "If the user names a field but not the values, ask which values in `reply` with `changed` false and empty `selections`.",
      "",
      "Requested periods are a hard limit: when the user names a year or period (\"mês a mês de 2026\", \"1º semestre de 2025\"), use ONLY that period — in `series.values` list only its periods (or [] plus a `filters` item on the year field), in `filters`/`selections` restrict the year, and never add, compare or mention other years unless the user asks. Don't guess period values: take them from the sample values in the data model or ask a query first. The extension also drops periods of years the user did not mention.",
      "Period-consolidated measures: some measures only make sense for one period at a time (e.g. % turnover/rotatividade, headcount, saldo/estoque, índices e médias mensais já consolidados), and the app context may forbid segmenting them by period/competência. Never sum or average them across periods, and never put the period as a dimension of such a measure in a normal chart.",
      "Per-period series (`series` on a tile) — use it instead of refusing: when the user wants the evolution/series of a measure that cannot be segmented by period (governance rule, \"nunca pode ser segmentado por competência\", consolidated monthly indicator), build the tile with `series` = { field: the period field (e.g. Competência, Mês/Ano, AnoMes), label, values: the requested periods written exactly as in the data, or [] for every period allowed by the dashboard `filters` }. The extension calculates the measure once per period, each isolated as if only that period were selected, and consolidates the results into the tile — exactly what the governance rule allows. Tiles with `series` use chart linha, colunas, area or tabela, have `dimensions` [] and keep the measure as is (libraryId allowed). Put the other restrictions (Ano, Negócio…) in `filters`. A dashboard with any `series` is delivered as an HTML Complexo page (static, for download) and you must set `useSimples` true and say so in `reply`. Do not answer only explaining the rule: deliver the series. Tiles without series have `series` { field: \"\", label: \"\", values: [] }.",
      "`useSimples`: true when the answer needs the HTML Complexo page (any `series`, or a static consolidated extraction the user asked for); otherwise false.",
      "",
      "Layout: 12-column grid; `width` is the column span. Start with 3-4 `numero` KPIs (width \"3\", height \"small\"), then the main charts (width \"6\" or \"8\", height \"medium\"), details last. Make each row add up to 12. A typical dashboard has 6-10 tiles.",
      "Sorting: time dimensions use dimAsc; rankings use valueDesc with a limit. `limit` 0 means no limit.",
      "`target`: a number or Qlik expression for the target line (linha/area) or the gauge; \"\" when none.",
      "`insight`: one short " + (i18n.isEn() ? "English" : "Portuguese") + " sentence about what to look for, or a real finding when you have the values; \"\" when nothing useful.",
      "If a reference image is attached, reproduce its layout and visual intent with the available charts.",
      "If the data model can't support the request, explain why in `reply` and set `changed` to false.",
      "",
      "Data model of the app:",
      schemaText
    ].filter(function (x) { return x != null; }).join("\n");
  }

  // "chat" só conversa (e pode gerar um HTML Complexo junto, quando pedido); os outros montam o painel.
  // A chave "simples" foi mantida para os painéis já salvos; na tela o modo se chama HTML Complexo.
  var MODES = { chat: "💬", qlik: "📊", html: "🎨", simples: "🧩" };
  function modeName(m) {
    return {
      chat: T("Conversa", "Chat"), qlik: T("Objetos Qlik", "Qlik Objects"), html: T("Visual HTML", "Visual HTML"), simples: T("HTML Complexo", "Complex HTML")
    }[m];
  }
  function modeTip(m) {
    return {
      chat: T("Só a resposta, em texto: o assistente consulta os números no Qlik e explica. Se você pedir um gráfico ou relatório, ele gera também uma página HTML Complexo para baixar.",
        "Just the answer, in text: the assistant queries the numbers in Qlik and explains them. If you ask for a chart or report, it also generates a Complex HTML page to download."),
      qlik: T("Cria gráficos nativos do Qlik (barras, linhas, KPI, tabela…) na própria pasta, fora do assistente, para você ajustar à mão.",
        "Creates native Qlik charts (bar, line, KPI, table…) on the sheet itself, outside the assistant, so you can fine-tune them by hand."),
      html: T("Desenha o painel em HTML num objeto separado da pasta. Ele reage às seleções do Qlik e continua lá mesmo se você excluir o assistente.",
        "Draws the dashboard in HTML in a separate object on the sheet. It reacts to Qlik selections and stays there even if you delete the assistant."),
      simples: T("Página HTML estática com os dados extraídos agora (inclusive período a período), que não muda com as seleções. Para baixar ou abrir numa aba.",
        "Static HTML page with the data extracted now (including period by period), unaffected by selections. Download it or open it in a tab.")
    }[m];
  }
  function placeholder(m) {
    var board = T("Descreva o painel. Ex.: vendas por região e mês, com meta de 1 milhão", "Describe the dashboard. E.g.: sales by region and month, with a 1 million target");
    return {
      chat: T("Pergunte algo sobre os dados. Ex.: qual foi o turnover de cada mês de 2026?", "Ask something about the data. E.g.: what was the turnover for each month of 2026?"),
      qlik: board,
      html: board,
      simples: T("Descreva a página. Ex.: turnover mês a mês de 2026, com a média do ano", "Describe the page. E.g.: month-by-month turnover for 2026, with the yearly average")
    }[m];
  }
  // Respostas que só anunciam o trabalho ("estou consultando…") sem pedir dados nem entregar nada.
  // Em inglês também: "I'll check…", "let me look up…", "I'm querying…", "Checking the data…".
  var PROMISE = new RegExp([
    "\\b(estou|vou|irei|deixe-me|deixa eu|aguarde|um momento)\\b[^.]{0,60}\\b(consult|busca|buscar|verific|ger[ao]|gerar|mont|levant|extra|calcul|analis)",
    "\\b(i['\u2019]ll|i will|i['\u2019]m|i am|i['\u2019]m going to|i am going to|let me|please wait|one moment|hold on|stand by)\\b[^.]{0,60}\\b(check|quer|look(ing)? up|look(ing)? into|fetch|retriev|search|verif|generat|build|creat|pull|extract|calculat|comput|analy[sz])",
    "^\\s*(checking|querying|fetching|retrieving|looking up|searching|calculating|computing|analy[sz]ing|pulling)\\b"
  ].join("|"), "i");
  var PREF_WHERE = "qdashbuilder.assistant.where", PREF_MODE = "qdashbuilder.render";

  function pref(key, value) {
    try {
      if (value === undefined) return localStorage.getItem(key) || "";
      localStorage.setItem(key, value);
    } catch (e) { return ""; }
  }

  function chatState(state) {
    return state.chat || (state.chat = {
      history: [], log: [], busy: false, years: [], turnTables: [], schemaText: null, undo: [], image: null, open: false, provider: null,
      draft: "", editing: null, where: pref(PREF_WHERE) || "win", render: MODES[pref(PREF_MODE)] ? pref(PREF_MODE) : "html", win: null, floatPos: null, reports: []
    });
  }

  function modelOf(cfg) {
    if (cfg.aiModelCustom) return cfg.aiModelCustom.trim();
    if (cfg.aiProvider === "anthropic") return cfg.aiModel;
    if (cfg.aiProvider === "openrouter") return cfg.openrouterModel;
    return cfg.geminiModel;
  }

  // Botões com dica própria (data-hint), que aparece na hora ao passar o mouse, também na janela popup.
  function hint(text, pos) { return ' data-hint="' + esc(text) + '"' + (pos ? ' data-hint-pos="' + pos + '"' : "") + ' aria-label="' + esc(text) + '"'; }

  function panelHtml() {
    return '<div class="md-ai-head"><span class="md-ai-logo">✨</span><div class="md-ai-brand"><b>Qlik DashBuilder AI</b><small data-ai="sub"></small></div>' +
      '<button class="md-ai-ico" data-ai="context"' + hint(T("Contexto: mostra o que o assistente sabe do app (campos, medidas e regras)", "Context: shows what the assistant knows about the app (fields, measures and rules)"), "down-end") + ">ⓘ</button>" +
      '<button class="md-ai-ico" data-ai="undo"' + hint(T("Desfazer: volta o painel para a versão anterior", "Undo: restores the previous version of the dashboard"), "down-end") + ">↶</button>" +
      '<button class="md-ai-ico" data-ai="new"' + hint(T("Nova conversa: limpa o chat (o painel continua)", "New chat: clears the conversation (the dashboard stays)"), "down-end") + ">＋</button>" +
      '<button class="md-ai-ico" data-ai="where" data-hint-pos="down-end"></button>' +
      '<button class="md-ai-ico" data-ai="close"' + hint(T("Fechar o assistente", "Close the assistant"), "down-end") + ">✕</button></div>" +
      '<div class="md-ai-log"></div>' +
      '<div class="md-ai-key"></div>' +
      '<div class="md-ai-input">' +
      '<div class="md-ai-modes" role="tablist">' + Object.keys(MODES).map(function (m, i, all) {
        return '<button data-ai="mode" data-mode="' + m + '" role="tab"' + hint(modeTip(m), i === 0 ? "start" : i === all.length - 1 ? "end" : "") + ">" +
          "<i>" + MODES[m] + "</i><span>" + modeName(m) + "</span></button>";
      }).join("") + "</div>" +
      '<div class="md-ai-modehint"></div>' +
      '<div class="md-ai-editbar"></div>' +
      '<div class="md-ai-composer"><textarea data-ai="text" rows="3"></textarea>' +
      '<div class="md-ai-row"><label class="md-ai-attach"' + hint(T("Anexar uma imagem de referência (print de um painel, rascunho…)", "Attach a reference image (dashboard screenshot, sketch…)"), "up-start") + '>📎<input type="file" accept="image/png,image/jpeg,image/gif,image/webp" data-ai="file" style="display:none"></label>' +
      '<span data-ai="filename" class="md-ai-hintline"></span><button class="md-ai-send" data-ai="send">' + T("Enviar ➤", "Send ➤") + '</button></div></div>' +
      "</div>";
  }

  // Markdown mínimo nas respostas: **negrito**, listas com "- " e tabelas com "|".
  // Tabelas em markdown de uma resposta: [{ name, head, rows }]
  function replyTables(text) { var t = []; mdLite(text, -1, t); return t; }

  // i: índice da mensagem (para o botão de copiar de cada tabela); tables: recebe as tabelas lidas.
  function mdLite(text, i, tables) {
    var lines = String(text || "").split("\n"), out = [], list = null, rows = null;
    tables = tables || [];
    var inline = function (t) { return esc(t).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>"); };
    var flush = function () {
      if (list) { out.push("<ul>" + list.map(function (li) { return "<li>" + inline(li) + "</li>"; }).join("") + "</ul>"); list = null; }
      if (rows) {
        var body = rows.filter(function (r) { return !/^\s*\|?\s*:?-{2,}/.test(r); }).map(function (r) {
          return r.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map(function (c) { return c.trim(); });
        });
        var plain = body.map(function (r) { return r.map(function (c) { return c.replace(/\*\*/g, ""); }); });
        tables.push({ name: T("Resposta", "Answer") + (tables.length ? " " + (tables.length + 1) : ""), head: plain[0] || [], rows: plain.slice(1), total: null });
        out.push('<div class="md-ai-tblwrap"><button class="md-ai-tblcopy" data-ai="copy-table" data-i="' + i + '" data-t="' + (tables.length - 1) + '"' +
          hint(T("Copiar esta tabela (cola direto no Excel)", "Copy this table (pastes straight into Excel)"), "end") + ">📋</button>" +
          '<table class="md-ai-tbl">' + body.map(function (cells, r) {
          var tag = r === 0 ? "th" : "td";
          return "<tr>" + cells.map(function (c) { return "<" + tag + ">" + inline(c) + "</" + tag + ">"; }).join("") + "</tr>";
        }).join("") + "</table></div>");
        rows = null;
      }
    };
    lines.forEach(function (l) {
      if (/^\s*[-•*]\s+/.test(l)) { if (rows) flush(); (list = list || []).push(l.replace(/^\s*[-•*]\s+/, "")); }
      else if (/^\s*\|.*\|\s*$/.test(l)) { if (list) flush(); (rows = rows || []).push(l); }
      else { flush(); out.push(l.trim() ? "<p>" + inline(l) + "</p>" : ""); }
    });
    flush();
    return out.join("");
  }

  // ctx: { state, scope, css(), cfg(), getSpecJson(), applySpec(json) }
  // O assistente não fica dentro do objeto: abre numa janela popup do navegador ("win")
  // ou flutuando sobre a pasta ("float", arrastável), para não cobrir o dashboard.
  function mount(container, ctx) {
    var chat = chatState(ctx.state);
    var ui = null, watcher = null;
    container.innerHTML = '<button class="md-ai-fab" data-ai="open">' + T("✨ IA", "✨ AI") + "</button>";
    container.onclick = function (ev) {
      ev.stopPropagation();
      if (ev.target.closest('[data-ai="open"]')) open();
    };

    function currentSpec() {
      try {
        var s = JSON.parse(ctx.getSpecJson() || "null");
        return s && Array.isArray(s.tiles) && s.tiles.length ? s : null;
      } catch (e) { return null; }
    }

    function modeOfSpec(s) { return MODES[s.render] ? s.render : "html"; }

    // Com painel salvo, os botões de modo seguem o painel, a não ser que o usuário tenha escolhido
    // outro modo que ainda vai valer no próximo pedido.
    function syncMode() {
      var s = currentSpec();
      if (s && !chat.modePending && chat.render !== "chat") chat.render = modeOfSpec(s);
    }

    // Trocar o modo não mexe no painel atual: o novo modo vale quando a IA montar o painel de novo
    // ou quando o usuário pedir "Refazer agora".
    function setMode(mode) {
      chat.render = mode;
      pref(PREF_MODE, mode);
      var spec = currentSpec();
      chat.modePending = !!spec && mode !== "chat" && modeOfSpec(spec) !== mode;
      render();
      if (ui) ui.input.focus();
    }

    function redoInMode() {
      var spec = currentSpec();
      if (!spec || chat.busy || chat.render === "chat") return;
      chat.undo.push(ctx.getSpecJson());
      spec.render = chat.render;
      chat.modePending = false;
      chat.log.push({ role: "note", text: T("Refazendo o painel em {m}…", "Redoing the dashboard in {m}…", { m: modeName(chat.render) }) });
      render();
      apply(JSON.stringify(spec));
    }

    function cleanSelections(list) {
      return (Array.isArray(list) ? list : []).map(function (x) {
        return { field: String(x && x.field || "").trim(), values: (x && Array.isArray(x.values) ? x.values : []).map(String).filter(Boolean) };
      }).filter(function (x) { return x.field && x.values.length; });
    }

    function addToSidebar(spec, sel) {
      spec.sidebar = Array.isArray(spec.sidebar) ? spec.sidebar : [];
      var grew = false;
      sel.forEach(function (x) {
        if (spec.sidebar.some(function (f) { return f && f.field === x.field; })) return;
        spec.sidebar.unshift({ field: x.field, label: x.field });
        grew = true;
      });
      return grew;
    }

    // Seleções pedidas pela IA: seleção comum do Qlik, que o usuário desmarca para voltar a ver tudo.
    function applySelections(sel) {
      if (!sel.length) return Promise.resolve();
      stage(T("Aplicando as seleções no app…", "Applying the selections in the app…"));
      return appinfo.select(qlik.currApp(), sel).then(function () {
        chat.log.push({ role: "note", text: T("Selecionei no app: {s}. Desmarque na coluna de filtros (ou na barra de seleções do Qlik) para ver todos.",
          "Selected in the app: {s}. Clear it in the filter column (or in the Qlik selections bar) to see everything.",
          { s: sel.map(function (x) { return x.field + " = " + x.values.join(", "); }).join(" · ") }) });
      }, function (e) {
        chat.log.push({ role: "err", text: T("Não consegui aplicar a seleção: {e}", "Could not apply the selection: {e}", { e: e && e.message ? e.message : e }) });
      });
    }

    // Aplica o painel e conta no chat o que mudou na pasta (objetos nativos criados, atualizados ou removidos).
    function apply(json) {
      chat.modePending = false;
      return Promise.resolve(ctx.applySpec(json)).then(function (msg) {
        // HTML Complexo: a nota já traz os botões para baixar ou abrir a página.
        var spec = dash.parse(json);
        if (msg) chat.log.push({ role: "note", text: msg, html: !!(spec && spec.render === "simples") });
      }, function (err) {
        console.error("DashBuilder AI:", err);
        chat.log.push({ role: "err", text: err && err.message ? err.message : String(err) });
      }).then(function () { syncMode(); render(); });
    }

    function build(doc, host, where) {
      var panel = doc.createElement("div");
      panel.className = "md-ai-panel md-ai-" + where;
      panel.innerHTML = panelHtml();
      host.appendChild(panel);
      var q = function (sel) { return panel.querySelector(sel); };
      var v = {
        where: where, panel: panel, log: q(".md-ai-log"), keyBox: q(".md-ai-key"), editBar: q(".md-ai-editbar"), modeHint: q(".md-ai-modehint"),
        input: q('[data-ai="text"]'), sendBtn: q('[data-ai="send"]'), fileName: q('[data-ai="filename"]')
      };
      v.input.value = chat.draft;
      v.input.oninput = function () { chat.draft = v.input.value; };
      // Teclas digitadas no chat não podem chegar ao Qlik (Delete apagaria o objeto em modo de edição).
      ["keydown", "keyup", "keypress"].forEach(function (type) {
        panel.addEventListener(type, function (ev) {
          ev.stopPropagation();
          if (type !== "keydown" || ev.target !== v.input) return;
          if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); send(v.input.value); }
          else if (ev.key === "ArrowUp" && !v.input.value && lastQuestion() >= 0) { ev.preventDefault(); edit(lastQuestion()); }
          else if (ev.key === "Escape" && chat.editing != null) cancelEdit();
        });
      });
      panel.addEventListener("mousedown", function (ev) { ev.stopPropagation(); });
      panel.onclick = onClick;
      q('[data-ai="file"]').onchange = onFile;
      return v;
    }

    function openWindow() {
      var w = chat.win && !chat.win.closed ? chat.win : null;
      if (!w) {
        var width = 460, height = Math.min(820, (screen.availHeight || 900) - 80);
        var left = (window.screenX || 0) + Math.max((window.outerWidth || width) - width - 24, 0), top = (window.screenY || 0) + 60;
        try { w = window.open("", "qdashbuilder-ai", "popup=yes,width=" + width + ",height=" + height + ",left=" + left + ",top=" + top); } catch (e) { w = null; }
      }
      if (!w) return false;
      try {
        var doc = w.document;
        doc.head.innerHTML = "";
        doc.body.innerHTML = "";
        doc.title = T("Qlik DashBuilder AI — assistente", "Qlik DashBuilder AI — assistant");
        var style = doc.createElement("style");
        style.textContent = "html, body { margin: 0; height: 100%; font-family: " + (getComputedStyle(container).fontFamily || "sans-serif") + "; }\n" + ctx.css();
        doc.head.appendChild(style);
        var host = doc.createElement("div");
        host.className = ctx.scope;
        doc.body.appendChild(host);
        ui = build(doc, host, "win");
      } catch (e) {
        console.warn("DashBuilder AI: não foi possível usar a janela popup.", e);
        try { w.close(); } catch (e2) { /* já fechada */ }
        return false;
      }
      ui.win = chat.win = w;
      // O usuário pode fechar a janela pelo X do navegador a qualquer momento.
      watcher = setInterval(function () {
        if (!w.closed) return;
        clearInterval(watcher);
        watcher = null;
        if (ui && ui.win === w) { ui = null; chat.open = false; }
        if (chat.win === w) chat.win = null;
      }, 700);
      return true;
    }

    function openFloat() {
      var wrap = document.createElement("div");
      wrap.className = ctx.scope;
      document.body.appendChild(wrap);
      ui = build(document, wrap, "float");
      ui.wrap = wrap;
      var p = chat.floatPos, s = ui.panel.style;
      if (p) {
        s.left = Math.min(Math.max(p.left, 0), window.innerWidth - 120) + "px";
        s.top = Math.min(Math.max(p.top, 0), window.innerHeight - 60) + "px";
        s.width = p.width + "px";
        s.height = p.height + "px";
      } else {
        s.right = "24px";
        s.bottom = "24px";
      }
      draggable(ui);
    }

    function draggable(v) {
      v.panel.querySelector(".md-ai-head").onmousedown = function (ev) {
        if (ev.button !== 0 || ev.target.closest("button")) return;
        ev.preventDefault();
        var r = v.panel.getBoundingClientRect(), dx = ev.clientX - r.left, dy = ev.clientY - r.top;
        function move(e) {
          v.panel.style.left = Math.min(Math.max(e.clientX - dx, 0), window.innerWidth - 120) + "px";
          v.panel.style.top = Math.min(Math.max(e.clientY - dy, 0), window.innerHeight - 60) + "px";
          v.panel.style.right = v.panel.style.bottom = "auto";
        }
        function up() {
          document.removeEventListener("mousemove", move, true);
          document.removeEventListener("mouseup", up, true);
        }
        document.addEventListener("mousemove", move, true);
        document.addEventListener("mouseup", up, true);
      };
    }

    function unplace(closeWindow) {
      if (watcher) { clearInterval(watcher); watcher = null; }
      if (!ui) return;
      if (ui.where === "float") {
        var r = ui.panel.getBoundingClientRect();
        chat.floatPos = { left: r.left, top: r.top, width: r.width, height: r.height };
        ui.wrap.parentNode.removeChild(ui.wrap);
      } else if (closeWindow && ui.win) {
        try { ui.win.close(); } catch (e) { /* já fechada */ }
        chat.win = null;
      }
      ui = null;
    }

    function place(where) {
      unplace(true);
      if (where === "win" && !openWindow()) {
        where = "float";
        chat.log.push({ role: "note", text: T("O navegador bloqueou a janela popup, então o assistente abriu flutuando sobre a pasta. Libere popups para este site para usar a janela separada.",
          "The browser blocked the popup window, so the assistant opened floating over the sheet. Allow popups for this site to use the separate window.") });
      }
      if (where === "float") openFloat();
      chat.placed = where;
      render();
      ui.input.focus();
    }

    function open() {
      chat.open = true;
      if (ui && ui.win && !ui.win.closed) { ui.win.focus(); ui.input.focus(); return; }
      if (ui) { ui.input.focus(); return; }
      place(chat.where === "float" ? "float" : "win");
    }

    function close() {
      chat.open = false;
      unplace(true);
    }

    // Andamento da extração período a período ("Filtrando Competência = 03/2026 (3 de 12)…").
    var unlisten = extract.listen(function (text) { if (chat.busy && text) stage(text, true); });

    function onUnload() {
      if (chat.win && !chat.win.closed) chat.win.close();
    }
    window.addEventListener("pagehide", onUnload);

    // keepWindow: o objeto vai ser recriado e a nova montagem reaproveita a janela já aberta.
    function destroy(keepWindow) {
      window.removeEventListener("pagehide", onUnload);
      unlisten();
      unplace(!keepWindow);
      if (!keepWindow) chat.open = false;
    }

    // Lê o app (ou reaproveita a leitura em memória se as opções não mudaram).
    function loadSchema(cfg, force) {
      var opts = { samples: cfg.aiSamples, tag: cfg.aiTag, contextVar: cfg.aiContextVar };
      var key = JSON.stringify(opts);
      if (!force && chat.schemaText && chat.schemaKey === key) return Promise.resolve(chat.schemaText);
      return appinfo.describe(qlik.currApp(), opts).then(function (t) { chat.schemaText = t; chat.schemaKey = key; return t; });
    }

    // Contexto: o que o assistente sabe do app (variável, itens mestres e campos com a tag) e se está pronto.
    function showContext(force) {
      var cfg = ctx.cfg();
      chat.showContext = true;
      chat.contextText = T("Lendo o app…", "Reading the app…");
      chat.contextInfo = null;
      chat.contextError = "";
      render();
      Promise.all([
        loadSchema(cfg, force).then(function (t) { chat.contextText = t; }),
        appinfo.collect(qlik.currApp(), { tag: cfg.aiTag, contextVar: cfg.aiContextVar }).then(function (info) { chat.contextInfo = info; })
      ]).catch(function (e) { chat.contextError = T("Erro ao ler o app: {e}", "Error reading the app: {e}", { e: e && e.message ? e.message : e }); })
        .then(function () { if (chat.showContext) render(); });
    }

    function contextHtml() {
      var info = chat.contextInfo, text = chat.contextText || "";
      var head = '<div class="md-ai-row md-ai-ctx-top"><b>' + T("Contexto do assistente", "Assistant context") + "</b>" +
        '<button class="md-ai-chip" data-ai="ctx-reload"' + hint(T("Lê o app de novo (use depois de mudar tags, comentários ou a variável)", "Reads the app again (use it after changing tags, comments or the variable)"), "down-end") + ">" + T("↻ Ler de novo", "↻ Reload") + "</button>" +
        '<button class="md-ai-chip" data-ai="ctx-close">' + T("Voltar ao chat", "Back to chat") + "</button></div>";
      if (chat.contextError) return '<div class="md-ai-ctx">' + head + '<div class="md-ai-msg md-ai-err">' + esc(chat.contextError) + "</div></div>";
      if (!info) return '<div class="md-ai-ctx">' + head + '<div class="md-ai-msg md-ai-bot md-ai-busy">' + T("Lendo o app…", "Reading the app…") + "</div></div>";

      var tag = info.tag || "", vname = info.contextVar || "";
      var hasVar = info.context != null, varText = info.context || "";
      var fields = info.tagged ? info.fields : [];
      var noComment = fields.filter(function (f) { return !f.comment; });
      var vv = { v: vname, t: tag, n: varText.length.toLocaleString(i18n.locale()), all: info.allCount };
      var checks = [
        { ok: hasVar && !!varText, text: !vname ? T("Nenhuma variável de contexto configurada nas propriedades", "No context variable set in the properties")
          : !hasVar ? T("Variável {v} não encontrada no app", "Variable {v} not found in the app", vv) : !varText ? T("Variável {v} está vazia", "Variable {v} is empty", vv)
          : T("Variável {v} ({n} caracteres)", "Variable {v} ({n} characters)", vv) },
        { ok: info.tagged, text: info.tagged ? T("{c} campo(s) com a tag \"{t}\"", "{c} field(s) tagged \"{t}\"", { c: fields.length, t: tag })
          : T("Nenhum campo com a tag \"{t}\": a IA recebe todos os {all} campos do app", "No field tagged \"{t}\": the AI receives all {all} fields of the app", vv) },
        { ok: info.tagged && !noComment.length, text: !info.tagged ? T("Comentários dos campos: marque os campos com a tag primeiro", "Field comments: tag the fields first")
          : noComment.length ? T("{c} campo(s) com a tag sem comentário", "{c} tagged field(s) without a comment", { c: noComment.length }) : T("Todos os campos com a tag têm comentário", "All tagged fields have a comment") },
        { ok: info.measures.length > 0, text: info.measures.length ? T("{c} medida(s) mestre com a tag", "{c} tagged master measure(s)", { c: info.measures.length })
          : T("Nenhuma medida mestre com a tag: a IA vai escrever as expressões sozinha", "No tagged master measure: the AI will write the expressions on its own") },
        { ok: true, soft: !info.dims.length, text: info.dims.length ? T("{c} dimensão(ões) mestre com a tag", "{c} tagged master dimension(s)", { c: info.dims.length }) : T("Nenhuma dimensão mestre com a tag (opcional)", "No tagged master dimension (optional)") }
      ];
      var bad = checks.filter(function (c) { return !c.ok; }).length;
      var level = !bad ? "ok" : (hasVar && varText) || info.tagged ? "warn" : "bad";
      var badge = { ok: T("✅ Pronto para uso", "✅ Ready to use"), warn: T("🟡 Pronto, com ressalvas", "🟡 Ready, with caveats"), bad: T("🔴 Falta configurar", "🔴 Setup needed") }[level];
      var sub = { ok: T("O assistente tem o contexto do app, os campos e os itens mestres oficiais.", "The assistant has the app context, the fields and the official master items."),
        warn: T("Funciona, mas as respostas ficam melhores resolvendo os pontos abaixo.", "It works, but answers get better once you fix the points below."),
        bad: T("Defina a variável de contexto e marque os campos e itens mestres com a tag \"{t}\".", "Set the context variable and tag the fields and master items with \"{t}\".", vv) }[level];

      var sec = function (icon, title, count, body, open) {
        return '<details class="md-ai-ctx-sec"' + (open ? " open" : "") + "><summary>" + icon + " " + esc(title) +
          (count != null ? ' <span class="md-ai-ctx-n">' + count + "</span>" : "") + "</summary>" + body + "</details>";
      };
      var empty = function (t) { return '<div class="md-ai-ctx-empty">' + esc(t) + "</div>"; };
      var master = function (it, extra) {
        var d = it.qData || {};
        return '<div class="md-ai-ctx-item"><div><b>' + esc(d.title || it.qInfo.qId) + '</b> <code>' + esc(it.qInfo.qId) + "</code></div>" +
          (d.description ? "<span>" + esc(d.description) + "</span>" : '<span class="md-ai-ctx-warn">⚠ ' + T("sem descrição", "no description") + "</span>") +
          (extra ? '<code class="md-ai-ctx-expr">' + esc(extra) + "</code>" : "") + "</div>";
      };
      var byTable = {}, order = [];
      fields.forEach(function (f) { if (!byTable[f.table]) { byTable[f.table] = []; order.push(f.table); } byTable[f.table].push(f); });
      var fieldsBody = fields.length ? order.map(function (t) {
        return '<div class="md-ai-ctx-table">' + T("Tabela", "Table") + " " + esc(t) + "</div>" + byTable[t].map(function (f) {
          var type = f.tags.filter(function (x) { return x.charAt(0) === "$"; }).map(function (x) { return x.slice(1); }).join(", ");
          return '<div class="md-ai-ctx-item"><div><b>' + esc(f.name) + "</b>" + (type ? ' <code>' + esc(type) + "</code>" : "") + (f.key ? " <code>" + T("chave", "key") + "</code>" : "") + "</div>" +
            (f.comment ? "<span>" + esc(f.comment) + "</span>" : '<span class="md-ai-ctx-warn">⚠ ' + T("sem comentário (o comentário diz à IA o que o campo significa)", "no comment (the comment tells the AI what the field means)") + "</span>") + "</div>";
        }).join("");
      }).join("") : empty(T("Nenhum campo tem a tag \"{t}\". Marque os campos no modelo de dados (Gerenciador de dados ou script, com TAG FIELD).", "No field is tagged \"{t}\". Tag the fields in the data model (Data manager or script, with TAG FIELD).", vv));

      return '<div class="md-ai-ctx">' + head +
        '<div class="md-ai-ctx-status md-ai-ctx-' + level + '"><b>' + badge + "</b><span>" + esc(sub) + "</span></div>" +
        '<div class="md-ai-ctx-checks">' + checks.map(function (c) {
          return '<div class="' + (c.ok ? (c.soft ? "md-ai-ctx-soft" : "md-ai-ctx-good") : "md-ai-ctx-miss") + '">' + (c.ok ? (c.soft ? "○" : "✓") : "!") + " " + esc(c.text) + "</div>";
        }).join("") + "</div>" +
        sec("📝", vname ? T("Variável {v}", "Variable {v}", vv) : T("Variável de contexto", "Context variable"), null, varText ? '<div class="md-ai-ctx-var">' + esc(varText) + "</div>"
          : empty(!vname ? T("Configure o nome da variável nas propriedades (Variável com o contexto do app).", "Set the variable name in the properties (Variable with the app context).")
            : !hasVar ? T("Crie a variável {v} no app com as orientações de negócio (regras, metas, o que cada indicador significa).", "Create the variable {v} in the app with the business guidance (rules, targets, what each indicator means).", vv)
            : T("A variável existe, mas está vazia.", "The variable exists but is empty.")), !!varText) +
        sec("📐", T("Medidas mestre com a tag", "Tagged master measures"), info.measures.length, info.measures.length ? info.measures.map(function (it) { return master(it, it.qData && it.qData.expression); }).join("")
          : empty(T("Marque as medidas oficiais com a tag \"{t}\" para a IA usá-las em vez de escrever expressões.", "Tag the official measures with \"{t}\" so the AI uses them instead of writing expressions.", vv)), info.measures.length > 0 && info.measures.length <= 15) +
        sec("🧭", T("Dimensões mestre com a tag", "Tagged master dimensions"), info.dims.length, info.dims.length ? info.dims.map(function (it) {
          var f = it.qData && it.qData.fields;
          return master(it, f && f.length ? f.join(" > ") + (it.qData.grouping === "H" ? " (drill-down)" : "") : "");
        }).join("") : empty(T("Opcional: marque dimensões mestre com a tag \"{t}\".", "Optional: tag master dimensions with \"{t}\".", vv)), info.dims.length > 0 && info.dims.length <= 15) +
        sec("🏷️", T("Campos com a tag", "Tagged fields"), fields.length, fieldsBody, fields.length > 0 && fields.length <= 25) +
        sec("📄", T("Texto completo enviado à IA", "Full text sent to the AI"), T("{n} caracteres", "{n} characters", { n: text.length.toLocaleString(i18n.locale()) }),
          '<div class="md-ai-ctx-meta">' + T("Fica só na memória desta página e vai a cada mensagem, junto com as regras do assistente.", "Kept only in this page's memory and sent with every message, along with the assistant's rules.") + "</div><pre>" + esc(text) + "</pre>", false) +
        "</div>";
    }

    function lastQuestion() {
      for (var i = chat.log.length - 1; i >= 0; i--) if (chat.log[i].prompt != null) return i;
      return -1;
    }

    // Coloca o texto de uma pergunta anterior na caixa para ser ajustado e enviado de novo.
    function edit(i) {
      var m = chat.log[i];
      if (!m || m.prompt == null || !ui) return;
      chat.editing = i;
      chat.showContext = false;
      ui.input.value = chat.draft = m.prompt;
      render();
      ui.input.focus();
      ui.input.setSelectionRange(ui.input.value.length, ui.input.value.length);
    }

    function cancelEdit() {
      chat.editing = null;
      if (ui) ui.input.value = chat.draft = "";
      render();
    }

    // Tabelas de uma resposta para o Excel: as da própria resposta e as calculadas no Qlik para ela.
    function tablesOf(m) { return replyTables(m.text).concat(m.tables || []); }

    function answerActs(m, i) {
      var n = tablesOf(m).length;
      return '<div class="md-ai-acts md-ai-acts-bot"><button class="md-ai-chip" data-ai="copy-msg" data-i="' + i + '"' + hint(T("Copiar a resposta (texto e tabelas)", "Copy the answer (text and tables)"), "start") + ">" + T("📋 Copiar", "📋 Copy") + "</button>" +
        (n ? '<button class="md-ai-chip" data-ai="xlsx" data-i="' + i + '"' +
          hint(m.tables && m.tables.length
            ? T("Baixar em Excel: {n} tabela(s), uma por aba, incluindo os dados completos calculados no Qlik", "Download as Excel: {n} table(s), one per sheet, including the full data calculated in Qlik", { n: n })
            : T("Baixar em Excel: {n} tabela(s), uma por aba", "Download as Excel: {n} table(s), one per sheet", { n: n }), "start") + ">⬇ Excel</button>" : "") + "</div>";
    }

    // Área de transferência com HTML (o Excel e o Word recebem a tabela formatada) e texto puro.
    function copyRich(html, text, btn) {
      var w = ui.panel.ownerDocument.defaultView, done = function () {
        var old = btn.innerHTML;
        btn.innerHTML = T("✓ Copiado", "✓ Copied");
        btn.classList.add("md-ai-ok");
        setTimeout(function () { btn.innerHTML = old; btn.classList.remove("md-ai-ok"); }, 1500);
      };
      var fallback = function () {
        var d = w.document, ta = d.createElement("textarea");
        ta.value = text;
        ta.style.cssText = "position:fixed;left:-9999px;top:0";
        d.body.appendChild(ta);
        ta.select();
        try { d.execCommand("copy"); done(); } catch (e) { chat.log.push({ role: "err", text: T("O navegador não deixou copiar. Selecione o texto e use Ctrl+C.", "The browser did not allow copying. Select the text and press Ctrl+C.") }); render(); }
        d.body.removeChild(ta);
      };
      try {
        if (w.navigator.clipboard && w.ClipboardItem) {
          return w.navigator.clipboard.write([new w.ClipboardItem({
            "text/html": new w.Blob([html], { type: "text/html" }), "text/plain": new w.Blob([text], { type: "text/plain" })
          })]).then(done, fallback);
        }
      } catch (e) { /* cai no modo antigo */ }
      fallback();
    }

    function tableHtml(t) {
      var row = function (r, tag) { return "<tr>" + r.map(function (c) { return "<" + tag + ">" + esc(c) + "</" + tag + ">"; }).join("") + "</tr>"; };
      return "<table border=\"1\">" + row(t.head, "th") + t.rows.map(function (r) { return row(r, "td"); }).join("") + (t.total ? row(t.total, "td") : "") + "</table>";
    }
    function tableTsv(t) {
      return [t.head].concat(t.rows, t.total ? [t.total] : []).map(function (r) { return r.join("\t"); }).join("\n");
    }

    function fileName(i) {
      var q = "";
      for (var k = i; k >= 0 && !q; k--) if (chat.log[k].role === "user") q = chat.log[k].prompt || "";
      var slug = String(q || T("conversa", "chat")).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase().slice(0, 50);
      return (slug || T("conversa", "chat")) + "-" + new Date().toISOString().slice(0, 10) + ".xlsx";
    }

    function msgHtml(m, i) {
      var editable = m.role === "user" && m.prompt != null && !chat.busy;
      var r = m.report != null ? ' data-r="' + m.report + '"' : "";
      return '<div class="md-ai-msg md-ai-' + m.role + (chat.editing === i ? " md-ai-editing" : "") + '">' +
        (m.role === "bot" ? '<div class="md-ai-md">' + mdLite(m.text, i) + "</div>" + answerActs(m, i) : esc(m.text)) +
        (editable ? '<button class="md-ai-edit" data-ai="edit" data-i="' + i + '"' + hint(T("Editar esta pergunta e enviar de novo", "Edit this question and send it again"), "end") + ">✎</button>" : "") +
        (m.html || r ? '<div class="md-ai-acts"><button class="md-ai-chip md-ai-chip-main" data-ai="html-download"' + r + ">" + T("⬇ Baixar HTML", "⬇ Download HTML") + "</button>" +
          '<button class="md-ai-chip" data-ai="html-open"' + r + ">" + T("↗ Abrir em nova aba", "↗ Open in new tab") + "</button></div>" : "") + "</div>";
    }

    function render() {
      if (!ui) return;
      var log = ui.log;
      if (chat.showContext) {
        var keepScroll = log.scrollTop;
        log.innerHTML = contextHtml();
        log.scrollTop = keepScroll;
        return renderChrome();
      } else if (!chat.log.length) {
        var talk = chat.render === "chat";
        log.innerHTML = '<div class="md-ai-hello"><div class="md-ai-hello-ico">✨</div><b>' + T("Olá! Como posso ajudar?", "Hi! How can I help?") + "</b>" +
          "<p>" + (talk
            ? T("Pergunte o que quiser sobre os dados do app. Eu consulto os números no Qlik e respondo em texto; se você pedir um gráfico ou relatório, gero também uma página HTML Complexo.",
              "Ask anything about the app's data. I query the numbers in Qlik and answer in text; if you ask for a chart or report, I also generate a Complex HTML page.")
            : T("Eu leio os campos do seu app e monto painéis. Diga o que você quer ver; o formato é o escolhido abaixo (passe o mouse para ver o que cada um faz).",
              "I read your app's fields and build dashboards. Tell me what you want to see; the format is the one selected below (hover to see what each one does).")) + "</p></div>" +
          '<div class="md-ai-chips">' + suggestions(talk ? "chat" : "build").map(function (s) { return '<button class="md-ai-chip" data-ai="suggest" data-text="' + esc(s) + '">' + esc(s) + "</button>"; }).join("") + "</div>";
      } else {
        log.innerHTML = chat.log.map(msgHtml).join("") + (chat.busy ? '<div class="md-ai-msg md-ai-bot md-ai-busy"></div>' : "");
        updateBusy();
      }
      log.scrollTop = log.scrollHeight;
      renderChrome();
    }

    function renderChrome() {
      var cfg = ctx.cfg(), p = ai.provider(cfg.aiProvider);
      ui.keyBox.innerHTML = ai.getKey(cfg.aiProvider)
        ? '<div class="md-ai-row"><span>🔑 ' + esc(p.label) + " · " + esc(modelOf(cfg)) + '</span><button class="md-ai-chip" data-ai="forget"' + hint(T("Apaga a chave salva neste navegador para colar outra", "Deletes the key saved in this browser so you can paste another one"), "up-end") + ">" + T("trocar chave", "change key") + "</button></div>"
        : "<div>" + T("Cole sua chave do {p} ({s}). Ela fica salva só neste navegador e não vai para o app.", "Paste your {p} key ({s}). It is saved only in this browser and never goes into the app.", { p: esc(p.label), s: esc(p.keySite) }) + "</div>" +
          '<div class="md-ai-row"><input type="password" data-ai="keyinput" placeholder="' + esc(p.keyHint) + '" autocomplete="off"><button class="md-ai-send" data-ai="savekey">' + T("Salvar", "Save") + "</button></div>";
      ui.editBar.innerHTML = chat.editing != null
        ? "<span>" + T("✎ Editando uma pergunta anterior. Ajuste o texto e envie.", "✎ Editing a previous question. Adjust the text and send.") + '</span><button class="md-ai-chip" data-ai="edit-cancel">' + T("Cancelar", "Cancel") + "</button>" : "";
      ui.modeHint.innerHTML = chat.modePending
        ? "<span>" + T("O painel atual continua como está. O modo {m} vale a partir do próximo pedido.", "The current dashboard stays as it is. {m} mode applies from your next request.", { m: modeName(chat.render) }) + "</span>" +
          '<button class="md-ai-chip" data-ai="redo-mode"' + hint(T("Refaz o painel atual no novo modo, sem chamar a IA", "Redoes the current dashboard in the new mode, without calling the AI"), "up-end") + ">" + T("Refazer agora", "Redo now") + "</button>" : "";
      Array.prototype.forEach.call(ui.panel.querySelectorAll('[data-ai="mode"]'), function (b) {
        var on = b.getAttribute("data-mode") === chat.render;
        b.classList.toggle("md-on", on);
        b.setAttribute("aria-selected", on ? "true" : "false");
      });
      var whereBtn = ui.panel.querySelector('[data-ai="where"]'), whereTip = ui.where === "win"
        ? T("Trazer o assistente para dentro da página, flutuando sobre a pasta", "Bring the assistant into the page, floating over the sheet")
        : T("Abrir o assistente numa janela separada do navegador", "Open the assistant in a separate browser window");
      whereBtn.textContent = ui.where === "win" ? "▣" : "⧉";
      whereBtn.setAttribute("data-hint", whereTip);
      whereBtn.setAttribute("aria-label", whereTip);
      ui.panel.querySelector('[data-ai="sub"]').textContent = T("Modo {m}", "{m} mode", { m: modeName(chat.render) });
      ui.input.placeholder = placeholder(chat.render) + T(" (↑ recupera a última pergunta)", " (↑ recalls the last question)");
      ui.sendBtn.disabled = chat.busy;
      ui.fileName.textContent = chat.image ? "🖼 " + chat.image.name : T("Enter envia · Shift+Enter quebra a linha", "Enter sends · Shift+Enter adds a line");
      ui.fileName.classList.toggle("md-ai-file", !!chat.image);
    }

    function userContent(text) {
      var specJson = ctx.getSpecJson();
      return appinfo.selections(qlik.currApp()).then(function (sel) {
        var snap = dash.snapshot(ctx.state.dash);
        var parts = ["Pedido do usuário:\n" + text, "Painel atual (JSON):\n" + (specJson || "(nenhum painel ainda)")];
        parts.push("Modo de visualização escolhido: " + (chat.render === "chat"
          ? "Conversa: o usuário quer a informação, não um painel. Responda em `reply` com os números reais (use `queries` para buscá-los). Deixe `changed` false e devolva o painel atual sem mudanças — a não ser que o usuário peça um gráfico, visual, HTML, relatório, página ou download: aí monte também `dashboard` com `changed` true, focado na resposta. Ele NÃO substitui o painel da pasta: vira uma página HTML Complexo estática (para baixar), entregue junto com a sua resposta em texto. Nesse caso use `filters` para fixar os períodos e recortes, `sidebar` [] e `series` para indicadores que não podem ser segmentados por período."
          : chat.render === "qlik"
          ? "objetos nativos do Qlik criados na pasta (calor vira tabela pivô e funil vira barras horizontais; prefira os outros gráficos)."
          : chat.render === "simples"
          ? "HTML Complexo: uma página estática com os dados extraídos agora, que NÃO reage às seleções do Qlik. Os períodos e recortes pedidos precisam estar no próprio painel: use `filters` para fixar os períodos (ex.: Ano, Mês) e os recortes (não use `selections` nem `sidebar`), e mostre o período como dimensão quando o usuário quiser comparar períodos. Para indicadores que não podem ser segmentados por período, monte o bloco com `series` (values [] + o ano em `filters` já basta: a extensão encontra os períodos sozinha) — não use `queries` só para descobrir períodos. Entregue o painel nesta resposta, com `changed` true. As seleções atuais abaixo não valem para este painel."
          : "visuais em HTML desenhados pela extensão."));
        parts.push("Seleções atuais no app:\n" + (sel.length ? sel.join("\n") : "(nenhuma)"));
        if (snap) parts.push("Valores que os blocos estão mostrando agora:\n" + snap);
        return parts.join("\n\n");
      });
    }

    // Mostra a etapa atual e o tempo decorrido, para nunca parecer travado.
    function updateBusy() {
      var el = ui && ui.log.querySelector(".md-ai-busy");
      if (el) el.textContent = (chat.status || T("Trabalhando…", "Working…")) + " (" + Math.round((Date.now() - chat.started) / 1000) + "s)";
    }

    function stage(text, quiet) {
      chat.status = text;
      if (!quiet) console.info("DashBuilder AI: " + text);
      updateBusy();
    }

    function converse(cfg, schemaText, retries, rounds) {
      var label = ai.provider(cfg.aiProvider).label + " (" + modelOf(cfg) + ")";
      stage(T("Aguardando o {l} pensar…", "Waiting for {l} to think…", { l: label }));
      return ai.send({
        provider: cfg.aiProvider, key: ai.getKey(cfg.aiProvider), model: modelOf(cfg), effort: cfg.aiEffort,
        system: systemPrompt(schemaText), history: chat.history, schema: SPEC_SCHEMA,
        onProgress: function (chars) { if (chars) stage(T("Recebendo o painel do {l}… {c} caracteres", "Receiving the dashboard from {l}… {c} characters", { l: label, c: chars }), true); }
      }).then(function (res) {
        chat.history.push({ role: "assistant", raw: res.raw });
        var out = res.json, qs = query.normalize(out.queries, chat.years);
        if (qs.length && rounds > 0) {
          chat.log.push({ role: "note", text: T("🔎 Consultando no Qlik: {q}", "🔎 Querying Qlik: {q}", { q: qs.map(function (q) { return q.label; }).join(" · ") }) });
          render();
          return query.run(qs, stage).then(function (res) {
            chat.turnTables = chat.turnTables.concat(res.tables);
            chat.history.push({ role: "user", parts: [{ type: "text", text: "Resultados das consultas, calculados agora no Qlik:\n\n" + res.text +
              "\n\nResponda ao pedido do usuário com esses números." + (chat.render === "chat" ? "" : " Se o pedido é um painel ou página, entregue-o agora completo, com `changed` true.") +
              (rounds > 1 ? "" : " Não peça mais consultas (`queries` []).") }] });
            return converse(cfg, schemaText, retries, rounds - 1);
          });
        }
        var asked = Array.isArray(out.queries) && out.queries.length;
        if (!out.changed && !qs.length && rounds > 0 && (asked || PROMISE.test(out.reply || ""))) {
          stage(T("A IA prometeu buscar os dados mas não pediu nada; cobrando a resposta…", "The AI promised to fetch the data but asked for nothing; asking it for the answer…"));
          chat.history.push({ role: "user", parts: [{ type: "text", text: (asked
            ? "Nenhuma das `queries` é válida: cada uma precisa de pelo menos uma medida (ou dimensões, para listar valores), e `series` exige medida. "
            : "Você disse que ia consultar ou gerar, mas não devolveu `queries` nem o painel. ") +
            (chat.render === "chat" ? "Devolva agora as `queries` necessárias ou a resposta final." : "Entregue agora o painel completo com `changed` true (use `series` com values [] e o ano em `filters` para indicadores por período), ou `queries` válidas se faltar algum dado.") }] });
          return converse(cfg, schemaText, retries, rounds - 1);
        }
        if (!out.changed && !cleanSelections(out.selections).length) return out;
        stage(T("Conferindo as expressões e o filtro no Qlik…", "Checking the expressions and the filter in Qlik…"));
        // Confere as expressões já com o filtro do painel aplicado, que é o que vai para o Qlik.
        var final = dash.parse(JSON.stringify(out.dashboard)) || out.dashboard, app = qlik.currApp();
        var sel = cleanSelections(out.selections), sideFields = (final.sidebar || []).map(function (f) { return { field: f.field, values: [] }; });
        (final.tiles || []).forEach(function (t) { if (t.series) sideFields.push({ field: t.series.field, values: t.series.values }); });
        return Promise.all([appinfo.checkDashboard(app, final), appinfo.checkFilters(app, (final.filters || []).concat(sel, sideFields))]).then(function (r) {
          var errors = r[0].concat(r[1]);
          if (!errors.length || retries <= 0) return out;
          chat.log.push({ role: "note", text: T("O Qlik encontrou {n} problema(s) nas expressões ou no filtro. Pedindo correção à IA…", "Qlik found {n} problem(s) in the expressions or the filter. Asking the AI to fix them…", { n: errors.length }) });
          render();
          chat.history.push({ role: "user", parts: [{ type: "text", text: "O Qlik encontrou estes problemas:\n" + errors.join("\n") + "\nCorrija usando apenas campos e valores que existem no modelo e devolva o painel completo." }] });
          return converse(cfg, schemaText, retries - 1, rounds);
        });
      }, function (err) {
        var last = chat.history[chat.history.length - 1];
        if (last && last.role === "user") chat.history.pop();
        throw err;
      });
    }

    function send(text) {
      text = String(text || "").trim();
      if (chat.busy || (!text && !chat.image)) return;
      var cfg = ctx.cfg(), image = chat.image;
      if (!ai.getKey(cfg.aiProvider)) { chat.log.push({ role: "err", text: T("Salve sua chave da API antes de enviar.", "Save your API key before sending.") }); return render(); }
      // Cada provedor tem seu próprio formato de histórico; ao trocar, a conversa recomeça.
      if (chat.provider && chat.provider !== cfg.aiProvider && chat.history.length) {
        chat.history = [];
        chat.log.push({ role: "note", text: T("Provedor trocado para {p}. Começando uma conversa nova.", "Provider changed to {p}. Starting a new conversation.", { p: ai.provider(cfg.aiProvider).label }) });
      }
      chat.provider = cfg.aiProvider;
      chat.image = null;
      chat.busy = true;
      chat.started = Date.now();
      chat.status = T("Lendo a estrutura do app…", "Reading the app structure…");
      chat.editing = null;
      chat.draft = "";
      chat.showContext = false;
      chat.log.push({ role: "user", text: (text || T("(veja a imagem)", "(see the image)")) + (image ? "\n🖼 " + image.name : ""), prompt: text || null });
      chat.years = extract.yearsIn(text);
      chat.turnTables = [];
      if (ui) ui.input.value = "";
      render();
      var ticker = setInterval(updateBusy, 1000);
      loadSchema(cfg).then(function (schemaText) {
        stage(T("Lendo as seleções atuais…", "Reading the current selections…"));
        return userContent(text || "Monte um painel inspirado na imagem anexada.").then(function (body) {
          var parts = [];
          if (image) parts.push({ type: "image", mime: image.type, data: image.data });
          parts.push({ type: "text", text: body });
          chat.history.push({ role: "user", parts: parts });
          return converse(cfg, schemaText, 1, 2);
        });
      }).then(function (out) {
        chat.log.push({ role: "bot", text: out.reply || T("Pronto.", "Done."), tables: chat.turnTables });
        var target = out.changed && out.dashboard ? out.dashboard : null;
        lockYears(target);
        if (chat.render === "chat") return report(target).then(function () { return applySelections(cleanSelections(out.selections)); });
        // Série por período (ou pedido explícito) só existe no HTML Complexo: troca o modo e avisa.
        var needSimple = !!out.useSimples || !!(target && (target.tiles || []).some(function (t) { return t && t.series && String(t.series.field || "").trim(); }));
        if (target && needSimple && chat.render !== "simples") {
          chat.render = "simples";
          chat.modePending = false;
          chat.log.push({ role: "note", text: T("Como esse indicador só pode ser calculado período a período, gerei em 📄 HTML Complexo: cada período foi extraído isolado e a série foi consolidada numa página para baixar ou abrir.",
            "Since this indicator can only be calculated period by period, I generated it as 📄 Complex HTML: each period was extracted on its own and the series was consolidated into a page to download or open.") });
        }
        var sel = chat.render === "simples" ? [] : cleanSelections(out.selections);
        if (!target && sel.length) target = currentSpec();
        // Todo campo selecionado aparece na coluna de filtros, para o usuário ver e desmarcar.
        var grew = target ? addToSidebar(target, sel) : false;
        var applied = Promise.resolve();
        if (target && (out.changed || grew)) {
          var prev = ctx.getSpecJson();
          if (prev) chat.undo.push(prev);
          target.render = chat.render;
          if (chat.render === "qlik") stage(T("Criando os objetos na pasta…", "Creating the objects on the sheet…"));
          applied = apply(JSON.stringify(target));
        }
        return applied.then(function () { return applySelections(sel); });
      }).catch(function (err) {
        console.error("DashBuilder AI:", err);
        chat.log.push({ role: "err", text: err && err.message ? err.message : String(err) });
      }).then(function () {
        clearInterval(ticker);
        chat.busy = false;
        render();
      });
    }

    // Séries do painel presas aos anos citados na pergunta (a IA às vezes inclui outros anos).
    function lockYears(target) {
      if (!target || !chat.years.length) return;
      (target.tiles || []).forEach(function (t) {
        if (!t || !t.series || !String(t.series.field || "").trim()) return;
        t.series.values = extract.keepYears(Array.isArray(t.series.values) ? t.series.values : [], chat.years);
        t.series.years = chat.years.slice();
      });
    }

    // Modo Conversa: um visual pedido no meio da conversa vira uma página HTML Complexo própria,
    // sem tocar no painel da pasta.
    function report(target) {
      if (!target || !Array.isArray(target.tiles) || !target.tiles.length) return Promise.resolve();
      var json = JSON.stringify(Object.assign({}, target, { render: "simples", sidebar: [] })), idx = chat.reports.push(json) - 1;
      stage(T("Montando o HTML Complexo…", "Building the Complex HTML…"));
      return Promise.resolve(ctx.buildReport(json)).then(function (r) {
        chat.log.push({ role: "note", report: idx, text: T("🧩 HTML Complexo pronto: {n} bloco(s) com os dados de {d}. O painel da pasta não foi alterado.", "🧩 Complex HTML ready: {n} tile(s) with data as of {d}. The sheet dashboard was not changed.", { n: r.tiles, d: r.at.toLocaleString(i18n.locale()) }) });
      }, function (e) {
        chat.log.push({ role: "err", text: T("Não consegui montar o HTML Complexo: {e}", "Could not build the Complex HTML: {e}", { e: e && e.message ? e.message : e }) });
      });
    }

    function onClick(ev) {
      ev.stopPropagation();
      var btn = ev.target.closest("[data-ai]");
      if (!btn || !ui) return;
      switch (btn.getAttribute("data-ai")) {
        case "close": close(); break;
        case "where":
          chat.where = ui.where === "win" ? "float" : "win";
          pref(PREF_WHERE, chat.where);
          place(chat.where);
          break;
        case "send": send(ui.input.value); break;
        case "suggest": send(btn.getAttribute("data-text")); break;
        case "mode": setMode(btn.getAttribute("data-mode")); break;
        case "redo-mode": redoInMode(); break;
        case "html-download":
        case "html-open":
          var ri = btn.getAttribute("data-r");
          Promise.resolve(ctx.exportHtml(btn.getAttribute("data-ai"), ui.panel.ownerDocument.defaultView, ri != null ? chat.reports[+ri] : null)).catch(function (e) {
            chat.log.push({ role: "err", text: T("Não consegui gerar o HTML: {e}", "Could not generate the HTML: {e}", { e: e && e.message ? e.message : e }) });
            render();
          });
          break;
        case "copy-msg":
          var cm = chat.log[+btn.getAttribute("data-i")], body = btn.closest(".md-ai-msg").querySelector(".md-ai-md").cloneNode(true);
          Array.prototype.forEach.call(body.querySelectorAll("button"), function (b) { b.parentNode.removeChild(b); });
          copyRich(body.innerHTML, String(cm.text).replace(/\*\*/g, ""), btn);
          break;
        case "copy-table":
          var ct = replyTables(chat.log[+btn.getAttribute("data-i")].text)[+btn.getAttribute("data-t")];
          if (ct) copyRich(tableHtml(ct), tableTsv(ct), btn);
          break;
        case "xlsx":
          var xi = +btn.getAttribute("data-i"), xt = tablesOf(chat.log[xi]);
          try { xlsx.download(xt, fileName(xi), ui.panel.ownerDocument); } catch (e) {
            chat.log.push({ role: "err", text: T("Não consegui gerar o Excel: {e}", "Could not generate the Excel file: {e}", { e: e && e.message ? e.message : e }) });
            render();
          }
          break;
        case "edit": edit(+btn.getAttribute("data-i")); break;
        case "edit-cancel": cancelEdit(); break;
        case "savekey":
          var k = ui.panel.querySelector('[data-ai="keyinput"]').value.trim();
          if (k) ai.setKey(ctx.cfg().aiProvider, k);
          render();
          break;
        case "forget": ai.setKey(ctx.cfg().aiProvider, ""); render(); break;
        case "new": chat.history = []; chat.log = []; chat.reports = []; chat.schemaText = null; chat.showContext = false; chat.editing = null; render(); break;
        case "context": if (chat.showContext) { chat.showContext = false; render(); } else showContext(false); break;
        case "ctx-reload": showContext(true); break;
        case "ctx-close": chat.showContext = false; render(); break;
        case "undo":
          if (!chat.undo.length) { chat.log.push({ role: "note", text: T("Não há versão anterior para voltar.", "There is no previous version to go back to.") }); render(); break; }
          chat.log.push({ role: "note", text: T("Painel voltou para a versão anterior.", "Dashboard restored to the previous version.") });
          apply(chat.undo.pop());
          break;
      }
    }

    function onFile(ev) {
      var file = ev.target.files && ev.target.files[0];
      ev.target.value = "";
      if (!file) return;
      if (IMAGE_TYPES.indexOf(file.type) < 0 || file.size > 5 * 1024 * 1024) {
        chat.log.push({ role: "err", text: T("Use uma imagem PNG, JPG, GIF ou WEBP de até 5 MB.", "Use a PNG, JPG, GIF or WEBP image up to 5 MB.") });
        return render();
      }
      var reader = new FileReader();
      reader.onload = function () {
        chat.image = { name: file.name, type: file.type, data: String(reader.result).split(",")[1] };
        render();
      };
      reader.readAsDataURL(file);
    }

    syncMode();
    // Objeto recriado com o assistente aberto: volta para a mesma janela ou posição.
    if (chat.open) {
      if (chat.placed === "float") openFloat();
      else if (!(chat.win && !chat.win.closed && openWindow())) chat.open = false;
      render();
    }
    return {
      open: open,
      refresh: function () { if (!chat.busy) syncMode(); render(); },
      destroy: destroy
    };
  }

  return { mount: mount, SPEC_SCHEMA: SPEC_SCHEMA };
});
