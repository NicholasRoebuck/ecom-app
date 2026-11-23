package com.nickcoding.spring_boot_website.service;

import com.nickcoding.spring_boot_website.dao.ProductVariantRepository;
import com.nickcoding.spring_boot_website.dto.CheckoutRequest;
import com.nickcoding.spring_boot_website.entity.Product;
import com.nickcoding.spring_boot_website.entity.ProductVariant;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.*;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;
import java.math.BigDecimal;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class CheckoutPricingServiceTest {
    @Mock ProductVariantRepository variants;
    @InjectMocks CheckoutPricingService service;

    private ProductVariant variant() {
        Product product = new Product(); product.setId(7L); product.setName("Glasses");
        ProductVariant variant = new ProductVariant();
        variant.setId(42L); variant.setProduct(product); variant.setSku("X6");
        variant.setActive(true); variant.setUnitsInStock(10); variant.setUnitPrice(new BigDecimal("123.45"));
        return variant;
    }

    @Test void calculatesExactDatabasePricesAndAggregatesDuplicateVariants() {
        when(variants.findAllById(any())).thenReturn(List.of(variant()));
        var lines = service.price(List.of(new CheckoutRequest.Line(42L, 2), new CheckoutRequest.Line(42L, 1)));
        assertEquals(1, lines.size());
        assertEquals(3, lines.getFirst().quantity());
        assertEquals(new BigDecimal("370.35"), lines.getFirst().subtotal());
        assertEquals(7L, lines.getFirst().productId());
    }

    @Test void rejectsEmptyCartAndInvalidQuantitiesBeforeDatabaseAccess() {
        assertThrows(ResponseStatusException.class, () -> service.price(List.of()));
        assertThrows(ResponseStatusException.class, () -> service.price(List.of(new CheckoutRequest.Line(42L, 0))));
        assertThrows(ResponseStatusException.class, () -> service.price(List.of(new CheckoutRequest.Line(42L, -1))));
        assertThrows(ResponseStatusException.class, () -> service.price(List.of(new CheckoutRequest.Line(42L, 1000))));
        assertThrows(ResponseStatusException.class, () -> service.price(List.of(new CheckoutRequest.Line(null, 1))));
        verifyNoInteractions(variants);
    }

    @Test void rejectsMissingInactiveAndInsufficientStock() {
        when(variants.findAllById(any())).thenReturn(List.of());
        assertThrows(ResponseStatusException.class, () -> service.price(List.of(new CheckoutRequest.Line(42L, 1))));
        var variant = variant(); variant.setActive(false);
        when(variants.findAllById(any())).thenReturn(List.of(variant));
        assertThrows(ResponseStatusException.class, () -> service.price(List.of(new CheckoutRequest.Line(42L, 1))));
        variant.setActive(true); variant.setUnitsInStock(1);
        assertThrows(ResponseStatusException.class, () -> service.price(List.of(new CheckoutRequest.Line(42L, 2))));
    }

    @Test void rejectsInvalidDatabasePriceRatherThanRoundingACharge() {
        var variant = variant(); variant.setUnitPrice(new BigDecimal("1.001"));
        when(variants.findAllById(any())).thenReturn(List.of(variant));
        assertThrows(ResponseStatusException.class, () -> service.price(List.of(new CheckoutRequest.Line(42L, 1))));
        variant.setUnitPrice(BigDecimal.ZERO);
        assertThrows(ResponseStatusException.class, () -> service.price(List.of(new CheckoutRequest.Line(42L, 1))));
    }
    @Test void cartQuoteReturnsCurrentPricesAndUnavailableItemsWithoutRejectingTheWholeCart() {
        var variant = variant();
        variant.setUnitsInStock(1);
        when(variants.findAllById(any())).thenReturn(List.of(variant));
        var quote = service.quote(List.of(new CheckoutRequest.Line(42L, 2), new CheckoutRequest.Line(99L, 1)));
        assertFalse(quote.available());
        assertEquals(new BigDecimal("123.45"), quote.items().getFirst().unitPrice());
        assertTrue(quote.items().getFirst().message().contains("Only 1"));
        assertFalse(quote.items().get(1).available());
        assertNull(quote.items().get(1).unitPrice());
        assertEquals(new BigDecimal("246.90"), quote.totalPrice());
        verify(variants, never()).save(any());
    }

    @Test void cartQuoteUsesDatabasePricesForAvailableItems() {
        when(variants.findAllById(any())).thenReturn(List.of(variant()));
        var quote = service.quote(List.of(new CheckoutRequest.Line(42L, 2)));
        assertTrue(quote.available());
        assertEquals(new BigDecimal("246.90"), quote.totalPrice());
        verify(variants, never()).save(any());
    }
}