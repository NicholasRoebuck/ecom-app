import { ParamMap } from '@angular/router';
import { ProductVariant } from './product-variant';
export interface CatalogFilters { minPrice?: number; maxPrice?: number; inStock?: boolean; options: Record<string,string>; }
export interface CatalogOption { name: string; values: string[]; }
export interface CatalogFilterOptions { options: CatalogOption[]; }
export function readCatalogFilters(query: ParamMap): CatalogFilters {
  const single = (key: string) => {
    if (query.getAll(key).length > 1) throw new Error('Choose one value for each filter.');
    return query.get(key);
  };
  const price = (value: string | null): number | undefined => {
    if (value === null) return undefined;
    if (!/^\d+(?:\.\d{1,2})?$/.test(value.trim()) || Number(value) > 99999999.99)
      throw new Error('Enter a nonnegative price with at most two decimal places.');
    return Number(value);
  };
  const minPrice = price(single('minPrice')), maxPrice = price(single('maxPrice'));
  if (minPrice != null && maxPrice != null && minPrice > maxPrice) throw new Error('Minimum price must not exceed maximum price.');
  const stock = single('inStock');
  if (stock !== null && stock !== 'true' && stock !== 'false') throw new Error('Choose a valid availability filter.');
  const options: Record<string,string> = Object.create(null);
  for (const key of query.keys.filter(key => key.startsWith('option.')).sort()) {
    const name = key.slice(7), value = single(key);
    if (!name.trim() || name.length > 64 || !value?.trim() || value.length > 128) throw new Error('Choose a valid product option.');
    options[name] = value;
  }
  if (Object.keys(options).length > 20) throw new Error('Choose at most 20 option filters.');
  return {minPrice, maxPrice, inStock: stock === 'true', options};
}
export function appendCatalogFilters(url: string, filters?: CatalogFilters): string {
  if (!filters) return url;
  const params = new URLSearchParams();
  if (filters.minPrice != null) params.set('minPrice', String(filters.minPrice));
  if (filters.maxPrice != null) params.set('maxPrice', String(filters.maxPrice));
  if (filters.inStock) params.set('inStock', 'true');
  Object.keys(filters.options).sort().forEach(name => params.set('option.' + name, filters.options[name]));
  const query = params.toString();
  return query ? url + (url.includes('?') ? '&' : '?') + query : url;
}
export function matchesCatalogFilters(variant: ProductVariant, filters: CatalogFilters): boolean {
  return variant.active && (!filters.inStock || variant.unitsInStock > 0) &&
    (filters.minPrice == null || variant.unitPrice != null && variant.unitPrice >= filters.minPrice) &&
    (filters.maxPrice == null || variant.unitPrice != null && variant.unitPrice <= filters.maxPrice) &&
    Object.keys(filters.options).every(name => variant.options?.[name] === filters.options[name]);
}
