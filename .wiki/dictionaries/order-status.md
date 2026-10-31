---
id: order-status
title: OrderStatus 订单状态枚举
category: dictionaries
tags: [enum, module:order]
summary: 订单状态枚举：01已创建/02已支付/03已发货/99已取消。
tier: supporting
source: mine:enum:test-fixtures/mining
confidence: extracted
created: 2026-10-14T16:50:58.443Z
updated: 2026-10-14T16:50:58.443Z
---

订单状态字典，Java 枚举 `com.pingan.iobs.order.OrderStatus`。

| 名称 | 编码 | 说明 |
|---|---|---|
| CREATED | 01 | 已创建 |
| PAID | 02 | 已支付 |
| SHIPPED | 03 | 已发货 |
| CANCELLED | 99 | 已取消 |

来源：test-fixtures/mining/OrderEnum.java:6-10
