package com.nickcoding.spring_boot_website;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.HttpMethod;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import com.nickcoding.spring_boot_website.service.StripePaymentGateway;
import java.time.Instant;
import java.util.List;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {
    "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect",
    "spring.jpa.hibernate.ddl-auto=create-drop", "checkout.reconciliation.enabled=false",
    "app.owner.issuer=https://owner.example.test/", "app.owner.subject=owner-Subject",
    "allowed.origins=https://localhost:4200"
})
@AutoConfigureMockMvc
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.ANY)
class AdminAccessIntegrationTest {
    @Autowired MockMvc http;
    @MockitoBean JwtDecoder decoder;
    @MockitoBean StripePaymentGateway payments;

    Jwt identity(String subject, String issuer) {
        var jwt = Jwt.withTokenValue("test").header("alg", "RS256").issuedAt(Instant.now())
            .expiresAt(Instant.now().plusSeconds(300)).audience(List.of("store-api"))
            .claim("email", "same@example.test").claim("roles", List.of("owner"));
        if (subject != null) jwt.subject(subject);
        if (issuer != null) jwt.issuer(issuer);
        return jwt.build();
    }

    @BeforeEach void identities() {
        when(decoder.decode("owner")).thenReturn(identity("owner-Subject", "https://owner.example.test/"));
        when(decoder.decode("customer")).thenReturn(identity("customer-subject", "https://owner.example.test/"));
        when(decoder.decode("case")).thenReturn(identity("owner-subject", "https://owner.example.test/"));
        when(decoder.decode("issuer")).thenReturn(identity("owner-Subject", "https://different.example.test/"));
        when(decoder.decode("missing-sub")).thenReturn(identity(null, "https://owner.example.test/"));
        when(decoder.decode("missing-issuer")).thenReturn(identity("owner-Subject", null));
        when(decoder.decode("invalid")).thenThrow(new BadJwtException("Invalid test token"));
        when(decoder.decode("expired")).thenThrow(new BadJwtException("Expired test token"));
    }

    @Test void verifiedOwnerGetsAccessWithoutExposingIdentityConfiguration() throws Exception {
        http.perform(get("/api/admin/access").header("Authorization", "Bearer owner"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.access").value("owner"))
            .andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(jsonPath("$.subject").doesNotExist()).andExpect(jsonPath("$.issuer").doesNotExist());
    }

    @Test void anonymousInvalidAndExpiredRequestsAreRejected() throws Exception {
        http.perform(get("/api/admin/access")).andExpect(status().isUnauthorized());
        for (String token : List.of("invalid", "expired"))
            http.perform(get("/api/admin/access").header("Authorization", "Bearer " + token))
                .andExpect(status().isUnauthorized());
    }

    @Test void customersCannotGrantThemselvesOwnershipWithEmailRolesHeadersOrParameters() throws Exception {
        http.perform(get("/api/admin/access").header("Authorization", "Bearer customer")
                .header("X-Owner", "true").param("subject", "owner-Subject").param("email", "same@example.test"))
            .andExpect(status().isForbidden()).andExpect(jsonPath("$.error").value("forbidden"));
    }

    @Test void issuerSubjectAndCaseMustMatchExactly() throws Exception {
        for (String token : List.of("case", "issuer", "missing-sub", "missing-issuer"))
            http.perform(get("/api/admin/access").header("Authorization", "Bearer " + token))
                .andExpect(status().isForbidden());
    }

    @Test void prefixProtectsEveryHttpMethodAndFutureAdminRoutes() throws Exception {
        for (HttpMethod method : List.of(HttpMethod.GET, HttpMethod.POST, HttpMethod.PUT, HttpMethod.PATCH, HttpMethod.DELETE)) {
            http.perform(request(method, "/api/admin/future-products")).andExpect(status().isUnauthorized());
            http.perform(request(method, "/api/admin/future-products").header("Authorization", "Bearer customer"))
                .andExpect(status().isForbidden());
        }
        http.perform(get("/api/admin").header("Authorization", "Bearer customer")).andExpect(status().isForbidden());
        http.perform(get("/api/admin/future-products").header("Authorization", "Bearer owner"))
            .andExpect(status().isNotFound());
        verifyNoInteractions(payments);
    }

    @Test void publicCatalogRemainsPublic() throws Exception {
        http.perform(get("/api/products?page=0&size=1")).andExpect(status().isOk());
    }

    @Test void browserPreflightDoesNotRequireAnOwnerTokenButTheActualRequestDoes() throws Exception {
        http.perform(options("/api/admin/access").header("Origin", "https://localhost:4200")
                .header("Access-Control-Request-Method", "GET").header("Access-Control-Request-Headers", "authorization"))
            .andExpect(status().isOk()).andExpect(header().string("Access-Control-Allow-Origin", "https://localhost:4200"));
        http.perform(get("/api/admin/access").header("Origin", "https://localhost:4200")).andExpect(status().isUnauthorized());
    }
}
