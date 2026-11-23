package com.nickcoding.spring_boot_website.service;

import com.nickcoding.spring_boot_website.dao.OrderRepository;
import com.nickcoding.spring_boot_website.dto.*;
import com.nickcoding.spring_boot_website.entity.Address;
import com.nickcoding.spring_boot_website.entity.Order;
import org.springframework.data.domain.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.math.BigDecimal;
import java.util.Comparator;

@Service
@Transactional(readOnly = true)
public class AccountOrderService {
    private final OrderRepository orders;
    public AccountOrderService(OrderRepository orders) { this.orders = orders; }

    public PagedResponseDTO<OrderHistoryDTO> list(OrderOwner owner, int page, int size) {
        if (page < 0 || size < 1 || size > 100)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Page must be nonnegative and size must be 1 to 100.");
        var result = orders.findByOwnerIssuerAndOwnerSubject(owner.issuer(), owner.subject(),
                PageRequest.of(page, size, Sort.by(Sort.Order.desc("dateCreated"), Sort.Order.desc("id"))));
        return PagedResponseDTO.from(result, result.getContent().stream().map(this::summary).toList());
    }

    public OrderDetailsDTO detail(OrderOwner owner, Long id) {
        // Include ownership in the lookup, rather than retrieving an arbitrary order and trusting its caller.
        Order order = orders.findByIdAndOwnerIssuerAndOwnerSubject(id, owner.issuer(), owner.subject())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Order not found."));
        var items = order.getOrderItems().stream().sorted(Comparator.comparing(item -> item.getId()))
                .map(item -> new OrderDetailsDTO.Item(item.getProductId(), item.getVariantId(),
                        item.getProductName(), item.getSku(), item.getImageUrl(), item.getUnitPrice(),
                        item.getQuantity(), item.getUnitPrice().multiply(BigDecimal.valueOf(item.getQuantity())))).toList();
        return new OrderDetailsDTO(summary(order), items, address(order.getShippingAddress()), address(order.getBillingAddress()));
    }

    private OrderHistoryDTO summary(Order order) {
        return new OrderHistoryDTO(order.getId(), order.getOrderTrackingNumber(), order.getTotalPrice(),
                order.getTotalQuantity(), order.getDateCreated(), order.getStatus(), order.getCurrency());
    }
    private OrderDetailsDTO.DeliveryAddress address(Address address) {
        return address == null ? null : new OrderDetailsDTO.DeliveryAddress(address.getStreet(), address.getCity(),
                address.getState(), address.getCountry(), address.getZipCode());
    }
}
