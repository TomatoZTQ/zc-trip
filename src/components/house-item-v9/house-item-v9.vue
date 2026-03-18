<template>
  <div class="house-item">
    <div class="item-inner">
      <div class="favor-btn" @click.stop="toggleFavor">
        <van-icon :name="isFavor ? 'like' : 'like-o'" />
      </div>
      <div class="order-btn" v-if="showOrderBtn" @click.stop="orderClick">下单</div>
      <div class="cover">
        <img :src="itemData.image.url" alt="">
      </div>
      <div class="info">
        <div class="summary">{{ itemData.summaryText }}</div>
        <div class="name">{{ itemData.houseName }}</div>
        <div class="price">
          <van-rate :model-value="itemScore" color="#fff" :size="15" readonly allow-half />
          <div class="new">{{ itemData.finalPrice }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import useFavorStore from "@/stores/modules/favor";
  const props = defineProps({
    itemData: {
      type: Object,
      default: () => ({}),
    },
    showOrderBtn: {
      type: Boolean,
      default: false
    }
  })
  const emit = defineEmits(["order"]);

  const itemScore = computed(() => {
    return Number(props.itemData.commentScore)
  })

  const favorStore = useFavorStore();
  const isFavor = computed(() => favorStore.isFavor(props.itemData.houseId));
  const toggleFavor = () => {
    favorStore.toggleFavor(props.itemData, "v9");
  };
  const orderClick = () => {
    emit("order", props.itemData);
  };
</script>

<!-- 添加作用域(当前) -->
<style lang="less" scoped>
  .house-item {
    width: 50%;

    .item-inner {
        margin: 5px;
        background: #fff;
        border-radius: 6px;
        overflow: hidden;
        position: relative;

      .favor-btn {
        position: absolute;
        top: 8px;
        right: 8px;
        z-index: 2;
        width: 26px;
        height: 26px;
        border-radius: 50%;
        display: flex;
        justify-content: center;
        align-items: center;
        color: #ff5b64;
        font-size: 16px;
        background: rgba(255, 255, 255, .92);
      }

      .order-btn {
        position: absolute;
        top: 8px;
        left: 8px;
        z-index: 2;
        padding: 2px 8px;
        border-radius: 12px;
        font-size: 12px;
        color: #fff;
        background: rgba(255, 152, 84, .95);
      }

      .cover {
        img {
          width: 100%;
        }
      }

      .info {
        position: absolute;
        bottom: 0;
        padding: 8px 10px;
        color: #fff;

        .summary {
          font-size: 12px;
        }

        .name {
          margin: 5px 0;
          // 只显示两行文字，超出部分会自动显示为省略号
          overflow: hidden;
          text-overflow: ellipsis;
          display: -webkit-box;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
        }

        .price {
          display: flex;
          justify-content: space-between;
          margin-top: 10px;
        }
      }
    }
  }
</style>
