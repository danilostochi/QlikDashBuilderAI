define([], function () {
  "use strict";

  // Idioma da interface (propriedade md.language: "pt" ou "en"). Os textos ficam lado a lado no código:
  //   T("Exibindo {n} linhas", "Showing {n} rows", { n: 10 })
  // O paint do objeto chama setLang; quem desenha depois disso já sai no idioma certo.
  var lang = "pt";

  function setLang(l) { lang = l === "en" ? "en" : "pt"; }
  function getLang() { return lang; }
  function isEn() { return lang === "en"; }
  // Para toLocaleString / Intl.
  function locale() { return lang === "en" ? "en-US" : "pt-BR"; }

  function T(pt, en, vars) {
    var s = lang === "en" && en != null ? en : pt;
    if (!vars) return s;
    return s.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? String(vars[k]) : m; });
  }

  return { T: T, setLang: setLang, getLang: getLang, isEn: isEn, locale: locale };
});
