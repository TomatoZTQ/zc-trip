import { createRouter, createWebHashHistory } from "vue-router"
import pinia from "@/stores";
import useAuthStore from "@/stores/modules/auth";

const PUBLIC_PATHS = new Set(["/login"]);

const router = createRouter({
  history: createWebHashHistory(),
  // 鏄犲皠鍏崇郴: path -> component
  routes: [
    {
      path: "/",
      redirect: "/home"
    },
    {
      path: "/home",
      // 鍔犺浇璇硶
      component: () => import("@/views/home/home.vue")
    },
    {
      path: "/favor",
      component: () => import("@/views/favor/favor.vue"),
      meta: {
        requiresAuth: true
      }
    },
    {
      path: "/message",
      component: () => import("@/views/message/message.vue"),
      meta: {
        requiresAuth: true
      }
    },
    {
      path: "/order",
      component: () => import("@/views/order/order.vue"),
      meta: {
        requiresAuth: true
      }
    },
    {
      path: "/city",
      component: () => import("@/views/city/city.vue"),
      meta: {
        // 涓鸿矾鐢辫褰曟坊鍔犺嚜瀹氫箟鐨勪俊鎭?
        hideTabBar: true
      }
    },
    {
      path: "/search",
      component: () => import("@/views/search/search.vue"),
      meta: {
        hideTabBar: true
      }
    },
    {
      path: "/detail/:id",
      component: () => import("@/views/detail/detail.vue"),
      meta: {
        hideTabBar: true
      }
    },
    {
      path: "/login",
      component: () => import("@/views/login/login.vue"),
      meta: {
        hideTabBar: true
      }
    }
  ]
})

router.beforeEach(async (to) => {
  const authStore = useAuthStore(pinia);
  const hasSession = await authStore.ensureSession();

  if (to.path === "/login" && hasSession) {
    return "/home";
  }

  if (!PUBLIC_PATHS.has(to.path) && !hasSession) {
    return {
      path: "/login",
      query: {
        redirect: to.fullPath
      }
    };
  }

  return true;
});

export default router
