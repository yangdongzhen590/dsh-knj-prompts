---
id: table-t-order
title: t_order 订单表
category: tables
tags: [table, module:order]
summary: 订单主表：id/order_no/status/amount，唯一键 uk_order_no，索引 idx_status。
tier: supporting
source: mine:enum:test-fixtures/mining
confidence: extracted
created: 2026-10-14T16:50:58.443Z
updated: 2026-10-14T16:50:58.443Z
---

订单主表 `t_order`（InnoDB，utf8mb4，COMMENT='订单表'）。

| 列 | 类型 | 可空 | 注释 | 主键 |
|---|---|---|---|---|
| id | BIGINT AUTO_INCREMENT | 否 | 主键 | 是 |
| order_no | VARCHAR(32) | 否 | 订单号 | 否 |
| status | TINYINT DEFAULT 0 | 否 | 状态：0新建 1已支付 | 否 |
| amount | DECIMAL(12,2) | 是 | 金额 | 否 |

JPA 实体 `OrderEntity`（javax.persistence）映射 id/order_no/status 三列，未映射 amount。
MyBatis `OrderMapper.selectByPrimaryKey` 查询列为 id, order_no, status, amount。

**索引**：PRIMARY(id)、UNIQUE uk_order_no(order_no)、idx_status(status)。

来源：test-fixtures/mining-db/schema.sql:1-10；OrderEntity.java:6-16；OrderMapper.xml:4-7
