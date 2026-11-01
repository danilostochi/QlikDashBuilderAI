define(["qlik"], function (qlik) {
  "use strict";

  var SAFE_URL = /^(https?:|mailto:)/i;

  function isEditMode() {
    try { return qlik.navigation && qlik.navigation.getMode && qlik.navigation.getMode() === "edit"; } catch (e) { return false; }
  }

  function toValue(v) {
    return v !== "" && isFinite(v) ? +v : v;
  }

  // Executa uma ação declarada no HTML via data-action="..." (+ data-field, data-value etc.).
  function run(el, ctx) {
    var d = el.dataset, app = qlik.currApp();
    switch (d.action) {
      case "select": return app.field(d.field).selectValues(String(d.value).split("|").map(toValue), d.toggle === "true");
      case "search": return app.field(d.field).selectMatch(d.value, d.toggle === "true");
      case "clear": return d.field ? app.field(d.field).clear() : app.clearAll();
      case "clear-all": return app.clearAll();
      case "lock": return d.field ? app.field(d.field).lock() : app.lockAll();
      case "unlock": return d.field ? app.field(d.field).unlock() : app.unlockAll();
      case "back": return app.back();
      case "forward": return app.forward();
      case "variable":
        return isFinite(d.value) && d.value !== "" ? app.variable.setNumValue(d.name, +d.value) : app.variable.setStringValue(d.name, d.value || "");
      case "bookmark": return app.bookmark.apply(d.id);
      case "sheet":
        if (d.sheet === "next") return qlik.navigation.nextSheet();
        if (d.sheet === "prev") return qlik.navigation.prevSheet();
        if (d.sheet === "first") return qlik.navigation.firstSheet();
        if (d.sheet === "last") return qlik.navigation.lastSheet();
        return qlik.navigation.gotoSheet(d.sheet);
      case "url":
        if (SAFE_URL.test(d.url || "")) window.open(d.url, "_blank", "noopener");
        return;
      case "export-csv": return ctx.exportCsv();
      case "export-pdf": return ctx.exportPdf();
    }
  }

  return { run: run, isEditMode: isEditMode };
});
