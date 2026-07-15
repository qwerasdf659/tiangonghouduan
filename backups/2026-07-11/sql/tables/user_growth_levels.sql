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
-- Table structure for table `user_growth_levels`
--

DROP TABLE IF EXISTS `user_growth_levels`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_growth_levels` (
  `user_growth_level_id` int NOT NULL AUTO_INCREMENT COMMENT '成长等级定义主键',
  `level_key` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '成长等级业务码（如 bronze/silver/gold/diamond），全局稳定标识',
  `level_name` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '成长等级中文名（如 青铜/白银/黄金/钻石），用于展示',
  `min_history_points` int NOT NULL DEFAULT '0' COMMENT '达到该等级所需的累计积分下限（取 users.history_total_points 比对，含本值）',
  `sort_order` int NOT NULL DEFAULT '0' COMMENT '等级排序（由低到高，0 最低）',
  `status` enum('active','inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active' COMMENT '等级状态：active-启用，inactive-停用',
  `description` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '等级说明（含会员权益公示口径）',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间（北京时间）',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间（北京时间）',
  `earn_multiplier` decimal(4,2) NOT NULL DEFAULT '1.00' COMMENT '发放线倍数（消费审核发分时可用积分/预算积分按此放大，1.00=无加成，范围1.00~3.00）',
  PRIMARY KEY (`user_growth_level_id`),
  UNIQUE KEY `uk_user_growth_levels_level_key` (`level_key`),
  KEY `idx_user_growth_levels_status_points` (`status`,`min_history_points`)
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户成长等级定义表（独立体系，累计积分→等级；抽奖等多功能只读复用）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_growth_levels`
--

LOCK TABLES `user_growth_levels` WRITE;
/*!40000 ALTER TABLE `user_growth_levels` DISABLE KEYS */;
INSERT INTO `user_growth_levels` VALUES
(1,'bronze','青铜',0,0,'inactive','成长等级最低档（累计积分 0 起）；阈值为起步占位值，需运营确认','2026-06-05 02:06:53','2026-07-09 22:02:50',1.00),
(2,'silver','白银',100000,1,'inactive','⚠️ 占位阈值 100000，需运营按真实业务规则确认','2026-06-05 02:06:53','2026-07-09 22:02:50',1.00),
(3,'gold','黄金',500000,2,'inactive','⚠️ 占位阈值 500000，需运营按真实业务规则确认','2026-06-05 02:06:53','2026-07-09 22:02:50',1.00),
(4,'diamond','钻石',2000000,3,'inactive','⚠️ 占位阈值 2000000，需运营按真实业务规则确认','2026-06-05 02:06:53','2026-07-09 22:02:50',1.00),
(5,'v1','铜卡',0,1,'active','铜卡：注册即享（累计积分 0 起）','2026-07-09 22:02:50','2026-07-09 22:02:50',1.00),
(6,'v2','银卡',2000,2,'active','银卡：累计积分满 2000（≈累计消费 2000 元）解锁','2026-07-09 22:02:50','2026-07-10 06:05:34',1.05),
(7,'v3','金卡',6000,3,'active','金卡：累计积分满 6000（≈累计消费 6000 元）解锁','2026-07-09 22:02:50','2026-07-10 06:05:34',1.10),
(8,'v4','铂金卡',15000,4,'active','铂金卡：累计积分满 15000（≈累计消费 15000 元）解锁','2026-07-09 22:02:50','2026-07-10 06:05:34',1.15),
(9,'v5','钻石卡',40000,5,'active','钻石卡：累计积分满 40000（≈累计消费 40000 元）解锁','2026-07-09 22:02:50','2026-07-10 06:05:34',1.20),
(10,'v6','黑金卡',100000,6,'active','黑金卡：累计积分满 100000（≈累计消费 100000 元）解锁','2026-07-09 22:02:50','2026-07-10 06:05:34',1.25),
(11,'v7','至尊卡',250000,7,'active','至尊卡：累计积分满 250000（≈累计消费 250000 元）解锁','2026-07-09 22:02:50','2026-07-10 06:05:34',1.30),
(12,'v8','首席贵宾',500000,8,'active','首席贵宾：累计积分满 500000（≈累计消费 500000 元）解锁','2026-07-09 22:02:50','2026-07-10 06:05:34',1.40),
(13,'v9','荣耀殿堂',1000000,9,'active','荣耀殿堂：累计积分满 1000000（≈累计消费 1000000 元）解锁','2026-07-09 22:02:50','2026-07-10 06:05:34',1.50);
/*!40000 ALTER TABLE `user_growth_levels` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-07-10 18:11:00
