import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { RouterTestingModule } from '@angular/router/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { ProductDetailsComponent } from './product-details.component';
import { ProductService } from '../../services/product.service';
import { CartService } from '../../services/cart.service';
import { Product } from '../../common/product';
import { ProductVariant } from '../../common/product-variant';

describe('ProductDetailsComponent variant selection', () => {
  let fixture: ComponentFixture<ProductDetailsComponent>;
  let component: ProductDetailsComponent;
  let api: jasmine.SpyObj<ProductService>;
  let cart: jasmine.SpyObj<CartService>;
  let params: BehaviorSubject<any>;
  let product: Product;
  const choose = (index: number, value: string) => component.selectOption(index, {target: {value}} as unknown as Event);

  beforeEach(async () => {
    product = new Product(7, 'Glasses', 'Description', new Date(), new Date(), [
      new ProductVariant(1, 'BLACK-S', 10, 'black.png', true, 3, {Color: 'Black', Size: 'Small'}),
      new ProductVariant(2, 'BLACK-M', 12, 'black.png', true, 0, {Color: 'Black', Size: 'Medium'}),
      new ProductVariant(3, 'WHITE-M', 15, 'white.png', true, 5, {Color: 'White', Size: 'Medium'})
    ]);
    params = new BehaviorSubject(convertToParamMap({id: '7'}));
    api = jasmine.createSpyObj('ProductService', ['getProduct']);
    api.getProduct.and.returnValue(of(product));
    cart = jasmine.createSpyObj('CartService', ['addToCart']);
    await TestBed.configureTestingModule({
      declarations: [ProductDetailsComponent], imports: [CommonModule, RouterTestingModule],
      providers: [{provide: ProductService, useValue: api}, {provide: CartService, useValue: cart},
        {provide: ActivatedRoute, useValue: {paramMap: params}}]
    }).compileComponents();
    fixture = TestBed.createComponent(ProductDetailsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('selects the first available combination and enables adding it immediately', () => {
    expect(component.options.map(option => option.name)).toEqual(['Color', 'Size']);
    expect(component.selectedVariant.id).toBe(1);
    expect(component.selectedOptions).toEqual({Color: 'Black', Size: 'Small'});
    expect(component.displayedPrice).toBe(10);
    expect(fixture.nativeElement.querySelector('button').disabled).toBeFalse();
    const selects = fixture.nativeElement.querySelectorAll('select');
    expect(selects[0].value).toBe('Black');
    expect(selects[1].value).toBe('Small');
    component.addTocart();
    expect(cart.addToCart.calls.mostRecent().args[0].variantId).toBe(1);
  });

  it('updates image, price, availability and the actual cart variant', () => {
    choose(0, 'White');
    choose(1, 'Medium');
    fixture.detectChanges();
    expect(component.selectedVariant.id).toBe(3);
    expect(component.displayedPrice).toBe(15);
    expect(fixture.nativeElement.querySelector('img').getAttribute('src')).toBe('white.png');
    fixture.nativeElement.querySelector('button').click();
    const item = cart.addToCart.calls.mostRecent().args[0];
    expect(item.variantId).toBe(3);
    expect(item.unitPrice).toBe(15);
    expect(item.name).toBe('Glasses (Color: White, Size: Medium)');
  });

  it('disables unavailable combinations and resets dependent selections', () => {
    choose(0, 'Black');
    expect(component.isOptionAvailable(1, 'Medium')).toBeFalse();
    expect(component.isOptionAvailable(1, 'Small')).toBeTrue();
    choose(1, 'Small');
    expect(component.canAddToCart).toBeTrue();
    choose(0, 'White');
    expect(component.selectedOptions['Size']).toBeUndefined();
    expect(component.selectedVariant).toBeNull();
    expect(component.isOptionAvailable(1, 'Small')).toBeFalse();
    expect(component.isOptionAvailable(1, 'Medium')).toBeTrue();
    // Even a forced disabled selection cannot add unavailable stock.
    choose(0, 'Black'); choose(1, 'Medium'); component.addTocart();
    expect(component.canAddToCart).toBeFalse();
    expect(cart.addToCart).not.toHaveBeenCalled();
  });

  it('keeps single-variant products simple', () => {
    component.configureProduct({...product, variants: [product.variants[0]]});
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('select')).toBeNull();
    expect(component.canAddToCart).toBeTrue();
    component.addTocart();
    expect(cart.addToCart.calls.mostRecent().args[0].variantId).toBe(1);
  });

  it('supports arbitrary product-specific attributes', () => {
    component.configureProduct({...product, variants: [
      {...product.variants[0], options: {'Lens type': 'Clear'}},
      {...product.variants[2], options: {'Lens type': 'Amber'}}
    ]});
    choose(0, 'Amber');
    expect(component.options[0].name).toBe('Lens type');
    expect(component.selectedVariant.id).toBe(3);
  });

  it('provides an explicit fallback for legacy or ambiguous variant data', () => {
    component.configureProduct({...product, variants: product.variants.map(item => ({...item, options: {}}))});
    expect(component.useVariantDropdown).toBeTrue();
    component.selectVariant({target: {value: '3'}} as unknown as Event);
    component.addTocart();
    expect(cart.addToCart.calls.mostRecent().args[0].name).toContain('WHITE-M');
    component.configureProduct({...product, variants: product.variants.map(item => ({...item, options: {Size: 'One size'}}))});
    expect(component.useVariantDropdown).toBeTrue();
    expect(component.selectedVariant.id).toBe(1);
  });

  it('clears prior selections on navigation and handles product loading failures', () => {
    choose(0, 'White'); choose(1, 'Medium');
    api.getProduct.and.returnValue(throwError(() => ({status: 404})));
    params.next(convertToParamMap({id: '99'}));
    fixture.detectChanges();
    expect(component.selectedVariant).toBeNull();
    expect(component.product).toBeUndefined();
    expect(fixture.nativeElement.textContent).toContain('could not be loaded');
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
  });

  it('skips unavailable variants when choosing the initial options', () => {
    component.configureProduct({...product, variants: [
      {...product.variants[0], active: false}, product.variants[1], product.variants[2]
    ]});
    fixture.detectChanges();
    expect(component.selectedVariant.id).toBe(3);
    expect(component.selectedOptions).toEqual({Color: 'White', Size: 'Medium'});
    expect(component.displayedPrice).toBe(15);
    expect(fixture.nativeElement.querySelector('img').getAttribute('src')).toBe('white.png');
  });
  it('does not enable checkout when no variation is available', () => {
    component.configureProduct({...product, variants: product.variants.map(v => ({...v, unitsInStock: 0}))});
    expect(component.selectedVariant).toBeNull();
    expect(component.canAddToCart).toBeFalse();
    component.addTocart(); expect(cart.addToCart).not.toHaveBeenCalled();
  });
  it('defaults legacy SKU selectors to the first available variant too', () => {
    component.configureProduct({...product, variants: product.variants.map(v => ({...v, options: {}}))});
    fixture.detectChanges();
    expect(component.useVariantDropdown).toBeTrue();
    expect(component.selectedVariant.id).toBe(1);
    expect(fixture.nativeElement.querySelector('select').value).toBe('1');
  });

});
