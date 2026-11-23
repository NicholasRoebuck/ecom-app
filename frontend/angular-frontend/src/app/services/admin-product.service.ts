import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../environments/environment';

export interface AdminVariant {
  id: number | null;
  sku: string;
  unitPrice: number;
  imageUrl: string;
  active: boolean;
  unitsInStock: number;
  options: Record<string, string>;
}
export interface ProductOption { name: string; values: string[]; }
export interface VariantDefaults { skuPrefix: string; unitPrice: number; imageUrl: string; active: boolean; unitsInStock: number; }
export interface VariantConfiguration {
  options: ProductOption[];
  defaults: VariantDefaults;
  customizedSkus?: string[] | null;
  excludedCombinations?: Record<string, string>[] | null;
  generationCursor?: string | null;
}
export interface AdminProduct {
  id: number | null;
  name: string;
  description: string;
  categoryId: number;
  revision: string | null;
  variants: AdminVariant[];
  configuration?: VariantConfiguration | null;
}
export interface AdminCategory { id: number; name: string; parentId: number | null; productCount?: number; childCount?: number; }
export interface AdminProductPage {
  content: AdminProduct[];
  page: {number: number; totalPages: number; totalElements: number; size: number};
}

@Injectable({providedIn: 'root'})
export class AdminProductService {
  private readonly url = environment['premearAppApiUrl'] + '/admin/products';
  constructor(private http: HttpClient) {}
  list(search = '', page = 0) {
    return this.http.get<AdminProductPage>(this.url, {params: {search, page, size: 20}});
  }
  categories() { return this.http.get<AdminCategory[]>(this.url + '/categories'); }
  saveCategory(category: {id: number | null; name: string; parentId: number | null; originalName?: string}) {
    const url = environment['premearAppApiUrl'] + '/admin/categories';
    return category.id == null ? this.http.post<AdminCategory>(url, category)
      : this.http.put<AdminCategory>(url + '/' + category.id, category);
  }
  deleteCategory(category: AdminCategory) {
    return this.http.delete<void>(environment['premearAppApiUrl'] + '/admin/categories/' + category.id,
      {params: {originalName: category.name}});
  }
  get(id: number) { return this.http.get<AdminProduct>(this.url + '/' + id); }
  save(product: AdminProduct) {
    return product.id == null ? this.http.post<AdminProduct>(this.url, product)
      : this.http.put<AdminProduct>(this.url + '/' + product.id, product);
  }
  delete(product: AdminProduct) {
    return this.http.delete<void>(this.url + '/' + product.id,
      {params: new HttpParams().set('revision', product.revision!)});
  }
}
