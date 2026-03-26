import { defineStore } from "pinia";
import { loginWithPassword, refreshAccessToken } from "@/services/modules/auth";

const STORAGE_KEY = "zc_trip_auth_v2";
const REFRESH_AHEAD_MS = 20 * 1000;

let refreshingPromise = null;

function getDefaultState() {
  return {
    token: "",
    accessToken: "",
    refreshToken: "",
    tokenType: "Bearer",
    accessTokenExpiresAt: 0,
    refreshTokenExpiresAt: 0,
    user: null
  };
}

function readAuthState() {
  if (typeof window === "undefined") {
    return getDefaultState();
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultState();

    const parsed = JSON.parse(raw);
    const accessToken = String(parsed?.accessToken || parsed?.token || "");

    return {
      token: accessToken,
      accessToken,
      refreshToken: String(parsed?.refreshToken || ""),
      tokenType: String(parsed?.tokenType || "Bearer"),
      accessTokenExpiresAt: Number(parsed?.accessTokenExpiresAt || 0),
      refreshTokenExpiresAt: Number(parsed?.refreshTokenExpiresAt || 0),
      user: parsed?.user || null
    };
  } catch {
    return getDefaultState();
  }
}

function writeAuthState(state) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      token: state.accessToken || state.token || "",
      accessToken: state.accessToken || "",
      refreshToken: state.refreshToken || "",
      tokenType: state.tokenType || "Bearer",
      accessTokenExpiresAt: Number(state.accessTokenExpiresAt || 0),
      refreshTokenExpiresAt: Number(state.refreshTokenExpiresAt || 0),
      user: state.user || null
    })
  );
}

const useAuthStore = defineStore("auth", {
  state: () => readAuthState(),

  getters: {
    hasAccessToken(state) {
      return Boolean(state.accessToken);
    },

    isAccessTokenValid(state) {
      return Boolean(state.accessToken) && Date.now() < Number(state.accessTokenExpiresAt || 0);
    },

    isRefreshTokenValid(state) {
      return Boolean(state.refreshToken) && Date.now() < Number(state.refreshTokenExpiresAt || 0);
    },

    isLoggedIn() {
      return this.isAccessTokenValid || this.isRefreshTokenValid;
    },

    authHeader(state) {
      if (!state.accessToken) return "";
      return `${state.tokenType || "Bearer"} ${state.accessToken}`;
    },

    displayName(state) {
      return state.user?.nickName || state.user?.userName || "未登录用户";
    }
  },

  actions: {
    persist() {
      writeAuthState(this);
    },

    setSession(session = {}) {
      const accessToken = String(session.accessToken || session.token || "");
      this.token = accessToken;
      this.accessToken = accessToken;
      this.refreshToken = String(session.refreshToken || "");
      this.tokenType = String(session.tokenType || "Bearer");
      this.accessTokenExpiresAt = Number(session.accessTokenExpiresAt || 0);
      this.refreshTokenExpiresAt = Number(session.refreshTokenExpiresAt || 0);

      if (session.user) {
        this.user = session.user;
      }

      this.persist();
    },

    clearSession() {
      this.token = "";
      this.accessToken = "";
      this.refreshToken = "";
      this.tokenType = "Bearer";
      this.accessTokenExpiresAt = 0;
      this.refreshTokenExpiresAt = 0;
      this.user = null;
      this.persist();
    },

    async login(payload) {
      const result = await loginWithPassword(payload);
      this.setSession(result);
      return result;
    },

    async refreshAccessToken(options = {}) {
      const force = Boolean(options.force);
      const minTtlMs = Number(options.minTtlMs ?? REFRESH_AHEAD_MS);
      const expiresIn = Number(this.accessTokenExpiresAt || 0) - Date.now();

      if (!force && this.isAccessTokenValid && expiresIn > minTtlMs) {
        return this.accessToken;
      }

      if (!this.isRefreshTokenValid) {
        this.clearSession();
        throw new Error("登录状态已过期，请重新登录。");
      }

      if (refreshingPromise) {
        await refreshingPromise;
        if (!this.isAccessTokenValid) {
          throw new Error("刷新登录状态失败，请重新登录。");
        }
        return this.accessToken;
      }

      refreshingPromise = (async () => {
        try {
          const refreshed = await refreshAccessToken({
            refreshToken: this.refreshToken,
            refreshTokenExpiresAt: this.refreshTokenExpiresAt,
            userName: this.user?.userName || this.user?.id || ""
          });

          this.setSession({
            ...refreshed,
            refreshToken: this.refreshToken,
            refreshTokenExpiresAt: this.refreshTokenExpiresAt,
            user: this.user
          });
        } catch (error) {
          this.clearSession();
          throw error;
        } finally {
          refreshingPromise = null;
        }
      })();

      await refreshingPromise;
      return this.accessToken;
    },

    async ensureSession() {
      if (this.isAccessTokenValid) return true;
      if (!this.isRefreshTokenValid) return false;

      try {
        await this.refreshAccessToken({ force: true });
        return this.isAccessTokenValid;
      } catch {
        return false;
      }
    },

    logout() {
      this.clearSession();
    }
  }
});

export default useAuthStore;
