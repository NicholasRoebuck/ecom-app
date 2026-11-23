package com.nickcoding.spring_boot_website.controller;

import com.nickcoding.spring_boot_website.dto.*;
import com.nickcoding.spring_boot_website.service.CheckoutService;
import com.stripe.exception.StripeException;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;

@RestController
@RequestMapping("/api/checkout")
public class CheckoutController {
    private final CheckoutService checkout;
    private final com.nickcoding.spring_boot_website.service.CheckoutPricingService pricing;
    public CheckoutController(CheckoutService checkout, com.nickcoding.spring_boot_website.service.CheckoutPricingService pricing) { this.checkout = checkout; this.pricing = pricing; }

    @PostMapping("/quote")
    public CartQuote quote(@RequestBody CartQuote.Request request) { return pricing.quote(request.items()); }

    @PostMapping("/cancel")
    public void cancel(@RequestBody CheckoutTokenRequest request, @AuthenticationPrincipal Jwt principal) throws StripeException { checkout.authorize(request.checkoutToken(), OrderOwner.optional(principal)); checkout.cancel(request.checkoutToken()); }

    @PostMapping("/resume")
    public CheckoutSummary resume(@RequestBody CheckoutTokenRequest request, @AuthenticationPrincipal Jwt principal) throws StripeException { checkout.authorize(request.checkoutToken(), OrderOwner.optional(principal)); return checkout.resume(request.checkoutToken()); }

    @PostMapping("/details")
    public CheckoutDetails details(@RequestBody CheckoutTokenRequest request, @AuthenticationPrincipal Jwt principal) {
        return checkout.details(request.checkoutToken(), OrderOwner.optional(principal));
    }

    @PostMapping("/review")
    public CheckoutSummary review(@RequestBody CheckoutRequest request,
            @org.springframework.security.core.annotation.AuthenticationPrincipal org.springframework.security.oauth2.jwt.Jwt principal) {
        return checkout.review(request, OrderOwner.optional(principal));
    }

    @PostMapping("/payment-intent")
    public CheckoutPaymentResponse payment(@RequestBody CheckoutTokenRequest request, @AuthenticationPrincipal Jwt principal) throws StripeException { checkout.authorize(request.checkoutToken(), OrderOwner.optional(principal));
        return checkout.createPaymentIntent(request.checkoutToken());
    }

    @PostMapping("/purchase")
    public PurchaseResponse confirm(@RequestBody CheckoutTokenRequest request, @AuthenticationPrincipal Jwt principal) throws StripeException { checkout.authorize(request.checkoutToken(), OrderOwner.optional(principal));
        return checkout.placeOrder(request.checkoutToken());
    }
}
