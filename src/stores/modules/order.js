import { defineStore } from "pinia";

const STORAGE_KEY = "zc_trip_order_list";

function readOrderList() {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function writeOrderList(list) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

const useOrderStore = defineStore("order", {
  state: () => ({
    orderList: readOrderList()
  }),
  getters: {
    upcomingList(state) {
      return state.orderList.filter((item) => item.status === "upcoming");
    },
    finishedList(state) {
      return state.orderList.filter((item) => item.status === "finished");
    },
    canceledList(state) {
      return state.orderList.filter((item) => item.status === "canceled");
    }
  },
  actions: {
    createOrder(payload) {
      const order = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        status: "upcoming",
        createdAt: Date.now(),
        ...payload
      };

      this.orderList.unshift(order);
      writeOrderList(this.orderList);
      return order;
    },
    updateOrderStatus(orderId, status) {
      const target = this.orderList.find((item) => item.id === orderId);
      if (!target) return;
      target.status = status;
      writeOrderList(this.orderList);
    },
    removeOrder(orderId) {
      this.orderList = this.orderList.filter((item) => item.id !== orderId);
      writeOrderList(this.orderList);
    },
    clearOrders() {
      this.orderList = [];
      writeOrderList(this.orderList);
    }
  }
});

export default useOrderStore;
