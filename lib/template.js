define(["./util"], function (u) {
  "use strict";

  var esc = u.esc;
  var ROWS_BLOCK = /\{\{#rows\}\}([\s\S]*?)\{\{\/rows\}\}/g;
  var TOKEN = /\{\{\s*([\w.]+)\s*\}\}/g;
  var CELL = /^(d|m)(\d+)(?:\.(\w+))?$/;
  var META = /^(label|total|max)\.(d|m)(\d+)$/;

  function resolve(key, model, row, index) {
    if (key === "count") return esc(model.rows.length);
    if (key === "index") return row ? esc(index + 1) : "";

    var meta = META.exec(key);
    if (meta) {
      var n = +meta[3], list = meta[2] === "d" ? model.dims : model.meas;
      if (meta[1] === "label") return esc(list[n] ? list[n].label : "");
      if (meta[2] !== "m") return "";
      if (meta[1] === "total") return esc(model.totals[n] ? model.totals[n].qText : "");
      return esc(model.max[n] != null ? model.max[n] : "");
    }

    var cell = CELL.exec(key);
    if (!cell || !row) return "";
    var idx = +cell[2];
    var c = row[cell[1] === "d" ? idx : model.dims.length + idx];
    if (!c) return "";
    var numeric = typeof c.qNum === "number" && isFinite(c.qNum);
    switch (cell[3]) {
      case undefined:
      case "text": return esc(c.qText);
      case "num": return numeric ? esc(c.qNum) : "";
      case "compact": return numeric ? esc(u.compact(c.qNum)) : esc(c.qText);
      case "pct":
        var max = model.max[idx];
        return cell[1] === "m" && max > 0 && numeric ? (Math.max(0, c.qNum) / max * 100).toFixed(2) : "0";
      case "select":
        return cell[1] === "d" && c.qElemNumber >= 0 ? 'data-md-sel="' + idx + ":" + c.qElemNumber + '"' : "";
      default: return "";
    }
  }

  function render(src, model) {
    var expanded = String(src || "").replace(ROWS_BLOCK, function (_, inner) {
      return model.rows.map(function (row, i) {
        return inner.replace(TOKEN, function (_, key) { return resolve(key, model, row, i); });
      }).join("");
    });
    return expanded.replace(TOKEN, function (_, key) { return resolve(key, model, null, -1); });
  }

  return { render: render };
});
