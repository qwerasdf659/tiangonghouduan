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
-- Table structure for table `lottery_user_experience_state`
--

DROP TABLE IF EXISTS `lottery_user_experience_state`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `lottery_user_experience_state` (
  `lottery_user_experience_state_id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL COMMENT '用户ID（外键关联users.user_id）',
  `lottery_campaign_id` int NOT NULL,
  `empty_streak` int NOT NULL DEFAULT '0' COMMENT '连续空奖次数（Pity系统：每次空奖+1，非空奖重置为0）',
  `recent_high_count` int NOT NULL DEFAULT '0' COMMENT '近期高价值奖品次数（AntiHigh：统计窗口内high档位次数）',
  `anti_high_cooldown` int NOT NULL DEFAULT '0' COMMENT 'AntiHigh冷却剩余次数（触发降级后N次抽奖不再检测，0=不在冷却期）',
  `max_empty_streak` int NOT NULL DEFAULT '0' COMMENT '历史最大连续空奖次数（用于分析和优化）',
  `total_draw_count` int NOT NULL DEFAULT '0' COMMENT '该活动总抽奖次数',
  `total_empty_count` int NOT NULL DEFAULT '0' COMMENT '该活动总空奖次数',
  `pity_trigger_count` int NOT NULL DEFAULT '0' COMMENT 'Pity系统触发次数（用于监控效果）',
  `last_draw_at` datetime DEFAULT NULL COMMENT '最后一次抽奖时间（北京时间）',
  `last_draw_tier` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '最后一次抽奖档位（high/mid/low/fallback）',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间（北京时间）',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间（北京时间）',
  PRIMARY KEY (`lottery_user_experience_state_id`),
  UNIQUE KEY `uk_user_campaign_experience` (`user_id`,`lottery_campaign_id`),
  KEY `idx_experience_user_id` (`user_id`),
  KEY `idx_experience_campaign_id` (`lottery_campaign_id`),
  KEY `idx_experience_empty_streak` (`empty_streak`),
  CONSTRAINT `fk_experience_state_campaign_id` FOREIGN KEY (`lottery_campaign_id`) REFERENCES `lottery_campaigns` (`lottery_campaign_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_experience_state_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=104 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户活动级抽奖体验状态表（Pity/AntiEmpty/AntiHigh）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `lottery_user_experience_state`
--

LOCK TABLES `lottery_user_experience_state` WRITE;
/*!40000 ALTER TABLE `lottery_user_experience_state` DISABLE KEYS */;
INSERT INTO `lottery_user_experience_state` VALUES
(93,12799,1,0,2,0,0,149,0,0,'2026-06-25 03:20:16','mid','2026-06-25 03:18:12','2026-06-25 03:20:16'),
(94,12802,1,0,3,0,0,129,0,0,'2026-06-27 07:54:20','low','2026-06-26 07:07:07','2026-06-27 07:54:20'),
(95,12803,1,0,4,0,0,238,0,0,'2026-06-28 03:01:06','low','2026-06-27 08:03:22','2026-06-28 03:01:06'),
(96,12804,1,0,1,0,0,117,0,0,'2026-06-28 03:11:32','low','2026-06-28 03:09:43','2026-06-28 03:11:32'),
(103,32,1,0,3,0,0,58,0,0,'2026-07-16 02:37:37','low','2026-07-15 21:25:29','2026-07-16 02:37:37');
/*!40000 ALTER TABLE `lottery_user_experience_state` ENABLE KEYS */;
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
