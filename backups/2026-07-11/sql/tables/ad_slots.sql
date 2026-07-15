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
-- Table structure for table `ad_slots`
--

DROP TABLE IF EXISTS `ad_slots`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `ad_slots` (
  `ad_slot_id` int NOT NULL AUTO_INCREMENT COMMENT '广告位主键',
  `slot_key` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '广告位标识（如 home_popup），全局唯一',
  `slot_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '广告位名称（如「首页弹窗位」）',
  `slot_type` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '广告位类型：popup / carousel',
  `position` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '页面位置：home / lottery / profile',
  `max_display_count` int NOT NULL DEFAULT '3' COMMENT '该位每次最多展示广告数',
  `daily_price_star_stone` int NOT NULL COMMENT '固定包天日价（星石）',
  `min_bid_star_stone` int NOT NULL DEFAULT '50' COMMENT '竞价最低日出价（拍板决策4：高门槛50星石）',
  `min_daily_price_star_stone` int NOT NULL DEFAULT '0' COMMENT '最低日价下限（DAU 系数计算结果不得低于此值），0 表示不限制',
  `floor_price_override` int DEFAULT NULL COMMENT '运营手动覆盖的竞价底价（优先于动态计算值），NULL 表示使用自动计算',
  `zone_id` int DEFAULT NULL COMMENT '绑定地域ID（NULL=全站级别广告位）',
  `slot_category` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'display' COMMENT '广告位大类：display=展示广告（按天/竞价）, feed=信息流广告（CPM）',
  `cpm_price_star_stone` int NOT NULL DEFAULT '0' COMMENT '每千次曝光价格（星石），仅 slot_category=feed 时使用',
  `min_budget_star_stone` int NOT NULL DEFAULT '500' COMMENT '竞价最低总预算（拍板决策4：500星石）',
  `is_active` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否开放投放',
  `description` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '广告位描述',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `is_carousel` tinyint NOT NULL DEFAULT '0' COMMENT '是否轮播：0=单张(取priority最高1条)，1=多张轮播',
  `slide_interval_ms` int NOT NULL DEFAULT '3000' COMMENT '轮播间隔毫秒（仅 is_carousel=1 生效，运营可配 2000-8000，硬边界 500-15000）',
  PRIMARY KEY (`ad_slot_id`),
  UNIQUE KEY `slot_key` (`slot_key`),
  KEY `ad_slots_zone_id_foreign_idx` (`zone_id`),
  CONSTRAINT `ad_slots_zone_id_foreign_idx` FOREIGN KEY (`zone_id`) REFERENCES `ad_target_zones` (`zone_id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=21 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='广告位配置表 — Phase 3 广告主自助投放';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `ad_slots`
--

LOCK TABLES `ad_slots` WRITE;
/*!40000 ALTER TABLE `ad_slots` DISABLE KEYS */;
INSERT INTO `ad_slots` VALUES
(4,'profile_popup','个人中心弹窗位','popup','profile',1,50,50,0,NULL,NULL,'display',0,500,1,'个人中心页面弹窗广告位','2026-02-18 21:57:51','2026-02-18 21:57:51',0,3000),
(7,'lottery_popup','抽奖页弹窗','popup','lottery',2,200,50,0,NULL,NULL,'display',0,300,1,'抽奖页面弹窗广告位','2026-02-18 23:41:43','2026-02-18 23:41:43',0,3000),
(11,'home_popup','首页弹窗位','popup','home',3,100,50,0,NULL,NULL,'display',0,300,1,'首页弹窗广告位，用户打开首页时展示','2026-02-19 01:36:58','2026-02-19 01:36:58',0,3000),
(12,'home_carousel','首页轮播位','carousel','home',3,40,20,0,NULL,NULL,'display',0,120,1,'首页轮播图广告位，嵌入首页 swiper 组件','2026-02-19 01:36:58','2026-02-19 01:36:58',0,3000),
(13,'home_announcement','首页公告位','announcement','home',5,0,0,0,NULL,NULL,'display',0,0,1,'首页系统公告展示位（免费）','2026-02-22 12:12:49','2026-02-22 12:12:49',0,3000),
(14,'market_list_feed','交易市场信息流广告位','feed','market_list',3,30,15,20,NULL,NULL,'feed',5,100,1,'展示在交易市场列表中的信息流广告，每隔N条商品穿插一条广告','2026-03-02 21:03:08','2026-03-07 06:46:00',0,3000),
(15,'exchange_list_feed','兑换商城信息流广告位','feed','exchange_list',3,25,10,15,NULL,NULL,'feed',3,80,1,'展示在兑换商城列表中的信息流广告，每隔N条商品穿插一条广告','2026-03-02 21:03:08','2026-03-02 21:03:08',0,3000),
(16,'lottery_top_banner','回馈页头部Banner','top_banner','lottery',5,200,80,0,NULL,NULL,'display',0,500,1,'回馈页头部Banner（运营可配，支持单张/轮播、可选跳转）','2026-06-21 03:59:11','2026-06-21 05:47:53',0,3000),
(17,'profile_top_banner','个人中心头部Banner','top_banner','profile',5,150,80,0,NULL,NULL,'display',0,500,1,'个人中心头部Banner（运营可配，支持单张/轮播、可选跳转）','2026-06-21 03:59:11','2026-06-21 03:59:11',0,3000),
(18,'diy_top_banner','DIY页头部Banner','top_banner','diy',5,150,80,0,NULL,NULL,'display',0,500,1,'DIY页头部Banner（运营可配，支持单张/轮播、可选跳转）','2026-06-21 03:59:11','2026-06-21 03:59:11',0,3000),
(19,'camera_top_banner','拍照页头部Banner','top_banner','camera',5,150,80,0,NULL,NULL,'display',0,500,1,'拍照页头部Banner（运营可配，支持单张/轮播、可选跳转）','2026-06-21 03:59:11','2026-06-21 03:59:11',0,3000),
(20,'exchange_top_banner','商城页头部Banner','top_banner','exchange',5,150,80,0,NULL,NULL,'display',0,500,1,'商城页头部Banner（运营可配，支持单张/轮播、可选跳转）','2026-06-21 03:59:11','2026-06-21 03:59:11',0,3000);
/*!40000 ALTER TABLE `ad_slots` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-07-10 18:10:55
