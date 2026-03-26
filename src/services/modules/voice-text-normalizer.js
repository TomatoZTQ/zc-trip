const VOICE_PHRASE_REPLACEMENTS = [
  [/\u6c11\u6570/gu, "\u6c11\u5bbf"],
  [/\u5b9a\u623f/gu, "\u8ba2\u623f"],
  [/\u4e5d\u5e97|\u9152\u70b9/gu, "\u9152\u5e97"],
  [/\u666f\u7535/gu, "\u666f\u70b9"],
  [/\u653b\u7565\u7565/gu, "\u653b\u7565"],
  [/\u5fc3\u7075\u6821\u533a|\u4ed9\u7075\u6821\u533a/gu, "\u4ed9\u6797\u6821\u533a"],
  [/\u5357\u90ae/gu, "\u5357\u4eac\u90ae\u7535\u5927\u5b66"]
];

const COLLAPSE_SPACES_RE = /[ \t]{2,}/g;
const COLLAPSE_BREAKS_RE = /\n{3,}/g;
const COLLAPSE_PUNCTUATION_RE = /([\uFF0C\u3002\uFF01\uFF1F,.!?])\1+/g;
const TRAILING_FILLER_RE = /(?:\u554a|\u5440|\u5443|\u989d|\u55ef)+$/u;
const LEADING_FILLER_RE = /^(?:(?:\u55ef+|\u554a+|\u989d+|\u5443+|\u90a3\u4e2a|\u5c31\u662f|\u7136\u540e)[\uFF0C, ]*)+/u;

function applyReplacementRules(text) {
  let normalized = text;
  VOICE_PHRASE_REPLACEMENTS.forEach(([pattern, replacement]) => {
    normalized = normalized.replace(pattern, replacement);
  });
  return normalized;
}

export function normalizeVoiceText(text) {
  let normalized = String(text || "");
  normalized = applyReplacementRules(normalized);

  return normalized
    .replace(LEADING_FILLER_RE, "")
    .replace(TRAILING_FILLER_RE, "")
    .replace(COLLAPSE_SPACES_RE, " ")
    .replace(COLLAPSE_BREAKS_RE, "\n\n")
    .replace(COLLAPSE_PUNCTUATION_RE, "$1")
    .trim();
}

export function mergeVoiceTextWithOverlap(baseText, appendText, maxOverlap = 14) {
  const base = String(baseText || "");
  const extra = String(appendText || "");
  if (!base) return extra;
  if (!extra) return base;

  const limit = Math.min(maxOverlap, base.length, extra.length);
  for (let size = limit; size >= 1; size--) {
    if (base.slice(-size) === extra.slice(0, size)) {
      return `${base}${extra.slice(size)}`;
    }
  }

  return `${base}${extra}`;
}
