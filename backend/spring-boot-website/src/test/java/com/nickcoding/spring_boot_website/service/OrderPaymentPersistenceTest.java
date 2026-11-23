package com.nickcoding.spring_boot_website.service;

import com.nickcoding.spring_boot_website.dao.OrderRepository;
import com.nickcoding.spring_boot_website.entity.Customer;
import com.nickcoding.spring_boot_website.entity.Order;
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
import java.math.BigDecimal;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@DataJpaTest(showSql = false, properties = {
    "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect",
    "spring.jpa.hibernate.ddl-auto=create-drop", "checkout.reconciliation.enabled=false",
    "spring.jpa.show-sql=false"
})
@Import({OrderPaymentService.class, CheckoutInventoryService.class})
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class OrderPaymentPersistenceTest {
    @Autowired OrderPaymentService service;
    @Autowired OrderRepository orders;
    @Autowired EntityManager em;
    @Autowired PlatformTransactionManager manager;
    @MockitoBean StripePaymentGateway payments;
    TransactionTemplate tx;
    String token;
    Long orderId;
    Long customerId;

    @BeforeEach void setup() throws Exception {
        tx = new TransactionTemplate(manager);
        token = UUID.randomUUID().toString();
        orderId = tx.execute(status -> {
            Customer customer = new Customer(); customer.setFirstName("Test"); customer.setLastName("Recovery");
            customer.setEmail("recovery@example.com"); em.persist(customer); customerId = customer.getId();
            Order order = new Order(); order.setCheckoutToken(token); order.setStatus("PENDING");
            order.setPaymentIntentId("pi_" + token); order.setOrderTrackingNumber(UUID.randomUUID().toString());
            order.setCurrency("usd"); order.setTotalPrice(new BigDecimal("20.00")); order.setTotalQuantity(1);
            order.setCustomer(customer);
            return orders.saveAndFlush(order).getId();
        });
        PaymentIntent intent = new PaymentIntent(); intent.setId("pi_" + token);
        intent.setStatus("succeeded"); intent.setCurrency("usd"); intent.setAmount(2000L); intent.setAmountReceived(2000L);
        intent.setMetadata(Map.of("checkout_token", token));
        when(payments.retrieve("pi_" + token)).thenReturn(intent);
    }

    @AfterEach void cleanup() {
        tx.executeWithoutResult(status -> {
            orders.deleteById(orderId);
            em.remove(em.find(Customer.class, customerId));
        });
    }

    @Test void concurrentBrowserAndWebhookConfirmOnlyOnce() throws Exception {
        ExecutorService executor = Executors.newFixedThreadPool(2);
        CountDownLatch start = new CountDownLatch(1);
        try {
            Callable<String> confirm = () -> { start.await(); return service.reconcile(token, null).status(); };
            Future<String> browser = executor.submit(confirm);
            Future<String> webhook = executor.submit(confirm);
            start.countDown();
            assertEquals("PAID", browser.get(15, TimeUnit.SECONDS));
            assertEquals("PAID", webhook.get(15, TimeUnit.SECONDS));
            assertEquals("PAID", orders.findById(orderId).orElseThrow().getStatus());
            verify(payments, times(1)).retrieve("pi_" + token);
        } finally { executor.shutdownNow(); }
    }

    @Test void aRolledBackConfirmationIsRecoveredWithoutCreatingAnotherPayment() throws Exception {
        tx.executeWithoutResult(status -> {
            try { assertEquals("PAID", service.reconcile(token, null).status()); }
            catch (Exception ex) { throw new RuntimeException(ex); }
            status.setRollbackOnly(); // Simulate failure before the database commit.
        });
        assertEquals("PENDING", orders.findById(orderId).orElseThrow().getStatus());
        assertEquals("PAID", service.reconcile(token, null).status());
        assertEquals("pi_" + token, orders.findById(orderId).orElseThrow().getPaymentIntentId());
        verify(payments, never()).create(anyLong(), anyString(), anyString());
    }
    @Test void recoveryQueryIncludesPendingPaymentsButSkipsPaidOrdersAndEarlierPages() throws Exception {
        var page = org.springframework.data.domain.PageRequest.of(0, 100);
        var cutoff = Date.from(java.time.Instant.now().minusSeconds(1800));
        var candidates = orders.findPaymentRecoveryCandidates(OrderPaymentService.RECOVERABLE, 0, cutoff, page);
        assertEquals(1, candidates.size());
        assertEquals(token, candidates.getFirst().getCheckoutToken());
        assertTrue(orders.findPaymentRecoveryCandidates(OrderPaymentService.RECOVERABLE, orderId, cutoff, page).isEmpty());
        service.reconcile(token, null);
        assertTrue(orders.findPaymentRecoveryCandidates(OrderPaymentService.RECOVERABLE, 0, cutoff, page).isEmpty());
    }
}