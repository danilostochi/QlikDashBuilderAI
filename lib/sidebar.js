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

  function shellHtml(fields) {
    return '<aside class="md-side">' + fields.map(function (f, i) {
      return '<div class="md-flt" data-flt="' + i + '"><div class="md-flt-head"><b title="' + esc(f.field) + '">' + esc(f.label || f.field) + "</b>" +
        '<button data-flt-clear="' + i + '" title="' + esc(T("Limpar a seleção deste campo", "Clear this field's selection")) + '">✕</button></div>' +
        '<input class="md-flt-search" data-flt-search="' + i + '" placeholder="' + esc(T("Buscar… (Enter seleciona)", "Search… (Enter selects)")) + '" autocomplete="off">' +
        '<div class="md-flt-list"><div class="md-msg">' + T("Carregando…", "Loading…") + "</div></div></div>";
    }).join("") + "</aside>";
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
    box.querySelector(".md-flt-list").innerHTML = rows.map(function (r) {
      var c = r[0];
      return '<div class="md-flt-item md-st-' + esc(c.qState) + '" data-flt-elem="' + c.qElemNumber + '" title="' + esc(c.qText) + '">' + esc(c.qText) + "</div>";
    }).join("") + '<div class="md-flt-none" style="display:none">' + T("Nenhum valor encontrado", "No values found") + "</div>" +
      (lo.qSize && lo.qSize.qcy > rows.length ? '<div class="md-flt-more">' + T("+{n} valores (use a busca)", "+{n} values (use search)", { n: lo.qSize.qcy - rows.length }) + "</div>" : "");
    box.truncated = !!(lo.qSize && lo.qSize.qcy > rows.length);
    applySearch(box);
  }

  // state: estado do painel (os objetos de sessão entram em state.cubes e saem no destroy).
  function mount(state, root, fields, gen) {
    var app = qlik.currApp(), side = root.querySelector(".md-side"), lists = {};
    if (!side) return;
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
      if (!input) return;
      var box = input.closest("[data-flt]"), obj = lists[+box.getAttribute("data-flt")];
      if (ev.key === "Enter" && input.value.trim() && obj && obj.selectListObjectValues) {
        ev.preventDefault();
        var elems = visibleElems(box);
        if (elems.length) {
          Promise.resolve(obj.selectListObjectValues("/qListObjectDef", elems, false))
            .catch(function (e) { console.warn("DashBuilder AI: seleção no filtro", e); });
        }
      } else if (ev.key === "Escape" && input.value) {
        ev.preventDefault();
        input.value = "";
        side.oninput({ target: input });
      }
    };
  }

  return { normalize: normalize, shellHtml: shellHtml, mount: mount };
});
