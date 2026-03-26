const MOCK_USER_NAME = "tomato";
const MOCK_PASSWORD = "123456";

const ACCESS_TOKEN_TTL_MS = 10 * 60 * 1000;
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function wait(ms = 350) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function normalizeUserName(value) {
  return String(value || "").trim().toLowerCase();
}

function createToken(prefix) {
  const now = Date.now();
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${now}_${rand}`;
}

function validateLoginPayload(payload = {}) {
  const userName = normalizeUserName(payload.userName);
  const password = String(payload.password || "");

  if (!userName) {
    throw new Error("请输入账号。");
  }

  if (!password) {
    throw new Error("请输入密码。");
  }

  if (password.length < 6) {
    throw new Error("密码长度至少 6 位。");
  }

  if (userName !== MOCK_USER_NAME || password !== MOCK_PASSWORD) {
    throw new Error("账号或密码错误，请输入 tomato / 123456。");
  }

  return {
    userName,
    password
  };
}

function buildSession(userName) {
  const now = Date.now();
  const accessTokenExpiresAt = now + ACCESS_TOKEN_TTL_MS;
  const refreshTokenExpiresAt = now + REFRESH_TOKEN_TTL_MS;
  const accessToken = createToken("at");
  const refreshToken = createToken("rt");

  return {
    accessToken,
    refreshToken,
    accessTokenExpiresAt,
    refreshTokenExpiresAt,
    tokenType: "Bearer",
    user: {
      id: userName,
      userName,
      nickName: userName
    }
  };
}

export function getMockAuthConfig() {
  return {
    accessTokenTtlMs: ACCESS_TOKEN_TTL_MS,
    refreshTokenTtlMs: REFRESH_TOKEN_TTL_MS,
    testUserName: MOCK_USER_NAME,
    testPassword: MOCK_PASSWORD
  };
}

export async function loginWithPassword(payload = {}) {
  const { userName } = validateLoginPayload(payload);
  await wait();
  return buildSession(userName);
}

export async function refreshAccessToken(payload = {}) {
  const refreshToken = String(payload.refreshToken || "").trim();
  const refreshTokenExpiresAt = Number(payload.refreshTokenExpiresAt || 0);
  const userName = normalizeUserName(payload.userName);

  if (!refreshToken || !refreshToken.startsWith("rt_")) {
    throw new Error("无效的刷新令牌，请重新登录。");
  }

  if (!userName) {
    throw new Error("缺少用户信息，请重新登录。");
  }

  if (!refreshTokenExpiresAt || Date.now() >= refreshTokenExpiresAt) {
    throw new Error("刷新令牌已过期，请重新登录。");
  }

  await wait(260);

  return {
    accessToken: createToken("at"),
    accessTokenExpiresAt: Date.now() + ACCESS_TOKEN_TTL_MS,
    tokenType: "Bearer"
  };
}
