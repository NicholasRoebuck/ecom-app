package com.nickcoding.spring_boot_website.service;

import com.nickcoding.spring_boot_website.dao.OrderRepository;
import com.nickcoding.spring_boot_website.entity.Order;
import com.stripe.model.PaymentIntent;
import com.stripe.model.StripeError;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.*;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class OrderPaymentServiceTest {
    @Mock OrderRepository orders;
    @Mock StripePaymentGateway payments;
    @Mock CheckoutInventoryService inventory;
    @InjectMocks OrderPaymentService service;
    final String token = "11111111-1111-4111-8111-111111111111";

    Order order() {
        Order order = new Order(); order.setCheckoutToken(token); order.setPaymentIntentId("pi_test");
        order.setStatus("PENDING"); order.setCurrency("usd"); order.setTotalPrice(new BigDecimal("20.00"));
        order.setOrderTrackingNumber("tracking");
        when(orders.findByCheckoutToken(token)).thenReturn(Optional.of(order));
        return order;
    }
    PaymentIntent intent(String status) throws Exception {
        PaymentIntent intent = new PaymentIntent(); intent.setId("pi_test"); intent.setStatus(status);
        intent.setCurrency("usd"); intent.setAmount(2000L); intent.setAmountReceived(2000L);
        intent.setMetadata(Map.of("checkout_token", token));
        when(payments.retrieve("pi_test")).thenReturn(intent);
        return intent;
    }

    @Test void recoversSuccessAfterBrowserDisappearsAndIgnoresDuplicateOrOldEvents() throws Exception {
        Order order = order(); intent("succeeded");
        assertEquals("PAID", service.reconcile(token, "pi_test").status());
        assertEquals("PAID", service.reconcile(token, "pi_test").status());
        assertEquals("PAID", service.reconcile(token, null).status());
        verify(orders, times(1)).save(order);
        verify(payments, times(1)).retrieve("pi_test");
    }

    @Test void declineIsRecordedAndTheSameOrderCanLaterSucceed() throws Exception {
        Order order = order();
        var intent = intent("requires_payment_method"); intent.setLastPaymentError(new StripeError());
        assertEquals("PAYMENT_FAILED", service.reconcile(token, null).status());
        intent.setStatus("succeeded");
        assertEquals("PAID", service.reconcile(token, null).status());
        assertEquals("pi_test", order.getPaymentIntentId());
    }

    @Test void processingAndAuthenticationAreNotPaidStates() throws Exception {
        order(); var intent = intent("processing");
        assertEquals("PROCESSING", service.reconcile(token, null).status());
        intent.setStatus("requires_action");
        assertEquals("REQUIRES_ACTION", service.reconcile(token, null).status());
        intent.setStatus("requires_capture");
        assertEquals("PROCESSING", service.reconcile(token, null).status());
    }

    @Test void providerCancellationIsPersisted() throws Exception {
        order(); intent("canceled");
        assertEquals("CANCELLED", service.reconcile(token, null).status());
    }

    @Test void expiresOnlyOldOrdersThatNeverStartedPayment() throws Exception {
        Order order = order(); order.setPaymentIntentId(null);
        order.setDateCreated(Date.from(Instant.now().minusSeconds(3600)));
        assertEquals("EXPIRED", service.reconcile(token, null).status());
        verifyNoInteractions(payments);
    }

    @Test void neverExpiresARecordedPaymentJustBecauseTheOrderIsOld() throws Exception {
        Order order = order(); order.setDateCreated(Date.from(Instant.now().minusSeconds(3600)));
        intent("processing");
        assertEquals("PROCESSING", service.reconcile(token, null).status());
    }

    @Test void rejectsAnEventForAnotherPaymentEvenWithTheSameCheckoutMetadata() throws Exception {
        order();
        assertThrows(ResponseStatusException.class, () -> service.reconcile(token, "pi_other"));
        verifyNoInteractions(payments);
        verify(orders, never()).save(any());
    }

    @Test void wrongAmountCannotBecomePaid() throws Exception {
        order(); var intent = intent("succeeded"); intent.setAmountReceived(1L);
        assertThrows(ResponseStatusException.class, () -> service.reconcile(token, null));
        verify(orders, never()).save(any());
    }

    @Test void transientFailureLeavesOrderRecoverableForTheNextRun() throws Exception {
        Order order = order();
        when(payments.retrieve("pi_test")).thenThrow(new RuntimeException("simulated outage"));
        assertThrows(RuntimeException.class, () -> service.reconcile(token, null));
        assertEquals("PENDING", order.getStatus());
        reset(payments);
        intent("succeeded");
        assertEquals("PAID", service.reconcile(token, null).status());
    }
}
