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
-- Table structure for table `rarity_defs`
--

DROP TABLE IF EXISTS `rarity_defs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `rarity_defs` (
  `rarity_code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '稀有度代码（主键）：如 common, uncommon, rare, epic, legendary',
  `display_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '显示名称（UI展示）',
  `description` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '稀有度描述',
  `color_hex` varchar(7) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '主题颜色（HEX格式）：如 #FFFFFF',
  `tier` int NOT NULL DEFAULT '1' COMMENT '稀有度等级（数值越高越稀有）',
  `sort_order` int NOT NULL DEFAULT '0' COMMENT '排序顺序（升序）',
  `is_enabled` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否启用',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`rarity_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='稀有度字典表（Rarity Definitions - 物品稀有度等级定义）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `rarity_defs`
--

LOCK TABLES `rarity_defs` WRITE;
/*!40000 ALTER TABLE `rarity_defs` DISABLE KEYS */;
INSERT INTO `rarity_defs` VALUES
('common','普通','常见物品','#9E9E9E',1,1,1,'2026-01-15 06:13:47','2026-01-15 06:13:47'),
('epic','史诗','史诗级稀有物品','#9C27B0',4,4,1,'2026-01-15 06:13:47','2026-01-15 06:13:47'),
('legendary','传说','传说级顶级物品','#FF9800',5,5,1,'2026-01-15 06:13:47','2026-01-15 06:13:47'),
('rare','精良','精良品质物品','#2196F3',3,3,1,'2026-01-15 06:13:47','2026-01-15 06:13:47'),
('uncommon','稀有','较为稀有的物品','#4CAF50',2,2,1,'2026-01-15 06:13:47','2026-01-15 06:13:47');
/*!40000 ALTER TABLE `rarity_defs` ENABLE KEYS */;
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
