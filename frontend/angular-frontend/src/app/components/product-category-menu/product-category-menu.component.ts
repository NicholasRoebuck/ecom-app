import { Component, OnInit } from '@angular/core';
import { ViewportScroller } from '@angular/common';
import { ProductCategory } from '../../common/product-category';
import { ProductService } from '../../services/product.service';
import { ProductCategoryNav } from '../../common/product-category-nav';
import { NavigationEnd, Router } from '@angular/router';
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

  constructor(private productService: ProductService,
              private router: Router,
              private viewportScroller: ViewportScroller) {
  }

  ngOnInit() {
    this.listDepartments();
  }

  listDepartments() {
    this.productService.getTopLevelCategories().subscribe(
      data => {
        this.departments = data;
        if (data.length > 0) {
          if (!this.syncDepartmentFromRoute()) {
            this.selectDepartment(data[0], false);
          }
        }
      }
    );
  }

  private syncDepartmentFromRoute(): boolean {
    const segments = this.router.parseUrl(this.router.url).root.children['primary']?.segments;
    if (segments?.[0]?.path !== 'category') return false;
    const department = this.departments.find(dept => String(dept.id) === segments[1]?.path);
    if (!department) return false;
    if (this.activeDepartment?.id !== department.id) {
      this.selectDepartment(department, false);
    }
    return true;
  }

  selectDepartment(dept: ProductCategoryNav, navigateToProducts = true) {
    this.activeDepartment = dept;
    this.expandedCategoryId = null;
    this.expandedChildren = [];

    if (navigateToProducts) {
      this.router.navigate(['/category', dept.id], {
        queryParams: { includeDescendants: true }
      }).then(() => {
        this.viewportScroller.scrollToPosition([0, 0]);
      });
    }

    this.productService.getCategoryChildren(dept.id).subscribe(
      data => {
        this.level1Categories = data;
      }
    );
  }

  onCategoryHoverEnter(category: ProductCategoryNav) {
    if (!category.hasChildren) {
      return;
    }

    this.expandedCategoryId = category.id;
    this.productService.getCategoryChildren(category.id).subscribe(
      data => {
        this.expandedChildren = data;
      }
    );
  }

  onCategoryHoverLeave() {
    this.expandedCategoryId = null;
    this.expandedChildren = [];
  }
}
