# Wiki Index

> 由 dsh-knj-obsidian 维护。概念页 / 实体页 / 参考 / 综合 / 项目知识。

## 概念页


## 实体页


## 字典

- [[order-status]] OrderStatus 订单状态枚举 — 订单状态枚举：01已创建/02已支付/03已发货/99已取消。
- [[payment-constants]] PaymentConstants 支付渠道常量 — 支付渠道常量：WX=微信、ALI=支付宝。
- [[simple-flag]] SimpleFlag 简单标记枚举 — 无语义标注的简单枚举 A/B/C。

## 数据结构

- [[table-t-order]] t_order 订单表 — 订单主表：id/order_no/status/amount，唯一键 uk_order_no，索引 idx_status。
- [[table-t-order-item]] t_order_item 订单明细表 — 订单明细表：id/order_id，外键 fk_order_item_order → t_order.id。

## 参考资料


## 综合


## 项目知识

