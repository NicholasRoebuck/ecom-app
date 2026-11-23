package com.nickcoding.spring_boot_website.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.nickcoding.spring_boot_website.service.OrderPaymentService;
import com.nickcoding.spring_boot_website.service.PaymentLog;
import com.nickcoding.spring_boot_website.service.StripePaymentGateway;
import com.stripe.exception.SignatureVerificationException;
import com.stripe.net.Webhook;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import java.util.Set;

@RestController
@RequestMapping("/api/checkout/webhook")
public class StripeWebhookController {
    private static final Set<String> EVENTS = Set.of("payment_intent.succeeded", "payment_intent.processing",
            "payment_intent.payment_failed", "payment_intent.requires_action", "payment_intent.canceled");
    private final String secret;
    private final OrderPaymentService reconciliation;
    private final StripePaymentGateway payments;
    private final ObjectMapper mapper;

    public StripeWebhookController(@Value("${stripe.webhook.secret:${STRIPE_WEBHOOK_SECRET:}}") String secret,
                                   OrderPaymentService reconciliation, StripePaymentGateway payments, ObjectMapper mapper) {
        this.secret = secret; this.reconciliation = reconciliation; this.payments = payments; this.mapper = mapper;
    }

    @PostMapping
    public ResponseEntity<Void> receive(@RequestBody String body,
            @RequestHeader(value = "Stripe-Signature", required = false) String signature) throws Exception {
        if (secret.isBlank()) return rejected(HttpStatus.SERVICE_UNAVAILABLE, "not_configured");
        if (signature == null) return rejected(HttpStatus.BAD_REQUEST, "missing_signature");
        com.stripe.model.Event event;
        try {
            event = Webhook.constructEvent(body, signature, secret);
        } catch (SignatureVerificationException | RuntimeException ex) {
            return rejected(HttpStatus.BAD_REQUEST, "invalid_signature_or_payload");
        }
        if (event == null || event.getType() == null) return rejected(HttpStatus.BAD_REQUEST, "invalid_payload");
        if (!EVENTS.contains(event.getType())) {
            PaymentLog.webhook("ignored", null, event.getId(), "unsupported_event");
            return ResponseEntity.ok().build();
        }
        try (var source = PaymentLog.source(PaymentLog.Source.WEBHOOK)) {
            var data = mapper.readTree(body).path("data").path("object");
            String id = data.path("id").asText();
            if (!id.startsWith("pi_")) return rejected(HttpStatus.BAD_REQUEST, "invalid_payment_reference");
            var intent = payments.retrieve(id);
            String token = intent.getMetadata() == null ? null : intent.getMetadata().get("checkout_token");
            if (token == null) {
                PaymentLog.webhook("ignored", null, event.getId(), "not_checkout_payment");
            } else {
                var result = reconciliation.reconcile(token, id);
                PaymentLog.webhook("processed", result == null ? null : result.orderId(), event.getId(), "reconciled");
            }
            return ResponseEntity.ok().build();
        } catch (Exception ex) {
            PaymentLog.webhookFailed(event.getId(), ex);
            throw ex; // Preserve failed delivery so Stripe retries.
        }
    }

    private ResponseEntity<Void> rejected(HttpStatus status, String reason) {
        PaymentLog.webhookRejected(reason);
        return ResponseEntity.status(status).build();
    }
}
