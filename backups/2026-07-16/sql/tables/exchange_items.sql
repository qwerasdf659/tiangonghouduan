/*M!999999\- enable the sandbox mode */ 
-- MariaDB dump 10.19  Distrib 10.11.14-MariaDB, for debian-linux-gnu (x86_64)
--
-- Host: test-db-12-mysql.ns-br0za7uc.svc    Database: restaurant_points_dev
-- ------------------------------------------------------
-- Server version	8.0.30

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `exchange_items`
--

DROP TABLE IF EXISTS `exchange_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `exchange_items` (
  `exchange_item_id` bigint NOT NULL AUTO_INCREMENT,
  `item_name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `category_id` int DEFAULT NULL COMMENT '所属品类',
  `description` text COLLATE utf8mb4_unicode_ci COMMENT '商品描述（富文本）',
  `primary_media_id` bigint unsigned DEFAULT NULL COMMENT '主图',
  `item_template_id` bigint DEFAULT NULL COMMENT '关联物品模板（铸造时使用的模板）',
  `mint_instance` tinyint(1) NOT NULL DEFAULT '1' COMMENT '铸造开关：true=兑换后自动铸造Item实例，false=纯实物发货',
  `rarity_code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'common' COMMENT '稀有度',
  `status` enum('active','inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active' COMMENT '状态',
  `sort_order` int NOT NULL DEFAULT '0' COMMENT '排序',
  `space` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'lucky' COMMENT '所属空间 lucky/premium/both',
  `is_pinned` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否置顶',
  `pinned_at` datetime DEFAULT NULL COMMENT '置顶时间',
  `is_new` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否新品',
  `is_hot` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否热门',
  `is_limited` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否限量',
  `is_recommended` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否推荐',
  `tags` json DEFAULT NULL COMMENT '标签数组',
  `sell_point` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '营销卖点',
  `usage_rules` json DEFAULT NULL COMMENT '使用说明',
  `video_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '视频URL',
  `stock_alert_threshold` int NOT NULL DEFAULT '0' COMMENT '库存预警阈值',
  `publish_at` datetime DEFAULT NULL COMMENT '定时上架',
  `unpublish_at` datetime DEFAULT NULL COMMENT '定时下架',
  `attributes_json` json DEFAULT NULL COMMENT '商品参数表快照（非EAV的补充，如长篇图文参数）',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `stock` int NOT NULL DEFAULT '0' COMMENT 'SPU 汇总库存（= SUM(product_skus.stock)）',
  `sold_count` int NOT NULL DEFAULT '0' COMMENT 'SPU 汇总已售（= SUM(product_skus.sold_count)）',
  `min_cost_amount` bigint DEFAULT NULL COMMENT 'SPU 最低兑换价（= MIN(exchange_channel_prices.cost_amount)）',
  `max_cost_amount` bigint DEFAULT NULL COMMENT 'SPU 最高兑换价（= MAX(exchange_channel_prices.cost_amount)）',
  `min_cost_asset_code` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'SPU最低价对应的计价资产码(points/star_stone等，物化冗余列，来源最低价SKU渠道价；NULL=无可售渠道价)',
  `max_quantity_per_order` int NOT NULL DEFAULT '10' COMMENT '每单兑换数量上限（≥1，运营可配；提交接口据此校验，替代历史硬编码 1-10）',
  `fulfillment_type` enum('physical','virtual','voucher') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'physical' COMMENT '履约类型：physical=实物邮寄(需收货地址+走发货链)/virtual=虚拟即时(建单即完成)/voucher=卡券核销。下单据此判定履约链，替代靠模板 item_type 推断',
  `applicable_scope` enum('all','specified_stores','merchant_all') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'all' COMMENT '核销范围：all=通用任意门店核销 / specified_stores=限指定门店核销 / merchant_all=限商家全门店核销',
  `scoped_store_ids` json DEFAULT NULL COMMENT 'specified_stores 时允许核销的门店ID集合（如 [7,8,9]）；其它类型为 NULL',
  `merchant_id` int DEFAULT NULL COMMENT 'merchant_all 时商品归属商家（运营建券选），关联 merchants.merchant_id；其它类型可为 NULL',
  `item_code` varchar(14) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '平台商品展示码(SPU,无意义随机码 SP+12位规范形,对外标识/手册查找/防枚举)',
  `series_id` bigint DEFAULT NULL COMMENT '所属系列(product_series.series_id,可空;FK 在供应商+系列迁移中补)',
  `series_seq` int DEFAULT NULL COMMENT '系列内连续序号(展示形=series_code+补零,如 SLNB-001)',
  PRIMARY KEY (`exchange_item_id`),
  UNIQUE KEY `uk_item_code` (`item_code`),
  UNIQUE KEY `uk_series_seq` (`series_id`,`series_seq`),
  KEY `idx_products_category_status` (`category_id`,`status`),
  KEY `idx_products_status_sort` (`status`,`sort_order`),
  KEY `idx_products_item_template` (`item_template_id`),
  KEY `idx_products_rarity` (`rarity_code`),
  KEY `idx_products_space_status` (`space`,`status`),
  KEY `idx_products_pinned` (`is_pinned`,`pinned_at`),
  KEY `exchange_items_merchant_id_foreign_idx` (`merchant_id`),
  KEY `exchange_items_ibfk_2` (`primary_media_id`),
  CONSTRAINT `exchange_items_ibfk_1` FOREIGN KEY (`category_id`) REFERENCES `categories` (`category_id`),
  CONSTRAINT `exchange_items_ibfk_2` FOREIGN KEY (`primary_media_id`) REFERENCES `media_files` (`media_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `exchange_items_ibfk_3` FOREIGN KEY (`item_template_id`) REFERENCES `item_templates` (`item_template_id`),
  CONSTRAINT `exchange_items_ibfk_4` FOREIGN KEY (`rarity_code`) REFERENCES `rarity_defs` (`rarity_code`),
  CONSTRAINT `exchange_items_merchant_id_foreign_idx` FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`merchant_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_exchange_items_series` FOREIGN KEY (`series_id`) REFERENCES `product_series` (`series_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=843 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='统一SPU（EAV 商品中心 Layer 1，替代exchange_items）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `exchange_items`
--

LOCK TABLES `exchange_items` WRITE;
/*!40000 ALTER TABLE `exchange_items` DISABLE KEYS */;
INSERT INTO `exchange_items` VALUES
(633,'1号商品',NULL,'<p>11111</p>',128,NULL,0,'common','active',100,'lucky',0,NULL,0,0,0,0,'[]','','[]','',0,NULL,NULL,NULL,'2026-06-22 06:28:27','2026-07-15 21:25:19',5,6,100,100,'star_stone',10,'physical','all',NULL,NULL,'SPAFBF8URGS4CY',NULL,NULL),
(637,'2号商品',NULL,'<p><br></p>',126,NULL,0,'common','active',100,'lucky',0,NULL,0,0,0,0,'[]','','[]','',0,NULL,NULL,NULL,'2026-06-22 13:00:23','2026-07-06 08:30:03',77,23,1000,1000,'red_core_shard',10,'physical','all',NULL,NULL,'SPK7ZAPJHJQTEJ',NULL,NULL),
(697,'毛巾礼盒（换物）',NULL,'以物易物试点产出标的（拍板④）：旧毛巾礼盒×2 换新毛巾礼盒，实物快递履约。不在兑换商城售卖（status=inactive），仅作换物配方产出。',NULL,16,0,'common','inactive',100,'lucky',0,NULL,0,0,0,0,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,'2026-07-11 01:27:28','2026-07-11 10:01:27',0,0,NULL,NULL,NULL,1,'physical','all',NULL,NULL,'SPQZW8MBRHE8QG',NULL,NULL);
/*!40000 ALTER TABLE `exchange_items` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-07-16  3:11:49
