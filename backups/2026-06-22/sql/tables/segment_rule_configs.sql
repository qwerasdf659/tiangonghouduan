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
-- Table structure for table `segment_rule_configs`
--

DROP TABLE IF EXISTS `segment_rule_configs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `segment_rule_configs` (
  `segment_rule_config_id` int NOT NULL AUTO_INCREMENT COMMENT '分群规则配置ID',
  `version_key` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '版本标识，如 default、v1、custom_spring_2026',
  `version_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '版本显示名称，如"不分群"、"新老用户分层"',
  `description` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '版本描述',
  `rules` json NOT NULL COMMENT '分群规则数组（条件构建器生成的规则 JSON）',
  `is_system` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否系统内置：1=内置（不可删除），0=自定义',
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active' COMMENT '状态：active=启用，archived=已归档',
  `created_by` int DEFAULT NULL COMMENT '创建人用户ID',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`segment_rule_config_id`),
  UNIQUE KEY `version_key` (`version_key`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户分群规则配置表（运营可视化搭建分群条件）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `segment_rule_configs`
--

LOCK TABLES `segment_rule_configs` WRITE;
/*!40000 ALTER TABLE `segment_rule_configs` DISABLE KEYS */;
INSERT INTO `segment_rule_configs` VALUES
(1,'default','不分群','所有用户使用相同的档位概率配置','[{\"label\": \"所有用户\", \"logic\": \"AND\", \"priority\": 0, \"conditions\": [], \"segment_key\": \"default\"}]',1,'active',NULL,'2026-02-22 09:23:48','2026-02-22 09:23:48'),
(2,'v1','新老用户分层','注册7天内为新用户，享受更高的高档位概率','[{\"label\": \"新用户\", \"logic\": \"AND\", \"priority\": 10, \"conditions\": [{\"field\": \"created_at\", \"value\": 7, \"operator\": \"days_within\"}], \"segment_key\": \"new_user\"}, {\"label\": \"普通用户\", \"logic\": \"AND\", \"priority\": 0, \"conditions\": [], \"segment_key\": \"regular_user\"}]',1,'active',NULL,'2026-02-22 09:23:48','2026-02-22 09:23:48'),
(3,'v2','VIP用户分层','基于历史消费积分进行VIP等级分层','[{\"label\": \"高级VIP\", \"logic\": \"AND\", \"priority\": 20, \"conditions\": [{\"field\": \"history_total_points\", \"value\": 100000, \"operator\": \"gte\"}], \"segment_key\": \"vip_premium\"}, {\"label\": \"普通VIP\", \"logic\": \"AND\", \"priority\": 10, \"conditions\": [{\"field\": \"history_total_points\", \"value\": 10000, \"operator\": \"gte\"}], \"segment_key\": \"vip_basic\"}, {\"label\": \"普通用户\", \"logic\": \"AND\", \"priority\": 0, \"conditions\": [], \"segment_key\": \"regular_user\"}]',1,'active',NULL,'2026-02-22 09:23:48','2026-02-22 09:23:48'),
(4,'v3','组合分层策略','同时考虑注册时间和消费等级的综合策略','[{\"label\": \"高价值新用户\", \"logic\": \"AND\", \"priority\": 30, \"conditions\": [{\"field\": \"created_at\", \"value\": 7, \"operator\": \"days_within\"}, {\"field\": \"history_total_points\", \"value\": 10000, \"operator\": \"gte\"}], \"segment_key\": \"new_vip\"}, {\"label\": \"新用户\", \"logic\": \"AND\", \"priority\": 20, \"conditions\": [{\"field\": \"created_at\", \"value\": 7, \"operator\": \"days_within\"}], \"segment_key\": \"new_user\"}, {\"label\": \"VIP用户\", \"logic\": \"AND\", \"priority\": 10, \"conditions\": [{\"field\": \"history_total_points\", \"value\": 10000, \"operator\": \"gte\"}], \"segment_key\": \"vip_user\"}, {\"label\": \"普通用户\", \"logic\": \"AND\", \"priority\": 0, \"conditions\": [], \"segment_key\": \"regular_user\"}]',1,'active',NULL,'2026-02-22 09:23:48','2026-02-22 09:23:48'),
(5,'v4','活跃度分层','基于用户最近活跃情况进行分层，适用于召回活动','[{\"label\": \"高活跃用户\", \"logic\": \"AND\", \"priority\": 20, \"conditions\": [{\"field\": \"last_active_at\", \"value\": 7, \"operator\": \"days_within\"}], \"segment_key\": \"highly_active\"}, {\"label\": \"中等活跃\", \"logic\": \"AND\", \"priority\": 10, \"conditions\": [{\"field\": \"last_active_at\", \"value\": 30, \"operator\": \"days_within\"}], \"segment_key\": \"moderately_active\"}, {\"label\": \"不活跃用户\", \"logic\": \"AND\", \"priority\": 0, \"conditions\": [], \"segment_key\": \"inactive_user\"}]',1,'active',NULL,'2026-02-22 09:23:48','2026-02-22 09:23:48');
/*!40000 ALTER TABLE `segment_rule_configs` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-06-21 19:08:15
