# Qlik DashBuilder AI

**English** · [Português (Brasil)](README.pt-BR.md)

A Qlik Sense visualization extension (Qlik Cloud and Client-Managed) that adds an **AI assistant inside your app**. Ask in plain language and it answers with numbers calculated by the Qlik engine. It can also build dashboards, either as native Qlik objects, as a panel drawn by the extension, or as a standalone HTML page you can download.

It works with **Google Gemini**, **Anthropic Claude**, **OpenAI** or **OpenRouter**. It has no backend and no external libraries: the browser talks directly to the AI provider, and the API key stays in the user's browser.

> Current version: **0.24.0** · UI in **English** and **Brazilian Portuguese**

---

## Contents

- [What's new](#whats-new)
- [Features](#features)
- [How it works](#how-it-works)
- [Requirements](#requirements)
- [Installation](#installation)
- [Getting started](#getting-started)
- [How to use (step by step)](#how-to-use-step-by-step)
- [Test questions](#test-questions)
- [Assistant modes](#assistant-modes)
- [Preparing your app for the AI (curation)](#preparing-your-app-for-the-ai-curation)
- [Properties reference](#properties-reference)
- [Complex HTML and separate session](#complex-html-and-separate-session)
- [Period-consolidated measures](#period-consolidated-measures)
- [Filters and segmented views](#filters-and-segmented-views)
- [Costs and privacy](#costs-and-privacy)
- [Troubleshooting](#troubleshooting)
- [Project structure](#project-structure)
- [Building the zip](#building-the-zip)
- [Legacy modes](#legacy-modes)
- [License](#license)

---

## What's new

- **0.24.0** — Chat filters (periods, branches…) are applied as **real selections** in a separate app session, so comparisons such as "09/2026 vs 09/2025" return the right value for each period with governed measures. Wrong period formats give a clear error, identical values across rows are flagged, and the AI is instructed to label every number with its period and compute the difference.
- **0.23.x** — **🕘 Chat history** in the browser (up to 15 per app), resumable with full context. A dashboard deleted by hand is recreated when you ask again.
- **0.22.0** — **OpenAI** as a fourth AI provider.
- **0.21.x** — Bilingual extension (English and Portuguese). First public release.

## Features

- **Chat with your data.** The AI asks Qlik for the numbers it needs (totals, rankings, values by field, series by period), the engine calculates them on the spot, and the AI answers in text. Period or slice filters (e.g. "turnover 09/2026 vs 09/2025") are applied as **real selections** in a separate app session, like Complex HTML, so governed measures that read the selection (`$(=Max(Competência))` and the like) return the right value for each period without touching your selections.
- **Copy and Excel.** Answers can be copied with formatted tables (paste into Excel or Word) or downloaded as `.xlsx`, one sheet per table.
- **Dashboards on request.** For example, "analyze my data and build an executive dashboard". There are three output formats:
  - **Qlik Objects:** native charts placed on the sheet. You can edit them like any other object.
  - **Visual HTML:** a panel drawn by the extension in a separate object. It responds to selections and has a filter column.
  - **Complex HTML:** a static HTML page with the data extracted now, ready to download or open in a new tab.
- **Your app's official definitions.** The AI uses the master measures and dimensions you tag, along with your field comments and a context variable.
- **Governed, non-additive KPIs.** Measures such as monthly turnover or headcount are never summed across periods. They are extracted period by period with real selections.
- **Your selections stay untouched.** Complex HTML and series are calculated in a **separate Qlik session** (`identity`).
- **Readiness screen.** The **ⓘ Context** button shows exactly what the AI receives and whether the app is ready.
- **Bilingual.** One property switches the whole extension between English and Portuguese, including the AI's answers.
- **Appearance.** Options include company colors, a transparent background or custom color, and an "AI icon only" mode for a small corner launcher.

## How it works

```
 Qlik app ──(structure, tagged fields/master items, vContexto)──► AI provider
    ▲                                                              │
    │                                                              ▼
    └──── Qlik engine calculates ◄── validated JSON (queries / dashboard spec)
```

1. The extension reads the **app structure**: tables, fields, types, tagged master items, field comments and the `vContexto` variable. If you allow it, it also sends a few sample values per text field. **The full dataset is never sent.**
2. The AI returns **validated, structured JSON**. This is either queries to run or a dashboard spec with Qlik expressions.
3. Every expression is checked by the Qlik engine. If one fails, the AI is asked to fix it once.
4. Results are drawn with hypercubes, so dashboards follow selections. Clicking a chart makes a selection in the app.

## Requirements

- Qlik Sense **Qlik Cloud** or **Client-Managed** (Enterprise).
- An API key from one of these providers:
  - Google AI Studio: <https://aistudio.google.com/apikey>
  - Anthropic Console: <https://console.anthropic.com>
  - OpenRouter: <https://openrouter.ai/keys>
  - OpenAI Platform: <https://platform.openai.com/api-keys>
- **Qlik Cloud only:** an administrator must allow the provider's domain in the **Content Security Policy** (see below).

### Allow the AI in Qlik Cloud (once, by an admin)

1. Open **Administration → Content Security Policy → Add**.
2. In **Origin**, enter the domain of your provider:

   | Provider | Origin |
   |---|---|
   | Gemini | `generativelanguage.googleapis.com` |
   | Claude | `api.anthropic.com` |
   | OpenRouter | `openrouter.ai` |
   | OpenAI | `api.openai.com` |
3. Tick the **connect-src** directive and save.
4. Reload the app with **Ctrl+F5**.

If this step is missing, the chat shows "Could not reach <domain>…".

## Installation

1. Build `QlikDashBuilderAI.zip` (see [Building the zip](#building-the-zip)). The zip root must contain `QlikDashBuilderAI.qext` and `QlikDashBuilderAI.js`.
2. Upload it to Qlik:
   - **Qlik Cloud:** Administration → Extensions → Add.
   - **Client-Managed:** QMC → Extensions → Import.
3. Reload the app with **Ctrl+F5**. Browsers tend to cache the old version.
4. Open the browser console (F12). You should see `Qlik DashBuilder AI 0.24.0 carregado.`

## Getting started

1. Edit a sheet: **Custom objects → Qlik DashBuilder AI**. Drag it onto the sheet and make it large.
2. In **Properties**, set **Idioma / Language** to **English** and choose the **AI provider**.
3. Click **✨ AI** and paste your API key. The key is saved only in your browser (localStorage), separately for each provider. It is never stored in the app.
4. Ask. For example:
   - "What was the turnover for each month of 2026?"
   - "Analyze my data and create an executive dashboard"
   - "Replace the donut with a top 10 customers ranking"
   - "Add margin % by month with a 30% target"
   - "Why did the Northeast drop in March?" (the AI receives the values the panel is showing)
   - Click 📎 to attach a screenshot of a dashboard you like and say "make it similar".

### Assistant window

- The assistant opens in a **browser popup window**. You can move it beside the app or to another monitor.
- **▣** docks it as a floating box inside the page, which you can drag and resize. **⧉** switches back to the popup.
- Other header buttons: **🕘** History, **ⓘ** Context, **↶** Undo, **＋** New chat and **✕** Close. Hover any button to see what it does.
- To edit a question, hover it and click **✎**. With an empty message box, press **↑** to recall your last question.

## How to use (step by step)

A typical first session, from an empty sheet to a validated answer:

1. **Prepare the app (once).** Create the `vContexto` variable, tag the fields and master items the AI may use with `I.A` and write a comment on each field (see [curation](#preparing-your-app-for-the-ai-curation)). Reload the app.
2. **Add the object.** Edit a sheet that is yours and unpublished, drag **Qlik DashBuilder AI** onto it and choose the language and the AI provider in the properties.
3. **Check readiness.** Click **✨ AI**, paste your API key and open **ⓘ Context**. The badge should say ✅ *Ready to use*. Fix any item marked **!** before asking.
4. **Pick a mode** above the message box:
   - **💬 Chat** to ask questions and get numbers.
   - **📊 Qlik Objects**, **🎨 Visual HTML** or **🧩 Complex HTML** to build a dashboard.
5. **Ask in plain language.** Name the measure, the period and the slice, using the period format of your app (for example `09/2026`, not `9/2026`). While the engine calculates, the chat shows each step ("Calculating in Qlik…", "Opening a separate app session…").
6. **Read the answer critically.** Each number should say which period and filter it belongs to. If the answer carries a ⚠ warning about identical values or a filter that could not be applied, ask again with the exact field value.
7. **Refine.** Follow-up requests change only what you ask for ("replace the donut with a ranking"). **↶ Undo** brings back the previous version, and **Redo now** converts the panel to the current mode.
8. **Export or keep.** In chat, use **📋 Copy** or **⬇ Excel**. Complex HTML can be downloaded. Native objects and the Visual HTML panel stay on the sheet even if you delete the assistant.
9. **Come back later.** **＋** starts a new chat and moves the current one to **🕘 History**, where you can resume it with its full context.

## Test questions

Use these questions to confirm the installation works end to end. The examples come from an HR app (turnover, headcount, `Competência` period field). Replace the measure, field and periods with ones from your app.

### Main test: period comparison in Chat

Mode **💬 Chat**, with no selections on the sheet:

> **"Compare the turnover for 09/2026 vs the turnover for 09/2025"**

Expected result:

- The chat shows "Opening a separate app session to apply the filters…" and then "Calculating in Qlik…".
- The answer gives **one value per period**, each labeled with its period (for example 3.10% in 09/2026 and 2.45% in 09/2025), plus the difference in **percentage points** and in %. The components (hires, terminations, headcount) also differ between periods.
- **Your selections on the sheet are unchanged** when the answer arrives.
- Repeat with a selection on another field (for example one branch). The comparison should respect that branch and still show two different periods.

If both periods show the same value, see [Troubleshooting](#troubleshooting).

### Other checks

| Mode | Question | Expected |
|---|---|---|
| 💬 Chat | "What was the turnover for each month of 2026?" | One row per month of 2026 only, calculated period by period. **⬇ Excel** downloads the table. |
| 💬 Chat | "Compare the turnover for 9/2025 vs 9/2026" (wrong format) | The AI is told the value does not exist, retries with `09/2025` / `09/2026` or tells you the correct format. It never repeats one number for both periods. |
| 📊 Qlik Objects | "Analyze my data and create an executive dashboard" | KPIs, charts and a filter pane are created on the sheet. Delete all of them by hand and ask the same question again: the dashboard is recreated. |
| 🧩 Complex HTML | "Turnover report for 2026, month by month" | A page with a line or column chart, downloadable. The "ready" message says it used the separate session. |
| 🕘 History | Click **＋**, then **🕘** | The previous chat is listed. Open it and ask a follow-up: the AI still remembers the earlier answers. |

## Assistant modes

Four buttons sit above the message box:

| Mode | What you get |
|---|---|
| **💬 Chat** | Text-only answers with numbers calculated by Qlik. Ask for a chart or report and it also builds a Complex HTML page, without touching the sheet. |
| **📊 Qlik Objects** | Native Qlik objects on the sheet, outside the assistant: KPI, bar, line, pie, gauge, scatter, combo, table and pivot. |
| **🎨 Visual HTML** | A panel drawn by the extension in a **separate object** on the sheet. When you are done, you can delete the assistant and the panel stays. |
| **🧩 Complex HTML** | A static HTML page with data extracted at request time. Download it or open it in a new tab. |

How the sheet is managed:

- **Layout.** Blocks are laid out in aligned rows: KPIs on top, main charts in the middle, details at the bottom. If the panel doesn't fit, the sheet is extended.
- **Follow-up requests.** Only the blocks the AI changed are updated, so your manual tweaks on the other objects are kept.
- **Switching modes.** Changing mode applies from the next request. **Redo now** converts the current panel immediately, and **Undo** restores the previous version.
- **Sheet requirements.** The sheet must be yours and **unpublished**. Otherwise, the panel is shown inside the assistant.

### Chat

- Queries follow the **current selections**. Filters mentioned in the question ("only branch 10002", "09/2026 vs 09/2025") are applied as real selections in a separate app session, without changing your selections. The option **Enable new session (Complex HTML)** also controls this: when it is unchecked, the filter is selected in your own session and your selections are restored at the end.
- **🕘 History:** chats are saved in the browser (`localStorage`), up to 15 per app; the oldest are dropped automatically. The current chat joins the list when you start another one or close the assistant (or the browser). Open 🕘 in the header to resume, delete or clear chats. Attached images are not stored.
- Every answer has **📋 Copy** and, when there are tables, **⬇ Excel**. The `.xlsx` has one sheet per table, with real numbers, percentages and currency formats.
- **Requested periods are enforced.** If you ask about 2026, periods from other years are dropped even if the AI includes them.

## Preparing your app for the AI (curation)

You control what the AI sees by tagging things in the app. The tag and variable names can be changed in the properties.

| What | How to mark it | What the AI receives |
|---|---|---|
| General context | variable **`vContexto`** with a text about the app | the whole text, as guidance |
| Fields | tag **`I.A`** on the field | only tagged fields, with each field's comment |
| Master items | tag **`I.A`** on the master measure or dimension | only tagged items, with description and **expression**; the AI prefers them |

Load script example:

```qlik
SET vContexto = 'HR app. Headcount = active employees on the last day of the month. Turnover = terminations / average headcount.';

TAG FIELD Department WITH 'I.A';
COMMENT FIELD Department WITH 'Current department of the employee';
TAG FIELD HireDate WITH 'I.A';
COMMENT FIELD HireDate WITH 'Hire date; use it to count hires per month';
```

On master items, add the tag in the UI: **Master items → Edit → Tags**.

Notes:

- The tag match ignores case, dots and spaces: `I.A`, `i.a` and `IA` are equivalent.
- If no field is tagged, all fields are sent, so the AI is never empty-handed.
- Master items without the tag are never sent.
- The context is read on the first message of each conversation. After changing tags or `vContexto`, reload the app and click **＋ New chat**.

### Readiness check (ⓘ Context)

The **ⓘ** button shows what the assistant knows and whether it is ready:

- **Status:** ✅ *Ready to use*, 🟡 *Ready, with caveats* or 🔴 *Setup needed*, with a checklist of what is right (✓) and what is missing (!).
- **The `vContexto` variable:** its text, or a warning if it is missing or empty.
- **Tagged master measures and dimensions:** name, id, description and expression.
- **Tagged fields by table:** type and comment. Fields without a comment are flagged ⚠, because the comment is what explains the field to the AI.
- **The full text sent to the AI.**

**↻ Reload** reads the app again.

## Properties reference

**Qlik DashBuilder AI section**

| Property | Description |
|---|---|
| **Idioma / Language** | `Português (Brasil)` or `English`. Changes the properties, the UI, messages, number formats and the language of AI answers and generated panels. Field names and data values stay as they are in the app. |
| **Mode** | `AI Panel (assistant)` (default) or `Panel (view only)`. The assistant creates the view-only panel itself. |
| **AI provider** | Google Gemini, Anthropic Claude, OpenRouter or OpenAI. |
| **Gemini / Claude / OpenRouter / OpenAI model** | Recommended models per provider. |
| **Other model** | Any model id from the provider, e.g. `openai/gpt-6-sol` on OpenRouter. With OpenRouter, the model must support structured outputs. |
| **Analysis depth** | Fast (recommended), Balanced or Detailed. Applies to Claude only. |
| **Tag of the fields and master items** | Default `I.A`. |
| **Variable with the app context** | Default `vContexto`. |
| **Send sample field values to the AI** | Sends up to 5 sample values per text field. Turn it off for sensitive data. |
| **Enable new session (Complex HTML)** | Checked by default. See [below](#complex-html-and-separate-session). |
| **Panel (JSON)** | The generated dashboard spec. You can edit it by hand. |

**Appearance → Qlik DashBuilder AI**

| Property | Description |
|---|---|
| **Show in the object** | `Full panel` or `AI icon only`: just the ✨ AI button, centered. Assistant only. |
| **Object background** | `Automatic` (transparent when icon only), `Qlik theme default`, `Transparent` or `Custom color` (color picker). Applies to the whole object card. To hide the title too, turn off **Show titles** in Appearance → General. |
| **Company colors** | Hex list, e.g. `#0055a5, #ffcc00`. Replaces the palette chosen by the AI. |
| **Value labels** | Show or hide numbers on charts. |
| **Animations** | On or off. |
| **Export button (PDF)** | Shown on the view-only panel object only. |

## Complex HTML and separate session

**Complex HTML** produces a single static HTML file. It needs no Qlik and no external scripts, and its charts are SVG with tooltips. The footer shows the extraction time, the app and the filter.

When **Enable new session (Complex HTML)** is checked, the default:

- **The session.** The data is extracted in a **separate session of the app**, opened with its own `identity`. This is the same as opening `…/sheet/<sheet>/state/analysis/identity/<x>`.
- **Selections.** That session uses the **default state** and starts with no selections. The filters from your request (year, business unit…) are applied there as **real selections**.
- **Governed measures.** Because the selections are real, measures such as `$(=Max(Period))` calculate correctly.
- **Your screen.** It doesn't flicker and your selections are untouched. The session closes when the extraction ends.

When it is unchecked, or if Qlik doesn't allow a second session:

- **Complex HTML** uses an alternate state named `DashBuilderAI_Snapshot`, created in the app the first time.
- **Period series** are selected in your own session. Your selections are saved in a temporary bookmark and restored at the end.
- If even that is not possible, each period is calculated with set analysis, and the chat tells you.

The "Complex HTML ready" message always says which path was used.

## Period-consolidated measures

Some KPIs only make sense for one period at a time, such as monthly **% turnover**, headcount, balances and pre-consolidated indexes. When you ask for their evolution, for example "turnover for 2026, month by month", the assistant extracts them **one period at a time**:

1. Open the separate session, with no selections.
2. Apply the panel's fixed filters, for example Year = 2026.
3. Select `01/2026` and store the value, select `02/2026` and store the value, and so on.
4. Close the session and draw the stored values as a line, column chart or table.

The chat shows progress, for example "Filtering Period = 03/2026 (3 of 12)…".

- **Master measures** work: the extension reads their expression and number format.
- **Period formats:** `01/2026`, `2026-01`, `jan/2026` and `Jan` are recognized.
- **Limit:** up to 60 periods, in chronological order.
- **Cache:** values are cached for the session, so downloading again doesn't re-extract.

## Filters and segmented views

Ask for "a view of branch 10002" and the AI selects the value in the app. Clear the selection and everything comes back.

The fields involved appear in a **filter column on the left of the panel**:

- **Visual HTML:** one list per field, with search.
  - Type `2026` and the list shows only matching values. The search ignores accents and case.
  - **Enter** selects the matches and **Esc** clears the search.
  - On fields with more than 500 values, the search also queries Qlik.
- **Qlik Objects:** a native filter pane.

Before a filter is applied, the extension checks that the field and its values exist. If the AI gets the case wrong or drops a leading zero, it is asked to fix it.

**Fixed filter:** say "pin the panel to branch 10002" to bake the filter into every measure as set analysis. The panel then ignores selections. To remove it, ask "remove the fixed filter".

## Costs and privacy

- **Gemini free tier (AI Studio):**
  - **Cost and limits:** no cost, but rate-limited. Hitting the limit returns error 429.
  - **Privacy:** under Google's terms, data sent on the free tier may be used to improve Google products. For company data, enable billing on the Google Cloud project behind the key, or turn off sample values.
- **Paid Gemini, Claude and OpenAI:** billed per token. A dashboard request typically uses a few thousand input tokens (the app structure) and 2–6k output tokens. Flash-Lite, Sonnet and Haiku are cheaper.
- **OpenRouter:**
  - **Credits:** prepaid. Running out returns error 402.
  - **Free models:** models ending in `:free` cost nothing but are heavily limited and may retain data.
  - **Data retention:** at <https://openrouter.ai/settings/privacy> you can block providers that train on your data.
- **The API key** stays in the user's browser (`localStorage`). To offer the AI to many users without personal keys, put a small backend proxy in front of the provider that holds the key.

## Troubleshooting

| Symptom | What to check |
|---|---|
| "Could not reach <domain>" | The provider's domain is missing from the Content Security Policy (`connect-src`). |
| Error 401 / 403 | Invalid key, or a key without access to the selected model. Use **change key** in the chat. |
| Error 429 | The provider's rate limit was reached (common on the Gemini free tier). Wait and retry. |
| Error 402 | OpenRouter is out of credits. |
| A red box inside the object | Open the console (F12) and filter by `DashBuilder AI`. |
| Old version still showing | Re-upload the zip and reload with **Ctrl+F5**. |
| Objects are not created on the sheet | The sheet must be yours and unpublished. |
| Complex HTML follows your selections | The separate session could not open. The "ready" message tells you which path was used. |
| A chat comparison shows the same value for every period | Make sure you are on version 0.24.0 or later (console, F12). Use the exact period value of the field (`09/2025`, not `9/2025`). If the answer warns that the filter was calculated with set analysis, the separate session and the temporary bookmark were both unavailable. |

## Project structure

```
QlikDashBuilderAI/
├── QlikDashBuilderAI.qext    extension manifest (name, version, icon)
├── QlikDashBuilderAI.js      entry point: paint, styles, object background, export
├── properties.js             property panel (bilingual) and defaults
└── lib/
    ├── assistant.js          chat UI, modes, prompts, Context screen, copy/Excel
    ├── history.js            chat history in the browser (up to 15 per app)
    ├── ai.js                 Gemini / Claude / OpenRouter / OpenAI clients (structured output)
    ├── appinfo.js            reads app structure, tags, master items, vContexto
    ├── query.js              runs the AI's queries on the Qlik engine
    ├── extract.js            period-by-period extraction (session, bookmark, set analysis)
    ├── session.js            separate app session via qlik.openApp(..., { identity })
    ├── snapshot.js           Complex HTML: off-screen render and standalone page
    ├── dashboard.js          panel spec → hypercubes → charts
    ├── native.js             creates and updates native Qlik objects on the sheet
    ├── sidebar.js            filter column with search
    ├── charts.js             SVG charts (line, area, bars, donut, gauge, heatmap…)
    ├── filters.js            fixed filters as set analysis
    ├── xlsx.js               dependency-free .xlsx writer
    ├── i18n.js               T(pt, en) language helper
    └── …                     tables, template, sanitize, export, util, data, actions, cssscope
```

All code is plain AMD JavaScript (RequireJS `define`), loaded by Qlik. There is no build step and there are no dependencies.

## Building the zip

The zip must contain the files at its **root**, not inside a folder.

Windows (built-in `tar`):

```powershell
tar.exe -a -c -f QlikDashBuilderAI.zip QlikDashBuilderAI.qext QlikDashBuilderAI.js properties.js README.md lib
```

macOS / Linux:

```bash
zip -r QlikDashBuilderAI.zip QlikDashBuilderAI.qext QlikDashBuilderAI.js properties.js README.md lib
```

## Legacy modes

Older objects may use the manual modes from the extension's first versions:

- **Chart (gallery):** 12 SVG chart types.
- **HTML/CSS template:** `{{#rows}}`, `{{d0}}`, `{{m0}}` and `data-action` buttons.
- **Table**.
- **Pivot**.

These modes are no longer listed for new objects. They only appear on objects that already use one, marked "(legacy mode)".

## License

[MIT](LICENSE) © 2026 Danilo Stochi
