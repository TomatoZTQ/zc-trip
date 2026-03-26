import { computed, ref } from "vue";
import { createWsAsrClient, getAsrRuntimeConfig } from "@/services/modules/asr-stream";
import {
  mergeVoiceTextWithOverlap,
  normalizeVoiceText
} from "@/services/modules/voice-text-normalizer";

const SPEECH_CONFIG = {
  vadCheckIntervalMs: 120,
  vadWarmupMs: 800,
  vadMinRmsThreshold: 0.012,
  vadMaxRmsThreshold: 0.028,
  vadSilenceMs: 1400,
  maxSegmentMs: 10000,
  overlapChars: 14,
  contextTailChars: 36,
  browserRestartDelayMs: 180,
  actionLockMs: 260,
  browserStopFallbackFinalizeMs: 600
};

function computeRmsFromAnalyser(analyser) {
  if (!analyser) return 0;
  const length = analyser.fftSize;
  const data = new Uint8Array(length);
  analyser.getByteTimeDomainData(data);

  let sum = 0;
  for (let i = 0; i < length; i++) {
    const normalized = (data[i] - 128) / 128;
    sum += normalized * normalized;
  }

  return Math.sqrt(sum / length);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export default function useVoiceInput(options = {}) {
  const { onCommit } = options;

  const asrConfig = getAsrRuntimeConfig();
  const speechSupported = ref(false);
  const isListening = ref(false);
  const speechState = ref("idle");
  const speechErrorText = ref("");
  const speechInterimText = ref("");
  const speechStopReason = ref("");
  const speechEngine = ref("none");

  const recognitionRef = ref(null);
  const asrClientRef = ref(null);
  const mediaRecorderRef = ref(null);
  const streamRef = ref(null);
  const audioContextRef = ref(null);
  const sourceNodeRef = ref(null);
  const analyserRef = ref(null);
  const vadTimerRef = ref(null);
  const maxTimerRef = ref(null);

  const actionLockUntilRef = ref(0);
  const keepBrowserRunningRef = ref(false);
  const listenStartedAtRef = ref(0);
  const lastVoiceAtRef = ref(0);
  const adaptiveVadThresholdRef = ref(SPEECH_CONFIG.vadMinRmsThreshold);
  const vadWarmupSumRef = ref(0);
  const vadWarmupCountRef = ref(0);

  const recognizedFinalRef = ref("");
  const contextTailRef = ref("");

  const speechStatusText = computed(() => {
    if (speechErrorText.value) return speechErrorText.value;

    if (speechState.value === "requesting") return "正在请求麦克风权限...";
    if (speechState.value === "recovering") return "语音引擎恢复中...";
    if (speechState.value === "stopping") return "正在停止录音...";

    if (speechState.value === "listening" && speechInterimText.value) {
      return `识别中：${speechInterimText.value}`;
    }

    if (speechState.value === "listening") return "正在听你说...";

    if (speechStopReason.value === "vad_silence") return "已自动停止：检测到持续静音。";
    if (speechStopReason.value === "max_duration") return "已自动停止：达到最长语音时长。";
    if (speechStopReason.value === "fallback_browser") {
      return "已切换到浏览器语音识别模式。";
    }

    return "";
  });

  const voiceButtonText = computed(() => {
    if (speechState.value === "requesting") return "启动中...";
    if (speechState.value === "stopping") return "停止中...";
    if (speechState.value === "recovering") return "恢复中...";
    return isListening.value ? "停止语音" : "语音输入";
  });

  function setActionLock(durationMs = SPEECH_CONFIG.actionLockMs) {
    actionLockUntilRef.value = Date.now() + durationMs;
  }

  function isActionLocked() {
    return Date.now() < actionLockUntilRef.value;
  }

  function resetSegmentBuffers() {
    speechInterimText.value = "";
    recognizedFinalRef.value = "";
    contextTailRef.value = "";
  }

  function resetVadRuntime() {
    adaptiveVadThresholdRef.value = SPEECH_CONFIG.vadMinRmsThreshold;
    vadWarmupSumRef.value = 0;
    vadWarmupCountRef.value = 0;
    listenStartedAtRef.value = 0;
    lastVoiceAtRef.value = 0;
  }

  function commitRecognizedText() {
    const merged = mergeVoiceTextWithOverlap(
      recognizedFinalRef.value,
      speechInterimText.value,
      SPEECH_CONFIG.overlapChars
    );

    const finalText = normalizeVoiceText(merged);
    resetSegmentBuffers();

    if (!finalText) {
      if (speechStopReason.value === "vad_silence") {
        speechErrorText.value = "没有识别到有效语音，请靠近麦克风后重试。";
      }
      return;
    }

    onCommit?.(finalText);
  }

  function cleanupTimers() {
    if (vadTimerRef.value) {
      window.clearInterval(vadTimerRef.value);
      vadTimerRef.value = null;
    }

    if (maxTimerRef.value) {
      window.clearTimeout(maxTimerRef.value);
      maxTimerRef.value = null;
    }
  }

  function cleanupMediaPipeline() {
    cleanupTimers();

    if (mediaRecorderRef.value) {
      mediaRecorderRef.value.ondataavailable = null;
      mediaRecorderRef.value.onerror = null;
      mediaRecorderRef.value.onstop = null;
      mediaRecorderRef.value = null;
    }

    if (sourceNodeRef.value) {
      try {
        sourceNodeRef.value.disconnect();
      } catch {
        // ignore
      }
      sourceNodeRef.value = null;
    }

    analyserRef.value = null;

    if (audioContextRef.value) {
      audioContextRef.value.close().catch(() => {});
      audioContextRef.value = null;
    }

    if (streamRef.value) {
      streamRef.value.getTracks().forEach((track) => track.stop());
      streamRef.value = null;
    }
  }

  function cleanupAsrClient() {
    if (!asrClientRef.value) return;

    try {
      asrClientRef.value.stop();
    } catch {
      // ignore
    }

    asrClientRef.value = null;
  }

  function finalizeStoppedSession({ commitResult = true } = {}) {
    keepBrowserRunningRef.value = false;
    cleanupAsrClient();
    cleanupMediaPipeline();

    isListening.value = false;
    speechState.value = "idle";
    speechEngine.value = "none";

    if (commitResult) {
      commitRecognizedText();
    }

    setActionLock();
  }

  function updateWithFinal(text) {
    const normalized = normalizeVoiceText(text);
    if (!normalized) return;

    recognizedFinalRef.value = mergeVoiceTextWithOverlap(
      recognizedFinalRef.value,
      normalized,
      SPEECH_CONFIG.overlapChars
    );

    contextTailRef.value = recognizedFinalRef.value.slice(-SPEECH_CONFIG.contextTailChars);
    lastVoiceAtRef.value = Date.now();
  }

  function safelyStartBrowserRecognition() {
    if (!recognitionRef.value) return false;

    try {
      recognitionRef.value.start();
      return true;
    } catch (error) {
      const message = String(error?.message || "").toLowerCase();
      if (!message.includes("already started")) {
        speechErrorText.value = "浏览器语音识别启动失败，请重试。";
      }
      return false;
    }
  }

  function initBrowserSpeechRecognition() {
    if (typeof window === "undefined") return;

    const SpeechCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechCtor) return;

    const recognition = new SpeechCtor();
    recognition.lang = asrConfig.language || "zh-CN";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let interim = "";
      let finalText = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i]?.[0]?.transcript || "";
        if (event.results[i].isFinal) {
          finalText += transcript;
        } else {
          interim += transcript;
        }
      }

      speechInterimText.value = normalizeVoiceText(interim);
      if (finalText) {
        updateWithFinal(finalText);
      }
    };

    recognition.onerror = (event) => {
      const code = String(event?.error || "unknown");

      if (code === "aborted") return;
      if (code === "no-speech") {
        speechErrorText.value = "没有检测到清晰语音，请再靠近一点麦克风。";
        return;
      }

      if (code === "not-allowed" || code === "service-not-allowed") {
        speechErrorText.value = "麦克风权限被拒绝，请在浏览器设置里开启。";
        stopListening("manual");
        return;
      }

      speechErrorText.value = `语音识别失败：${code}`;
      stopListening("manual");
    };

    recognition.onend = () => {
      if (speechEngine.value !== "browser") return;

      const shouldRestart =
        keepBrowserRunningRef.value &&
        isListening.value &&
        speechState.value !== "stopping";

      if (shouldRestart) {
        speechState.value = "recovering";
        window.setTimeout(() => {
          const active =
            keepBrowserRunningRef.value &&
            isListening.value &&
            speechEngine.value === "browser";

          if (!active) return;
          const started = safelyStartBrowserRecognition();
          if (started) {
            speechState.value = "listening";
          }
        }, SPEECH_CONFIG.browserRestartDelayMs);
        return;
      }

      finalizeStoppedSession({ commitResult: true });
    };

    recognitionRef.value = recognition;
  }

  function initVadTracking() {
    listenStartedAtRef.value = Date.now();
    lastVoiceAtRef.value = Date.now();
    adaptiveVadThresholdRef.value = SPEECH_CONFIG.vadMinRmsThreshold;

    vadTimerRef.value = window.setInterval(() => {
      if (speechState.value !== "listening") return;

      const analyser = analyserRef.value;
      if (!analyser) return;

      const now = Date.now();
      const elapsed = now - listenStartedAtRef.value;
      const rms = computeRmsFromAnalyser(analyser);

      if (elapsed <= SPEECH_CONFIG.vadWarmupMs) {
        vadWarmupSumRef.value += rms;
        vadWarmupCountRef.value += 1;
      } else if (vadWarmupCountRef.value > 0) {
        const noiseFloor = vadWarmupSumRef.value / vadWarmupCountRef.value;
        adaptiveVadThresholdRef.value = clamp(
          noiseFloor * 2.4,
          SPEECH_CONFIG.vadMinRmsThreshold,
          SPEECH_CONFIG.vadMaxRmsThreshold
        );
        vadWarmupCountRef.value = 0;
        vadWarmupSumRef.value = 0;
      }

      if (rms >= adaptiveVadThresholdRef.value) {
        lastVoiceAtRef.value = now;
        return;
      }

      if (now - lastVoiceAtRef.value >= SPEECH_CONFIG.vadSilenceMs) {
        stopListening("vad_silence");
      }
    }, SPEECH_CONFIG.vadCheckIntervalMs);

    maxTimerRef.value = window.setTimeout(() => {
      stopListening("max_duration");
    }, SPEECH_CONFIG.maxSegmentMs);
  }

  async function setupMediaPipeline() {
    if (typeof window === "undefined" || !navigator?.mediaDevices?.getUserMedia) {
      throw new Error("当前浏览器不支持麦克风采集。");
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        noiseSuppression: true,
        echoCancellation: true,
        autoGainControl: true,
        channelCount: 1,
        sampleRate: asrConfig.sampleRate || 16000,
        sampleSize: 16
      }
    });

    streamRef.value = stream;

    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (AudioContextCtor) {
      const ctx = new AudioContextCtor();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();

      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.85;
      source.connect(analyser);

      audioContextRef.value = ctx;
      sourceNodeRef.value = source;
      analyserRef.value = analyser;
    }

    initVadTracking();
  }

  function startMediaRecorderChunking() {
    if (!streamRef.value || !asrClientRef.value) return;

    const preferredMime = "audio/webm;codecs=opus";
    const hasPreferred =
      typeof MediaRecorder !== "undefined" &&
      MediaRecorder.isTypeSupported &&
      MediaRecorder.isTypeSupported(preferredMime);

    const recorder = hasPreferred
      ? new MediaRecorder(streamRef.value, { mimeType: preferredMime })
      : new MediaRecorder(streamRef.value);

    recorder.ondataavailable = async (event) => {
      if (!event?.data || event.data.size === 0) return;

      try {
        asrClientRef.value?.pushChunk(event.data);
      } catch (error) {
        speechErrorText.value = error?.message || "音频分片发送失败。";
        stopListening("manual");
      }
    };

    recorder.onerror = () => {
      speechErrorText.value = "音频录制失败。";
      stopListening("manual");
    };

    recorder.start(Math.max(120, Number(asrConfig.chunkMs || 280)));
    mediaRecorderRef.value = recorder;
  }

  async function startStreamAsr() {
    if (asrConfig.transport !== "websocket" || !asrConfig.wsUrl) {
      throw new Error("Streaming ASR websocket not configured.");
    }

    asrClientRef.value = createWsAsrClient({
      wsUrl: asrConfig.wsUrl,
      authToken: asrConfig.authToken,
      language: asrConfig.language,
      sampleRate: asrConfig.sampleRate,
      openTimeoutMs: asrConfig.openTimeoutMs,
      onPartial: (text) => {
        const normalized = normalizeVoiceText(text);
        speechInterimText.value = mergeVoiceTextWithOverlap(
          contextTailRef.value,
          normalized,
          SPEECH_CONFIG.overlapChars
        );
        if (normalized) {
          lastVoiceAtRef.value = Date.now();
        }
      },
      onFinal: (text) => {
        updateWithFinal(text);
        speechInterimText.value = "";
      },
      onError: (error) => {
        speechErrorText.value = error?.message || "Streaming ASR error.";
      }
    });

    await asrClientRef.value.start();
  }

  async function startBrowserFallback() {
    if (!recognitionRef.value) {
      initBrowserSpeechRecognition();
    }

    if (!recognitionRef.value) {
      throw new Error("当前浏览器不支持语音识别。");
    }

    speechEngine.value = "browser";
    keepBrowserRunningRef.value = true;

    const started = safelyStartBrowserRecognition();
    if (!started) {
      throw new Error("浏览器语音识别未能启动。");
    }
  }

  async function startListening() {
    if (speechState.value === "requesting" || isListening.value || isActionLocked()) return;

    setActionLock();
    speechState.value = "requesting";
    speechErrorText.value = "";
    speechStopReason.value = "";
    resetSegmentBuffers();
    resetVadRuntime();

    try {
      await setupMediaPipeline();

      try {
        await startStreamAsr();
        speechEngine.value = "stream";
        startMediaRecorderChunking();
      } catch {
        cleanupAsrClient();
        speechStopReason.value = "fallback_browser";
        await startBrowserFallback();
      }

      isListening.value = true;
      speechState.value = "listening";
      setActionLock();
    } catch (error) {
      speechErrorText.value = error?.message || "启动语音输入失败。";
      finalizeStoppedSession({ commitResult: false });
    }
  }

  function stopListening(reason = "manual") {
    if ((!isListening.value && speechState.value === "idle") || isActionLocked()) return;

    setActionLock();
    speechStopReason.value = reason;
    speechState.value = "stopping";
    keepBrowserRunningRef.value = false;
    cleanupTimers();

    if (mediaRecorderRef.value && mediaRecorderRef.value.state !== "inactive") {
      try {
        mediaRecorderRef.value.stop();
      } catch {
        // ignore
      }
    }

    if (speechEngine.value === "stream") {
      finalizeStoppedSession({ commitResult: true });
      return;
    }

    if (speechEngine.value === "browser" && recognitionRef.value) {
      try {
        recognitionRef.value.stop();
      } catch {
        finalizeStoppedSession({ commitResult: true });
      }

      // 某些浏览器 stop 后不会触发 onend，这里加兜底。
      window.setTimeout(() => {
        const pendingBrowserStop = speechEngine.value === "browser" && speechState.value === "stopping";
        if (pendingBrowserStop) {
          finalizeStoppedSession({ commitResult: true });
        }
      }, SPEECH_CONFIG.browserStopFallbackFinalizeMs);
      return;
    }

    finalizeStoppedSession({ commitResult: true });
  }

  function toggleListening() {
    if (isListening.value) {
      stopListening("manual");
      return;
    }

    startListening();
  }

  function initVoiceInput() {
    const hasMediaSupport = !!navigator?.mediaDevices?.getUserMedia;
    const hasBrowserSpeech =
      !!(typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition));
    const hasStreamSpeech = asrConfig.transport === "websocket" && Boolean(asrConfig.wsUrl);

    speechSupported.value = hasMediaSupport && (hasBrowserSpeech || hasStreamSpeech);

    if (!hasBrowserSpeech && !hasStreamSpeech) {
      speechErrorText.value = "当前浏览器不支持语音识别。";
    }

    if (hasBrowserSpeech) {
      initBrowserSpeechRecognition();
    }
  }

  function destroyVoiceInput() {
    stopListening("manual");

    isListening.value = false;
    speechState.value = "idle";
    speechEngine.value = "none";

    cleanupAsrClient();
    cleanupMediaPipeline();

    if (recognitionRef.value) {
      recognitionRef.value.onresult = null;
      recognitionRef.value.onerror = null;
      recognitionRef.value.onend = null;
      recognitionRef.value = null;
    }

    keepBrowserRunningRef.value = false;
    resetVadRuntime();
  }

  return {
    speechSupported,
    isListening,
    speechState,
    speechStatusText,
    speechInterimText,
    voiceButtonText,
    toggleListening,
    initVoiceInput,
    destroyVoiceInput
  };
}
