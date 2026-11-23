package com.nickcoding.spring_boot_website.dto;

// Returned only for a verified account-owned checkout. Payment credentials are never included.
public record CheckoutDetails(CheckoutRequest.Contact customer,
                              CheckoutRequest.DeliveryAddress shippingAddress,
                              CheckoutRequest.DeliveryAddress billingAddress) {}
