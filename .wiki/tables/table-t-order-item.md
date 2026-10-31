---
id: table-t-order-item
title: t_order_item 订单明细表
category: tables
tags: [table, module:order]
summary: 订单明细表：id/order_id，外键 fk_order_item_order → t_order.id。
tier: supporting
source: mine:enum:test-fixtures/mining
confidence: extracted
created: 2026-10-14T16:50:58.443Z
updated: 2026-10-14T16:50:58.443Z
---

订单明细表 `t_order_item`（COMMENT='订单明细表'）。

| 列 | 类型 | 可空 | 注释 | 主键 |
|---|---|---|---|---|
| id | BIGINT AUTO_INCREMENT | 否 | （unknown） | 是 |
| order_id | BIGINT | 否 | 订单ID | 否 |

**索引**：PRIMARY(id)、KEY fk_order(order_id)。
**外键**：fk_order_item_order(order_id) → t_order(id)。

来源：test-fixtures/mining-db/schema.sql:12-18
