import { TestBed } from '@angular/core/testing';
import { of, throwError, Subject } from 'rxjs';
import { OrderHistoryComponent } from './order-history.component';
import { OrderHistoryService, OrderHistoryResponse } from '../../services/order-history.service';

describe('OrderHistoryComponent account history', () => {
  let component: OrderHistoryComponent;
  let api: jasmine.SpyObj<OrderHistoryService>;
  const empty = {content: [], page: {size: 20, totalElements: 0, totalPages: 0, number: 0}};

  beforeEach(() => {
    api = jasmine.createSpyObj('OrderHistoryService', ['getOrderHistory']);
    api.getOrderHistory.and.returnValue(of(empty));
    TestBed.configureTestingModule({providers: [
      OrderHistoryComponent, {provide: OrderHistoryService, useValue: api}
    ]});
    component = TestBed.inject(OrderHistoryComponent);
  });

  it('loads orders without reading the stored email', () => {
    const storage = spyOn(Storage.prototype, 'getItem').and.throwError('Storage must not select the account');
    component.ngOnInit();
    expect(api.getOrderHistory).toHaveBeenCalledWith(0, 20);
    expect(storage).not.toHaveBeenCalled();
    expect(component.loading).toBeFalse();
  });

  it('distinguishes a failed request from an empty order history', () => {
    api.getOrderHistory.and.returnValue(throwError(() => ({status: 401})));
    component.ngOnInit();
    expect(component.error).toContain('Could not load');
    expect(component.loading).toBeFalse();
  });

  it('tracks loading and requests the selected page', () => {
    const response = new Subject<OrderHistoryResponse>();
    api.getOrderHistory.and.returnValue(response);
    component.pageNumber = 2;
    component.handleOrderHistory();
    expect(component.loading).toBeTrue();
    expect(api.getOrderHistory).toHaveBeenCalledWith(1, 20);
    response.next({...empty, page: {...empty.page, number: 1}});
    expect(component.loading).toBeFalse();
  });
});
