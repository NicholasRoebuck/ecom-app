import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { of, Subject, throwError } from 'rxjs';
import { AdminComponent } from './admin.component';
import { AdminProduct, AdminProductService } from '../../services/admin-product.service';

describe('Simplified admin editor', () => {
  let fixture: ComponentFixture<AdminComponent>;
  let component: AdminComponent;
  let api: jasmine.SpyObj<AdminProductService>;
  const product = (): AdminProduct => ({
    id: 7, name: 'Glasses', description: '', categoryId: 2, revision: 'revision-one',
    variants: [{id: 21, sku: 'GLASSES-BLACK', unitPrice: 25, imageUrl: 'https://example.com/black.jpg',
      active: true, unitsInStock: 5, options: {Color: 'Black'}}]
  });
  beforeEach(async () => {
    api = jasmine.createSpyObj('AdminProductService', ['list', 'categories', 'get', 'save', 'delete']);
    api.list.and.returnValue(of({content: [product()], page: {number: 0, size: 20, totalPages: 1, totalElements: 1}}));
    api.categories.and.returnValue(of([{id: 2, name: 'Glasses', parentId: null}]));
    api.get.and.callFake(() => of(product())); api.save.and.returnValue(of(product())); api.delete.and.returnValue(of(undefined));
    await TestBed.configureTestingModule({imports: [AdminComponent, RouterTestingModule],
      providers: [{provide: AdminProductService, useValue: api}]}).compileComponents();
    fixture = TestBed.createComponent(AdminComponent); component = fixture.componentInstance; fixture.detectChanges();
  });
  function create(): void {
    component.create(); component.form.patchValue({name: 'Outlaw 90', categoryId: 2});
    component.details.patchValue({unitPrice: 40, unitsInStock: 8, imageUrl: 'https://example.com/outlaw.jpg'});
  }
  it('renders product fields and Customize without previews, bulk controls, or selection checkboxes', () => {
    component.edit(7); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#product-price')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('#product-sku')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.bulk-panel')).toBeNull();
    expect(fixture.nativeElement.querySelector('.combination-preview')).toBeNull();
    const card = fixture.nativeElement.querySelector('.variant-panel');
    expect(card.textContent).toContain('Customize');
    expect(card.querySelector('input[type=checkbox]')).toBeNull();
    expect(card.querySelector('input')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Defaults for new variants');
    expect(fixture.nativeElement.textContent).not.toContain('asset path');
  });
  it('creates comma-separated sizes directly on save without a preview', async () => {
    create(); component.addDefinition();
    component.definitions.at(0).patchValue({name: 'Size', valuesText: 'Small, Medium, Large, Extra Large'});
    await component.save();
    const body = api.save.calls.mostRecent().args[0];
    expect(body.variants.length).toBe(4);
    expect(body.variants.every(v => v.unitPrice === 40 && v.unitsInStock === 8)).toBeTrue();
    expect(new Set(body.variants.map(v => v.sku)).size).toBe(4);
    expect(body.configuration!.options[0].values).toEqual(['Small', 'Medium', 'Large', 'Extra Large']);
  });
  it('keeps product SKUs optional and accepts a supplied standard SKU', async () => {
    create(); component.details.patchValue({skuPrefix: 'OUTLAW-90'});
    await component.save();
    expect(api.save.calls.mostRecent().args[0].variants[0].sku).toBe('OUTLAW-90');
  });
  it('adds more than 100 variants in responsive batches and pages the cards', async () => {
    create(); component.addDefinition();
    component.definitions.at(0).patchValue({name: 'Size', valuesText: Array.from({length: 125}, (_, i) => 'Size ' + i).join(', ')});
    await component.updateVariants(); expect(component.variants.length).toBe(50);
    await component.updateVariants(); await component.updateVariants();
    expect(component.variants.length).toBe(125);
    expect(component.visibleVariants.length).toBe(50);
    component.changeVariantPage(2); expect(component.visibleVariants.length).toBe(25);
    await component.save();
    const body = api.save.calls.mostRecent().args[0];
    expect(body.variants.length).toBe(125); expect(body.configuration!.generationCursor).toBe('125');
  });
  it('updates inherited rows and preserves customized overrides', async () => {
    component.edit(7); component.definitions.at(0).patchValue({valuesText: 'Black, White'});
    await component.updateVariants();
    component.customize(0); component.variants.at(0).patchValue({unitPrice: 99, unitsInStock: 2});
    component.details.patchValue({unitPrice: 45, unitsInStock: 12});
    expect(component.variants.at(0).value.unitPrice).toBe(99);
    expect(component.variants.at(1).value.unitPrice).toBe(45);
    expect(component.variants.at(1).value.unitsInStock).toBe(12);
    await component.save();
    expect(api.save.calls.mostRecent().args[0].configuration!.customizedSkus).toEqual(['GLASSES-BLACK']);
  });
  it('restores customization after reopening and can reset to product details', () => {
    const saved = product();
    saved.configuration = {options: [{name: 'Color', values: ['Black']}],
      defaults: {skuPrefix: '', unitPrice: 40, unitsInStock: 8, imageUrl: '', active: true},
      customizedSkus: ['GLASSES-BLACK'], generationCursor: '1'};
    api.get.and.returnValue(of(saved)); component.edit(7);
    component.details.patchValue({unitPrice: 50}); expect(component.variants.at(0).value.unitPrice).toBe(25);
    component.resetCustomization(0); expect(component.variants.at(0).value.unitPrice).toBe(50);
    expect(component.variants.at(0).value.customized).toBeFalse();
  });
  it('continues generation after reopening a partially generated product', async () => {
    const saved = product();
    saved.configuration = {options: [{name: 'Color', values: ['Black', 'White', 'Red']}],
      defaults: {skuPrefix: '', unitPrice: 25, unitsInStock: 5, imageUrl: 'https://example.com/black.jpg', active: true},
      customizedSkus: [], excludedCombinations: [], generationCursor: '1'};
    api.get.and.returnValue(of(saved)); component.edit(7); await component.updateVariants();
    expect(component.variants.length).toBe(3);
    expect(component.variants.at(0).value.id).toBe(21);
  });
  it('keeps removed combinations excluded on subsequent updates', async () => {
    spyOn(window, 'confirm').and.returnValue(true);
    component.edit(7); component.definitions.at(0).patchValue({valuesText: 'Black, White'});
    await component.updateVariants(); component.removeVariant(1);
    component.definitions.at(0).patchValue({valuesText: 'Black, White, Red'});
    await component.updateVariants();
    expect(component.variants.length).toBe(2);
    expect(component.variants.at(1).value.options).toEqual({Color: 'Red'});
  });
  it('confirms removal of obsolete option values and respects cancellation', async () => {
    spyOn(window, 'confirm').and.returnValue(false);
    component.edit(7); component.definitions.at(0).patchValue({valuesText: 'White'});
    expect(await component.updateVariants()).toBeFalse();
    expect(component.variants.at(0).value.id).toBe(21);
  });
  it('retains edits and validation messages after failed saves', async () => {
    api.save.and.returnValue(throwError(() => ({status: 409, error: {message: 'Reload this product.'}})));
    component.edit(7); component.form.patchValue({name: 'Unsaved glasses'}); component.form.markAsDirty();
    await component.save(); fixture.detectChanges();
    expect(component.form.value.name).toBe('Unsaved glasses'); expect(component.error).toContain('Reload');
    expect(fixture.nativeElement.querySelector('[role=alert]').textContent).toContain('Reload');
  });
  it('blocks invalid pricing and fractional stock without making API calls', async () => {
    create(); component.details.patchValue({unitPrice: -1, unitsInStock: 1.5});
    await component.save(); expect(api.save).not.toHaveBeenCalled();
  });
  it('prevents duplicate submissions while a save is pending', async () => {
    const pending = new Subject<AdminProduct>(); api.save.and.returnValue(pending);
    component.edit(7); await component.save(); await component.save();
    expect(api.save).toHaveBeenCalledTimes(1); expect(component.canLeave()).toBeFalse();
    pending.next(product()); pending.complete(); expect(component.busy).toBeFalse();
  });
  it('guards unsaved changes and refreshes the list when closing', () => {
    const confirm = spyOn(window, 'confirm').and.returnValue(false);
    component.edit(7); component.form.markAsDirty(); component.close(); expect(component.editorOpen).toBeTrue();
    confirm.and.returnValue(true); api.list.calls.reset(); component.close();
    expect(component.editorOpen).toBeFalse(); expect(api.list).toHaveBeenCalled();
  });
  it('requires confirmation for deletion and retains the editor on a server error', () => {
    const confirm = spyOn(window, 'confirm').and.returnValue(false);
    component.edit(7); component.delete(); expect(api.delete).not.toHaveBeenCalled();
    confirm.and.returnValue(true); api.delete.and.returnValue(throwError(() => ({status: 403}))); component.delete();
    expect(component.editorOpen).toBeTrue(); expect(component.error).toContain('no longer has owner access');
  });
  it('rejects duplicate option names and values before saving', async () => {
    create(); component.addDefinition(); component.definitions.at(0).patchValue({name: 'Size', valuesText: 'Small, small'});
    await component.save(); expect(api.save).not.toHaveBeenCalled(); expect(component.error).toContain('duplicate values');
  });
  it('preserves existing IDs when a new dimension is added', async () => {
    component.edit(7); component.addDefinition();
    component.definitions.at(1).patchValue({name: 'Size', valuesText: 'Small, Large', existingValue: 'Small'});
    await component.updateVariants();
    expect(component.variants.at(0).value.id).toBe(21);
    expect(component.variants.at(0).value.options).toEqual({Color: 'Black', Size: 'Small'});
  });
});
