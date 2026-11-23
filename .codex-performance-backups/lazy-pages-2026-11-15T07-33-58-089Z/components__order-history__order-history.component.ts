import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { OrderHistory } from '../../common/order-history';
import { OrderHistoryService } from '../../services/order-history.service';

@Component({
  selector: 'app-order-history',
  templateUrl: './order-history.component.html',
  styleUrl: './order-history.component.css'
})
export class OrderHistoryComponent implements OnInit {
  orderHistoryList: OrderHistory[] = [];
  loading = false;
  error = '';
  pageNumber = 1;
  pageSize = 20;
  totalElements = 0;
  private destroyRef = inject(DestroyRef);

  constructor(private orderHistoryService: OrderHistoryService) {}
  ngOnInit(): void { this.handleOrderHistory(); }

  handleOrderHistory(): void {
    this.loading = true;
    this.error = '';
    this.orderHistoryService.getOrderHistory(this.pageNumber - 1, this.pageSize)
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: data => {
          this.orderHistoryList = data.content;
          this.totalElements = data.page.totalElements;
          this.pageNumber = data.page.number + 1;
          this.loading = false;
        },
        error: () => {
          this.orderHistoryList = [];
          this.loading = false;
          this.error = 'Could not load your orders. Please try again.';
        }
      });
  }
}
