import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { OrderHistory } from '../common/order-history';
import { environment } from '../../environments/environment';

export interface OrderHistoryResponse {
  content: OrderHistory[];
  page: {size: number; totalElements: number; totalPages: number; number: number};
}

@Injectable({ providedIn: 'root' })
export class OrderHistoryService {
  private orderUrl = environment['premearAppApiUrl'] + '/me/orders';
  constructor(private http: HttpClient) {}

  getOrderHistory(page = 0, size = 20) {
    return this.http.get<OrderHistoryResponse>(this.orderUrl, {
      params: new HttpParams().set('page', page).set('size', size)
    });
  }
}
