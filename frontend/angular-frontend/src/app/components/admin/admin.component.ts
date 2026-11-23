import { CategoryEditorComponent } from './category-editor.component';
import { Component, DestroyRef, HostListener, ViewChild, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AdminCategory, AdminProduct, AdminProductService, AdminVariant, ProductOption, VariantConfiguration } from '../../services/admin-product.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { combinationAt, combinationCount, combinationKey, inferProductOptions, matchesOptions, parseOptionValues, readProductOptions, remapOptions, suggestSku } from './variant-builder';

@Component({
  selector: 'app-admin', standalone: true, imports: [CommonModule, RouterModule, ReactiveFormsModule, CategoryEditorComponent],
  templateUrl: './admin.component.html', styleUrls: ['./admin.css', './admin-products.css', './variant-builder.css']
})
export class AdminComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  @ViewChild(CategoryEditorComponent) categoryEditor?: CategoryEditorComponent;
  products: AdminProduct[] = [];
  categories: AdminCategory[] = [];
  search = ''; page = 0; totalPages = 0; totalElements = 0;
  loading = false; busy = false; generating = false; editorOpen = false;
  current: AdminProduct | null = null;
  listError = ''; categoryError = ''; error = ''; notice = '';
  form: FormGroup;
  changingRows = new Set<any>();
  variantPage = 0;
  readonly variantPageSize = 50;
  private cursor = 0n;
  private syncedSignature = '';
  private excluded: Record<string, string>[] = [];
  private lastSku = '';
  private restoring = false;
  private generationId = 0;
  readonly searchForm = this.fb.group({search: ['']});

  constructor(private api: AdminProductService, private fb: FormBuilder) {
    this.form = fb.group({
      name: ['', [Validators.required, Validators.maxLength(255)]],
      description: ['', Validators.maxLength(255)], categoryId: [null, Validators.required],
      variants: fb.array([]), optionDefinitions: fb.array([]),
      productDetails: fb.group({
        skuPrefix: ['', Validators.maxLength(255)],
        unitPrice: [null, [Validators.required, Validators.min(0), Validators.max(99999999.99), Validators.pattern(/^\d+(\.\d{1,2})?$/)]],
        unitsInStock: [0, [Validators.required, Validators.min(0), Validators.max(2147483647), Validators.pattern(/^\d+$/)]],
        imageUrl: ['', Validators.maxLength(255)], active: [true]
      })
    });
    this.details.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      if (!this.restoring) this.syncInheritedDetails();
    });
    this.destroyRef.onDestroy(() => this.stopGeneration());
  }
  ngOnInit(): void {
    this.loadCategories();
    this.loadList();
  }

  loadCategories(): void {
    this.categoryError = '';
    this.api.categories().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: rows => this.categories = rows,
      error: () => this.categoryError = 'Categories could not be loaded. Try again before editing.'
    });
  }

  @HostListener('window:beforeunload', ['$event'])
  beforeUnload(event: BeforeUnloadEvent): void {
    if (this.categoryEditor?.unsaved || this.busy || this.generating || (this.editorOpen && this.form.dirty)) {
      event.preventDefault(); event.returnValue = '';
    }
  }

  get variants(): FormArray { return this.form.get('variants') as FormArray; }

  categoryName(id: number): string {
    const parts: string[] = [];
    const seen = new Set<number>();
    let category = this.categories.find(c => c.id === id);
    while (category && !seen.has(category.id)) {
      seen.add(category.id); parts.unshift(category.name);
      category = this.categories.find(c => c.id === category!.parentId);
    }
    return parts.join(' / ') || 'Category ' + id;
  }

  loadList(): void {
    this.loading = true; this.listError = '';
    this.api.list(this.search, this.page).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: result => {
        this.products = result.content; this.totalPages = result.page.totalPages;
        this.totalElements = result.page.totalElements; this.loading = false;
        if (this.page > 0 && this.page >= this.totalPages) { this.page = Math.max(0, this.totalPages - 1); this.loadList(); }
      },
      error: error => { this.loading = false; this.listError = this.message(error, 'Products could not be loaded.'); }
    });
  }

  find(): void {
    if (this.loading || this.busy) return;
    this.search = (this.searchForm.value.search || '').trim(); this.page = 0; this.loadList();
  }
  changePage(delta: number): void {
    if (this.loading || this.page + delta < 0 || this.page + delta >= this.totalPages) return;
    this.page += delta; this.loadList();
  }

  canLeave(): boolean {
    return (!this.categoryEditor || this.categoryEditor.canLeave()) && !this.busy && !this.generating && (!this.editorOpen || !this.form.dirty || window.confirm('Discard your unsaved product changes?'));
  }
  create(): void {
    if (!this.canLeave()) return;
    this.open(null);
  }
  edit(id: number): void {
    if (!this.canLeave()) return;
    this.busy = true; this.error = ''; this.notice = '';
    this.api.get(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: product => { this.busy = false; this.open(product); },
      error: error => { this.busy = false; const message = this.message(error, 'Product could not be opened.'); if (this.editorOpen) this.error = message; else this.listError = message; }
    });
  }
  close(): void {
    if (!this.canLeave()) return;
    this.editorOpen = false; this.current = null; this.error = ''; this.form.markAsPristine(); this.loadList();
  }
  reload(): void {
    if (this.current?.id != null) this.edit(this.current.id);
  }


  get definitions(): FormArray { return this.form.get('optionDefinitions') as FormArray; }
  get details(): FormGroup { return this.form.get('productDetails') as FormGroup; }
  get choices(): ProductOption[] {
    try { return readProductOptions(this.definitions.getRawValue()); } catch { return []; }
  }
  get visibleVariants(): {control: any; index: number}[] {
    const start = this.variantPage * this.variantPageSize;
    return this.variants.controls.slice(start, start + this.variantPageSize).map((control, i) => ({control, index: start + i}));
  }
  get variantPages(): number { return Math.ceil(this.variants.length / this.variantPageSize); }
  get hasMoreVariants(): boolean { return this.cursor < combinationCount(this.choices); }
  changeVariantPage(delta: number): void {
    if (this.variantPage + delta >= 0 && this.variantPage + delta < this.variantPages) this.variantPage += delta;
  }
  private open(product: AdminProduct | null): void {
    this.restoring = true; this.current = product; this.editorOpen = true;
    this.error = ''; this.notice = ''; this.variantPage = 0; this.changingRows.clear();
    this.variants.clear(); this.definitions.clear();
    const first = product?.variants[0];
    const details = product?.configuration?.defaults || {
      skuPrefix: '', unitPrice: first?.unitPrice ?? null, unitsInStock: first?.unitsInStock ?? 0,
      imageUrl: first?.imageUrl || '', active: first?.active ?? true
    };
    this.form.reset({name: product?.name || '', description: product?.description || '',
      categoryId: product?.categoryId ?? null, productDetails: details});
    const definitions = product?.configuration?.options || inferProductOptions(product?.variants || []);
    definitions.forEach(option => this.definitions.push(this.definition(option.name, option.values.join(', '), option.name)));
    const custom = product?.configuration?.customizedSkus;
    (product?.variants || []).forEach(v => this.variants.push(this.variantGroup(v,
      custom != null ? custom.includes(v.sku) : v.unitPrice !== details.unitPrice ||
        v.unitsInStock !== details.unitsInStock || v.imageUrl !== details.imageUrl || v.active !== details.active)));
    this.excluded = [...(product?.configuration?.excludedCombinations || [])];
    // Preserve exclusions from the previous editor's bounded previews.
    const total = combinationCount(definitions);
    if (product?.configuration && product.configuration.excludedCombinations == null && total <= 1000n) {
      const existing = new Set((product.variants || []).map(v => combinationKey(v.options)));
      for (let i = 0n; i < total; i++) {
        const options = combinationAt(definitions, i);
        if (!existing.has(combinationKey(options))) this.excluded.push(options);
      }
    }
    this.cursor = product ? BigInt(product.configuration?.generationCursor ?? total.toString()) : 0n;
    this.syncedSignature = product ? JSON.stringify(definitions) : '';
    this.lastSku = details.skuPrefix; this.restoring = false; this.form.markAsPristine();
  }
  private variantGroup(v: AdminVariant, customized = false): FormGroup {
    return this.fb.group({
      id: [v.id], sku: [v.sku, Validators.maxLength(255)], customized: [customized],
      unitPrice: [v.unitPrice, [Validators.required, Validators.min(0), Validators.max(99999999.99), Validators.pattern(/^\d+(\.\d{1,2})?$/)]],
      unitsInStock: [v.unitsInStock, [Validators.required, Validators.min(0), Validators.max(2147483647), Validators.pattern(/^\d+$/)]],
      imageUrl: [v.imageUrl || '', Validators.maxLength(255)], active: [v.active],
      options: [v.options || {}]
    });
  }
  private definition(name = '', valuesText = '', originalName = ''): FormGroup {
    return this.fb.group({name, valuesText, originalName, existingValue: ''});
  }
  addDefinition(): void {
    if (this.busy || this.generating || this.definitions.length >= 20) return;
    this.definitions.push(this.definition()); this.form.markAsDirty();
  }
  removeDefinition(index: number): void {
    if (this.busy || this.generating) return;
    this.definitions.removeAt(index); this.form.markAsDirty();
  }
  definitionValues(index: number): string[] { return parseOptionValues(this.definitions.at(index).value.valuesText); }
  optionLabel(options: Record<string, string>): string {
    return Object.entries(options).map(([name, value]) => name + ': ' + value).join(' / ') || 'Standard';
  }
  needsOptionAssignment(index: number): boolean {
    const d = this.definitions.at(index).value;
    return this.variants.controls.some(row => !Object.prototype.hasOwnProperty.call(row.value.options, d.name.trim()) &&
      (!d.originalName || !Object.prototype.hasOwnProperty.call(row.value.options, d.originalName)));
  }
  rowValue(index: number, name: string): string {
    const options = this.variants.at(index).value.options;
    return Object.prototype.hasOwnProperty.call(options, name) ? options[name] : '';
  }
  setRowValue(index: number, name: string, value: string): void {
    const row = this.variants.at(index);
    row.patchValue({options: {...row.value.options, [name]: value}});
    this.form.markAsDirty();
  }
  customize(index: number): void {
    const row = this.variants.at(index);
    if (this.changingRows.has(row)) { this.changingRows.delete(row); return; }
    this.changingRows.add(row); row.patchValue({customized: true}); this.form.markAsDirty();
  }
  resetCustomization(index: number): void {
    const row = this.variants.at(index); row.patchValue({customized: false});
    this.changingRows.delete(row); this.syncInheritedDetails(true); this.form.markAsDirty();
  }
  syncInheritedDetails(updateSku = false): void {
    if (this.restoring) return;
    const details = this.details.getRawValue();
    const skuChanged = updateSku && details.skuPrefix !== this.lastSku;
    const used = new Set(this.variants.controls.filter(row => row.value.customized).map(row => row.value.sku.toLowerCase()));
    this.variants.controls.forEach(row => {
      if (row.value.customized) return;
      row.patchValue({unitPrice: details.unitPrice, unitsInStock: details.unitsInStock,
        imageUrl: details.imageUrl, active: details.active}, {emitEvent: false});
      if (skuChanged) row.patchValue({sku: this.newSku(row.value.options, used)}, {emitEvent: false});
    });
    if (updateSku) this.lastSku = details.skuPrefix;
  }
  private newSku(options: Record<string, string>, used: Set<string>): string {
    const base = (this.details.value.skuPrefix || '').trim();
    if (!Object.keys(options).length && this.variants.length <= 1 && base && !used.has(base.toLowerCase())) {
      used.add(base.toLowerCase()); return base;
    }
    return suggestSku(base || this.form.value.name, options, used);
  }
  stopGeneration(): void { this.generationId++; this.generating = false; }

  async updateVariants(): Promise<boolean> {
    if (this.busy || this.generating) return false;
    this.error = ''; this.notice = '';
    if (this.details.invalid) { this.details.markAllAsTouched(); this.error = 'Check product price, stock, SKU, and image URL.'; return false; }
    let definitions: ProductOption[];
    try { definitions = readProductOptions(this.definitions.getRawValue()); }
    catch (error) { this.error = (error as Error).message; return false; }
    const signature = JSON.stringify(definitions);
    if (signature !== this.syncedSignature) {
      const drafts = this.definitions.getRawValue();
      const rows = this.variants.controls.map(control => ({control, options: remapOptions(control.value.options, definitions, drafts)}));
      const removed = rows.filter(row => !matchesOptions(row.options, definitions));
      const retained = rows.filter(row => matchesOptions(row.options, definitions));
      const keys = retained.map(row => combinationKey(row.options));
      if (definitions.length && new Set(keys).size !== keys.length) {
        this.error = 'Some variants would have the same options. Customize them or remove an unwanted variant first.'; return false;
      }
      if (removed.length && !window.confirm('Remove ' + removed.length + ' variants whose option values were removed? Existing order details will be retained.')) return false;
      this.excluded = this.excluded.map(options => remapOptions(options, definitions, drafts))
        .filter(options => matchesOptions(options, definitions));
      this.variants.clear();
      retained.forEach(row => { row.control.patchValue({options: row.options}); this.variants.push(row.control); });
      this.definitions.controls.forEach((row, i) => row.patchValue({originalName: definitions[i].name}, {emitEvent: false}));
      this.cursor = 0n; this.syncedSignature = signature; this.variantPage = 0; this.changingRows.clear();
    }
    this.syncInheritedDetails(true);
    const existing = new Set(this.variants.controls.map(row => combinationKey(row.value.options)));
    const excluded = new Set(this.excluded.map(combinationKey));
    const used = new Set(this.variants.controls.map(row => row.value.sku.toLowerCase()));
    const total = combinationCount(definitions);
    const id = ++this.generationId;
    this.generating = true;
    let added = 0; let scanned = 0;
    while (this.cursor < total && added < 50) {
      if (id !== this.generationId) return false;
      const options = combinationAt(definitions, this.cursor++);
      const key = combinationKey(options);
      if (!existing.has(key) && !excluded.has(key)) {
        const details = this.details.getRawValue();
        this.variants.push(this.variantGroup({...details, id: null, sku: this.newSku(options, used), options}));
        existing.add(key); added++;
      }
      if (++scanned % 200 === 0) await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
    if (id !== this.generationId) return false;
    this.generating = false; this.form.markAsDirty();
    this.notice = added ? added + ' variants added. Save product to keep your changes.' : 'Variants are up to date.';
    return true;
  }
  removeVariant(index: number): void {
    if (this.busy || this.generating || this.variants.length === 1) return;
    const row = this.variants.at(index);
    if (row.value.id != null && !window.confirm('Remove this variant when you save the product? Existing order details will be retained.')) return;
    if (Object.keys(row.value.options).length) this.excluded.push(row.value.options);
    this.changingRows.delete(row); this.variants.removeAt(index);
    this.variantPage = Math.min(this.variantPage, Math.max(0, this.variantPages - 1)); this.form.markAsDirty();
  }
  async save(): Promise<void> {
    if (this.busy || this.generating) return;
    this.error = ''; this.notice = '';
    let definitions: ProductOption[];
    try { definitions = readProductOptions(this.definitions.getRawValue()); }
    catch (error) { this.error = (error as Error).message; return; }
    this.syncInheritedDetails(true);
    if (JSON.stringify(definitions) !== this.syncedSignature || !this.variants.length) {
      if (!await this.updateVariants()) return;
    }
    if (this.form.invalid) { this.form.markAllAsTouched(); this.error = 'Check the highlighted fields before saving.'; return; }
    const used = new Set(this.variants.controls.map(row => row.value.sku.toLowerCase()).filter(Boolean));
    const variants: AdminVariant[] = this.variants.getRawValue().map((row: any) => {
      const {customized, ...variant} = row;
      variant.sku = variant.sku.trim() || this.newSku(variant.options, used);
      return variant;
    });
    if (!variants.length || variants.some(v => !matchesOptions(v.options, definitions))) {
      this.error = 'Update variants or customize their options before saving.'; return;
    }
    const configuration: VariantConfiguration = {
      options: definitions, defaults: this.details.getRawValue(),
      customizedSkus: variants.filter((v, index) => this.variants.at(index).value.customized).map(v => v.sku),
      excludedCombinations: this.excluded.filter(options => matchesOptions(options, definitions)),
      generationCursor: this.cursor.toString()
    };
    const raw = this.form.getRawValue();
    const product: AdminProduct = {id: this.current?.id ?? null, revision: this.current?.revision ?? null,
      name: raw.name, description: raw.description, categoryId: raw.categoryId, variants, configuration};
    this.busy = true;
    this.api.save(product).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: saved => { this.busy = false; this.open(saved); this.notice = 'Product saved.'; },
      error: error => { this.busy = false; this.error = this.message(error, 'Product could not be saved. Your changes are still here.'); }
    });
  }
  delete(): void {
    if (this.busy || this.generating || !this.current || !window.confirm('Delete "' + this.current.name + '" and all its variants? It will be removed from the store. Existing order details will be retained.')) return;
    this.busy = true; this.error = ''; this.notice = '';
    this.api.delete(this.current).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.busy = false; this.editorOpen = false; this.current = null; this.form.markAsPristine();
        this.notice = 'Product deleted.'; this.loadList();
      },
      error: error => { this.busy = false; this.error = this.message(error, 'Product could not be deleted.'); }
    });
  }

  private message(error: any, fallback: string): string {
    if (error.status === 401) return 'Your sign-in has expired. Sign in again before continuing.';
    if (error.status === 403) return 'This account no longer has owner access.';
    return error.error?.message || fallback;
  }
}
