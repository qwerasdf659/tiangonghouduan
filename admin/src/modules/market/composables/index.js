/**
 * 市场模块 - Composables 索引
 *
 * @file admin/src/modules/market/composables/index.js
 * @description 导出所有市场相关的 composable 模块
 * @version 1.2.0
 * @date 2026-04-05
 */

// 兑换商品管理模块
import { useExchangeItemsState, useExchangeItemsMethods } from './exchange-items.js'

// 道具商城模块（道具/星石轨，复用兑换 SPU/SKU 体系）
import { usePropShopState, usePropShopMethods } from './prop-shop.js'

// 兑换订单管理模块
import { useExchangeOrdersState, useExchangeOrdersMethods } from './exchange-orders.js'

// 兑换统计分析模块
import { useExchangeStatsState, useExchangeStatsMethods } from './exchange-stats.js'

// 以物易物配方管理模块（合规整改阶段六）
import { useBarterRecipesState, useBarterRecipesMethods } from './barter-recipes.js'

// 兑换等级门槛配置模块（拍板⑪，P0-2）
import { useRedeemRequirementsState, useRedeemRequirementsMethods } from './redeem-requirements.js'

// ⚠️ 汇率管理 composable 已合并到 conversion-rule-management 页面（2026-04-05）

// 命名导出
export {
  useExchangeItemsState,
  useExchangeItemsMethods,
  usePropShopState,
  usePropShopMethods,
  useExchangeOrdersState,
  useExchangeOrdersMethods,
  useExchangeStatsState,
  useExchangeStatsMethods,
  useBarterRecipesState,
  useBarterRecipesMethods,
  useRedeemRequirementsState,
  useRedeemRequirementsMethods
}
