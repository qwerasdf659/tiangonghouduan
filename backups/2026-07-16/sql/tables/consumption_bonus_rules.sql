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
-- Table structure for table `consumption_bonus_rules`
--

DROP TABLE IF EXISTS `consumption_bonus_rules`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `consumption_bonus_rules` (
  `consumption_bonus_rule_id` bigint NOT NULL AUTO_INCREMENT COMMENT '消费加成活动规则主键',
  `rule_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '规则名（对内运营识别，如"双11消费加成"）',
  `display_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '对用户展示名（如"双11消费多送50%积分"）',
  `bonus_rate` decimal(4,2) NOT NULL COMMENT '活动加成率（如 0.50=多送50%积分）；与等级倍率加法叠加，受总倍数3.0硬封顶',
  `store_ids` json DEFAULT NULL COMMENT '命中门店ID数组（消费记录 store_id 在列表内才命中）；NULL=不限门店',
  `merchant_ids` json DEFAULT NULL COMMENT '命中商家ID数组（消费记录 merchant_id 在列表内才命中）；NULL=不限商家。store_ids/merchant_ids 任一非空=商家专属活动（优先于全平台），均NULL=全平台活动',
  `start_at` datetime DEFAULT NULL COMMENT '生效开始（北京时间）；NULL=不限',
  `end_at` datetime DEFAULT NULL COMMENT '生效结束（北京时间）；NULL=不限',
  `priority` int NOT NULL DEFAULT '0' COMMENT '优先级（同组多规则命中取最高优先级一条，越大越优先）',
  `max_bonus_rate` decimal(4,2) NOT NULL DEFAULT '2.00' COMMENT '加成率硬上限（发放时二次夹紧，防运营配错；配合总倍数3.0封顶）',
  `status` enum('active','inactive') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'inactive' COMMENT '开关：active 生效 / inactive 停用',
  `remark` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '备注',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间（北京时间）',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间（北京时间）',
  PRIMARY KEY (`consumption_bonus_rule_id`),
  KEY `idx_cbr_status_window` (`status`,`start_at`,`end_at`)
) ENGINE=InnoDB AUTO_INCREMENT=18 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='消费加成活动规则（多活动独立倍率；全平台+商家专属并存，后端按门店/商家/时间自动命中，商家专属优先）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `consumption_bonus_rules`
--

LOCK TABLES `consumption_bonus_rules` WRITE;
/*!40000 ALTER TABLE `consumption_bonus_rules` DISABLE KEYS */;
/*!40000 ALTER TABLE `consumption_bonus_rules` ENABLE KEYS */;
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
