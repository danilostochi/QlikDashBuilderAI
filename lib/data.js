define([], function () {
  "use strict";

  var CELLS_PER_PAGE = 10000; // limite do engine por chamada de getData

  // Busca todas as linhas do hipercubo (até maxRows), paginando além do fetch inicial.
  function fetchAll(backendApi, layout, maxRows) {
    var hc = layout.qHyperCube;
    var width = hc.qSize.qcx;
    var target = Math.min(hc.qSize.qcy, maxRows);
    var rows = [];
    (hc.qDataPages || []).forEach(function (p) { rows = rows.concat(p.qMatrix); });
    rows = rows.slice(0, target);
    var pageHeight = Math.max(1, Math.floor(CELLS_PER_PAGE / Math.max(width, 1)));

    function next() {
      if (rows.length >= target) return Promise.resolve();
      var height = Math.min(pageHeight, target - rows.length);
      return Promise.resolve(
        backendApi.getData([{ qTop: rows.length, qLeft: 0, qWidth: width, qHeight: height }])
      ).then(function (pages) {
        var matrix = pages && pages[0] ? pages[0].qMatrix : [];
        if (!matrix.length) return;
        rows = rows.concat(matrix);
        return next();
      });
    }

    return next().then(function () { return buildModel(hc, rows); });
  }

  function buildModel(hc, rows) {
    var dims = hc.qDimensionInfo.map(function (d) { return { label: d.qFallbackTitle }; });
    var meas = hc.qMeasureInfo.map(function (m) { return { label: m.qFallbackTitle }; });
    var max = meas.map(function (_, i) {
      var col = dims.length + i;
      return rows.reduce(function (acc, r) {
        var n = r[col] && r[col].qNum;
        return typeof n === "number" && isFinite(n) && n > acc ? n : acc;
      }, 0);
    });
    return {
      dims: dims,
      meas: meas,
      rows: rows,
      max: max,
      totals: hc.qGrandTotalRow || [],
      truncated: rows.length < hc.qSize.qcy
    };
  }

  return { fetchAll: fetchAll, buildModel: buildModel };
});
