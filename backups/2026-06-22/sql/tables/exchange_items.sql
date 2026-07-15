/*M!999999\- enable the sandbox mode */ 
-- MariaDB dump 10.19  Distrib 10.11.14-MariaDB, for debian-linux-gnu (x86_64)
--
-- Host: dbconn.sealosbja.site    Database: restaurant_points_dev
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
  PRIMARY KEY (`exchange_item_id`),
  KEY `idx_products_category_status` (`category_id`,`status`),
  KEY `idx_products_status_sort` (`status`,`sort_order`),
  KEY `idx_products_item_template` (`item_template_id`),
  KEY `idx_products_rarity` (`rarity_code`),
  KEY `idx_products_space_status` (`space`,`status`),
  KEY `idx_products_pinned` (`is_pinned`,`pinned_at`),
  KEY `exchange_items_ibfk_2` (`primary_media_id`),
  KEY `exchange_items_merchant_id_foreign_idx` (`merchant_id`),
  CONSTRAINT `exchange_items_ibfk_1` FOREIGN KEY (`category_id`) REFERENCES `categories` (`category_id`),
  CONSTRAINT `exchange_items_ibfk_2` FOREIGN KEY (`primary_media_id`) REFERENCES `media_files` (`media_id`),
  CONSTRAINT `exchange_items_ibfk_3` FOREIGN KEY (`item_template_id`) REFERENCES `item_templates` (`item_template_id`),
  CONSTRAINT `exchange_items_ibfk_4` FOREIGN KEY (`rarity_code`) REFERENCES `rarity_defs` (`rarity_code`),
  CONSTRAINT `exchange_items_merchant_id_foreign_idx` FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`merchant_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=633 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='统一SPU（EAV 商品中心 Layer 1，替代exchange_items）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `exchange_items`
--

LOCK TABLES `exchange_items` WRITE;
/*!40000 ALTER TABLE `exchange_items` DISABLE KEYS */;
INSERT INTO `exchange_items` VALUES
(6,'衣服',5,NULL,1,16,1,'common','active',100,'lucky',0,NULL,0,0,0,1,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,'2026-03-12 05:06:59','2026-03-21 00:32:06',31,19,10,10,'red_core_shard',10,'physical','all',NULL,NULL),
(7,'宝石1',8,NULL,2,192,1,'common','active',100,'lucky',0,NULL,0,0,0,0,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,'2026-03-12 05:12:24','2026-03-17 06:49:44',297,3,100,100,'red_core_shard',10,'physical','all',NULL,NULL),
(248,'【测试】幂等性测试商品',NULL,'用于测试兑换市场幂等性的测试商品（材料资产支付）',NULL,NULL,1,'common','active',1,'lucky',0,NULL,0,0,0,0,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,'2026-03-23 05:58:50','2026-03-23 05:58:50',945,55,100,100,'red_core_shard',10,'physical','all',NULL,NULL),
(250,'已更新商品名称',NULL,'测试更新',NULL,NULL,1,'common','inactive',100,'lucky',0,NULL,0,0,0,0,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,'2026-03-23 05:59:06','2026-03-23 05:59:06',0,0,NULL,NULL,NULL,10,'physical','all',NULL,NULL),
(252,'【测试】幂等性测试商品',NULL,'用于测试兑换市场幂等性的测试商品（材料资产支付）',NULL,NULL,1,'common','active',1,'lucky',0,NULL,0,0,0,0,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,'2026-03-23 06:00:28','2026-03-23 06:00:28',998,2,100,100,'red_core_shard',10,'physical','all',NULL,NULL),
(254,'已更新商品名称',NULL,'测试更新',NULL,NULL,1,'common','inactive',100,'lucky',0,NULL,0,0,0,0,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,'2026-03-23 06:00:45','2026-03-23 06:00:45',0,0,NULL,NULL,NULL,10,'physical','all',NULL,NULL),
(256,'【测试】幂等性测试商品',NULL,'用于测试兑换市场幂等性的测试商品（材料资产支付）',NULL,NULL,1,'common','active',1,'lucky',0,NULL,0,0,0,0,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,'2026-03-23 08:05:09','2026-03-23 08:05:09',998,2,100,100,'red_core_shard',10,'physical','all',NULL,NULL),
(258,'已更新商品名称',NULL,'测试更新',NULL,NULL,1,'common','inactive',100,'lucky',0,NULL,0,0,0,0,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,'2026-03-23 08:05:25','2026-03-23 08:05:25',0,0,NULL,NULL,NULL,10,'physical','all',NULL,NULL),
(260,'【测试】幂等性测试商品',NULL,'用于测试兑换市场幂等性的测试商品（材料资产支付）',NULL,NULL,1,'common','active',1,'lucky',0,NULL,0,0,0,0,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,'2026-03-23 08:06:33','2026-03-23 08:06:33',998,2,100,100,'red_core_shard',10,'physical','all',NULL,NULL),
(262,'已更新商品名称',NULL,'测试更新',NULL,NULL,1,'common','inactive',100,'lucky',0,NULL,0,0,0,0,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,'2026-03-23 08:06:49','2026-03-23 08:06:49',0,0,NULL,NULL,NULL,10,'physical','all',NULL,NULL),
(264,'【测试】幂等性测试商品',NULL,'用于测试兑换市场幂等性的测试商品（材料资产支付）',NULL,NULL,1,'common','active',1,'lucky',0,NULL,0,0,0,0,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,'2026-03-23 08:09:42','2026-03-23 08:09:42',998,2,100,100,'red_core_shard',10,'physical','all',NULL,NULL),
(266,'已更新商品名称',NULL,'测试更新',NULL,NULL,1,'common','inactive',100,'lucky',0,NULL,0,0,0,0,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,'2026-03-23 08:09:58','2026-03-23 08:09:58',0,0,NULL,NULL,NULL,10,'physical','all',NULL,NULL),
(268,'【测试】幂等性测试商品',NULL,'用于测试兑换市场幂等性的测试商品（材料资产支付）',NULL,NULL,1,'common','active',1,'lucky',0,NULL,0,0,0,0,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,'2026-03-23 08:14:03','2026-03-23 08:14:03',998,2,100,100,'red_core_shard',10,'physical','all',NULL,NULL),
(269,'【测试】幂等性测试商品',NULL,'用于测试兑换市场幂等性的测试商品（材料资产支付）',NULL,NULL,1,'common','active',1,'lucky',0,NULL,0,0,0,0,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,'2026-03-23 08:14:10','2026-03-23 08:14:10',998,2,100,100,'red_core_shard',10,'physical','all',NULL,NULL),
(271,'已更新商品名称',NULL,'测试更新',NULL,NULL,1,'common','inactive',100,'lucky',0,NULL,0,0,0,0,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,'2026-03-23 08:14:26','2026-03-23 08:14:26',0,0,NULL,NULL,NULL,10,'physical','all',NULL,NULL),
(273,'【测试】幂等性测试商品',NULL,'用于测试兑换市场幂等性的测试商品（材料资产支付）',NULL,NULL,1,'common','active',1,'lucky',0,NULL,0,0,0,0,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,'2026-03-23 08:14:40','2026-03-23 08:14:40',998,2,100,100,'red_core_shard',10,'physical','all',NULL,NULL),
(275,'已更新商品名称',NULL,'测试更新',NULL,NULL,1,'common','inactive',100,'lucky',0,NULL,0,0,0,0,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,'2026-03-23 08:16:29','2026-03-23 08:16:29',0,0,NULL,NULL,NULL,10,'physical','all',NULL,NULL),
(277,'【测试】幂等性测试商品',NULL,'用于测试兑换市场幂等性的测试商品（材料资产支付）',NULL,NULL,1,'common','active',1,'lucky',0,NULL,0,0,0,0,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,'2026-03-23 08:17:50','2026-03-23 08:17:50',993,7,100,100,'red_core_shard',10,'physical','all',NULL,NULL),
(278,'【测试】另一个商品',NULL,'用于测试冲突保护',NULL,NULL,1,'common','active',2,'lucky',0,NULL,0,0,0,0,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,'2026-03-23 08:17:50','2026-03-23 08:17:50',1000,0,100,100,'red_core_shard',10,'physical','all',NULL,NULL),
(280,'已更新商品名称',NULL,'测试更新',NULL,NULL,1,'common','inactive',100,'lucky',0,NULL,0,0,0,0,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,'2026-03-23 08:18:00','2026-03-23 08:18:00',0,0,NULL,NULL,NULL,10,'physical','all',NULL,NULL),
(283,'已更新商品名称',NULL,'测试更新',NULL,NULL,1,'common','inactive',100,'lucky',0,NULL,0,0,0,0,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,'2026-03-23 08:18:17','2026-03-23 08:18:17',0,0,NULL,NULL,NULL,10,'physical','all',NULL,NULL),
(286,'已更新商品名称',NULL,'测试更新',NULL,NULL,1,'common','inactive',100,'lucky',0,NULL,0,0,0,0,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,'2026-03-23 08:18:30','2026-03-23 08:18:30',0,0,NULL,NULL,NULL,10,'physical','all',NULL,NULL),
(289,'已更新商品名称',NULL,'测试更新',NULL,NULL,1,'common','inactive',100,'lucky',0,NULL,0,0,0,0,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,'2026-03-23 08:19:11','2026-03-23 08:19:11',0,0,NULL,NULL,NULL,10,'physical','all',NULL,NULL),
(292,'已更新商品名称',NULL,'测试更新',NULL,NULL,1,'common','inactive',100,'lucky',0,NULL,0,0,0,0,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,'2026-03-23 08:19:38','2026-03-23 08:19:38',0,0,NULL,NULL,NULL,10,'physical','all',NULL,NULL),
(295,'已更新商品名称',NULL,'测试更新',NULL,NULL,1,'common','inactive',100,'lucky',0,NULL,0,0,0,0,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,'2026-03-23 08:21:26','2026-03-23 08:21:26',0,0,NULL,NULL,NULL,10,'physical','all',NULL,NULL),
(297,'【测试】幂等性测试商品',NULL,'用于测试兑换市场幂等性的测试商品（材料资产支付）',NULL,NULL,1,'common','active',1,'lucky',0,NULL,0,0,0,0,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,'2026-03-23 08:24:13','2026-03-23 08:24:13',993,7,100,100,'red_core_shard',10,'physical','all',NULL,NULL),
(298,'【测试】另一个商品',NULL,'用于测试冲突保护',NULL,NULL,1,'common','active',2,'lucky',0,NULL,0,0,0,0,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,'2026-03-23 08:24:14','2026-03-23 08:24:14',1000,0,100,100,'red_core_shard',10,'physical','all',NULL,NULL),
(299,'【测试】幂等性测试商品',NULL,'用于测试兑换市场幂等性的测试商品（材料资产支付）',NULL,NULL,1,'common','active',1,'lucky',0,NULL,0,0,0,0,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,'2026-03-23 08:25:01','2026-03-23 08:25:01',993,7,100,100,'red_core_shard',10,'physical','all',NULL,NULL),
(300,'【测试】另一个商品',NULL,'用于测试冲突保护',NULL,NULL,1,'common','active',2,'lucky',0,NULL,0,0,0,0,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,'2026-03-23 08:25:02','2026-03-23 08:25:02',1000,0,100,100,'red_core_shard',10,'physical','all',NULL,NULL),
(302,'已更新商品名称',NULL,'测试更新',NULL,NULL,1,'common','inactive',100,'lucky',0,NULL,0,0,0,0,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,'2026-03-23 08:25:29','2026-03-23 08:25:29',0,0,NULL,NULL,NULL,10,'physical','all',NULL,NULL),
(304,'【测试】幂等性测试商品',NULL,'用于测试兑换市场幂等性的测试商品（材料资产支付）',NULL,NULL,1,'common','active',1,'lucky',0,NULL,0,0,0,0,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,'2026-03-23 08:30:08','2026-03-23 08:30:08',993,7,100,100,'red_core_shard',10,'physical','all',NULL,NULL),
(305,'【测试】另一个商品',NULL,'用于测试冲突保护',NULL,NULL,1,'common','active',2,'lucky',0,NULL,0,0,0,0,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,'2026-03-23 08:30:08','2026-03-23 08:30:08',1000,0,100,100,'red_core_shard',10,'physical','all',NULL,NULL),
(307,'已更新商品名称',NULL,'测试更新',NULL,NULL,1,'common','inactive',100,'lucky',0,NULL,0,0,0,0,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,'2026-03-23 08:30:30','2026-03-23 08:30:30',0,0,NULL,NULL,NULL,10,'physical','all',NULL,NULL),
(309,'【测试】幂等性测试商品',NULL,'用于测试兑换市场幂等性的测试商品（材料资产支付）',NULL,NULL,1,'common','active',1,'lucky',0,NULL,0,0,0,0,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,'2026-03-23 08:31:30','2026-03-23 08:31:30',993,7,100,100,'red_core_shard',10,'physical','all',NULL,NULL),
(311,'【测试】幂等性测试商品',NULL,'用于测试兑换市场幂等性的测试商品（材料资产支付）',NULL,NULL,1,'common','active',1,'lucky',0,NULL,0,0,0,0,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,'2026-03-23 08:31:40','2026-03-23 08:31:40',993,7,100,100,'red_core_shard',10,'physical','all',NULL,NULL),
(316,'已更新商品名称',NULL,'测试更新',NULL,NULL,1,'common','inactive',100,'lucky',0,NULL,0,0,0,0,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,'2026-03-23 08:35:04','2026-03-23 08:35:04',0,0,NULL,NULL,NULL,10,'physical','all',NULL,NULL),
(319,'已更新商品名称',NULL,'测试更新',NULL,NULL,1,'common','inactive',100,'lucky',0,NULL,0,0,0,0,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,'2026-03-23 08:36:28','2026-03-23 08:36:28',0,0,NULL,NULL,NULL,10,'physical','all',NULL,NULL),
(324,'已更新商品名称',NULL,'测试更新',NULL,NULL,1,'common','inactive',100,'lucky',0,NULL,0,0,0,0,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,'2026-03-23 09:24:17','2026-03-23 09:24:17',0,0,NULL,NULL,NULL,10,'physical','all',NULL,NULL),
(331,'已更新商品名称',NULL,'测试更新',NULL,NULL,1,'common','inactive',100,'lucky',0,NULL,0,0,0,0,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,'2026-03-23 09:35:03','2026-03-23 09:35:03',0,0,NULL,NULL,NULL,10,'physical','all',NULL,NULL),
(336,'已更新商品名称',NULL,'测试更新',NULL,NULL,1,'common','inactive',100,'lucky',0,NULL,0,0,0,0,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,'2026-03-23 09:35:41','2026-03-23 09:35:41',0,0,NULL,NULL,NULL,10,'physical','all',NULL,NULL),
(341,'已更新商品名称',NULL,'测试更新',NULL,NULL,1,'common','inactive',100,'lucky',0,NULL,0,0,0,0,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,'2026-03-23 09:38:14','2026-03-23 09:38:14',0,0,NULL,NULL,NULL,10,'physical','all',NULL,NULL),
(344,'已更新商品名称',NULL,'测试更新',NULL,NULL,1,'common','inactive',100,'lucky',0,NULL,0,0,0,0,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,'2026-03-23 09:40:43','2026-03-23 09:40:43',0,0,NULL,NULL,NULL,10,'physical','all',NULL,NULL),
(349,'已更新商品名称',NULL,'测试更新',NULL,NULL,1,'common','inactive',100,'lucky',0,NULL,0,0,0,0,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,'2026-03-23 09:44:00','2026-03-23 09:44:01',0,0,NULL,NULL,NULL,10,'physical','all',NULL,NULL),
(358,'已更新商品名称',NULL,'测试更新',NULL,NULL,1,'common','inactive',100,'lucky',0,NULL,0,0,0,0,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,'2026-03-24 02:05:20','2026-03-24 02:05:20',0,0,NULL,NULL,NULL,10,'physical','all',NULL,NULL),
(363,'已更新商品名称',NULL,'测试更新',NULL,NULL,1,'common','inactive',100,'lucky',0,NULL,0,0,0,0,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,'2026-03-24 02:10:48','2026-03-24 02:10:48',0,0,NULL,NULL,NULL,10,'physical','all',NULL,NULL),
(368,'已更新商品名称',NULL,'测试更新',NULL,NULL,1,'common','inactive',100,'lucky',0,NULL,0,0,0,0,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,'2026-03-24 02:18:53','2026-03-24 02:18:53',0,0,NULL,NULL,NULL,10,'physical','all',NULL,NULL),
(371,'已更新商品名称',NULL,'测试更新',NULL,NULL,1,'common','inactive',100,'lucky',0,NULL,0,0,0,0,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,'2026-03-24 04:31:29','2026-03-24 04:31:29',0,0,NULL,NULL,NULL,10,'physical','all',NULL,NULL),
(374,'已更新商品名称',NULL,'测试更新',NULL,NULL,1,'common','inactive',100,'lucky',0,NULL,0,0,0,0,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,'2026-03-24 04:33:15','2026-03-24 04:33:15',0,0,NULL,NULL,NULL,10,'physical','all',NULL,NULL),
(385,'已更新商品名称',NULL,'测试更新',NULL,NULL,1,'common','inactive',100,'lucky',0,NULL,0,0,0,0,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,'2026-03-24 04:38:01','2026-03-24 04:38:01',0,0,NULL,NULL,NULL,10,'physical','all',NULL,NULL),
(392,'已更新商品名称',NULL,'测试更新',NULL,NULL,1,'common','inactive',100,'lucky',0,NULL,0,0,0,0,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,'2026-03-24 04:43:59','2026-03-24 04:43:59',0,0,NULL,NULL,NULL,10,'physical','all',NULL,NULL),
(397,'已更新商品名称',NULL,'测试更新',NULL,NULL,1,'common','inactive',100,'lucky',0,NULL,0,0,0,0,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,'2026-03-24 04:44:13','2026-03-24 04:44:13',0,0,NULL,NULL,NULL,10,'physical','all',NULL,NULL),
(402,'已更新商品名称',NULL,'测试更新',NULL,NULL,1,'common','inactive',100,'lucky',0,NULL,0,0,0,0,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,'2026-03-24 05:01:04','2026-03-24 05:01:05',0,0,NULL,NULL,NULL,10,'physical','all',NULL,NULL),
(413,'已更新商品名称',NULL,'测试更新',NULL,NULL,1,'common','inactive',100,'lucky',0,NULL,0,0,0,0,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,'2026-04-10 06:47:41','2026-04-10 06:47:41',0,0,NULL,NULL,NULL,10,'physical','all',NULL,NULL),
(416,'已更新商品名称',NULL,'测试更新',NULL,NULL,1,'common','inactive',100,'lucky',0,NULL,0,0,0,0,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,'2026-04-22 11:10:42','2026-04-22 11:10:42',0,0,NULL,NULL,NULL,10,'physical','all',NULL,NULL),
(423,'已更新商品名称',NULL,'测试更新',NULL,NULL,1,'common','inactive',100,'lucky',0,NULL,0,0,0,0,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,'2026-04-22 11:28:23','2026-04-22 11:28:23',0,0,NULL,NULL,NULL,10,'physical','all',NULL,NULL),
(426,'已更新商品名称',NULL,'测试更新',NULL,NULL,1,'common','inactive',100,'lucky',0,NULL,0,0,0,0,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,'2026-04-22 11:30:56','2026-04-22 11:30:56',0,0,NULL,NULL,NULL,10,'physical','all',NULL,NULL),
(433,'已更新商品名称',NULL,'测试更新',NULL,NULL,1,'common','inactive',100,'lucky',0,NULL,0,0,0,0,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,'2026-04-23 00:04:20','2026-04-23 00:04:20',0,0,NULL,NULL,NULL,10,'physical','all',NULL,NULL),
(474,'已更新商品名称',NULL,'测试更新',NULL,NULL,1,'common','inactive',100,'lucky',0,NULL,0,0,0,0,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,'2026-06-03 01:58:06','2026-06-03 01:58:06',0,0,NULL,NULL,NULL,10,'physical','all',NULL,NULL),
(478,'已更新商品名称',NULL,'测试更新',NULL,NULL,1,'common','inactive',100,'lucky',0,NULL,0,0,0,0,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,'2026-06-03 02:01:54','2026-06-03 02:01:54',0,0,NULL,NULL,NULL,10,'physical','all',NULL,NULL),
(533,'5655',NULL,'',NULL,NULL,1,'common','active',100,'lucky',0,NULL,0,0,0,0,'[]','','[]','',0,NULL,NULL,NULL,'2026-06-11 02:26:10','2026-06-11 02:26:10',0,0,NULL,NULL,NULL,10,'physical','all',NULL,NULL),
(534,'黄先生',NULL,'<p><br></p>',NULL,NULL,1,'common','active',100,'lucky',0,NULL,0,0,0,0,'[]','','[]','',0,NULL,NULL,NULL,'2026-06-11 02:26:38','2026-06-11 02:26:38',0,0,NULL,NULL,NULL,10,'physical','all',NULL,NULL),
(535,'1111',NULL,'<p><br></p>',NULL,253,1,'common','active',100,'lucky',0,NULL,0,0,0,0,'[]','','[]','',0,NULL,NULL,NULL,'2026-06-11 02:32:13','2026-06-13 02:49:32',47,3,500,500,'star_stone',10,'virtual','all',NULL,NULL),
(536,'12222',NULL,'',NULL,254,1,'common','active',0,'lucky',0,NULL,0,0,0,0,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,'2026-06-11 02:33:15','2026-06-14 07:27:58',55,0,1,1,'star_stone',10,'virtual','all',NULL,NULL),
(537,'55555',NULL,'<p><br></p>',NULL,255,1,'common','active',100,'lucky',0,NULL,0,0,0,0,'[]','','[]','',0,NULL,NULL,NULL,'2026-06-11 03:20:52','2026-06-13 02:48:37',49,1,50,50,'star_stone',10,'virtual','all',NULL,NULL),
(627,'门店专属券-指定门店(店7)',NULL,'门店专属兑换券业务线首批种子券（到限定门店核销）',NULL,2,1,'common','active',100,'lucky',0,NULL,0,0,0,0,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,'2026-06-21 04:40:02','2026-06-21 04:40:02',100,0,NULL,NULL,NULL,10,'voucher','specified_stores','[7]',NULL),
(628,'门店专属券-商家全门店(老良记)',NULL,'门店专属兑换券业务线首批种子券（到限定门店核销）',NULL,2,1,'common','active',100,'lucky',0,NULL,0,0,0,0,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,'2026-06-21 04:40:02','2026-06-21 04:40:02',100,0,NULL,NULL,NULL,10,'voucher','merchant_all',NULL,6);
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

-- Dump completed on 2026-06-21 19:08:12
