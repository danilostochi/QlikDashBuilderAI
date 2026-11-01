define([], function () {
  "use strict";

  // Funções de agregação que recebem o set analysis do filtro do painel.
  var AGGR = /\b(Sum|Count|Avg|Min|Max|Only|Concat|Median|Mode|Stdev|Skew|Kurtosis|Fractile|FirstSortedValue|MinString|MaxString|NullCount|NumericCount|TextCount|MissingCount)\s*\(/gi;

  function field(name) { return "[" + String(name).replace(/]/g, "]]") + "]"; }
  function literal(v) { return "'" + String(v).replace(/'/g, "''") + "'"; }

  function normalize(list) {
    return (Array.isArray(list) ? list : []).map(function (f) {
      return {
        field: String(f && f.field || "").trim(),
        values: (Array.isArray(f && f.values) ? f.values : []).map(String).filter(function (v) { return v !== ""; }).slice(0, 50),
        exclude: !!(f && f.exclude)
      };
    }).filter(function (f) { return f.field && f.values.length; }).slice(0, 5);
  }

  // Modificadores do set analysis, ex.: [Região]={'Sul','Norte'}, [Status]-={'Cancelado'}
  function modifiers(filters) {
    return filters.map(function (f) { return field(f.field) + (f.exclude ? "-=" : "=") + "{" + f.values.map(literal).join(",") + "}"; }).join(",");
  }

  // Fim de um literal entre aspas a partir de i (aspas dobradas contam como escape).
  function skipQuoted(s, i) {
    var q = s[i];
    for (i++; i < s.length; i++) {
      if (s[i] === q) { if (s[i + 1] === q) { i++; continue; } return i; }
    }
    return s.length;
  }

  // Coloca o filtro do painel em cada agregação da expressão:
  //   Sum(Valor)              -> Sum({<[Região]={'Sul'}>} Valor)
  //   Sum({<Ano={2024}>} V)   -> Sum({<[Região]={'Sul'},Ano={2024}>} V)
  //   Sum({1} V)              -> Sum({1<[Região]={'Sul'}>} V)
  // ignoreSelections (HTML Complexo): o set passa a começar em 1, então as seleções do app não contam.
  //   Sum(Valor) -> Sum({1<[Região]={'Sul'}>} Valor)    Sum({$<Ano={2024}>} V) -> Sum({1<Ano={2024}>} V)
  // Textos entre aspas e nomes entre colchetes são ignorados.
  function apply(expr, filters, ignoreSelections) {
    expr = String(expr || "");
    filters = filters || [];
    if ((!filters.length && !ignoreSelections) || !expr) return expr;
    var mods = modifiers(filters), out = "", i = 0;
    while (i < expr.length) {
      var ch = expr[i];
      if (ch === "'" || ch === '"') { var e = skipQuoted(expr, i); out += expr.slice(i, e + 1); i = e + 1; continue; }
      if (ch === "[") { var c = expr.indexOf("]", i); c = c < 0 ? expr.length : c; out += expr.slice(i, c + 1); i = c + 1; continue; }
      AGGR.lastIndex = i;
      var m = AGGR.exec(expr);
      if (!m || m.index !== i || (i > 0 && /[\w.$]/.test(expr[i - 1]))) { out += ch; i++; continue; }
      out += m[0];
      i += m[0].length;
      var j = i;
      while (j < expr.length && /\s/.test(expr[j])) j++;
      if (expr[j] !== "{") { out += "{" + (ignoreSelections ? "1" : "") + (mods ? "<" + mods + ">" : "") + "} "; continue; }
      var close = expr.indexOf("}", j), lt = expr.indexOf("<", j), hasMods = lt >= 0 && lt < close;
      if (close < 0) continue;
      var ident = expr.slice(j + 1, hasMods ? lt : close).trim();
      if (ignoreSelections && (ident === "" || ident === "$")) ident = "1";
      if (hasMods) {
        // Já tem modificadores: o filtro entra no começo deles.
        out += expr.slice(i, j) + "{" + ident + "<" + (mods ? mods + (expr[lt + 1] === ">" ? "" : ",") : "");
        i = lt + 1;
      } else {
        // Só identificador (1, $, favorito): ganha os modificadores antes do "}".
        out += expr.slice(i, j) + "{" + ident + (mods ? "<" + mods + ">" : "");
        i = close;
      }
    }
    return out;
  }

  function describe(filters) {
    return filters.map(function (f) { return f.field + (f.exclude ? " ≠ " : " = ") + f.values.join(", "); }).join(" · ");
  }

  return { normalize: normalize, apply: apply, describe: describe, field: field, literal: literal };
});
