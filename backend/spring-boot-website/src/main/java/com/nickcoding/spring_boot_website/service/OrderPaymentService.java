package com.nickcoding.spring_boot_website.service;

import com.nickcoding.spring_boot_website.dao.OrderRepository;
import com.nickcoding.spring_boot_website.entity.Order;
import com.stripe.exception.StripeException;
import com.stripe.model.PaymentIntent;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.time.Instant;
import java.util.*;

@Service
public class OrderPaymentService {
    public static final List<String> RECOVERABLE = List.of("PENDING", "PROCESSING", "PAYMENT_FAILED", "REQUIRES_ACTION");
    public record Result(String status, String orderTrackingNumber, Long orderId) {}
    private final OrderRepository orders;
    private final StripePaymentGateway payments;
    private final CheckoutInventoryService inventory;

    public OrderPaymentService(OrderRepository orders, StripePaymentGateway payments, CheckoutInventoryService inventory) {
        this.orders = orders; this.payments = payments; this.inventory = inventory;
    }

    // This transaction is shared by browser confirmation, webhooks, and scheduled recovery.
    // Row locking serializes duplicate/concurrent confirmations of the same order.
    @Transactional(rollbackFor = Exception.class)
    public Result reconcile(String token, String expectedPaymentId) throws StripeException {
        Order order = orders.findByCheckoutToken(token).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "Checkout not found."));
        try {
            if (expectedPaymentId != null && !expectedPaymentId.equals(order.getPaymentIntentId()))
                throw conflict("The payment does not belong to this checkout.");
            if ("PAID".equals(order.getStatus()) || "CANCELLED".equals(order.getStatus()) || "EXPIRED".equals(order.getStatus()))
                return new Result(order.getStatus(), order.getOrderTrackingNumber(), order.getId());

            if (order.getPaymentIntentId() == null) {
                if (order.getDateCreated() != null && order.getDateCreated().toInstant().isBefore(Instant.now().minusSeconds(1800)))
                    update(order, "EXPIRED");
                return new Result(order.getStatus(), order.getOrderTrackingNumber(), order.getId());
            }
            PaymentIntent intent = payments.retrieve(order.getPaymentIntentId());
            verifyIdentity(order, intent);
            // A timeout alone cannot release stock: payment may have succeeded independently.
            // Cancellation failures/races roll back; scheduled recovery tries again.
            if (expired(order) && List.of("requires_payment_method", "requires_confirmation", "requires_action").contains(intent.getStatus())) {
                payments.cancel(intent.getId());
                update(order, "EXPIRED");
                return new Result(order.getStatus(), order.getOrderTrackingNumber(), order.getId());
            }
            String status = switch (intent.getStatus()) {
                case "succeeded" -> {
                    if (!Objects.equals(intent.getAmountReceived(), amount(order)))
                        throw conflict("The received payment amount does not match this order.");
                    yield "PAID";
                }
                case "processing", "requires_capture" -> "PROCESSING";
                case "requires_action" -> "REQUIRES_ACTION";
                case "requires_payment_method" -> intent.getLastPaymentError() == null ? "PENDING" : "PAYMENT_FAILED";
                case "canceled" -> "CANCELLED";
                case "requires_confirmation" -> "PENDING";
                default -> throw conflict("The payment has an unrecognized status.");
            };
            update(order, status);
            return new Result(status, order.getOrderTrackingNumber(), order.getId());
        } catch (StripeException | RuntimeException ex) {
            if (!PaymentLog.isBackground()) PaymentLog.failed("payment_reconciliation_failed", order.getId(), ex);
            throw ex;
        }
    }

    public static long amount(Order order) {
        return order.getTotalPrice().movePointRight(2).longValueExact();
    }

    public static void verifyIdentity(Order order, PaymentIntent intent) {
        if (!Objects.equals(order.getPaymentIntentId(), intent.getId())
                || !Objects.equals(intent.getAmount(), amount(order))
                || !Objects.equals(order.getCurrency(), intent.getCurrency())
                || intent.getMetadata() == null
                || !Objects.equals(order.getCheckoutToken(), intent.getMetadata().get("checkout_token")))
            throw conflict("The payment does not match this order.");
    }

    private boolean expired(Order order) {
        return order.getDateCreated() != null && order.getDateCreated().toInstant().isBefore(Instant.now().minusSeconds(1800));
    }

    private void update(Order order, String status) {
        if (!status.equals(order.getStatus())) {
            if ("PAID".equals(status)) inventory.consume(order);
            if ("CANCELLED".equals(status) || "EXPIRED".equals(status)) inventory.release(order);
            String previous = order.getStatus();
            order.setStatus(status);
            orders.save(order);
            PaymentLog.transition(order.getId(), previous, status);
        }
    }

    private static ResponseStatusException conflict(String message) {
        return new ResponseStatusException(HttpStatus.CONFLICT, message);
    }
}
