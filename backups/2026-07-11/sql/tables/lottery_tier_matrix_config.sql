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
-- Table structure for table `lottery_tier_matrix_config`
--

DROP TABLE IF EXISTS `lottery_tier_matrix_config`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `lottery_tier_matrix_config` (
  `lottery_tier_matrix_config_id` int NOT NULL AUTO_INCREMENT,
  `lottery_campaign_id` int NOT NULL COMMENT '关联的抽奖活动ID（支持多活动策略隔离）',
  `budget_tier` enum('B0','B1','B2','B3','ALL') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ALL',
  `pressure_tier` enum('P0','P1','P2') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Pressure Tier 活动压力层级',
  `cap_multiplier` decimal(5,2) NOT NULL DEFAULT '1.00' COMMENT '预算上限乘数（0表示强制空奖）',
  `empty_weight_multiplier` decimal(5,2) NOT NULL DEFAULT '1.00' COMMENT '空奖权重乘数（<1抑制空奖，>1增强空奖）',
  `description` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '配置描述',
  `is_active` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否启用',
  `created_by` int DEFAULT NULL COMMENT '创建人ID',
  `updated_by` int DEFAULT NULL COMMENT '更新人ID',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `high_multiplier` decimal(5,2) NOT NULL DEFAULT '0.00' COMMENT 'high档位权重乘数',
  `mid_multiplier` decimal(5,2) NOT NULL DEFAULT '0.00' COMMENT 'mid档位权重乘数',
  `low_multiplier` decimal(5,2) NOT NULL DEFAULT '0.00' COMMENT 'low档位权重乘数',
  `fallback_multiplier` decimal(5,2) NOT NULL DEFAULT '1.00' COMMENT 'fallback档位权重乘数',
  PRIMARY KEY (`lottery_tier_matrix_config_id`),
  UNIQUE KEY `uk_matrix_campaign_budget_pressure` (`lottery_campaign_id`,`budget_tier`,`pressure_tier`),
  KEY `idx_matrix_config_campaign` (`lottery_campaign_id`),
  CONSTRAINT `fk_matrix_config_campaign` FOREIGN KEY (`lottery_campaign_id`) REFERENCES `lottery_campaigns` (`lottery_campaign_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=31 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='BxPx矩阵配置表（Budget Tier × Pressure Tier 组合的乘数配置）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `lottery_tier_matrix_config`
--

LOCK TABLES `lottery_tier_matrix_config` WRITE;
/*!40000 ALTER TABLE `lottery_tier_matrix_config` DISABLE KEYS */;
INSERT INTO `lottery_tier_matrix_config` VALUES
(28,1,'ALL','P0',1.00,1.00,'Pressure-Only P0：低压，高档概率略提',1,NULL,NULL,'2026-03-06 17:08:45','2026-03-06 17:08:45',1.30,1.10,0.90,0.80),
(29,1,'ALL','P1',1.00,1.00,'Pressure-Only P1：中压，保持原始权重',1,NULL,NULL,'2026-03-06 17:08:45','2026-03-06 17:08:45',1.00,1.00,1.00,1.00),
(30,1,'ALL','P2',1.00,1.00,'Pressure-Only P2：高压，压低高档提高低档',1,NULL,NULL,'2026-03-06 17:08:45','2026-03-06 17:08:45',0.60,0.80,1.20,1.50);
/*!40000 ALTER TABLE `lottery_tier_matrix_config` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-07-10 18:10:58
