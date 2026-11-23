package com.nickcoding.spring_boot_website;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.nickcoding.spring_boot_website.dao.OrderRepository;
import com.nickcoding.spring_boot_website.service.StripePaymentGateway;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {
    "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect",
    "spring.jpa.hibernate.ddl-auto=create-drop", "checkout.reconciliation.enabled=false",
    "app.owner.issuer=https://owner.example.test/", "app.owner.subject=owner-Subject",
    "allowed.origins=https://localhost:4200"
})
@AutoConfigureMockMvc
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.ANY)
@Transactional
class CheckoutValidationIntegrationTest {
    @Autowired MockMvc http;
    @Autowired ObjectMapper json;
    @Autowired OrderRepository orders;
    @MockitoBean JwtDecoder decoder;
    @MockitoBean StripePaymentGateway payments;

    ObjectNode request() {
        ObjectNode request = json.createObjectNode().put("requestId", UUID.randomUUID().toString());
        request.putObject("customer").put("firstName", "Alex").put("lastName", "Smith").put("email", "alex@example.com");
        ObjectNode address = json.createObjectNode().put("street", "1 Main").put("city", "LA")
            .put("state", "CA").put("country", "US").put("zipCode", "90001");
        request.set("shippingAddress", address.deepCopy());
        request.set("billingAddress", address.deepCopy());
        request.putArray("items").addObject().put("variantId", 999999).put("quantity", 1);
        return request;
    }

    @Test void returnsAllFieldErrorsWithoutCreatingAnOrderOrPayment() throws Exception {
        long before = orders.count();
        ObjectNode request = request();
        request.withObject("/customer").put("email", "invalid").put("firstName", "");
        request.withObject("/shippingAddress").put("street", "");
        request.withObject("/billingAddress").put("zipCode", "x".repeat(31));
        ((ObjectNode) request.withArray("items").get(0)).put("quantity", 0);
        http.perform(post("/api/checkout/review").contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsBytes(request)))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
            .andExpect(jsonPath("$.fieldErrors['customer.email']").exists())
            .andExpect(jsonPath("$.fieldErrors['customer.firstName']").exists())
            .andExpect(jsonPath("$.fieldErrors['shippingAddress.street']").exists())
            .andExpect(jsonPath("$.fieldErrors['billingAddress.zipCode']").exists())
            .andExpect(jsonPath("$.fieldErrors['items[0].quantity']").exists());
        assertEquals(before, orders.count());
        verifyNoInteractions(payments);
    }

    @Test void rejectsEmptyCartAndExcessiveCombinedQuantities() throws Exception {
        http.perform(post("/api/checkout/quote").contentType(MediaType.APPLICATION_JSON).content("{\"items\":[]}"))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.fieldErrors.items").exists());
        http.perform(post("/api/checkout/quote").contentType(MediaType.APPLICATION_JSON)
            .content("{\"items\":[{\"variantId\":1,\"quantity\":600},{\"variantId\":1,\"quantity\":600}]}"))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.fieldErrors['items[1].quantity']").exists());
    }

    @Test void rejectsDecimalAndStringNumbersWithoutSilentlyCoercingThem() throws Exception {
        for (String value : new String[]{"1.5", "\"2\"", "2147483648"}) {
            http.perform(post("/api/checkout/quote").contentType(MediaType.APPLICATION_JSON)
                .content("{\"items\":[{\"variantId\":1,\"quantity\":" + value + "}]}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_REQUEST"))
                .andExpect(jsonPath("$.fieldErrors['items[0].quantity']").exists());
        }
        http.perform(post("/api/checkout/quote").contentType(MediaType.APPLICATION_JSON)
            .content("{\"items\":[{\"variantId\":1.5,\"quantity\":1}]}"))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.fieldErrors['items[0].variantId']").exists());
    }

    @Test void unavailableVariationReturnsAnIndexedCartError() throws Exception {
        http.perform(post("/api/checkout/review").contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsBytes(request())))
            .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
            .andExpect(jsonPath("$.fieldErrors['items[0]']").exists());
        verifyNoInteractions(payments);
    }
}
