import { Injectable } from '@angular/core';
import { ProductCategoryNav } from '../common/product-category-nav';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ProductCategoryNavService {

   private baseUrl = 'https://localhost:8443/api/nav/categories';

  constructor(private http: HttpClient) {}

  getTopLevel(): Observable<ProductCategoryNav[]> {
    return this.http.get<ProductCategoryNav[]>(`${this.baseUrl}/top-level`);
  }

  getChildren(parentId: number): Observable<ProductCategoryNav[]> {
    return this.http.get<ProductCategoryNav[]>(`${this.baseUrl}/${parentId}/children`);
  }
}
