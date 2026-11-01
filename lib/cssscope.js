define([], function () {
  "use strict";

  var GROUP_AT = /^@(media|supports|container|layer)\b/i;

  function matchBrace(css, open) {
    for (var depth = 0, i = open; i < css.length; i++) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}" && --depth === 0) return i;
    }
    return css.length;
  }

  function prefixSelector(sel, prefix) {
    return sel.split(",").map(function (s) {
      s = s.trim();
      if (!s) return "";
      if (/^(:root|html|body)\b/.test(s)) return s.replace(/^(:root|html|body)/, prefix);
      return prefix + " " + s;
    }).filter(Boolean).join(", ");
  }

  // Prefixa cada seletor com o escopo do objeto, para o CSS não vazar para o resto do Qlik.
  // Não depende de CSS aninhado, então funciona também em navegadores antigos.
  function scope(css, prefix) {
    css = String(css || "").replace(/\/\*[\s\S]*?\*\//g, "");
    var out = "", i = 0;
    while (i < css.length) {
      var open = css.indexOf("{", i);
      if (open < 0) break;
      var head = css.slice(i, open);
      var semi = head.lastIndexOf(";");
      if (semi >= 0) head = head.slice(semi + 1); // descarta @import/@charset soltos
      head = head.trim();
      var close = matchBrace(css, open);
      var inner = css.slice(open + 1, close);
      if (GROUP_AT.test(head)) out += head + " {\n" + scope(inner, prefix) + "}\n";
      else if (head.charAt(0) === "@") out += head + " {" + inner + "}\n";
      else if (head) out += prefixSelector(head, prefix) + " {" + inner + "}\n";
      i = close + 1;
    }
    return out;
  }

  return { scope: scope };
});
