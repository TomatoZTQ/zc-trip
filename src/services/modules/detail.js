import ZCRequest from '../request/index';

export const getDetailInfos = (houseId) => {
  return ZCRequest.get({
    url: '/detail/infos',
    params: {
      houseId,
    }
  });
};
