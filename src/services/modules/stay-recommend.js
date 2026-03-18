import { getHomeHouselist } from "./home";

const CACHE_TTL = 10 * 60 * 1000;
const DEFAULT_FETCH_PAGES = 4;
const DEFAULT_LIMIT = 6;

const stayPoolCache = {
  items: [],
  expireAt: 0
};

function now() {
  return Date.now();
}

function normalizeText(text) {
  return String(text || "").toLowerCase().replace(/\s+/g, "");
}

function buildHouseSearchText(data) {
  if (!data) return "";
  const tagTexts = Array.isArray(data.houseTags)
    ? data.houseTags
        .map((item) => item?.text || item?.tagText?.text || "")
        .filter(Boolean)
        .join(" ")
    : "";

  return normalizeText(
    [
      data.houseName,
      data.summaryText,
      data.location,
      data.guideText,
      data.sellingPoint,
      data.referencePriceDesc,
      data.priceTipBadge?.text,
      tagTexts
    ].join(" ")
  );
}

function parseCapacity(data) {
  const source = `${data?.summaryText || ""} ${data?.houseName || ""}`;
  const match = source.match(/(\d+)\s*人/);
  return match ? Number(match[1]) : 0;
}

function parseBudget(text) {
  const source = String(text || "");

  const range = source.match(/(\d{2,5})\s*(?:-|~|到|至)\s*(\d{2,5})\s*(?:元|块)?/);
  if (range) {
    const min = Number(range[1]);
    const max = Number(range[2]);
    if (Number.isFinite(min) && Number.isFinite(max)) {
      return { minPrice: Math.min(min, max), maxPrice: Math.max(min, max) };
    }
  }

  const le = source.match(/(?:预算|价格|人均|每晚)?\s*(\d{2,5})\s*(?:元|块)?\s*(?:以内|以下|不超过|封顶)/);
  if (le) {
    const max = Number(le[1]);
    if (Number.isFinite(max)) return { minPrice: null, maxPrice: max };
  }

  const ge = source.match(/(?:预算|价格|人均|每晚)?\s*(\d{2,5})\s*(?:元|块)?\s*(?:以上|起|及以上|不低于)/);
  if (ge) {
    const min = Number(ge[1]);
    if (Number.isFinite(min)) return { minPrice: min, maxPrice: null };
  }

  const fixed = source.match(/(?:预算|人均|每晚)\s*(\d{2,5})\s*(?:元|块)?/);
  if (fixed) {
    const max = Number(fixed[1]);
    if (Number.isFinite(max)) return { minPrice: null, maxPrice: max };
  }

  return { minPrice: null, maxPrice: null };
}

function parseGuests(text) {
  const source = String(text || "");

  const range = source.match(/(\d+)\s*(?:-|~|到|至)\s*(\d+)\s*人/);
  if (range) {
    const a = Number(range[1]);
    const b = Number(range[2]);
    if (Number.isFinite(a) && Number.isFinite(b)) {
      return { minGuests: Math.min(a, b), maxGuests: Math.max(a, b) };
    }
  }

  const single = source.match(/(\d+)\s*人/);
  if (single) {
    const n = Number(single[1]);
    if (Number.isFinite(n)) return { minGuests: null, maxGuests: n };
  }

  return { minGuests: null, maxGuests: null };
}

function parseCity(text, cityHint = "") {
  const fallback = String(cityHint || "").trim();
  const source = String(text || "").trim();
  const direct = source.match(/(?:去|到|在|来|前往)\s*([\u4e00-\u9fa5]{2,8})(?:市)?/u);
  if (direct?.[1]) return direct[1];

  const aroundStay = source.match(/([\u4e00-\u9fa5]{2,8})(?:市)?(?:住宿|民宿|酒店|房源|住哪|住哪里|旅游|旅行)/u);
  if (aroundStay?.[1]) return aroundStay[1];

  return fallback;
}

function parseKeywords(text) {
  const source = normalizeText(text);
  const dictionary = [
    "近地铁",
    "地铁",
    "江景",
    "投影",
    "可做饭",
    "厨房",
    "情侣",
    "亲子",
    "loft",
    "别墅",
    "复式",
    "停车",
    "安静",
    "商圈",
    "夜景",
    "便宜",
    "性价比"
  ];

  return dictionary.filter((kw) => source.includes(normalizeText(kw)));
}

function extractConstraints(query, cityHint = "") {
  const city = parseCity(query, cityHint);
  const { minPrice, maxPrice } = parseBudget(query);
  const { minGuests, maxGuests } = parseGuests(query);
  const keywords = parseKeywords(query);

  return { city, minPrice, maxPrice, minGuests, maxGuests, keywords };
}

function cityMatched(constraints, data, searchText) {
  const city = normalizeText(constraints.city);
  if (!city) return true;
  const shortCity = city.replace(/市$/, "");
  const locationText = normalizeText(data?.location || "");
  return (
    searchText.includes(city) ||
    (shortCity && searchText.includes(shortCity)) ||
    locationText.includes(city) ||
    (shortCity && locationText.includes(shortCity))
  );
}

function budgetMatched(constraints, price) {
  if (!Number.isFinite(price) || price <= 0) return true;
  if (constraints.minPrice != null && price < constraints.minPrice) return false;
  if (constraints.maxPrice != null && price > constraints.maxPrice) return false;
  return true;
}

function guestsMatched(constraints, capacity) {
  if (!Number.isFinite(capacity) || capacity <= 0) return true;
  if (constraints.minGuests != null && capacity < constraints.minGuests) return false;
  if (constraints.maxGuests != null && capacity > constraints.maxGuests) return false;
  return true;
}

function scoreCandidate(item, constraints) {
  const data = item?.data;
  if (!data) return -1;

  const searchText = buildHouseSearchText(data);
  const price = Number(data?.finalPrice || 0);
  const capacity = parseCapacity(data);

  let score = 0;

  if (cityMatched(constraints, data, searchText)) score += 20;
  if (budgetMatched(constraints, price)) score += 15;
  if (guestsMatched(constraints, capacity)) score += 10;

  const hitKeywords = (constraints.keywords || []).filter((kw) =>
    searchText.includes(normalizeText(kw))
  );
  score += hitKeywords.length * 6;

  if (String(data?.priceTipBadge?.text || "").includes("已减")) score += 2;
  if (price > 0) score += Math.max(0, 8 - Math.floor(price / 150));

  return score;
}

function toDisplayCandidate(item, score) {
  const data = item?.data || {};
  const capacity = parseCapacity(data);
  const tags = Array.isArray(data.houseTags)
    ? data.houseTags
        .map((tag) => tag?.text || tag?.tagText?.text || "")
        .filter(Boolean)
        .slice(0, 3)
    : [];

  return {
    houseId: data.houseId,
    houseName: data.houseName || "",
    location: data.location || "",
    imageUrl: data.image?.url || "",
    discoveryContentType: item?.discoveryContentType || 0,
    finalPrice: Number(data.finalPrice || 0),
    productPrice: Number(data.productPrice || 0),
    capacity,
    summaryText: data.summaryText || "",
    priceTipBadgeText: data.priceTipBadge?.text || "",
    tags,
    score
  };
}

function dedupeByHouseId(items) {
  const map = new Map();
  for (const item of items) {
    const houseId = String(item?.data?.houseId || "");
    if (!houseId) continue;
    if (!map.has(houseId)) map.set(houseId, item);
  }
  return Array.from(map.values());
}

async function ensureStayPool(fetchPages = DEFAULT_FETCH_PAGES) {
  const cacheValid = stayPoolCache.items.length > 0 && stayPoolCache.expireAt > now();
  if (cacheValid) return stayPoolCache.items;

  const requests = [];
  for (let page = 1; page <= fetchPages; page++) {
    requests.push(getHomeHouselist(page));
  }

  const settled = await Promise.allSettled(requests);
  const merged = settled
    .filter((res) => res.status === "fulfilled")
    .flatMap((res) => res.value?.data || [])
    .filter((item) => item?.data?.houseId);

  const deduped = dedupeByHouseId(merged);
  stayPoolCache.items = deduped;
  stayPoolCache.expireAt = now() + CACHE_TTL;
  return deduped;
}

function filterWithRelaxLevel(pool, constraints, level = 0) {
  // level 0: strict
  // level 1: relax guests
  // level 2: relax budget + guests
  // level 3: relax city + budget + guests
  return pool.filter((item) => {
    const data = item?.data;
    if (!data) return false;

    const searchText = buildHouseSearchText(data);
    const price = Number(data?.finalPrice || 0);
    const capacity = parseCapacity(data);

    const cityOk = level >= 3 ? true : cityMatched(constraints, data, searchText);
    const budgetOk = level >= 2 ? true : budgetMatched(constraints, price);
    const guestsOk = level >= 1 ? true : guestsMatched(constraints, capacity);

    const keywords = constraints.keywords || [];
    const kwOk =
      keywords.length === 0 ||
      keywords.some((kw) => searchText.includes(normalizeText(kw)));

    return cityOk && budgetOk && guestsOk && kwOk;
  });
}

function relaxLabel(level) {
  switch (level) {
    case 1:
      return "已放宽人数条件";
    case 2:
      return "已放宽人数和预算条件";
    case 3:
      return "已放宽城市、人数和预算条件";
    default:
      return "";
  }
}

export async function queryLocalStayRecommendations(query, options = {}) {
  const fetchPages = Number(options.fetchPages || DEFAULT_FETCH_PAGES);
  const limit = Number(options.limit || DEFAULT_LIMIT);
  const cityHint = String(options.cityHint || "");

  const constraints = extractConstraints(query, cityHint);
  const pool = await ensureStayPool(fetchPages);

  let matched = [];
  let relaxLevel = 0;

  for (let level = 0; level <= 3; level++) {
    const filtered = filterWithRelaxLevel(pool, constraints, level);
    if (filtered.length > 0) {
      matched = filtered;
      relaxLevel = level;
      break;
    }
  }

  const ranked = matched
    .map((item) => ({ item, score: scoreCandidate(item, constraints) }))
    .sort((a, b) => b.score - a.score || Number(a.item?.data?.finalPrice || 0) - Number(b.item?.data?.finalPrice || 0))
    .slice(0, limit)
    .map(({ item, score }) => toDisplayCandidate(item, score));

  return {
    constraints,
    totalPool: pool.length,
    matchedCount: matched.length,
    relaxLevel,
    relaxNote: relaxLabel(relaxLevel),
    candidates: ranked
  };
}
