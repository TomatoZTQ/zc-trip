import axios from "axios";

const DEFAULT_BASE_URL = "https://open.bigmodel.cn/api/paas/v4";
const DEFAULT_MODEL = "glm-4-flash";
const DEFAULT_CHAT_PATH = "/chat/completions";

function createAiClient(baseURL) {
  return axios.create({
    baseURL,
    timeout: 30000
  });
}

function pickTextFromContent(content) {
  if (typeof content === "string") return content;

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") return item;
        if (typeof item?.text === "string") return item.text;
        if (typeof item?.content === "string") return item.content;
        return "";
      })
      .join("");
  }

  return "";
}

function pickChunkText(payload) {
  const deltaContent = payload?.choices?.[0]?.delta?.content;
  const messageContent = payload?.choices?.[0]?.message?.content;
  return pickTextFromContent(deltaContent) || pickTextFromContent(messageContent);
}

function resolveChatUrl(baseURL, chatPath) {
  const safeBase = String(baseURL || "").replace(/\/+$/, "");
  const safePath = String(chatPath || "").startsWith("/") ? chatPath : `/${chatPath}`;
  return `${safeBase}${safePath}`;
}

export function getAiRuntimeConfig() {
  const baseURL = import.meta.env.VITE_AI_BASE_URL || DEFAULT_BASE_URL;

  return {
    baseURL,
    model: import.meta.env.VITE_AI_MODEL || DEFAULT_MODEL,
    apiKey: import.meta.env.VITE_AI_API_KEY || "",
    chatPath: import.meta.env.VITE_AI_CHAT_PATH || DEFAULT_CHAT_PATH
  };
}

export async function sendAiMessage(messages, extra = {}) {
  const { apiKey, model, baseURL, chatPath } = getAiRuntimeConfig();

  if (!apiKey) {
    throw new Error("Missing VITE_AI_API_KEY. Please set it in .env.local.");
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error("messages must be a non-empty array.");
  }

  const payload = {
    model,
    messages,
    temperature: 0.7,
    ...extra
  };

  const client = createAiClient(baseURL);
  const res = await client.post(chatPath, payload, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    }
  });

  return res?.data;
}

export async function streamAiMessage(messages, options = {}) {
  const { onChunk, onDone, extra = {}, signal } = options;
  const { apiKey, model, baseURL, chatPath } = getAiRuntimeConfig();

  if (!apiKey) {
    throw new Error("Missing VITE_AI_API_KEY. Please set it in .env.local.");
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error("messages must be a non-empty array.");
  }

  const payload = {
    model,
    messages,
    temperature: 0.7,
    stream: true,
    ...extra
  };

  const res = await fetch(resolveChatUrl(baseURL, chatPath), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload),
    signal
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(errorText || `AI request failed with status ${res.status}.`);
  }

  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const data = await res.json();
    const text = pickChunkText(data);
    if (text) onChunk?.(text);
    onDone?.();
    return data;
  }

  if (!res.body) {
    throw new Error("Current browser does not support streaming response.");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    while (true) {
      const match = buffer.match(/\r?\n\r?\n/);
      if (!match || match.index == null) break;

      const splitIndex = match.index;
      const rawEvent = buffer.slice(0, splitIndex).trim();
      buffer = buffer.slice(splitIndex + match[0].length);

      if (!rawEvent) continue;

      const dataLines = rawEvent
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim());

      if (dataLines.length === 0) continue;

      const rawData = dataLines.join("\n");
      if (rawData === "[DONE]") {
        onDone?.();
        return;
      }

      try {
        const payloadItem = JSON.parse(rawData);
        const chunk = pickChunkText(payloadItem);
        if (chunk) onChunk?.(chunk);
      } catch {
        // Ignore malformed SSE frame and continue streaming.
      }
    }
  }

  onDone?.();
}
