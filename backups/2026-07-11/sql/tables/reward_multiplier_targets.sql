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
-- Table structure for table `reward_multiplier_targets`
--

DROP TABLE IF EXISTS `reward_multiplier_targets`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `reward_multiplier_targets` (
  `reward_multiplier_target_id` bigint NOT NULL AUTO_INCREMENT COMMENT '作用对象主键',
  `multiplier_campaign_id` bigint NOT NULL COMMENT '所属倍率规则（FK→reward_multiplier_campaigns.multiplier_campaign_id）',
  `target_type` enum('segment','tag','growth_level','user') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '对象类型：segment/tag/growth_level/user',
  `target_ref` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '引用现网人群标识：segment→该活动 resolver_version 内的 segment_key / tag→user_ad_tags.tag_key / growth_level→user_growth_levels.level_key / user→users.user_id',
  `target_value` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '可选精确值：target_type=tag 时匹配 user_ad_tags.tag_value；其它类型可空',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间（北京时间）',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间（北京时间）',
  PRIMARY KEY (`reward_multiplier_target_id`),
  UNIQUE KEY `uk_rmt_campaign_type_ref` (`multiplier_campaign_id`,`target_type`,`target_ref`),
  KEY `idx_rmt_ref` (`target_type`,`target_ref`),
  CONSTRAINT `fk_rmt_campaign` FOREIGN KEY (`multiplier_campaign_id`) REFERENCES `reward_multiplier_campaigns` (`multiplier_campaign_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=58 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='倍率规则作用对象（仅引用现网人群标识；target_type=all 时本表无记录）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `reward_multiplier_targets`
--

LOCK TABLES `reward_multiplier_targets` WRITE;
/*!40000 ALTER TABLE `reward_multiplier_targets` DISABLE KEYS */;
/*!40000 ALTER TABLE `reward_multiplier_targets` ENABLE KEYS */;
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
