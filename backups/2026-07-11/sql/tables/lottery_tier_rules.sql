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
-- Table structure for table `lottery_tier_rules`
--

DROP TABLE IF EXISTS `lottery_tier_rules`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `lottery_tier_rules` (
  `lottery_tier_rule_id` int NOT NULL AUTO_INCREMENT,
  `lottery_campaign_id` int NOT NULL,
  `segment_key` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'default' COMMENT '用户分层标识（如new_user/vip/default），由SegmentResolver解析获得',
  `tier_name` enum('high','mid','low') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '档位名称：high-高档位, mid-中档位, low-低档位（固定三档）',
  `tier_weight` int unsigned NOT NULL COMMENT '档位权重（整数，三个档位权重之和必须=1000000）',
  `status` enum('active','inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active' COMMENT '规则状态：active-启用, inactive-停用',
  `created_by` int DEFAULT NULL COMMENT '创建人ID（管理员user_id）',
  `updated_by` int DEFAULT NULL COMMENT '更新人ID（管理员user_id）',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`lottery_tier_rule_id`),
  UNIQUE KEY `uk_campaign_segment_tier` (`lottery_campaign_id`,`segment_key`,`tier_name`),
  KEY `idx_tier_rules_campaign_status` (`lottery_campaign_id`,`status`),
  CONSTRAINT `fk_tier_rules_campaign_id` FOREIGN KEY (`lottery_campaign_id`) REFERENCES `lottery_campaigns` (`lottery_campaign_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='抽奖档位规则表 - 定义各分层用户的档位概率（整数权重制）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `lottery_tier_rules`
--

LOCK TABLES `lottery_tier_rules` WRITE;
/*!40000 ALTER TABLE `lottery_tier_rules` DISABLE KEYS */;
INSERT INTO `lottery_tier_rules` VALUES
(1,1,'default','high',100000,'active',1,NULL,'2026-01-19 07:36:56','2026-03-06 17:08:45'),
(2,1,'default','mid',250000,'active',1,NULL,'2026-01-19 07:36:56','2026-03-06 17:08:45'),
(3,1,'default','low',650000,'active',1,1,'2026-01-19 07:36:56','2026-03-06 17:08:45'),
(5,1,'new_user','high',200000,'active',1,NULL,'2026-01-19 07:36:56','2026-03-06 17:08:45'),
(6,1,'new_user','mid',250000,'active',1,NULL,'2026-01-19 07:36:56','2026-03-06 17:08:45'),
(7,1,'new_user','low',550000,'active',1,1,'2026-01-19 07:36:56','2026-03-06 17:08:45'),
(9,1,'vip_user','high',80000,'active',1,NULL,'2026-01-19 07:36:56','2026-01-19 07:36:56'),
(10,1,'vip_user','mid',220000,'active',1,NULL,'2026-01-19 07:36:56','2026-01-19 07:36:56'),
(11,1,'vip_user','low',700000,'active',1,1,'2026-01-19 07:36:56','2026-01-19 08:10:25');
/*!40000 ALTER TABLE `lottery_tier_rules` ENABLE KEYS */;
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
