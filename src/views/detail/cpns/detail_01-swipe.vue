<template>
  <div class="swipe">
    <van-swipe class="swipe-list" :autoplay="3000" indicator-color="white">
      <template v-for="(item, index) in swipeData">
        <van-swipe-item class="item">
          <img :src="item.url" alt="">
        </van-swipe-item>
      </template>
      <template #indicator="{ active, total }">
        <!-- <div class="indicator">{{ active }}/{{ swipeData.length }}</div> -->
        <div class="indicator">
          <template v-for="(value, key, index) in swipeGroup" :key="key">
            <span class="item" :class="{ active: swipeData[active]?.enumPictureCategory == key }">
              <span class="text">{{ getName(value[0].title) }}</span>
              <span class="count" v-if="swipeData[active]?.enumPictureCategory == key">
                {{ getCategoryIndex(swipeData[active]) + 1 }} / {{ value.length }}
              </span>
            </span>
          </template>
        </div>
      </template>
    </van-swipe>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  swipeData: {
    type: Array,
    default: () => []
  }
})

// 对数据进行转换 - 使用 computed 监听 swipeData 的变化
const swipeGroup = computed(() => {
  const group = {}
  // 确保 swipeData 是数组
  const data = props.swipeData || []
  for (const item of data) {
    let valueArray = group[item.enumPictureCategory]
    if (!valueArray) {
      valueArray = []
      group[item.enumPictureCategory] = valueArray
    }
    valueArray.push(item)
  }
  return group
})
console.log(swipeGroup.value)


// 定义转换数据的方法
const getName = (name) => {
  return name.replace("：", "").replace("【", "").replace("】", "")
}

const getCategoryIndex = (item) => {
  const valueArray = swipeGroup.value[item.enumPictureCategory]
  return valueArray.findIndex(data => data === item)
}
</script>

<!-- 添加作用域(当前) -->
<style lang="less" scoped>
.swipe {
  .swipe-list {
    .item {
      img {
        width: 100%;
      }
    }
    .indicator {
      position: absolute;
      right: 5px;
      bottom: 5px;
      display: flex;
      padding: 2px 5px;
      font-size: 12px;
      color: #fff;
      background: rgba(0, 0, 0, .8);

      .item {
        margin: 0 5px;

        &.active {
          padding: 0 3px;
          border-radius: 5px;
          background-color: #fff;
          color: #333;
        }
      }
    }
  }
}
</style>
