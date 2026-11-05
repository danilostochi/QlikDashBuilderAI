define(["./util", "./i18n"], function (u, i18n) {
  "use strict";

  var esc = u.esc;
  var T = i18n.T;
  var uidSeq = 0;
  var TEXT = "#595959", MUTED = "#8c8c8c", GRID = "#e0e0e0";

  // ---------- helpers ----------

  function num(cell) {
    return cell && typeof cell.qNum === "number" && isFinite(cell.qNum) ? cell.qNum : null;
  }
  function f(n) { return Math.round(n * 10) / 10; }
  function trunc(s, n) { s = String(s == null ? "" : s); return s.length > n ? s.slice(0, n - 1) + "…" : s; }

  // Largura aproximada do texto a 12px (maiúsculas e negrito ocupam mais), para não vazar do espaço do rótulo.
  function textWidth(s, bold) {
    var w = 0;
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      w += /[A-ZÀ-ÖØ-ÞMW@%]/.test(ch) ? 8.2 : /[mw]/.test(ch) ? 9 : /[ilj.,:;'|! ]/.test(ch) ? 3.6 : /\d/.test(ch) ? 6.8 : 6.4;
    }
    return w * (bold ? 1.07 : 1);
  }

  function fitText(s, px, bold) {
    if (textWidth(s, bold) <= px) return s;
    s = s.replace(/…$/, "");
    while (s.length > 1 && textWidth(s + "…", bold) > px) s = s.slice(0, -1);
    return s.trimEnd() + "…";
  }
  function tip(lines) { return ' data-tip="' + esc(lines.join("\n")) + '"'; }
  function sel(dimIdx, cell) {
    return cell && cell.qElemNumber >= 0 ? ' data-md-sel="' + dimIdx + ":" + cell.qElemNumber + '"' : "";
  }
  function delay(i) { return ' style="animation-delay:' + Math.min(i * 25, 600) + 'ms"'; }
  function text(x, y, s, extra) {
    return '<text x="' + f(x) + '" y="' + f(y) + '"' + (extra || "") + ">" + esc(s) + "</text>";
  }
  function svg(w, h, body, defs) {
    return '<svg class="md-svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + " " + h + '" xmlns="http://www.w3.org/2000/svg">' +
      (defs ? "<defs>" + defs + "</defs>" : "") + body + "</svg>";
  }
  function legend(names, colors) {
    return '<div class="md-legend">' + names.map(function (n, i) {
      return '<span><i style="background:' + colors[i % colors.length] + '"></i>' + esc(n) + "</span>";
    }).join("") + "</div>";
  }
  function message(s) { return '<div class="md-msg">' + esc(s) + "</div>"; }

  function niceTicks(lo, hi, count) {
    if (lo === hi) { hi = lo + 1; }
    var span = hi - lo, step = Math.pow(10, Math.floor(Math.log10(span / count))), err = span / count / step;
    if (err >= 7.5) step *= 10; else if (err >= 3.5) step *= 5; else if (err >= 1.5) step *= 2;
    var t = [];
    for (var v = Math.floor(lo / step) * step; v <= Math.ceil(hi / step) * step + step / 2; v += step) t.push(+v.toFixed(10));
    return t;
  }

  // Curva monotônica (Fritsch–Carlson): suave sem "passar" dos pontos.
  function smooth(p) {
    var n = p.length, i;
    if (n < 2) return n ? "M" + f(p[0].x) + "," + f(p[0].y) : "";
    var d = [], m = [];
    for (i = 0; i < n - 1; i++) d[i] = (p[i + 1].y - p[i].y) / (p[i + 1].x - p[i].x || 1);
    m[0] = d[0]; m[n - 1] = d[n - 2];
    for (i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    for (i = 0; i < n - 1; i++) {
      if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
      var a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
      if (s > 9) { var t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
    }
    var out = "M" + f(p[0].x) + "," + f(p[0].y);
    for (i = 0; i < n - 1; i++) {
      var dx = (p[i + 1].x - p[i].x) / 3;
      out += "C" + f(p[i].x + dx) + "," + f(p[i].y + m[i] * dx) + " " + f(p[i + 1].x - dx) + "," + f(p[i + 1].y - m[i + 1] * dx) + " " + f(p[i + 1].x) + "," + f(p[i + 1].y);
    }
    return out;
  }

  function linScale(ticks, top, bottom) {
    var lo = ticks[0], hi = ticks[ticks.length - 1];
    return function (v) { return bottom - (v - lo) / (hi - lo) * (bottom - top); };
  }

  // Eixos cartesianos com categorias no X. y2 (opcional) desenha um eixo à direita.
  function axes(w, h, lo, hi, labels, y2range, fmt, fmt2, hideY2) {
    fmt = fmt || u.compact;
    fmt2 = fmt2 || fmt;
    var count = Math.max(2, Math.round(h / 55));
    var ticks = niceTicks(Math.min(0, lo), Math.max(0, hi), count);
    var ticks2 = y2range ? niceTicks(Math.min(0, y2range[0]), Math.max(0, y2range[1]), ticks.length - 1) : null;
    var labW = function (t, fm) { return Math.max.apply(null, t.map(function (v) { return fm(v, true).length; })) * 6.5 + 12; };
    var top = 10, bottom = h - 24, left = labW(ticks, fmt), right = w - (ticks2 && !hideY2 ? labW(ticks2, fmt2) : 14);
    var y = linScale(ticks, top, bottom), yb = ticks2 ? linScale(ticks2, top, bottom) : null;
    var n = Math.max(labels.length, 1), bw = (right - left) / n;
    var cx = function (i) { return left + bw * (i + 0.5); };
    var out = "";
    ticks.forEach(function (t) {
      out += '<line x1="' + left + '" x2="' + right + '" y1="' + f(y(t)) + '" y2="' + f(y(t)) + '" stroke="' + (t === 0 ? MUTED : GRID) + '"/>';
      out += text(left - 8, y(t) + 4, fmt(t, true), ' text-anchor="end" class="md-axis"');
    });
    if (ticks2 && !hideY2) ticks2.forEach(function (t) { out += text(right + 8, yb(t) + 4, fmt2(t, true), ' class="md-axis"'); });
    var every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor((right - left) / 64))));
    labels.forEach(function (l, i) {
      if (i % every === 0) out += text(cx(i), bottom + 16, trunc(l, 12), ' text-anchor="middle" class="md-axis"');
    });
    return { top: top, bottom: bottom, left: left, right: right, y: y, y2: yb, bw: bw, cx: cx, svg: out };
  }

  function measureCol(model, i) { return model.dims.length + i; }

  function parseText(t) {
    var s = String(t).replace(/[^\d,.\-]/g, "");
    if (s.indexOf(",") >= 0) s = s.replace(/\./g, "").replace(",", ".");
    else if (/\.\d{3}$/.test(s)) s = s.replace(/\./g, "");
    return parseFloat(s);
  }

  // Formato de exibição de uma medida, copiado da máscara que o Qlik aplicou (qText):
  // "3,56%" vira percentual com 2 casas, "R$ 1.234,00" vira moeda, números pequenos mantêm as casas.
  // fmt(v) para rótulos de valor; fmt(v, true) para o eixo (sem zeros à direita).
  function maskOf(model, i) {
    var col = measureCol(model, i);
    var cells = model.rows.map(function (r) { return r[col]; }).filter(function (c) { return c && num(c) != null && c.qText; }).slice(0, 30);
    var texts = cells.map(function (c) { return String(c.qText); });
    var dec = texts.reduce(function (d, t) {
      var m = /,(\d+)\D*$/.exec(t) || (t.indexOf(",") < 0 ? /\.(\d{1,2})\D*$/.exec(t) : null);
      return Math.max(d, m ? m[1].length : 0);
    }, 0);
    dec = Math.min(dec, 4);
    var nf = function (v, axis, d) {
      return v.toLocaleString(i18n.locale(), { minimumFractionDigits: axis ? 0 : d, maximumFractionDigits: d });
    };
    if (texts.length && texts.filter(function (t) { return /%\s*$/.test(t); }).length >= texts.length / 2) {
      var c0 = cells.filter(function (c) { return /%\s*$/.test(c.qText) && c.qNum; })[0], factor = 100;
      if (c0) {
        var shown = parseText(c0.qText);
        factor = Math.abs(c0.qNum * 100 - shown) <= Math.abs(c0.qNum - shown) ? 100 : 1;
      }
      return function (v, axis) { return nf(v * factor, axis, dec) + "%"; };
    }
    var money = texts.some(function (t) { return /R\$/.test(t); }) ? "R$ " : "";
    var maxAbs = cells.reduce(function (m, c) { return Math.max(m, Math.abs(c.qNum)); }, 0);
    return function (v, axis) {
      if (maxAbs >= 1000 || Math.abs(v) >= 1000) return money + u.compact(v);
      return money + nf(v, axis, Math.max(dec, maxAbs < 1 && !dec ? 2 : dec));
    };
  }

  // Rótulo de um ponto: o texto do Qlik quando é curto (mantém a máscara exata), senão o formatador.
  function valueLabel(cell, fmt) {
    var t = cell && cell.qText != null ? String(cell.qText) : "";
    return t && t.length <= 9 ? t : fmt(cell.qNum);
  }
  function series(model, i) { return model.rows.map(function (r) { return num(r[measureCol(model, i)]); }); }
  function dimLabels(model) { return model.rows.map(function (r) { return r[0].qText; }); }
  function extent(arrays) {
    var all = [].concat.apply([], arrays).filter(function (v) { return v != null; });
    return all.length ? [Math.min.apply(null, all), Math.max.apply(null, all)] : [0, 1];
  }
  function totalOf(model, i) {
    var t = model.totals[i];
    if (t && num(t) != null) return { n: t.qNum, text: t.qText };
    var s = series(model, i).reduce(function (a, v) { return a + (v || 0); }, 0);
    return { n: s, text: u.full(s) };
  }

  // ---------- gráficos ----------

  function lineLike(c, filled) {
    var m = c.model, nM = Math.min(m.meas.length, filled ? 3 : 4);
    var data = [], names = [];
    for (var i = 0; i < nM; i++) { data.push(series(m, i)); names.push(m.meas[i].label); }
    var ex = extent(data.concat(isFinite(c.opts.target) ? [[c.opts.target]] : []));
    var lh = nM > 1 ? 26 : 0;
    var fmt = maskOf(m, 0);
    var a = axes(c.w, c.h - lh, ex[0], ex[1], dimLabels(m), null, fmt);
    var defs = "", body = a.svg, overlay = "";
    data.forEach(function (s, si) {
      var color = c.colors[si % c.colors.length];
      var pts = [];
      s.forEach(function (v, i) { if (v != null) pts.push({ x: a.cx(i), y: a.y(v), i: i }); });
      if (!pts.length) return;
      var ref = isMeta(m.meas[si].label) && nM > 1, path = ref ? pts.map(function (p, k) { return (k ? "L" : "M") + f(p.x) + "," + f(p.y); }).join("") : smooth(pts);
      if (filled && !ref) {
        var gid = c.uid + "g" + si;
        defs += '<linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + color + '" stop-opacity=".45"/><stop offset="1" stop-color="' + color + '" stop-opacity="0"/></linearGradient>';
        body += '<path class="md-a-fade" d="' + path + "L" + f(pts[pts.length - 1].x) + "," + f(a.bottom) + "L" + f(pts[0].x) + "," + f(a.bottom) + 'Z" fill="url(#' + gid + ')"/>';
      }
      body += '<path class="md-a-line" pathLength="1" d="' + path + '" fill="none" stroke="' + (ref ? META_INK : color) + '" stroke-width="' + (ref ? 1.5 : c.opts.lineWidth) + '"' + (ref ? ' stroke-dasharray="6 4"' : "") + ' stroke-linecap="round" stroke-linejoin="round"/>';
      var showDots = pts.length <= 40 && !ref;
      pts.forEach(function (p) {
        var row = m.rows[p.i], cell = row[measureCol(m, si)];
        if (showDots) overlay += '<circle class="md-a-fade" cx="' + f(p.x) + '" cy="' + f(p.y) + '" r="3.5" fill="#fff" stroke="' + color + '" stroke-width="2"/>';
        if (c.opts.showValues && si === 0 && a.bw >= 34) overlay += text(p.x, p.y - 9, valueLabel(cell, fmt), ' text-anchor="middle" class="md-val"');
        overlay += '<circle cx="' + f(p.x) + '" cy="' + f(p.y) + '" r="12" fill="transparent"' + tip([row[0].qText, m.meas[si].label + ": " + cell.qText]) + sel(0, row[0]) + "/>";
      });
    });
    if (isFinite(c.opts.target)) {
      var ty = a.y(c.opts.target);
      body += '<line x1="' + a.left + '" x2="' + a.right + '" y1="' + f(ty) + '" y2="' + f(ty) + '" stroke="' + META_INK + '" stroke-width="1.5" stroke-dasharray="6 4"/>';
      body += text(a.right - 4, ty - 6, T("Meta", "Target") + " " + fmt(c.opts.target), ' text-anchor="end" class="md-val"');
    }
    return (lh ? legend(names, c.colors) : "") + svg(c.w, c.h - lh, body + overlay, defs);
  }

  function columns(c) {
    var mi = metaIndex(c.model);
    if (mi >= 0) return targetBars(c, 1 - mi, mi);
    var m = c.model, nM = Math.min(m.meas.length, 3), data = [], names = [];
    for (var i = 0; i < nM; i++) { data.push(series(m, i)); names.push(m.meas[i].label); }
    var ex = extent(data), lh = nM > 1 ? 26 : 0;
    var fmt = maskOf(m, 0);
    var a = axes(c.w, c.h - lh, ex[0], ex[1], dimLabels(m), null, fmt);
    var gw = a.bw * c.opts.barWidth, bw = gw / nM, y0 = a.y(0), body = a.svg;
    m.rows.forEach(function (row, i) {
      data.forEach(function (s, si) {
        var v = s[i];
        if (v == null) return;
        var x = a.cx(i) - gw / 2 + si * bw, yv = a.y(v), cell = row[measureCol(m, si)];
        body += '<rect class="md-a-bar" x="' + f(x + 1) + '" y="' + f(Math.min(yv, y0)) + '" width="' + f(Math.max(bw - 2, 1)) + '" height="' + f(Math.abs(y0 - yv)) + '" rx="' + Math.min(4, bw / 4) + '" fill="' + c.colors[si % c.colors.length] + '"' +
          ' style="transform-origin:0 ' + f(y0) + 'px;animation-delay:' + Math.min(i * 25, 600) + 'ms"' + tip([row[0].qText, m.meas[si].label + ": " + cell.qText]) + sel(0, row[0]) + "/>";
        if (c.opts.showValues && bw >= 22) body += text(x + bw / 2, (v >= 0 ? yv - 5 : yv + 13), valueLabel(cell, fmt), ' text-anchor="middle" class="md-val"');
      });
    });
    return (lh ? legend(names, c.colors) : "") + svg(c.w, c.h - lh, body);
  }

  function ranking(c) {
    var m = c.model, col = measureCol(m, 0);
    var rows = m.rows.filter(function (r) { return num(r[col]) != null; })
      .sort(function (a, b) { return b[col].qNum - a[col].qNum; }).slice(0, c.opts.topN);
    if (!rows.length) return message(T("Sem valores para exibir.", "No values to display."));
    var max = Math.max.apply(null, rows.map(function (r) { return Math.max(r[col].qNum, 0); })) || 1;
    var labelW = Math.min(c.w * 0.35, Math.max.apply(null, rows.map(function (r) { return textWidth(trunc(r[0].qText, 24), true); })) + 12);
    var valW = 64, rowH = Math.min(36, (c.h - 8) / rows.length), barH = rowH * c.opts.barWidth;
    var area = c.w - labelW - valW - 8, body = "";
    rows.forEach(function (r, i) {
      var y = 4 + i * rowH, w = Math.max(r[col].qNum, 0) / max * area, strong = i < 3 ? ' font-weight="700"' : "";
      body += text(labelW - 8, y + rowH / 2 + 4, fitText(trunc(r[0].qText, 24), labelW - 10, i < 3), ' text-anchor="end" class="md-lbl"' + strong);
      body += '<rect x="' + f(labelW) + '" y="' + f(y + (rowH - barH) / 2) + '" width="' + f(area) + '" height="' + f(barH) + '" rx="' + f(barH / 2) + '" fill="' + GRID + '" opacity=".5"/>';
      body += '<rect class="md-a-barx" x="' + f(labelW) + '" y="' + f(y + (rowH - barH) / 2) + '" width="' + f(Math.max(w, 2)) + '" height="' + f(barH) + '" rx="' + f(barH / 2) + '" fill="' + c.colors[0] + '" opacity="' + (i < 3 ? 1 : 0.6) + '"' +
        ' style="transform-origin:' + f(labelW) + 'px 0;animation-delay:' + i * 40 + 'ms"' + tip([r[0].qText, m.meas[0].label + ": " + r[col].qText]) + sel(0, r[0]) + "/>";
      body += text(labelW + w + 8, y + rowH / 2 + 4, r[col].qText, ' class="md-val"' + strong);
    });
    return svg(c.w, c.h, body);
  }

  function stacked(c) {
    var m = c.model, cats = [], catCells = {}, names = [], values = {};
    if (m.dims.length >= 2) {
      var col = measureCol(m, 0), totals = {};
      m.rows.forEach(function (r) {
        var k = r[0].qText, s = r[1].qText, v = Math.max(num(r[col]) || 0, 0);
        if (!(k in catCells)) { cats.push(k); catCells[k] = r[0]; }
        totals[s] = (totals[s] || 0) + v;
      });
      names = Object.keys(totals).sort(function (a, b) { return totals[b] - totals[a]; });
      var grouped = names.length > 8, keep = names.slice(0, 7);
      var other = T("Outros", "Others");
      if (grouped) names = keep.concat([other]);
      m.rows.forEach(function (r) {
        var s = !grouped || keep.indexOf(r[1].qText) >= 0 ? r[1].qText : other;
        var key = r[0].qText + "\u0001" + s;
        values[key] = (values[key] || 0) + Math.max(num(r[col]) || 0, 0);
      });
    } else {
      names = m.meas.slice(0, 6).map(function (x) { return x.label; });
      m.rows.forEach(function (r) {
        cats.push(r[0].qText); catCells[r[0].qText] = r[0];
        names.forEach(function (s, si) { values[r[0].qText + "\u0001" + s] = Math.max(num(r[measureCol(m, si)]) || 0, 0); });
      });
    }
    var sums = cats.map(function (k) { return names.reduce(function (a, s) { return a + (values[k + "\u0001" + s] || 0); }, 0); });
    var a = axes(c.w, c.h - 26, 0, Math.max.apply(null, sums.concat([1])), cats, null, maskOf(m, 0));
    var bw = a.bw * c.opts.barWidth, body = a.svg;
    cats.forEach(function (k, i) {
      var acc = 0;
      names.forEach(function (s, si) {
        var v = values[k + "\u0001" + s] || 0;
        if (!v) return;
        var yTop = a.y(acc + v), yBot = a.y(acc);
        body += '<rect class="md-a-bar" x="' + f(a.cx(i) - bw / 2) + '" y="' + f(yTop) + '" width="' + f(bw) + '" height="' + f(Math.max(yBot - yTop - 1, 0.5)) + '" fill="' + c.colors[si % c.colors.length] + '"' +
          ' style="transform-origin:0 ' + f(a.bottom) + 'px;animation-delay:' + Math.min(i * 25, 600) + 'ms"' + tip([k, s + ": " + u.full(v)]) + sel(0, catCells[k]) + "/>";
        acc += v;
      });
      if (bw >= 24) body += text(a.cx(i), a.y(sums[i]) - 5, maskOf(m, 0)(sums[i]), ' text-anchor="middle" class="md-val"');
    });
    return legend(names, c.colors) + svg(c.w, c.h - 26, body);
  }

  // ---------- storytelling: meta como referência, eixo único, período parcial ----------

  var META_RE = /\b(meta|metas|orcad|orcamento|budget|target|objetivo|previst|previsao|forecast|plano|planejad|cota)/;
  function isMeta(label) { return META_RE.test(plain(label)); }
  function metaIndex(model) {
    if (model.meas.length !== 2) return -1;
    var a = isMeta(model.meas[0].label), b = isMeta(model.meas[1].label);
    return a === b ? -1 : (b ? 1 : 0);
  }

  // O período corrente ainda não fechou: "11/2026", "2026-11", "nov/2026", "Nov 2026"…
  var MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  var MONTHS_EN = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  function isCurrentPeriod(label) {
    var now = new Date(), y = now.getFullYear(), mo = now.getMonth(), s = plain(label).trim();
    var mm = mo + 1, m2 = (mm < 10 ? "0" : "") + mm;
    if (new RegExp("^(" + m2 + "|" + mm + ")[/\\-.]" + y + "$").test(s)) return true;
    if (new RegExp("^" + y + "[/\\-.]?(" + m2 + "|" + mm + ")$").test(s)) return true;
    var re = new RegExp("^(" + MONTHS[mo] + "|" + MONTHS_EN[mo] + ")[a-z]*[\\s/\\-.]*(" + y + "|" + String(y).slice(2) + ")$");
    return re.test(s);
  }
  function partialIndex(model) {
    var n = model.rows.length;
    return n > 2 && isCurrentPeriod(model.rows[n - 1][0].qText) ? n - 1 : -1;
  }

  // Duas medidas cabem no mesmo eixo quando têm a mesma unidade e grandeza parecida.
  function sameScale(model, i, j) {
    var f1 = maskOf(model, i)(1), f2 = maskOf(model, j)(1);
    var unit = function (s) { return /%/.test(s) ? "%" : /R\$/.test(s) ? "R$" : "n"; };
    if (unit(f1) !== unit(f2)) return false;
    var e1 = extent([series(model, i)]), e2 = extent([series(model, j)]);
    var m1 = Math.max(Math.abs(e1[0]), Math.abs(e1[1])), m2 = Math.max(Math.abs(e2[0]), Math.abs(e2[1]));
    return m1 && m2 ? Math.max(m1, m2) / Math.min(m1, m2) < 8 : true;
  }

  var MISS = "#e8743b", META_INK = "#404040";

  // Realizado x meta: barras do realizado e a meta como marca horizontal sobre cada barra, no MESMO eixo.
  // Azul = bateu a meta, laranja = ficou abaixo (cores seguras para daltônicos); o mês corrente
  // incompleto fica claro e marcado como parcial, para não parecer uma queda.
  function targetBars(c, ai, mi) {
    var m = c.model, act = series(m, ai), meta = series(m, mi), pi = partialIndex(m);
    var ex = extent([act, meta]), fmt = maskOf(m, ai), labels = dimLabels(m);
    var a = axes(c.w, c.h - 26, ex[0], ex[1], labels, null, fmt);
    var bw = a.bw * c.opts.barWidth, y0 = a.y(0), body = a.svg, overlay = "", misses = 0, hits = 0;
    var showVals = c.opts.showValues && bw >= 26 && m.rows.length <= 14;
    m.rows.forEach(function (row, i) {
      var v = act[i], t = meta[i], cell = row[measureCol(m, ai)], tcell = row[measureCol(m, mi)];
      var partial = i === pi, miss = v != null && t != null && v < t && !partial;
      if (v != null && t != null && !partial) { if (miss) misses++; else hits++; }
      var pct = v != null && t ? " (" + u.pct(v / t) + T(" da meta)", " of target)") : "";
      var info = tip([row[0].qText + (partial ? T(" — parcial", " — partial") : ""), m.meas[ai].label + ": " + cell.qText + pct, m.meas[mi].label + ": " + tcell.qText]) + sel(0, row[0]);
      if (v != null) {
        body += '<rect class="md-a-bar" x="' + f(a.cx(i) - bw / 2) + '" y="' + f(Math.min(a.y(v), y0)) + '" width="' + f(bw) + '" height="' + f(Math.abs(y0 - a.y(v))) + '" rx="2" fill="' + (miss ? MISS : c.colors[0]) + '"' + (partial ? ' opacity=".35"' : "") +
          ' style="transform-origin:0 ' + f(y0) + 'px;animation-delay:' + Math.min(i * 25, 600) + 'ms"' + info + "/>";
        if (showVals) body += text(a.cx(i), Math.min(a.y(v), t != null ? a.y(t) : y0) - 7, valueLabel(cell, fmt), ' text-anchor="middle" class="md-val"' + (miss ? ' style="fill:' + MISS + '"' : ""));
      }
      if (t != null) overlay += '<line class="md-a-fade" x1="' + f(a.cx(i) - bw / 2 - 4) + '" x2="' + f(a.cx(i) + bw / 2 + 4) + '" y1="' + f(a.y(t)) + '" y2="' + f(a.y(t)) + '" stroke="' + META_INK + '" stroke-width="2.5" stroke-linecap="round"' + info + "/>";
      if (partial) overlay += text(a.cx(i), a.bottom - 4, T("parcial", "partial"), ' text-anchor="middle" class="md-axis" font-style="italic"');
    });
    var leg = '<div class="md-legend"><span><i style="background:' + c.colors[0] + '"></i>' + esc(m.meas[ai].label) + (misses ? T(" (na meta)", " (on target)") : "") + "</span>" +
      (misses ? '<span><i style="background:' + MISS + '"></i>' + T("Abaixo da meta", "Below target") + "</span>" : "") +
      '<span><i style="background:' + META_INK + ';height:3px;vertical-align:3px"></i>' + esc(m.meas[mi].label) + "</span>" +
      (hits + misses ? '<span class="md-legend-sum">' + T("{h} de {n} na meta", "{h} of {n} on target", { h: hits, n: hits + misses }) + "</span>" : "") + "</div>";
    return leg + svg(c.w, c.h - 26, body + overlay);
  }

  function combo(c) {
    var m = c.model, mi = metaIndex(m);
    if (mi >= 0) return targetBars(c, 1 - mi, mi);
    var bars = series(m, 0), line = series(m, 1), shared = sameScale(m, 0, 1);
    var e1 = shared ? extent([bars, line]) : extent([bars]), e2 = extent([line]);
    // Nada de eixo secundário: com a mesma unidade, um eixo só; com unidades diferentes, a linha
    // ganha escala própria mas é rotulada direto nos pontos (sem eixo à direita).
    var a = axes(c.w, c.h - 26, e1[0], e1[1], dimLabels(m), shared ? null : e2, maskOf(m, 0), maskOf(m, 1), !shared);
    if (shared) a.y2 = a.y;
    var fmt2 = maskOf(m, 1), labelLine = !shared;
    var bw = a.bw * c.opts.barWidth, y0 = a.y(0), body = a.svg, pts = [], overlay = "";
    m.rows.forEach(function (row, i) {
      var v = bars[i], cell = row[measureCol(m, 0)], cell2 = row[measureCol(m, 1)];
      var info = tip([row[0].qText, m.meas[0].label + ": " + cell.qText, m.meas[1].label + ": " + cell2.qText]) + sel(0, row[0]);
      if (v != null) body += '<rect class="md-a-bar" x="' + f(a.cx(i) - bw / 2) + '" y="' + f(Math.min(a.y(v), y0)) + '" width="' + f(bw) + '" height="' + f(Math.abs(y0 - a.y(v))) + '" rx="3" fill="' + c.colors[0] + '" opacity=".85"' +
        ' style="transform-origin:0 ' + f(y0) + 'px;animation-delay:' + Math.min(i * 25, 600) + 'ms"' + info + "/>";
      if (line[i] != null) {
        pts.push({ x: a.cx(i), y: a.y2(line[i]) });
        overlay += '<circle class="md-a-fade" cx="' + f(a.cx(i)) + '" cy="' + f(a.y2(line[i])) + '" r="3.5" fill="#fff" stroke="' + c.colors[1] + '" stroke-width="2"' + info + "/>";
        if (labelLine && (m.rows.length <= 12 || i === m.rows.length - 1)) overlay += text(a.cx(i), a.y2(line[i]) - 9, valueLabel(cell2, fmt2), ' text-anchor="middle" class="md-val" style="fill:' + c.colors[1] + '"');
      }
    });
    body += '<path class="md-a-line" pathLength="1" d="' + smooth(pts) + '" fill="none" stroke="' + c.colors[1] + '" stroke-width="' + c.opts.lineWidth + '" stroke-linecap="round"/>';
    return legend([m.meas[0].label, m.meas[1].label], c.colors) + svg(c.w, c.h - 26, body + overlay);
  }

  function arcPath(cx, cy, r0, r1, a0, a1) {
    var large = a1 - a0 > Math.PI ? 1 : 0;
    var p = function (r, a) { return f(cx + r * Math.cos(a)) + "," + f(cy + r * Math.sin(a)); };
    return "M" + p(r1, a0) + "A" + f(r1) + "," + f(r1) + " 0 " + large + " 1 " + p(r1, a1) +
      "L" + p(r0, a1) + "A" + f(r0) + "," + f(r0) + " 0 " + large + " 0 " + p(r0, a0) + "Z";
  }

  function donut(c) {
    var m = c.model, col = measureCol(m, 0);
    var items = m.rows.map(function (r) { return { label: r[0].qText, v: num(r[col]) || 0, cell: r[0], text: r[col].qText }; })
      .filter(function (x) { return x.v > 0; }).sort(function (a, b) { return b.v - a.v; });
    if (!items.length) return message(T("Sem valores positivos para exibir.", "No positive values to display."));
    if (items.length > 8) {
      var rest = items.slice(7).reduce(function (a, x) { return a + x.v; }, 0);
      items = items.slice(0, 7).concat([{ label: T("Outros", "Others"), v: rest, cell: null, text: u.full(rest) }]);
    }
    var total = items.reduce(function (a, x) { return a + x.v; }, 0);
    var side = c.w >= c.h * 1.4, legendSize = side ? Math.min(220, c.w * 0.42) : Math.min(items.length * 22 + 8, c.h * 0.4);
    var cw = side ? c.w - legendSize : c.w, ch = side ? c.h : c.h - legendSize;
    var r1 = Math.max(Math.min(cw, ch) / 2 - 8, 10), r0 = r1 * (1 - c.opts.ringWidth), cx = cw / 2, cy = ch / 2;
    var a = -Math.PI / 2, gap = items.length > 1 ? 0.012 : 0, body = "";
    items.forEach(function (x, i) {
      var sweep = Math.min(x.v / total * Math.PI * 2, Math.PI * 2 - 0.0001);
      body += '<path class="md-a-fade" d="' + arcPath(cx, cy, r0, r1, a + gap, a + sweep - gap) + '" fill="' + c.colors[i % c.colors.length] + '"' + delay(i) +
        tip([x.label, m.meas[0].label + ": " + x.text, u.pct(x.v / total)]) + (x.cell ? sel(0, x.cell) : "") + "/>";
      a += sweep;
    });
    var t = totalOf(m, 0);
    body += text(cx, cy + 2, maskOf(m, 0)(t.n), ' text-anchor="middle" class="md-big" font-size="' + f(Math.max(r0 * 0.42, 12)) + '"');
    body += text(cx, cy + Math.max(r0 * 0.3, 12), trunc(m.meas[0].label, 18), ' text-anchor="middle" class="md-lbl"');
    var leg = '<div class="md-dlegend" style="' + (side ? "width:" + legendSize + "px" : "height:" + legendSize + "px") + '">' + items.map(function (x, i) {
      return '<div' + (x.cell ? sel(0, x.cell) : "") + '><i style="background:' + c.colors[i % c.colors.length] + '"></i><span>' + esc(x.label) + "</span><b>" + u.pct(x.v / total) + "</b></div>";
    }).join("") + "</div>";
    return '<div class="md-donut' + (side ? " md-side" : "") + '">' + svg(cw, ch, body) + leg + "</div>";
  }

  function gauge(c) {
    var m = c.model, first = m.rows[0] || [];
    var valueOf = function (i) { return m.dims.length ? totalOf(m, i) : { n: num(first[i]), text: first[i] ? first[i].qText : "" }; };
    var v = valueOf(0);
    if (v.n == null) return message(T("Sem valor para exibir.", "No value to display."));
    var target = m.meas.length > 1 ? valueOf(1) : (isFinite(c.opts.target) ? { n: c.opts.target, text: u.full(c.opts.target) } : null);
    var scaleMax = target && target.n > 0 ? target.n : niceTicks(0, Math.max(v.n, 1), 4).pop();
    var ratio = Math.max(0, Math.min(v.n / scaleMax, 1));
    var color = !target ? c.colors[0] : ratio < 0.7 ? "#ef4444" : ratio < 0.95 ? "#f59e0b" : "#10b981";
    var r1 = Math.max(Math.min(c.w / 2 - 12, c.h * 0.75 - 12), 20), r0 = r1 * (1 - c.opts.ringWidth * 0.7), cx = c.w / 2, cy = c.h * 0.72;
    var body = '<path d="' + arcPath(cx, cy, r0, r1, Math.PI, 2 * Math.PI - 0.0001) + '" fill="' + GRID + '"/>';
    if (ratio > 0) body += '<path class="md-a-fade" d="' + arcPath(cx, cy, r0, r1, Math.PI, Math.PI + Math.PI * ratio) + '" fill="' + color + '"' + tip([m.meas[0].label + ": " + v.text]) + "/>";
    body += text(cx, cy - r0 * 0.25, v.text, ' text-anchor="middle" class="md-big" font-size="' + f(Math.max(r0 * 0.36, 14)) + '"');
    body += text(cx, cy + 18, target ? T("Meta", "Target") + " " + target.text + " · " + u.pct(v.n / target.n) : m.meas[0].label, ' text-anchor="middle" class="md-lbl"');
    return svg(c.w, c.h, body);
  }

  function heatmap(c) {
    var m = c.model, col = measureCol(m, 0), rk = [], ck = [], rowCell = {}, vals = {}, max = 0;
    m.rows.forEach(function (r) {
      var a = r[0].qText, b = r[1].qText, v = num(r[col]);
      if (!(a in rowCell)) { rk.push(a); rowCell[a] = r[0]; }
      if (ck.indexOf(b) < 0) ck.push(b);
      if (v == null) return;
      vals[a + "\u0001" + b] = { v: (vals[a + "\u0001" + b] ? vals[a + "\u0001" + b].v : 0) + v, text: r[col].qText };
      max = Math.max(max, vals[a + "\u0001" + b].v);
    });
    var left = Math.min(c.w * 0.3, Math.max.apply(null, rk.map(function (k) { return trunc(k, 18).length; })) * 7 + 12), top = 22;
    var cw = (c.w - left - 4) / ck.length, chh = Math.min(42, (c.h - top - 4) / rk.length), body = "";
    var every = Math.max(1, Math.ceil(ck.length / Math.max(1, Math.floor((c.w - left) / 56))));
    ck.forEach(function (k, j) { if (j % every === 0) body += text(left + cw * (j + 0.5), 14, trunc(k, 10), ' text-anchor="middle" class="md-axis"'); });
    rk.forEach(function (a, i) {
      var y = top + i * chh;
      body += text(left - 8, y + chh / 2 + 4, trunc(a, 18), ' text-anchor="end" class="md-lbl"');
      ck.forEach(function (b, j) {
        var cell = vals[a + "\u0001" + b], t = cell && max > 0 ? Math.max(cell.v, 0) / max : 0;
        body += '<rect class="md-a-fade" x="' + f(left + j * cw + 1) + '" y="' + f(y + 1) + '" width="' + f(Math.max(cw - 2, 1)) + '" height="' + f(Math.max(chh - 2, 1)) + '" rx="3" fill="' + c.colors[0] + '" fill-opacity="' + (cell ? (0.07 + 0.93 * t).toFixed(3) : 0.03) + '"' +
          delay(i + j) + tip([a + " · " + b, m.meas[0].label + ": " + (cell ? u.full(cell.v) : "-")]) + sel(0, rowCell[a]) + "/>";
        if (cell && cw >= 40 && chh >= 18) body += text(left + cw * (j + 0.5), y + chh / 2 + 4, maskOf(m, 0)(cell.v), ' text-anchor="middle" class="md-val" style="fill:' + (t > 0.55 ? "#fff" : TEXT) + '"');
      });
    });
    return svg(c.w, c.h, body);
  }

  function bubbles(c) {
    var m = c.model, xs = series(m, 0), ys = series(m, 1), ss = m.meas.length > 2 ? series(m, 2) : null;
    var ex = extent([xs]), ey = extent([ys]);
    var tx = niceTicks(ex[0], ex[1], Math.max(2, Math.round(c.w / 90)));
    var ty = niceTicks(ey[0], ey[1], Math.max(2, Math.round(c.h / 55)));
    var pad = ss ? 26 : 10;
    var fx = maskOf(m, 0), fy = maskOf(m, 1);
    var left = Math.max.apply(null, ty.map(function (v) { return fy(v, true).length; })) * 6.5 + 12 + pad, right = c.w - pad, top = pad, bottom = c.h - 38 - pad / 2;
    var y = linScale(ty, top, bottom), x = function (v) { return left + (v - tx[0]) / (tx[tx.length - 1] - tx[0]) * (right - left); };
    var maxS = ss ? Math.max.apply(null, ss.map(function (v) { return Math.abs(v || 0); })) || 1 : 1, body = "";
    ty.forEach(function (t) {
      body += '<line x1="' + f(left) + '" x2="' + right + '" y1="' + f(y(t)) + '" y2="' + f(y(t)) + '" stroke="' + GRID + '"/>' + text(left - 8, y(t) + 4, fy(t, true), ' text-anchor="end" class="md-axis"');
    });
    tx.forEach(function (t) { body += text(x(t), bottom + 16, fx(t, true), ' text-anchor="middle" class="md-axis"'); });
    body += text((left + right) / 2, c.h - 4, m.meas[0].label + " →", ' text-anchor="middle" class="md-lbl"');
    m.rows.forEach(function (r, i) {
      if (xs[i] == null || ys[i] == null) return;
      var rad = ss ? 4 + 22 * Math.sqrt(Math.abs(ss[i] || 0) / maxS) : 7;
      var lines = [r[0].qText, m.meas[0].label + ": " + r[measureCol(m, 0)].qText, m.meas[1].label + ": " + r[measureCol(m, 1)].qText];
      if (ss) lines.push(m.meas[2].label + ": " + r[measureCol(m, 2)].qText);
      body += '<circle class="md-a-fade" cx="' + f(x(xs[i])) + '" cy="' + f(y(ys[i])) + '" r="' + f(rad) + '" fill="' + c.colors[i % c.colors.length] + '" fill-opacity=".7" stroke="#fff"' + delay(i) + tip(lines) + sel(0, r[0]) + "/>";
    });
    return svg(c.w, c.h, body);
  }

  function funnel(c) {
    var m = c.model, col = measureCol(m, 0);
    var rows = m.rows.filter(function (r) { return num(r[col]) != null; }).slice(0, 8);
    if (!rows.length) return message(T("Sem valores para exibir.", "No values to display."));
    var max = Math.max.apply(null, rows.map(function (r) { return r[col].qNum; })) || 1;
    var stepH = (c.h - 8) / rows.length, barH = stepH * 0.78, maxW = c.w * 0.92, body = "";
    rows.forEach(function (r, i) {
      var w = Math.max(r[col].qNum / max * maxW, 40), y = 4 + i * stepH, x = (c.w - w) / 2;
      var conv = i > 0 && rows[i - 1][col].qNum ? " (" + u.pct(r[col].qNum / rows[i - 1][col].qNum) + ")" : "";
      body += '<rect class="md-a-barx" x="' + f(x) + '" y="' + f(y) + '" width="' + f(w) + '" height="' + f(barH) + '" rx="6" fill="' + c.colors[0] + '" fill-opacity="' + (1 - i * 0.09).toFixed(2) + '"' +
        ' style="transform-origin:' + f(c.w / 2) + 'px 0;animation-delay:' + i * 60 + 'ms"' + tip([r[0].qText, m.meas[0].label + ": " + r[col].qText + conv]) + sel(0, r[0]) + "/>";
      body += text(c.w / 2, y + barH / 2 + 4, trunc(r[0].qText, 22) + " · " + r[col].qText + conv, ' text-anchor="middle" class="md-val" style="fill:' + (w > 180 ? "#fff" : TEXT) + '"');
    });
    return svg(c.w, c.h, body);
  }

  function kpi(c) {
    var m = c.model, s = series(m, 0).filter(function (v) { return v != null; }), t = totalOf(m, 0);
    var last = s[s.length - 1], prev = s[s.length - 2], badge = "";
    if (s.length >= 2 && prev) {
      var d = (last - prev) / Math.abs(prev);
      badge = '<span class="md-badge ' + (d >= 0 ? "md-up" : "md-down") + '">' + (d >= 0 ? "▲ " : "▼ ") + u.pct(Math.abs(d)) + "</span>";
    }
    var big = Math.max(Math.min(c.h * 0.26, c.w * 0.14), 16), sh = Math.max(c.h * 0.36, 30), sw = c.w - 16, spark = "";
    if (s.length >= 2) {
      var lo = Math.min.apply(null, s), hi = Math.max.apply(null, s), span = hi - lo || 1;
      var pts = s.map(function (v, i) { return { x: 8 + i / (s.length - 1) * (sw - 16), y: 6 + (1 - (v - lo) / span) * (sh - 12) }; });
      var path = smooth(pts), gid = c.uid + "k", color = c.colors[0];
      spark = svg(sw, sh, '<path class="md-a-fade" d="' + path + "L" + f(pts[pts.length - 1].x) + "," + sh + "L" + f(pts[0].x) + "," + sh + 'Z" fill="url(#' + gid + ')"/>' +
        '<path class="md-a-line" pathLength="1" d="' + path + '" fill="none" stroke="' + color + '" stroke-width="' + c.opts.lineWidth + '" stroke-linecap="round"/>' +
        '<circle cx="' + f(pts[pts.length - 1].x) + '" cy="' + f(pts[pts.length - 1].y) + '" r="4" fill="' + color + '"/>',
        '<linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + color + '" stop-opacity=".35"/><stop offset="1" stop-color="' + color + '" stop-opacity="0"/></linearGradient>');
    }
    return '<div class="md-kpi"><div class="md-kpi-label">' + esc(m.meas[0].label) + '</div><div class="md-kpi-value" style="font-size:' + f(big) + 'px">' + esc(t.text) + "</div>" +
      badge + '<div class="md-kpi-spark">' + spark + "</div></div>";
  }

  function bigNumber(c) {
    var m = c.model, first = m.rows[0] || [];
    var valueOf = function (i) { return m.dims.length ? totalOf(m, i) : { n: num(first[i]), text: first[i] ? first[i].qText : "" }; };
    var v = valueOf(0), badge = "";
    if (m.meas.length > 1) {
      var base = valueOf(1);
      if (v.n != null && base.n) {
        var d = (v.n - base.n) / Math.abs(base.n);
        badge = '<span class="md-badge ' + (d >= 0 ? "md-up" : "md-down") + '">' + (d >= 0 ? "▲ " : "▼ ") + u.pct(Math.abs(d)) +
          '</span><span class="md-kpi-cmp">vs ' + esc(m.meas[1].label) + " " + esc(base.text) + "</span>";
      }
    }
    var big = Math.max(Math.min(c.h * 0.34, c.w * 0.12), 16);
    return '<div class="md-kpi md-num-tile"><div class="md-kpi-label">' + esc(m.meas[0].label) + '</div><div class="md-kpi-value" style="font-size:' + f(big) + 'px"' +
      tip([m.meas[0].label + ": " + v.text]) + ">" + esc(v.text) + '</div><div class="md-kpi-row">' + badge + "</div></div>";
  }

  // ---------- catálogo ----------

  function needs(dMin, mMin) { return function (m) { return m.dims.length >= dMin && m.meas.length >= mMin; }; }

  var TYPES = {
    "numero": { label: "Número (KPI)", need: "1 medida (2ª medida = comparação)", en: "Number (KPI)", needEn: "1 measure (2nd measure = comparison)", ok: needs(0, 1), draw: bigNumber },
    "linha": { label: "Linha suave", need: "1 dimensão e 1 a 4 medidas", en: "Smooth line", needEn: "1 dimension and 1 to 4 measures", ok: needs(1, 1), draw: function (c) { return lineLike(c, false); } },
    "area": { label: "Área com gradiente", need: "1 dimensão e 1 a 3 medidas", en: "Gradient area", needEn: "1 dimension and 1 to 3 measures", ok: needs(1, 1), draw: function (c) { return lineLike(c, true); } },
    "colunas": { label: "Colunas", need: "1 dimensão e 1 a 3 medidas", en: "Columns", needEn: "1 dimension and 1 to 3 measures", ok: needs(1, 1), draw: columns },
    "ranking": { label: "Ranking (barras)", need: "1 dimensão e 1 medida", en: "Ranking (bars)", needEn: "1 dimension and 1 measure", ok: needs(1, 1), draw: ranking },
    "empilhado": { label: "Colunas empilhadas", need: "2 dimensões + 1 medida, ou 1 dimensão + 2 a 6 medidas", en: "Stacked columns", needEn: "2 dimensions + 1 measure, or 1 dimension + 2 to 6 measures", ok: function (m) { return m.dims.length >= 1 && m.meas.length >= 1 && (m.dims.length >= 2 || m.meas.length >= 2); }, draw: stacked },
    "combo": { label: "Combo barra + linha", need: "1 dimensão e 2 medidas", en: "Combo bar + line", needEn: "1 dimension and 2 measures", ok: needs(1, 2), draw: combo },
    "rosca": { label: "Rosca", need: "1 dimensão e 1 medida", en: "Donut", needEn: "1 dimension and 1 measure", ok: needs(1, 1), draw: donut },
    "medidor": { label: "Medidor", need: "1 medida (2ª medida = meta)", en: "Gauge", needEn: "1 measure (2nd measure = target)", ok: needs(0, 1), draw: gauge },
    "calor": { label: "Mapa de calor", need: "2 dimensões e 1 medida", en: "Heat map", needEn: "2 dimensions and 1 measure", ok: needs(2, 1), draw: heatmap },
    "bolhas": { label: "Bolhas", need: "1 dimensão e 2 ou 3 medidas", en: "Bubbles", needEn: "1 dimension and 2 or 3 measures", ok: needs(1, 2), draw: bubbles },
    "funil": { label: "Funil", need: "1 dimensão e 1 medida", en: "Funnel", needEn: "1 dimension and 1 measure", ok: needs(1, 1), draw: funnel },
    "kpi": { label: "KPI com sparkline", need: "1 dimensão e 1 medida", en: "KPI with sparkline", needEn: "1 dimension and 1 measure", ok: needs(1, 1), draw: kpi }
  };

  // Cor pelo significado da medida: meta/orçado é referência (cinza), período anterior é a mesma
  // medida mais clara, custo é laranja, lucro/margem é verde. As demais seguem a paleta, sem
  // repetir as cores já usadas. Só vale para gráficos em que cada medida é uma série.
  var BY_MEASURE = { linha: 1, area: 1, colunas: 1, combo: 1, empilhado: 1 };
  var MEANING = [
    { re: /\b(meta|metas|orcad|orcamento|budget|target|objetivo|previst|previsao|forecast|plano|planejad|cota)/, color: "#a6a6a6" },
    { re: /(anterior|passad|\bly\b|\bpy\b|\ba-1\b|ano-1|last year|prior|previous)/, color: "#8ab4f8" },
    { re: /\b(custo|custos|despesa|cmv|perda|devoluc|cancelad|cancelament|desconto|cost|expense)/, color: "#f28c28" },
    { re: /\b(lucro|margem|resultado|profit|margin)/, color: "#2e9e5b" }
  ];
  function plain(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }
  function meaningColors(type, model, base) {
    if (!BY_MEASURE[type] || (type === "empilhado" && model.dims.length > 1) || model.meas.length < 2) return base;
    var used = {}, out = model.meas.map(function (m) {
      var name = plain(m.label), hit = null;
      for (var i = 0; i < MEANING.length && !hit; i++) if (MEANING[i].re.test(name)) hit = MEANING[i].color;
      if (hit) used[hit] = true;
      return hit;
    });
    var free = base.filter(function (c) { return !used[c.toLowerCase()]; }), k = 0;
    return out.map(function (c) { return c || free[k++ % free.length]; });
  }

  function render(type, model, opts, w, h) {
    var def = TYPES[type] || TYPES.colunas;
    if (!def.ok(model) || !model.rows.length) return message(T("{label} precisa de {need}.", "{label} needs {need}.", { label: i18n.isEn() ? def.en : def.label, need: i18n.isEn() ? def.needEn : def.need }));
    var target = parseFloat(String(opts.target == null ? "" : opts.target).replace(",", "."));
    return def.draw({
      model: model,
      w: Math.max(Math.floor(w), 120),
      h: Math.max(Math.floor(h), 100),
      uid: "md" + (++uidSeq),
      // Cores da empresa definidas à mão têm prioridade sobre a cor pelo significado.
      colors: /#[0-9a-f]{3,6}/i.test(opts.customColors || "") ? u.colors(opts.palette, opts.customColors) : meaningColors(type, model, u.colors(opts.palette)),
      opts: {
        target: target,
        topN: Math.max(parseInt(opts.topN, 10) || 10, 1),
        showValues: opts.showValues !== false,
        barWidth: Math.min(Math.max(+opts.barWidth || 0.7, 0.2), 1),
        lineWidth: Math.min(Math.max(+opts.lineWidth || 2.5, 1), 8),
        ringWidth: Math.min(Math.max(+opts.ringWidth || 0.38, 0.1), 0.9)
      }
    });
  }

  return { TYPES: TYPES, render: render };
});
