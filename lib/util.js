define(["./i18n"], function (i18n) {
  "use strict";

  var PALETTES = {
    padrao: ["#1a73e8", "#f28c28", "#26a69a", "#7e57c2", "#5b9bd5", "#e0b23a", "#0d4ea6", "#c2185b"],
    oceano: ["#0ea5e9", "#1e40af", "#22d3ee", "#6366f1", "#0369a1", "#38bdf8", "#312e81", "#67e8f9"],
    floresta: ["#16a34a", "#065f46", "#84cc16", "#0d9488", "#4ade80", "#3f6212", "#a3e635", "#14532d"],
    "por-do-sol": ["#f97316", "#dc2626", "#facc15", "#db2777", "#fb923c", "#9f1239", "#fbbf24", "#7c2d12"],
    grafite: ["#334155", "#64748b", "#0f172a", "#94a3b8", "#475569", "#1e293b", "#cbd5e1", "#020617"]
  };

  // Formatadores por idioma da interface (criados na primeira vez que cada idioma é usado).
  var fmtCache = {};
  function fmts() {
    var loc = i18n.locale();
    return fmtCache[loc] || (fmtCache[loc] = {
      compact: new Intl.NumberFormat(loc, { notation: "compact", maximumFractionDigits: 1 }),
      full: new Intl.NumberFormat(loc, { maximumFractionDigits: 2 }),
      pct: new Intl.NumberFormat(loc, { style: "percent", maximumFractionDigits: 1 })
    });
  }

  // Escapa também "{" para que valores dos dados nunca sejam lidos como tokens do template.
  function esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/\{/g, "&#123;");
  }

  function colors(paletteName, custom) {
    var list = String(custom || "").split(/[,;\s]+/).filter(function (c) { return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c); });
    return list.length ? list : (PALETTES[paletteName] || PALETTES.padrao);
  }

  return {
    PALETTES: PALETTES,
    esc: esc,
    colors: colors,
    compact: function (n) { return fmts().compact.format(n); },
    full: function (n) { return fmts().full.format(n); },
    pct: function (n) { return fmts().pct.format(n); }
  };
});
