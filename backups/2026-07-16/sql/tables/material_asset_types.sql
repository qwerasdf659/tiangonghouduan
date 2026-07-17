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
-- Table structure for table `material_asset_types`
--

DROP TABLE IF EXISTS `material_asset_types`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `material_asset_types` (
  `material_asset_type_id` bigint NOT NULL AUTO_INCREMENT COMMENT '材料资产类型ID（主键）',
  `asset_code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '资产代码（Asset Code - 唯一标识）：如 red_shard/red_crystal/orange_shard，必须唯一，与 account_asset_balances.asset_code 关联',
  `display_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '展示名称（Display Name - 用户可见名称）：如"红色碎片""红色水晶"',
  `group_code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '分组代码（Group Code - 材料分组）：如 red/orange/yellow/green/blue/purple，用于材料逐级转换的层级归类',
  `form` enum('shard','gem','currency','quota') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '资产形态：shard=碎片, gem=完整宝石, currency=自由货币, quota=受限配额',
  `tier` int NOT NULL COMMENT '层级（Tier - 材料层级）：数字越大层级越高，如 1-碎片层级，2-水晶层级，用于转换规则校验',
  `sort_order` int NOT NULL DEFAULT '0' COMMENT '排序权重（Sort Order - 展示排序）：数字越小越靠前，用于材料列表展示排序',
  `visible_value_points` bigint DEFAULT NULL COMMENT '可见价值锚点（Visible Value Points - 展示口径）：用户可见的材料价值锚点，如 1 red_shard = 10 visible_value_points，用于展示与比较，可选',
  `budget_value_points` bigint DEFAULT NULL COMMENT '预算价值锚点（Budget Value Points - 系统口径）：系统内部预算计算口径，用于成本核算与风控，可选',
  `is_enabled` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否启用（Is Enabled - 启用状态）：true-启用（可展示可转换），false-禁用（不可展示不可转换）',
  `created_at` datetime NOT NULL COMMENT '创建时间（Created At - 北京时间）：记录创建时间',
  `updated_at` datetime NOT NULL COMMENT '更新时间（Updated At - 北京时间）：记录最后更新时间',
  `is_tradable` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否可交易（Is Tradable - C2C市场交易开关）：TRUE-可在市场挂牌交易，FALSE-禁止市场交易',
  `merchant_id` int DEFAULT NULL COMMENT '归属商家ID（NULL=平台资产，关联 merchants 表）',
  `is_biddable` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否可竞价（Is Biddable - 官方竞价计价币开关）：true-可作为官方竞价计价币，false-不可。与 is_tradable（用户间流通）解耦',
  PRIMARY KEY (`material_asset_type_id`),
  UNIQUE KEY `asset_code` (`asset_code`),
  UNIQUE KEY `uk_material_asset_types_asset_code` (`asset_code`),
  KEY `idx_material_asset_types_group_code` (`group_code`),
  KEY `idx_material_asset_types_is_enabled` (`is_enabled`),
  KEY `idx_tradable_enabled` (`is_tradable`,`is_enabled`),
  KEY `material_asset_types_merchant_id_foreign_idx` (`merchant_id`),
  CONSTRAINT `fk_mat_group_code` FOREIGN KEY (`group_code`) REFERENCES `asset_group_defs` (`group_code`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_material_asset_types_group_code` FOREIGN KEY (`group_code`) REFERENCES `asset_group_defs` (`group_code`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `material_asset_types_merchant_id_foreign_idx` FOREIGN KEY (`merchant_id`) REFERENCES `merchants` (`merchant_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=1380 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `material_asset_types`
--

LOCK TABLES `material_asset_types` WRITE;
/*!40000 ALTER TABLE `material_asset_types` DISABLE KEYS */;
INSERT INTO `material_asset_types` VALUES
(1,'red_core_shard','红源晶碎片','red','shard',1,10,10,1,1,'2025-12-16 04:53:24','2026-02-18 11:33:55',0,NULL,0),
(32,'points','积分','points','currency',0,1,1,0,1,'2025-12-20 00:26:11','2026-06-27 07:24:17',0,NULL,0),
(33,'budget_points','预算积分','points','quota',0,2,1,1,0,'2025-12-20 00:26:11','2026-02-23 17:56:22',0,NULL,0),
(631,'star_stone','星石','currency','currency',10,1,1,0,1,'2026-01-14 09:02:52','2026-06-13 02:05:30',0,NULL,1),
(1094,'red_core_gem','红源晶','red','gem',2,1,10,10,1,'2026-02-18 23:39:33','2026-07-06 00:39:22',0,NULL,0),
(1095,'orange_core_shard','橙源晶碎片','orange','shard',1,20,20,10,1,'2026-02-18 23:39:33','2026-02-18 23:39:33',0,NULL,0),
(1096,'orange_core_gem','橙源晶','orange','gem',2,21,200,100,1,'2026-02-18 23:39:33','2026-02-18 23:39:33',0,NULL,0),
(1097,'yellow_core_shard','黄源晶碎片','yellow','shard',1,30,40,20,1,'2026-02-18 23:39:33','2026-02-18 23:39:33',0,NULL,0),
(1098,'yellow_core_gem','黄源晶','yellow','gem',2,31,400,200,1,'2026-02-18 23:39:33','2026-02-18 23:39:33',0,NULL,0),
(1099,'green_core_shard','绿源晶碎片','green','shard',1,40,80,40,1,'2026-02-18 23:39:33','2026-02-18 23:39:33',0,NULL,0),
(1100,'green_core_gem','绿源晶','green','gem',2,41,800,400,1,'2026-02-18 23:39:33','2026-02-18 23:39:33',0,NULL,0),
(1101,'blue_core_shard','蓝源晶碎片','blue','shard',1,50,160,80,1,'2026-02-18 23:39:33','2026-02-18 23:39:33',0,NULL,0),
(1102,'blue_core_gem','蓝源晶','blue','gem',2,51,1600,800,1,'2026-02-18 23:39:33','2026-02-18 23:39:33',0,NULL,0),
(1103,'purple_core_shard','紫源晶碎片','purple','shard',1,60,320,160,1,'2026-02-18 23:39:33','2026-02-18 23:39:33',0,NULL,0),
(1104,'purple_core_gem','紫源晶','purple','gem',2,61,3200,1600,1,'2026-02-18 23:39:33','2026-02-18 23:39:33',0,NULL,0),
(1126,'star_stone_quota','星石配额','currency','quota',0,100,NULL,NULL,1,'2026-03-02 07:06:59','2026-06-13 02:20:22',0,NULL,0),
(1379,'event_points','活动积分','event','quota',1,99,NULL,NULL,1,'2026-07-06 00:39:23','2026-07-06 00:39:23',0,NULL,0);
/*!40000 ALTER TABLE `material_asset_types` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-07-16  3:11:51
