'use strict'

const PrizeCrudService = require('./CrudService')
const PrizeStockService = require('./StockService')
const PrizeQueryService = require('./QueryService')

/**
 * 奖品池 Facade（保持对外接口不变）
 * 将原 PrizePoolService 的所有静态方法委托到对应子服务
 */
/* eslint-disable require-jsdoc */
class PrizePoolFacade {
  // ========== CRUD ==========
  static batchAddPrizes(...args) {
    return PrizeCrudService.batchAddPrizes(...args)
  }

  static addPrizeToCampaign(...args) {
    return PrizeCrudService.addPrizeToCampaign(...args)
  }

  static updatePrize(...args) {
    return PrizeCrudService.updatePrize(...args)
  }

  static deletePrize(...args) {
    return PrizeCrudService.deletePrize(...args)
  }

  static getPrizeById(...args) {
    return PrizeCrudService.getPrizeById(...args)
  }

  // ========== 库存管理 ==========
  static addStock(...args) {
    return PrizeStockService.addStock(...args)
  }

  static setPrizeStock(...args) {
    return PrizeStockService.setPrizeStock(...args)
  }

  static batchUpdatePrizeStock(...args) {
    return PrizeStockService.batchUpdatePrizeStock(...args)
  }

  static batchUpdateSortOrder(...args) {
    return PrizeStockService.batchUpdateSortOrder(...args)
  }

  // ========== 查询/分组 ==========
  static getPrizesByCampaign(...args) {
    return PrizeQueryService.getPrizesByCampaign(...args)
  }

  static getAllPrizes(...args) {
    return PrizeQueryService.getAllPrizes(...args)
  }

  static getPrizesByCampaignGrouped(...args) {
    return PrizeQueryService.getPrizesByCampaignGrouped(...args)
  }
}

module.exports = PrizePoolFacade
