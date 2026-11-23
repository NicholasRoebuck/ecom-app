package com.nickcoding.spring_boot_website.service;

import com.nickcoding.spring_boot_website.dto.CheckoutRequest;
import java.util.*;

public final class CheckoutValidation {
    private CheckoutValidation() {}
    public static void review(CheckoutRequest request) {
        Map<String, String> errors = new LinkedHashMap<>();
        var contact = request.customer();
        text(errors, "customer.firstName", contact == null ? null : contact.firstName(), "First name", 100);
        text(errors, "customer.lastName", contact == null ? null : contact.lastName(), "Last name", 100);
        String email = contact == null ? null : contact.email();
        text(errors, "customer.email", email, "Email", 254);
        if (!errors.containsKey("customer.email") && !email.trim().matches("[^\\s@]+@[^\\s@]+\\.[^\\s@]+"))
            errors.put("customer.email", "Enter a valid email address.");
        address(errors, "shippingAddress", request.shippingAddress());
        address(errors, "billingAddress", request.billingAddress());
        lines(errors, request.items());
        reject(errors);
    }
    public static void lines(List<CheckoutRequest.Line> items) {
        Map<String, String> errors = new LinkedHashMap<>();
        lines(errors, items); reject(errors);
    }
    private static void lines(Map<String, String> errors, List<CheckoutRequest.Line> items) {
        if (items == null || items.isEmpty() || items.size() > 100) {
            errors.put("items", "A cart must contain between 1 and 100 items."); return;
        }
        Map<Long, Integer> quantities = new HashMap<>();
        for (int i = 0; i < items.size(); i++) {
            var line = items.get(i); String path = "items[" + i + "]";
            if (line == null || line.variantId() == null || line.variantId() <= 0)
                errors.put(path + ".variantId", "Choose a valid product variation.");
            if (line == null || line.quantity() == null || line.quantity() < 1 || line.quantity() > 999)
                errors.put(path + ".quantity", "Quantity must be a whole number from 1 to 999.");
            else if (line.variantId() != null && line.variantId() > 0) {
                int total = quantities.getOrDefault(line.variantId(), 0) + line.quantity();
                quantities.put(line.variantId(), total);
                if (total > 999) errors.put(path + ".quantity", "The total quantity for this variation cannot exceed 999.");
            }
        }
    }
    private static void address(Map<String, String> errors, String prefix, CheckoutRequest.DeliveryAddress address) {
        text(errors, prefix + ".street", address == null ? null : address.street(), "Street", 255);
        text(errors, prefix + ".city", address == null ? null : address.city(), "City", 100);
        text(errors, prefix + ".state", address == null ? null : address.state(), "State", 100);
        text(errors, prefix + ".country", address == null ? null : address.country(), "Country", 100);
        text(errors, prefix + ".zipCode", address == null ? null : address.zipCode(), "Zip code", 30);
    }
    private static void text(Map<String, String> errors, String path, String value, String label, int max) {
        if (value == null || value.isBlank()) errors.put(path, label + " is required.");
        else if (value.length() > max) errors.put(path, label + " must be " + max + " characters or fewer.");
    }
    private static void reject(Map<String, String> errors) {
        if (!errors.isEmpty()) throw new CheckoutValidationException(errors);
    }
}
