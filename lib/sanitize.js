define([], function () {
  "use strict";

  var BLOCKED_TAGS = "script,iframe,object,embed,base,meta,link,frame,frameset";
  var URL_ATTRS = ["href", "src", "xlink:href", "action", "formaction"];

  // Remove tags e atributos que executam código antes de inserir o HTML no Qlik.
  function sanitize(html) {
    var doc = new DOMParser().parseFromString("<body>" + html + "</body>", "text/html");
    Array.prototype.forEach.call(doc.body.querySelectorAll(BLOCKED_TAGS), function (el) { el.remove(); });
    Array.prototype.forEach.call(doc.body.querySelectorAll("*"), function (el) {
      Array.prototype.slice.call(el.attributes).forEach(function (attr) {
        var name = attr.name.toLowerCase();
        var value = attr.value.replace(/[\s\u0000-\u001f]/g, "").toLowerCase();
        if (name.indexOf("on") === 0) el.removeAttribute(attr.name);
        else if (URL_ATTRS.indexOf(name) >= 0 && /^(javascript|vbscript|data:text\/html)/.test(value)) el.removeAttribute(attr.name);
      });
    });
    return doc.body.innerHTML;
  }

  return { sanitize: sanitize };
});
