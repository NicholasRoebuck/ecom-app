package com.nickcoding.spring_boot_website.dto;

import java.math.BigDecimal;
import java.util.List;

public record CheckoutSummary(String checkoutToken, String orderTrackingNumber, String status,
                              String currency, BigDecimal totalPrice, int totalQuantity, List<Line> items) {
    public record Line(Long variantId, Long productId, String sku, String name, String imageUrl,
                       BigDecimal unitPrice, int quantity, BigDecimal subtotal) {}
}
