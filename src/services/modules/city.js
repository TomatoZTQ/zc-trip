// 会自动查找request里面的index.js文件
import ZCRequest from '../request'

export function getCityAll() {
  return ZCRequest.get({
    url: '/city/all'
  })
}
