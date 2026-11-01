define(["./lib/charts"], function (charts) {
  "use strict";

  var DEFAULT_HTML = [
    '<div class="painel">',
    '  <div class="topo">',
    '    <div class="kpi"><span>{{label.m0}}</span><strong>{{total.m0}}</strong></div>',
    '    <div class="kpi"><span>Itens</span><strong>{{count}}</strong></div>',
    '    <button data-action="clear-all">Limpar seleções</button>',
    "  </div>",
    '  <div class="grafico" data-chart="area"></div>',
    '  <div class="cards">',
    "  {{#rows}}",
    '    <div class="card" {{d0.select}}>',
    '      <div class="nome">{{d0}}</div>',
    '      <div class="valor">{{m0}}</div>',
    '      <div class="barra"><span style="width: {{m0.pct}}%"></span></div>',
    "    </div>",
    "  {{/rows}}",
    "  </div>",
    "</div>"
  ].join("\n");

  var DEFAULT_CSS = [
    ".painel { padding: 12px; display: flex; flex-direction: column; gap: 12px; }",
    ".topo { display: flex; gap: 12px; align-items: stretch; flex-wrap: wrap; }",
    ".kpi { flex: 1; min-width: 140px; background: linear-gradient(135deg, #2563eb, #7c3aed); color: #fff; border-radius: 12px; padding: 12px 16px; }",
    ".kpi span { font-size: 12px; opacity: .85; display: block; }",
    ".kpi strong { font-size: 26px; }",
    ".topo button { border: 1px solid #cbd5e1; background: #fff; border-radius: 8px; padding: 0 14px; cursor: pointer; }",
    ".grafico { height: 240px; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 8px; }",
    ".cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; }",
    ".card { border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px; cursor: pointer; transition: transform .15s, box-shadow .15s; }",
    ".card:hover { transform: translateY(-2px); box-shadow: 0 6px 16px rgba(15, 23, 42, .08); }",
    ".nome { font-size: 12px; color: #64748b; }",
    ".valor { font-size: 22px; font-weight: 600; margin: 4px 0 8px; color: #0f172a; }",
    ".barra { height: 6px; background: #f1f5f9; border-radius: 3px; overflow: hidden; }",
    ".barra span { display: block; height: 100%; background: #2563eb; border-radius: 3px; }"
  ].join("\n");

  var CHART_OPTIONS = Object.keys(charts.TYPES).map(function (k) {
    return { value: k, label: charts.TYPES[k].label + " — " + charts.TYPES[k].need };
  });

  var LEGACY_MODES = { chart: "Gráfico (galeria)", template: "Template HTML/CSS", table: "Tabela", pivot: "Pivô (2 dimensões + 1 medida)" };
  function modeOf(data) { return (data.md && data.md.mode) || "painel"; }
  function isMode(mode) { return function (data) { return modeOf(data) === mode; }; }
  function usesCharts(data) { return modeOf(data) !== "table" && modeOf(data) !== "pivot"; }
  function notPainel(data) { return modeOf(data) !== "painel" && modeOf(data) !== "dashboard"; }
  function legacyCharts(data) { return notPainel(data) && usesCharts(data); }
  function providerOf(data) { return (data.md && data.md.aiProvider) || "google"; }

  // Rótulos em inglês (md.language = "en"), pela chave do texto em português. Cada item com tradução vira
  // dois itens com o mesmo ref, um por idioma (o painel de propriedades não troca rótulo sozinho).
  var EN = {
    "Modo": "Mode",
    "Painel IA (assistente)": "AI Panel (assistant)",
    "Painel (somente visualização, criado pelo assistente)": "Panel (view only, created by the assistant)",
    "(modo antigo)": "(legacy mode)",
    "Gráfico (galeria)": "Chart (gallery)", "Template HTML/CSS": "HTML/CSS template", "Tabela": "Table",
    "Pivô (2 dimensões + 1 medida)": "Pivot (2 dimensions + 1 measure)",
    "Provedor da IA": "AI provider",
    "Google Gemini (chave do AI Studio)": "Google Gemini (AI Studio key)",
    "Anthropic Claude (chave do Console)": "Anthropic Claude (Console key)",
    "OpenRouter (vários modelos, uma chave)": "OpenRouter (many models, one key)",
    "Modelo do Gemini": "Gemini model", "Modelo do Claude": "Claude model", "Modelo do OpenRouter": "OpenRouter model",
    "Gemini 3.8 Flash (recomendado)": "Gemini 3.8 Flash (recommended)",
    "Gemini 4 Argon (mais inteligente, mais lento)": "Gemini 4 Argon (smarter, slower)",
    "Gemini 3.5 Flash-Lite (mais rápido e barato)": "Gemini 3.5 Flash-Lite (faster and cheaper)",
    "Claude Opus 5.5 (melhor qualidade)": "Claude Opus 5.5 (best quality)",
    "Claude Sonnet 5.5 (mais rápido e barato)": "Claude Sonnet 5.5 (faster and cheaper)",
    "Claude Haiku 5.5 (mais econômico)": "Claude Haiku 5.5 (most economical)",
    "DeepSeek V4.1 Flash (econômico)": "DeepSeek V4.1 Flash (economical)",
    "Outro modelo (opcional, ex.: gemini-3.6-flash ou openai/gpt-6-sol no OpenRouter)": "Other model (optional, e.g. gemini-3.6-flash or openai/gpt-6-sol on OpenRouter)",
    "Profundidade da análise": "Analysis depth",
    "Rápida (recomendado)": "Fast (recommended)", "Equilibrada": "Balanced", "Detalhada (bem mais lenta)": "Detailed (much slower)",
    "Tag dos campos e itens mestres enviados à IA": "Tag of the fields and master items sent to the AI",
    "Variável com o contexto do app": "Variable with the app context",
    "Enviar exemplos de valores dos campos para a IA": "Send sample field values to the AI",
    "Sim": "Yes", "Não (só nomes dos campos)": "No (field names only)",
    "Habilitar nova sessão (HTML Complexo)": "Enable new session (Complex HTML)",
    "Painel (JSON gerado pela IA — editável)": "Panel (AI-generated JSON — editable)",
    "Tipo de gráfico": "Chart type", "HTML (template)": "HTML (template)",
    "Máximo de linhas carregadas": "Maximum rows loaded",
    "Mostrar no objeto": "Show in the object", "Painel completo": "Full panel", "Somente o ícone IA": "AI icon only",
    "Fundo do objeto": "Object background",
    "Automático (transparente quando só o ícone IA)": "Automatic (transparent when AI icon only)",
    "Padrão do tema do Qlik": "Qlik theme default", "Transparente": "Transparent", "Cor personalizada": "Custom color",
    "Cor do fundo": "Background color",
    "Paleta": "Palette", "Padrão": "Default", "Oceano": "Ocean", "Floresta": "Forest", "Pôr do sol": "Sunset", "Grafite": "Graphite",
    "Cores da empresa (ex.: #0055a5, #ffcc00) — substituem as cores da paleta": "Company colors (e.g. #0055a5, #ffcc00) — replace the palette colors",
    "Meta (linha/medidor)": "Target (line/gauge)", "Itens no ranking": "Items in ranking",
    "Rótulos de valor": "Value labels", "Exibir": "Show", "Ocultar": "Hide",
    "Espessura das barras": "Bar thickness", "Espessura das linhas": "Line thickness", "Espessura do anel": "Ring thickness",
    "Animações": "Animations", "Ligadas": "On", "Desligadas": "Off",
    "Botão de exportação (PDF)": "Export button (PDF)"
  };
  function langOf(data) { return (data.md && data.md.language) === "en" ? "en" : "pt"; }
  function en(text) {
    if (EN[text]) return EN[text];
    var m = /^(.*) \(modo antigo\)$/.exec(text);
    return m ? en(m[1]) + " " + EN["(modo antigo)"] : text;
  }
  function enOptions(opts) {
    if (typeof opts === "function") return function (data) { return enOptions(opts(data)); };
    return opts.map(function (o) { return Object.assign({}, o, { label: en(o.label) }); });
  }
  function bilingual(items) {
    var out = {};
    Object.keys(items).forEach(function (k) {
      var it = items[k], show = it.show;
      var hasEn = (typeof it.label === "string" && EN[it.label]) || it.options;
      if (!hasEn || it.ref === "md.language") { out[k] = it; return; }
      var when = function (l) {
        return function (d) { return langOf(d) === l && (typeof show === "function" ? show(d) : show !== false); };
      };
      out[k] = Object.assign({}, it, { show: when("pt") });
      var e = Object.assign({}, it, { show: when("en"), label: en(it.label) });
      if (it.options) e.options = enOptions(it.options);
      out[k + "_en"] = e;
    });
    return out;
  }

  var props = {
    defaults: {
      language: "pt", mode: "painel", dashboard: "", nativeObjects: "", aiProvider: "google", geminiModel: "gemini-3.8-flash", aiModel: "claude-opus-5-5",
      openrouterModel: "google/gemini-3.8-flash",
      aiModelCustom: "", aiEffort: "low", aiSamples: true, aiTag: "I.A", aiContextVar: "vContexto",
      chartType: "colunas", palette: "padrao", customColors: "", target: "", topN: 10,
      showValues: true, barWidth: 0.7, lineWidth: 2.5, ringWidth: 0.38, animate: true,
      html: DEFAULT_HTML, css: DEFAULT_CSS, maxRows: 5000, toolbar: true, iconOnly: false, separateSession: true, bgMode: "auto", bgColor: { index: -1, color: "#ffffff" }
    },
    definition: {
      type: "items",
      component: "accordion",
      items: {
        dimensions: { uses: "dimensions", min: 0, max: 5, show: notPainel },
        measures: { uses: "measures", min: 0, max: 10, show: notPainel },
        sorting: { uses: "sorting", show: notPainel },
        visual: {
          type: "items",
          label: "Qlik DashBuilder AI",
          items: {
            language: {
              ref: "md.language", type: "string", component: "dropdown", label: "Idioma / Language", defaultValue: "pt",
              options: [{ value: "pt", label: "Português (Brasil)" }, { value: "en", label: "English" }]
            },
            mode: {
              ref: "md.mode", type: "string", component: "dropdown", label: "Modo", defaultValue: "painel",
              options: function (data) {
                var list = [
                  { value: "painel", label: "Painel IA (assistente)" },
                  { value: "dashboard", label: "Painel (somente visualização, criado pelo assistente)" }
                ];
                // Modos manuais antigos (MinhaDash): só aparecem num objeto que já usa um deles.
                var legacy = LEGACY_MODES[modeOf(data)];
                return legacy ? list.concat([{ value: modeOf(data), label: legacy + " (modo antigo)" }]) : list;
              }
            },
            aiProvider: {
              ref: "md.aiProvider", type: "string", component: "dropdown", label: "Provedor da IA", defaultValue: "google", show: isMode("painel"),
              options: [
                { value: "google", label: "Google Gemini (chave do AI Studio)" },
                { value: "anthropic", label: "Anthropic Claude (chave do Console)" },
                { value: "openrouter", label: "OpenRouter (vários modelos, uma chave)" }
              ]
            },
            geminiModel: {
              ref: "md.geminiModel", type: "string", component: "dropdown", label: "Modelo do Gemini", defaultValue: "gemini-3.8-flash",
              show: function (d) { return isMode("painel")(d) && providerOf(d) === "google"; },
              options: [
                { value: "gemini-3.8-flash", label: "Gemini 3.8 Flash (recomendado)" },
                { value: "gemini-4-argon", label: "Gemini 4 Argon (mais inteligente, mais lento)" },
                { value: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash-Lite (mais rápido e barato)" }
              ]
            },
            aiModel: {
              ref: "md.aiModel", type: "string", component: "dropdown", label: "Modelo do Claude", defaultValue: "claude-opus-5-5",
              show: function (d) { return isMode("painel")(d) && providerOf(d) === "anthropic"; },
              options: [
                { value: "claude-opus-5-5", label: "Claude Opus 5.5 (melhor qualidade)" },
                { value: "claude-sonnet-5-5", label: "Claude Sonnet 5.5 (mais rápido e barato)" },
                { value: "claude-haiku-5-5", label: "Claude Haiku 5.5 (mais econômico)" }
              ]
            },
            openrouterModel: {
              ref: "md.openrouterModel", type: "string", component: "dropdown", label: "Modelo do OpenRouter", defaultValue: "google/gemini-3.8-flash",
              show: function (d) { return isMode("painel")(d) && providerOf(d) === "openrouter"; },
              options: [
                { value: "google/gemini-3.8-flash", label: "Gemini 3.8 Flash (recomendado)" },
                { value: "anthropic/claude-sonnet-5.5", label: "Claude Sonnet 5.5" },
                { value: "anthropic/claude-opus-5.5", label: "Claude Opus 5.5 (melhor qualidade)" },
                { value: "deepseek/deepseek-v4.1-flash", label: "DeepSeek V4.1 Flash (econômico)" }
              ]
            },
            aiModelCustom: {
              ref: "md.aiModelCustom", type: "string", label: "Outro modelo (opcional, ex.: gemini-3.6-flash ou openai/gpt-6-sol no OpenRouter)", defaultValue: "", show: isMode("painel")
            },
            aiEffort: {
              ref: "md.aiEffort", type: "string", component: "dropdown", label: "Profundidade da análise", defaultValue: "low", show: isMode("painel"),
              options: [{ value: "low", label: "Rápida (recomendado)" }, { value: "medium", label: "Equilibrada" }, { value: "high", label: "Detalhada (bem mais lenta)" }]
            },
            aiTag: {
              ref: "md.aiTag", type: "string", label: "Tag dos campos e itens mestres enviados à IA", defaultValue: "I.A", show: isMode("painel")
            },
            aiContextVar: {
              ref: "md.aiContextVar", type: "string", label: "Variável com o contexto do app", defaultValue: "vContexto", show: isMode("painel")
            },
            aiSamples: {
              ref: "md.aiSamples", type: "boolean", component: "switch", label: "Enviar exemplos de valores dos campos para a IA", defaultValue: true, show: isMode("painel"),
              options: [{ value: true, label: "Sim" }, { value: false, label: "Não (só nomes dos campos)" }]
            },
            separateSession: {
              ref: "md.separateSession", type: "boolean", component: "checkbox", defaultValue: true, show: isMode("painel"),
              label: "Habilitar nova sessão (HTML Complexo)"
            },
            dashboard: {
              ref: "md.dashboard", type: "string", component: "textarea", label: "Painel (JSON gerado pela IA — editável)", rows: 10, maxlength: 200000,
              defaultValue: "", show: function (d) { return isMode("painel")(d) || isMode("dashboard")(d); }
            },
            chartType: {
              ref: "md.chartType", type: "string", component: "dropdown", label: "Tipo de gráfico",
              options: CHART_OPTIONS, defaultValue: "colunas", show: isMode("chart")
            },
            html: {
              ref: "md.html", type: "string", component: "textarea", label: "HTML (template)", rows: 16, maxlength: 100000,
              defaultValue: DEFAULT_HTML, show: isMode("template")
            },
            css: {
              ref: "md.css", type: "string", component: "textarea", label: "CSS", rows: 14, maxlength: 100000, defaultValue: DEFAULT_CSS, show: notPainel
            },
            maxRows: { ref: "md.maxRows", type: "integer", label: "Máximo de linhas carregadas", defaultValue: 5000, min: 1, show: notPainel }
          }
        },
        // Aparência: nos modos do assistente só fica o que tem efeito no painel gerado pela IA
        // (paleta, meta e ranking vêm do pedido). Os modos manuais antigos continuam vendo tudo.
        settings: {
          uses: "settings",
          items: {
            dashbuilder: {
              type: "items",
              label: "Qlik DashBuilder AI",
              items: {
            iconOnly: {
              ref: "md.iconOnly", type: "boolean", component: "switch", label: "Mostrar no objeto", defaultValue: false, show: isMode("painel"),
              options: [{ value: false, label: "Painel completo" }, { value: true, label: "Somente o ícone IA" }]
            },
            bgMode: {
              ref: "md.bgMode", type: "string", component: "dropdown", label: "Fundo do objeto", defaultValue: "auto",
              options: [
                { value: "auto", label: "Automático (transparente quando só o ícone IA)" },
                { value: "padrao", label: "Padrão do tema do Qlik" },
                { value: "transparente", label: "Transparente" },
                { value: "cor", label: "Cor personalizada" }
              ]
            },
            bgColor: {
              ref: "md.bgColor", type: "object", component: "color-picker", label: "Cor do fundo", dualOutput: true,
              defaultValue: { index: -1, color: "#ffffff" },
              show: function (d) { return !!(d.md && d.md.bgMode === "cor"); }
            },
            palette: {
              ref: "md.palette", type: "string", component: "dropdown", label: "Paleta", defaultValue: "padrao", show: legacyCharts,
              options: [
                { value: "padrao", label: "Padrão" }, { value: "oceano", label: "Oceano" }, { value: "floresta", label: "Floresta" },
                { value: "por-do-sol", label: "Pôr do sol" }, { value: "grafite", label: "Grafite" }
              ]
            },
            customColors: {
              ref: "md.customColors", type: "string", defaultValue: "", show: usesCharts,
              label: "Cores da empresa (ex.: #0055a5, #ffcc00) — substituem as cores da paleta"
            },
            target: {
              ref: "md.target", type: "string", expression: "optional", label: "Meta (linha/medidor)", defaultValue: "", show: legacyCharts
            },
            topN: { ref: "md.topN", type: "integer", label: "Itens no ranking", defaultValue: 10, min: 1, show: legacyCharts },
            showValues: {
              ref: "md.showValues", type: "boolean", component: "switch", label: "Rótulos de valor", defaultValue: true, show: usesCharts,
              options: [{ value: true, label: "Exibir" }, { value: false, label: "Ocultar" }]
            },
            barWidth: { ref: "md.barWidth", type: "number", component: "slider", label: "Espessura das barras", min: 0.2, max: 1, step: 0.05, defaultValue: 0.7, show: legacyCharts },
            lineWidth: { ref: "md.lineWidth", type: "number", component: "slider", label: "Espessura das linhas", min: 1, max: 8, step: 0.5, defaultValue: 2.5, show: legacyCharts },
            ringWidth: { ref: "md.ringWidth", type: "number", component: "slider", label: "Espessura do anel", min: 0.1, max: 0.9, step: 0.05, defaultValue: 0.38, show: legacyCharts },
            animate: {
              ref: "md.animate", type: "boolean", component: "switch", label: "Animações", defaultValue: true,
              options: [{ value: true, label: "Ligadas" }, { value: false, label: "Desligadas" }]
            },
            toolbar: {
              ref: "md.toolbar", type: "boolean", component: "switch", label: "Botão de exportação (PDF)", defaultValue: true,
              show: function (d) { return !isMode("painel")(d); },
              options: [{ value: true, label: "Exibir" }, { value: false, label: "Ocultar" }]
            }
              }
            }
          }
        }
      }
    }
  };
  props.definition.items.visual.items = bilingual(props.definition.items.visual.items);
  var ours = props.definition.items.settings.items.dashbuilder;
  ours.items = bilingual(ours.items);
  return props;
});
