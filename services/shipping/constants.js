'use strict'

/**
 * 快递公司字典常量
 *
 * 从 ShippingTrackService 中提取，解决循环依赖问题
 * （providers 需要引用 SHIPPING_COMPANIES，而 ShippingTrackService 又引用 providers）
 */

/** 常用快递公司字典（快递100代码 / 快递鸟代码 双映射） */
const SHIPPING_COMPANIES = [
  { code: 'sf', name: '顺丰速运', kuaidi100: 'shunfeng', kdniao: 'SF' },
  { code: 'yt', name: '圆通速递', kuaidi100: 'yuantong', kdniao: 'YTO' },
  { code: 'zt', name: '中通快递', kuaidi100: 'zhongtong', kdniao: 'ZTO' },
  { code: 'sto', name: '申通快递', kuaidi100: 'shentong', kdniao: 'STO' },
  { code: 'yd', name: '韵达快递', kuaidi100: 'yunda', kdniao: 'YD' },
  { code: 'jd', name: '京东物流', kuaidi100: 'jd', kdniao: 'JD' },
  { code: 'ems', name: 'EMS', kuaidi100: 'ems', kdniao: 'EMS' },
  { code: 'dbkd', name: '德邦快递', kuaidi100: 'debangkuaidi', kdniao: 'DBL' },
  { code: 'yzbk', name: '邮政包裹', kuaidi100: 'youzhengguonei', kdniao: 'YZPY' }
]

module.exports = { SHIPPING_COMPANIES }
