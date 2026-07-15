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
-- Table structure for table `lottery_campaign_user_quota`
--

DROP TABLE IF EXISTS `lottery_campaign_user_quota`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `lottery_campaign_user_quota` (
  `lottery_campaign_user_quota_id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL COMMENT '用户ID（外键关联users.user_id）',
  `lottery_campaign_id` int NOT NULL,
  `quota_total` int unsigned NOT NULL DEFAULT '0' COMMENT '配额总额（整数分值）',
  `quota_used` int unsigned NOT NULL DEFAULT '0' COMMENT '已使用配额（整数分值）',
  `quota_remaining` int unsigned NOT NULL DEFAULT '0' COMMENT '剩余配额（quota_total - quota_used，冗余便于查询）',
  `expires_at` datetime DEFAULT NULL COMMENT '配额过期时间（null表示跟随活动结束时间）',
  `status` enum('active','exhausted','expired') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active' COMMENT '配额状态：active-正常, exhausted-已耗尽, expired-已过期',
  `last_used_at` datetime DEFAULT NULL COMMENT '最后一次使用配额的时间',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`lottery_campaign_user_quota_id`),
  UNIQUE KEY `uk_user_campaign_quota` (`user_id`,`lottery_campaign_id`),
  KEY `idx_quota_campaign_status` (`lottery_campaign_id`,`status`),
  KEY `idx_quota_user_status` (`user_id`,`status`),
  CONSTRAINT `fk_user_quota_campaign_id` FOREIGN KEY (`lottery_campaign_id`) REFERENCES `lottery_campaigns` (`lottery_campaign_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_user_quota_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户活动配额表 - pool+quota模式下追踪用户预算配额';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `lottery_campaign_user_quota`
--

LOCK TABLES `lottery_campaign_user_quota` WRITE;
/*!40000 ALTER TABLE `lottery_campaign_user_quota` DISABLE KEYS */;
/*!40000 ALTER TABLE `lottery_campaign_user_quota` ENABLE KEYS */;
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
