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
-- Table structure for table `lottery_user_global_state`
--

DROP TABLE IF EXISTS `lottery_user_global_state`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `lottery_user_global_state` (
  `lottery_user_global_state_id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL COMMENT '用户ID（唯一，外键关联users.user_id）',
  `global_draw_count` int NOT NULL DEFAULT '0' COMMENT '全局总抽奖次数（跨所有活动）',
  `global_empty_count` int NOT NULL DEFAULT '0' COMMENT '全局总空奖次数（跨所有活动）',
  `historical_empty_rate` decimal(5,4) NOT NULL DEFAULT '0.0000' COMMENT '历史空奖率（0.0000-1.0000，运气债务核心指标）',
  `luck_debt_level` enum('none','low','medium','high') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'none' COMMENT '运气债务等级（none/low/medium/high）',
  `luck_debt_multiplier` decimal(4,2) NOT NULL DEFAULT '1.00' COMMENT '运气债务乘数（>1.0表示需补偿，用于提高非空奖概率）',
  `global_high_count` int NOT NULL DEFAULT '0' COMMENT '全局高价值奖品获取次数（high档位）',
  `global_mid_count` int NOT NULL DEFAULT '0' COMMENT '全局中价值奖品获取次数（mid档位）',
  `global_low_count` int NOT NULL DEFAULT '0' COMMENT '全局低价值奖品获取次数（low档位）',
  `participated_campaigns` int NOT NULL DEFAULT '0' COMMENT '参与过的活动数量',
  `last_draw_at` datetime DEFAULT NULL COMMENT '全局最后一次抽奖时间（北京时间）',
  `last_lottery_campaign_id` int DEFAULT NULL COMMENT '最后一次抽奖的活动ID（外键关联 lottery_campaigns.lottery_campaign_id）',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间（北京时间）',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间（北京时间）',
  PRIMARY KEY (`lottery_user_global_state_id`),
  UNIQUE KEY `user_id` (`user_id`),
  KEY `idx_global_state_luck_debt_level` (`luck_debt_level`),
  KEY `idx_global_state_empty_rate` (`historical_empty_rate`),
  KEY `idx_global_state_last_draw_at` (`last_draw_at`),
  KEY `idx_global_state_last_campaign` (`last_lottery_campaign_id`),
  CONSTRAINT `fk_global_state_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户全局抽奖统计表（LuckDebt运气债务机制）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `lottery_user_global_state`
--

LOCK TABLES `lottery_user_global_state` WRITE;
/*!40000 ALTER TABLE `lottery_user_global_state` DISABLE KEYS */;
INSERT INTO `lottery_user_global_state` VALUES
(1,31,4864,0,0.0000,'none',1.00,230,1044,3590,0,'2026-06-14 04:04:49',1,'2026-01-29 03:21:37','2026-06-14 04:04:49'),
(2,32,347,0,0.0000,'none',1.00,2,13,332,0,'2026-06-16 02:12:28',1,'2026-05-18 10:11:42','2026-06-16 02:12:28');
/*!40000 ALTER TABLE `lottery_user_global_state` ENABLE KEYS */;
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
