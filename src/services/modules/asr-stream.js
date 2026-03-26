const DEFAULT_CHUNK_MS = 280;
const DEFAULT_OPEN_TIMEOUT_MS = 3500;

export function getAsrRuntimeConfig() {
  return {
    transport: String(import.meta.env.VITE_ASR_TRANSPORT || "websocket").toLowerCase(),
    wsUrl: String(import.meta.env.VITE_ASR_WS_URL || "").trim(),
    authToken: String(import.meta.env.VITE_ASR_AUTH_TOKEN || "").trim(),
    language: String(import.meta.env.VITE_ASR_LANGUAGE || "zh-CN").trim(),
    sampleRate: Number(import.meta.env.VITE_ASR_SAMPLE_RATE || 16000),
    chunkMs: Number(import.meta.env.VITE_ASR_CHUNK_MS || DEFAULT_CHUNK_MS),
    openTimeoutMs: Number(import.meta.env.VITE_ASR_OPEN_TIMEOUT_MS || DEFAULT_OPEN_TIMEOUT_MS)
  };
}

function parseServerMessage(raw) {
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return { type: "partial", text };
  }
}

export function createWsAsrClient(options = {}) {
  const {
    wsUrl,
    authToken = "",
    language = "zh-CN",
    sampleRate = 16000,
    openTimeoutMs = DEFAULT_OPEN_TIMEOUT_MS,
    onPartial,
    onFinal,
    onError,
    onOpen,
    onClose
  } = options;

  if (!wsUrl) {
    throw new Error("Missing VITE_ASR_WS_URL for streaming ASR.");
  }

  let ws = null;
  let isOpened = false;

  function safeError(err) {
    onError?.(err instanceof Error ? err : new Error(String(err || "ASR connection error")));
  }

  function ensureOpened() {
    if (!ws || !isOpened || ws.readyState !== WebSocket.OPEN) {
      throw new Error("ASR websocket is not open.");
    }
  }

  async function start() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";

    await new Promise((resolve, reject) => {
      let settled = false;
      const timer = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        try {
          ws?.close();
        } catch {
          // ignore
        }
        reject(new Error("ASR websocket open timeout."));
      }, openTimeoutMs);

      ws.onopen = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        isOpened = true;

        try {
          ws?.send(
            JSON.stringify({
              type: "start",
              language,
              sampleRate,
              ...(authToken ? { token: authToken } : {})
            })
          );
        } catch (error) {
          reject(error);
          return;
        }

        onOpen?.();
        resolve();
      };

      ws.onerror = () => {
        if (!settled) {
          settled = true;
          window.clearTimeout(timer);
          reject(new Error("ASR websocket failed to open."));
          return;
        }
        safeError(new Error("ASR websocket runtime error."));
      };

      ws.onclose = () => {
        isOpened = false;
        onClose?.();
      };

      ws.onmessage = (event) => {
        const payload = parseServerMessage(String(event?.data || ""));
        if (!payload) return;

        if (payload.type === "error") {
          safeError(new Error(payload.message || "ASR server error."));
          return;
        }

        if (payload.type === "final") {
          onFinal?.(String(payload.text || payload.result || ""));
          return;
        }

        onPartial?.(String(payload.text || payload.result || ""));
      };
    });
  }

  function pushChunk(chunk) {
    if (!chunk) return;
    ensureOpened();
    ws.send(chunk);
  }

  function stop() {
    if (!ws) return;

    try {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "stop" }));
      }
    } catch {
      // ignore
    }

    try {
      ws.close();
    } catch {
      // ignore
    }
  }

  return {
    start,
    pushChunk,
    stop
  };
}
