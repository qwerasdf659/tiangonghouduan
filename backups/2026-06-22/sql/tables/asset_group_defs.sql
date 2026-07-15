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
-- Table structure for table `asset_group_defs`
--

DROP TABLE IF EXISTS `asset_group_defs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `asset_group_defs` (
  `group_code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '分组代码（主键）：如 currency, points, red, orange, yellow, green, blue, purple',
  `display_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '显示名称（UI展示）',
  `description` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '分组描述',
  `group_type` enum('system','material','custom') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'material' COMMENT '分组类型：system=系统级（积分/货币）, material=材料组, custom=自定义',
  `color_hex` varchar(7) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '主题颜色（HEX格式）：如 #FF0000',
  `sort_order` int NOT NULL DEFAULT '0' COMMENT '排序顺序（升序）',
  `is_enabled` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否启用',
  `is_tradable` tinyint(1) NOT NULL DEFAULT '1' COMMENT '该分组资产是否允许交易',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`group_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='资产分组字典表（Asset Group Definitions - 可交易资产分组定义）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `asset_group_defs`
--

LOCK TABLES `asset_group_defs` WRITE;
/*!40000 ALTER TABLE `asset_group_defs` DISABLE KEYS */;
INSERT INTO `asset_group_defs` VALUES
('blue','蓝色材料','蓝色系列源晶资产','material','#2196F3',14,1,1,'2026-01-15 06:13:47','2026-04-02 04:32:27'),
('currency','货币','系统货币（积分等）','system','#FFD700',1,1,0,'2026-01-15 06:13:47','2026-01-15 06:13:47'),
('green','绿色材料','绿色系列源晶资产','material','#4CAF50',13,1,1,'2026-01-15 06:13:47','2026-04-02 04:32:27'),
('orange','橙色材料','橙色系列源晶资产','material','#FF9800',11,1,1,'2026-01-15 06:13:47','2026-04-02 04:32:27'),
('points','积分','用户积分','system','#FFC107',2,1,0,'2026-01-15 06:13:47','2026-01-15 06:13:47'),
('purple','紫色材料','紫色系列源晶资产','material','#9C27B0',15,1,1,'2026-01-15 06:13:47','2026-04-02 04:32:27'),
('red','红色材料','红色系列源晶资产','material','#F44336',10,1,1,'2026-01-15 06:13:47','2026-04-02 04:32:27'),
('system','系统资产','系统级别资产（积分、星石等）','system','#607D8B',1,1,0,'2026-02-18 23:36:56','2026-04-01 22:55:42'),
('yellow','黄色材料','黄色系列源晶资产','material','#FFEB3B',12,1,1,'2026-01-15 06:13:47','2026-04-02 04:32:27');
/*!40000 ALTER TABLE `asset_group_defs` ENABLE KEYS */;
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
