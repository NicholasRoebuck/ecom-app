package com.nickcoding.spring_boot_website.service;

import com.nickcoding.spring_boot_website.dao.OrderRepository;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.Pageable;
import java.util.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class PaymentReconciliationJobTest {
    OrderRepository.PaymentRecoveryCandidate candidate(long id, String token) {
        var candidate = mock(OrderRepository.PaymentRecoveryCandidate.class);
        when(candidate.getId()).thenReturn(id);
        when(candidate.getCheckoutToken()).thenReturn(token);
        return candidate;
    }

    @Test void continuesAfterFailuresAndCyclesThroughAllOrdersWithoutStarvation() throws Exception {
        var orders = mock(OrderRepository.class);
        var payments = mock(OrderPaymentService.class);
        var job = new PaymentReconciliationJob(orders, payments);
        var first = candidate(1, "first"); var second = candidate(2, "second");
        when(orders.findPaymentRecoveryCandidates(anyCollection(), eq(0L), any(), any(Pageable.class)))
                .thenReturn(List.of(first, second));
        when(orders.findPaymentRecoveryCandidates(anyCollection(), eq(2L), any(), any(Pageable.class)))
                .thenReturn(List.of());
        when(payments.reconcile("first", null)).thenThrow(new RuntimeException("simulated provider failure"));
        job.reconcilePendingOrders();
        verify(payments).reconcile("second", null);
        job.reconcilePendingOrders();
        job.reconcilePendingOrders();
        verify(orders, times(2)).findPaymentRecoveryCandidates(anyCollection(), eq(0L), any(), any(Pageable.class));
        verify(payments, times(2)).reconcile("first", null);
    }
}
