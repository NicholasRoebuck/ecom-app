package com.nickcoding.spring_boot_website.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.nickcoding.spring_boot_website.dao.*;
import com.nickcoding.spring_boot_website.dto.*;
import com.nickcoding.spring_boot_website.entity.*;
import com.stripe.model.PaymentIntent;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.*;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;
import java.math.BigDecimal;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class CheckoutServiceImplTest {
    @Mock CustomerRepository customers;
    @Mock OrderRepository orders;
    @Mock CheckoutPricingService pricing;
    @Mock StripePaymentGateway payments;
    @Mock CheckoutInventoryService inventory;
    CheckoutServiceImpl service;
    @org.junit.jupiter.api.BeforeEach void setUp() {
        service = new CheckoutServiceImpl(customers, orders, pricing, payments, new OrderPaymentService(orders, payments, inventory), inventory);
    }
    final String token = "11111111-1111-4111-8111-111111111111";

    private CheckoutRequest request() {
        var contact = new CheckoutRequest.Contact("Alex", "Smith", "alex@example.com");
        var address = new CheckoutRequest.DeliveryAddress("1 Main St", "LA", "CA", "United States", "90001");
        return new CheckoutRequest(token, List.of(new CheckoutRequest.Line(42L, 2)), contact, address, address);
    }
    private Order pending() {
        Order order = new Order(); order.setCheckoutToken(token); order.setStatus("PENDING");
        order.setCurrency("usd"); order.setTotalPrice(new BigDecimal("20.00"));
        order.setOrderTrackingNumber("tracking"); order.setPaymentIntentId("pi_123");
        Customer customer = new Customer(); customer.setEmail("alex@example.com"); order.setCustomer(customer);
        return order;
    }
    private PaymentIntent intent() {
        PaymentIntent intent = new PaymentIntent(); intent.setId("pi_123"); intent.setCurrency("usd");
        intent.setAmount(2000L); intent.setAmountReceived(2000L); intent.setStatus("succeeded");
        intent.setMetadata(Map.of("checkout_token", token)); intent.setClientSecret("secret");
        return intent;
    }

    @Test void ignoresBrowserPricesAndPersistsServerCalculatedSnapshot() throws Exception {
        // Extra legacy fields are accepted by Jackson only to be ignored; none enter the pricing contract.
        String json = """
            {"requestId":"11111111-1111-4111-8111-111111111111",
             "items":[{"variantId":42,"quantity":2,"unitPrice":0.01}],
             "order":{"totalPrice":0.01},"amount":1,
             "customer":{"firstName":"Alex","lastName":"Smith","email":"alex@example.com"},
             "shippingAddress":{"street":"1 Main","city":"LA","state":"CA","country":"US","zipCode":"90001"},
             "billingAddress":{"street":"1 Main","city":"LA","state":"CA","country":"US","zipCode":"90001"}}
            """;
        ObjectMapper mapper = new ObjectMapper().configure(
                com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
        var request = mapper.readValue(json, CheckoutRequest.class);
        when(orders.findByCheckoutToken(token)).thenReturn(Optional.empty());
        when(pricing.price(request.items())).thenReturn(List.of(
                new CheckoutSummary.Line(42L, 7L, "SKU", "Glasses", "image", new BigDecimal("10.00"), 2, new BigDecimal("20.00"))));
        when(customers.findFirstByEmailAndFirstNameAndLastName(anyString(), anyString(), anyString())).thenReturn(new Customer());
        var summary = service.review(request, null);
        assertEquals(new BigDecimal("20.00"), summary.totalPrice());
        ArgumentCaptor<Order> saved = ArgumentCaptor.forClass(Order.class);
        verify(orders).saveAndFlush(saved.capture());
        assertEquals("PENDING", saved.getValue().getStatus());
        assertEquals(42L, saved.getValue().getOrderItems().iterator().next().getVariantId());
        verifyNoInteractions(payments);
    }

    @Test void retryReturnsOriginalSnapshotWithoutRepricing() {
        Order order = pending(); order.setOrderItems(new HashSet<>());
        when(orders.findByCheckoutToken(token)).thenReturn(Optional.of(order));
        assertEquals(new BigDecimal("20.00"), service.review(request(), null).totalPrice());
        verifyNoInteractions(pricing, payments, customers);
    }

    @Test void paymentUsesSavedTotalAndReusesSavedIntent() throws Exception {
        Order order = pending(); order.setPaymentIntentId(null);
        when(orders.findByCheckoutToken(token)).thenReturn(Optional.of(order));
        when(payments.create(2000L, "alex@example.com", token)).thenReturn(intent());
        service.createPaymentIntent(token);
        assertEquals("pi_123", order.getPaymentIntentId());
        when(payments.retrieve("pi_123")).thenReturn(intent());
        service.createPaymentIntent(token);
        verify(payments, times(1)).create(anyLong(), anyString(), anyString());
    }

    @Test void refusesUnpaidWrongAmountWrongCurrencyAndWrongOrderPayments() throws Exception {
        Order order = pending();
        when(orders.findByCheckoutToken(token)).thenReturn(Optional.of(order));
        var intent = intent();
        when(payments.retrieve("pi_123")).thenReturn(intent);
        intent.setStatus("requires_action");
        assertThrows(ResponseStatusException.class, () -> service.placeOrder(token));
        intent.setStatus("succeeded"); intent.setAmount(1L);
        assertThrows(ResponseStatusException.class, () -> service.placeOrder(token));
        intent.setAmount(2000L); intent.setAmountReceived(1L);
        assertThrows(ResponseStatusException.class, () -> service.placeOrder(token));
        intent.setAmountReceived(2000L); intent.setCurrency("eur");
        assertThrows(ResponseStatusException.class, () -> service.placeOrder(token));
        intent.setCurrency("usd"); intent.setMetadata(Map.of("checkout_token", "another-order"));
        assertThrows(ResponseStatusException.class, () -> service.placeOrder(token));
        assertNotEquals("PAID", order.getStatus());
        verify(orders, times(1)).save(order);
    }

    @Test void paidConfirmationIsIdempotentAndDoesNotReprice() throws Exception {
        Order order = pending();
        when(orders.findByCheckoutToken(token)).thenReturn(Optional.of(order));
        when(payments.retrieve("pi_123")).thenReturn(intent());
        assertEquals("tracking", service.placeOrder(token).getOrderTrackingNumber());
        assertEquals("tracking", service.placeOrder(token).getOrderTrackingNumber());
        assertEquals("PAID", order.getStatus());
        verify(payments, times(1)).retrieve("pi_123");
        verify(orders, times(1)).save(order);
        verifyNoInteractions(pricing);
    }

    @Test void rejectsMissingPaymentAndInvalidToken() {
        Order order = pending(); order.setPaymentIntentId(null);
        when(orders.findByCheckoutToken(token)).thenReturn(Optional.of(order));
        assertThrows(ResponseStatusException.class, () -> service.placeOrder(token));
        assertThrows(ResponseStatusException.class, () -> service.createPaymentIntent("bad-token"));
        verifyNoInteractions(payments);
    }
    @Test void cancelsTheProviderIntentBeforeCancellingTheOrder() throws Exception {
        Order order = pending();
        when(orders.findByCheckoutToken(token)).thenReturn(Optional.of(order));
        var intent = intent(); intent.setStatus("requires_payment_method");
        when(payments.retrieve("pi_123")).thenReturn(intent);
        service.cancel(token);
        var sequence = inOrder(payments, orders);
        sequence.verify(orders).findByCheckoutToken(token);
        sequence.verify(payments).retrieve("pi_123");
        sequence.verify(payments).cancel("pi_123");
        sequence.verify(orders).save(order);
        assertEquals("CANCELLED", order.getStatus());
    }

    @Test void refusesToCancelSucceededPaymentsOrPayCancelledOrders() throws Exception {
        Order order = pending();
        when(orders.findByCheckoutToken(token)).thenReturn(Optional.of(order));
        when(payments.retrieve("pi_123")).thenReturn(intent());
        assertThrows(ResponseStatusException.class, () -> service.cancel(token));
        verify(payments, never()).cancel(anyString());
        order.setStatus("CANCELLED");
        assertThrows(ResponseStatusException.class, () -> service.createPaymentIntent(token));
        assertThrows(ResponseStatusException.class, () -> service.placeOrder(token));
        verify(orders, never()).save(any());
    }

    @Test void expiresUnstartedCheckoutsWithoutCreatingAPayment() {
        Order order = pending(); order.setPaymentIntentId(null);
        order.setDateCreated(Date.from(java.time.Instant.now().minusSeconds(3600)));
        when(orders.findByCheckoutToken(token)).thenReturn(Optional.of(order));
        assertThrows(ResponseStatusException.class, () -> service.createPaymentIntent(token));
        verifyNoInteractions(payments);
    }

    @Test void refusesToCancelPaymentsAwaitingCapture() throws Exception {
        Order order = pending();
        when(orders.findByCheckoutToken(token)).thenReturn(Optional.of(order));
        var payment = intent(); payment.setStatus("requires_capture");
        when(payments.retrieve("pi_123")).thenReturn(payment);
        assertThrows(ResponseStatusException.class, () -> service.cancel(token));
        verify(payments, never()).cancel(anyString());
        verify(orders, never()).save(any());
    }
}