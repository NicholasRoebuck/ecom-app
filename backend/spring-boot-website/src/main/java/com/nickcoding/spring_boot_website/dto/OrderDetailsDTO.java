package com.nickcoding.spring_boot_website.dto;

import java.math.BigDecimal;
import java.util.List;

public record OrderDetailsDTO(OrderHistoryDTO order, List<Item> items,
                              DeliveryAddress shippingAddress, DeliveryAddress billingAddress) {
    public record Item(Long productId, Long variantId, String name, String sku,
                       String imageUrl, BigDecimal unitPrice, int quantity, BigDecimal subtotal) {}
    public record DeliveryAddress(String street, String city, String state, String country, String zipCode) {}
}
