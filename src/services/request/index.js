import axios from "axios";
import pinia from "@/stores";
import useMainStore from "@/stores/modules/main";
import useAuthStore from "@/stores/modules/auth";
import { BASE_URL, TIMEOUT } from "./config";

const RETRY_FLAG = "__retryAfterRefresh";

class ZCRequest {
  constructor(baseURL, timeout = 10000) {
    this.instance = axios.create({
      baseURL,
      timeout
    });

    this.mainStore = useMainStore(pinia);
    this.authStore = useAuthStore(pinia);

    this.installInterceptors();
  }

  installInterceptors() {
    this.instance.interceptors.request.use(
      async (config) => {
        this.mainStore.isLoading = true;

        const shouldAttachAuth = !config?.skipAuth;
        if (!shouldAttachAuth) {
          return config;
        }

        try {
          await this.authStore.refreshAccessToken();
        } catch {
          // 没有可用会话时允许继续发请求，由后续接口返回 401。
        }

        if (this.authStore.accessToken) {
          config.headers = config.headers || {};
          config.headers.Authorization = this.authStore.authHeader;
        }

        return config;
      },
      (error) => {
        this.mainStore.isLoading = false;
        return Promise.reject(error);
      }
    );

    this.instance.interceptors.response.use(
      (response) => {
        this.mainStore.isLoading = false;
        return response?.data;
      },
      async (error) => {
        this.mainStore.isLoading = false;

        const originalRequest = error?.config || {};
        const statusCode = Number(error?.response?.status || 0);
        const isUnauthorized = statusCode === 401;
        const skippedByCaller = Boolean(originalRequest?.skipAuth);
        const hasRetried = Boolean(originalRequest?.[RETRY_FLAG]);

        if (!isUnauthorized || skippedByCaller || hasRetried) {
          return Promise.reject(error);
        }

        originalRequest[RETRY_FLAG] = true;

        try {
          await this.authStore.refreshAccessToken({ force: true });

          originalRequest.headers = originalRequest.headers || {};
          originalRequest.headers.Authorization = this.authStore.authHeader;

          return await this.instance.request(originalRequest);
        } catch (refreshError) {
          this.authStore.logout();
          return Promise.reject(refreshError);
        }
      }
    );
  }

  request(config) {
    return this.instance.request(config);
  }

  get(config) {
    return this.request({ ...config, method: "get" });
  }

  post(config) {
    return this.request({ ...config, method: "post" });
  }
}

export default new ZCRequest(BASE_URL, TIMEOUT);
