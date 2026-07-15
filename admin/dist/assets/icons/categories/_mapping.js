/**
 * 商品分类图标本地映射表
 *
 * 设计决策（2026-02-21 拍板，决策9）：
 * - 分类图标走前端静态映射（游戏公司模式），零网络请求
 * - 通过 category_code 直接映射本地文件
 * - 9 个分类图标（暗黑奢华风 256x256 PNG）
 *
 * 使用方式：
 *   import { CATEGORY_ICONS, getCategoryIconUrl } from '@/assets/icons/categories/_mapping.js'
 *   const iconUrl = getCategoryIconUrl(item.category_code)
 */

/** category_code → 本地图标路径映射 */
export const CATEGORY_ICONS = {
  electronics: '/assets/icons/categories/electronics.png',
  food_drink: '/assets/icons/categories/food-drink.png',
  voucher: '/assets/icons/categories/voucher.png',
  gift_card: '/assets/icons/categories/gift-card.png',
  home_life: '/assets/icons/categories/home-life.png',
  lifestyle: '/assets/icons/categories/lifestyle.png',
  food: '/assets/icons/categories/food.png',
  collectible: '/assets/icons/categories/collectible.png',
  other: '/assets/icons/categories/other.png'
}

/** 默认降级图标（未匹配时使用"其他"分类） */
const DEFAULT_ICON = '/assets/icons/categories/other.png'

/**
 * 根据 category_code 获取分类图标 URL
 * 优先本地映射，未匹配时返回默认图标
 *
 * @param {string} categoryCode - 分类代码（如 electronics、food_drink）
 * @returns {string} 图标路径
 */
export function getCategoryIconUrl(categoryCode) {
  return CATEGORY_ICONS[categoryCode] || DEFAULT_ICON
}
