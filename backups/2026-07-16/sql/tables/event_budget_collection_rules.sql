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
-- Table structure for table `event_budget_collection_rules`
--

DROP TABLE IF EXISTS `event_budget_collection_rules`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `event_budget_collection_rules` (
  `collection_rule_id` bigint NOT NULL AUTO_INCREMENT COMMENT '归集规则主键',
  `lottery_campaign_id` int NOT NULL COMMENT '归集去向的抽奖活动ID（FK→lottery_campaigns.lottery_campaign_id）；命中本规则的消费预算全额进 EVENT_<该活动campaign_code> 专属桶',
  `rule_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '规则名（对内运营识别，如"新春活动预算归集"）',
  `store_ids` json DEFAULT NULL COMMENT '命中门店ID数组（消费记录 store_id 在列表内才命中）；NULL=不限门店',
  `merchant_ids` json DEFAULT NULL COMMENT '命中商家ID数组（消费记录 merchant_id 在列表内才命中）；NULL=不限商家',
  `event_points_ratio` decimal(10,4) NOT NULL DEFAULT '1.0000' COMMENT '活动积分发放比率：event_points = round(消费金额 × 比率)；可见层入场代币（§12.7），0=只归集预算不发活动积分',
  `start_at` datetime DEFAULT NULL COMMENT '生效开始（北京时间）；NULL=对齐活动 start_time',
  `end_at` datetime DEFAULT NULL COMMENT '生效结束（北京时间）；NULL=对齐活动 end_time',
  `priority` int NOT NULL DEFAULT '0' COMMENT '优先级（多规则同时命中同一笔消费时取最高优先级一条，越大越优先）',
  `status` enum('active','inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'inactive' COMMENT '开关：active 生效 / inactive 停用',
  `remark` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '备注',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间（北京时间）',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间（北京时间）',
  PRIMARY KEY (`collection_rule_id`),
  KEY `idx_ebcr_status_window` (`status`,`start_at`,`end_at`),
  KEY `idx_ebcr_campaign` (`lottery_campaign_id`),
  CONSTRAINT `fk_ebcr_lottery_campaign` FOREIGN KEY (`lottery_campaign_id`) REFERENCES `lottery_campaigns` (`lottery_campaign_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=89 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='活动预算归集规则（限时翻倍活动消费预算重定向 + event_points 发放；§12.10 后端规则自动判定，无人工选择口）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `event_budget_collection_rules`
--

LOCK TABLES `event_budget_collection_rules` WRITE;
/*!40000 ALTER TABLE `event_budget_collection_rules` DISABLE KEYS */;
/*!40000 ALTER TABLE `event_budget_collection_rules` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-07-16  3:11:49
