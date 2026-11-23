import { STORE_DEPARTMENTS } from '../../common/store-departments';
import { Component, OnInit } from '@angular/core';
import { ProductService } from '../../services/product.service';
import { ProductCategoryNav } from '../../common/product-category-nav';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrl: './home.component.css'
})
export class HomeComponent implements OnInit {
  hearingDepartment?: ProductCategoryNav;
  visionDepartment?: ProductCategoryNav;

  constructor(private productService: ProductService) {}

  ngOnInit(): void {
    this.productService.getTopLevelCategories().subscribe(departments => {
      this.hearingDepartment = departments.find(dept => dept.id === STORE_DEPARTMENTS.hearing);
      this.visionDepartment = departments.find(dept => dept.id === STORE_DEPARTMENTS.vision);
    });
  }
}
