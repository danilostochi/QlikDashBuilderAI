define(["./i18n"], function (i18n) {
  "use strict";

  var T = i18n.T;

  var PROVIDERS = {
    anthropic: {
      label: "Claude (Anthropic)",
      host: "api.anthropic.com",
      storage: "minhadash.anthropic.key", // prefixo antigo mantido para não perder as chaves já salvas
      keyHint: "sk-ant-...",
      keySite: "console.anthropic.com",
      send: sendAnthropic
    },
    google: {
      label: "Gemini (Google AI Studio)",
      host: "generativelanguage.googleapis.com",
      storage: "minhadash.google.key",
      keyHint: "AIza...",
      keySite: "aistudio.google.com/apikey",
      send: sendGemini
    },
    openrouter: {
      label: "OpenRouter",
      host: "openrouter.ai",
      storage: "minhadash.openrouter.key",
      keyHint: "sk-or-v1-...",
      keySite: "openrouter.ai/keys",
      send: sendOpenRouter
    },
    openai: {
      label: "OpenAI",
      host: "api.openai.com",
      storage: "minhadash.openai.key",
      keyHint: "sk-proj-...",
      keySite: "platform.openai.com/api-keys",
      send: sendOpenAI
    }
  };

  function provider(id) { return PROVIDERS[id] || PROVIDERS.google; }

  // A chave fica só no navegador de quem a salvou; nunca vai para as propriedades do app.
  function getKey(id) {
    try { return localStorage.getItem(provider(id).storage) || ""; } catch (e) { return ""; }
  }
  function setKey(id, key) {
    try {
      if (key) localStorage.setItem(provider(id).storage, key);
      else localStorage.removeItem(provider(id).storage);
    } catch (e) { /* armazenamento bloqueado */ }
  }

  function httpError(p, status, body) {
    var detail = body && body.error && body.error.message ? " (" + body.error.message + ")" : "";
    var v = { p: p.label, d: detail, s: status };
    if (status === 401 || (status === 400 && /api key/i.test(detail))) return T("Chave da API inválida. Clique em \"trocar chave\" e cole uma chave válida do {p}.{d}", "Invalid API key. Click \"change key\" and paste a valid {p} key.{d}", v);
    if (status === 402) return T("Sem créditos na conta do {p}. Adicione créditos ou escolha um modelo gratuito (terminado em :free).{d}", "No credits left on the {p} account. Add credits or pick a free model (ending in :free).{d}", v);
    if (status === 403) return T("A chave não tem permissão para este modelo.{d}", "The key is not allowed to use this model.{d}", v);
    if (/no endpoints|require_parameters/i.test(detail)) return T("Nenhum provedor deste modelo aceita resposta em JSON estruturado. Escolha outro modelo.{d}", "No provider for this model supports structured JSON output. Pick another model.{d}", v);
    if (status === 404) return T("Modelo não encontrado. Confira o nome do modelo nas propriedades.{d}", "Model not found. Check the model name in the properties.{d}", v);
    if (status === 429) return T("Limite de uso da API atingido (no plano gratuito do Gemini e nos modelos :free os limites por minuto são baixos). Tente de novo em instantes.{d}", "API rate limit reached (per-minute limits are low on the Gemini free tier and on :free models). Try again in a moment.{d}", v);
    if (status >= 500) return T("O serviço da IA está sobrecarregado. Tente de novo em instantes.{d}", "The AI service is overloaded. Try again in a moment.{d}", v);
    return T("Erro {s} na API da IA{d}", "AI API error {s}{d}", v);
  }

  var REQUEST_TIMEOUT = 180000, IDLE_TIMEOUT = 120000;

  function statusError(p, status, json) {
    var e = new Error(httpError(p, status, json));
    e.status = status;
    e.detail = json && json.error && json.error.message ? json.error.message : "";
    return e;
  }

  function networkError(p, err, timedOut) {
    console.error("DashBuilder AI: falha de rede ao chamar " + p.host, err);
    if (timedOut) return new Error(T("A IA ficou tempo demais sem responder. Tente um pedido menor, a profundidade \"Rápida\" ou um modelo mais rápido.", "The AI took too long to respond. Try a smaller request, the \"Fast\" depth or a faster model."));
    return new Error(T("Não foi possível falar com {h}. No Qlik Cloud, um administrador precisa liberar esse domínio em Administração → Content Security Policy (diretiva connect-src).", "Could not reach {h}. In Qlik Cloud, an administrator must allow this domain in Administration → Content Security Policy (connect-src directive).", { h: p.host }));
  }

  function post(p, url, headers, body) {
    var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timedOut = false;
    var timer = setTimeout(function () { timedOut = true; if (controller) controller.abort(); }, REQUEST_TIMEOUT);
    return fetch(url, { method: "POST", headers: headers, body: JSON.stringify(body), signal: controller ? controller.signal : undefined }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (json) {
        clearTimeout(timer);
        if (!res.ok) throw statusError(p, res.status, json);
        return json;
      });
    }, function (err) {
      clearTimeout(timer);
      throw networkError(p, err, timedOut);
    });
  }

  // POST com resposta em Server-Sent Events. Chama onEvent(json) para cada "data:".
  // O tempo limite é de inatividade: enquanto chegam dados, a espera continua.
  function postSse(p, url, headers, body, onEvent) {
    var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timedOut = false, timer = null;
    function arm() {
      clearTimeout(timer);
      timer = setTimeout(function () { timedOut = true; if (controller) controller.abort(); }, IDLE_TIMEOUT);
    }
    arm();
    return fetch(url, { method: "POST", headers: headers, body: JSON.stringify(body), signal: controller ? controller.signal : undefined }).then(function (res) {
      if (!res.ok) {
        return res.json().catch(function () { return {}; }).then(function (json) { clearTimeout(timer); throw statusError(p, res.status, json); });
      }
      var reader = res.body.getReader(), decoder = new TextDecoder(), buffer = "";
      function flush(final) {
        var lines = buffer.split(/\r?\n/);
        buffer = final ? "" : lines.pop();
        lines.forEach(function (line) {
          if (line.indexOf("data:") !== 0) return;
          var payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") return;
          try { onEvent(JSON.parse(payload)); } catch (e) { console.warn("DashBuilder AI: trecho SSE ignorado", e); }
        });
      }
      function pump() {
        return reader.read().then(function (r) {
          arm();
          if (r.done) { buffer += decoder.decode(); flush(true); clearTimeout(timer); return; }
          buffer += decoder.decode(r.value, { stream: true });
          flush(false);
          return pump();
        });
      }
      return pump();
    }).catch(function (err) {
      clearTimeout(timer);
      if (err && err.status) throw err;
      throw networkError(p, err, timedOut);
    });
  }

  function parseJson(text) {
    try { return JSON.parse(text); } catch (e) { throw new Error(T("A IA devolveu uma resposta em formato inesperado. Tente de novo.", "The AI returned a response in an unexpected format. Try again.")); }
  }

  // ---------- Anthropic (Messages API) ----------

  function toAnthropic(history) {
    return history.map(function (m) {
      if (m.role === "assistant") return { role: "assistant", content: m.raw };
      return {
        role: "user",
        content: m.parts.map(function (part) {
          return part.type === "image"
            ? { type: "image", source: { type: "base64", media_type: part.mime, data: part.data } }
            : { type: "text", text: part.text };
        })
      };
    });
  }

  function sendAnthropic(o) {
    var p = PROVIDERS.anthropic;
    return post(p, "https://api.anthropic.com/v1/messages", {
      "content-type": "application/json",
      "x-api-key": o.key,
      "anthropic-version": "2026-10-21",
      "anthropic-beta": "server-side-fallback-2026-07-01",
      "anthropic-dangerous-direct-browser-access": "true"
    }, {
      model: o.model,
      max_tokens: 16000,
      fallbacks: "default",
      cache_control: { type: "ephemeral" },
      system: o.system,
      messages: toAnthropic(o.history),
      output_config: { effort: o.effort, format: { type: "json_schema", schema: o.schema } }
    }).then(function (body) {
      if (body.stop_reason === "refusal") throw new Error(T("A IA recusou este pedido. Reformule e tente de novo.", "The AI declined this request. Rephrase and try again."));
      if (body.stop_reason === "max_tokens") throw new Error(T("A resposta da IA ficou grande demais. Peça um painel com menos blocos.", "The AI response was too long. Ask for a dashboard with fewer tiles."));
      var text = (body.content || []).filter(function (b) { return b.type === "text"; }).map(function (b) { return b.text; }).join("");
      return { raw: body.content, json: parseJson(text) };
    });
  }

  // ---------- Google Gemini (generateContent) ----------

  function toGemini(history) {
    return history.map(function (m) {
      if (m.role === "assistant") return m.raw;
      return {
        role: "user",
        parts: m.parts.map(function (part) {
          return part.type === "image" ? { inline_data: { mime_type: part.mime, data: part.data } } : { text: part.text };
        })
      };
    });
  }

  var noThinkingLevel = {}; // modelos que recusaram thinkingLevel nesta sessão
  var GEMINI_BLOCKED =["SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII", "IMAGE_SAFETY"];

  // Junta os trechos do streaming numa resposta só.
  function geminiAccumulator(onProgress) {
    var acc = { text: "", thought: "", signature: null, finish: null, block: null };
    acc.add = function (chunk) {
      if (chunk.promptFeedback && chunk.promptFeedback.blockReason) acc.block = chunk.promptFeedback.blockReason;
      var cand = chunk.candidates && chunk.candidates[0];
      if (!cand) return;
      if (cand.finishReason) acc.finish = cand.finishReason;
      ((cand.content && cand.content.parts) || []).forEach(function (part) {
        if (part.thought) acc.thought += part.text || "";
        else if (typeof part.text === "string") acc.text += part.text;
        if (part.thoughtSignature) acc.signature = part.thoughtSignature;
      });
      if (onProgress) onProgress(acc.text.length);
    };
    return acc;
  }

  function sendGemini(o) {
    var p = PROVIDERS.google;
    var url = "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(o.model) + ":streamGenerateContent?alt=sse";
    var headers = { "content-type": "application/json", "x-goog-api-key": o.key };
    var body = {
      systemInstruction: { parts: [{ text: o.system }] },
      contents: toGemini(o.history),
      generationConfig: { responseMimeType: "application/json", responseJsonSchema: o.schema, maxOutputTokens: 32768 }
    };
    if (o.effort && !noThinkingLevel[o.model]) body.generationConfig.thinkingConfig = { thinkingLevel: o.effort };

    function run() {
      var acc = geminiAccumulator(o.onProgress);
      return postSse(p, url, headers, body, acc.add).then(function () { return acc; });
    }

    // Modelos que não aceitam o nível de raciocínio pedido: tenta de novo sem ele.
    return run().catch(function (err) {
      if (err.status === 400 && body.generationConfig.thinkingConfig && /think/i.test(err.detail)) {
        console.warn("DashBuilder AI: o modelo recusou thinkingLevel=" + o.effort + "; repetindo sem ele.", err.detail);
        noThinkingLevel[o.model] = true;
        delete body.generationConfig.thinkingConfig;
        return run();
      }
      throw err;
    }).then(function (acc) {
      if (acc.block) throw new Error(T("O Gemini bloqueou este pedido ({r}). Reformule e tente de novo.", "Gemini blocked this request ({r}). Rephrase and try again.", { r: acc.block }));
      if (acc.finish === "MAX_TOKENS") throw new Error(T("A resposta da IA ficou grande demais. Peça um painel com menos blocos.", "The AI response was too long. Ask for a dashboard with fewer tiles."));
      if (GEMINI_BLOCKED.indexOf(acc.finish) >= 0) throw new Error(T("O Gemini interrompeu a resposta ({r}). Reformule e tente de novo.", "Gemini stopped the response ({r}). Rephrase and try again.", { r: acc.finish }));
      if (!acc.text) throw new Error(T("O Gemini não devolveu resposta. Tente de novo.", "Gemini returned no response. Try again."));
      var answer = { text: acc.text };
      if (acc.signature) answer.thoughtSignature = acc.signature;
      var parts = acc.thought ? [{ text: acc.thought, thought: true }, answer] : [answer];
      return { raw: { role: "model", parts: parts }, json: parseJson(acc.text) };
    });
  }

  // ---------- OpenRouter (chat/completions, formato da OpenAI) ----------

  function toOpenAI(history) {
    return history.map(function (m) {
      if (m.role === "assistant") return m.raw;
      return {
        role: "user",
        content: m.parts.map(function (part) {
          return part.type === "image"
            ? { type: "image_url", image_url: { url: "data:" + part.mime + ";base64," + part.data } }
            : { type: "text", text: part.text };
        })
      };
    });
  }

  function sendOpenRouter(o) {
    var p = PROVIDERS.openrouter;
    // Os modelos da Anthropic só reaproveitam o prompt em cache quando ele é marcado.
    var system = /^anthropic\//.test(o.model)
      ? { role: "system", content: [{ type: "text", text: o.system, cache_control: { type: "ephemeral" } }] }
      : { role: "system", content: o.system };
    var body = {
      model: o.model,
      stream: true,
      max_tokens: 32768,
      messages: [system].concat(toOpenAI(o.history)),
      response_format: { type: "json_schema", json_schema: { name: "painel", strict: true, schema: o.schema } },
      // Só usa provedores do modelo que aceitam o JSON estruturado.
      provider: { require_parameters: true }
    };
    if (o.effort) body.reasoning = { effort: o.effort, exclude: true };

    return chatCompletions(p, "https://openrouter.ai/api/v1/chat/completions", {
      "content-type": "application/json",
      "authorization": "Bearer " + o.key,
      "x-title": "Qlik DashBuilder AI"
    }, body, o.onProgress);
  }

  // Streaming do chat/completions (OpenRouter e OpenAI usam o mesmo formato de resposta).
  function chatCompletions(p, url, headers, body, onProgress) {
    var acc = { text: "", finish: null, error: null, refusal: "" };
    return postSse(p, url, headers, body, function (chunk) {
      if (chunk.error) acc.error = chunk.error.message || String(chunk.error.code || T("erro", "error"));
      var choice = chunk.choices && chunk.choices[0];
      if (!choice) return;
      if (choice.finish_reason) acc.finish = choice.finish_reason;
      var delta = choice.delta || {};
      if (typeof delta.content === "string") acc.text += delta.content;
      if (delta.refusal) acc.refusal += delta.refusal;
      if (onProgress) onProgress(acc.text.length);
    }).then(function () {
      if (acc.error) throw new Error(T("O {p} interrompeu a resposta: {e}", "{p} stopped the response: {e}", { p: p.label, e: acc.error }));
      if (acc.refusal || acc.finish === "content_filter") throw new Error(T("A IA recusou este pedido. Reformule e tente de novo.", "The AI declined this request. Rephrase and try again."));
      if (acc.finish === "length") throw new Error(T("A resposta da IA ficou grande demais. Peça um painel com menos blocos.", "The AI response was too long. Ask for a dashboard with fewer tiles."));
      if (!acc.text) throw new Error(T("O {p} não devolveu resposta. Tente de novo.", "{p} returned no response. Try again.", { p: p.label }));
      return { raw: { role: "assistant", content: acc.text }, json: parseJson(acc.text) };
    });
  }

  // ---------- OpenAI (chat/completions) ----------

  var noReasoningEffort = {}; // modelos que recusaram reasoning_effort nesta sessão

  function sendOpenAI(o) {
    var p = PROVIDERS.openai;
    var headers = { "content-type": "application/json", "authorization": "Bearer " + o.key };
    var body = {
      model: o.model,
      stream: true,
      max_completion_tokens: 32768,
      messages: [{ role: "developer", content: o.system }].concat(toOpenAI(o.history)),
      response_format: { type: "json_schema", json_schema: { name: "painel", strict: true, schema: o.schema } }
    };
    if (o.effort && !noReasoningEffort[o.model]) body.reasoning_effort = o.effort;

    function run() { return chatCompletions(p, "https://api.openai.com/v1/chat/completions", headers, body, o.onProgress); }

    // Modelos sem raciocínio não aceitam reasoning_effort: tenta de novo sem ele.
    return run().catch(function (err) {
      if (err.status === 400 && body.reasoning_effort && /reasoning/i.test(err.detail)) {
        console.warn("DashBuilder AI: o modelo recusou reasoning_effort=" + o.effort + "; repetindo sem ele.", err.detail);
        noReasoningEffort[o.model] = true;
        delete body.reasoning_effort;
        return run();
      }
      throw err;
    });
  }

  // o: { provider, key, model, effort, system, history, schema, onProgress(chars) }
  // history usa um formato neutro: { role: "user", parts: [{type:"text"|"image", ...}] } | { role: "assistant", raw }
  function send(o) {
    return provider(o.provider).send(o);
  }

  return { PROVIDERS: PROVIDERS, provider: provider, getKey: getKey, setKey: setKey, send: send };
});
