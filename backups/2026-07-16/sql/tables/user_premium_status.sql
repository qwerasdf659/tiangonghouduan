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
-- Table structure for table `user_premium_status`
--

DROP TABLE IF EXISTS `user_premium_status`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_premium_status` (
  `user_premium_status_id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL COMMENT '用户ID（关联users表，唯一约束确保一个用户只有一条记录，用于查询用户解锁状态）',
  `is_unlocked` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否已解锁高级空间（当前状态，TRUE=已解锁且在有效期内，FALSE=未解锁或已过期，用于前端权限判断）',
  `unlock_time` datetime DEFAULT NULL COMMENT '最近一次解锁时间（北京时间，每次解锁时更新，用于计算过期时间和运营分析）',
  `unlock_method` enum('points','exchange','vip','manual') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'points' COMMENT '解锁方式（points=积分解锁100分，exchange=兑换码解锁，vip=VIP会员解锁，manual=管理员手动解锁，扩展性预留字段）',
  `total_unlock_count` int NOT NULL DEFAULT '0' COMMENT '累计解锁次数（包括首次解锁和重新解锁，每次解锁+1，用于运营分析用户活跃度和付费意愿）',
  `expires_at` datetime DEFAULT NULL COMMENT '过期时间（24小时有效期，unlock_time + 24小时，NULL表示未解锁或已过期，用于判断是否需要重新解锁，查询时WHERE expires_at > NOW()）',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间（首次解锁时间，永不更新，用于历史追溯和用户分析）',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间（每次解锁时自动更新，MySQL自动维护，用于追踪最后修改时间）',
  PRIMARY KEY (`user_premium_status_id`),
  UNIQUE KEY `idx_user_id` (`user_id`),
  KEY `idx_is_unlocked` (`is_unlocked`),
  KEY `idx_expires_at` (`expires_at`),
  CONSTRAINT `fk_ups_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户高级空间状态表（极简版，无自动续费字段，降低维护成本60%，适合数据量<1000的小项目）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_premium_status`
--

LOCK TABLES `user_premium_status` WRITE;
/*!40000 ALTER TABLE `user_premium_status` DISABLE KEYS */;
INSERT INTO `user_premium_status` VALUES
(3,32,0,'2026-06-22 22:59:38','manual',9,NULL,'2026-06-22 22:59:38','2026-07-15 21:27:54'),
(4,12798,0,'2026-06-25 02:08:59','manual',2,NULL,'2026-06-25 02:08:59','2026-06-25 02:15:15');
/*!40000 ALTER TABLE `user_premium_status` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-07-16  3:11:54
