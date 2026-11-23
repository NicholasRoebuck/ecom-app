package com.nickcoding.spring_boot_website.service;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import java.util.Map;
import java.util.LinkedHashMap;
import java.util.Collections;

public class CheckoutValidationException extends ResponseStatusException {
    private final Map<String, String> fieldErrors;
    public CheckoutValidationException(Map<String, String> fields) {
        this(HttpStatus.BAD_REQUEST, fields);
    }
    public CheckoutValidationException(HttpStatus status, Map<String, String> fields) {
        super(status, "Please check your checkout details.");
        fieldErrors = Collections.unmodifiableMap(new LinkedHashMap<>(fields));
    }
    public Map<String, String> getFieldErrors() { return fieldErrors; }
}
