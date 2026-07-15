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
-- Table structure for table `lottery_draw_quota_rules`
--

DROP TABLE IF EXISTS `lottery_draw_quota_rules`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `lottery_draw_quota_rules` (
  `lottery_draw_quota_rule_id` bigint NOT NULL AUTO_INCREMENT,
  `scope_type` enum('global','campaign','role','user') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '作用域类型：global-全局默认, campaign-活动级, role-角色/人群级, user-用户级',
  `scope_id` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '作用域ID：global固定为"global"，campaign存campaign_id，role存role_uuid，user存user_id',
  `window_type` enum('daily','campaign_total') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'daily' COMMENT '统计窗口类型：daily-每日重置, campaign_total-活动期间累计',
  `limit_value` int unsigned NOT NULL DEFAULT '50' COMMENT '配额上限值：>=0，0代表不限制（仅对global允许0）',
  `timezone` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '+08:00' COMMENT '时区：默认北京时间+08:00',
  `effective_from` datetime DEFAULT NULL COMMENT '生效开始时间：null表示立即生效',
  `effective_to` datetime DEFAULT NULL COMMENT '生效结束时间：null表示永久有效',
  `priority` int NOT NULL DEFAULT '0' COMMENT '优先级：同层级多条命中时决定优先级，数字越大优先级越高',
  `status` enum('active','inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active' COMMENT '规则状态：active-启用, inactive-停用',
  `reason` text COLLATE utf8mb4_unicode_ci COMMENT '规则说明/备注：记录为什么这么配置，便于审计',
  `created_by` int DEFAULT NULL COMMENT '创建人ID（管理员user_id）',
  `updated_by` int DEFAULT NULL COMMENT '更新人ID（管理员user_id）',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`lottery_draw_quota_rule_id`),
  KEY `idx_scope_status_effective` (`scope_type`,`scope_id`,`status`,`effective_from`,`effective_to`),
  KEY `idx_window_status` (`window_type`,`status`)
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `lottery_draw_quota_rules`
--

LOCK TABLES `lottery_draw_quota_rules` WRITE;
/*!40000 ALTER TABLE `lottery_draw_quota_rules` DISABLE KEYS */;
INSERT INTO `lottery_draw_quota_rules` VALUES
(1,'global','global','daily',3,'+08:00',NULL,NULL,0,'inactive','全局默认每日限制3次（修复：原值20000为测试数据）',NULL,31,'2025-12-24 04:36:24','2026-06-11 08:11:31'),
(2,'global','global','daily',20000,'+08:00',NULL,NULL,10,'inactive','重复全局规则，已停用（修复：与rule_id=1重复）',31,31,'2026-01-09 09:11:50','2026-02-15 07:52:33'),
(3,'campaign','1','daily',3,'+08:00',NULL,NULL,50,'inactive','活动1每日限制3次（修复：原值20000为测试数据）',31,31,'2026-01-09 09:11:50','2026-06-11 08:11:26'),
(4,'global','global','daily',5,'+08:00',NULL,NULL,10,'inactive','测试创建全局配额规则',31,31,'2026-01-09 09:15:12','2026-01-09 09:15:12'),
(5,'campaign','1','daily',5,'+08:00',NULL,NULL,50,'inactive',NULL,135,31,'2026-01-09 09:16:51','2026-01-25 21:35:27'),
(6,'campaign','1','daily',50,'+08:00',NULL,NULL,50,'inactive',NULL,135,31,'2026-01-21 23:05:26','2026-01-25 06:14:40'),
(7,'campaign','27','daily',5,'+08:00',NULL,NULL,50,'inactive','活动编辑同步（运营设置每日5次）',31,31,'2026-01-25 21:35:31','2026-02-24 23:32:41'),
(8,'global','global','daily',5,'+08:00',NULL,NULL,10,'inactive','API测试 - 全局默认5次/天',31,31,'2026-02-06 05:01:10','2026-02-06 05:04:02'),
(9,'global','global','daily',5,'+08:00',NULL,NULL,10,'inactive','测试创建全局配额规则',31,31,'2026-02-06 05:29:07','2026-02-06 05:29:07'),
(10,'campaign','26','daily',10,'+08:00',NULL,NULL,50,'active',NULL,31,31,'2026-02-06 06:03:11','2026-02-06 06:03:11'),
(11,'campaign','27','daily',10,'+08:00',NULL,NULL,50,'inactive',NULL,31,31,'2026-02-06 06:06:30','2026-02-06 06:08:58'),
(12,'global','global','daily',5,'+08:00',NULL,NULL,10,'inactive','测试脚本创建-全局规则-待删除',31,31,'2026-02-20 03:58:22','2026-02-20 03:58:22'),
(13,'campaign','27','daily',15,'+08:00',NULL,NULL,50,'inactive','测试脚本创建-活动规则-待删除',31,31,'2026-02-20 03:58:22','2026-02-20 03:58:22'),
(14,'campaign','27','daily',3,'+08:00',NULL,NULL,0,'active','活动编辑同步（运营设置每日3次）',31,31,'2026-02-24 23:33:12','2026-02-24 23:33:29'),
(15,'user','31','daily',9999,'+08:00',NULL,NULL,100,'active',NULL,31,31,'2026-06-11 08:14:35','2026-06-11 08:14:35'),
(16,'campaign','1','daily',3,'+08:00',NULL,NULL,0,'active','活动创建自动同步（每日3次）',32,NULL,'2026-06-15 02:39:09','2026-06-15 02:39:09');
/*!40000 ALTER TABLE `lottery_draw_quota_rules` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-06-21 19:08:13
