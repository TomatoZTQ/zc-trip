<template>
  <div class="order-page">
    <van-nav-bar title="我的订单">
      <template #right>
        <div class="right-actions">
          <span class="clear" v-if="orderCount > 0" @click="clearAll">清空</span>
          <span class="logout" @click="logout">退出</span>
        </div>
      </template>
    </van-nav-bar>

    <van-tabs v-model:active="activeTab" color="#ff9854" sticky>
      <van-tab title="待出行" name="upcoming" />
      <van-tab title="已完成" name="finished" />
      <van-tab title="已取消" name="canceled" />
    </van-tabs>

    <div class="list" v-if="currentList.length > 0">
      <div class="order-card" v-for="item in currentList" :key="item.id">
        <div class="header">
          <div class="city">{{ item.city || "未命名行程" }}</div>
          <van-tag :type="statusType(item.status)">{{ statusText(item.status) }}</van-tag>
        </div>

        <div class="date-row">
          <img src="@/assets/img/order/icon-time.png" alt="time" />
          <span>{{ formatDateRange(item) }}</span>
          <span class="nights">{{ item.nights || 1 }}晚</span>
        </div>

        <div class="meta">
          <span>价格: {{ item.priceLabel || "不限" }}</span>
          <span>人数: {{ item.guestsLabel || "不限" }}</span>
          <!-- <span>房源: {{ item.houseCount || 0 }}套</span> -->
        </div>

        <div class="keyword" v-if="item.keyword">关键词: {{ item.keyword }}</div>

        <div class="house-preview" v-if="item.selectedHouse" @click="toDetail(item.selectedHouse.houseId)">
          <img :src="item.selectedHouse.imageUrl" alt="house" loading="lazy" decoding="async" />
          <div class="house-info">
            <div class="name">{{ item.selectedHouse.houseName }}</div>
            <div class="price">¥{{ item.selectedHouse.finalPrice }}</div>
            <div class="location">{{ item.selectedHouse.location }}</div>
          </div>
        </div>

        <div class="actions">
          <template v-if="item.status === 'upcoming'">
            <!-- <van-button size="small" plain type="warning" @click="cancel(item.id)">取消</van-button> -->
            <van-button size="small" type="warning" @click="finish(item.id)">取消</van-button>
          </template>
          <template v-else>
            <van-button size="small" plain type="default" @click="remove(item.id)">删除</van-button>
          </template>
        </div>
      </div>
    </div>

    <div class="empty" v-else>
      <van-empty description="当前没有订单">
        <van-button type="warning" round @click="goHome">去搜索房源</van-button>
      </van-empty>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import useOrderStore from "@/stores/modules/order";
import useAuthStore from "@/stores/modules/auth";
import { storeToRefs } from "pinia";

const router = useRouter();
const orderStore = useOrderStore();
const authStore = useAuthStore();
const { upcomingList, finishedList, canceledList, orderList } = storeToRefs(orderStore);

const activeTab = ref("upcoming");

const orderCount = computed(() => orderList.value.length);
const currentList = computed(() => {
  if (activeTab.value === "finished") return finishedList.value;
  if (activeTab.value === "canceled") return canceledList.value;
  return upcomingList.value;
});

const formatDateRange = (order) => {
  const start = Number(order.startDate || 0);
  const end = Number(order.endDate || 0);
  if (!start || !end) return "日期未设置";

  const s = new Date(start);
  const e = new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return "日期未设置";

  return `${s.getMonth() + 1}/${s.getDate()} - ${e.getMonth() + 1}/${e.getDate()}`;
};

const statusText = (status) => {
  if (status === "finished") return "已完成";
  if (status === "canceled") return "已取消";
  return "待出行";
};

const statusType = (status) => {
  if (status === "finished") return "success";
  if (status === "canceled") return "default";
  return "warning";
};

const finish = (orderId) => {
  orderStore.updateOrderStatus(orderId, "finished");
};

const cancel = (orderId) => {
  orderStore.updateOrderStatus(orderId, "canceled");
};

const remove = (orderId) => {
  orderStore.removeOrder(orderId);
};

const clearAll = () => {
  if (!window.confirm("确认清空所有订单吗？")) return;
  orderStore.clearOrders();
};

const logout = () => {
  if (!window.confirm("确认退出登录吗？")) return;
  authStore.logout();
  router.replace("/home");
};

const toDetail = (houseId) => {
  if (!houseId) return;
  router.push(`/detail/${houseId}`);
};

const goHome = () => {
  router.push("/home");
};
</script>

<style lang="less" scoped>
.order-page {
  min-height: 100vh;
  width: 100%;
  padding-bottom: 70px;
  background: #f6f7f9;
  overflow-x: hidden;
  box-sizing: border-box;
}

.clear {
  font-size: 13px;
  color: #ff9645;
}

.right-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.logout {
  font-size: 13px;
  color: #7f8896;
}

.list {
  padding: 10px 10px 0;
  overflow-x: hidden;
}

.order-card {
  margin-bottom: 12px;
  border-radius: 12px;
  background: #fff;
  padding: 12px;

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;

    .city {
      font-size: 16px;
      font-weight: 700;
      color: #2d3540;
    }
  }

  .date-row {
    margin-top: 10px;
    display: flex;
    align-items: center;
    font-size: 13px;
    color: #586271;

    img {
      width: 14px;
      height: 14px;
      margin-right: 6px;
    }

    .nights {
      margin-left: 8px;
      color: #ff9854;
    }
  }

  .meta {
    margin-top: 8px;
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    color: #7f8896;
    font-size: 12px;
  }

  .keyword {
    margin-top: 8px;
    font-size: 12px;
    color: #7f8896;
    word-break: break-all;
  }

  .house-preview {
    margin-top: 10px;
    border: 1px solid #f0f2f5;
    border-radius: 8px;
    padding: 8px;
    display: flex;
    align-items: center;
    overflow: hidden;

    img {
      width: 68px;
      height: 68px;
      border-radius: 6px;
      object-fit: cover;
      flex-shrink: 0;
    }

    .house-info {
      margin: 0 8px;
      flex: 1;
      min-width: 0;

      .name {
        font-size: 13px;
        color: #2d3540;
        line-height: 1.35;
        white-space: normal;
        word-break: break-all;
        overflow: hidden;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
      }

      .price {
        margin-top: 4px;
        color: #ff9854;
        font-size: 15px;
        font-weight: 600;
      }

      .location {
        margin-top: 4px;
        font-size: 12px;
        color: #7f8896;
      }
    }

    .arrow {
      width: 16px;
      height: 16px;
      flex-shrink: 0;
    }
  }

  .actions {
    margin-top: 10px;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
}

.empty {
  padding-top: 80px;
}
</style>
