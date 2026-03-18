import { getHomeHotSuggests, getHomeCategories, getHomeHouselist } from '@/services';
import { defineStore } from 'pinia';

const useHomeStore = defineStore("home", {
  state: () => ({
    hotSuggests: [],
    categories: [],
    houselist: [],
    currentPage: 1
  }),
  actions: {
    async fetchHotSuggestData() {
      const res = await getHomeHotSuggests()
      this.hotSuggests = res.data
    },
    async fetchCategoriesData() {
      const res = await getHomeCategories()
      this.categories = res.data
    },
    async fetchHouselistData() {
      const res = await getHomeHouselist(this.currentPage++)
      this.houselist.push(...res.data)
      console.log(this.houselist)
    }
  }
})

export default useHomeStore
