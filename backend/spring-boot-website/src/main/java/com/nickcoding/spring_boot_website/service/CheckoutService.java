package com.nickcoding.spring_boot_website.service;

import com.nickcoding.spring_boot_website.dao.PaymentInfo;
import com.nickcoding.spring_boot_website.dto.Purchase;
import com.nickcoding.spring_boot_website.dto.PurchaseResponse;
import com.stripe.exception.StripeException;
import com.stripe.model.PaymentIntent;

public interface CheckoutService {

    PurchaseResponse placeOrder(Purchase purchase);

    PaymentIntent createPaymentIntent(PaymentInfo paymentInfo) throws StripeException;
}
