package com.nickcoding.spring_boot_website.dto;

import java.math.BigDecimal;
import java.util.List;

public record CartQuote(String currency, BigDecimal totalPrice, int totalQuantity,
                        boolean available, List<Line> items) {
    public record Request(List<CheckoutRequest.Line> items) {}
    public record Line(Long variantId, Long productId, String sku, String name, String imageUrl,
                       BigDecimal unitPrice, int quantity, BigDecimal subtotal, boolean available, String message) {}
}
