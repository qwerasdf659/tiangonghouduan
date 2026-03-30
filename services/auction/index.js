/**
 * C2C 用户间竞拍服务入口
 *
 * 子服务清单：
 * - AuctionService: 核心拍卖操作（创建/出价/结算/取消/流拍）
 * - AuctionQueryService: 查询服务（列表/详情/卖方视角/出价历史/管理后台）
 *
 * 服务键命名规范（ServiceManager）：
 * - auction_core: 核心拍卖服务（实例化，构造函数注入 models）
 * - auction_query: 拍卖查询服务（实例化，构造函数注入 models）
 *
 * @module services/auction
 * @created 2026-03-24（C2C用户间竞拍功能）
 * @see docs/C2C竞拍方案.md §6
 */

const AuctionService = require('./AuctionService')
const AuctionQueryService = require('./AuctionQueryService')

module.exports = {
  AuctionService,
  AuctionQueryService
}
