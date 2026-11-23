import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { ViewportScroller } from '@angular/common';
import { ProductService } from '../../services/product.service';
import { ProductCategoryNav } from '../../common/product-category-nav';
import { NavigationEnd, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({selector: 'app-product-category-menu', templateUrl: './product-category-menu.component.html',
  styleUrl: './product-category-menu.component.css'})
export class ProductCategoryMenuComponent implements OnInit {
  departments: ProductCategoryNav[] = [];
  activeDepartment: ProductCategoryNav | null = null;
  level1Categories: ProductCategoryNav[] = [];
  expandedCategoryId: number | null = null;
  expandedChildren: ProductCategoryNav[] = [];
  loading = false;
  childLoading = false;
  error = '';
  private request?: Subscription;
  private childRequest?: Subscription;
  private readonly destroyRef = inject(DestroyRef);
  private readonly cache = new Map<number, ProductCategoryNav[]>();

  constructor(private productService: ProductService, private router: Router, private viewportScroller: ViewportScroller) {}

  ngOnInit(): void {
    this.router.events.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(event => {
      if (event instanceof NavigationEnd) this.syncDepartmentFromRoute();
    });
    this.listDepartments();
  }
  listDepartments(): void {
    this.productService.getTopLevelCategories().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: data => {
        this.departments = data;
        if (data.length && !this.syncDepartmentFromRoute()) this.selectDepartment(data[0], false);
      },
      error: () => { this.error = 'Departments could not be loaded.'; }
    });
  }
  private syncDepartmentFromRoute(): boolean {
    const segments = this.router.parseUrl(this.router.url).root.children['primary']?.segments;
    if (segments?.[0]?.path !== 'category') return false;
    const target = Number(segments[1]?.path);
    const department = this.departments.find(dept => dept.id === target) ||
      this.departments.find(dept => this.containsCategory(dept.id, target, new Set<number>()));
    if (!department) return false;
    if (this.activeDepartment?.id !== department.id) this.selectDepartment(department, false);
    return true;
  }
  private containsCategory(parent: number, target: number, visited: Set<number>): boolean {
    if (visited.has(parent)) return false;
    visited.add(parent);
    return (this.cache.get(parent) || []).some(child => child.id === target || this.containsCategory(child.id, target, visited));
  }
  selectDepartment(dept: ProductCategoryNav, navigateToProducts = true): void {
    const changed = this.activeDepartment?.id !== dept.id;
    this.activeDepartment = dept;
    this.onCategoryHoverLeave();
    if (navigateToProducts) {
      const tree = this.router.parseUrl(this.router.url);
      const segments = tree.root.children['primary']?.segments;
      const alreadyThere = segments?.length === 2 && segments[0].path === 'category' &&
        segments[1].path === String(dept.id) && tree.queryParams['includeDescendants'] === 'true';
      if (!alreadyThere) void this.router.navigate(['/category', dept.id], {
        queryParams: {includeDescendants: true}
      }).then(navigated => { if (navigated) this.viewportScroller.scrollToPosition([0, 0]); });
    }
    if (!changed && !this.error) return;
    this.request?.unsubscribe();
    this.level1Categories = this.cache.get(dept.id) || [];
    this.error = '';
    this.loading = !this.cache.has(dept.id);
    if (!this.loading) return;
    this.request = this.productService.getCategoryChildren(dept.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: data => {
        this.cache.set(dept.id, data);
        if (this.activeDepartment?.id === dept.id) { this.level1Categories = data; this.loading = false; }
      },
      error: () => {
        if (this.activeDepartment?.id === dept.id) { this.loading = false; this.error = 'Categories could not be loaded. Select the department to retry.'; }
      }
    });
  }
  onCategoryHoverEnter(category: ProductCategoryNav): void {
    this.onCategoryHoverLeave();
    if (!category.hasChildren) return;
    this.expandedCategoryId = category.id;
    const saved = this.cache.get(category.id);
    if (saved) { this.expandedChildren = saved; return; }
    this.childLoading = true;
    this.childRequest = this.productService.getCategoryChildren(category.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: data => { this.cache.set(category.id, data); if (this.expandedCategoryId === category.id) { this.expandedChildren = data; this.childLoading = false; } },
      error: () => this.onCategoryHoverLeave()
    });
  }
  toggleCategory(category: ProductCategoryNav): void {
    if (this.expandedCategoryId === category.id) this.onCategoryHoverLeave();
    else this.onCategoryHoverEnter(category);
  }
  onCategoryHoverLeave(): void {
    this.childRequest?.unsubscribe(); this.childLoading = false; this.expandedCategoryId = null; this.expandedChildren = [];
  }
  onFocusOut(event: FocusEvent): void {
    if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) this.onCategoryHoverLeave();
  }
}
