package com.nickcoding.spring_boot_website.service;

import com.nickcoding.spring_boot_website.dto.*;
import com.stripe.exception.StripeException;

public interface CheckoutService {
    void authorize(String token, OrderOwner owner);
    CheckoutDetails details(String token, OrderOwner owner);
    void cancel(String token) throws StripeException;
    CheckoutSummary resume(String token) throws StripeException;
    CheckoutSummary review(CheckoutRequest request, OrderOwner owner);
    CheckoutPaymentResponse createPaymentIntent(String checkoutToken) throws StripeException;
    PurchaseResponse placeOrder(String checkoutToken) throws StripeException;
}
