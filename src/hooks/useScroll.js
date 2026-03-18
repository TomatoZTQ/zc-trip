import { onMounted, onUnmounted } from "vue"
import { ref } from "vue"
import { throttle } from "underscore"

// export default function useScroll(reachBottomCB) {
//   // 监听window创建的滚动
//   // 1.当我们离开页面是，我们移除监听
//   // 2.如果别的页面也进行类似的监听，会编写重复代码
//   const scrollListenerHandler = () => {
//     const clientHeight = document.documentElement.clientHeight
//     const scrollTop = document.documentElement.scrollTop
//     const scrollHeight = document.documentElement.scrollHeight
//     if (clientHeight + scrollTop >= scrollHeight) {
//       if (reachBottomCB) reachBottomCB()
//     }
//   }

//   onMounted(() => {
//     window.addEventListener('scroll', scrollListenerHandler)
//   })

//   onUnmounted(() => {
//     window.removeEventListener('scroll', scrollListenerHandler)
//   })
// }
export default function useScroll() {
  const isReachBottom = ref(false)
  const scrollTop = ref(0)
  const scrollHeight = ref(0)
  const clientHeight = ref(0)

  const scrollListenerHandler = throttle(() => {
    clientHeight.value = document.documentElement.clientHeight
    scrollTop.value = document.documentElement.scrollTop
    scrollHeight.value = document.documentElement.scrollHeight
    console.log("监测到滚动~")
    if (clientHeight.value + scrollTop.value >= scrollHeight.value) {
      isReachBottom.value = true
    }
  }, 100)

  onMounted(() => {
    window.addEventListener("scroll", scrollListenerHandler)
  })

  onUnmounted(() => {
    window.removeEventListener("scroll", scrollListenerHandler)
  })
  return { isReachBottom, scrollTop, scrollHeight, clientHeight }
}
