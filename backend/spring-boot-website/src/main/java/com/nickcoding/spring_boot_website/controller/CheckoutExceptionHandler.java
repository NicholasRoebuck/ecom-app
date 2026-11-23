package com.nickcoding.spring_boot_website.controller;

import com.fasterxml.jackson.databind.JsonMappingException;
import com.nickcoding.spring_boot_website.service.CheckoutValidationException;
import com.stripe.exception.StripeException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.*;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import java.util.Map;

@RestControllerAdvice(assignableTypes = CheckoutController.class)
public class CheckoutExceptionHandler {
    public record Error(String code, String message, Map<String, String> fieldErrors) {}
    @ExceptionHandler(CheckoutValidationException.class)
    public ResponseEntity<Error> validation(CheckoutValidationException ex) {
        return ResponseEntity.status(ex.getStatusCode()).body(new Error("VALIDATION_FAILED", ex.getReason(), ex.getFieldErrors()));
    }
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Error> malformed(HttpMessageNotReadableException ex) {
        String path = "";
        Throwable cause = ex.getCause();
        if (cause instanceof JsonMappingException mapping) for (var reference : mapping.getPath()) {
            if (reference.getFieldName() != null) path += (path.isEmpty() ? "" : ".") + reference.getFieldName();
            else if (reference.getIndex() >= 0) path += "[" + reference.getIndex() + "]";
        }
        String message = path.endsWith(".quantity") ? "Quantity must be a whole number from 1 to 999."
                : path.endsWith(".variantId") ? "Choose a valid product variation." : "Check the format of this field.";
        return ResponseEntity.badRequest().body(new Error("INVALID_REQUEST", "Checkout details could not be read.",
                Map.of(path.isEmpty() ? "request" : path, message)));
    }
    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Error> invalid(ResponseStatusException ex) {
        return ResponseEntity.status(ex.getStatusCode()).body(new Error("CHECKOUT_REQUEST_FAILED",
                ex.getReason() == null ? "Checkout failed." : ex.getReason(), Map.of()));
    }
    @ExceptionHandler(StripeException.class)
    public ResponseEntity<Error> payment(StripeException ex) {
        return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(new Error("PAYMENT_SERVICE_UNAVAILABLE",
                "The payment service is unavailable. Retry this checkout; do not start a second purchase.", Map.of()));
    }
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<Error> duplicate(DataIntegrityViolationException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(new Error("CHECKOUT_CONFLICT",
                "Checkout could not be saved. Retry the same checkout.", Map.of()));
    }
}
