define(["./util", "./i18n"], function (u, i18n) {
  "use strict";

  var esc = u.esc;
  var T = i18n.T;

  function selAttr(dimIdx, cell) {
    return cell && cell.qElemNumber >= 0 ? ' data-md-sel="' + dimIdx + ":" + cell.qElemNumber + '"' : "";
  }

  function table(model) {
    var head = model.dims.concat(model.meas).map(function (c) { return "<th>" + esc(c.label) + "</th>"; }).join("");
    var body = model.rows.map(function (row) {
      return "<tr>" + row.map(function (cell, i) {
        var isDim = i < model.dims.length;
        return "<td class=\"" + (isDim ? "md-dim" : "md-num") + "\"" + (isDim ? selAttr(i, cell) : "") + ">" + esc(cell.qText) + "</td>";
      }).join("") + "</tr>";
    }).join("");
    var foot = "";
    if (model.meas.length && model.totals.length) {
      foot = "<tfoot><tr>" + model.dims.map(function (_, i) { return "<td>" + (i === 0 ? esc(T("Total", "Total")) : "") + "</td>"; }).join("") +
        model.totals.map(function (t) { return "<td class=\"md-num\">" + esc(t.qText) + "</td>"; }).join("") + "</tr></tfoot>";
    }
    return "<table class=\"md-table\"><thead><tr>" + head + "</tr></thead><tbody>" + body + "</tbody>" + foot + "</table>";
  }

  // Pivô no cliente: soma a 1ª medida por (dim0 x dim1). Correto apenas para medidas aditivas (Sum, Count).
  function pivot(model) {
    if (model.dims.length < 2 || model.meas.length < 1) {
      return "<div class=\"md-msg\">" + esc(T("O modo pivô precisa de 2 dimensões e 1 medida.", "Pivot mode needs 2 dimensions and 1 measure.")) + "</div>";
    }
    var mCol = model.dims.length;
    var rowKeys = [], colKeys = [], rowCells = {}, cells = {}, rowTot = {}, colTot = {}, grand = 0;
    model.rows.forEach(function (r) {
      var rk = r[0].qText, ck = r[1].qText, v = r[mCol].qNum;
      if (!(rk in rowCells)) { rowKeys.push(rk); rowCells[rk] = r[0]; }
      if (colKeys.indexOf(ck) < 0) colKeys.push(ck);
      if (!isFinite(v)) return;
      cells[rk + "\u0001" + ck] = (cells[rk + "\u0001" + ck] || 0) + v;
      rowTot[rk] = (rowTot[rk] || 0) + v;
      colTot[ck] = (colTot[ck] || 0) + v;
      grand += v;
    });
    var fmt = function (n) { return n == null ? "" : esc(n.toLocaleString(i18n.locale(), { maximumFractionDigits: 2 })); };
    var head = "<tr><th>" + esc(model.dims[0].label) + " / " + esc(model.dims[1].label) + "</th>" +
      colKeys.map(function (c) { return "<th>" + esc(c) + "</th>"; }).join("") + "<th>" + esc(T("Total", "Total")) + "</th></tr>";
    var body = rowKeys.map(function (rk) {
      return "<tr><td class=\"md-dim\"" + selAttr(0, rowCells[rk]) + ">" + esc(rk) + "</td>" +
        colKeys.map(function (ck) { return "<td class=\"md-num\">" + fmt(cells[rk + "\u0001" + ck]) + "</td>"; }).join("") +
        "<td class=\"md-num md-tot\">" + fmt(rowTot[rk]) + "</td></tr>";
    }).join("");
    var foot = "<tr><td>" + esc(T("Total", "Total")) + "</td>" + colKeys.map(function (ck) { return "<td class=\"md-num\">" + fmt(colTot[ck]) + "</td>"; }).join("") +
      "<td class=\"md-num md-tot\">" + fmt(grand) + "</td></tr>";
    return "<table class=\"md-table\"><thead>" + head + "</thead><tbody>" + body + "</tbody><tfoot>" + foot + "</tfoot></table>";
  }

  return { table: table, pivot: pivot };
});
