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
-- Table structure for table `approval_chain_step_actions`
--

DROP TABLE IF EXISTS `approval_chain_step_actions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `approval_chain_step_actions` (
  `step_action_id` bigint NOT NULL AUTO_INCREMENT COMMENT '会签子记录主键ID',
  `step_id` bigint NOT NULL COMMENT '所属审核步骤ID（外键 → approval_chain_steps.step_id，DB层强约束）',
  `actioned_by` int NOT NULL COMMENT '审核操作人 user_id',
  `action` enum('approve','reject') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '审核动作：approve=通过，reject=拒绝',
  `action_reason` text COLLATE utf8mb4_unicode_ci COMMENT '审批意见',
  `is_escalated` tinyint NOT NULL DEFAULT '0' COMMENT '该条审批是否为越级/超时代审',
  `actioned_at` datetime NOT NULL COMMENT '审核时间（北京时间）',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`step_action_id`),
  UNIQUE KEY `uk_step_actor` (`step_id`,`actioned_by`),
  KEY `idx_acsa_step` (`step_id`),
  CONSTRAINT `approval_chain_step_actions_ibfk_1` FOREIGN KEY (`step_id`) REFERENCES `approval_chain_steps` (`step_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=55 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='审核链会签子记录表（一步多人审批，DB唯一约束防重复投票）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `approval_chain_step_actions`
--

LOCK TABLES `approval_chain_step_actions` WRITE;
/*!40000 ALTER TABLE `approval_chain_step_actions` DISABLE KEYS */;
INSERT INTO `approval_chain_step_actions` VALUES
(1,531,32,'approve','核实无误，审核通过',1,'2026-06-24 02:47:43','2026-06-24 02:47:43','2026-06-24 02:47:43'),
(2,553,32,'approve','核实无误，审核通过',1,'2026-06-25 03:15:43','2026-06-25 03:15:43','2026-06-25 03:15:43'),
(3,554,32,'approve','核实无误，审核通过',0,'2026-06-25 03:16:09','2026-06-25 03:16:09','2026-06-25 03:16:09'),
(6,533,32,'approve','审核通过',1,'2026-06-25 04:32:09','2026-06-25 04:32:09','2026-06-25 04:32:09'),
(15,555,32,'approve','审核通过',1,'2026-06-25 04:32:13','2026-06-25 04:32:13','2026-06-25 04:32:13'),
(16,532,32,'approve','核实无误，审核通过',0,'2026-06-25 04:32:17','2026-06-25 04:32:17','2026-06-25 04:32:17'),
(17,534,32,'approve','核实无误，审核通过',0,'2026-06-25 04:32:19','2026-06-25 04:32:19','2026-06-25 04:32:19'),
(28,549,32,'approve','核实无误，审核通过',0,'2026-06-25 04:32:35','2026-06-25 04:32:35','2026-06-25 04:32:35'),
(29,550,32,'approve','核实无误，审核通过',0,'2026-06-25 04:32:38','2026-06-25 04:32:38','2026-06-25 04:32:38'),
(30,551,32,'approve','核实无误，审核通过',0,'2026-06-25 04:32:41','2026-06-25 04:32:41','2026-06-25 04:32:41'),
(31,552,32,'approve','核实无误，审核通过',0,'2026-06-25 04:32:44','2026-06-25 04:32:44','2026-06-25 04:32:44'),
(32,556,32,'approve','核实无误，审核通过',0,'2026-06-25 04:32:48','2026-06-25 04:32:48','2026-06-25 04:32:48'),
(35,559,32,'approve','核实无误，审核通过',1,'2026-06-26 00:17:58','2026-06-26 00:17:58','2026-06-26 00:17:58'),
(36,560,32,'approve','核实无误，审核通过',0,'2026-06-26 00:18:01','2026-06-26 00:18:01','2026-06-26 00:18:01'),
(37,561,32,'approve','核实无误，审核通过',1,'2026-06-26 00:20:24','2026-06-26 00:20:24','2026-06-26 00:20:24'),
(38,562,32,'approve','核实无误，审核通过',0,'2026-06-26 00:20:30','2026-06-26 00:20:30','2026-06-26 00:20:30'),
(39,563,12798,'approve','核实无误，审核通过',0,'2026-06-26 07:02:48','2026-06-26 07:02:48','2026-06-26 07:02:48'),
(40,564,32,'approve','核实无误，审核通过',0,'2026-06-26 07:06:48','2026-06-26 07:06:48','2026-06-26 07:06:48'),
(41,565,12798,'approve','核实无误，审核通过',0,'2026-06-27 06:29:38','2026-06-27 06:29:38','2026-06-27 06:29:38'),
(42,566,32,'approve','审核通过',0,'2026-06-27 06:32:21','2026-06-27 06:32:21','2026-06-27 06:32:21'),
(43,567,32,'approve','核实无误，审核通过',1,'2026-06-27 07:30:51','2026-06-27 07:30:51','2026-06-27 07:30:51'),
(44,568,32,'approve','核实无误，审核通过',0,'2026-06-27 07:30:54','2026-06-27 07:30:54','2026-06-27 07:30:54'),
(45,569,32,'approve','核实无误，审核通过',1,'2026-06-27 07:53:26','2026-06-27 07:53:26','2026-06-27 07:53:26'),
(46,570,32,'approve','核实无误，审核通过',0,'2026-06-27 07:53:28','2026-06-27 07:53:28','2026-06-27 07:53:28'),
(47,571,32,'approve','核实无误，审核通过',1,'2026-06-27 08:02:54','2026-06-27 08:02:54','2026-06-27 08:02:54'),
(48,572,32,'approve','核实无误，审核通过',0,'2026-06-27 08:02:56','2026-06-27 08:02:56','2026-06-27 08:02:56'),
(49,573,32,'approve','核实无误，审核通过',1,'2026-06-28 01:56:21','2026-06-28 01:56:21','2026-06-28 01:56:21'),
(50,574,32,'approve','核实无误，审核通过',0,'2026-06-28 01:56:24','2026-06-28 01:56:24','2026-06-28 01:56:24'),
(51,575,32,'approve','核实无误，审核通过',1,'2026-06-28 02:35:28','2026-06-28 02:35:28','2026-06-28 02:35:28'),
(52,576,32,'approve','核实无误，审核通过',0,'2026-06-28 02:35:30','2026-06-28 02:35:30','2026-06-28 02:35:30'),
(53,577,32,'approve','核实无误，审核通过',1,'2026-06-28 03:06:39','2026-06-28 03:06:39','2026-06-28 03:06:39'),
(54,578,32,'approve','核实无误，审核通过',0,'2026-06-28 03:06:42','2026-06-28 03:06:42','2026-06-28 03:06:42');
/*!40000 ALTER TABLE `approval_chain_step_actions` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-07-16  3:11:48
