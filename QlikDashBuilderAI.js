define([
  "qlik",
  "./properties",
  "./lib/util",
  "./lib/data",
  "./lib/template",
  "./lib/sanitize",
  "./lib/tables",
  "./lib/charts",
  "./lib/cssscope",
  "./lib/actions",
  "./lib/export",
  "./lib/dashboard",
  "./lib/assistant",
  "./lib/native",
  "./lib/snapshot",
  "./lib/session",
  "./lib/i18n"
], function (qlik, props, u, data, tpl, sanitizer, tables, charts, cssscope, actions, exporter, dash, assistant, native, snapshot, session, i18n) {
  "use strict";

  var T = i18n.T;

  var BASE_CSS = [
    ".md-root { position: relative; height: 100%; display: flex; flex-direction: column; color: #334155; font-size: 13px; }",
    ".md-toolbar { position: absolute; top: 2px; right: 4px; z-index: 2; display: flex; gap: 4px; opacity: 0; transition: opacity .2s; }",
    ".md-root:hover .md-toolbar { opacity: 1; }",
    ".md-toolbar button { font-size: 11px; padding: 2px 8px; border: 1px solid #cbd5e1; border-radius: 6px; background: #fff; color: #334155; cursor: pointer; }",
    ".md-content { flex: 1; min-height: 0; overflow: auto; }",
    ".md-chart { width: 100%; height: 100%; display: flex; flex-direction: column; }",
    ".md-msg { padding: 16px; color: #94a3b8; text-align: center; }",
    ".md-error { padding: 12px; margin: 8px; color: #b91c1c; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; font-size: 12px; white-space: pre-wrap; }",
    ".md-warn { font-size: 11px; color: #b45309; padding: 2px 6px; }",
    ".md-svg { display: block; overflow: visible; }",
    ".md-svg text { font-family: inherit; }",
    ".md-axis { font-size: 11px; fill: #94a3b8; }",
    ".md-lbl { font-size: 12px; fill: #475569; }",
    ".md-val { font-size: 11px; font-weight: 600; fill: #334155; }",
    ".md-big { font-weight: 700; fill: #0f172a; }",
    ".md-legend { height: 26px; display: flex; flex-wrap: wrap; gap: 14px; align-items: center; padding: 0 8px; font-size: 12px; overflow: hidden; }",
    ".md-legend i, .md-dlegend i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 6px; vertical-align: -1px; }",
    ".md-donut { display: flex; flex-direction: column; height: 100%; }",
    ".md-donut.md-side { flex-direction: row; align-items: center; }",
    ".md-dlegend { overflow: auto; font-size: 12px; padding: 4px 8px; }",
    ".md-dlegend div { display: flex; align-items: center; padding: 3px 0; gap: 4px; }",
    ".md-dlegend span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",
    ".md-dlegend b { color: #0f172a; }",
    ".md-kpi { height: 100%; display: flex; flex-direction: column; justify-content: center; padding: 8px; }",
    ".md-kpi-label { font-size: 13px; color: #64748b; }",
    ".md-kpi-value { font-weight: 700; color: #0f172a; line-height: 1.1; }",
    ".md-kpi-spark { margin-top: auto; }",
    ".md-badge { align-self: flex-start; margin-top: 6px; font-size: 12px; font-weight: 600; padding: 2px 8px; border-radius: 999px; }",
    ".md-up { background: #dcfce7; color: #15803d; }",
    ".md-down { background: #fee2e2; color: #b91c1c; }",
    ".md-table { border-collapse: collapse; width: 100%; font-size: 12px; }",
    ".md-table th, .md-table td { border-bottom: 1px solid #eef2f7; padding: 6px 10px; text-align: left; }",
    ".md-table th { position: sticky; top: 0; background: #f8fafc; color: #475569; font-weight: 600; }",
    ".md-table tbody tr:hover td { background: #f1f5f9; }",
    ".md-table .md-num { text-align: right; font-variant-numeric: tabular-nums; }",
    ".md-table tfoot td, .md-table .md-tot { font-weight: 700; background: #f8fafc; }",
    ".md-tip { position: absolute; z-index: 5; pointer-events: none; background: #0f172a; color: #fff; font-size: 12px; padding: 6px 10px; border-radius: 6px; white-space: pre; box-shadow: 0 4px 12px rgba(0,0,0,.2); display: none; }",
    "[data-md-sel], [data-action] { cursor: pointer; }",
    "[data-md-sel]:hover { filter: brightness(1.08); }",
    ".md-anim .md-a-bar { transform-box: view-box; animation: md-grow-y .6s cubic-bezier(.2,.8,.2,1) both; }",
    ".md-anim .md-a-barx { transform-box: view-box; animation: md-grow-x .6s cubic-bezier(.2,.8,.2,1) both; }",
    ".md-anim .md-a-line { stroke-dasharray: 1; animation: md-draw 1s ease-out both; }",
    ".md-anim .md-a-fade { animation: md-fade .6s ease-out both; }",
    ".md-kpi-row { display: flex; align-items: center; gap: 8px; margin-top: 6px; }",
    ".md-kpi-row .md-badge { margin-top: 0; }",
    ".md-kpi-cmp { font-size: 11px; color: #64748b; }",
    ".md-num-tile { justify-content: center; padding: 0 4px; }",
    ".md-painel { flex: 1; min-height: 0; overflow: auto; padding: 14px 14px 56px; background: transparent; }",
    ".md-p-head h2 { margin: 0 0 2px; font-size: 18px; color: #0f172a; }",
    ".md-p-head p { margin: 0 0 12px; font-size: 12px; color: #64748b; }",
    ".md-body { display: flex; gap: 12px; align-items: flex-start; }",
    ".md-body > .md-grid { flex: 1; min-width: 0; }",
    ".md-side { width: 200px; flex: none; display: flex; flex-direction: column; gap: 10px; position: sticky; top: 0; }",
    ".md-narrow .md-body { flex-direction: column; align-items: stretch; }",
    ".md-narrow .md-side { width: auto; position: static; flex-direction: row; flex-wrap: wrap; }",
    ".md-narrow .md-flt { flex: 1 1 180px; }",
    ".md-flt { flex: none; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 10px; display: flex; flex-direction: column; gap: 8px; box-shadow: 0 1px 2px rgba(15, 23, 42, .04); }",
    ".md-flt > * { flex: none; }",
    ".md-flt-on { border-color: #22c55e; }",
    ".md-flt-head { display: flex; align-items: center; gap: 6px; }",
    ".md-flt-head b { flex: 1; min-width: 0; font-size: 12px; color: #0f172a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }",
    ".md-flt-head button { border: 0; background: none; color: #94a3b8; cursor: pointer; font-size: 12px; padding: 0 2px; }",
    ".md-flt-head button:hover { color: #b91c1c; }",
    ".md-flt-search { width: 100%; height: 30px; box-sizing: border-box; border: 1px solid #e2e8f0; border-radius: 6px; padding: 5px 8px; font: inherit; font-size: 12px; }",
    // Lista em bloco (não flex): com muitos valores os itens nunca são comprimidos; a lista rola.
    ".md-flt-list { display: block !important; max-height: 240px; overflow-y: auto; overflow-x: hidden; padding-right: 2px; }",
    ".md-flt-list .md-flt-item { display: block !important; flex: none !important; box-sizing: border-box; height: auto !important; min-height: 28px; margin: 0 0 2px; padding: 6px 8px; font-size: 12px; line-height: 16px; border-radius: 6px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #334155; }",
    ".md-flt-list .md-flt-item.md-flt-hide { display: none !important; }",
    ".md-flt-item:hover { background: #f1f5f9; }",
    ".md-flt-none { font-size: 11px; color: #94a3b8; padding: 4px 6px; }",
    ".md-flt-item.md-st-S, .md-flt-item.md-st-L { background: #22c55e; color: #fff; font-weight: 600; }",
    ".md-flt-item.md-st-A { background: #f8fafc; color: #64748b; }",
    ".md-flt-item.md-st-X, .md-flt-item.md-st-XS, .md-flt-item.md-st-XL { background: #e2e8f0; color: #94a3b8; }",
    ".md-flt-more { font-size: 11px; color: #94a3b8; padding: 2px 6px; }",
    ".md-filter { display: inline-block; margin: -4px 0 12px; padding: 3px 10px; border-radius: 999px; background: #eff6ff; color: #1d4ed8; font-size: 12px; font-weight: 600; }",
    ".md-grid { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 12px; }",
    ".md-narrow .md-tile { grid-column: span 12 !important; }",
    ".md-tile { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 10px 12px; display: flex; flex-direction: column; min-width: 0; box-shadow: 0 1px 2px rgba(15, 23, 42, .04); }",
    ".md-tile-head { font-size: 13px; font-weight: 600; color: #0f172a; margin-bottom: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }",
    ".md-tile-body { flex: 1; min-height: 0; overflow: hidden; }",
    ".md-tile-body.md-scroll { overflow: auto; }",
    ".md-tile-note { font-size: 11px; color: #64748b; margin-top: 6px; padding-top: 6px; border-top: 1px dashed #e2e8f0; }",
    ".md-empty { height: 100%; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: #64748b; text-align: center; padding: 16px; }",
    ".md-empty b { color: #0f172a; font-size: 15px; }",
    ".md-empty-icon { font-size: 34px; }",
    ".md-summary .md-painel { padding: 0; background: transparent; overflow: hidden; }",
    ".md-summary .md-ai-fab { display: none; }",
    // Somente o ícone: o objeto fica transparente e mostra só o botão IA, no centro.
    ".md-icon-only .md-painel { display: none; }",
    ".md-icon-only .md-ai-fab, .md-icon-only.md-summary .md-ai-fab { display: inline-block; left: 50%; top: 50%; bottom: auto; transform: translate(-50%, -50%); }",
    ".md-sum { height: 100%; box-sizing: border-box; display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 6px 14px; padding: 6px 14px; overflow: hidden; }",
    ".md-sum-icon { font-size: 22px; }",
    ".md-sum-text { display: flex; flex-direction: column; min-width: 0; flex: 0 1 auto; }",
    ".md-sum-text b { color: #0f172a; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }",
    ".md-sum-text span { font-size: 12px; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }",
    ".md-sum .md-ai-send, .md-sum-btn { white-space: nowrap; }",
    ".md-sum-btn { border: 1px solid #cbd5e1; background: #fff; border-radius: 8px; padding: 6px 10px; font-size: 12px; cursor: pointer; color: #334155; }",
    ".md-ai-acts { display: flex; gap: 6px; margin-top: 6px; white-space: normal; }",
    ".md-ai-fab { position: absolute; left: 10px; bottom: 10px; z-index: 6; border: 0; border-radius: 999px; padding: 8px 16px; background: linear-gradient(135deg, #2563eb, #7c3aed); color: #fff; font-weight: 600; cursor: pointer; box-shadow: 0 4px 14px rgba(37, 99, 235, .35); }",
    ".md-ai-panel { display: flex; flex-direction: column; box-sizing: border-box; background: #f8fafc; color: #334155; font-size: 13px; }",
    ".md-ai-panel *, .md-ai-panel *::before, .md-ai-panel *::after { box-sizing: border-box; }",
    ".md-ai-win { position: fixed; top: 0; right: 0; bottom: 0; left: 0; }",
    ".md-ai-float { position: fixed; z-index: 10000; width: 420px; height: 72vh; min-width: 320px; min-height: 340px; max-width: 95vw; max-height: 95vh; border: 1px solid #e2e8f0; border-radius: 14px; box-shadow: 0 20px 56px rgba(15, 23, 42, .28); resize: both; overflow: hidden; }",
    ".md-ai-float .md-ai-head { cursor: move; user-select: none; }",
    ".md-ai-head { display: flex; align-items: center; gap: 2px; padding: 10px 8px 10px 12px; background: #fff; border-bottom: 1px solid #e8edf3; }",
    ".md-ai-logo { width: 32px; height: 32px; flex: none; margin-right: 8px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 16px; color: #fff; background: linear-gradient(135deg, #2563eb, #7c3aed); box-shadow: 0 3px 10px rgba(79, 70, 229, .3); }",
    ".md-ai-brand { flex: 1; min-width: 0; display: flex; flex-direction: column; line-height: 1.25; }",
    ".md-ai-brand b { color: #0f172a; font-size: 13.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }",
    ".md-ai-brand small { color: #64748b; font-size: 11px; white-space: nowrap; }",
    ".md-ai-ico { width: 30px; height: 30px; flex: none; padding: 0; border: 1px solid transparent; border-radius: 8px; background: transparent; color: #475569; font-size: 15px; line-height: 1; cursor: pointer; display: flex; align-items: center; justify-content: center; }",
    ".md-ai-ico:hover { background: #f1f5f9; border-color: #e2e8f0; color: #0f172a; }",
    ".md-ai-chip { border: 1px solid #e2e8f0; background: #fff; border-radius: 8px; padding: 4px 10px; font-size: 11.5px; cursor: pointer; color: #334155; text-align: left; transition: border-color .15s, background .15s, color .15s; }",
    ".md-ai-chip:hover { border-color: #93c5fd; background: #eff6ff; color: #1d4ed8; }",
    ".md-ai-chip-main { background: #2563eb; border-color: #2563eb; color: #fff; font-weight: 600; }",
    ".md-ai-chip-main:hover { background: #1d4ed8; border-color: #1d4ed8; color: #fff; }",
    ".md-ai-ctx { display: flex; flex-direction: column; gap: 8px; min-height: 0; }",
    ".md-ai-ctx .md-ai-row b { flex: 1; color: #0f172a; font-size: 14px; }",
    ".md-ai-ctx-status { display: flex; flex-direction: column; gap: 2px; padding: 10px 12px; border-radius: 12px; border: 1px solid; }",
    ".md-ai-ctx-status b { font-size: 14px; }",
    ".md-ai-ctx-status span { font-size: 12px; }",
    ".md-ai-ctx-ok { background: #f0fdf4; border-color: #bbf7d0; color: #166534; }",
    ".md-ai-ctx-warn { background: #fffbeb; border-color: #fde68a; color: #92400e; }",
    ".md-ai-ctx-bad { background: #fef2f2; border-color: #fecaca; color: #991b1b; }",
    ".md-ai-ctx-checks { display: flex; flex-direction: column; gap: 3px; padding: 2px 4px; font-size: 12px; }",
    ".md-ai-ctx-good { color: #15803d; }",
    ".md-ai-ctx-miss { color: #b45309; font-weight: 600; }",
    ".md-ai-ctx-soft { color: #64748b; }",
    ".md-ai-ctx-sec { background: #fff; border: 1px solid #e8edf3; border-radius: 12px; padding: 0 12px; }",
    ".md-ai-ctx-sec summary { cursor: pointer; padding: 10px 0; font-weight: 600; color: #0f172a; font-size: 12.5px; list-style-position: inside; }",
    ".md-ai-ctx-sec[open] summary { border-bottom: 1px solid #eef2f7; margin-bottom: 6px; }",
    ".md-ai-ctx-n { display: inline-block; min-width: 18px; padding: 0 6px; margin-left: 4px; border-radius: 999px; background: #eef2f7; color: #475569; font-size: 11px; font-weight: 600; text-align: center; }",
    ".md-ai-ctx-item { display: flex; flex-direction: column; gap: 2px; padding: 6px 0; border-bottom: 1px dashed #eef2f7; font-size: 12px; }",
    ".md-ai-ctx-item:last-child { border-bottom: 0; }",
    ".md-ai-ctx-item b { color: #0f172a; }",
    ".md-ai-ctx-item span { color: #475569; }",
    ".md-ai-ctx-item code { padding: 0 5px; border-radius: 4px; background: #f1f5f9; color: #64748b; font-size: 10.5px; }",
    ".md-ai-ctx-item .md-ai-ctx-warn { background: none; border: 0; color: #b45309; }",
    ".md-ai-ctx-expr { display: block; white-space: pre-wrap; word-break: break-word; margin-top: 2px; padding: 4px 6px !important; color: #334155 !important; font-family: Consolas, monospace; }",
    ".md-ai-ctx-table { margin: 6px 0 0; font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: .03em; }",
    ".md-ai-ctx-var { white-space: pre-wrap; font-size: 12px; line-height: 1.5; color: #334155; padding-bottom: 10px; }",
    ".md-ai-ctx-empty { font-size: 12px; color: #64748b; padding-bottom: 10px; }",
    ".md-ai-ctx-sec pre { margin-bottom: 10px; max-height: 320px; overflow: auto; }",
    ".md-ai-ctx-meta { font-size: 11px; color: #64748b; }",
    ".md-ai-ctx pre { margin: 0; padding: 10px; background: #0f172a; color: #e2e8f0; border-radius: 10px; font-size: 11px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }",
    ".md-ai-hist { position: absolute; left: 0; right: 0; bottom: 0; z-index: 30; }",
    ".md-ai-hist-back { position: absolute; top: 0; right: 0; bottom: 0; left: 0; background: rgba(15, 23, 42, .28); }",
    ".md-ai-hist-box { position: absolute; top: 0; left: 0; bottom: 0; width: min(330px, 86%); display: flex; flex-direction: column; gap: 8px; padding: 12px; background: #fff; border-right: 1px solid #e2e8f0; box-shadow: 8px 0 28px rgba(15, 23, 42, .18); }",
    ".md-ai-hist-top { display: flex; align-items: center; gap: 8px; }",
    ".md-ai-hist-top b { color: #0f172a; font-size: 14px; }",
    ".md-ai-hist-top span { flex: 1; color: #64748b; font-size: 11px; }",
    ".md-ai-hist-new { padding: 8px 12px; border-radius: 10px; font-weight: 600; }",
    ".md-ai-hist-list { flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; gap: 4px; }",
    ".md-ai-hist-item { display: flex; align-items: stretch; border: 1px solid transparent; border-radius: 10px; }",
    ".md-ai-hist-item:hover { background: #f8fafc; border-color: #e2e8f0; }",
    ".md-ai-hist-item.md-on { background: #eff6ff; border-color: #bfdbfe; }",
    ".md-ai-hist-open { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; padding: 8px 10px; border: 0; background: transparent; text-align: left; cursor: pointer; color: #334155; font: inherit; }",
    ".md-ai-hist-open b { color: #0f172a; font-size: 12.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }",
    ".md-ai-hist-open small { color: #64748b; font-size: 11px; }",
    ".md-ai-hist-del { flex: none; width: 32px; border: 0; background: transparent; border-radius: 8px; cursor: pointer; opacity: .45; font-size: 13px; }",
    ".md-ai-hist-item:hover .md-ai-hist-del { opacity: 1; }",
    ".md-ai-hist-del:hover { background: #fef2f2; }",
    ".md-ai-hist-cur { padding: 8px 10px; border-radius: 10px; background: #f8fafc; border: 1px dashed #cbd5e1; color: #475569; font-size: 11.5px; line-height: 1.45; }",
    ".md-ai-hist-empty { padding: 16px 6px; color: #64748b; font-size: 12px; line-height: 1.5; }",
    ".md-ai-hist-foot { display: flex; flex-direction: column; gap: 6px; padding-top: 8px; border-top: 1px solid #eef2f7; color: #64748b; font-size: 11px; line-height: 1.45; }",
    ".md-ai-hist-foot .md-ai-chip { align-self: flex-start; }",
    ".md-ai-log { flex: 1; min-height: 0; overflow: auto; padding: 14px; display: flex; flex-direction: column; gap: 10px; }",
    ".md-ai-msg { position: relative; padding: 9px 12px; border-radius: 14px; font-size: 12.5px; line-height: 1.5; white-space: pre-wrap; word-wrap: break-word; max-width: 88%; }",
    ".md-ai-user { align-self: flex-end; background: linear-gradient(135deg, #2563eb, #4f46e5); color: #fff; border-bottom-right-radius: 4px; box-shadow: 0 2px 8px rgba(37, 99, 235, .25); }",
    ".md-ai-bot { align-self: flex-start; background: #fff; color: #0f172a; border: 1px solid #e8edf3; border-bottom-left-radius: 4px; box-shadow: 0 1px 2px rgba(15, 23, 42, .05); white-space: normal; }",
    ".md-ai-md p { margin: 0 0 6px; }",
    ".md-ai-md p:last-child { margin-bottom: 0; }",
    ".md-ai-md p:empty { display: none; }",
    ".md-ai-md ul { margin: 2px 0 6px; padding-left: 18px; }",
    ".md-ai-md li { margin: 2px 0; }",
    ".md-ai-tbl { width: 100%; border-collapse: collapse; margin: 4px 0 8px; font-size: 11.5px; }",
    ".md-ai-tbl th, .md-ai-tbl td { padding: 4px 6px; border-bottom: 1px solid #eef2f7; text-align: left; }",
    ".md-ai-tbl th { background: #f8fafc; color: #64748b; font-weight: 600; }",
    ".md-ai-tbl td + td, .md-ai-tbl th + th { text-align: right; font-variant-numeric: tabular-nums; }",
    ".md-ai-note { align-self: center; max-width: 96%; padding: 6px 12px; border-radius: 10px; background: #eef2f7; color: #475569; font-size: 11.5px; text-align: center; }",
    ".md-ai-note .md-ai-acts { justify-content: center; }",
    ".md-ai-acts-bot { margin-top: 8px; padding-top: 7px; border-top: 1px dashed #e2e8f0; }",
    ".md-ai-acts-bot .md-ai-chip { padding: 3px 9px; font-size: 11px; color: #475569; }",
    ".md-ai-chip.md-ai-ok, .md-ai-tblcopy.md-ai-ok { border-color: #86efac; background: #f0fdf4; color: #15803d; }",
    ".md-ai-tblwrap { position: relative; }",
    ".md-ai-tblcopy { position: absolute; top: 2px; right: 0; z-index: 2; border: 1px solid #e2e8f0; border-radius: 6px; background: #fff; padding: 1px 5px; font-size: 11px; cursor: pointer; opacity: 0; transition: opacity .15s; }",
    ".md-ai-tblwrap:hover .md-ai-tblcopy, .md-ai-tblcopy:focus-visible, .md-ai-tblcopy.md-ai-ok { opacity: 1; }",
    ".md-ai-err { align-self: stretch; max-width: none; background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }",
    ".md-ai-busy { color: #64748b; font-style: italic; }",
    ".md-ai-busy::before { content: '⏳ '; font-style: normal; }",
    ".md-ai-hello { padding: 22px 12px 8px; text-align: center; color: #475569; }",
    ".md-ai-hello-ico { width: 52px; height: 52px; margin: 0 auto 12px; border-radius: 16px; display: flex; align-items: center; justify-content: center; font-size: 26px; background: linear-gradient(135deg, #dbeafe, #ede9fe); }",
    ".md-ai-hello b { display: block; margin-bottom: 6px; color: #0f172a; font-size: 15px; }",
    ".md-ai-hello p { max-width: 340px; margin: 0 auto; font-size: 12.5px; line-height: 1.55; }",
    ".md-ai-chips { display: flex; flex-direction: column; gap: 6px; }",
    ".md-ai-chips .md-ai-chip { padding: 9px 12px; border-radius: 10px; font-size: 12px; }",
    ".md-ai-chips .md-ai-chip::before { content: '→  '; color: #94a3b8; }",
    ".md-ai-key, .md-ai-input { display: flex; flex-direction: column; gap: 8px; border-top: 1px solid #e8edf3; color: #475569; }",
    ".md-ai-key { padding: 6px 12px; background: #f8fafc; font-size: 11.5px; }",
    ".md-ai-key:empty { display: none; }",
    ".md-ai-key input { width: 100%; border: 1px solid #cbd5e1; border-radius: 8px; padding: 7px 8px; font: inherit; color: #0f172a; }",
    ".md-ai-input { padding: 10px 12px 12px; background: #fff; font-size: 12px; }",
    ".md-ai-composer { border: 1px solid #cbd5e1; border-radius: 12px; background: #fff; transition: border-color .15s, box-shadow .15s; }",
    ".md-ai-composer:focus-within { border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37, 99, 235, .15); }",
    ".md-ai-composer textarea { display: block; width: 100%; min-height: 62px; max-height: 220px; padding: 10px 12px 4px; border: 0; outline: 0; resize: vertical; background: transparent; font: inherit; font-size: 13px; color: #0f172a; }",
    ".md-ai-composer .md-ai-row { padding: 4px 6px 6px; }",
    ".md-ai-row { display: flex; align-items: center; gap: 8px; }",
    ".md-ai-row span { flex: 1; min-width: 0; color: #64748b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",
    ".md-ai-row .md-ai-hintline { color: #94a3b8; font-size: 11px; }",
    ".md-ai-row .md-ai-hintline.md-ai-file { color: #1d4ed8; }",
    ".md-ai-send { border: 0; background: linear-gradient(135deg, #2563eb, #4f46e5); color: #fff; border-radius: 9px; padding: 7px 14px; cursor: pointer; font-weight: 600; font-size: 12.5px; box-shadow: 0 2px 6px rgba(37, 99, 235, .3); }",
    ".md-ai-send:hover { filter: brightness(1.08); }",
    ".md-ai-send[disabled] { opacity: .5; cursor: default; box-shadow: none; filter: none; }",
    ".md-ai-attach { width: 30px; height: 30px; flex: none; border-radius: 8px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 15px; }",
    ".md-ai-attach:hover { background: #f1f5f9; }",
    ".md-ai-edit { margin-left: 8px; border: 0; border-radius: 4px; padding: 0 5px; background: rgba(255, 255, 255, .2); color: #fff; font-size: 11px; cursor: pointer; vertical-align: 1px; }",
    ".md-ai-edit:hover { background: rgba(255, 255, 255, .4); }",
    ".md-ai-editing { outline: 2px solid #f59e0b; outline-offset: 2px; }",
    ".md-ai-editbar, .md-ai-modehint { display: flex; align-items: center; gap: 8px; padding: 7px 10px; border-radius: 10px; }",
    ".md-ai-editbar { background: #fffbeb; color: #92400e; }",
    ".md-ai-modehint { background: #eff6ff; color: #1e40af; }",
    ".md-ai-editbar span, .md-ai-modehint span { flex: 1; }",
    ".md-ai-editbar:empty, .md-ai-modehint:empty { display: none; }",
    ".md-ai-modes { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px; padding: 4px; border-radius: 12px; background: #f1f5f9; }",
    ".md-ai-modes button { display: flex; flex-direction: column; align-items: center; gap: 1px; min-width: 0; padding: 6px 4px; border: 0; border-radius: 9px; background: transparent; color: #475569; font-size: 11px; cursor: pointer; transition: background .15s, color .15s, box-shadow .15s; }",
    ".md-ai-modes button i { font-style: normal; font-size: 16px; line-height: 1.2; }",
    ".md-ai-modes button span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",
    ".md-ai-modes button:hover { background: rgba(255, 255, 255, .75); color: #0f172a; }",
    ".md-ai-modes button.md-on { background: #fff; color: #1d4ed8; font-weight: 600; box-shadow: 0 1px 3px rgba(15, 23, 42, .14); }",
    ".md-ai-panel [data-hint] { position: relative; --tx: -50%; }",
    ".md-ai-panel [data-hint]::after { content: attr(data-hint); position: absolute; z-index: 40; left: 50%; bottom: calc(100% + 8px); width: max-content; max-width: 250px; padding: 8px 10px; border-radius: 8px; background: #0f172a; color: #f8fafc; font-size: 11.5px; font-weight: 400; font-style: normal; line-height: 1.45; text-align: left; white-space: normal; box-shadow: 0 8px 24px rgba(15, 23, 42, .28); opacity: 0; pointer-events: none; transform: translate(var(--tx), 4px); transition: opacity .12s ease, transform .12s ease; }",
    ".md-ai-panel [data-hint]:hover::after, .md-ai-panel [data-hint]:focus-visible::after { opacity: 1; transform: translate(var(--tx), 0); transition-delay: .25s; }",
    ".md-ai-panel [data-hint-pos^=down]::after { bottom: auto; top: calc(100% + 8px); }",
    ".md-ai-panel [data-hint-pos=start], .md-ai-panel [data-hint-pos=up-start], .md-ai-panel [data-hint-pos$=end] { --tx: 0; }",
    ".md-ai-panel [data-hint-pos=start]::after, .md-ai-panel [data-hint-pos=up-start]::after { left: 0; }",
    ".md-ai-panel [data-hint-pos$=end]::after { left: auto; right: 0; }",
    "@media print { .md-toolbar, .md-tip, .md-warn, .md-ai-fab, .md-ai-panel { display: none !important; } .md-content, .md-painel { overflow: visible; } }"
  ].join("\n");

  var KEYFRAMES = [
    "@keyframes md-grow-y { from { transform: scaleY(0); } }",
    "@keyframes md-grow-x { from { transform: scaleX(0); } }",
    "@keyframes md-draw { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }",
    "@keyframes md-fade { from { opacity: 0; } }"
  ].join("\n");

  var VERSION = "0.24.0";
  console.info("Qlik DashBuilder AI " + VERSION + " carregado.");

  function scopeId(layout) {
    return "md-" + String(layout.qInfo.qId).replace(/[^\w-]/g, "");
  }

  function chartOpts(cfg, node) {
    var d = node.dataset;
    return {
      palette: d.palette || cfg.palette,
      customColors: d.colors || cfg.customColors,
      target: d.target != null ? d.target : cfg.target,
      topN: d.top || cfg.topN,
      showValues: d.values != null ? d.values !== "false" : cfg.showValues,
      barWidth: cfg.barWidth,
      lineWidth: cfg.lineWidth,
      ringWidth: cfg.ringWidth
    };
  }

  // Desenha todos os elementos [data-chart] depois que estão no DOM (precisa do tamanho real).
  function drawCharts(root, cfg, model) {
    Array.prototype.forEach.call(root.querySelectorAll("[data-chart]"), function (node) {
      var style = getComputedStyle(node);
      var w = node.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      var h = node.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      node.innerHTML = charts.render(node.getAttribute("data-chart"), model, chartOpts(cfg, node), w > 0 ? w : 400, h > 0 ? h : 260);
    });
  }

  function renderContent(cfg, model) {
    if (!model.dims.length && !model.meas.length) {
      return "<div class=\"md-msg\">" + T("Adicione dimensões e medidas no painel de propriedades.", "Add dimensions and measures in the properties panel.") + "</div>";
    }
    if (cfg.mode === "table") return tables.table(model);
    if (cfg.mode === "pivot") return tables.pivot(model);
    if (cfg.mode === "template") return sanitizer.sanitize(tpl.render(cfg.html, model));
    return "<div class=\"md-chart\" data-chart=\"" + u.esc(cfg.chartType) + "\"></div>";
  }

  // handlers: { exportCsv, exportPdf, select(el), openAssistant }
  function bindEvents(el, root, handlers) {
    var tipEl = root.querySelector(".md-tip");

    el.onclick = function (ev) {
      var act = ev.target.closest("[data-md-act]");
      if (act) {
        var kind = act.getAttribute("data-md-act");
        if (kind === "html-download" || kind === "html-open") return handlers.exportHtml && handlers.exportHtml(kind);
        return kind === "csv" ? handlers.exportCsv() : handlers.exportPdf();
      }
      if (ev.target.closest("[data-ai-open]")) return handlers.openAssistant && handlers.openAssistant();
      if (actions.isEditMode()) return;
      var action = ev.target.closest("[data-action]");
      if (action && el.contains(action)) {
        return Promise.resolve(actions.run(action, handlers)).catch(function (e) { console.error("DashBuilder AI ação:", e); });
      }
      var sel = ev.target.closest("[data-md-sel]");
      if (sel) Promise.resolve(handlers.select(sel)).catch(function (e) { console.error("DashBuilder AI seleção:", e); });
    };

    root.onmousemove = function (ev) {
      var t = ev.target.closest && ev.target.closest("[data-tip]");
      if (!t) { tipEl.style.display = "none"; return; }
      tipEl.textContent = t.getAttribute("data-tip");
      tipEl.style.display = "block";
      var r = root.getBoundingClientRect(), x = ev.clientX - r.left + 14, y = ev.clientY - r.top + 14;
      if (x + tipEl.offsetWidth > r.width) x = ev.clientX - r.left - tipEl.offsetWidth - 10;
      if (y + tipEl.offsetHeight > r.height) y = ev.clientY - r.top - tipEl.offsetHeight - 10;
      tipEl.style.left = Math.max(x, 0) + "px";
      tipEl.style.top = Math.max(y, 0) + "px";
    };
    root.onmouseleave = function () { tipEl.style.display = "none"; };
  }

  function selParts(selEl) {
    var parts = selEl.getAttribute("data-md-sel").split(":");
    return { dim: +parts[0], elem: +parts[1] };
  }

  function showError(el, err) {
    console.error("DashBuilder AI:", err);
    el.innerHTML = "<div class=\"md-error\">" + T("Qlik DashBuilder AI não conseguiu desenhar este objeto.", "Qlik DashBuilder AI could not render this object.") + "\n" + u.esc(err && (err.message || err)) + "</div>";
  }

  // Estado que precisa sobreviver entre paints (cubos do painel, conversa, DOM do chat).
  function stateOf(self) {
    var holder = self.$scope || self;
    return holder.mdState || (holder.mdState = { dash: dash.newState() });
  }

  function saveMd(self, values) {
    self.backendApi.getProperties().then(function (p) {
      p.md = Object.assign({}, p.md, values);
      return self.backendApi.setProperties(p);
    }).catch(function (e) {
      console.warn("DashBuilder AI: o painel não foi salvo no objeto (sem permissão de edição?). Ele continua visível nesta sessão.", e);
    });
  }

  // HTML Complexo: gera (ou reaproveita) a página estática do painel atual, ou de outro JSON
  // (os relatórios pedidos no modo Conversa, que não mexem no painel da pasta).
  // kind "html-download" baixa o arquivo, "html-open" abre numa aba; sem kind só deixa pronto.
  function exportStatic(state, kind, win, json) {
    json = json || state.dash.key || "";
    var tab = kind === "html-open" ? snapshot.openTab(win) : null;
    var cache = state.staticCache || (state.staticCache = {});
    var p = cache[json] || (cache[json] = snapshot.build(json, { baseCss: BASE_CSS, cfg: state.cfg, scope: state.root.parentNode.className }));
    p.then(null, function () { delete cache[json]; });
    return p.then(function (res) {
      if (kind === "html-open" && tab) snapshot.show(tab, res);
      else if (kind) snapshot.download(res, win && win.document);
      return res;
    }, function (err) {
      if (tab) tab.close();
      throw err;
    });
  }

  // Quais objetos da pasta o assistente criou (para atualizar só esses depois).
  function nativeMap(state) {
    if (state.nativeMap === undefined) {
      try { state.nativeMap = JSON.parse(state.cfg.nativeObjects || "null"); } catch (e) { state.nativeMap = null; }
    }
    return state.nativeMap;
  }

  function releasePainel(state) {
    if (!state.root) return;
    if (state.assistant) state.assistant.destroy(false);
    dash.destroy(state.dash);
    state.root = null;
  }

  // Fundo do objeto. O branco vem do cartão do próprio Qlik (article.qv-object e vizinhos), por fora
  // da extensão; por isso os ancestrais até a célula da grade recebem o fundo com estilo inline.
  // md.bgMode: "auto" (transparente só com o ícone IA) | "padrao" (tema do Qlik) | "transparente" | "cor".
  function bgColorOf(cfg) {
    var c = cfg.bgColor;
    if (c && typeof c === "object") c = c.color;
    c = String(c || "").trim();
    return /^(#[0-9a-f]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\)|[a-z]+)$/i.test(c) ? c : "#ffffff";
  }
  var HOST_PROPS = ["background-color", "background-image", "box-shadow"];
  function hostBackground(self, el, cfg) {
    var mode = cfg.bgMode || "auto";
    if (mode === "auto") mode = cfg.mode === "painel" && cfg.iconOnly ? "transparente" : "padrao";
    var chain = [], node = el, card = null;
    for (var i = 0; node && node !== document.body && i < 10; i++, node = node.parentElement) {
      chain.push(node);
      if (!card && node.classList.contains("qv-object")) card = node;
      if (node.classList.contains("qv-gridcell")) break;
    }
    if (!card) card = chain[Math.min(chain.length - 1, 3)];
    // Devolve o estilo inline que o nó tinha antes (o Qlik pode ter posto o dele).
    function restore(n) {
      var o = n._mdBg;
      if (!o) return;
      HOST_PROPS.forEach(function (k, i) {
        if (o[i][0]) n.style.setProperty(k, o[i][0], o[i][1]); else n.style.removeProperty(k);
      });
      n._mdBg = null;
    }
    (self._mdHost || []).forEach(function (n) { if (mode === "padrao" || chain.indexOf(n) < 0) restore(n); });
    if (mode === "padrao") { self._mdHost = []; return; }
    self._mdHost = chain;
    chain.forEach(function (n) {
      if (!n._mdBg) n._mdBg = HOST_PROPS.map(function (k) { return [n.style.getPropertyValue(k), n.style.getPropertyPriority(k)]; });
      n.style.setProperty("background-color", mode === "cor" && n === card ? bgColorOf(cfg) : "transparent", "important");
      n.style.setProperty("background-image", "none", "important");
      if (mode === "transparente") n.style.setProperty("box-shadow", "none", "important");
      else if (n._mdBg[2][0]) n.style.setProperty("box-shadow", n._mdBg[2][0], n._mdBg[2][1]);
      else n.style.removeProperty("box-shadow");
    });
  }

  // withAssistant false = objeto "somente painel", criado pelo assistente para o painel HTML.
  function paintPainel(self, el, layout, cfg, id, isResize, withAssistant) {
    var state = stateOf(self);
    state.cfg = cfg;
    state.layout = layout;
    if (withAssistant) session.setEnabled(cfg.separateSession);
    var css = KEYFRAMES + "\n" + cssscope.scope(BASE_CSS, "." + id);
    var title = layout.title || "Qlik DashBuilder AI";

    // Trocar o idioma refaz o objeto: o assistente e o painel são montados com os textos do idioma.
    if (!state.root || !el.contains(state.root) || state.css !== css || state.withAssistant !== withAssistant || state.lang !== i18n.getLang()) {
      state.lang = i18n.getLang();
      if (state.assistant) state.assistant.destroy(true);
      state.assistant = null;
      state.withAssistant = withAssistant;
      dash.destroy(state.dash);
      el.innerHTML =
        "<style>" + css + "</style>" +
        "<div class=\"" + id + "\" style=\"height:100%\"><div class=\"md-root" + (cfg.animate ? " md-anim" : "") + "\">" +
        (cfg.toolbar ? "<div class=\"md-toolbar\"><button data-md-act=\"pdf\">PDF</button></div>" : "") +
        "<div class=\"md-painel\"></div>" + (withAssistant ? "<div class=\"md-ai\"></div>" : "") + "<div class=\"md-tip\"></div>" +
        "</div></div>";
      state.root = el.querySelector(".md-root");
      state.painel = state.root.querySelector(".md-painel");
      state.css = css;
      state.dashSummary = null;
      if (withAssistant) state.assistant = assistant.mount(state.root.querySelector(".md-ai"), {
        state: state,
        scope: id,
        css: function () { return state.css; },
        cfg: function () { return state.cfg; },
        getSpecJson: function () { return state.dash.key || ""; },
        panelMissing: function () { return native.missing(qlik.currApp(), nativeMap(state)); },
        exportHtml: function (kind, win, json) { return exportStatic(state, kind, win, json); },
        buildReport: function (json) { return exportStatic(state, null, null, json); },
        // Coloca o painel na pasta, fora do assistente: objetos nativos (modo "Objetos Qlik") ou um
        // objeto separado da extensão (modo HTML). Resolve com o texto do que mudou na pasta.
        applySpec: function (json) {
          state.sessionSpec = json;
          var spec = dash.parse(json);
          return native.sync(qlik.currApp(), spec, nativeMap(state), {
            selfId: state.layout.qInfo.qId, extType: state.layout.visualization || "QlikDashBuilderAI", cfg: state.cfg, json: json
          }).then(function (res) {
            state.nativeMap = res.map;
            state.inline = false;
            mountPainel(state, json);
            saveMd(self, { dashboard: json, nativeObjects: JSON.stringify(res.map) });
            var msg = native.describe(res);
            if (!spec || spec.render !== "simples") return msg;
            // HTML Complexo: já extrai os dados e deixa a página pronta para baixar ou abrir.
            return exportStatic(state, null).then(function (r) {
              return (msg ? msg + " " : "") + T("HTML Complexo pronto: {n} bloco(s) com os dados de {at}", "Complex HTML ready: {n} block(s) with data from {at}", { n: r.tiles, at: r.at.toLocaleString(i18n.locale()) }) +
                (r.session ? T(", calculados numa sessão separada do app: as suas seleções não foram tocadas.", ", calculated in a separate app session: your selections were not touched.") :
                  r.isolated ? T(", sem depender das seleções do Qlik.", ", independent of Qlik selections.") : T(". Atenção: não consegui isolar das seleções; as linhas podem seguir o que está selecionado.", ". Warning: could not isolate from selections; rows may follow what is selected.")) +
                (r.method === "sessao" ? T(" A série foi extraída filtrando cada período, um por vez, também numa sessão separada.", " The series was extracted by filtering each period, one at a time, also in a separate session.") :
                  r.method === "selecao" ? T(" A série foi extraída filtrando cada período no app, um por vez; as suas seleções foram devolvidas no fim.", " The series was extracted by filtering each period in the app, one at a time; your selections were restored at the end.") :
                  r.method === "set" ? T(" Não deu para filtrar no app (sem permissão para criar o favorito temporário), então cada período foi calculado por set analysis.", " Could not filter in the app (no permission to create the temporary bookmark), so each period was calculated with set analysis.") : "");
            });
          }, function (err) {
            // Sem objetos na pasta, o painel aparece em HTML dentro do assistente para o trabalho não se perder.
            if (spec && spec.render === "qlik") json = JSON.stringify(Object.assign(JSON.parse(json), { render: "html" }));
            state.sessionSpec = json;
            state.inline = true;
            mountPainel(state, json);
            saveMd(self, { dashboard: json });
            throw new Error((err && err.message ? err.message : String(err)) + T(" Por enquanto o painel foi montado em HTML dentro do assistente.", " For now the panel was built in HTML inside the assistant."));
          });
        }
      });
      bindEvents(el, state.root, {
        exportCsv: function () { },
        exportPdf: function () { exporter.exportPdf(state.root.parentNode, css, title); },
        openAssistant: function () { if (state.assistant) state.assistant.open(); },
        exportHtml: function (kind) {
          exportStatic(state, kind).catch(function (e) { console.error("DashBuilder AI: HTML Complexo", e); });
        },
        select: function (selEl) {
          var tile = selEl.closest("[data-tile]"), p = selParts(selEl);
          return tile ? dash.select(state.dash, tile.getAttribute("data-tile"), p.dim, p.elem) : null;
        }
      });
    }

    if (state.assistant && (!state.chat || !state.chat.busy)) state.assistant.refresh();
    var saved = cfg.dashboard || "";
    if (state.sessionSpec != null && state.sessionSpec === saved) state.sessionSpec = null;
    var json = state.sessionSpec != null ? state.sessionSpec : saved;
    if (!mountPainel(state, json) && isResize) dash.redraw(state.dash, state.painel, cfg);
    return qlik.Promise.resolve();
  }

  // Remonta o painel se o JSON ou o jeito de mostrar (completo ou só o resumo) mudou. Devolve true se remontou.
  function mountPainel(state, json) {
    var spec = dash.parse(json);
    var summary = !!state.withAssistant && !state.inline && (native.hasObjects(nativeMap(state)) || !!(spec && spec.render === "simples"));
    state.root.classList.toggle("md-summary", summary && !!spec);
    // Se o painel caiu para dentro do assistente (state.inline), ele precisa aparecer.
    state.root.classList.toggle("md-icon-only", !!state.withAssistant && !!state.cfg.iconOnly && !state.inline);
    if (state.dash.key === json && state.dashSummary === summary) return false;
    state.dashSummary = summary;
    dash.mount(state.dash, state.painel, json, state.cfg, { summary: summary, standalone: !state.withAssistant });
    return true;
  }

  return {
    initialProperties: {
      qHyperCubeDef: {
        qDimensions: [],
        qMeasures: [],
        qInitialDataFetch: [{ qWidth: 15, qHeight: 600 }],
        qSuppressZero: false,
        qSuppressMissing: true
      },
      md: props.defaults
    },
    definition: props.definition,
    support: { snapshot: true, export: true, exportData: true },

    controller: ["$scope", function ($scope) {
      $scope.$on("$destroy", function () {
        if (!$scope.mdState) return;
        if ($scope.mdState.assistant) $scope.mdState.assistant.destroy(false);
        dash.destroy($scope.mdState.dash);
      });
    }],

    paint: function ($element, layout) {
      var self = this, el = $element[0], isResize = self._mdResizing;
      self._mdResizing = false;
      try {
        var cfg = Object.assign({}, props.defaults, layout.md);
        var id = scopeId(layout);
        i18n.setLang(cfg.language);
        try { hostBackground(self, el, cfg); } catch (e) { console.warn("DashBuilder AI: fundo do objeto", e); }
        if (cfg.mode === "painel" || cfg.mode === "dashboard") return paintPainel(self, el, layout, cfg, id, isResize, cfg.mode === "painel");
        releasePainel(stateOf(self));
        return data.fetchAll(self.backendApi, layout, cfg.maxRows).then(function (model) {
          var css = KEYFRAMES + "\n" + cssscope.scope(BASE_CSS + "\n" + (cfg.css || ""), "." + id);
          var title = layout.title || "Qlik DashBuilder AI";
          el.innerHTML =
            "<style>" + css + "</style>" +
            "<div class=\"" + id + "\" style=\"height:100%\"><div class=\"md-root" + (cfg.animate && !isResize ? " md-anim" : "") + "\">" +
            (cfg.toolbar ? "<div class=\"md-toolbar\"><button data-md-act=\"csv\">Excel</button><button data-md-act=\"pdf\">PDF</button></div>" : "") +
            (model.truncated ? "<div class=\"md-warn\">" + T("Exibindo {n} linhas (limite configurado).", "Showing {n} rows (configured limit).", { n: model.rows.length }) + "</div>" : "") +
            "<div class=\"md-content\">" + renderContent(cfg, model) + "</div>" +
            "<div class=\"md-tip\"></div>" +
            "</div></div>";
          var root = el.querySelector(".md-root");
          drawCharts(root, cfg, model);
          bindEvents(el, root, {
            exportCsv: function () { exporter.exportCsv(model, title); },
            exportPdf: function () { exporter.exportPdf(root.parentNode, css, title); },
            select: function (selEl) {
              var p = selParts(selEl);
              return self.backendApi.selectValues(p.dim, [p.elem], true);
            }
          });
        }).catch(function (err) { showError(el, err); });
      } catch (err) {
        showError(el, err);
        return qlik.Promise.resolve();
      }
    },

    resize: function ($element, layout) {
      this._mdResizing = true;
      return this.paint($element, layout);
    }
  };
});
