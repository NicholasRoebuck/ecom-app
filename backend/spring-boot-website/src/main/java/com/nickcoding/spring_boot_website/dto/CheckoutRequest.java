package com.nickcoding.spring_boot_website.dto;

import java.util.List;

// Only customer input belongs here. Prices, entity IDs and order status are server-owned.
public record CheckoutRequest(String requestId, List<Line> items, Contact customer,
                              DeliveryAddress shippingAddress, DeliveryAddress billingAddress) {
    public record Line(
        @com.fasterxml.jackson.databind.annotation.JsonDeserialize(using = CheckoutNumberDeserializers.VariantId.class) Long variantId,
        @com.fasterxml.jackson.databind.annotation.JsonDeserialize(using = CheckoutNumberDeserializers.Quantity.class) Integer quantity) {}
    public record Contact(String firstName, String lastName, String email) {}
    public record DeliveryAddress(String street, String city, String state, String country, String zipCode) {}
}
