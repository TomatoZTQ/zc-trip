<template>
  <div class="app">
    <!-- 显示当前路由对应的页面内容 -->
    <router-view />
    <tab-bar v-if="!hideTabBar" />
    <loading></loading>
  </div>
</template>

<script setup>
import tabBar from "./components/tab-bar/tab-bar.vue";
import { computed } from "vue";
import { useRoute } from "vue-router";
import Loading from "@/components/loading/loading.vue"
const route = useRoute();
const hideTabBar = computed(() => route.matched.some((record) => record.meta?.hideTabBar));
</script>
<style scoped>

</style>
