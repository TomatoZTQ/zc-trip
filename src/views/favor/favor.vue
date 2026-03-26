<template>
  <div class="favor">
    <van-nav-bar title="我的收藏">
      <template #right>
        <div class="right-actions">
          <span class="clear" v-if="favorCount > 0" @click="clearAll">清空</span>
          <span class="logout" @click="logout">退出</span>
        </div>
      </template>
    </van-nav-bar>

    <div class="summary" v-if="favorCount > 0">
      共收藏 {{ favorCount }} 套房源
    </div>

    <div class="list" v-if="favorCount > 0">
      <template v-for="item in favorList" :key="item.houseId">
        <house-item-v9
          v-if="item.cardType === 'v9'"
          :item-data="item.itemData"
          @click="toDetail(item.houseId)"
        />
        <house-item-v3
          v-else
          :item-data="item.itemData"
          @click="toDetail(item.houseId)"
        />
      </template>
    </div>

    <div class="empty" v-else>
      <img class="empty-img" src="@/assets/img/favor/empty_favorite.44731802.png" alt="empty" />
      <div class="empty-text">你还没有收藏房源</div>
      <van-button type="warning" round @click="goHome">去首页逛逛</van-button>
    </div>
  </div>
</template>

<script setup>
import useFavorStore from "@/stores/modules/favor";
import { storeToRefs } from "pinia";
import { useRouter } from "vue-router";
import houseItemV9 from "@/components/house-item-v9-lazy.vue";
import houseItemV3 from "@/components/house-item-v3-lazy.vue";
import useAuthStore from "@/stores/modules/auth";

const router = useRouter();
const favorStore = useFavorStore();
const authStore = useAuthStore();
const { favorList, favorCount } = storeToRefs(favorStore);

const toDetail = (houseId) => {
  if (!houseId) return;
  router.push(`/detail/${houseId}`);
};

const clearAll = () => {
  if (!window.confirm("确认清空收藏吗？")) return;
  favorStore.clearFavor();
};

const logout = () => {
  if (!window.confirm("确认退出登录吗？")) return;
  authStore.logout();
  router.replace("/home");
};

const goHome = () => {
  router.push("/home");
};
</script>

<style lang="less" scoped>
.favor {
  height: calc(100vh - 56px);
  background: #f7f8fa;
  box-sizing: border-box;
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
}

.summary {
  padding: 10px 12px;
  font-size: 12px;
  color: #7f8896;
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
  display: flex;
  flex-wrap: wrap;
  padding: 0 8px calc(12px + env(safe-area-inset-bottom));
}

.empty {
  height: calc(100vh - 120px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;

  .empty-img {
    width: 96px;
    margin-bottom: 12px;
  }

  .empty-text {
    margin-bottom: 14px;
    color: #7f8896;
  }
}
</style>
