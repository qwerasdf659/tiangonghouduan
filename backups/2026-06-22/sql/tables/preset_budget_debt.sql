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
-- Table structure for table `preset_budget_debt`
--

DROP TABLE IF EXISTS `preset_budget_debt`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `preset_budget_debt` (
  `preset_budget_debt_id` bigint NOT NULL AUTO_INCREMENT,
  `lottery_preset_id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `lottery_draw_id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '关联的抽奖记录ID（外键关联 lottery_draws.lottery_draw_id）',
  `user_id` int NOT NULL COMMENT '用户ID（收到预设奖品的用户）',
  `lottery_campaign_id` int NOT NULL,
  `debt_amount` int unsigned NOT NULL COMMENT '欠账金额（系统垫付的预算金额，整数分值）',
  `debt_source` enum('user_budget','pool_budget','pool_quota') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '欠账来源：user_budget-用户预算, pool_budget-活动池预算, pool_quota-池+配额',
  `status` enum('pending','cleared','written_off') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending' COMMENT '欠账状态：pending-待清偿, cleared-已清偿, written_off-已核销',
  `cleared_amount` int unsigned NOT NULL DEFAULT '0' COMMENT '已清偿金额',
  `cleared_at` datetime DEFAULT NULL COMMENT '清偿时间',
  `cleared_by_method` enum('topup','manual','auto') COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '清偿方式：topup-充值触发, manual-手动清偿, auto-自动核销',
  `cleared_by_user_id` int DEFAULT NULL COMMENT '清偿操作人ID',
  `cleared_notes` text COLLATE utf8mb4_unicode_ci COMMENT '清偿备注',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间（欠账产生时间）',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`preset_budget_debt_id`),
  KEY `idx_budget_debt_preset` (`lottery_preset_id`),
  KEY `idx_budget_debt_user_status` (`user_id`,`status`),
  KEY `idx_budget_debt_campaign_status` (`lottery_campaign_id`,`status`),
  KEY `idx_budget_debt_status_time` (`status`,`created_at`),
  CONSTRAINT `fk_budget_debt_preset` FOREIGN KEY (`lottery_preset_id`) REFERENCES `lottery_presets` (`lottery_preset_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_budget_debt_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='预设预算欠账表 - 记录预设强发时的预算垫付';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `preset_budget_debt`
--

LOCK TABLES `preset_budget_debt` WRITE;
/*!40000 ALTER TABLE `preset_budget_debt` DISABLE KEYS */;
/*!40000 ALTER TABLE `preset_budget_debt` ENABLE KEYS */;
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
