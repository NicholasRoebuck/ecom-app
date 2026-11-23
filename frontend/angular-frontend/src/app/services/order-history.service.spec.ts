import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { OrderHistoryService } from './order-history.service';
import { environment } from '../../environments/environment';

describe('OrderHistoryService account endpoint', () => {
  let service: OrderHistoryService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({imports: [HttpClientTestingModule]});
    service = TestBed.inject(OrderHistoryService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('requests the current account without a browser-supplied email or owner identifier', () => {
    service.getOrderHistory().subscribe();
    const request = http.expectOne(req => req.url === environment['premearAppApiUrl'] + '/me/orders');
    expect(request.request.params.keys().sort()).toEqual(['page', 'size']);
    expect(request.request.params.get('page')).toBe('0');
    expect(request.request.params.get('size')).toBe('20');
    request.flush({content: [], page: {size: 20, totalElements: 0, totalPages: 0, number: 0}});
  });

  it('passes pagination without changing the identity source', () => {
    service.getOrderHistory(2, 20).subscribe();
    const request = http.expectOne(req => req.url.endsWith('/me/orders'));
    expect(request.request.params.get('page')).toBe('2');
    expect(request.request.params.get('email')).toBeNull();
    request.flush({content: [], page: {size: 20, totalElements: 0, totalPages: 0, number: 2}});
  });
});
