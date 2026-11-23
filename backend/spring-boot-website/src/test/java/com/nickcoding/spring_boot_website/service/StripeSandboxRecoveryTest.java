package com.nickcoding.spring_boot_website.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.nickcoding.spring_boot_website.controller.StripeWebhookController;
import com.nickcoding.spring_boot_website.dao.OrderRepository;
import com.nickcoding.spring_boot_website.entity.Order;
import com.stripe.model.PaymentIntent;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.core.env.Environment;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.*;
import org.springframework.transaction.support.TransactionTemplate;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

@DataJpaTest(showSql = false, properties = {
    "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect",
    "spring.jpa.hibernate.ddl-auto=create-drop", "checkout.reconciliation.enabled=false"
})
@Import({OrderPaymentService.class, StripePaymentGateway.class, CheckoutInventoryService.class})
@Transactional(propagation = Propagation.NOT_SUPPORTED)
@EnabledIfSystemProperty(named = "checkout.stripe-sandbox-tests", matches = "true")
class StripeSandboxRecoveryTest {
    @Autowired Environment environment;
    @Autowired OrderRepository orders;
    @Autowired OrderPaymentService recovery;
    @Autowired StripePaymentGateway gateway;
    @Autowired PlatformTransactionManager manager;

    @Test void recoversAnActualStripeTestPaymentWithoutBrowserConfirmationAndAcceptsDuplicateWebhooks() throws Exception {
        // Explicit opt-in plus a hard test-key guard. Never charge a live card or transmit customer data.
        assertTrue(environment.getRequiredProperty("stripe.key.secret").startsWith("sk_test_"),
                "Sandbox recovery testing requires a Stripe test key.");
        String token = UUID.randomUUID().toString();
        PaymentIntent intent = PaymentIntent.create(Map.of(
                "amount", 50, "currency", "usd", "payment_method_types", List.of("card"),
                "metadata", Map.of("checkout_token", token)));
        assertFalse(intent.getLivemode());
        String paymentId = intent.getId();
        TransactionTemplate tx = new TransactionTemplate(manager);
        Long orderId = tx.execute(status -> {
            Order order = new Order();
            order.setStatus("PENDING"); order.setCheckoutToken(token); order.setPaymentIntentId(paymentId);
            order.setOrderTrackingNumber(UUID.randomUUID().toString()); order.setCurrency("usd");
            order.setTotalPrice(new BigDecimal("0.50")); order.setTotalQuantity(1);
            return orders.saveAndFlush(order).getId();
        });

        PaymentIntent confirmed = intent.confirm(Map.of("payment_method", "pm_card_visa"));
        assertEquals("succeeded", confirmed.getStatus());
        // Deliberately never call the browser purchase endpoint.
        assertEquals("PENDING", orders.findById(orderId).orElseThrow().getStatus());
        new PaymentReconciliationJob(orders, recovery).reconcilePendingOrders();
        assertEquals("PAID", orders.findById(orderId).orElseThrow().getStatus());

        var webhook = new StripeWebhookController("whsec_sandbox_test", recovery, gateway, new ObjectMapper());
        String body = new ObjectMapper().writeValueAsString(Map.of(
                "id", "evt_sandbox_replay", "object", "event", "type", "payment_intent.succeeded",
                "data", Map.of("object", Map.of("id", paymentId, "object", "payment_intent"))));
        long timestamp = Instant.now().getEpochSecond();
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec("whsec_sandbox_test".getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        String signature = "t=" + timestamp + ",v1=" + HexFormat.of().formatHex(
                mac.doFinal((timestamp + "." + body).getBytes(StandardCharsets.UTF_8)));
        assertEquals(200, webhook.receive(body, signature).getStatusCode().value());
        assertEquals(200, webhook.receive(body, signature).getStatusCode().value());
        assertEquals("PAID", orders.findById(orderId).orElseThrow().getStatus());
        assertEquals(1, orders.count());
    }
}
