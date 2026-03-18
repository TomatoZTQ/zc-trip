import { defineStore } from "pinia";

const STORAGE_KEY = "zc_trip_favor_list";

function readFavorList() {
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

function writeFavorList(list) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

const useFavorStore = defineStore("favor", {
  state: () => ({
    favorList: readFavorList()
  }),
  getters: {
    favorCount(state) {
      return state.favorList.length;
    }
  },
  actions: {
    isFavor(houseId) {
      return this.favorList.some((item) => String(item.houseId) === String(houseId));
    },
    toggleFavor(itemData, cardType = "v3") {
      const houseId = itemData?.houseId;
      if (!houseId) return false;

      const index = this.favorList.findIndex((item) => String(item.houseId) === String(houseId));
      if (index !== -1) {
        this.favorList.splice(index, 1);
        writeFavorList(this.favorList);
        return false;
      }

      this.favorList.unshift({
        houseId,
        cardType,
        itemData,
        savedAt: Date.now()
      });
      writeFavorList(this.favorList);
      return true;
    },
    removeFavor(houseId) {
      this.favorList = this.favorList.filter((item) => String(item.houseId) !== String(houseId));
      writeFavorList(this.favorList);
    },
    clearFavor() {
      this.favorList = [];
      writeFavorList(this.favorList);
    }
  }
});

export default useFavorStore;
