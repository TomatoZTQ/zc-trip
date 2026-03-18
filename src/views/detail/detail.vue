<template>
  <div class="detail top-page">
    <van-nav-bar 
      title="房屋详情"
      left-text="旅途"
      left-arrow
      @click-left="onClickLeft"
    />
    <detail-swipe :swipe-data="mainPart?.topModule?.housePicture?.housePics"/>
    <detail-infos :top-infos="mainPart?.topModule"/>
    <detail-facility :house-facility="mainPart?.dynamicModule?.facilityModule?.houseFacility"/>
    <detail-landlord :landlord="mainPart?.dynamicModule?.landlordModule"/>
    <detail-comment :comment="mainPart?.dynamicModule?.commentModule"/>
  </div>
</template>

<script setup>
import { useRoute, useRouter } from 'vue-router'
import { getDetailInfos } from '@/services'
import { ref, computed } from 'vue'
import DetailSwipe from './cpns/detail_01-swipe.vue'
import DetailInfos from './cpns/detail_02-infos.vue'
import DetailFacility from './cpns/detail_03-facility.vue'
import DetailLandlord from './cpns/detail_04-landlord.vue'
import DetailComment from './cpns/detail_05-comment.vue'

const router = useRouter()
const route = useRoute()
const houseId = route.params.id

// 发送网络请求
const detailInfos = ref({})
const mainPart = computed(() => detailInfos?.value?.mainPart)
getDetailInfos(houseId).then(res => {
  detailInfos.value = res.data
})

// 监听返回按钮的点击
const onClickLeft = () => {
  router.back()
}
</script>

<!-- 添加作用域(当前) -->
<style lang="less" scoped>

</style>
