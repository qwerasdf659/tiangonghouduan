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
-- Table structure for table `decoration_season`
--

DROP TABLE IF EXISTS `decoration_season`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `decoration_season` (
  `decoration_season_id` int NOT NULL AUTO_INCREMENT COMMENT '装饰赛季主键',
  `season_code` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '赛季业务码（唯一稳定标识，如 s2026_summer）',
  `season_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '赛季名称（展示用）',
  `start_at` datetime DEFAULT NULL COMMENT '赛季开始时间（北京时间）',
  `end_at` datetime DEFAULT NULL COMMENT '赛季结束时间（北京时间）',
  `status` enum('draft','active','ended') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft' COMMENT '赛季状态：draft-草稿 active-进行中 ended-已结束',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间（北京时间）',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间（北京时间）',
  PRIMARY KEY (`decoration_season_id`),
  UNIQUE KEY `uk_decoration_season_code` (`season_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='装饰赛季/限定周期表（造稀缺促星石消耗）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `decoration_season`
--

LOCK TABLES `decoration_season` WRITE;
/*!40000 ALTER TABLE `decoration_season` DISABLE KEYS */;
/*!40000 ALTER TABLE `decoration_season` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-06-21 19:08:12
