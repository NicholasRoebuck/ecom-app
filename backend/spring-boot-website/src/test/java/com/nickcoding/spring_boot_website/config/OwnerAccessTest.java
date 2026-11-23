package com.nickcoding.spring_boot_website.config;

import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;

class OwnerAccessTest {
    private JwtAuthenticationToken token() {
        return new JwtAuthenticationToken(Jwt.withTokenValue("test").header("alg", "RS256")
            .issuer("https://owner.example.test/").subject("owner-subject").build(), List.of());
    }

    @Test void missingOrPartialConfigurationAlwaysDenies() {
        for (var policy : List.of(new OwnerAccess("", ""), new OwnerAccess("https://owner.example.test/", ""),
                new OwnerAccess("", "owner-subject"), new OwnerAccess(" ", "owner-subject")))
            assertFalse(policy.isOwner(token()));
    }

    @Test void acceptsOnlyAnAuthenticatedJwtWithTheExactConfiguredIdentity() {
        var policy = new OwnerAccess("https://owner.example.test/", "owner-subject");
        assertTrue(policy.isOwner(token()));
        assertFalse(policy.isOwner(null));
        assertFalse(policy.isOwner(UsernamePasswordAuthenticationToken.authenticated("owner-subject", null, List.of())));
        assertFalse(new OwnerAccess("https://owner.example.test/", "OWNER-subject").isOwner(token()));
    }
}
