package com.nickcoding.spring_boot_website.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.nickcoding.spring_boot_website.controller.StripeWebhookController;
import com.stripe.model.PaymentIntent;
import org.junit.jupiter.api.Test;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class StripeWebhookControllerTest {
    private String signature(String body, String secret) throws Exception {
        long timestamp = Instant.now().getEpochSecond();
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        String digest = HexFormat.of().formatHex(mac.doFinal((timestamp + "." + body).getBytes(StandardCharsets.UTF_8)));
        return "t=" + timestamp + ",v1=" + digest;
    }

    @Test void rejectsUnsignedForgedAndUnconfiguredWebhooks() throws Exception {
        var checkout = mock(OrderPaymentService.class);
        var gateway = mock(StripePaymentGateway.class);
        var controller = new StripeWebhookController("whsec_test", checkout, gateway, new ObjectMapper());
        assertEquals(400, controller.receive("{}", null).getStatusCode().value());
        assertEquals(400, controller.receive("{}", signature("{}", "wrong")).getStatusCode().value());
        var disabled = new StripeWebhookController("", checkout, gateway, new ObjectMapper());
        assertEquals(503, disabled.receive("{}", null).getStatusCode().value());
        verifyNoInteractions(checkout, gateway);
    }

    @Test void verifiesSignatureAndRetrievesPaymentBeforeConfirming() throws Exception {
        var checkout = mock(OrderPaymentService.class);
        var gateway = mock(StripePaymentGateway.class);
        var controller = new StripeWebhookController("whsec_test", checkout, gateway, new ObjectMapper());
        String body = """
                {"id":"evt_test","object":"event","type":"payment_intent.succeeded",
                 "data":{"object":{"id":"pi_test","object":"payment_intent"}}}
                """;
        var intent = new PaymentIntent(); intent.setMetadata(Map.of("checkout_token", "token"));
        when(gateway.retrieve("pi_test")).thenReturn(intent);
        assertEquals(200, controller.receive(body, signature(body, "whsec_test")).getStatusCode().value());
        verify(gateway).retrieve("pi_test");
        verify(checkout).reconcile("token", "pi_test");
    }
    @Test void databaseFailuresAreNotAcknowledgedSoStripeCanRetryDelivery() throws Exception {
        var checkout = mock(OrderPaymentService.class);
        var gateway = mock(StripePaymentGateway.class);
        var controller = new StripeWebhookController("whsec_test", checkout, gateway, new ObjectMapper());
        String body = """
            {"id":"evt_retry","object":"event","type":"payment_intent.succeeded",
             "data":{"object":{"id":"pi_test","object":"payment_intent"}}}
            """;
        var intent = new PaymentIntent(); intent.setMetadata(Map.of("checkout_token", "token"));
        when(gateway.retrieve("pi_test")).thenReturn(intent);
        when(checkout.reconcile("token", "pi_test")).thenThrow(new RuntimeException("simulated database outage"));
        assertThrows(RuntimeException.class, () -> controller.receive(body, signature(body, "whsec_test")));
    }

    @Test void signedFailureEventsUseTheCurrentPaymentRatherThanTrustingTheOldEventStatus() throws Exception {
        var checkout = mock(OrderPaymentService.class);
        var gateway = mock(StripePaymentGateway.class);
        var controller = new StripeWebhookController("whsec_test", checkout, gateway, new ObjectMapper());
        String body = """
            {"id":"evt_old_failure","object":"event","type":"payment_intent.payment_failed",
             "data":{"object":{"id":"pi_test","object":"payment_intent","status":"requires_payment_method"}}}
            """;
        var intent = new PaymentIntent(); intent.setStatus("succeeded"); intent.setMetadata(Map.of("checkout_token", "token"));
        when(gateway.retrieve("pi_test")).thenReturn(intent);
        assertEquals(200, controller.receive(body, signature(body, "whsec_test")).getStatusCode().value());
        verify(checkout).reconcile("token", "pi_test");
    }
}