package com.nickcoding.spring_boot_website.service;

import com.nickcoding.spring_boot_website.dao.ProductRepository;
import com.nickcoding.spring_boot_website.dao.ProductVariantRepository;
import com.nickcoding.spring_boot_website.entity.Order;
import com.nickcoding.spring_boot_website.entity.ProductVariant;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.util.*;

@Service
@Transactional(propagation = Propagation.MANDATORY)
public class CheckoutInventoryService {
    private final ProductRepository products;
    private final ProductVariantRepository variants;
    private final EntityManager em;

    public CheckoutInventoryService(ProductRepository products, ProductVariantRepository variants, EntityManager em) {
        this.products = products; this.variants = variants; this.em = em;
    }

    public void reserve(Order order) {
        if (!"NONE".equals(order.getInventoryStatus())) return;
        var quantities = quantities(order);
        var locked = lock(quantities.keySet());
        for (var entry : quantities.entrySet()) {
            var variant = locked.get(entry.getKey());
            if (!variant.isActive() || variant.getUnitsInStock() < entry.getValue())
                throw conflict("An item is no longer available in the requested quantity. Update your cart.");
        }
        quantities.forEach((id, quantity) -> locked.get(id).setUnitsInStock(locked.get(id).getUnitsInStock() - quantity));
        order.setInventoryStatus("RESERVED");
    }

    public void release(Order order) {
        if (!"RESERVED".equals(order.getInventoryStatus())) return;
        var quantities = quantities(order);
        var locked = lock(quantities.keySet());
        quantities.forEach((id, quantity) -> locked.get(id).setUnitsInStock(Math.addExact(locked.get(id).getUnitsInStock(), quantity)));
        order.setInventoryStatus("RELEASED");
    }

    public void consume(Order order) {
        // Payment must not subtract quantities already removed from availability during review.
        if ("RESERVED".equals(order.getInventoryStatus())) order.setInventoryStatus("CONSUMED");
    }

    private SortedMap<Long, Integer> quantities(Order order) {
        var result = new TreeMap<Long, Integer>();
        if (order.getOrderItems() == null || order.getOrderItems().isEmpty())
            throw conflict("This checkout has no inventory lines. Please contact support.");
        for (var item : order.getOrderItems()) {
            if (item.getVariantId() == null || item.getQuantity() <= 0)
                throw conflict("This checkout has invalid inventory lines. Please contact support.");
            result.merge(item.getVariantId(), item.getQuantity(), Math::addExact);
        }
        return result;
    }

    private Map<Long, ProductVariant> lock(Set<Long> ids) {
        var found = variants.findAllById(ids);
        if (found.size() != ids.size()) throw conflict("An item in this checkout no longer exists.");
        // Share parent locks with catalog edits; acquire products in a stable order.
        found.stream().map(v -> v.getProduct().getId()).distinct().sorted().forEach(id ->
            products.findForAdminUpdate(id).orElseThrow(() -> conflict("An item no longer exists.")));
        var result = new TreeMap<Long, ProductVariant>();
        found.stream().sorted(Comparator.comparing(ProductVariant::getId)).forEach(v -> {
            // A quote may have cached stock before this transaction waited for the product lock.
            em.refresh(v, LockModeType.PESSIMISTIC_WRITE);
            result.put(v.getId(), v);
        });
        return result;
    }

    private static ResponseStatusException conflict(String message) {
        return new ResponseStatusException(HttpStatus.CONFLICT, message);
    }
}
