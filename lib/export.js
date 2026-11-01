define(["./i18n"], function (i18n) {
  "use strict";

  var T = i18n.T;

  function csvCell(v) {
    var s = String(v == null ? "" : v);
    return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  // CSV com ";" e vírgula decimal, que o Excel em pt-BR abre direto.
  function toCsv(model) {
    var lines = [model.dims.concat(model.meas).map(function (c) { return csvCell(c.label); }).join(";")];
    model.rows.forEach(function (row) {
      lines.push(row.map(function (cell, i) {
        if (i >= model.dims.length && isFinite(cell.qNum)) return String(cell.qNum).replace(".", ",");
        return csvCell(cell.qText);
      }).join(";"));
    });
    return "﻿" + lines.join("\r\n");
  }

  function download(name, content, type) {
    var url = URL.createObjectURL(new Blob([content], { type: type }));
    var a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function exportCsv(model, title) {
    download((title || T("dados", "data")) + ".csv", toCsv(model), "text/csv;charset=utf-8");
  }

  // Imprime só o conteúdo do objeto num iframe oculto; o usuário escolhe "Salvar como PDF".
  function exportPdf(contentEl, styleText, title) {
    var frame = document.createElement("iframe");
    frame.style.cssText = "position:fixed;width:0;height:0;border:0;right:0;bottom:0";
    document.body.appendChild(frame);
    var doc = frame.contentDocument;
    doc.open();
    doc.write("<!doctype html><html><head><meta charset=\"utf-8\"><title></title></head><body></body></html>");
    doc.close();
    doc.title = title || "Qlik DashBuilder AI";
    var style = doc.createElement("style");
    style.textContent = styleText + "\n@page { margin: 12mm; } body { font-family: Arial, sans-serif; }";
    doc.head.appendChild(style);
    doc.body.appendChild(doc.importNode(contentEl, true));
    setTimeout(function () {
      frame.contentWindow.focus();
      frame.contentWindow.print();
      setTimeout(function () { frame.remove(); }, 1000);
    }, 200);
  }

  return { exportCsv: exportCsv, exportPdf: exportPdf };
});
