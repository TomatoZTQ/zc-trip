<template>
  <div class="categories-wrap">
    <div class="head">
      <div class="title">热门分类</div>
      <div class="subtitle">按主题快速找房</div>
    </div>

    <div class="categories">
      <div
        class="item"
        :class="{ active: activeIndex === index }"
        v-for="(item, index) in categories"
        :key="item.id"
        @click="selectCategory(index, item)"
      >
        <img :src="item.pictureUrl" :alt="item.title" />
        <div class="text">{{ item.title }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import useHomeStore from "@/stores/modules/home";
import { storeToRefs } from "pinia";
import { ref, watch } from "vue";

const props = defineProps({
  selectedId: {
    type: String,
    default: ""
  }
});

const emit = defineEmits(["change"]);
const homeStore = useHomeStore();
const { categories } = storeToRefs(homeStore);

const activeIndex = ref(-1);

watch(
  () => [props.selectedId, categories.value.length],
  () => {
    if (!props.selectedId) {
      activeIndex.value = -1;
      return;
    }

    const index = categories.value.findIndex((item) => item.id === props.selectedId);
    activeIndex.value = index;
  },
  { immediate: true }
);

const selectCategory = (index, item) => {
  if (activeIndex.value === index) {
    activeIndex.value = -1;
    emit("change", null);
    return;
  }

  activeIndex.value = index;
  emit("change", item);
};
</script>

<style lang="less" scoped>
.categories-wrap {
  margin: 12px 0 4px;

  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 10px 8px;

    .title {
      font-size: 16px;
      font-weight: 700;
      color: #1f2a38;
    }

    .subtitle {
      font-size: 12px;
      color: #8c96a3;
    }
  }
}

.categories {
  display: flex;
  overflow-x: auto;
  gap: 8px;
  padding: 0 8px 6px;

  &::-webkit-scrollbar {
    display: none;
  }

  .item {
    width: 72px;
    height: 76px;
    flex-shrink: 0;
    display: flex;
    justify-content: center;
    align-items: center;
    flex-direction: column;
    border-radius: 12px;
    background: #f5f7fb;
    transition: all 0.2s ease;

    img {
      width: 30px;
      height: 30px;
    }

    .text {
      margin-top: 7px;
      font-size: 12px;
      color: #2f3a49;
    }

    &.active {
      background: linear-gradient(180deg, #fff4ea 0%, #ffe7d2 100%);
      box-shadow: 0 4px 10px rgba(250, 140, 29, 0.25);
      transform: translateY(-1px);

      .text {
        color: #c86912;
        font-weight: 600;
      }
    }
  }
}
</style>
