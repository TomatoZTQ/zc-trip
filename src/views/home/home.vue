<template>
  <div class="home">
    <home-nav-bar></home-nav-bar>

    <div class="banner">
      <img src="@/assets/img/home/banner.webp" alt="" />
    </div>

    <home-search-box></home-search-box>
    <home-categories :selected-id="selectedCategoryId" @change="onCategoryChange" />

    <div class="search-bar" v-if="isShowSearchBar">
      <search-bar />
    </div>

    <home-content
      :category-title="selectedCategoryTitle"
      @clear-category="clearCategory"
    />
  </div>
</template>

<script setup>
import HomeNavBar from "./cpns/home-nav-bar.vue";
import HomeSearchBox from "./cpns/home-search-box.vue";
import useHomeStore from "@/stores/modules/home";
import homeCategories from "./cpns/home-categories.vue";
import homeContent from "./cpns/home-content.vue";
import HomeSearchBar from "@/components/search-bar/search-bar.vue";
import useScroll from "@/hooks/useScroll";
import { watch, ref, computed } from "vue";

const homeStore = useHomeStore();
homeStore.fetchHotSuggestData();
homeStore.fetchCategoriesData();
homeStore.fetchHouselistData();

const { isReachBottom, scrollTop } = useScroll();
watch(isReachBottom, (newValue) => {
  if (!newValue) return;

  homeStore.fetchHouselistData().then(() => {
    isReachBottom.value = false;
  });
});

const isShowSearchBar = computed(() => {
  return scrollTop.value > 350;
});

const selectedCategory = ref(null);
const selectedCategoryId = computed(() => selectedCategory.value?.id || "");
const selectedCategoryTitle = computed(() => selectedCategory.value?.title || "");

const onCategoryChange = (item) => {
  selectedCategory.value = item || null;
};

const clearCategory = () => {
  selectedCategory.value = null;
};
</script>

<style lang="less" scoped>
.home {
  padding-bottom: 60px;
}

.banner {
  img {
    width: 100%;
  }
}

.search-bar {
  position: fixed;
  z-index: 999;
  top: 0;
  left: 0;
  right: 0;
  height: 45px;
  padding: 16px 16px 10px;
  background-color: #fff;
}
</style>
