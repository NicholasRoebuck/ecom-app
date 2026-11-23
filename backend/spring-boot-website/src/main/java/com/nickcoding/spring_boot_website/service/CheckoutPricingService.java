package com.nickcoding.spring_boot_website.service;

import com.nickcoding.spring_boot_website.dao.ProductVariantRepository;
import com.nickcoding.spring_boot_website.dto.*;
import com.nickcoding.spring_boot_website.entity.ProductVariant;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.*;

@Service
public class CheckoutPricingService {
    private final ProductVariantRepository variants;
    public CheckoutPricingService(ProductVariantRepository variants) { this.variants = variants; }

    // A quote reads the catalog only: no customer data, pending order, or payment is created.
    @Transactional(readOnly = true)
    public CartQuote quote(List<CheckoutRequest.Line> items) {
        CheckoutValidation.lines(items);
        Map<Long, Integer> quantities = new LinkedHashMap<>();
        for (var line : items) quantities.merge(line.variantId(), line.quantity(), Integer::sum);
        Map<Long, ProductVariant> found = new HashMap<>();
        variants.findAllById(quantities.keySet()).forEach(variant -> found.put(variant.getId(), variant));
        List<CartQuote.Line> lines = new ArrayList<>();
        for (var entry : quantities.entrySet()) {
            ProductVariant variant = found.get(entry.getKey());
            if (variant == null) {
                lines.add(new CartQuote.Line(entry.getKey(), null, null, null, null, null,
                        entry.getValue(), BigDecimal.ZERO, false, "This item is no longer available. Please remove it."));
                continue;
            }
            BigDecimal price = variant.getUnitPrice();
            String message = "";
            if (price == null || price.signum() <= 0) price = null;
            if (price != null) {
                try { price = price.setScale(2, RoundingMode.UNNECESSARY); }
                catch (ArithmeticException ex) { price = null; }
            }
            if (!variant.isActive()) message = "This item is no longer available. Please remove it.";
            else if (variant.getUnitsInStock() < entry.getValue())
                message = "Only " + Math.max(0, variant.getUnitsInStock()) + " available. Reduce the quantity or remove this item.";
            else if (price == null) message = "This item cannot currently be purchased. Please remove it.";
            BigDecimal subtotal = price == null ? BigDecimal.ZERO : price.multiply(BigDecimal.valueOf(entry.getValue()));
            lines.add(new CartQuote.Line(variant.getId(), variant.getProduct().getId(), variant.getSku(),
                    variant.displayName(), variant.getImageUrl(), price, entry.getValue(), subtotal,
                    message.isEmpty(), message));
        }
        return new CartQuote("usd", lines.stream().map(CartQuote.Line::subtotal).reduce(BigDecimal.ZERO, BigDecimal::add),
                quantities.values().stream().mapToInt(Integer::intValue).sum(),
                lines.stream().allMatch(CartQuote.Line::available), lines);
    }

    @Transactional(readOnly = true)
    public List<CheckoutSummary.Line> price(List<CheckoutRequest.Line> items) {
        CartQuote quote = quote(items);
        if (!quote.available()) {
            Map<Long, String> unavailable = new HashMap<>();
            quote.items().stream().filter(line -> !line.available()).forEach(line -> unavailable.put(line.variantId(), line.message()));
            Map<String, String> errors = new LinkedHashMap<>();
            for (int i = 0; i < items.size(); i++) {
                String message = unavailable.get(items.get(i).variantId());
                if (message != null) errors.put("items[" + i + "]", message);
            }
            throw new CheckoutValidationException(HttpStatus.CONFLICT, errors);
        }
        return quote.items().stream().map(line -> new CheckoutSummary.Line(line.variantId(), line.productId(),
                line.sku(), line.name(), line.imageUrl(), line.unitPrice(), line.quantity(), line.subtotal())).toList();
    }

    public static ResponseStatusException badRequest(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }
}
