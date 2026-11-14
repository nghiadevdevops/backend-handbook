export const ORDER_STATUSES = ['draft', 'placed', 'paid', 'cancelled'] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];
