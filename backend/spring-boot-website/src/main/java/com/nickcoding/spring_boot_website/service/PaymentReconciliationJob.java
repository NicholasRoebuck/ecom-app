package com.nickcoding.spring_boot_website.service;

import com.nickcoding.spring_boot_website.dao.OrderRepository;


import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import java.time.Instant;
import java.util.Date;

@Component
@EnableScheduling
@ConditionalOnProperty(name = "checkout.reconciliation.enabled", havingValue = "true", matchIfMissing = true)
public class PaymentReconciliationJob {
    private final OrderRepository orders;
    private final OrderPaymentService payments;
    private long afterId;

    public PaymentReconciliationJob(OrderRepository orders, OrderPaymentService payments) {
        this.orders = orders; this.payments = payments;
    }

    @Scheduled(initialDelayString = "${checkout.reconciliation.initial-delay-ms:60000}",
               fixedDelayString = "${checkout.reconciliation.delay-ms:60000}")
    public void reconcilePendingOrders() {
        var batch = orders.findPaymentRecoveryCandidates(OrderPaymentService.RECOVERABLE, afterId,
                Date.from(Instant.now().minusSeconds(1800)), PageRequest.of(0, 100));
        if (batch.isEmpty()) { afterId = 0; return; }
        for (var candidate : batch) {
            try (var source = PaymentLog.source(PaymentLog.Source.BACKGROUND)) {
                payments.reconcile(candidate.getCheckoutToken(), null);
            } catch (Exception ex) {
                // Deliberately omit tokens, customer data, provider responses, and exception messages.
                try (var source = PaymentLog.source(PaymentLog.Source.BACKGROUND)) {
                    PaymentLog.failed("payment_recovery_retry", candidate.getId(), ex);
                }
            }
            afterId = candidate.getId();
        }
        // Continue through later IDs next run so an old declined order cannot starve newer paid ones.
    }
}
