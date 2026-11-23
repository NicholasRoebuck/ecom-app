import { convertToParamMap } from '@angular/router';
import { appendCatalogFilters, readCatalogFilters, matchesCatalogFilters } from './catalog-filters';
import { ProductVariant } from './product-variant';
describe('Catalog filter URL contract', () => {
  it('retains zero prices and safely encodes names and punctuation', () => {
    const url = appendCatalogFilters('/products?page=0', {minPrice: 0, maxPrice: 200, inStock: true, options: {'Lens type': 'Rose & Gold'}});
    const query = new URL(url, 'https://example.test').searchParams;
    expect(query.get('minPrice')).toBe('0'); expect(query.get('inStock')).toBe('true');
    expect(query.get('option.Lens type')).toBe('Rose & Gold');
  });
  it('restores filter state from a shared URL', () => {
    expect(readCatalogFilters(convertToParamMap({minPrice: '0', maxPrice: '100.50', inStock: 'true', 'option.Color': 'Blue'})))
      .toEqual({minPrice: 0, maxPrice: 100.5, inStock: true, options: {Color: 'Blue'}});
  });
  it('rejects invalid ranges, quantities of values and option names', () => {
    for (const query of [{minPrice: '-1'}, {minPrice: 'NaN'}, {minPrice: '0.001'}, {minPrice: '100000000'},
      {minPrice: '20', maxPrice: '10'}, {inStock: 'yes'}, {'option.Color': ['Red', 'Blue']}, {'option.': 'Blue'}])
      expect(() => readCatalogFilters(convertToParamMap(query))).toThrow();
  });
  it('supports option names that coincide with object prototype keys', () => {
    const filters = readCatalogFilters(convertToParamMap({'option.__proto__': 'Blue'}));
    expect(Object.keys(filters.options)).toEqual(['__proto__']); expect(filters.options['__proto__']).toBe('Blue');
  });
  it('matches options, stock and price on one active variant', () => {
    const red = new ProductVariant(1, 'RED', 100, '', true, 0, {Color: 'Red'});
    const blue = new ProductVariant(2, 'BLUE', 250, '', true, 2, {Color: 'Blue'});
    const filters = {maxPrice: 200, inStock: true, options: {Color: 'Red'}};
    expect(matchesCatalogFilters(red, filters)).toBeFalse(); expect(matchesCatalogFilters(blue, filters)).toBeFalse();
    expect(matchesCatalogFilters({...red, unitsInStock: 1}, filters)).toBeTrue();
    expect(matchesCatalogFilters({...red, unitsInStock: 1, active: false}, filters)).toBeFalse();
  });
});
