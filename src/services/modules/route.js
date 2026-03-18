import axios from "axios";

const AMAP_BASE_URL = "https://restapi.amap.com";
const MAX_TRANSIT_SEGMENTS = 12;
const MAX_ROUTE_STEPS = 16;
const MAX_WALKING_STEPS_PER_SEGMENT = 4;

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

function normalizeCityText(city, province = "") {
  if (Array.isArray(city)) return city[0] || province || "";
  return String(city || province || "");
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function stripHtmlTags(text) {
  return String(text || "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatDistance(meters) {
  const value = toNumber(meters);
  if (value >= 1000) return `${(value / 1000).toFixed(1)}km`;
  return `${Math.round(value)}m`;
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.round(toNumber(seconds)));
  const hour = Math.floor(total / 3600);
  const minute = Math.round((total % 3600) / 60);

  if (hour > 0) return `${hour}h${minute}m`;
  return `${Math.max(1, minute)}m`;
}

function parseWalkingSteps(steps = [], maxSteps = MAX_ROUTE_STEPS) {
  if (!Array.isArray(steps)) return [];
  return steps
    .slice(0, maxSteps)
    .map((item, index) => {
      const distanceM = toNumber(item?.distance);
      const durationSec = toNumber(item?.duration);
      return {
        index: index + 1,
        instruction: stripHtmlTags(item?.instruction),
        road: stripHtmlTags(item?.road),
        distanceM,
        durationSec,
        distanceText: formatDistance(distanceM),
        durationText: formatDuration(durationSec),
        action: stripHtmlTags(item?.action),
        assistantAction: stripHtmlTags(item?.assistant_action)
      };
    })
    .filter((item) => item.instruction);
}

function parseTransitBusLines(segment) {
  const lines = segment?.bus?.buslines;
  if (!Array.isArray(lines)) return [];

  return lines
    .map((line) => {
      const distanceM = toNumber(line?.distance);
      const durationSec = toNumber(line?.duration);
      const viaNum = toNumber(line?.via_num);
      return {
        name: stripHtmlTags(line?.name),
        id: stripHtmlTags(line?.id),
        type: stripHtmlTags(line?.type),
        departureStop: stripHtmlTags(line?.departure_stop?.name),
        arrivalStop: stripHtmlTags(line?.arrival_stop?.name),
        viaNum,
        distanceM,
        durationSec,
        distanceText: formatDistance(distanceM),
        durationText: formatDuration(durationSec)
      };
    })
    .filter((line) => line.name);
}

function parseTransitRailway(segment) {
  const railway = segment?.railway;
  if (!railway || typeof railway !== "object") return null;

  const distanceM = toNumber(railway.distance);
  const timeSec = toNumber(railway.time);
  return {
    id: stripHtmlTags(railway.id),
    name: stripHtmlTags(railway.name),
    trip: stripHtmlTags(railway.trip),
    departureStop: stripHtmlTags(railway.departure_stop?.name),
    arrivalStop: stripHtmlTags(railway.arrival_stop?.name),
    distanceM,
    distanceText: formatDistance(distanceM),
    durationSec: timeSec,
    durationText: formatDuration(timeSec)
  };
}

function parseTransitTaxi(segment) {
  const taxi = segment?.taxi;
  if (!taxi || typeof taxi !== "object") return null;

  const distanceM = toNumber(taxi.distance);
  const durationSec = toNumber(taxi.duration);
  const cost = taxi.cost === "" ? null : Number(taxi.cost);
  return {
    distanceM,
    durationSec,
    cost: Number.isFinite(cost) ? cost : null,
    distanceText: formatDistance(distanceM),
    durationText: formatDuration(durationSec)
  };
}

function buildTransitSegmentInstruction(segment) {
  const parts = [];

  if (segment.walkingDistanceM > 0) {
    parts.push(`步行${segment.walkingDistanceText}`);
  }

  if (segment.busLines.length > 0) {
    const busText = segment.busLines
      .map((line) => {
        const viaText = line.viaNum > 0 ? `${line.viaNum}站` : "";
        const stopText =
          line.departureStop || line.arrivalStop
            ? `，${line.departureStop || "起点"}上车${
                line.arrivalStop ? `，${line.arrivalStop}下车` : ""
              }`
            : "";
        return `乘坐${line.name}${viaText ? `(${viaText})` : ""}${stopText}`;
      })
      .join("；");
    parts.push(busText);
  }

  if (segment.railway) {
    const r = segment.railway;
    const railwayText = `铁路${r.trip || r.name || ""}${
      r.departureStop ? `，${r.departureStop}上车` : ""
    }${r.arrivalStop ? `，${r.arrivalStop}下车` : ""}`;
    parts.push(railwayText.trim());
  }

  if (segment.taxi) {
    parts.push(`打车${segment.taxi.distanceText}`);
  }

  if (parts.length === 0 && segment.walkingSteps.length > 0) {
    parts.push(segment.walkingSteps[0].instruction);
  }

  return parts.join(" -> ");
}

function parseTransitSegments(segments = []) {
  if (!Array.isArray(segments)) return [];

  return segments.slice(0, MAX_TRANSIT_SEGMENTS).map((segment, index) => {
    const walkingDistanceM = toNumber(segment?.walking?.distance);
    const walkingDurationSec = toNumber(segment?.walking?.duration);
    const walkingSteps = parseWalkingSteps(
      segment?.walking?.steps,
      MAX_WALKING_STEPS_PER_SEGMENT
    );
    const busLines = parseTransitBusLines(segment);
    const railway = parseTransitRailway(segment);
    const taxi = parseTransitTaxi(segment);

    const parsedSegment = {
      index: index + 1,
      walkingDistanceM,
      walkingDurationSec,
      walkingDistanceText: formatDistance(walkingDistanceM),
      walkingDurationText: formatDuration(walkingDurationSec),
      walkingSteps,
      busLines,
      railway,
      taxi,
      rideLegCount: busLines.length + (railway ? 1 : 0)
    };

    return {
      ...parsedSegment,
      instruction: buildTransitSegmentInstruction(parsedSegment)
    };
  });
}

function parseDrivingSteps(steps = []) {
  if (!Array.isArray(steps)) return [];
  return steps
    .slice(0, MAX_ROUTE_STEPS)
    .map((step, index) => {
      const distanceM = toNumber(step?.distance);
      const durationSec = toNumber(step?.duration);
      const tolls = step?.tolls === "" ? null : Number(step?.tolls);
      return {
        index: index + 1,
        instruction: stripHtmlTags(step?.instruction),
        road: stripHtmlTags(step?.road),
        orientation: stripHtmlTags(step?.orientation),
        action: stripHtmlTags(step?.action),
        assistantAction: stripHtmlTags(step?.assistant_action),
        distanceM,
        durationSec,
        tolls: Number.isFinite(tolls) ? tolls : null,
        distanceText: formatDistance(distanceM),
        durationText: formatDuration(durationSec)
      };
    })
    .filter((step) => step.instruction);
}

async function geocodeAddress(address, options = {}) {
  const key = ensureAmapKey();
  const city = String(options.city || "");
  const text = String(address || "").trim();
  if (!text) throw new Error("Address is required.");

  const res = await axios.get(`${AMAP_BASE_URL}/v3/geocode/geo`, {
    params: {
      key,
      address: text,
      ...(city ? { city } : {})
    }
  });

  const geocode = res?.data?.geocodes?.[0];
  if (!geocode?.location) {
    throw new Error(`Address not found: ${text}`);
  }

  const cityText = normalizeCityText(geocode.city, geocode.province);

  return {
    input: text,
    formattedAddress: geocode.formatted_address || text,
    location: geocode.location,
    city: cityText,
    province: geocode.province || "",
    district: geocode.district || "",
    adcode: geocode.adcode || ""
  };
}

async function queryTransitPlan(origin, destination, city, cityd) {
  const key = ensureAmapKey();
  if (!city) return null;

  const res = await axios.get(`${AMAP_BASE_URL}/v3/direction/transit/integrated`, {
    params: {
      key,
      origin,
      destination,
      city,
      ...(cityd ? { cityd } : {}),
      strategy: 0,
      nightflag: 0,
      extensions: "all"
    }
  });

  const transit = res?.data?.route?.transits?.[0];
  if (!transit) return null;

  const durationSec = toNumber(transit.duration);
  const distanceM = toNumber(transit.distance);
  const walkingDistanceM = toNumber(transit.walking_distance);
  const cost = transit.cost === "" ? null : Number(transit.cost);
  const segments = parseTransitSegments(transit.segments);
  const rideLegCount = segments.reduce((sum, item) => sum + item.rideLegCount, 0);

  return {
    durationSec,
    distanceM,
    walkingDistanceM,
    cost: Number.isFinite(cost) ? cost : null,
    transfers: Math.max(0, rideLegCount - 1),
    rideLegCount,
    segmentCount: segments.length,
    segments,
    durationText: formatDuration(durationSec),
    distanceText: formatDistance(distanceM),
    walkingDistanceText: formatDistance(walkingDistanceM)
  };
}

async function queryDrivingPlan(origin, destination) {
  const key = ensureAmapKey();
  const res = await axios.get(`${AMAP_BASE_URL}/v3/direction/driving`, {
    params: {
      key,
      origin,
      destination,
      strategy: 0,
      extensions: "all"
    }
  });

  const path = res?.data?.route?.paths?.[0];
  if (!path) return null;

  const durationSec = toNumber(path.duration);
  const distanceM = toNumber(path.distance);
  const tolls = path.tolls === "" ? null : Number(path.tolls);
  const steps = parseDrivingSteps(path.steps);

  return {
    durationSec,
    distanceM,
    tolls: Number.isFinite(tolls) ? tolls : null,
    trafficLights: toNumber(path.traffic_lights),
    tollDistanceM: toNumber(path.toll_distance),
    stepCount: steps.length,
    steps,
    durationText: formatDuration(durationSec),
    distanceText: formatDistance(distanceM)
  };
}

async function queryWalkingPlan(origin, destination) {
  const key = ensureAmapKey();
  const res = await axios.get(`${AMAP_BASE_URL}/v3/direction/walking`, {
    params: {
      key,
      origin,
      destination
    }
  });

  const path = res?.data?.route?.paths?.[0];
  if (!path) return null;

  const durationSec = toNumber(path.duration);
  const distanceM = toNumber(path.distance);
  const steps = parseWalkingSteps(path.steps);

  return {
    durationSec,
    distanceM,
    stepCount: steps.length,
    steps,
    durationText: formatDuration(durationSec),
    distanceText: formatDistance(distanceM)
  };
}

export async function queryRoutePlanByText(fromText, toText, options = {}) {
  const from = await geocodeAddress(fromText, { city: options.cityHint || "" });
  const to = await geocodeAddress(toText, { city: from.city || options.cityHint || "" });

  const city = from.city || "";
  const cityd = to.city || "";

  const [transitResult, drivingResult, walkingResult] = await Promise.allSettled([
    queryTransitPlan(from.location, to.location, city, cityd),
    queryDrivingPlan(from.location, to.location),
    queryWalkingPlan(from.location, to.location)
  ]);

  const transit = transitResult.status === "fulfilled" ? transitResult.value : null;
  const driving = drivingResult.status === "fulfilled" ? drivingResult.value : null;
  const walking = walkingResult.status === "fulfilled" ? walkingResult.value : null;

  if (!transit && !driving && !walking) {
    throw new Error("Route not found.");
  }

  return {
    from,
    to,
    transit,
    driving,
    walking
  };
}
