package com.nickcoding.spring_boot_website.controller;

import com.nickcoding.spring_boot_website.dto.*;
import com.nickcoding.spring_boot_website.service.AccountOrderService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/me/orders")
public class AccountOrderController {
    private final AccountOrderService orders;
    public AccountOrderController(AccountOrderService orders) { this.orders = orders; }

    @GetMapping
    public PagedResponseDTO<OrderHistoryDTO> list(@AuthenticationPrincipal Jwt principal,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return orders.list(OrderOwner.authenticated(principal), page, size);
    }

    @GetMapping("/{id}")
    public OrderDetailsDTO detail(@AuthenticationPrincipal Jwt principal, @PathVariable Long id) {
        return orders.detail(OrderOwner.authenticated(principal), id);
    }

    @GetMapping("/{id}/items")
    public List<OrderDetailsDTO.Item> items(@AuthenticationPrincipal Jwt principal, @PathVariable Long id) {
        return orders.detail(OrderOwner.authenticated(principal), id).items();
    }

    @GetMapping("/{id}/shipping-address")
    public OrderDetailsDTO.DeliveryAddress shipping(@AuthenticationPrincipal Jwt principal, @PathVariable Long id) {
        return orders.detail(OrderOwner.authenticated(principal), id).shippingAddress();
    }

    @GetMapping("/{id}/billing-address")
    public OrderDetailsDTO.DeliveryAddress billing(@AuthenticationPrincipal Jwt principal, @PathVariable Long id) {
        return orders.detail(OrderOwner.authenticated(principal), id).billingAddress();
    }
}
