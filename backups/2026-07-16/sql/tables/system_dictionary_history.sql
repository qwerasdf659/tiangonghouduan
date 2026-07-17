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
-- Table structure for table `system_dictionary_history`
--

DROP TABLE IF EXISTS `system_dictionary_history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `system_dictionary_history` (
  `system_dictionary_history_id` int unsigned NOT NULL AUTO_INCREMENT,
  `system_dictionary_id` int unsigned NOT NULL,
  `dict_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '字典类型',
  `dict_code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '字典编码',
  `dict_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '修改前的中文名称',
  `dict_color` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '修改前的颜色',
  `version` int unsigned NOT NULL COMMENT '版本号',
  `changed_by` int unsigned NOT NULL COMMENT '修改人ID',
  `changed_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '修改时间',
  `change_reason` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '修改原因',
  PRIMARY KEY (`system_dictionary_history_id`),
  KEY `idx_dict_id` (`system_dictionary_id`),
  KEY `idx_dict_version` (`system_dictionary_id`,`version`),
  KEY `idx_changed_at` (`changed_at`),
  CONSTRAINT `fk_dict_history_dict` FOREIGN KEY (`system_dictionary_id`) REFERENCES `system_dictionaries` (`system_dictionary_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统字典历史表 - 支持版本回滚';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `system_dictionary_history`
--

LOCK TABLES `system_dictionary_history` WRITE;
/*!40000 ALTER TABLE `system_dictionary_history` DISABLE KEYS */;
/*!40000 ALTER TABLE `system_dictionary_history` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-07-16  3:11:53
