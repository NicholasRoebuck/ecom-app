package com.nickcoding.spring_boot_website.service;

import com.stripe.Stripe;
import com.stripe.exception.StripeException;
import com.stripe.model.PaymentIntent;
import com.stripe.net.RequestOptions;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import java.util.Map;
import java.util.List;

@Service
public class StripePaymentGateway {
    public StripePaymentGateway(@Value("${stripe.key.secret}") String secretKey) { Stripe.apiKey = secretKey; }

    public PaymentIntent create(long amount, String email, String token) throws StripeException {
        return PaymentIntent.create(Map.of(
                "amount", amount, "currency", "usd", "payment_method_types", List.of("card"),
                "receipt_email", email, "description", "Premear purchase",
                "metadata", Map.of("checkout_token", token)),
                RequestOptions.builder().setIdempotencyKey("checkout-" + token).build());
    }

    public void cancel(String id) throws StripeException { PaymentIntent.retrieve(id).cancel(); }
    public PaymentIntent retrieve(String id) throws StripeException { return PaymentIntent.retrieve(id); }
}
