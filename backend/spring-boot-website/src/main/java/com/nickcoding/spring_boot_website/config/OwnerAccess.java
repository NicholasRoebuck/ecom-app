package com.nickcoding.spring_boot_website.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.authorization.AuthorizationDecision;
import org.springframework.security.authorization.AuthorizationManager;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.security.web.access.intercept.RequestAuthorizationContext;
import org.springframework.stereotype.Component;
import java.util.function.Supplier;

@Component
public class OwnerAccess implements AuthorizationManager<RequestAuthorizationContext> {
    private final String issuer;
    private final String subject;

    public OwnerAccess(@Value("${app.owner.issuer:}") String issuer,
                       @Value("${app.owner.subject:}") String subject) {
        this.issuer = issuer;
        this.subject = subject;
    }

    public boolean isOwner(Authentication authentication) {
        // An unconfigured owner always denies access. Email, roles, and client-supplied fields are irrelevant.
        if (issuer == null || issuer.isBlank() || subject == null || subject.isBlank()
                || !(authentication instanceof JwtAuthenticationToken jwt) || !authentication.isAuthenticated())
            return false;
        var token = jwt.getToken();
        return token.getIssuer() != null && issuer.equals(token.getIssuer().toString()) && subject.equals(token.getSubject());
    }

    @Override
    public AuthorizationDecision check(Supplier<Authentication> authentication, RequestAuthorizationContext context) {
        return new AuthorizationDecision(isOwner(authentication.get()));
    }
}
