package com.nickcoding.spring_boot_website.dto;

import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

// Constructed from the validated authentication principal, never from a request body or email.
public record OrderOwner(String issuer, String subject) {
    public OrderOwner {
        if (issuer == null || issuer.isBlank() || issuer.length() > 255
                || subject == null || subject.isBlank() || subject.length() > 255)
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "A valid account identity is required.");
    }
    public static OrderOwner authenticated(Jwt jwt) {
        if (jwt == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Sign in to view orders.");
        return new OrderOwner(jwt.getIssuer() == null ? null : jwt.getIssuer().toString(), jwt.getSubject());
    }
    public static OrderOwner optional(Jwt jwt) { return jwt == null ? null : authenticated(jwt); }
}
