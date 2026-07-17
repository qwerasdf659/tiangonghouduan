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
-- Table structure for table `preset_debt_limits`
--

DROP TABLE IF EXISTS `preset_debt_limits`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `preset_debt_limits` (
  `preset_debt_limit_id` int NOT NULL AUTO_INCREMENT,
  `limit_level` enum('global','campaign','prize') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '限制级别：global-全局, campaign-活动, prize-奖品',
  `reference_id` int DEFAULT NULL COMMENT '关联ID：campaign级别为campaign_id，prize级别为prize_id，global级别为null',
  `inventory_debt_limit` int unsigned NOT NULL DEFAULT '100' COMMENT '库存欠账上限数量',
  `budget_debt_limit` int unsigned NOT NULL DEFAULT '100000' COMMENT '预算欠账上限金额（整数分值）',
  `status` enum('active','inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active' COMMENT '配置状态：active-启用, inactive-停用',
  `description` text COLLATE utf8mb4_unicode_ci COMMENT '配置说明',
  `created_by` int DEFAULT NULL COMMENT '创建人ID',
  `updated_by` int DEFAULT NULL COMMENT '更新人ID',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`preset_debt_limit_id`),
  UNIQUE KEY `uk_debt_limits_level_ref` (`limit_level`,`reference_id`),
  KEY `idx_debt_limits_status` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='欠账上限配置表 - 配置各级别的欠账风险上限';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `preset_debt_limits`
--

LOCK TABLES `preset_debt_limits` WRITE;
/*!40000 ALTER TABLE `preset_debt_limits` DISABLE KEYS */;
INSERT INTO `preset_debt_limits` VALUES
(1,'global',NULL,1000,1000000,'active','全局默认欠账上限：库存1000件，预算10000元',NULL,NULL,'2026-01-18 05:10:40','2026-01-18 05:10:40');
/*!40000 ALTER TABLE `preset_debt_limits` ENABLE KEYS */;
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
