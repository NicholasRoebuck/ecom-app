import { Component, DestroyRef, inject, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { catchError, of, switchMap } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Product } from '../../common/product';
import { ProductVariant } from '../../common/product-variant';
import { variantLabel } from '../../common/product-variant-utils';
import { ProductService } from '../../services/product.service';
import { CartService } from '../../services/cart.service';
import { CartItem } from '../../common/cart-item';

@Component({
  selector: 'app-product-details',
  templateUrl: './product-details.component.html',
  styleUrl: './product-details.component.css'
})
export class ProductDetailsComponent implements OnInit {
  product: Product | undefined;
  selectedVariant: ProductVariant | null = null;
  options: {name: string; values: string[]}[] = [];
  selectedOptions: Record<string, string> = {};
  useVariantDropdown = false;
  loading = true;
  error = '';
  private readonly destroyRef = inject(DestroyRef);

  constructor(private productService: ProductService, private route: ActivatedRoute, private cartService: CartService) {}

  ngOnInit(): void {
    this.route.paramMap.pipe(
      switchMap(params => {
        this.product = undefined;
        this.selectedVariant = null;
        this.options = [];
        this.selectedOptions = {};
        this.useVariantDropdown = false;
        this.loading = true;
        this.error = '';
        const id = Number(params.get('id'));
        return Number.isSafeInteger(id) && id > 0
          ? this.productService.getProduct(id).pipe(catchError(() => of(null))) : of(null);
      }),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(product => {
      this.loading = false;
      if (product) this.configureProduct(product);
      else this.error = 'This product could not be loaded. Please return to the product list.';
    });
  }

  configureProduct(product: Product): void {
    this.product = product;
    this.options = [];
    this.selectedVariant = product.variants.find(variant => variant.active && variant.unitsInStock > 0) ||
      (product.variants.length === 1 ? product.variants[0] : null);
    this.selectedOptions = {...(this.selectedVariant?.options || {})};
    this.useVariantDropdown = false;
    if (product.variants.length <= 1) return;

    const names = Object.keys(product.variants[0].options || {}).sort();
    const sameShape = names.length > 0 && product.variants.every(variant =>
      JSON.stringify(Object.keys(variant.options || {}).sort()) === JSON.stringify(names) &&
      names.every(name => typeof variant.options[name] === 'string' && variant.options[name].trim().length > 0));
    const combinations = product.variants.map(variant => JSON.stringify(names.map(name => variant.options?.[name])));
    if (!sameShape || new Set(combinations).size !== combinations.length) {
      // Legacy/incomplete data remains selectable without inventing size/color values.
      this.useVariantDropdown = true;
      return;
    }
    this.options = names.map(name => ({name, values: [...new Set(product.variants.map(variant => variant.options[name]))]}));
  }

  selectOption(index: number, event: Event): void {
    const option = this.options[index];
    const value = (event.target as HTMLSelectElement).value;
    if (!option || (value && !option.values.includes(value))) return;
    this.selectedOptions[option.name] = value;
    for (const later of this.options.slice(index + 1)) delete this.selectedOptions[later.name];
    this.selectedVariant = this.options.every(item => !!this.selectedOptions[item.name])
      ? this.product?.variants.find(variant => this.options.every(item => variant.options[item.name] === this.selectedOptions[item.name])) || null
      : null;
  }

  isOptionAvailable(index: number, value: string): boolean {
    return !!this.product?.variants.some(variant => variant.active && variant.unitsInStock > 0 &&
      variant.options[this.options[index].name] === value &&
      this.options.slice(0, index).every(option => !this.selectedOptions[option.name] ||
        variant.options[option.name] === this.selectedOptions[option.name]));
  }

  selectVariant(event: Event): void {
    const id = Number((event.target as HTMLSelectElement).value);
    this.selectedVariant = this.product?.variants.find(variant => variant.id === id) || null;
  }

  variantDescription(variant: ProductVariant, index: number): string {
    const label = variantLabel(variant.options);
    return label ? label + (variant.sku ? ' — ' + variant.sku : '') : variant.sku || 'Variation ' + (index + 1);
  }

  displayVariant(): ProductVariant | undefined {
    return this.selectedVariant || this.product?.variants.find(variant => variant.active && variant.unitsInStock > 0) || this.product?.variants[0];
  }

  get displayedPrice(): number | null {
    if (this.selectedVariant) return this.selectedVariant.unitPrice;
    const prices = (this.product?.variants || []).filter(variant => variant.active)
      .map(variant => variant.unitPrice).filter(price => Number.isFinite(price));
    return prices.length ? Math.min(...prices) : null;
  }

  get canAddToCart(): boolean {
    return !!this.selectedVariant?.active && this.selectedVariant.unitsInStock > 0;
  }

  get availabilityText(): string {
    if (!this.selectedVariant && (this.product?.variants.length || 0) > 1) return 'Choose your options to check availability';
    return this.canAddToCart ? 'In stock' : 'Currently unavailable';
  }

  addTocart(): void {
    if (!this.product || !this.selectedVariant || !this.canAddToCart) return;
    this.cartService.addToCart(new CartItem(this.product, this.selectedVariant));
  }
}
