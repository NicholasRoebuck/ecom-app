import { AdminVariant, ProductOption } from '../../services/admin-product.service';

export interface DraftOption { name: string; valuesText: string; originalName: string; existingValue: string; }

export function parseOptionValues(text: string): string[] {
  return (text || '').split(/[,\r\n]+/).map(value => value.trim()).filter(Boolean);
}

export function readProductOptions(drafts: DraftOption[]): ProductOption[] {
  if (drafts.length > 20) throw new Error('Use at most 20 option names.');
  const names = new Set<string>();
  return drafts.map(draft => {
    const name = (draft.name || '').trim();
    const values = parseOptionValues(draft.valuesText);
    if (!name || name.length > 64) throw new Error('Each option needs a name of up to 64 characters.');
    if (names.has(name.toLowerCase())) throw new Error('Product option names must be unique.');
    names.add(name.toLowerCase());
    if (!values.length || values.some(value => value.length > 128))
      throw new Error('Enter comma-separated values, each up to 128 characters.');
    if (new Set(values.map(value => value.toLowerCase())).size !== values.length)
      throw new Error('Remove duplicate values within an option.');
    return {name, values};
  });
}

export function inferProductOptions(variants: AdminVariant[]): ProductOption[] {
  const options = new Map<string, Set<string>>();
  for (const variant of variants) for (const [name, value] of Object.entries(variant.options || {})) {
    if (!options.has(name)) options.set(name, new Set());
    options.get(name)!.add(value);
  }
  return [...options].map(([name, values]) => ({name, values: [...values]}));
}

export function combinationKey(options: Record<string, string>): string {
  return JSON.stringify(Object.entries(options).sort(([a], [b]) => a.localeCompare(b)));
}
export function combinationCount(options: ProductOption[]): bigint {
  return options.reduce((count, option) => count * BigInt(option.values.length), 1n);
}
export function combinationAt(options: ProductOption[], index: bigint): Record<string, string> {
  const result: Record<string, string> = Object.create(null);
  const values: string[] = new Array(options.length);
  for (let i = options.length - 1; i >= 0; i--) {
    const count = BigInt(options[i].values.length);
    values[i] = options[i].values[Number(index % count)]; index /= count;
  }
  options.forEach((option, i) => result[option.name] = values[i]);
  return result;
}
export function remapOptions(old: Record<string, string>, definitions: ProductOption[], drafts: DraftOption[]): Record<string, string> {
  const mapped: Record<string, string> = Object.create(null);
  definitions.forEach((definition, i) => {
    const own = (key: string) => Object.prototype.hasOwnProperty.call(old, key) ? old[key] : undefined;
    mapped[definition.name] = own(definition.name) ?? own(drafts[i].originalName) ??
      (drafts[i].existingValue || definition.values[0]);
  });
  return mapped;
}
export function matchesOptions(values: Record<string, string>, definitions: ProductOption[]): boolean {
  return Object.keys(values).length === definitions.length &&
    definitions.every(option => option.values.includes(values[option.name]));
}
export function suggestSku(prefix: string, options: Record<string, string>, used: Set<string>): string {
  const slug = (text: string) => text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '');
  const base = slug(prefix).slice(0, 80) || 'PRODUCT';
  const values = slug(Object.values(options).join('-')).slice(0, 120) || 'STANDARD';
  let sku: string;
  do { sku = base + '-' + values + '-' + crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase(); }
  while (used.has(sku.toLowerCase()));
  used.add(sku.toLowerCase()); return sku;
}
