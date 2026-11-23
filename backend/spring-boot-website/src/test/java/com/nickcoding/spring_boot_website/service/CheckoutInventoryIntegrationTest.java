package com.nickcoding.spring_boot_website.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.nickcoding.spring_boot_website.dao.*;
import com.nickcoding.spring_boot_website.dto.*;
import com.nickcoding.spring_boot_website.entity.*;
import com.stripe.model.PaymentIntent;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.*;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@DataJpaTest(showSql = false, properties = {
    "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect",
    "spring.jpa.hibernate.ddl-auto=create-drop", "checkout.reconciliation.enabled=false",
    "spring.jpa.show-sql=false", "logging.level.root=ERROR", "debug=false"
})
@Import({CheckoutServiceImpl.class, CheckoutPricingService.class, CheckoutInventoryService.class,
    OrderPaymentService.class, AdminProductService.class, ObjectMapper.class})
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class CheckoutInventoryIntegrationTest {
    @Autowired CheckoutServiceImpl checkout;
    @Autowired OrderPaymentService reconciliation;
    @Autowired AdminProductService admin;
    @Autowired OrderRepository orders;
    @Autowired ProductVariantRepository variants;
    @Autowired EntityManager em;
    @Autowired PlatformTransactionManager manager;
    @MockitoBean StripePaymentGateway payments;
    @org.springframework.test.context.bean.override.mockito.MockitoSpyBean CheckoutPricingService pricing;
    TransactionTemplate tx;
    Long variantId, productId;

    @BeforeEach void setup() {
        tx = new TransactionTemplate(manager);
        tx.executeWithoutResult(status -> {
            ProductCategory category = new ProductCategory(); category.setCategoryName("Inventory"); em.persist(category);
            Product product = new Product(); product.setName("Last unit"); product.setCategory(category); em.persist(product);
            ProductVariant variant = new ProductVariant(); variant.setProduct(product); variant.setSku(UUID.randomUUID().toString());
            variant.setActive(true); variant.setUnitPrice(new BigDecimal("10.00")); variant.setUnitsInStock(1);
            em.persist(variant); product.getVariants().add(variant); em.flush();
            variantId = variant.getId(); productId = product.getId();
        });
    }

    @AfterEach void cleanup() {
        tx.executeWithoutResult(status -> {
            em.createQuery("delete from OrderItem").executeUpdate();
            em.createQuery("delete from Order").executeUpdate();
            em.createQuery("delete from Address").executeUpdate();
            em.createQuery("delete from Customer").executeUpdate();
            em.createNativeQuery("delete from product_variant_option").executeUpdate();
            em.createQuery("delete from ProductVariant").executeUpdate();
            em.createQuery("delete from Product").executeUpdate();
            em.createQuery("delete from ProductCategory").executeUpdate();
        });
    }

    CheckoutRequest request(String token) {
        var contact = new CheckoutRequest.Contact("Inventory", "Test", "inventory@example.test");
        var address = new CheckoutRequest.DeliveryAddress("1 Main", "LA", "CA", "US", "90001");
        return new CheckoutRequest(token, List.of(new CheckoutRequest.Line(variantId, 1)), contact, address, address);
    }
    String review() {
        String token = UUID.randomUUID().toString(); checkout.review(request(token), null); return token;
    }
    int stock() { return variants.findById(variantId).orElseThrow().getUnitsInStock(); }
    String inventory(String token) { return tx.execute(s -> orders.findByCheckoutToken(token).orElseThrow().getInventoryStatus()); }
    void age(String token) {
        tx.executeWithoutResult(s -> em.createNativeQuery("update orders set date_created = :created where checkout_token = :token")
            .setParameter("created", Date.from(Instant.now().minusSeconds(3600))).setParameter("token", token).executeUpdate());
    }
    PaymentIntent payment(String token, String status) throws Exception {
        PaymentIntent payment = new PaymentIntent(); payment.setId("pi_" + token); payment.setStatus(status);
        payment.setCurrency("usd"); payment.setAmount(1000L); payment.setAmountReceived(1000L);
        payment.setMetadata(Map.of("checkout_token", token)); payment.setClientSecret("test_secret");
        when(payments.create(1000L, "inventory@example.test", token)).thenReturn(payment);
        when(payments.retrieve(payment.getId())).thenReturn(payment);
        checkout.createPaymentIntent(token);
        return payment;
    }

    @Test void simultaneousLastUnitReviewsAllowOnlyOneReservation() throws Exception {
        // Force both transactions to cache the original stock before either takes the reservation lock.
        var quoted = new CyclicBarrier(2);
        doAnswer(call -> {
            Object result = call.callRealMethod(); quoted.await(10, TimeUnit.SECONDS); return result;
        }).when(pricing).price(anyList());
        var executor = Executors.newFixedThreadPool(2);
        var start = new CountDownLatch(1);
        Callable<Boolean> review = () -> {
            start.await();
            try { review(); return true; }
            catch (ResponseStatusException error) { assertEquals(409, error.getStatusCode().value()); return false; }
        };
        try {
            var first = executor.submit(review); var second = executor.submit(review); start.countDown();
            assertNotEquals(first.get(15, TimeUnit.SECONDS), second.get(15, TimeUnit.SECONDS));
            assertEquals(0, stock()); assertEquals(1, orders.count());
            verifyNoInteractions(payments);
        } finally { executor.shutdownNow(); }
    }

    @Test void repeatedReviewAndPaymentConfirmationDeductOnlyOnce() throws Exception {
        String token = review();
        checkout.review(request(token), null);
        assertEquals(0, stock());
        payment(token, "succeeded");
        assertEquals("PAID", reconciliation.reconcile(token, null).status());
        assertEquals("PAID", reconciliation.reconcile(token, null).status());
        assertEquals("CONSUMED", inventory(token)); assertEquals(0, stock());
        assertThrows(ResponseStatusException.class, () -> checkout.cancel(token));
        assertEquals(0, stock());
    }

    @Test void cancellationRestoresStockExactlyOnceAndAnotherBuyerCanReserveIt() throws Exception {
        String token = review(); payment(token, "requires_payment_method");
        checkout.cancel(token); checkout.cancel(token);
        assertEquals("RELEASED", inventory(token)); assertEquals(1, stock());
        verify(payments, times(1)).cancel("pi_" + token);
        review(); assertEquals(0, stock());
    }

    @Test void abandonedReviewExpiresAndRestoresStock() throws Exception {
        String token = review(); age(token);
        assertEquals("EXPIRED", reconciliation.reconcile(token, null).status());
        reconciliation.reconcile(token, null);
        assertEquals(1, stock()); assertEquals("RELEASED", inventory(token));
        verifyNoInteractions(payments);
    }

    @Test void oldUnpaidIntentIsCancelledBeforeStockIsReleased() throws Exception {
        String token = review(); payment(token, "requires_action"); age(token);
        doAnswer(call -> { assertEquals(0, stock()); return null; }).when(payments).cancel("pi_" + token);
        assertEquals("EXPIRED", reconciliation.reconcile(token, null).status());
        assertEquals(1, stock()); assertEquals("RELEASED", inventory(token));
        verify(payments).cancel("pi_" + token);
    }

    @Test void uncertainCancellationRetainsStockUntilRecoverySucceeds() throws Exception {
        String token = review(); var payment = payment(token, "requires_payment_method"); age(token);
        doThrow(new RuntimeException("provider unavailable")).when(payments).cancel(payment.getId());
        assertThrows(RuntimeException.class, () -> reconciliation.reconcile(token, null));
        assertEquals(0, stock()); assertEquals("RESERVED", inventory(token));
        doNothing().when(payments).cancel(payment.getId());
        assertEquals("EXPIRED", reconciliation.reconcile(token, null).status()); assertEquals(1, stock());
    }

    @Test void cancellationRaceWithSuccessfulPaymentNeverReleasesStock() throws Exception {
        String token = review(); var payment = payment(token, "requires_action"); age(token);
        doAnswer(call -> { payment.setStatus("succeeded"); throw new RuntimeException("payment already succeeded"); })
            .when(payments).cancel(payment.getId());
        assertThrows(RuntimeException.class, () -> reconciliation.reconcile(token, null));
        assertEquals(0, stock());
        assertEquals("PAID", reconciliation.reconcile(token, null).status());
        assertEquals("CONSUMED", inventory(token)); assertEquals(0, stock());
    }

    @Test void processingAndAwaitingCaptureKeepInventoryEvenAfterTimeout() throws Exception {
        String token = review(); var payment = payment(token, "processing"); age(token);
        assertEquals("PROCESSING", reconciliation.reconcile(token, null).status());
        payment.setStatus("requires_capture");
        assertEquals("PROCESSING", reconciliation.reconcile(token, null).status());
        assertEquals("RESERVED", inventory(token)); assertEquals(0, stock());
        verify(payments, never()).cancel(anyString());
    }

    @Test void declinedPaymentRetainsReservationForRetryAndProviderCancellationReleasesIt() throws Exception {
        String token = review(); var payment = payment(token, "requires_payment_method");
        payment.setLastPaymentError(new com.stripe.model.StripeError());
        assertEquals("PAYMENT_FAILED", reconciliation.reconcile(token, null).status());
        assertEquals(0, stock()); assertEquals("RESERVED", inventory(token));
        checkout.createPaymentIntent(token); assertEquals(0, stock());
        payment.setStatus("canceled");
        assertEquals("CANCELLED", reconciliation.reconcile(token, null).status());
        reconciliation.reconcile(token, null); assertEquals(1, stock());
    }

    @Test void rolledBackReviewDoesNotLeakReservationOrOrder() {
        tx.executeWithoutResult(status -> { review(); assertEquals(0, stock()); status.setRollbackOnly(); });
        assertEquals(1, stock()); assertEquals(0, orders.count());
    }

    @Test void staleCatalogSaveCannotOverwriteReservationAndReservedVariantsCannotBeDeleted() {
        var stale = admin.get(productId);
        String token = review();
        assertThrows(ResponseStatusException.class, () -> admin.save(productId, stale));
        var current = admin.get(productId);
        assertThrows(ResponseStatusException.class, () -> admin.delete(productId, current.revision()));
        assertEquals(0, stock()); assertEquals("RESERVED", inventory(token));
    }

    @Test void failureAfterReservationRollsBackEveryLine() {
        Long secondId = tx.execute(status -> {
            Product product = em.find(Product.class, productId);
            ProductVariant second = new ProductVariant(); second.setProduct(product); second.setSku(UUID.randomUUID().toString());
            second.setActive(true); second.setUnitsInStock(1); second.setUnitPrice(new BigDecimal("10.00"));
            em.persist(second); return second.getId();
        });
        var initial = request(UUID.randomUUID().toString());
        var multiple = new CheckoutRequest(initial.requestId(),
            List.of(new CheckoutRequest.Line(variantId, 1), new CheckoutRequest.Line(secondId, 1)),
            initial.customer(), initial.shippingAddress(), initial.billingAddress());
        assertThrows(IllegalStateException.class, () -> tx.executeWithoutResult(status -> {
            checkout.review(multiple, null);
            assertEquals(0, stock());
            assertEquals(0, variants.findById(secondId).orElseThrow().getUnitsInStock());
            throw new IllegalStateException("failure before commit");
        }));
        assertEquals(1, stock()); assertEquals(1, variants.findById(secondId).orElseThrow().getUnitsInStock());
        assertEquals(0, orders.count());
    }

    @Test void removingAReservedVariantIsRejected() {
        review();
        var current = admin.get(productId);
        var replacement = new AdminProductDTO.Variant(null, "replacement-" + UUID.randomUUID(), new BigDecimal("10.00"),
            "", true, BigDecimal.ONE, Map.of());
        var edited = new AdminProductDTO(current.id(), current.name(), current.description(), current.categoryId(),
            current.revision(), List.of(replacement), current.configuration());
        assertThrows(ResponseStatusException.class, () -> admin.save(productId, edited));
        assertTrue(variants.findById(variantId).isPresent()); assertEquals(0, stock());
    }

    @Test void simultaneousDuplicateConfirmationsConsumeTheReservationOnce() throws Exception {
        String token = review(); payment(token, "succeeded");
        var executor = Executors.newFixedThreadPool(2); var start = new CountDownLatch(1);
        Callable<String> confirm = () -> { start.await(); return reconciliation.reconcile(token, null).status(); };
        try {
            var first = executor.submit(confirm); var second = executor.submit(confirm); start.countDown();
            assertEquals("PAID", first.get(15, TimeUnit.SECONDS)); assertEquals("PAID", second.get(15, TimeUnit.SECONDS));
            assertEquals(0, stock()); assertEquals("CONSUMED", inventory(token));
            verify(payments, times(1)).retrieve("pi_" + token);
        } finally { executor.shutdownNow(); }
    }
}
