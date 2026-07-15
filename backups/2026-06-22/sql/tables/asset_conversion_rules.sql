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
-- Table structure for table `asset_conversion_rules`
--

DROP TABLE IF EXISTS `asset_conversion_rules`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `asset_conversion_rules` (
  `conversion_rule_id` bigint NOT NULL AUTO_INCREMENT COMMENT '转换规则ID（主键）',
  `from_asset_code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '源资产代码（转换输入）：如 red_core_shard',
  `to_asset_code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '目标资产代码（转换输出）：如 star_stone',
  `rate_numerator` bigint NOT NULL COMMENT '转换比率分子：to_amount = FLOOR(from_amount × rate_numerator ÷ rate_denominator)',
  `rate_denominator` bigint NOT NULL COMMENT '转换比率分母：使用整数分子/分母避免浮点精度问题',
  `rounding_mode` enum('floor','ceil','round') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'floor' COMMENT '舍入模式：floor-向下取整（默认） / ceil-向上取整 / round-四舍五入',
  `fee_rate` decimal(5,4) NOT NULL DEFAULT '0.0000' COMMENT '手续费费率：如 0.0500 = 5%，基于产出计算',
  `fee_min_amount` bigint NOT NULL DEFAULT '0' COMMENT '最低手续费（保底值）',
  `fee_asset_code` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '手续费资产代码（NULL 表示从产出资产扣除）',
  `min_from_amount` bigint NOT NULL DEFAULT '1' COMMENT '最小转换数量（保护性下限）',
  `max_from_amount` bigint DEFAULT NULL COMMENT '最大转换数量（NULL表示无上限）',
  `daily_user_limit` bigint DEFAULT NULL COMMENT '每用户每日转换限额（源资产数量，NULL表示无限制）',
  `daily_global_limit` bigint DEFAULT NULL COMMENT '全局每日转换限额（源资产数量，NULL表示无限制）',
  `status` enum('active','paused','disabled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active' COMMENT '状态：active-生效中 / paused-暂停 / disabled-已禁用',
  `priority` int NOT NULL DEFAULT '0' COMMENT '优先级：同一币对多条规则时，取 priority 最高且生效的规则',
  `effective_from` datetime DEFAULT NULL COMMENT '生效开始时间（NULL表示立即生效）',
  `effective_until` datetime DEFAULT NULL COMMENT '生效结束时间（NULL表示永不过期）',
  `title` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '规则标题（管理后台展示用）',
  `description` text COLLATE utf8mb4_unicode_ci COMMENT '规则描述（运营备注）',
  `display_icon` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '展示图标URL',
  `risk_level` enum('low','medium','high') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'low' COMMENT '风控等级：low-低风险 / medium-中风险 / high-高风险',
  `is_visible` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否对用户可见（false=仅管理后台可见）',
  `created_by` int DEFAULT NULL COMMENT '创建人用户ID',
  `updated_by` int DEFAULT NULL COMMENT '最后修改人用户ID',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `display_category` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '展示分类（运营覆盖）：compose/decompose/exchange，NULL=自动推导',
  PRIMARY KEY (`conversion_rule_id`),
  KEY `idx_acr_pair_status` (`from_asset_code`,`to_asset_code`,`status`),
  KEY `idx_acr_status_effective` (`status`,`effective_from`,`effective_until`),
  KEY `idx_acr_pair_status_priority` (`from_asset_code`,`to_asset_code`,`status`,`priority`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='统一资产转换规则表 — 合并汇率兑换与材料转换';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `asset_conversion_rules`
--

LOCK TABLES `asset_conversion_rules` WRITE;
/*!40000 ALTER TABLE `asset_conversion_rules` DISABLE KEYS */;
INSERT INTO `asset_conversion_rules` VALUES
(1,'red_core_shard','star_stone',1,10,'floor',0.0000,0,NULL,10,NULL,NULL,NULL,'active',0,NULL,NULL,NULL,'10红源晶碎片=1星石（budget比1:10精确匹配）',NULL,'low',1,NULL,31,'2026-02-24 01:47:02','2026-04-05 22:03:16',NULL),
(2,'orange_core_shard','star_stone',1,10,'floor',0.0000,0,NULL,100,NULL,NULL,NULL,'active',0,NULL,NULL,NULL,'10橙源晶碎片=1星石（budget比1:10精确匹配）',NULL,'low',1,NULL,NULL,'2026-02-24 01:47:02','2026-04-02 04:32:32',NULL),
(3,'yellow_core_shard','star_stone',1,5,'floor',0.0000,0,NULL,5,NULL,NULL,NULL,'active',0,NULL,NULL,NULL,'5黄源晶碎片=1星石（budget比1:5精确匹配）',NULL,'low',1,NULL,NULL,'2026-02-24 01:47:02','2026-04-02 04:32:32',NULL),
(4,'green_core_shard','star_stone',1,3,'floor',0.0000,0,NULL,3,NULL,NULL,NULL,'paused',0,NULL,NULL,NULL,'3绿源晶碎片=1星石（budget比1:2.5→保守取3）',NULL,'low',1,NULL,NULL,'2026-02-24 01:47:02','2026-04-02 04:32:32',NULL),
(5,'blue_core_shard','star_stone',1,2,'floor',0.0000,0,NULL,10,NULL,NULL,NULL,'active',0,NULL,NULL,NULL,'2蓝源晶碎片=1星石（budget比1:1.25→保守取2）',NULL,'low',1,NULL,NULL,'2026-02-24 01:47:02','2026-04-02 04:32:32',NULL),
(6,'purple_core_shard','star_stone',1,1,'floor',0.0000,0,NULL,1,NULL,NULL,NULL,'active',0,NULL,NULL,NULL,'1紫源晶碎片=1星石（budget比160:100→保守压到1:1）',NULL,'low',1,NULL,NULL,'2026-02-24 01:47:02','2026-04-02 04:32:32',NULL),
(7,'red_core_gem','star_stone',2,1,'floor',0.0000,0,NULL,1,NULL,NULL,NULL,'active',0,NULL,NULL,NULL,'1红源晶=2星石（budget比50:100=1:2保守匹配）',NULL,'low',1,NULL,NULL,'2026-02-24 01:47:02','2026-04-02 04:32:32',NULL),
(8,'red_core_shard','star_stone',20,1,'floor',0.0000,0,NULL,1,NULL,NULL,NULL,'disabled',0,'2025-12-15 00:00:00',NULL,'红源晶碎片分解','将红源晶碎片分解为星石，比例 1:20',NULL,'low',1,NULL,NULL,'2025-12-16 04:53:24','2026-02-18 17:34:08',NULL),
(9,'red_core_shard','star_stone',20,1,'floor',0.0500,5,'star_stone',1,1000,NULL,NULL,'disabled',0,'2026-03-03 04:33:53',NULL,'测试手续费规则',NULL,NULL,'low',1,NULL,NULL,'2026-03-03 04:33:53','2026-03-03 04:33:53',NULL);
/*!40000 ALTER TABLE `asset_conversion_rules` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-06-21 19:08:10
