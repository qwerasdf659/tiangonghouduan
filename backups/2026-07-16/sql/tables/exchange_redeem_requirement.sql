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
-- Table structure for table `exchange_redeem_requirement`
--

DROP TABLE IF EXISTS `exchange_redeem_requirement`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `exchange_redeem_requirement` (
  `exchange_redeem_requirement_id` int NOT NULL AUTO_INCREMENT COMMENT '兑换复合门槛配置主键',
  `exchange_item_id` bigint NOT NULL COMMENT '关联兑换商品ID，FK→exchange_items.exchange_item_id',
  `sku_id` bigint DEFAULT NULL COMMENT '关联SKU（NULL=作用于整个商品所有SKU）',
  `min_growth_level_key` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '最低成长等级门槛（关联 user_growth_levels.level_key，NULL=不限等级）',
  `extra_cost_assets` json DEFAULT NULL COMMENT '主计价外额外资产组合 [{asset_code, amount}]（实物侧禁含 star_stone）',
  `required_consume_items` json DEFAULT NULL COMMENT '需消耗的指定道具 [{item_template_id, quantity}]',
  `required_badges` json DEFAULT NULL COMMENT '需持有的奖章（预留，本期可空）',
  `required_tasks` json DEFAULT NULL COMMENT '需完成的任务（预留，本期可空）',
  `is_enabled` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否启用该门槛配置',
  `publish_at` datetime DEFAULT NULL COMMENT '门槛生效起始时间（北京时间，NULL=立即生效）',
  `unpublish_at` datetime DEFAULT NULL COMMENT '门槛失效时间（北京时间，NULL=长期有效）',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间（北京时间）',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间（北京时间）',
  `max_growth_level_key` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '最高成长等级门槛（关联 user_growth_levels.level_key，NULL=不限；与 min 组合成区间）',
  PRIMARY KEY (`exchange_redeem_requirement_id`),
  KEY `idx_redeem_req_item_sku` (`exchange_item_id`,`sku_id`),
  KEY `idx_redeem_req_enabled` (`is_enabled`),
  CONSTRAINT `exchange_redeem_requirement_ibfk_1` FOREIGN KEY (`exchange_item_id`) REFERENCES `exchange_items` (`exchange_item_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='兑换复合门槛配置表（高价值实物 VIP+多资产+消耗道具门槛，叠加在单资产计价之上）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `exchange_redeem_requirement`
--

LOCK TABLES `exchange_redeem_requirement` WRITE;
/*!40000 ALTER TABLE `exchange_redeem_requirement` DISABLE KEYS */;
/*!40000 ALTER TABLE `exchange_redeem_requirement` ENABLE KEYS */;
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
