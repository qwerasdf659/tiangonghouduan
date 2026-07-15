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
-- Table structure for table `user_ad_tags`
--

DROP TABLE IF EXISTS `user_ad_tags`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_ad_tags` (
  `user_ad_tag_id` bigint NOT NULL AUTO_INCREMENT COMMENT '用户标签主键',
  `user_id` int NOT NULL COMMENT '用户 ID',
  `tag_key` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '标签键（如 lottery_active_7d / diamond_balance / new_user）',
  `tag_value` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '标签值（如 true / false / 数字字符串）',
  `calculated_at` datetime NOT NULL COMMENT '标签计算时间（凌晨3点定时任务写入）',
  PRIMARY KEY (`user_ad_tag_id`),
  UNIQUE KEY `uk_uat_user_tag` (`user_id`,`tag_key`),
  KEY `idx_uat_tag` (`tag_key`,`tag_value`),
  CONSTRAINT `user_ad_tags_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=656 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户行为标签表 — Phase 5 DMP 人群定向';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_ad_tags`
--

LOCK TABLES `user_ad_tags` WRITE;
/*!40000 ALTER TABLE `user_ad_tags` DISABLE KEYS */;
INSERT INTO `user_ad_tags` VALUES
(6,32,'lottery_active_7d','true','2026-07-10 03:00:00'),
(7,32,'lottery_active_30d','true','2026-07-10 03:00:00'),
(8,32,'lottery_total_count','153','2026-07-10 03:00:00'),
(9,32,'star_stone_balance','2250','2026-07-10 03:00:00'),
(10,32,'star_stone_rich','true','2026-07-10 03:00:00'),
(11,32,'has_red_core_shard','true','2026-07-10 03:00:00'),
(12,32,'exchange_buyer','true','2026-07-10 03:00:00'),
(13,32,'new_user','false','2026-07-10 03:00:00'),
(14,32,'register_days','273','2026-07-10 03:00:00'),
(15,32,'active_7d','true','2026-07-10 03:00:00'),
(16,12796,'lottery_active_7d','false','2026-07-10 03:00:01'),
(17,12796,'lottery_active_30d','false','2026-07-10 03:00:01'),
(18,12796,'lottery_total_count','0','2026-07-10 03:00:01'),
(19,12796,'star_stone_balance','0','2026-07-10 03:00:01'),
(20,12796,'star_stone_rich','false','2026-07-10 03:00:01'),
(21,12796,'has_red_core_shard','false','2026-07-10 03:00:01'),
(22,12796,'exchange_buyer','false','2026-07-10 03:00:01'),
(23,12796,'new_user','false','2026-07-10 03:00:01'),
(24,12796,'register_days','17','2026-07-10 03:00:01'),
(25,12796,'active_7d','false','2026-07-10 03:00:01'),
(26,12797,'lottery_active_7d','false','2026-07-10 03:00:01'),
(27,12797,'lottery_active_30d','false','2026-07-10 03:00:01'),
(28,12797,'lottery_total_count','0','2026-07-10 03:00:01'),
(29,12797,'star_stone_balance','0','2026-07-10 03:00:01'),
(30,12797,'star_stone_rich','false','2026-07-10 03:00:01'),
(31,12797,'has_red_core_shard','false','2026-07-10 03:00:01'),
(32,12797,'exchange_buyer','false','2026-07-10 03:00:01'),
(33,12797,'new_user','false','2026-07-10 03:00:01'),
(34,12797,'register_days','17','2026-07-10 03:00:01'),
(35,12797,'active_7d','false','2026-07-10 03:00:01'),
(36,12798,'lottery_active_7d','false','2026-07-10 03:00:01'),
(37,12798,'lottery_active_30d','false','2026-07-10 03:00:01'),
(38,12798,'lottery_total_count','0','2026-07-10 03:00:01'),
(39,12798,'star_stone_balance','0','2026-07-10 03:00:01'),
(40,12798,'star_stone_rich','false','2026-07-10 03:00:01'),
(41,12798,'has_red_core_shard','false','2026-07-10 03:00:01'),
(42,12798,'exchange_buyer','false','2026-07-10 03:00:01'),
(43,12798,'new_user','false','2026-07-10 03:00:01'),
(44,12798,'register_days','15','2026-07-10 03:00:01'),
(45,12798,'active_7d','false','2026-07-10 03:00:01'),
(46,12799,'lottery_active_7d','false','2026-07-10 03:00:01'),
(47,12799,'lottery_active_30d','true','2026-07-10 03:00:01'),
(48,12799,'lottery_total_count','149','2026-07-10 03:00:01'),
(49,12799,'star_stone_balance','3640','2026-07-10 03:00:01'),
(50,12799,'star_stone_rich','true','2026-07-10 03:00:01'),
(51,12799,'has_red_core_shard','true','2026-07-10 03:00:01'),
(52,12799,'exchange_buyer','false','2026-07-10 03:00:01'),
(53,12799,'new_user','false','2026-07-10 03:00:01'),
(54,12799,'register_days','15','2026-07-10 03:00:01'),
(55,12799,'active_7d','false','2026-07-10 03:00:01'),
(56,12800,'lottery_active_7d','false','2026-07-10 03:00:01'),
(57,12800,'lottery_active_30d','false','2026-07-10 03:00:01'),
(58,12800,'lottery_total_count','0','2026-07-10 03:00:01'),
(59,12800,'star_stone_balance','0','2026-07-10 03:00:01'),
(60,12800,'star_stone_rich','false','2026-07-10 03:00:01'),
(61,12800,'has_red_core_shard','false','2026-07-10 03:00:01'),
(62,12800,'exchange_buyer','false','2026-07-10 03:00:01'),
(63,12800,'new_user','false','2026-07-10 03:00:01'),
(64,12800,'register_days','14','2026-07-10 03:00:01'),
(65,12800,'active_7d','false','2026-07-10 03:00:01'),
(66,12801,'lottery_active_7d','false','2026-07-10 03:00:01'),
(67,12801,'lottery_active_30d','false','2026-07-10 03:00:01'),
(68,12801,'lottery_total_count','0','2026-07-10 03:00:01'),
(69,12801,'star_stone_balance','0','2026-07-10 03:00:01'),
(70,12801,'star_stone_rich','false','2026-07-10 03:00:01'),
(71,12801,'has_red_core_shard','false','2026-07-10 03:00:01'),
(72,12801,'exchange_buyer','false','2026-07-10 03:00:01'),
(73,12801,'new_user','false','2026-07-10 03:00:01'),
(74,12801,'register_days','13','2026-07-10 03:00:01'),
(75,12801,'active_7d','false','2026-07-10 03:00:01'),
(76,12802,'lottery_active_7d','false','2026-07-10 03:00:01'),
(77,12802,'lottery_active_30d','true','2026-07-10 03:00:01'),
(78,12802,'lottery_total_count','129','2026-07-10 03:00:01'),
(79,12802,'star_stone_balance','2970','2026-07-10 03:00:01'),
(80,12802,'star_stone_rich','true','2026-07-10 03:00:01'),
(81,12802,'has_red_core_shard','true','2026-07-10 03:00:01'),
(82,12802,'exchange_buyer','false','2026-07-10 03:00:01'),
(83,12802,'new_user','false','2026-07-10 03:00:01'),
(84,12802,'register_days','13','2026-07-10 03:00:01'),
(85,12802,'active_7d','false','2026-07-10 03:00:01'),
(86,12803,'lottery_active_7d','false','2026-07-10 03:00:01'),
(87,12803,'lottery_active_30d','true','2026-07-10 03:00:01'),
(88,12803,'lottery_total_count','238','2026-07-10 03:00:01'),
(89,12803,'star_stone_balance','7040','2026-07-10 03:00:01'),
(90,12803,'star_stone_rich','true','2026-07-10 03:00:01'),
(91,12803,'has_red_core_shard','true','2026-07-10 03:00:01'),
(92,12803,'exchange_buyer','true','2026-07-10 03:00:01'),
(93,12803,'new_user','false','2026-07-10 03:00:01'),
(94,12803,'register_days','12','2026-07-10 03:00:01'),
(95,12803,'active_7d','false','2026-07-10 03:00:01'),
(96,12804,'lottery_active_7d','false','2026-07-10 03:00:01'),
(97,12804,'lottery_active_30d','true','2026-07-10 03:00:01'),
(98,12804,'lottery_total_count','117','2026-07-10 03:00:01'),
(99,12804,'star_stone_balance','3000','2026-07-10 03:00:01'),
(100,12804,'star_stone_rich','true','2026-07-10 03:00:01'),
(101,12804,'has_red_core_shard','true','2026-07-10 03:00:01'),
(102,12804,'exchange_buyer','false','2026-07-10 03:00:01'),
(103,12804,'new_user','false','2026-07-10 03:00:01'),
(104,12804,'register_days','11','2026-07-10 03:00:01'),
(105,12804,'active_7d','false','2026-07-10 03:00:01'),
(106,12805,'lottery_active_7d','false','2026-07-10 03:00:01'),
(107,12805,'lottery_active_30d','false','2026-07-10 03:00:01'),
(108,12805,'lottery_total_count','0','2026-07-10 03:00:01'),
(109,12805,'star_stone_balance','0','2026-07-10 03:00:01'),
(110,12805,'star_stone_rich','false','2026-07-10 03:00:01'),
(111,12805,'has_red_core_shard','false','2026-07-10 03:00:01'),
(112,12805,'exchange_buyer','false','2026-07-10 03:00:01'),
(113,12805,'new_user','false','2026-07-10 03:00:01'),
(114,12805,'register_days','11','2026-07-10 03:00:01'),
(115,12805,'active_7d','false','2026-07-10 03:00:01'),
(116,12806,'lottery_active_7d','false','2026-07-10 03:00:01'),
(117,12806,'lottery_active_30d','false','2026-07-10 03:00:01'),
(118,12806,'lottery_total_count','0','2026-07-10 03:00:01'),
(119,12806,'star_stone_balance','0','2026-07-10 03:00:01'),
(120,12806,'star_stone_rich','false','2026-07-10 03:00:01'),
(121,12806,'has_red_core_shard','false','2026-07-10 03:00:01'),
(122,12806,'exchange_buyer','false','2026-07-10 03:00:01'),
(123,12806,'new_user','false','2026-07-10 03:00:01'),
(124,12806,'register_days','11','2026-07-10 03:00:01'),
(125,12806,'active_7d','false','2026-07-10 03:00:01'),
(126,12807,'lottery_active_7d','false','2026-07-10 03:00:01'),
(127,12807,'lottery_active_30d','false','2026-07-10 03:00:01'),
(128,12807,'lottery_total_count','0','2026-07-10 03:00:01'),
(129,12807,'star_stone_balance','0','2026-07-10 03:00:01'),
(130,12807,'star_stone_rich','false','2026-07-10 03:00:01'),
(131,12807,'has_red_core_shard','false','2026-07-10 03:00:01'),
(132,12807,'exchange_buyer','false','2026-07-10 03:00:01'),
(133,12807,'new_user','true','2026-07-10 03:00:01'),
(134,12807,'register_days','3','2026-07-10 03:00:01'),
(135,12807,'active_7d','false','2026-07-10 03:00:01');
/*!40000 ALTER TABLE `user_ad_tags` ENABLE KEYS */;
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
