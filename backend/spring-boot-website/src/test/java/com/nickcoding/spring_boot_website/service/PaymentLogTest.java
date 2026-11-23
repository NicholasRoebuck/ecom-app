package com.nickcoding.spring_boot_website.service;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import org.junit.jupiter.api.*;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import static org.junit.jupiter.api.Assertions.*;

class PaymentLogTest {
    Logger logger;
    Level originalLevel;
    boolean originalAdditive;
    ListAppender<ILoggingEvent> capture;

    @BeforeEach void setup() {
        logger = (Logger) LoggerFactory.getLogger("payments");
        originalLevel = logger.getLevel(); originalAdditive = logger.isAdditive();
        logger.setLevel(Level.INFO); logger.setAdditive(false);
        capture = new ListAppender<>(); capture.start(); logger.addAppender(capture);
    }

    @AfterEach void cleanup() {
        logger.detachAppender(capture); capture.stop();
        logger.setLevel(originalLevel); logger.setAdditive(originalAdditive);
        MDC.remove("payment_source");
        if (TransactionSynchronizationManager.isSynchronizationActive())
            TransactionSynchronizationManager.clearSynchronization();
        TransactionSynchronizationManager.setActualTransactionActive(false);
    }

    void beginTransaction() {
        TransactionSynchronizationManager.setActualTransactionActive(true);
        TransactionSynchronizationManager.initSynchronization();
    }

    @Test void committedTransitionIncludesOrderAndSourceButDoesNotLogBeforeCommit() {
        beginTransaction();
        try (var scope = PaymentLog.source(PaymentLog.Source.WEBHOOK)) {
            PaymentLog.transition(42L, "PENDING", "PAID");
        }
        assertTrue(capture.list.isEmpty());
        TransactionSynchronizationManager.getSynchronizations().forEach(TransactionSynchronization::afterCommit);
        String entry = capture.list.getFirst().getFormattedMessage();
        assertTrue(entry.contains("event=order_status_changed"));
        assertTrue(entry.contains("source=WEBHOOK"));
        assertTrue(entry.contains("order_id=42"));
        assertTrue(entry.contains("previous_status=PENDING status=PAID"));
    }

    @Test void rolledBackTransactionsDoNotLogSuccessfulChangesOrPaymentCreation() {
        beginTransaction();
        PaymentLog.transition(42L, "PENDING", "PAID");
        PaymentLog.paymentIntent(42L, true);
        TransactionSynchronizationManager.getSynchronizations().forEach(
                callback -> callback.afterCompletion(TransactionSynchronization.STATUS_ROLLED_BACK));
        assertTrue(capture.list.isEmpty());
    }

    @Test void routineChecksStayQuietAndBackgroundSuccessIsExplicit() {
        try (var scope = PaymentLog.source(PaymentLog.Source.BACKGROUND)) {
            // Reconciliation calls transition only for an actual status change.
            assertTrue(capture.list.isEmpty());
            PaymentLog.transition(42L, "PROCESSING", "PAID");
        }
        assertEquals(2, capture.list.size());
        assertTrue(capture.list.get(1).getFormattedMessage().contains("event=payment_recovered source=BACKGROUND order_id=42"));
        assertNull(MDC.get("payment_source"));
    }

    @Test void failuresNeverLogExceptionMessagesOrUnsafeProviderValues() {
        String secret = "sk_test_sensitive email@example.com client_secret_sensitive";
        PaymentLog.failed("payment_intent_failed", 42L, new RuntimeException(secret));
        PaymentLog.webhookFailed("evt_bad\n" + secret, new RuntimeException(secret));
        PaymentLog.webhook("ignored", null, "evt_bad\n" + secret, "unsupported_event");
        for (var entry : capture.list) {
            assertFalse(entry.getFormattedMessage().contains("sk_test"));
            assertFalse(entry.getFormattedMessage().contains("email@example.com"));
            assertFalse(entry.getFormattedMessage().contains("client_secret"));
            assertFalse(entry.getFormattedMessage().contains("\n"));
            assertNull(entry.getThrowableProxy());
        }
        assertTrue(capture.list.getFirst().getFormattedMessage().contains("error_type=RuntimeException"));
    }

    @Test void creationAndReuseAreDistinctEvents() {
        PaymentLog.paymentIntent(42L, true);
        PaymentLog.paymentIntent(42L, false);
        assertTrue(capture.list.get(0).getFormattedMessage().contains("event=payment_intent_created source=BROWSER order_id=42"));
        assertTrue(capture.list.get(1).getFormattedMessage().contains("event=payment_intent_reused source=BROWSER order_id=42"));
    }
}
