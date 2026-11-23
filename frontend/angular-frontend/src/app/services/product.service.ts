import { withVisionPreviewImage } from '../common/vision-catalog-preview';
import { CatalogFilters, CatalogFilterOptions, appendCatalogFilters } from '../common/catalog-filters';
import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { Product } from '../common/product';
import { ProductCategory } from '../common/product-category';
import { environment } from '../../environments/environment';
import { ProductCategoryNav } from '../common/product-category-nav';

@Injectable({
  providedIn: 'root'
})
export class ProductService {

  private navCategoryUrl = environment['premearAppApiUrl'] + '/nav/categories';

  private baseUrl = environment['premearAppApiUrl'] + '/products';
  private categoryUrl = environment['premearAppApiUrl'] + '/product-category';

  constructor(private httpClient: HttpClient) { }

  getFilterOptions(categoryId?: number, includeDescendants = false, name?: string): Observable<CatalogFilterOptions> {
    const params = new URLSearchParams();
    if (categoryId != null) { params.set('categoryId', String(categoryId)); params.set('includeDescendants', String(includeDescendants)); }
    if (name !== undefined) params.set('name', name);
    return this.httpClient.get<CatalogFilterOptions>(this.baseUrl + '/filters' + (params.size ? '?' + params.toString() : ''));
  }

  getProduct(productId: number): Observable<Product> {

    // build url based on product id

    const productUrl = `${this.baseUrl}/${productId}`

    return this.httpClient.get<Product>(productUrl).pipe(map(withVisionPreviewImage));
  }

  getProductListPaginate(
    page: number,
    pageSize: number,
    categoryId?: number,
    includeDescendants = false,
    sort = 'catalog',
    filters?: CatalogFilters
  ): Observable<GetResponseProducts> {

    const catalogUrl = categoryId === undefined
      ? `${this.baseUrl}?page=${page}&size=${pageSize}`
      : `${this.baseUrl}/category/${categoryId}?page=${page}&size=${pageSize}` +
        (includeDescendants ? '&includeDescendants=true' : '');

    const searchUrl = catalogUrl + '&sort=' + encodeURIComponent(sort);

    return this.httpClient.get<GetResponseProducts>(appendCatalogFilters(searchUrl, filters)).pipe(
      map(result => ({...result, content: result.content.map(withVisionPreviewImage)})));
  }

  searchProducts(keyword: string): Observable<Product[]> {
    // build URL based on name containing keyword
    const searchUrl = `${this.baseUrl}/search?name=${keyword}`;

    return this.getProducts(searchUrl);
  }

  searchProductsPaginate(page: number, pageSize: number, keyword: string, sort = 'catalog', filters?: CatalogFilters): Observable<GetResponseProducts> {

    // build URL based on keyword

    const searchUrl = `${this.baseUrl}/search?name=${encodeURIComponent(keyword)}&page=${page}&size=${pageSize}&sort=${encodeURIComponent(sort)}`;

    return this.httpClient.get<GetResponseProducts>(appendCatalogFilters(searchUrl, filters)).pipe(
      map(result => ({...result, content: result.content.map(withVisionPreviewImage)})));
  }

  getProductList(categoryId: number): Observable<Product[]> {

    // build URL based on category id

    const searchUrl = `${this.baseUrl}/category/${categoryId}`;

    return this.getProducts(searchUrl);
  }

  private getProducts(searchUrl: string): Observable<Product[]> {
    return this.httpClient.get<GetResponseProducts>(searchUrl).pipe(map(res => res.content.map(withVisionPreviewImage)));
  }

  getProductCategories(): Observable<ProductCategory[]> {
    return this.httpClient.get<ProductCategory[]>(this.navCategoryUrl + '/all');
  }

  getTopLevelCategories(): Observable<ProductCategoryNav[]> {
  return this.httpClient.get<ProductCategoryNav[]>(`${this.navCategoryUrl}/top-level`);
}

getCategoryChildren(parentId: number): Observable<ProductCategoryNav[]> {
  return this.httpClient.get<ProductCategoryNav[]>(`${this.navCategoryUrl}/${parentId}/children`);
}
}

interface GetResponseProducts {
  content: Product[],
  page: {
    size: number,
    totalElements: number,
    totalPages: number,
    number: number
  }
}

interface GetResponseProductCategory {
  _embedded: {
    productCategory: ProductCategory[];
  }
}
