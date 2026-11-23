package com.nickcoding.spring_boot_website.dao;

import com.nickcoding.spring_boot_website.entity.ProductVariant;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.rest.core.annotation.RepositoryRestResource;

@RepositoryRestResource(exported = false)
public interface ProductVariantRepository extends JpaRepository<ProductVariant, Long> {
    @org.springframework.data.jpa.repository.Query("select count(i) > 0 from OrderItem i where i.variantId = :variantId and i.order.inventoryStatus = 'RESERVED'")
    boolean hasInventoryReservations(@org.springframework.data.repository.query.Param("variantId") Long variantId);

    boolean existsBySkuIgnoreCaseAndIdNot(String sku, Long id);
}
