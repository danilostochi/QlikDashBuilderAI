define(["qlik", "./util", "./i18n"], function (qlik, u, i18n) {
  "use strict";

  var T = i18n.T;

  // Coluna de filtros à esquerda do painel: uma lista por campo, ligada às seleções do app.
  // Clicar seleciona/desmarca no Qlik (o painel inteiro e o resto do app acompanham); ✕ limpa o campo.
  var esc = u.esc;
  var MAX_VALUES = 500;

  function normalize(list) {
    var seen = {};
    return (Array.isArray(list) ? list : []).map(function (f) {
      return { field: String(f && f.field || "").trim(), label: String(f && f.label || "").trim() };
    }).filter(function (f) {
      if (!f.field || seen[f.field]) return false;
      seen[f.field] = true;
      return true;
    }).slice(0, 8);
  }

  // No celular (painel estreito) a coluna vira uma gaveta: um botão "Filtros" no topo mostra quantos
  // campos têm seleção e abre a gaveta por cima do painel; ✕, "Ver painel", Esc ou um toque fora recolhem.
  // A barra também é a barra de seleções do celular, como a do Qlik: um chip por campo selecionado
  // (inclusive os filtros feitos nos gráficos), ✕ no chip limpa o campo, tocar no chip abre a lista
  // daquele campo para trocar os valores e o ✕ total limpa tudo.
  function barHtml(hasSide) {
    return '<div class="md-flt-bar' + (hasSide ? "" : " md-flt-bar-noside") + '">' +
      (hasSide ? '<button class="md-flt-btn" data-side-open aria-label="' + esc(T("Abrir filtros", "Open filters")) + '">☰ ' + T("Filtros", "Filters") +
        ' <span class="md-flt-count" hidden></span></button>' : "") +
      '<div class="md-flt-chips"></div>' +
      '<button class="md-flt-clearall" data-sel-clearall hidden title="' + esc(T("Limpar todas as seleções", "Clear all selections")) + '" aria-label="' + esc(T("Limpar todas as seleções", "Clear all selections")) + '">✕</button></div>' +
      '<div class="md-sheet-back" data-sheet-close></div><div class="md-sheet" role="dialog"></div>';
  }

  function shellHtml(fields) {
    return '<div class="md-side-back" data-side-close></div><aside class="md-side" aria-label="' + esc(T("Filtros", "Filters")) + '">' +
      '<div class="md-side-head"><b>' + T("Filtros", "Filters") + '</b><button data-side-close title="' + esc(T("Recolher os filtros", "Collapse the filters")) + '">✕</button></div>' + fields.map(function (f, i) {
      return '<div class="md-flt" data-flt="' + i + '"><div class="md-flt-head"><b title="' + esc(f.field) + '">' + esc(f.label || f.field) + "</b>" +
        '<button data-flt-clear="' + i + '" title="' + esc(T("Limpar a seleção deste campo", "Clear this field's selection")) + '">✕</button></div>' +
        '<input class="md-flt-search" data-flt-search="' + i + '" placeholder="' + esc(T("Buscar… (Enter seleciona)", "Search… (Enter selects)")) + '" autocomplete="off">' +
        '<div class="md-flt-list"><div class="md-msg">' + T("Carregando…", "Loading…") + "</div></div></div>";
    }).join("") + '<button class="md-side-done" data-side-close>' + T("Ver painel", "Show dashboard") + "</button></aside>";
  }

  function listDef(field) {
    return {
      qDef: { qFieldDefs: [field], qSortCriterias: [{ qSortByState: 1, qSortByNumeric: 1, qSortByAscii: 1, qSortByLoadOrder: 1 }] },
      qShowAlternatives: true,
      qInitialDataFetch: [{ qTop: 0, qLeft: 0, qWidth: 1, qHeight: MAX_VALUES }]
    };
  }

  function norm(s) { return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }

  // Busca na lista: esconde o que não bate (sem acento e sem maiúsculas). Vários termos separados
  // por espaço precisam aparecer todos ("gerente varejo").
  function applySearch(box) {
    var terms = norm(box.querySelector(".md-flt-search").value).split(/\s+/).filter(Boolean), shown = 0;
    Array.prototype.forEach.call(box.querySelectorAll(".md-flt-item"), function (it) {
      var t = norm(it.textContent), ok = terms.every(function (x) { return t.indexOf(x) >= 0; });
      it.classList.toggle("md-flt-hide", !ok);
      if (ok) shown++;
    });
    var none = box.querySelector(".md-flt-none");
    if (none) none.style.display = terms.length && !shown ? "" : "none";
    return shown;
  }

  function visibleElems(box) {
    return Array.prototype.filter.call(box.querySelectorAll(".md-flt-item"), function (it) { return !it.classList.contains("md-flt-hide"); })
      .map(function (it) { return +it.getAttribute("data-flt-elem"); });
  }

  function drawList(box, layout) {
    var lo = layout.qListObject, page = lo.qDataPages && lo.qDataPages[0], rows = page ? page.qMatrix : [];
    var selected = rows.filter(function (r) { return r[0].qState === "S" || r[0].qState === "L"; }).length;
    box.classList.toggle("md-flt-on", selected > 0);
    box.selTexts = rows.filter(function (r) { return r[0].qState === "S" || r[0].qState === "L"; }).map(function (r) { return r[0].qText; });
    box.querySelector(".md-flt-list").innerHTML = rows.map(function (r) {
      var c = r[0];
      return '<div class="md-flt-item md-st-' + esc(c.qState) + '" data-flt-elem="' + c.qElemNumber + '" title="' + esc(c.qText) + '">' + esc(c.qText) + "</div>";
    }).join("") + '<div class="md-flt-none" style="display:none">' + T("Nenhum valor encontrado", "No values found") + "</div>" +
      (lo.qSize && lo.qSize.qcy > rows.length ? '<div class="md-flt-more">' + T("+{n} valores (use a busca)", "+{n} values (use search)", { n: lo.qSize.qcy - rows.length }) + "</div>" : "");
    box.truncated = !!(lo.qSize && lo.qSize.qcy > rows.length);
    applySearch(box);
  }

  // Chips das seleções atuais do app (objeto SelectionObject, atualizado pelo Qlik a cada seleção).
  function drawChips(root, sels, fields) {
    var bar = root.querySelector(".md-flt-bar");
    if (!bar) return;
    var labelOf = {};
    (fields || []).forEach(function (f) { labelOf[f.field] = f.label || f.field; });
    bar.classList.toggle("md-flt-bar-empty", !sels.length && bar.classList.contains("md-flt-bar-noside"));
    var count = bar.querySelector(".md-flt-count");
    if (count) { count.hidden = !sels.length; count.textContent = sels.length; }
    bar.querySelector("[data-sel-clearall]").hidden = !sels.length;
    bar.querySelector(".md-flt-chips").innerHTML = sels.length ? sels.map(function (s) {
      var name = labelOf[s.qField] || s.qField;
      var vals = s.qSelected || T("{n} de {t}", "{n} of {t}", { n: s.qSelectedCount, t: s.qTotal });
      return '<span class="md-flt-chip" data-sel-field="' + esc(s.qField) + '" title="' + esc(T("Toque para trocar os valores", "Tap to change the values")) + '">' +
        '<span class="md-flt-chip-text"><b>' + esc(name) + "</b> " + esc(vals) + "</span>" +
        '<button class="md-flt-chip-x" data-sel-clear="' + esc(s.qField) + '" aria-label="' + esc(T("Limpar {f}", "Clear {f}", { f: name })) + '">✕</button></span>';
    }).join("") : '<span class="md-flt-hint">' + T("Nenhum filtro aplicado", "No filter applied") + "</span>";
  }

  // Liga a barra: escuta as seleções do app e abre a lista de um campo por cima do painel (folha
  // inferior), no mesmo jeito da lista do Qlik: verde/azul selecionado, cinza alternativo/excluído.
  function mountBar(state, root, fields, gen) {
    var app = qlik.currApp(), bar = root.querySelector(".md-flt-bar"), sheet = root.querySelector(".md-sheet");
    if (!bar || !sheet) return;
    var labelOf = {}, sheetObj = null, sheetField = null, timer = null;
    (fields || []).forEach(function (f) { labelOf[f.field] = f.label || f.field; });
    var p = app.getList("SelectionObject", function (reply) {
      if (gen !== state.gen) return;
      var sels = reply && reply.qSelectionObject ? reply.qSelectionObject.qSelections || [] : [];
      drawChips(root, sels, fields);
    });
    if (p && p.then) p.then(function (obj) {
      if (!obj || !obj.id) return;
      if (gen !== state.gen) { try { app.destroySessionObject(obj.id); } catch (e) { /* já removido */ } return; }
      state.cubes.push(obj.id);
    }, function (e) { console.warn("DashBuilder AI: barra de seleções", e); });

    function closeSheet() {
      root.classList.remove("md-sheet-open");
      if (sheetObj && sheetObj.id) { try { app.destroySessionObject(sheetObj.id); } catch (e) { /* já removido */ } }
      sheetObj = null;
      sheetField = null;
    }
    function openSheet(field) {
      closeSheet();
      sheetField = field;
      sheet.innerHTML = '<div class="md-sheet-head"><b>' + esc(labelOf[field] || field) + '</b>' +
        '<button class="md-sheet-clear" data-sheet-clearfield>' + T("Limpar", "Clear") + '</button><button class="md-sheet-x" data-sheet-close aria-label="' + esc(T("Fechar", "Close")) + '">✕</button></div>' +
        '<div class="md-flt"><input class="md-flt-search" placeholder="' + esc(T("Buscar…", "Search…")) + '" autocomplete="off">' +
        '<div class="md-flt-list"><div class="md-msg">' + T("Carregando…", "Loading…") + "</div></div></div>" +
        '<button class="md-side-done" data-sheet-close>' + T("Pronto", "Done") + "</button>";
      root.classList.add("md-sheet-open");
      var box = sheet.querySelector(".md-flt");
      app.createList(listDef(field), function (reply) {
        if (sheetField === field && gen === state.gen) drawList(box, reply);
      }).then(function (obj) {
        if (sheetField !== field || gen !== state.gen) { try { app.destroySessionObject(obj.id); } catch (e) { /* já removido */ } return; }
        sheetObj = obj;
      }, function (err) {
        box.querySelector(".md-flt-list").innerHTML = '<div class="md-error">' + esc(err && err.message ? err.message : T("Campo indisponível.", "Field unavailable.")) + "</div>";
      });
    }

    bar.onclick = function (ev) {
      ev.stopPropagation();
      var clear = ev.target.closest("[data-sel-clear]");
      if (clear) return Promise.resolve(app.field(clear.getAttribute("data-sel-clear")).clear()).catch(function (e) { console.warn("DashBuilder AI: limpar campo", e); });
      if (ev.target.closest("[data-sel-clearall]")) return Promise.resolve(app.clearAll()).catch(function (e) { console.warn("DashBuilder AI: limpar tudo", e); });
      var chip = ev.target.closest("[data-sel-field]");
      if (chip) return openSheet(chip.getAttribute("data-sel-field"));
      if (ev.target.closest("[data-side-open]") || ev.target.closest(".md-flt-hint")) setOpen(root, true);
    };
    var back = root.querySelector(".md-sheet-back");
    if (back) back.onclick = function (ev) { ev.stopPropagation(); closeSheet(); };
    sheet.onclick = function (ev) {
      ev.stopPropagation();
      if (ev.target.closest("[data-sheet-close]")) return closeSheet();
      if (ev.target.closest("[data-sheet-clearfield]") && sheetField) return Promise.resolve(app.field(sheetField).clear()).catch(function (e) { console.warn("DashBuilder AI: limpar campo", e); });
      var item = ev.target.closest("[data-flt-elem]");
      if (item && sheetObj && sheetObj.selectListObjectValues) {
        Promise.resolve(sheetObj.selectListObjectValues("/qListObjectDef", [+item.getAttribute("data-flt-elem")], true))
          .catch(function (e) { console.warn("DashBuilder AI: seleção na lista", e); });
      }
    };
    sheet.oninput = function (ev) {
      var box = sheet.querySelector(".md-flt");
      if (!box || !ev.target.closest(".md-flt-search")) return;
      applySearch(box);
      var q = ev.target.value.trim();
      if (!sheetObj || !(box.truncated || box.searching) || !sheetObj.searchListObjectFor) return;
      clearTimeout(timer);
      timer = setTimeout(function () {
        box.searching = !!q;
        Promise.resolve(q ? sheetObj.searchListObjectFor("/qListObjectDef", "*" + q + "*") : sheetObj.abortListObjectSearch("/qListObjectDef"))
          .catch(function (e) { console.warn("DashBuilder AI: busca na lista", e); });
      }, 250);
    };
    sheet.onkeydown = sheet.onkeyup = sheet.onkeypress = function (ev) {
      ev.stopPropagation();
      if (ev.type === "keydown" && ev.key === "Escape") closeSheet();
    };
    root.mdCloseSheet = closeSheet;
  }

  function setOpen(root, open) {
    root.classList.toggle("md-side-open", !!open && root.classList.contains("md-narrow"));
  }

  // state: estado do painel (os objetos de sessão entram em state.cubes e saem no destroy).
  function mount(state, root, fields, gen) {
    var app = qlik.currApp(), side = root.querySelector(".md-side"), lists = {};
    if (!side) return;
    var back = root.querySelector(".md-side-back");
    if (back) back.onclick = function (ev) { ev.stopPropagation(); setOpen(root, false); };
    fields.forEach(function (f, i) {
      var box = side.querySelector('[data-flt="' + i + '"]');
      app.createList(listDef(f.field), function (reply) {
        if (gen === state.gen) drawList(box, reply);
      }).then(function (obj) {
        if (gen !== state.gen) { try { app.destroySessionObject(obj.id); } catch (e) { /* já removido */ } return; }
        state.cubes.push(obj.id);
        lists[i] = obj;
      }, function (err) {
        box.querySelector(".md-flt-list").innerHTML = '<div class="md-error">' + esc(err && err.message ? err.message : T("Campo indisponível.", "Field unavailable.")) + "</div>";
      });
    });
    side.onclick = function (ev) {
      ev.stopPropagation();
      if (ev.target.closest("[data-side-close]")) return setOpen(root, false);
      var item = ev.target.closest("[data-flt-elem]"), clear = ev.target.closest("[data-flt-clear]");
      if (clear) {
        var f = fields[+clear.getAttribute("data-flt-clear")];
        return Promise.resolve(app.field(f.field).clear()).catch(function (e) { console.warn("DashBuilder AI: limpar filtro", e); });
      }
      if (!item) return;
      var i = +item.closest("[data-flt]").getAttribute("data-flt"), obj = lists[i];
      if (obj && obj.selectListObjectValues) {
        Promise.resolve(obj.selectListObjectValues("/qListObjectDef", [+item.getAttribute("data-flt-elem")], true))
          .catch(function (e) { console.warn("DashBuilder AI: seleção no filtro", e); });
      }
    };
    // Campos com mais valores do que a lista carrega: a busca também vai ao Qlik, que devolve só os que batem.
    var timers = {};
    side.oninput = function (ev) {
      var box = ev.target.closest("[data-flt]");
      if (!box) return;
      applySearch(box);
      var i = +box.getAttribute("data-flt"), obj = lists[i], q = ev.target.value.trim();
      if (!obj || !(box.truncated || box.searching) || !obj.searchListObjectFor) return;
      clearTimeout(timers[i]);
      timers[i] = setTimeout(function () {
        box.searching = !!q;
        Promise.resolve(q ? obj.searchListObjectFor("/qListObjectDef", "*" + q + "*") : obj.abortListObjectSearch("/qListObjectDef"))
          .catch(function (e) { console.warn("DashBuilder AI: busca no filtro", e); });
      }, 250);
    };
    // A busca não pode mandar teclas para o Qlik (Delete apagaria o objeto em modo de edição).
    // Enter seleciona os valores encontrados; Esc limpa a busca.
    side.onkeyup = side.onkeypress = function (ev) { ev.stopPropagation(); };
    side.onkeydown = function (ev) {
      ev.stopPropagation();
      var input = ev.target.closest(".md-flt-search");
      if (!input) { if (ev.key === "Escape") setOpen(root, false); return; }
      var box = input.closest("[data-flt]"), obj = lists[+box.getAttribute("data-flt")];
      if (ev.key === "Enter" && input.value.trim() && obj && obj.selectListObjectValues) {
        ev.preventDefault();
        var elems = visibleElems(box);
        if (elems.length) {
          Promise.resolve(obj.selectListObjectValues("/qListObjectDef", elems, false))
            .catch(function (e) { console.warn("DashBuilder AI: seleção no filtro", e); });
        }
      } else if (ev.key === "Escape" && !input.value) {
        setOpen(root, false);
      } else if (ev.key === "Escape" && input.value) {
        ev.preventDefault();
        input.value = "";
        side.oninput({ target: input });
      }
    };
  }

  return { normalize: normalize, shellHtml: shellHtml, barHtml: barHtml, mount: mount, mountBar: mountBar, setOpen: setOpen };
});
