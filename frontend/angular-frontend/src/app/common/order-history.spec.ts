import { OrderHistory } from './order-history';
describe('OrderHistory', () => {
  it('retains order identity, totals and creation date', () => {
    const date = new Date('2026-01-01T00:00:00Z');
    const order = new OrderHistory('21', 'tracking-21', 25, 2, date);
    expect(order.id).toBe('21'); expect(order.orderTrackingNumber).toBe('tracking-21');
    expect(order.totalPrice).toBe(25); expect(order.totalQuantity).toBe(2); expect(order.dateCreated).toBe(date);
  });
});
