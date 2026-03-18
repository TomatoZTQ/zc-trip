import axios from "axios";

const AMAP_BASE_URL = "https://restapi.amap.com";

const CITY_NOISE_RE = /(?:\u73b0\u5728|\u4eca\u5929|\u660e\u5929|\u540e\u5929|\u6700\u8fd1|\u5b9e\u65f6|\u5f53\u524d|\u5929\u6c14|\u6c14\u6e29|\u6e29\u5ea6|\u964d\u96e8|\u4e0b\u96e8|\u98ce\u529b|\u6e7f\u5ea6|\u4f53\u611f|\u600e\u4e48\u6837|\u600e\u4e48|\u54b3\u6837|\u5982\u4f55|\u60c5\u51b5|\u9884\u62a5|\u67e5\u8be2|\u67e5\u4e00\u4e0b|\u67e5\u4e0b|\u8bf7\u95ee|\u5e2e\u6211|\u544a\u8bc9\u6211|\u4e00\u4e0b)/gu;

function getAmapKey() {
  return import.meta.env.VITE_AMAP_KEY || "";
}

function ensureAmapKey() {
  const key = getAmapKey();
  if (!key) {
    throw new Error("Missing VITE_AMAP_KEY. Please set it in .env.local.");
  }
  return key;
}

function normalizeCityInput(cityName) {
  return String(cityName || "")
    .trim()
    .replace(/[\s,，。！？!?]/g, "")
    .replace(/(?:\u7279\u522b\u884c\u653f\u533a|\u5e02\u8f96\u533a)$/u, "")
    .replace(/(?:\u7701|\u5e02|\u533a|\u53bf)$/u, "");
}

function buildCityCandidates(cityName) {
  const base = normalizeCityInput(cityName);
  if (!base) return [];

  const stripped = base.replace(CITY_NOISE_RE, "");
  const candidates = [base, stripped].filter(Boolean);

  if (stripped.length > 3) {
    candidates.push(stripped.slice(0, 3));
  }
  if (stripped.length > 2) {
    candidates.push(stripped.slice(0, 2));
  }

  return Array.from(new Set(candidates.filter(Boolean)));
}

async function queryAdcodeByKeyword(keyword, key) {
  if (!keyword) return null;

  const res = await axios.get(`${AMAP_BASE_URL}/v3/config/district`, {
    params: {
      key,
      keywords: keyword,
      subdistrict: 0,
      page: 1,
      extensions: "base"
    }
  });

  const districts = res?.data?.districts;
  if (!Array.isArray(districts) || districts.length === 0) return null;

  const exact = districts.find((item) => String(item?.name || "").includes(keyword));
  const target = exact || districts[0];
  if (!target?.adcode) return null;

  return {
    adcode: target.adcode,
    name: target.name || keyword
  };
}

async function queryCityAdcode(cityName, key) {
  const normalized = normalizeCityInput(cityName);
  if (!normalized) throw new Error("City name is required.");

  if (/^\d{6}$/.test(normalized)) {
    return { adcode: normalized, name: normalized };
  }

  const candidates = buildCityCandidates(cityName);
  for (const keyword of candidates) {
    const result = await queryAdcodeByKeyword(keyword, key);
    if (result) return result;
  }

  throw new Error(`City not found: ${cityName}`);
}

export async function queryCityLiveWeather(cityName) {
  const key = ensureAmapKey();
  const { adcode, name } = await queryCityAdcode(cityName, key);

  const res = await axios.get(`${AMAP_BASE_URL}/v3/weather/weatherInfo`, {
    params: {
      key,
      city: adcode,
      extensions: "base"
    }
  });

  const live = res?.data?.lives?.[0];
  if (!live) {
    throw new Error(`Weather not found for city: ${cityName}`);
  }

  return {
    city: live.city || name,
    province: live.province || "",
    adcode: live.adcode || adcode,
    weather: live.weather || "",
    temperature: live.temperature || "",
    humidity: String(live.humidity || "").replace("%", ""),
    winddirection: live.winddirection || "",
    windpower: String(live.windpower || "").replace(/[^\d]/g, "") || String(live.windpower || ""),
    reporttime: live.reporttime || ""
  };
}