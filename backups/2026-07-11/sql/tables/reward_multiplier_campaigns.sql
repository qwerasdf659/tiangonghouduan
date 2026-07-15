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
-- Table structure for table `reward_multiplier_campaigns`
--

DROP TABLE IF EXISTS `reward_multiplier_campaigns`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `reward_multiplier_campaigns` (
  `multiplier_campaign_id` bigint NOT NULL AUTO_INCREMENT COMMENT '倍率规则主键',
  `lottery_campaign_id` int NOT NULL COMMENT '绑定的抽奖活动ID（FK→lottery_campaigns.lottery_campaign_id）；该规则只在此活动内生效；强制必填，禁止全局规则（活动隔离）',
  `campaign_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '规则名（对内运营识别）',
  `display_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '对用户展示名（如"新春水晶翻倍"）',
  `multiplier` decimal(4,2) NOT NULL COMMENT '倍率（支持小数，如 1.50/1.75/2.00/2.50），>=1',
  `reward_scope` enum('crystal_all','group','asset_codes') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'crystal_all' COMMENT '作用奖品范围：crystal_all=全部水晶 / group=按 group_code / asset_codes=指定资产码',
  `scope_values` json DEFAULT NULL COMMENT 'reward_scope=group 时存 group_code 数组；=asset_codes 时存 asset_code 数组；=crystal_all 时 NULL',
  `target_type` enum('all','segment','tag','growth_level','user') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'all' COMMENT '作用人群：all=全体 / segment=分群(segment_rule_configs) / tag=标签(user_ad_tags) / growth_level=等级(user_growth_levels) / user=指定用户',
  `rounding_mode` enum('round','floor','ceil') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ceil' COMMENT '小数倍率取整方式（默认 ceil 向上，偏用户体感）：ceil=向上 / round=四舍五入 / floor=向下',
  `stack_strategy` enum('max') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'max' COMMENT '同活动内多规则命中合并策略（当前全局仅 max，预留枚举）',
  `priority` int NOT NULL DEFAULT '0' COMMENT '优先级（并列同倍率时决胜与展示排序，越大越优先）',
  `max_multiplier_cap` decimal(4,2) NOT NULL DEFAULT '3.00' COMMENT '倍率硬上限（默认 3.00，覆盖 2.5 需求且留余量；防误填，发放时二次夹紧）',
  `extra_cost_limit` bigint NOT NULL COMMENT '因翻倍额外送出水晶的成本上限（按 material_asset_types.budget_value_points 折算累计）；本规则的成本刹车；强制必填，达上限自动停翻回落×1',
  `extra_cost_used` bigint NOT NULL DEFAULT '0' COMMENT '本规则已累计的额外翻倍成本（实时累加，达 extra_cost_limit 自动停翻）',
  `per_user_daily_limit` int DEFAULT NULL COMMENT 'per-user 每日最多享受翻倍次数（NULL=不限）；防单人长期薅',
  `eligibility_days` int DEFAULT NULL COMMENT '资格时间盒：仅在"进入命中人群后 N 天内"享翻倍（NULL=不限）；过期实时判定自动失效',
  `per_user_extra_cap` int DEFAULT NULL COMMENT 'per-user 累计翻倍额外发放数量上限（单人最多多拿 N 个水晶，NULL=不限）',
  `start_at` datetime DEFAULT NULL COMMENT '生效开始（北京时间），NULL=不限',
  `end_at` datetime DEFAULT NULL COMMENT '生效结束（北京时间），NULL=不限',
  `status` enum('active','inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'inactive' COMMENT '开关：active 生效 / inactive 停用',
  `remark` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '备注',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间（北京时间）',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间（北京时间）',
  PRIMARY KEY (`multiplier_campaign_id`),
  KEY `idx_rmc_scope_status` (`lottery_campaign_id`,`status`,`start_at`,`end_at`),
  KEY `idx_rmc_target` (`target_type`),
  CONSTRAINT `fk_rmc_lottery_campaign` FOREIGN KEY (`lottery_campaign_id`) REFERENCES `lottery_campaigns` (`lottery_campaign_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=238 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='水晶奖品倍率规则主表（绑定到具体抽奖活动，活动间隔离）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `reward_multiplier_campaigns`
--

LOCK TABLES `reward_multiplier_campaigns` WRITE;
/*!40000 ALTER TABLE `reward_multiplier_campaigns` DISABLE KEYS */;
/*!40000 ALTER TABLE `reward_multiplier_campaigns` ENABLE KEYS */;
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
