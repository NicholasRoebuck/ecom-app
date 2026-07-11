import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { OrderHistory } from '../common/order-history';

@Injectable({
  providedIn: 'root'
})
export class OrderHistoryService {

  private orderUrl = 'http://localhost:8080/api/orders';

  constructor(private httpClient: HttpClient) { }


  getOrderHistory(email: string): Observable<GetResponseOrderHistory>{

    // create url based on customer email
    const orderHistoryEmail = `${this.orderUrl}/search/findByCustomerEmailOrderByDateCreatedDesc?email=${email}`;

    return this.httpClient.get<GetResponseOrderHistory>(orderHistoryEmail);
  }


}

interface GetResponseOrderHistory{
  _embedded: {
    orders: OrderHistory[];
  }
}
