package com.nickcoding.spring_boot_website;

import com.fasterxml.jackson.databind.*;
import com.nickcoding.spring_boot_website.dao.OrderRepository;
import com.nickcoding.spring_boot_website.entity.*;
import com.nickcoding.spring_boot_website.service.StripePaymentGateway;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.*;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {
    "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect",
    "spring.jpa.hibernate.ddl-auto=create-drop", "checkout.reconciliation.enabled=false",
    "spring.data.rest.detection-strategy=ANNOTATED"
})
@AutoConfigureMockMvc
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.ANY)
@Transactional
class OrderOwnershipIntegrationTest {
    private static final String ISSUER = "https://accounts.example.test/";
    @Autowired MockMvc http;
    @Autowired ObjectMapper mapper;
    @Autowired EntityManager em;
    @Autowired OrderRepository orders;
    @MockitoBean JwtDecoder jwtDecoder;
    @MockitoBean StripePaymentGateway payments;
    Order aliceOrder, bobOrder, guestOrder;
    ProductVariant variant;

    Jwt identity(String subject, String issuer) {
        var builder = Jwt.withTokenValue("test").header("alg", "RS256")
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(300)).audience(List.of("store-api"));
        if (subject != null) builder.subject(subject);
        if (issuer != null) builder.issuer(issuer);
        return builder.build();
    }

    @BeforeEach void fixtures() {
        when(jwtDecoder.decode("alice-token")).thenReturn(identity("account-Alice", ISSUER));
        when(jwtDecoder.decode("bob-token")).thenReturn(identity("account-Bob", ISSUER));
        when(jwtDecoder.decode("case-token")).thenReturn(identity("account-alice", ISSUER));
        when(jwtDecoder.decode("issuer-token")).thenReturn(identity("account-Alice", "https://other.example.test/"));
        when(jwtDecoder.decode("missing-sub")).thenReturn(identity(null, ISSUER));
        when(jwtDecoder.decode("missing-issuer")).thenReturn(identity("account-Alice", null));
        when(jwtDecoder.decode("invalid-token")).thenThrow(new BadJwtException("Invalid access token"));
        when(jwtDecoder.decode("expired-token")).thenThrow(new BadJwtException("Expired access token"));

        ProductCategory category = new ProductCategory(); category.setCategoryName("Test"); em.persist(category);
        Product product = new Product(); product.setName("Test glasses"); product.setCategory(category); em.persist(product);
        variant = new ProductVariant(); variant.setProduct(product); variant.setSku("TEST-SKU");
        variant.setActive(true); variant.setUnitsInStock(10); variant.setUnitPrice(new BigDecimal("10.00"));
        em.persist(variant);
        Customer contact = new Customer(); contact.setFirstName("Contact"); contact.setLastName("Example");
        contact.setEmail("shared-contact@example.test"); em.persist(contact);
        // Deliberately share the contact: account ownership must not follow the customer/email relationship.
        aliceOrder = order(contact, "account-Alice", "Alice Street");
        bobOrder = order(contact, "account-Bob", "Bob Street");
        guestOrder = order(contact, null, "Guest Street");
        em.flush();
    }

    Order order(Customer customer, String subject, String street) {
        Order order = new Order(); order.setCustomer(customer); order.setStatus("PAID");
        order.setCheckoutToken(UUID.randomUUID().toString()); order.setPaymentIntentId("pi_" + UUID.randomUUID());
        order.setOrderTrackingNumber(UUID.randomUUID().toString()); order.setCurrency("usd");
        order.setTotalPrice(new BigDecimal("10.00")); order.setTotalQuantity(1);
        if (subject != null) { order.setOwnerIssuer(ISSUER); order.setOwnerSubject(subject); }
        Address shipping = new Address(); shipping.setStreet(street); shipping.setCity("Test City");
        shipping.setState("Test State"); shipping.setCountry("US"); shipping.setZipCode("90001");
        Address billing = new Address(); billing.setStreet(street); billing.setCity("Test City");
        billing.setState("Test State"); billing.setCountry("US"); billing.setZipCode("90001");
        order.setShippingAddress(shipping); order.setBillingAddress(billing);
        OrderItem item = new OrderItem(); item.setProductId(variant.getProduct().getId()); item.setVariantId(variant.getId());
        item.setProductName("Test glasses"); item.setSku("TEST-SKU"); item.setQuantity(1);
        item.setUnitPrice(new BigDecimal("10.00")); order.add(item);
        return orders.saveAndFlush(order);
    }

    @Test void anonymousInvalidAndExpiredTokensCannotReadAccountOrders() throws Exception {
        http.perform(get("/api/me/orders")).andExpect(status().isUnauthorized());
        http.perform(get("/api/me/orders").header("Authorization", "Bearer invalid-token")).andExpect(status().isUnauthorized());
        http.perform(get("/api/me/orders").header("Authorization", "Bearer expired-token")).andExpect(status().isUnauthorized());
        http.perform(get("/api/me/orders").header("Authorization", "Bearer missing-sub")).andExpect(status().isForbidden());
        http.perform(get("/api/me/orders").header("Authorization", "Bearer missing-issuer")).andExpect(status().isForbidden());
    }

    @Test void listUsesVerifiedIdentityAndIgnoresClientSuppliedEmailOrOwner() throws Exception {
        http.perform(get("/api/me/orders").header("Authorization", "Bearer alice-token")
                .param("email", "shared-contact@example.test").param("ownerSubject", "account-Bob"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.content.length()").value(1))
            .andExpect(jsonPath("$.content[0].id").value(aliceOrder.getId()))
            .andExpect(jsonPath("$.content[0].checkoutToken").doesNotExist())
            .andExpect(jsonPath("$.content[0].paymentIntentId").doesNotExist())
            .andExpect(jsonPath("$.content[0].ownerSubject").doesNotExist())
            .andExpect(jsonPath("$.content[0]._links").doesNotExist());
        http.perform(get("/api/me/orders").header("Authorization", "Bearer bob-token"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.content.length()").value(1))
            .andExpect(jsonPath("$.content[0].id").value(bobOrder.getId()));
    }

    @Test void subjectAndIssuerMatchingAreExact() throws Exception {
        for (String token : List.of("case-token", "issuer-token")) {
            http.perform(get("/api/me/orders").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk()).andExpect(jsonPath("$.content.length()").value(0));
            http.perform(get("/api/me/orders/" + aliceOrder.getId()).header("Authorization", "Bearer " + token))
                .andExpect(status().isNotFound());
        }
    }

    @Test void detailAndRelatedResourcesRequireTheSameOwner() throws Exception {
        http.perform(get("/api/me/orders/" + aliceOrder.getId()).header("Authorization", "Bearer alice-token"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.shippingAddress.street").value("Alice Street"))
            .andExpect(jsonPath("$.order.checkoutToken").doesNotExist()).andExpect(jsonPath("$.order.ownerIssuer").doesNotExist());
        for (String suffix : List.of("", "/items", "/shipping-address", "/billing-address")) {
            http.perform(get("/api/me/orders/" + bobOrder.getId() + suffix).header("Authorization", "Bearer alice-token"))
                .andExpect(status().isNotFound());
            http.perform(get("/api/me/orders/" + guestOrder.getId() + suffix).header("Authorization", "Bearer alice-token"))
                .andExpect(status().isNotFound());
            http.perform(get("/api/me/orders/" + aliceOrder.getId() + suffix).header("Authorization", "Bearer alice-token"))
                .andExpect(status().isOk());
        }
        http.perform(get("/api/me/orders/9999999").header("Authorization", "Bearer alice-token")).andExpect(status().isNotFound());
    }

    @Test void legacyRepositoryAndRelationshipPathsCannotBypassOwnership() throws Exception {
        for (String path : List.of("/api/orders", "/api/orders/" + bobOrder.getId(),
                "/api/orders/search/findByCustomerEmailOrderByDateCreatedDesc?email=shared-contact@example.test",
                "/api/orders/" + bobOrder.getId() + "/customer", "/api/orders/" + bobOrder.getId() + "/orderItems",
                "/api/orders/" + bobOrder.getId() + "/shippingAddress", "/api/orders/" + bobOrder.getId() + "/billingAddress",
                "/api/customers", "/api/customers/" + bobOrder.getCustomer().getId() + "/orders",
                "/api/addresses/" + bobOrder.getShippingAddress().getId(), "/api/orderItems")) {
            http.perform(get(path).header("Authorization", "Bearer alice-token")).andExpect(status().is4xxClientError());
        }
        http.perform(get("/api")).andExpect(status().isOk())
            .andExpect(jsonPath("$._links.orders").doesNotExist())
            .andExpect(jsonPath("$._links.customers").doesNotExist());
    }

    @Test void paginationIsBoundedAndCannotAddAnotherOwnersOrders() throws Exception {
        http.perform(get("/api/me/orders?page=0&size=1").header("Authorization", "Bearer alice-token"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.page.totalElements").value(1));
        for (String query : List.of("page=-1", "size=0", "size=101")) {
            http.perform(get("/api/me/orders?" + query).header("Authorization", "Bearer alice-token"))
                .andExpect(status().isBadRequest());
        }
    }

    String checkout(String token) throws Exception {
        return mapper.writeValueAsString(Map.of("requestId", token, "items", List.of(Map.of("variantId", variant.getId(), "quantity", 1)),
            "customer", Map.of("firstName", "Guest", "lastName", "Example", "email", "shared-contact@example.test"),
            "shippingAddress", Map.of("street", "1 Test", "city", "Test", "state", "CA", "country", "US", "zipCode", "90001"),
            "billingAddress", Map.of("street", "1 Test", "city", "Test", "state", "CA", "country", "US", "zipCode", "90001"),
            "ownerIssuer", ISSUER, "ownerSubject", "account-Bob"));
    }

    @Test void checkoutRecordsOnlyVerifiedOwnershipAndDoesNotClaimGuestOrders() throws Exception {
        String authenticatedToken = UUID.randomUUID().toString();
        http.perform(post("/api/checkout/review").header("Authorization", "Bearer alice-token")
                .contentType(MediaType.APPLICATION_JSON).content(checkout(authenticatedToken))).andExpect(status().isOk());
        Order signedIn = orders.findByCheckoutToken(authenticatedToken).orElseThrow();
        assertEquals("account-Alice", signedIn.getOwnerSubject());
        assertEquals(ISSUER, signedIn.getOwnerIssuer());
        String guestToken = UUID.randomUUID().toString();
        http.perform(post("/api/checkout/review").contentType(MediaType.APPLICATION_JSON).content(checkout(guestToken)))
            .andExpect(status().isOk());
        Order guest = orders.findByCheckoutToken(guestToken).orElseThrow();
        assertNull(guest.getOwnerSubject()); assertNull(guest.getOwnerIssuer());
        http.perform(post("/api/checkout/review").header("Authorization", "Bearer bob-token")
                .contentType(MediaType.APPLICATION_JSON).content(checkout(guestToken))).andExpect(status().isOk());
        assertNull(orders.findByCheckoutToken(guestToken).orElseThrow().getOwnerSubject());
        http.perform(get("/api/me/orders").header("Authorization", "Bearer alice-token"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.page.totalElements").value(2));
        verifyNoInteractions(payments);
    }

    @Test void signedInCheckoutWithInvalidTokenDoesNotSilentlyCreateAGuestOrder() throws Exception {
        long before = orders.count();
        http.perform(post("/api/checkout/review").header("Authorization", "Bearer invalid-token")
                .contentType(MediaType.APPLICATION_JSON).content(checkout(UUID.randomUUID().toString())))
            .andExpect(status().isUnauthorized());
        assertEquals(before, orders.count());
    }

    @Test void checkoutRecoveryRequiresItsVerifiedAccountEvenWhenTheTokenIsKnown() throws Exception {
        String body = mapper.writeValueAsString(Map.of("checkoutToken", aliceOrder.getCheckoutToken()));
        for (String path : List.of("/resume", "/cancel", "/payment-intent", "/purchase")) {
            http.perform(post("/api/checkout" + path).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isUnauthorized());
            http.perform(post("/api/checkout" + path).header("Authorization", "Bearer bob-token")
                    .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isForbidden());
        }
        http.perform(post("/api/checkout/resume").header("Authorization", "Bearer alice-token")
                .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isOk());
        http.perform(post("/api/checkout/review").header("Authorization", "Bearer bob-token")
                .contentType(MediaType.APPLICATION_JSON).content(checkout(aliceOrder.getCheckoutToken())))
                .andExpect(status().isForbidden());
        verifyNoInteractions(payments);
    }

    @Test void savedDetailsRequireTheVerifiedOwnerAndNeverExposeGuestOrPaymentData() throws Exception {
        String body = mapper.writeValueAsString(Map.of("checkoutToken", aliceOrder.getCheckoutToken()));
        http.perform(post("/api/checkout/details").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isUnauthorized());
        http.perform(post("/api/checkout/details").header("Authorization", "Bearer bob-token")
                .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isForbidden());
        http.perform(post("/api/checkout/details").header("Authorization", "Bearer alice-token")
                .contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isOk()).andExpect(jsonPath("$.customer.firstName").value("Contact"))
            .andExpect(jsonPath("$.shippingAddress.street").value("Alice Street"))
            .andExpect(jsonPath("$.billingAddress.street").value("Alice Street"))
            .andExpect(jsonPath("$.checkoutToken").doesNotExist())
            .andExpect(jsonPath("$.paymentIntentId").doesNotExist())
            .andExpect(jsonPath("$.creditCard").doesNotExist());
        String guestBody = mapper.writeValueAsString(Map.of("checkoutToken", guestOrder.getCheckoutToken()));
        http.perform(post("/api/checkout/details").contentType(MediaType.APPLICATION_JSON).content(guestBody))
            .andExpect(status().isUnauthorized());
        http.perform(post("/api/checkout/details").header("Authorization", "Bearer alice-token")
                .contentType(MediaType.APPLICATION_JSON).content(guestBody)).andExpect(status().isForbidden());
    }

    @Test void newlyEnteredContactNamesDoNotRewritePreviousOrdersUsingTheSameEmail() throws Exception {
        String token = UUID.randomUUID().toString();
        http.perform(post("/api/checkout/review").header("Authorization", "Bearer alice-token")
                .contentType(MediaType.APPLICATION_JSON).content(checkout(token))).andExpect(status().isOk());
        Order created = orders.findByCheckoutToken(token).orElseThrow();
        assertEquals("Guest", created.getCustomer().getFirstName());
        assertEquals("Contact", aliceOrder.getCustomer().getFirstName());
        assertNotEquals(aliceOrder.getCustomer().getId(), created.getCustomer().getId());
        http.perform(post("/api/checkout/details").header("Authorization", "Bearer alice-token")
                .contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(Map.of("checkoutToken", token))))
            .andExpect(status().isOk()).andExpect(jsonPath("$.customer.firstName").value("Guest"));
    }

    @Test void variantOptionsPersistAndFollowTheSelectedVariantIntoAnImmutableOrder() throws Exception {
        Long variantId = variant.getId();
        Long productId = variant.getProduct().getId();
        variant.getOptions().put("Color", "Black");
        variant.getOptions().put("Size", "Medium");
        em.flush(); em.clear();
        assertEquals("Black", em.find(ProductVariant.class, variantId).getOptions().get("Color"));
        http.perform(get("/api/products/" + productId))
            .andExpect(status().isOk()).andExpect(jsonPath("$.variants[0].options.Color").value("Black"))
            .andExpect(jsonPath("$.variants[0].options.Size").value("Medium"));
        http.perform(post("/api/checkout/quote").contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(Map.of("items", List.of(Map.of("variantId", variantId, "quantity", 2))))))
            .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].name").value("Test glasses (Color: Black, Size: Medium)"))
            .andExpect(jsonPath("$.items[0].subtotal").value(20));
        String token = UUID.randomUUID().toString();
        http.perform(post("/api/checkout/review").contentType(MediaType.APPLICATION_JSON).content(checkout(token)))
            .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].variantId").value(variantId))
            .andExpect(jsonPath("$.items[0].name").value("Test glasses (Color: Black, Size: Medium)"));
        Order order = orders.findByCheckoutToken(token).orElseThrow();
        em.find(ProductVariant.class, variantId).getOptions().put("Color", "White");
        em.flush();
        assertEquals("Test glasses (Color: Black, Size: Medium)", order.getOrderItems().iterator().next().getProductName());
        verifyNoInteractions(payments);
    }
}
