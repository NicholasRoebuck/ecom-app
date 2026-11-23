import { Component, DestroyRef, ElementRef, HostListener, OnInit, inject } from '@angular/core';
import { DOCUMENT, ViewportScroller } from '@angular/common';
import { ProductService } from '../../services/product.service';
import { ProductCategoryNav } from '../../common/product-category-nav';
import { NavigationEnd, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-product-category-menu',
  templateUrl: './product-category-menu.component.html',
  styleUrl: './product-category-menu.component.css'
})
export class ProductCategoryMenuComponent implements OnInit {
  departments: ProductCategoryNav[] = [];
  activeDepartment: ProductCategoryNav | null = null;
  level1Categories: ProductCategoryNav[] = [];
  expandedCategoryId: number | null = null;
  expandedChildren: ProductCategoryNav[] = [];

  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly document = inject(DOCUMENT);
  private pinned = false;
  private focusFrame: number | null = null;
  childLoading = false;
  private departmentRequest?: Subscription;
  private childRequest?: Subscription;
  private readonly categories = new Map<number, ProductCategoryNav[]>();
  private readonly departmentForCategory = new Map<number, number>();

  constructor(private productService: ProductService, private router: Router,
              private viewportScroller: ViewportScroller) {
    this.destroyRef.onDestroy(() => this.cancelFocus());
  }

  ngOnInit(): void {
    this.router.events.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(event => {
      if (event instanceof NavigationEnd) { this.onCategoryHoverLeave(); this.syncDepartmentFromRoute(); }
    });
    this.listDepartments();
  }

  @HostListener('window:catalog-categories-changed')
  refreshCategories(): void {
    this.departmentRequest?.unsubscribe(); this.onCategoryHoverLeave();
    this.categories.clear(); this.departmentForCategory.clear(); this.activeDepartment = null;
    this.listDepartments();
  }

  listDepartments(): void {
    this.productService.getTopLevelCategories().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: data => {
        this.departments = data;
        data.forEach(dept => this.departmentForCategory.set(dept.id, dept.id));
        if (data.length && !this.syncDepartmentFromRoute()) this.selectDepartment(data[0], false);
      },
      error: () => { this.departments = []; }
    });
  }

  private syncDepartmentFromRoute(): boolean {
    const segments = this.router.parseUrl(this.router.url).root.children['primary']?.segments;
    if (segments?.[0]?.path !== 'category') return false;
    const departmentId = this.departmentForCategory.get(Number(segments[1]?.path));
    const department = this.departments.find(dept => dept.id === departmentId);
    if (!department) return false;
    if (this.activeDepartment?.id !== department.id) this.selectDepartment(department, false);
    return true;
  }

  selectDepartment(dept: ProductCategoryNav, navigateToProducts = true): void {
    const changed = this.activeDepartment?.id !== dept.id;
    this.activeDepartment = dept;
    this.onCategoryHoverLeave();
    if (navigateToProducts) {
      void this.router.navigate(['/category', dept.id], {
        queryParams: {includeDescendants: true}
      }).then(navigated => {
        if (navigated) this.viewportScroller.scrollToPosition([0, 0]);
      });
    }
    if (!changed && (this.categories.has(dept.id) || (this.departmentRequest && !this.departmentRequest.closed))) return;
    this.departmentRequest?.unsubscribe();
    this.level1Categories = this.categories.get(dept.id) || [];
    if (this.categories.has(dept.id)) return;
    this.departmentRequest = this.productService.getCategoryChildren(dept.id)
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: data => {
          if (this.activeDepartment?.id !== dept.id) return;
          this.categories.set(dept.id, data);
          data.forEach(category => this.departmentForCategory.set(category.id, dept.id));
          this.level1Categories = data;
        },
        error: () => { if (this.activeDepartment?.id === dept.id) this.level1Categories = []; }
      });
  }

  onCategoryHoverEnter(category: ProductCategoryNav): void {
    this.openCategory(category);
  }

  onCategoryPointerEnter(category: ProductCategoryNav, event: PointerEvent): void {
    if (event.pointerType === 'mouse' && !this.pinned) this.openCategory(category);
  }

  onCategoryPointerLeave(event: PointerEvent): void {
    if (event.pointerType === 'mouse' && !this.pinned &&
        !(event.currentTarget as HTMLElement).contains(this.document.activeElement)) this.onCategoryHoverLeave();
  }

  toggleSubmenu(category: ProductCategoryNav): void {
    if (this.expandedCategoryId === category.id && this.pinned) this.onCategoryHoverLeave();
    else if (this.expandedCategoryId === category.id) this.pinned = true;
    else this.openCategory(category, false, true);
  }

  openSubmenuFromKeyboard(category: ProductCategoryNav, event: Event): void {
    event.preventDefault();
    if (this.expandedCategoryId === category.id && !this.childLoading) this.focusFirstLink(category.id);
    else this.openCategory(category, true, true);
  }

  closeSubmenuFromKeyboard(event: Event): void {
    if (this.expandedCategoryId === null) return;
    event.preventDefault(); event.stopPropagation();
    const id = this.expandedCategoryId;
    this.onCategoryHoverLeave();
    this.host.nativeElement.querySelector<HTMLElement>('[data-submenu-toggle="' + id + '"]')?.focus();
  }

  onCategoryFocusOut(event: FocusEvent): void {
    if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) this.onCategoryHoverLeave();
  }

  @HostListener('document:click', ['$event'])
  onOutsideClick(event: MouseEvent): void {
    if (!this.host.nativeElement.contains(event.target as Node | null)) this.onCategoryHoverLeave();
  }

  private openCategory(category: ProductCategoryNav, focusFirst = false, pinned = false): void {
    this.onCategoryHoverLeave();
    if (!category.hasChildren) return;
    const departmentId = this.activeDepartment?.id;
    this.expandedCategoryId = category.id;
    this.pinned = pinned;
    this.childLoading = true;
    this.childRequest = this.productService.getCategoryChildren(category.id)
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: data => {
          if (this.expandedCategoryId !== category.id) return;
          if (departmentId !== undefined) data.forEach(child => this.departmentForCategory.set(child.id, departmentId));
          this.expandedChildren = data;
          this.childLoading = false;
          if (focusFirst) this.focusFirstLink(category.id);
        },
        error: () => this.onCategoryHoverLeave()
      });
  }

  private focusFirstLink(id: number): void {
    this.cancelFocus();
    this.focusFrame = this.document.defaultView?.requestAnimationFrame(() => {
      this.focusFrame = null;
      if (this.expandedCategoryId === id)
        this.host.nativeElement.querySelector<HTMLElement>('#subcategory-menu-' + id + ' a')?.focus();
    }) ?? null;
  }

  private cancelFocus(): void {
    if (this.focusFrame !== null) this.document.defaultView?.cancelAnimationFrame(this.focusFrame);
    this.focusFrame = null;
  }

  onCategoryHoverLeave(): void {
    this.childRequest?.unsubscribe();
    this.cancelFocus();
    this.pinned = false;
    this.childLoading = false;
    this.expandedCategoryId = null;
    this.expandedChildren = [];
  }
}
