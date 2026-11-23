package com.nickcoding.spring_boot_website.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

// Stable key=value fields work with the existing console logger and hosting log collectors.
// Never pass request bodies, customer data, Stripe responses, secrets, or exception messages here.
public final class PaymentLog {
    private static final Logger log = LoggerFactory.getLogger("payments");
    public enum Source { BROWSER, WEBHOOK, BACKGROUND }
    private static final String SOURCE = "payment_source";
    private PaymentLog() {}

    public static MDC.MDCCloseable source(Source source) {
        return MDC.putCloseable(SOURCE, source.name());
    }

    private static String source() {
        String value = MDC.get(SOURCE);
        for (Source source : Source.values()) if (source.name().equals(value)) return value;
        return Source.BROWSER.name();
    }

    public static boolean isBackground() { return Source.BACKGROUND.name().equals(source()); }

    private static String safe(String value) {
        return value != null && value.matches("[A-Za-z0-9_]{1,100}") ? value : "unknown";
    }

    public static void afterCommit(Runnable action) {
        if (TransactionSynchronizationManager.isActualTransactionActive()
                && TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCommit() { action.run(); }
            });
        } else { action.run(); }
    }

    public static void paymentIntent(Long orderId, boolean created) {
        String source = source();
        String event = created ? "payment_intent_created" : "payment_intent_reused";
        afterCommit(() -> log.info("event={} source={} order_id={}", event, source, orderId));
    }

    public static void transition(Long orderId, String previous, String status) {
        String source = source();
        String before = safe(previous), after = safe(status);
        afterCommit(() -> {
            log.info("event=order_status_changed source={} order_id={} previous_status={} status={}",
                    source, orderId, before, after);
            if (Source.BACKGROUND.name().equals(source) && "PAID".equals(after))
                log.info("event=payment_recovered source=BACKGROUND order_id={}", orderId);
        });
    }

    public static void failed(String event, Long orderId, Exception error) {
        log.warn("event={} source={} order_id={} error_type={}",
                safe(event), source(), orderId, safe(error.getClass().getSimpleName()));
    }

    public static void webhook(String outcome, Long orderId, String eventId, String reason) {
        log.info("event=webhook_{} source=WEBHOOK order_id={} event_id={} reason={}",
                safe(outcome), orderId, safe(eventId), safe(reason));
    }

    public static void webhookFailed(String eventId, Exception error) {
        log.warn("event=webhook_failed source=WEBHOOK event_id={} error_type={}",
                safe(eventId), safe(error.getClass().getSimpleName()));
    }

    public static void webhookRejected(String reason) {
        log.warn("event=webhook_rejected source=WEBHOOK reason={}", safe(reason));
    }
}
