import ZCRequest from "../request/index"

export function getHomeHotSuggests() {
  return ZCRequest.get({
    url: "/home/hotSuggests"
  })
}

export function getHomeCategories() {
  return ZCRequest.get({
    url: "/home/categories"
  })
}

export function getHomeHouselist(currentPage) {
  return ZCRequest.get({
    url: "/home/houselist",
    params: {
      page: currentPage
    }
  })
}
