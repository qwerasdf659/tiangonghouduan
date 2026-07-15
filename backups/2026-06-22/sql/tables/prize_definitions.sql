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
-- Table structure for table `prize_definitions`
--

DROP TABLE IF EXISTS `prize_definitions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `prize_definitions` (
  `prize_definition_id` bigint NOT NULL AUTO_INCREMENT COMMENT '奖品定义ID（主键）',
  `prize_code` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '业务码（如 star_stone_500、red_core_shard_50）',
  `display_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '展示名称（如 星石 ×500）',
  `prize_type` enum('material','item','coupon','points') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '奖品类型：material=材料资产, item=物品模板, coupon=优惠券, points=积分',
  `material_asset_code` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '材料资产编码（FK→material_asset_types.asset_code）',
  `material_amount` bigint DEFAULT NULL COMMENT '材料数量',
  `item_template_id` bigint DEFAULT NULL COMMENT '物品模板ID（FK→item_templates.item_template_id，物品类奖品）',
  `rarity_code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'common' COMMENT '稀有度编码（FK→rarity_defs.rarity_code）',
  `primary_media_id` bigint unsigned DEFAULT NULL COMMENT '主图媒体ID（FK→media_files.media_file_id）',
  `reward_tier` enum('high','mid','low') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'low' COMMENT '默认档位（活动关联表可覆盖）',
  `is_enabled` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否启用',
  `description` text COLLATE utf8mb4_unicode_ci COMMENT '奖品描述',
  `merchant_id` int DEFAULT NULL COMMENT '商户ID（FK→merchants，多商家隔离）',
  `meta` json DEFAULT NULL COMMENT '扩展字段（JSON）',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` datetime DEFAULT NULL COMMENT '软删除时间',
  PRIMARY KEY (`prize_definition_id`),
  UNIQUE KEY `prize_code` (`prize_code`),
  KEY `idx_prize_definitions_type` (`prize_type`),
  KEY `idx_prize_definitions_rarity` (`rarity_code`),
  KEY `idx_prize_definitions_material` (`material_asset_code`),
  KEY `idx_prize_definitions_enabled` (`is_enabled`),
  KEY `idx_prize_definitions_merchant` (`merchant_id`),
  KEY `idx_prize_definitions_tier` (`reward_tier`),
  KEY `fk_prize_definitions_media` (`primary_media_id`),
  CONSTRAINT `fk_prize_definitions_media` FOREIGN KEY (`primary_media_id`) REFERENCES `media_files` (`media_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_prize_definitions_merchant` FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`merchant_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='奖品目录表 — 全局唯一真相源，活动通过关联表引用';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `prize_definitions`
--

LOCK TABLES `prize_definitions` WRITE;
/*!40000 ALTER TABLE `prize_definitions` DISABLE KEYS */;
INSERT INTO `prize_definitions` VALUES
(1,'star_stone_500','星石 ×500','material','star_stone',500,NULL,'legendary',NULL,'high',1,NULL,NULL,NULL,'2026-05-25 19:53:58','2026-05-25 19:53:58',NULL),
(2,'star_stone_200','星石 ×200','material','star_stone',200,NULL,'epic',NULL,'high',1,NULL,NULL,NULL,'2026-05-25 19:53:58','2026-05-25 19:53:58',NULL),
(3,'red_core_shard_50','红源晶碎片 ×50','material','red_core_shard',50,NULL,'epic',NULL,'high',1,NULL,NULL,NULL,'2026-05-25 19:53:58','2026-05-25 19:53:58',NULL),
(4,'star_stone_80','星石 ×80','material','star_stone',80,NULL,'rare',NULL,'mid',1,NULL,NULL,NULL,'2026-05-25 19:53:58','2026-05-25 19:53:58',NULL),
(5,'star_stone_50','星石 ×50','material','star_stone',50,NULL,'rare',NULL,'mid',1,NULL,NULL,NULL,'2026-05-25 19:53:58','2026-05-25 19:53:58',NULL),
(6,'red_core_shard_25','红源晶碎片 ×25','material','red_core_shard',25,NULL,'rare',NULL,'mid',1,NULL,NULL,NULL,'2026-05-25 19:53:58','2026-05-25 19:53:58',NULL),
(7,'red_core_shard_12','红源晶碎片 ×12','material','red_core_shard',12,NULL,'uncommon',NULL,'mid',1,NULL,NULL,NULL,'2026-05-25 19:53:58','2026-05-25 19:53:58',NULL),
(8,'star_stone_30','星石 ×30','material','star_stone',30,NULL,'uncommon',NULL,'low',1,NULL,NULL,NULL,'2026-05-25 19:53:58','2026-05-25 19:53:58',NULL),
(9,'star_stone_10','星石 ×10','material','star_stone',10,NULL,'common',NULL,'low',1,NULL,NULL,NULL,'2026-05-25 19:53:58','2026-05-25 19:53:58',NULL),
(10,'red_core_shard_8','红源晶碎片 ×8','material','red_core_shard',8,NULL,'common',NULL,'low',1,NULL,NULL,NULL,'2026-05-25 19:53:58','2026-05-25 19:53:58',NULL),
(11,'red_core_shard_3','红源晶碎片 ×3','material','red_core_shard',3,NULL,'common',NULL,'low',1,NULL,NULL,NULL,'2026-05-25 19:53:58','2026-05-25 19:53:58',NULL),
(12,'points_10','积分 +10','points','points',10,NULL,'common',NULL,'low',1,NULL,NULL,NULL,'2026-05-25 19:53:58','2026-05-25 21:48:40',NULL);
/*!40000 ALTER TABLE `prize_definitions` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-06-21 19:08:14
