import { Component, OnInit } from '@angular/core';
import { ProductCategory } from '../../common/product-category';
import { ProductService } from '../../services/product.service';
import { ProductCategoryNav } from '../../common/product-category-nav';
import { Router } from '@angular/router';

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
              private router: Router) {
  }

  ngOnInit() {
    this.listDepartments();
  }

  listDepartments() {
    this.productService.getTopLevelCategories().subscribe(
      data => {
        this.departments = data;
        if (data.length > 0) {
          this.selectDepartment(data[0], false);
        }
      }
    );
  }

  selectDepartment(dept: ProductCategoryNav, navigateToProducts = true) {
    this.activeDepartment = dept;
    this.expandedCategoryId = null;
    this.expandedChildren = [];

    if (navigateToProducts) {
      this.router.navigate(['/category', dept.id], {
        queryParams: { includeDescendants: true }
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
