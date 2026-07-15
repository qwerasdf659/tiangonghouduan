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
-- Table structure for table `store_staff`
--

DROP TABLE IF EXISTS `store_staff`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `store_staff` (
  `store_staff_id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键ID（自增）',
  `user_id` int NOT NULL COMMENT '员工用户ID（外键关联 users.user_id）',
  `store_id` int NOT NULL COMMENT '门店ID（外键关联 stores.store_id）',
  `sequence_no` int NOT NULL DEFAULT '1' COMMENT '序列号（同一用户在同一门店的第N次入职记录）',
  `role_in_store` enum('staff','manager') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'staff' COMMENT '门店内角色：staff=员工，manager=店长',
  `status` enum('active','inactive','pending','deleted') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending' COMMENT '状态：active=在职，inactive=离职，pending=待审核，deleted=已删除',
  `joined_at` datetime DEFAULT NULL COMMENT '入职时间（审核通过后设置）',
  `left_at` datetime DEFAULT NULL COMMENT '离职时间（离职时设置）',
  `operator_id` int DEFAULT NULL COMMENT '操作者ID（邀请/审批此员工的用户）',
  `notes` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '备注信息',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `deleted_at` datetime DEFAULT NULL COMMENT '删除时间（status=deleted 时设置）',
  `delete_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '删除原因',
  `can_view_redemption_stats` tinyint(1) NOT NULL DEFAULT '0' COMMENT '店员是否被授权查看本店核销概况（manager 恒可看不依赖此列）',
  PRIMARY KEY (`store_staff_id`),
  UNIQUE KEY `uk_store_staff_user_store_seq` (`user_id`,`store_id`,`sequence_no`),
  KEY `operator_id` (`operator_id`),
  KEY `idx_store_staff_user_status` (`user_id`,`status`),
  KEY `idx_store_staff_store_status` (`store_id`,`status`),
  KEY `idx_store_staff_status_role` (`status`,`role_in_store`),
  KEY `idx_store_staff_deleted` (`status`,`deleted_at`),
  CONSTRAINT `store_staff_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `store_staff_ibfk_2` FOREIGN KEY (`store_id`) REFERENCES `stores` (`store_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `store_staff_ibfk_3` FOREIGN KEY (`operator_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='门店员工关系表（员工-门店多对多，支持历史记录）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `store_staff`
--

LOCK TABLES `store_staff` WRITE;
/*!40000 ALTER TABLE `store_staff` DISABLE KEYS */;
INSERT INTO `store_staff` VALUES
(4,31,7,1,'manager','inactive','2026-01-13 00:00:51','2026-06-12 21:33:42',NULL,'测试离职','2026-01-13 07:23:36','2026-06-12 21:33:42',NULL,NULL,0),
(5,31,8,1,'manager','inactive','2026-01-13 00:00:51','2026-02-22 23:27:37',NULL,'测试离职','2026-01-13 07:23:36','2026-02-22 23:27:37',NULL,NULL,0),
(6,31,10,1,'manager','inactive','2026-01-21 21:14:43','2026-02-22 23:22:40',135,'测试离职','2026-01-21 21:14:43','2026-02-22 23:22:40',NULL,NULL,0),
(7,31,9,1,'manager','inactive','2026-02-21 18:07:11','2026-02-21 20:06:56',NULL,'测试离职','2026-02-21 18:07:11','2026-02-21 20:06:56',NULL,NULL,0),
(8,31,11,1,'manager','inactive','2026-02-21 18:07:11','2026-02-21 22:01:12',NULL,'测试离职','2026-02-21 18:07:11','2026-02-21 22:01:12',NULL,NULL,0),
(9,32,7,1,'manager','active','2026-06-21 04:40:02',NULL,NULL,NULL,'2026-06-21 04:40:02','2026-06-21 04:40:02',NULL,NULL,0);
/*!40000 ALTER TABLE `store_staff` ENABLE KEYS */;
UNLOCK TABLES;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_general_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'IGNORE_SPACE,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`%`*/ /*!50003 TRIGGER `trg_store_staff_before_insert` BEFORE INSERT ON `store_staff` FOR EACH ROW BEGIN
        DECLARE active_count INT;
        DECLARE max_seq INT;

        -- 检查是否已有 active 记录
        IF NEW.status = 'active' THEN
          SELECT COUNT(*) INTO active_count
          FROM store_staff
          WHERE user_id = NEW.user_id
            AND store_id = NEW.store_id
            AND status = 'active';

          IF active_count > 0 THEN
            SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'STORE_STAFF_DUPLICATE_ACTIVE: 该员工在此门店已有在职记录';
          END IF;
        END IF;

        -- 自动计算 sequence_no
        SELECT COALESCE(MAX(sequence_no), 0) + 1 INTO max_seq
        FROM store_staff
        WHERE user_id = NEW.user_id
          AND store_id = NEW.store_id;

        SET NEW.sequence_no = max_seq;
      END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_general_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'IGNORE_SPACE,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`%`*/ /*!50003 TRIGGER `trg_store_staff_before_update` BEFORE UPDATE ON `store_staff` FOR EACH ROW BEGIN
        DECLARE active_count INT;

        -- 如果状态变为 active，检查是否已有其他 active 记录
        IF NEW.status = 'active' AND OLD.status != 'active' THEN
          SELECT COUNT(*) INTO active_count
          FROM store_staff
          WHERE user_id = NEW.user_id
            AND store_id = NEW.store_id
            AND status = 'active'
            AND store_staff_id != NEW.store_staff_id;

          IF active_count > 0 THEN
            SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'STORE_STAFF_DUPLICATE_ACTIVE: 该员工在此门店已有在职记录';
          END IF;
        END IF;
      END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-06-21 19:08:15
