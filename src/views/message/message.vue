<template>
  <div class="ai-page">
    <van-nav-bar title="AI 旅行助手" />

    <div class="tips" v-if="!hasApiKey">
      未检测到 <code>VITE_AI_API_KEY</code>，请先在
      <code>.env.local</code> 配置并重启开发服务。
    </div>

    <div class="quick-actions">
      <van-tag
        v-for="prompt in quickPrompts"
        :key="prompt"
        plain
        type="warning"
        @click="usePrompt(prompt)"
      >
        {{ prompt }}
      </van-tag>
    </div>

    <div class="message-list" ref="messageListRef">
      <div
        v-for="(item, index) in messages"
        :key="`${item.role}-${item.type || 'text'}-${index}`"
        class="message-item"
        :class="item.role"
      >
        <div v-if="item.type === 'text-with-cards'" class="combo-wrap">
          <div class="bubble" v-html="renderMarkdown(item.content)"></div>
          <div class="stay-cards-wrap embedded">
            <div
              class="stay-card"
              v-for="card in item.cards"
              :key="card.houseId"
              @click="openHouseDetail(card)"
            >
              <img class="thumb" :src="card.imageUrl" alt="house" loading="lazy" decoding="async" />
              <div class="info">
                <div class="name">{{ card.houseName || "未命名房源" }}</div>
                <div class="location">{{ card.location || "位置未知" }}</div>
                <div class="summary">{{ card.summaryText || "暂无简介" }}</div>
                <div class="price-row">
                  <span class="price"
                    >&yen;{{
                      card.finalPrice || card.productPrice || "--"
                    }}</span
                  >
                  <span class="tip" v-if="card.priceTipBadgeText">{{
                    card.priceTipBadgeText
                  }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-else-if="item.type === 'stay-cards'" class="stay-cards-wrap">
          <div
            class="stay-card"
            v-for="card in item.cards"
            :key="card.houseId"
            @click="openHouseDetail(card)"
          >
            <img class="thumb" :src="card.imageUrl" alt="house" loading="lazy" decoding="async" />
            <div class="info">
              <div class="name">{{ card.houseName || "未命名房源" }}</div>
              <div class="location">{{ card.location || "位置未知" }}</div>
              <div class="summary">{{ card.summaryText || "暂无简介" }}</div>
              <div class="price-row">
                <span class="price"
                  >&yen;{{ card.finalPrice || card.productPrice || "--" }}</span
                >
                <span class="tip" v-if="card.priceTipBadgeText">{{
                  card.priceTipBadgeText
                }}</span>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="bubble" v-html="renderMarkdown(item.content)"></div>
      </div>

      <div class="message-item assistant" v-if="isLoading && waitingFirstChunk">
        <div class="bubble loading">正在思考中...</div>
      </div>
    </div>

    <div class="error" v-if="errorText">{{ errorText }}</div>
    <div class="voice-status" v-if="speechStatusText">{{ speechStatusText }}</div>
    <div class="voice-preview" v-if="isListening && speechInterimText">
      {{ speechInterimText }}
    </div>

    <div class="composer">
      <van-field
        v-model="inputText"
        type="textarea"
        rows="2"
        autosize
        placeholder="输入你的旅行需求，例如：广州两天一夜亲子行程"
        @keydown.enter.exact.prevent="sendFromInput"
      />
      <div class="actions">
        <van-button plain type="default" size="small" @click="clearChat"
          >清空</van-button
        >
        <van-button
          plain
          type="default"
          size="small"
          :disabled="!isListening && (!speechSupported || isLoading || speechState !== 'idle')"
          @click="toggleListening"
        >
          {{ voiceButtonText }}
        </van-button>
        <van-button
          plain
          type="default"
          size="small"
          :disabled="!canRetry || isLoading"
          @click="retryLastUserMessage"
        >
          重试
        </van-button>
        <van-button
          :type="isLoading ? 'danger' : 'warning'"
          size="small"
          @click="handleSendButtonClick"
        >
          {{ isLoading ? "停止" : "发送" }}
        </van-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { marked } from "marked";
import DOMPurify from "dompurify";
import useVoiceInput from "@/hooks/useVoiceInput";
import {
  getAiRuntimeConfig,
  queryCityLiveWeather,
  queryRoutePlanByText,
  queryLocalStayRecommendations,
  streamAiMessage,
} from "@/services";

const STORAGE_KEY = "zc_trip_ai_messages_v1";
const MAX_HISTORY = 30;
const SYSTEM_PROMPT =
  "你是一个旅行助手，回答要简洁、可执行，并尽量给出行程和预算建议。";
const WEATHER_QUESTION_RE = /(?:天气|气温|温度|降雨|下雨|风力|湿度|穿衣|体感)/u;
const ROUTE_QUESTION_RE =
  /(?:路线|路程|怎么去|怎么走|如何去|如何到|到达|乘车|公交|地铁|打车|驾车|步行|骑行|导航|从.+(?:到|去).+)/u;
const STAY_RECOMMEND_RE =
  /(?:推荐|民宿|住宿|住哪|住哪里|酒店|房源|公寓|客栈|旅舍|订房|预订)/u;

const quickPrompts = [
  "帮我规划广州2日游",
  "广州天气是咋样的？",
  "从南京邮电大学到南京师范大学怎么去",
  "假设我要去广州旅游，给我推荐住宿",
];

const messages = ref([
  {
    role: "assistant",
    type: "text",
    content: "你好！我是你的旅行助手。你可以告诉我预算、天数、城市和偏好。",
  },
]);

const inputText = ref("");
const isLoading = ref(false);
const waitingFirstChunk = ref(false);
const errorText = ref("");
const messageListRef = ref(null);
const lastPrompt = ref("");
const currentStreamController = ref(null);
const isUserStopped = ref(false);

const route = useRoute();
const router = useRouter();
const runtimeConfig = getAiRuntimeConfig();
const hasApiKey = computed(() => !!runtimeConfig.apiKey);
const canRetry = computed(() =>
  messages.value.some((item) => item.role === "user"),
);

function appendVoiceTextToInput(text) {
  const nextText = String(text || "").trim();
  if (!nextText) return;
  inputText.value = inputText.value ? `${inputText.value}\n${nextText}` : nextText;
}

marked.setOptions({
  gfm: true,
  breaks: true,
});

const {
  speechSupported,
  isListening,
  speechState,
  speechStatusText,
  speechInterimText,
  voiceButtonText,
  toggleListening,
  initVoiceInput,
  destroyVoiceInput
} = useVoiceInput({
  onCommit: (text) => {
    appendVoiceTextToInput(text);
    scrollToBottom();
  }
});

function renderMarkdown(content) {
  const source = String(content ?? "");
  const html = marked.parse(source);
  return DOMPurify.sanitize(String(html), { USE_PROFILES: { html: true } });
}

function sanitizeStayCards(cards = [], max = 6) {
  return cards
    .filter((card) => card && card.houseId)
    .slice(0, max)
    .map((card) => ({
      houseId: card.houseId,
      houseName: card.houseName || "",
      location: card.location || "",
      imageUrl: card.imageUrl || "",
      summaryText: card.summaryText || "",
      finalPrice: Number(card.finalPrice || 0),
      productPrice: Number(card.productPrice || 0),
      priceTipBadgeText: card.priceTipBadgeText || "",
    }));
}

function normalizeMessage(item) {
  if (!item || (item.role !== "user" && item.role !== "assistant")) return null;

  if (
    item.type === "text-with-cards" &&
    typeof item.content === "string" &&
    Array.isArray(item.cards)
  ) {
    const cards = sanitizeStayCards(item.cards);
    return {
      role: item.role,
      type: "text-with-cards",
      cards,
      content: item.content,
    };
  }

  if (item.type === "stay-cards" && Array.isArray(item.cards)) {
    const cards = sanitizeStayCards(item.cards);

    return {
      role: item.role,
      type: "stay-cards",
      cards,
      content: "",
    };
  }

  if (typeof item.content === "string") {
    return {
      role: item.role,
      type: "text",
      content: item.content,
    };
  }

  return null;
}

function scrollToBottom() {
  nextTick(() => {
    if (!messageListRef.value) return;
    messageListRef.value.scrollTop = messageListRef.value.scrollHeight;
  });
}

function saveMessages() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(messages.value.slice(-MAX_HISTORY)),
  );
}

function restoreMessages() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return;

    const safeMessages = parsed.map(normalizeMessage).filter(Boolean);

    if (safeMessages.length > 0) {
      messages.value = safeMessages.slice(-MAX_HISTORY);
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function pushMessage(message) {
  const normalized = normalizeMessage(message);
  if (!normalized) return;

  messages.value.push(normalized);
  if (messages.value.length > MAX_HISTORY) {
    messages.value = messages.value.slice(-MAX_HISTORY);
  }
  saveMessages();
}

function clearChat() {
  messages.value = [
    {
      role: "assistant",
      type: "text",
      content: "我是你的AI小助手！",
    },
  ];
  errorText.value = "";
  saveMessages();
  scrollToBottom();
}

function usePrompt(prompt) {
  inputText.value = prompt;
}

function openHouseDetail(card) {
  if (!card?.houseId) return;
  router.push(`/detail/${card.houseId}`);
}

function getRecentMessages() {
  return messages.value
    .filter(
      (item) => item.type !== "stay-cards" && typeof item.content === "string",
    )
    .slice(-12)
    .map((item) => ({ role: item.role, content: item.content }));
}

function isWeatherQuestion(text) {
  return WEATHER_QUESTION_RE.test(String(text || ""));
}

function isRouteQuestion(text) {
  return ROUTE_QUESTION_RE.test(String(text || ""));
}

function isStayRecommendQuestion(text) {
  return STAY_RECOMMEND_RE.test(String(text || ""));
}

function normalizeCityName(city) {
  return String(city || "")
    .replace(/[\s,，。！？!?]/g, "")
    .replace(/(?:省|市|区|县|特别行政区)$/u, "");
}

function extractCityFromQuestion(text) {
  const compact = String(text || "").replace(/\s+/g, "");
  const matched = compact.match(/([\u4e00-\u9fa5]{2,12}?)(?:的)?天气/u);

  let city = matched?.[1] || "";
  if (!city) {
    city = String(route.query.currentCity || route.query.city || "");
  }

  return normalizeCityName(city);
}

function cleanRoutePlace(text) {
  return String(text || "")
    .replace(/^[“"'\s]+|[”"'\s]+$/g, "")
    .replace(/^(?:我想|我现在|我要|请问|帮我|麻烦|从|由)+/u, "")
    .replace(
      /(?:怎么走|怎么去|如何去|如何到|怎么到|路线|路程|导航|坐什么车|乘什么车).*$/u,
      "",
    )
    .trim();
}

function extractRouteFromQuestion(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;

  const compact = raw
    .replace(/[，。！？]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const patterns = [
    /从\s*(.+?)\s*(?:到|去)\s*(.+?)(?:\s*(?:怎么走|怎么去|如何去|如何到|怎么到|路线|路程|导航|交通).*)?$/u,
    /^(.+?)\s*(?:到|去)\s*(.+?)(?:\s*(?:怎么走|怎么去|如何去|如何到|怎么到|路线|路程|导航|交通).*)?$/u,
  ];

  for (const pattern of patterns) {
    const match = compact.match(pattern);
    if (!match) continue;

    const from = cleanRoutePlace(match[1]);
    const to = cleanRoutePlace(match[2]);
    if (from && to) return { from, to };
  }

  return null;
}

function formatCost(value, fallback = "未知") {
  if (value == null || value === "") return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return `约${n}元`;
}

function nonEmptyText(value) {
  const text = String(value || "").trim();
  return text || "";
}

function buildTransitSegmentText(segment) {
  if (!segment) return "";

  const instruction = nonEmptyText(segment.instruction);
  if (instruction) return instruction;

  const parts = [];
  if (segment.walkingDistanceText && Number(segment.walkingDistanceM) > 0) {
    parts.push(`步行${segment.walkingDistanceText}`);
  }

  if (Array.isArray(segment.busLines) && segment.busLines.length > 0) {
    const busText = segment.busLines
      .map((line) => {
        if (!line?.name) return "";
        const viaText = Number(line.viaNum || 0) > 0 ? `${line.viaNum}站` : "";
        const stopText =
          line.departureStop || line.arrivalStop
            ? `，${line.departureStop || "起点"}上车${
                line.arrivalStop ? `，${line.arrivalStop}下车` : ""
              }`
            : "";
        return `乘坐${line.name}${viaText ? `(${viaText})` : ""}${stopText}`;
      })
      .filter(Boolean)
      .join("；");
    if (busText) parts.push(busText);
  }

  if (segment.railway?.trip || segment.railway?.name) {
    const railway = segment.railway;
    parts.push(
      `铁路${railway.trip || railway.name}${
        railway.departureStop ? `，${railway.departureStop}上车` : ""
      }${railway.arrivalStop ? `，${railway.arrivalStop}下车` : ""}`,
    );
  }

  if (segment.taxi?.distanceText) {
    parts.push(`打车${segment.taxi.distanceText}`);
  }

  return parts.filter(Boolean).join(" -> ");
}

function buildDrivingStepText(step) {
  if (!step) return "";
  const instruction = nonEmptyText(step.instruction);
  if (!instruction) return "";
  const meta = [step.distanceText, step.durationText].filter(Boolean).join(" / ");
  return meta ? `${instruction}（${meta}）` : instruction;
}

function buildWalkingStepText(step) {
  if (!step) return "";
  const instruction = nonEmptyText(step.instruction);
  if (!instruction) return "";
  const meta = [step.distanceText, step.durationText].filter(Boolean).join(" / ");
  return meta ? `${instruction}（${meta}）` : instruction;
}

function formatConstraints(constraints) {
  if (!constraints) return "";

  const city = constraints.city ? `城市: ${constraints.city}` : "城市: 不限";
  const budget =
    constraints.minPrice != null || constraints.maxPrice != null
      ? `预算: ${constraints.minPrice ?? 0}-${constraints.maxPrice ?? "不限"}元`
      : "预算: 不限";
  const guests =
    constraints.minGuests != null || constraints.maxGuests != null
      ? `人数: ${constraints.minGuests ?? 1}-${constraints.maxGuests ?? "不限"}人`
      : "人数: 不限";
  const kw =
    (constraints.keywords || []).length > 0
      ? `关键词: ${(constraints.keywords || []).join("/")}`
      : "关键词: 无";

  return [city, budget, guests, kw].join("；");
}

function buildWeatherSystemPrompt(weather) {
  if (!weather) return "";

  return [
    "你拿到了一份实时天气数据，请把它当作最高优先级事实。",
    `城市：${weather.city}`,
    `天气：${weather.weather}`,
    `温度：${weather.temperature}°C`,
    `湿度：${weather.humidity}%`,
    `风向：${weather.winddirection}`,
    `风力：${weather.windpower}级`,
    `发布时间：${weather.reporttime}`,
    "回答要求：先给天气结论，再给简短出行建议和穿衣建议。",
    "不要输出类似 city=xxx 的原始字段格式。",
  ].join("\n");
}

function buildRouteSystemPrompt(routePlan) {
  if (!routePlan) return "";

  const lines = [
    "你拿到了一份高德路线规划结果，请严格基于该数据回答，不要编造站点、时长和费用。",
    `起点：${routePlan.from.formattedAddress}`,
    `终点：${routePlan.to.formattedAddress}`,
    `起点坐标：${routePlan.from.location}`,
    `终点坐标：${routePlan.to.location}`,
  ];

  if (routePlan.transit) {
    const transit = routePlan.transit;
    lines.push(
      `【公交】总时长${transit.durationText}，总路程${transit.distanceText}，步行${transit.walkingDistanceText}，换乘${transit.transfers}次，费用${formatCost(transit.cost)}`,
    );

    const segmentLines = (transit.segments || [])
      .map((segment) => `- S${segment.index}: ${buildTransitSegmentText(segment)}`)
      .filter((line) => line && !line.endsWith(": "))
      .slice(0, 8);

    if (segmentLines.length > 0) {
      lines.push("公交关键分段（按顺序）：");
      lines.push(...segmentLines);
    }
  }

  if (routePlan.driving) {
    const driving = routePlan.driving;
    lines.push(
      `【驾车】总时长${driving.durationText}，路程${driving.distanceText}，过路费${formatCost(driving.tolls, "约0元")}，红绿灯${driving.trafficLights ?? 0}个`,
    );

    const drivingStepLines = (driving.steps || [])
      .map((step) => `- D${step.index}: ${buildDrivingStepText(step)}`)
      .filter((line) => line && !line.endsWith(": "))
      .slice(0, 8);

    if (drivingStepLines.length > 0) {
      lines.push("驾车关键步骤（按顺序）：");
      lines.push(...drivingStepLines);
    }
  }

  if (routePlan.walking) {
    const walking = routePlan.walking;
    lines.push(
      `【步行】总时长${walking.durationText}，路程${walking.distanceText}`,
    );

    const walkingStepLines = (walking.steps || [])
      .map((step) => `- W${step.index}: ${buildWalkingStepText(step)}`)
      .filter((line) => line && !line.endsWith(": "))
      .slice(0, 6);

    if (walkingStepLines.length > 0) {
      lines.push("步行关键步骤（按顺序）：");
      lines.push(...walkingStepLines);
    }
  }

  lines.push("回答要求：");
  lines.push("- 先给推荐方案，再给1-2个备选方案。");
  lines.push("- 每个方案写清楚：总时长、总距离、费用、换乘/过路费。");
  lines.push("- 推荐方案至少列3条关键步骤，步骤必须引用上面的 S/D/W 明细。");
  lines.push(
    "- 如果地点可能有多个校区/分站，请提醒用户确认具体目的地。",
  );
  lines.push("- 回答简洁，不要输出 JSON，不要泄露原始接口字段名。");
  return lines.join("\n");
}

function buildStayRecommendSystemPrompt(result, displayCandidates = []) {
  if (!result) return "";

  const candidates =
    Array.isArray(displayCandidates) && displayCandidates.length > 0
      ? displayCandidates
      : Array.isArray(result.candidates)
        ? result.candidates.slice(0, 3)
        : [];

  const lines = [
    "你拿到了一份本地房源检索结果，请优先从这些真实候选里推荐，不要编造不存在的房源。",
    `检索条件：${formatConstraints(result.constraints)}`,
    `本地样本总量：${result.totalPool}，命中数量：${result.matchedCount}`,
  ];

  if (result.relaxNote) {
    lines.push(`检索说明：${result.relaxNote}`);
  }

  if (!Array.isArray(candidates) || candidates.length === 0) {
    lines.push(
      "候选房源为空。请明确告知用户当前条件下未命中，并建议放宽预算/人数/城市后再试。",
    );
    return lines.join("\n");
  }

  lines.push("前端已展示以下3张候选房源卡片（与用户可见卡片一致）：");
  candidates.forEach((item, index) => {
    const tags = item.tags?.length ? item.tags.join("/") : "无";
    const capacityText = item.capacity > 0 ? `${item.capacity}人` : "未知";
    lines.push(
      `${index + 1}. [${item.houseId}] ${item.houseName} | 位置:${item.location} | 价格:¥${item.finalPrice || item.productPrice || "未知"} | 可住:${capacityText} | 标签:${tags} | 优惠:${item.priceTipBadgeText || "无"}`,
    );
  });

  lines.push(
    "回答要求：只能从这3套里推荐，名称和价格必须与卡片一致；不要按“首选/次选/备选”逐条展开。",
  );
  lines.push(
    "展示要求：前端会把这3张卡片嵌入在你的文字回答下方。你只需输出2-4行摘要建议（预算、区域、注意事项），不要重复房源名称/houseId/价格明细。",
  );
  return lines.join("\n");
}

function toDisplayStayCards(candidates = []) {
  return sanitizeStayCards(
    candidates.map((item) => ({
      houseId: item.houseId,
      houseName: item.houseName || "",
      location: item.location || "",
      imageUrl: item.imageUrl || "",
      summaryText: item.summaryText || "",
      finalPrice: Number(item.finalPrice || 0),
      productPrice: Number(item.productPrice || 0),
      priceTipBadgeText: item.priceTipBadgeText || "",
    })),
    3,
  );
}

function embedStayCardsIntoAssistantMessage(assistantIndex, candidates = []) {
  if (assistantIndex < 0 || !messages.value[assistantIndex]) return;
  const cards = toDisplayStayCards(candidates);
  if (cards.length === 0) return;

  const current = messages.value[assistantIndex];
  messages.value[assistantIndex] = {
    ...current,
    type: "text-with-cards",
    cards,
  };
  saveMessages();
  scrollToBottom();
}

function simplifyStayAssistantText(content, candidates = []) {
  let text = String(content || "").trim();
  if (!text) return "已为你筛选了更匹配的房源，详情见下方卡片。";

  // Remove expanded ranking sections and raw ids if the model still outputs them.
  const markers = [
    /(^|\n)\s*(首选|次选|备选)\s*[:：]/,
    /(^|\n)\s*\d+\s*[\.、]/,
    /\[\d{6,}\]/,
    /房源ID\s*[:：]/i,
  ];

  let cutIndex = -1;
  for (const pattern of markers) {
    const matched = text.match(pattern);
    if (matched && typeof matched.index === "number") {
      cutIndex =
        cutIndex === -1 ? matched.index : Math.min(cutIndex, matched.index);
    }
  }

  if (cutIndex > 0) {
    text = text.slice(0, cutIndex).trim();
  }

  const candidateNames = candidates
    .map((item) => String(item?.houseName || "").trim())
    .filter(Boolean);

  // If model still includes candidate names in detail lines, keep only short summary lines.
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/\[\d{6,}\]/.test(line));

  const filtered = lines.filter(
    (line) => !candidateNames.some((name) => name && line.includes(name)),
  );
  const finalLines = (filtered.length > 0 ? filtered : lines).slice(0, 4);
  const finalText = finalLines.join("\n").trim();

  return finalText || "已为你筛选了更匹配的房源，详情见下方卡片。";
}

async function buildWeatherPromptIfNeeded(content) {
  if (!isWeatherQuestion(content)) return "";

  const city = extractCityFromQuestion(content);
  if (!city) return "";

  try {
    const weather = await queryCityLiveWeather(city);
    return buildWeatherSystemPrompt(weather);
  } catch {
    return "";
  }
}

async function buildRoutePromptIfNeeded(content) {
  if (!isRouteQuestion(content)) return "";

  const parsed = extractRouteFromQuestion(content);
  if (!parsed?.from || !parsed?.to) {
    return "用户正在询问路线规划，但未明确起点或终点。请先追问清楚起点和终点，再给方案。";
  }

  try {
    const routePlan = await queryRoutePlanByText(parsed.from, parsed.to, {
      cityHint: String(route.query.currentCity || route.query.city || ""),
    });
    return buildRouteSystemPrompt(routePlan);
  } catch {
    return `用户询问从“${parsed.from}”到“${parsed.to}”的路线，但你当前无法拿到实时路线结果。请明确告知并给出简短的查询建议。`;
  }
}

async function buildStayRecommendContextIfNeeded(content) {
  if (!isStayRecommendQuestion(content)) {
    return { prompt: "", candidates: [] };
  }

  try {
    const result = await queryLocalStayRecommendations(content, {
      cityHint: String(route.query.currentCity || route.query.city || ""),
      fetchPages: 4,
      limit: 6,
    });
    const displayCandidates = Array.isArray(result.candidates)
      ? result.candidates.slice(0, 3)
      : [];

    return {
      prompt: buildStayRecommendSystemPrompt(result, displayCandidates),
      candidates: displayCandidates,
    };
  } catch {
    return {
      prompt:
        "用户在询问住宿推荐，但你当前无法拿到本地房源检索结果。请先说明无法实时检索，再给出一般性选房建议。",
      candidates: [],
    };
  }
}

async function sendMessage(content, appendUser = true) {
  if (!content || isLoading.value) return;

  if (!hasApiKey.value) {
    errorText.value = "请先配置 VITE_AI_API_KEY，并重启开发服务。";
    return;
  }

  errorText.value = "";
  if (appendUser) {
    pushMessage({ role: "user", type: "text", content });
  }
  scrollToBottom();

  try {
    isLoading.value = true;
    waitingFirstChunk.value = true;
    isUserStopped.value = false;
    let assistantIndex = -1;
    const controller = new AbortController();
    currentStreamController.value = controller;

    const [weatherPrompt, routePrompt, stayContext] = await Promise.all([
      buildWeatherPromptIfNeeded(content),
      buildRoutePromptIfNeeded(content),
      buildStayRecommendContextIfNeeded(content),
    ]);

    const promptMessages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...(weatherPrompt ? [{ role: "system", content: weatherPrompt }] : []),
      ...(routePrompt ? [{ role: "system", content: routePrompt }] : []),
      ...(stayContext.prompt
        ? [{ role: "system", content: stayContext.prompt }]
        : []),
      ...getRecentMessages(),
    ];

    await streamAiMessage(promptMessages, {
      signal: controller.signal,
      onChunk: (chunk) => {
        if (!chunk) return;

        waitingFirstChunk.value = false;
        if (assistantIndex === -1) {
          messages.value.push({
            role: "assistant",
            type: "text",
            content: chunk,
          });
          assistantIndex = messages.value.length - 1;
        } else {
          messages.value[assistantIndex].content += chunk;
        }

        saveMessages();
        scrollToBottom();
      },
    });

    if (assistantIndex !== -1 && stayContext.candidates.length > 0) {
      messages.value[assistantIndex].content = simplifyStayAssistantText(
        messages.value[assistantIndex].content,
        stayContext.candidates,
      );
      saveMessages();
      embedStayCardsIntoAssistantMessage(
        assistantIndex,
        stayContext.candidates,
      );
    }

    if (assistantIndex === -1 && !isUserStopped.value) {
      pushMessage({
        role: "assistant",
        type: "text",
        content: "我暂时没有生成有效回复，请重试一次。",
      });
    }
  } catch (error) {
    const isAbortError =
      error?.name === "AbortError" ||
      /aborted|abort/i.test(String(error?.message || ""));

    if (isAbortError || isUserStopped.value) {
      errorText.value = "";
      return;
    }

    const serverMessage =
      error?.response?.data?.error?.message ||
      error?.response?.data?.message ||
      error?.message ||
      "AI 请求失败，请检查网络或 API Key。";

    errorText.value = serverMessage;
  } finally {
    currentStreamController.value = null;
    isUserStopped.value = false;
    isLoading.value = false;
    waitingFirstChunk.value = false;
    scrollToBottom();
  }
}

function stopStreaming() {
  if (!isLoading.value || !currentStreamController.value) return;
  isUserStopped.value = true;
  currentStreamController.value.abort();
}

async function sendFromInput() {
  const content = String(inputText.value ?? "").trim();
  if (!content) return;
  inputText.value = "";
  await sendMessage(content, true);
}

async function handleSendButtonClick() {
  if (isLoading.value) {
    stopStreaming();
    return;
  }

  await sendFromInput();
}

async function retryLastUserMessage() {
  const lastUser = [...messages.value]
    .reverse()
    .find((item) => item.role === "user");
  if (!lastUser?.content) return;
  await sendMessage(lastUser.content, false);
}

async function runRoutePrompt(prompt) {
  if (typeof prompt !== "string") return;
  const text = prompt.trim();
  if (!text || text === lastPrompt.value) return;

  lastPrompt.value = text;
  await sendMessage(text, true);
}

onMounted(() => {
  initVoiceInput();
  restoreMessages();
  scrollToBottom();
  runRoutePrompt(route.query.prompt);
});

onUnmounted(() => {
  destroyVoiceInput();
});

watch(
  () => route.query.prompt,
  (newPrompt) => {
    runRoutePrompt(newPrompt);
  },
);
</script>

<style lang="less" scoped>
.ai-page {
  height: calc(100vh - 50px);
  display: flex;
  flex-direction: column;
  background: #f7f8fa;
}

.tips {
  margin: 10px 12px 0;
  padding: 10px;
  border-radius: 8px;
  color: #8a5500;
  background: #fff5e6;

  code {
    font-family: Consolas, monospace;
  }
}

.quick-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px 12px 0;
}

.message-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.message-item {
  display: flex;
  margin-bottom: 10px;

  .bubble {
    max-width: 82%;
    padding: 10px 12px;
    border-radius: 10px;
    line-height: 1.5;
    white-space: normal;
    word-break: break-word;
  }

  .stay-cards-wrap {
    width: 86%;
    border-radius: 10px;
    padding: 8px;
    background: #fff;
  }

  .combo-wrap {
    width: 86%;
  }

  .combo-wrap .stay-cards-wrap.embedded {
    width: 100%;
    margin-top: 8px;
  }

  .stay-card {
    display: flex;
    gap: 8px;
    padding: 6px;
    border-radius: 8px;
    border: 1px solid #eef0f3;
    background: #fff;
    cursor: pointer;

    & + .stay-card {
      margin-top: 8px;
    }

    .thumb {
      width: 86px;
      height: 68px;
      border-radius: 6px;
      object-fit: cover;
      background: #f1f3f6;
      flex-shrink: 0;
    }

    .info {
      flex: 1;
      min-width: 0;
    }

    .name {
      color: #1f2733;
      font-size: 13px;
      font-weight: 600;
      line-height: 1.35;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .location {
      margin-top: 2px;
      color: #738091;
      font-size: 11px;
    }

    .summary {
      margin-top: 2px;
      color: #525f70;
      font-size: 11px;
      display: -webkit-box;
      -webkit-line-clamp: 1;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .price-row {
      margin-top: 4px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
    }

    .price {
      color: #ff6a3d;
      font-size: 16px;
      font-weight: 600;
      line-height: 1;
    }

    .tip {
      flex-shrink: 0;
      padding: 1px 6px;
      border-radius: 10px;
      font-size: 11px;
      color: #ff4d4f;
      background: rgba(255, 77, 79, 0.12);
    }
  }

  .bubble :deep(p) {
    margin: 0 0 8px;
  }

  .bubble :deep(p:last-child) {
    margin-bottom: 0;
  }

  .bubble :deep(ul),
  .bubble :deep(ol) {
    margin: 6px 0 6px 18px;
    padding: 0;
  }

  .bubble :deep(li) {
    margin: 2px 0;
  }

  .bubble :deep(code) {
    font-family: Consolas, Monaco, monospace;
    padding: 1px 4px;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.08);
  }

  .bubble :deep(pre) {
    margin: 8px 0;
    padding: 8px;
    border-radius: 6px;
    overflow-x: auto;
    background: rgba(0, 0, 0, 0.08);
  }

  &.assistant {
    justify-content: flex-start;

    .bubble {
      color: #333;
      background: #fff;
    }
  }

  &.user {
    justify-content: flex-end;

    .bubble {
      color: #fff;
      background: linear-gradient(90deg, #fa8c1d, #fcaf3f);
    }
  }

  .loading {
    opacity: 0.8;
  }
}

.error {
  margin: 0 12px 8px;
  padding: 8px 10px;
  border-radius: 8px;
  color: #c73b3b;
  background: #ffecec;
  font-size: 12px;
}

.voice-status {
  margin: 0 12px 8px;
  padding: 8px 10px;
  border-radius: 8px;
  color: #6b7280;
  background: #f2f4f7;
  font-size: 12px;
}

.voice-preview {
  margin: 0 12px 8px;
  padding: 10px;
  border-radius: 8px;
  color: #1f2937;
  background: #ecfdf3;
  border: 1px solid #c5efd8;
  font-size: 13px;
  line-height: 1.45;
}

.composer {
  padding: 10px 12px calc(10px + env(safe-area-inset-bottom));
  background: #fff;
  border-top: 1px solid #f1f1f1;

  .actions {
    margin-top: 8px;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
}
</style>
