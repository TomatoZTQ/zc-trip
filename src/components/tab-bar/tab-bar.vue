<template>
  <div class="tab-bar">
    <van-tabbar v-model="currentIndex" active-color="#ff7b1a" inactive-color="#7b8694">
      <template v-for="(item, index) in tabbarData" :key="item.path">
        <van-tabbar-item :to="item.path" :badge="item.badge">
          <span class="label">{{ item.text }}</span>
          <template #icon>
            <div class="icon-wrap" :class="{ active: currentIndex === index }">
              <img v-if="currentIndex !== index" :src="getAssetURL(item.image)" :alt="item.text" />
              <img v-else :src="getAssetURL(item.imageActive)" :alt="item.text" />
            </div>
          </template>
        </van-tabbar-item>
      </template>
    </van-tabbar>
  </div>
</template>

<script setup>
import tabbarData from "@/assets/data/tabbar.js";
import { getAssetURL } from "@/utils/load_assets.js";
import { ref, watch } from "vue";
import { useRoute } from "vue-router";

const route = useRoute();
const currentIndex = ref(0);

watch(
  () => route.path,
  (newPath) => {
    const index = tabbarData.findIndex((item) => item.path === newPath);
    if (index !== -1) currentIndex.value = index;
  },
  { immediate: true }
);
</script>

<style lang="less" scoped>
.tab-bar {
  :deep(.van-tabbar) {
    height: 56px;
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 1000;
    background: #fff;
    box-shadow: 0 -8px 24px rgba(20, 30, 40, 0.08);
    border-top: 1px solid #eef0f3;
  }

  :deep(.van-tabbar-item__icon) {
    margin-bottom: 2px;
  }

  :deep(.van-badge__wrapper) {
    overflow: visible;
  }

  :deep(.van-badge) {
    transform: scale(0.85);
  }

  .icon-wrap {
    transition: transform 0.2s ease;

    img {
      height: 26px;
      width: 26px;
      object-fit: contain;
    }

    &.active {
      transform: translateY(-1px) scale(1.03);
    }
  }

  .label {
    font-size: 12px;
  }
}
</style>
