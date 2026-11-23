import { combinationAt, combinationCount, inferProductOptions, parseOptionValues, readProductOptions, remapOptions, suggestSku } from './variant-builder';

describe('Simple product option helpers', () => {
  it('parses trimmed comma-delimited choices and ignores empty entries', () => {
    expect(parseOptionValues('Small, Medium, , Large, Extra Large,')).toEqual(['Small', 'Medium', 'Large', 'Extra Large']);
  });
  it('accepts more than the previous 100-value and 1000-combination limits', () => {
    const values = Array.from({length: 10001}, (_, i) => 'Value ' + i);
    const definitions = readProductOptions([{name: 'Size', valuesText: values.join(', '), originalName: '', existingValue: ''}]);
    expect(definitions[0].values.length).toBe(10001);
    expect(combinationCount([definitions[0], {...definitions[0], name: 'Color'}])).toBe(100020001n);
  });
  it('finds combinations lazily using exact large indices', () => {
    const values = Array.from({length: 10000}, (_, i) => String(i));
    const definitions = ['A', 'B', 'C', 'D'].map(name => ({name, values}));
    expect(combinationCount(definitions)).toBe(10000000000000000n);
    expect(combinationAt(definitions, 9999999999999999n)).toEqual({A: '9999', B: '9999', C: '9999', D: '9999'});
  });
  it('rejects duplicate names and values without imposing a value count cap', () => {
    const option = {name: 'Size', valuesText: 'Small, small', originalName: '', existingValue: ''};
    expect(() => readProductOptions([option])).toThrowError(/duplicate values/);
    expect(() => readProductOptions([{...option, valuesText: 'Small'}, {...option, name: ' size ', valuesText: 'Large'}])).toThrowError(/names must be unique/);
  });
  it('retains existing choices when adding or renaming a dimension', () => {
    expect(remapOptions({Size: 'Small'}, [{name: 'Fit', values: ['Small']}, {name: 'Color', values: ['Red', 'Blue']}],
      [{name: 'Fit', originalName: 'Size', valuesText: 'Small', existingValue: ''},
       {name: 'Color', originalName: '', valuesText: 'Red, Blue', existingValue: 'Blue'}])).toEqual({Fit: 'Small', Color: 'Blue'});
  });
  it('does not read inherited prototype properties as option values', () => {
    expect(remapOptions({}, [{name: 'constructor', values: ['Standard']}],
      [{name: 'constructor', originalName: '', valuesText: 'Standard', existingValue: ''}])).toEqual({constructor: 'Standard'});
  });
  it('uses one standard combination for products without options', () => {
    expect(combinationCount([])).toBe(1n); expect(combinationAt([], 0n)).toEqual({});
  });
  it('generates distinct optional SKUs within the database field length', () => {
    const used = new Set<string>();
    const one = suggestSku('Outlaw 90', {Size: 'Small'}, used);
    expect(suggestSku('Outlaw 90', {Size: 'Small'}, used)).not.toBe(one);
    expect(one.length).toBeLessThanOrEqual(255);
  });
});
