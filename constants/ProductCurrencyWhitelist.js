/**
 * 物品类型 × 可计价货币 白名单常量（竞价双层防护·硬约束层）
 *
 * 文件路径：constants/ProductCurrencyWhitelist.js
 *
 * 职责（路线B 合规改造 第八节·竞价双层防护 / 硬约束层）：
 * - 定义 item_templates.item_type 的三类语义：有价值实物侧 / 零价值虚拟道具侧。
 * - 定义「可竞价物品类型」白名单：仅纯虚拟道具（prop）可进入竞价，实物/券一律禁止。
 * - 与 services/shared/AssetProductGuard.js（运行时守卫层）配合：本常量管「铁律红线」，
 *   守卫管「会变的业务规则 + 兜底拦截」。
 *
 * 为什么要这层硬约束：
 * - 竞价标的若允许实物/券，碎片/星石会被反向锚定成"提货券/类货币"，射幸性与"以小博大"回归。
 * - 仅靠 AssetProductGuard.assertPriceAssetAllowed（星石不买有价值物）+ is_biddable 是「间接挡」，
 *   缺少"竞价标的必须是 prop"的正向断言。本常量补齐正向白名单。
 *
 * 命名规则：键 UPPER_SNAKE_CASE，值 lower_snake_case（与 constants/AssetCode.js 一致）。
 *
 * 创建时间：2026-06-08（路线B 合规改造 模块A）
 * 版本：V4.0.0
 */

'use strict'

/**
 * 物品类型枚举（对齐 item_templates.item_type，实测为 varchar(50)）
 *
 * - product / voucher：有价值实物侧（实物商品 / 优惠券，有实物锚或人民币参考价）
 * - prop：零价值虚拟道具侧（纯展示/纯虚拟，不可发货，向下销毁）
 *
 * @readonly
 * @enum {string}
 */
const ItemType = Object.freeze({
  /** 实物商品（有价值侧） */
  PRODUCT: 'product',
  /** 优惠券（有价值侧） */
  VOUCHER: 'voucher',
  /** 纯虚拟道具（零价值侧，唯一可竞价类型） */
  PROP: 'prop'
})

/**
 * 有价值物品类型（实物侧）：恒为 valuable，星石永不得为其计价
 *
 * @type {string[]}
 */
const VALUABLE_ITEM_TYPES = Object.freeze([ItemType.PRODUCT, ItemType.VOUCHER])

/**
 * 可竞价物品类型白名单（铁律）：仅纯虚拟道具可进入竞价
 *
 * 竞价标的硬规则：仅允许 item_type='prop'（纯虚拟、不可发货）进入竞价；
 * product/voucher 一律禁止（防止实物被代币化锚定）。
 *
 * @type {string[]}
 */
const BIDDABLE_ITEM_TYPES = Object.freeze([ItemType.PROP])

/**
 * 判断物品类型是否为「有价值侧」（以 item_type 枚举为准，不依赖参考价）
 *
 * @param {string} itemType - 物品类型（item_templates.item_type）
 * @returns {boolean} true=有价值侧（实物/券），false=非有价值侧（prop 或未知）
 */
function isValuableType(itemType) {
  return VALUABLE_ITEM_TYPES.includes(itemType)
}

/**
 * 判断物品类型是否允许进入竞价
 *
 * @param {string} itemType - 物品类型（item_templates.item_type）
 * @returns {boolean} true=允许竞价（prop），false=禁止竞价（实物/券/未知）
 */
function isBiddableType(itemType) {
  return BIDDABLE_ITEM_TYPES.includes(itemType)
}

module.exports = {
  ItemType,
  VALUABLE_ITEM_TYPES,
  BIDDABLE_ITEM_TYPES,
  isValuableType,
  isBiddableType
}
