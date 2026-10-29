package com.nickcoding.spring_boot_website.dto;

import java.math.BigDecimal;

public class ProductVariantSummaryDTO {

    private Long id;
    private String sku;
    private BigDecimal unitPrice;
    private String imageUrl;
    private boolean active;
    private int unitsInStock;

    public ProductVariantSummaryDTO(Long id, String sku, BigDecimal unitPrice, String imageUrl,
                                    boolean active, int unitsInStock) {
        this.id = id;
        this.sku = sku;
        this.unitPrice = unitPrice;
        this.imageUrl = imageUrl;
        this.active = active;
        this.unitsInStock = unitsInStock;
    }

    public Long getId() {
        return id;
    }

    public String getSku() {
        return sku;
    }

    public BigDecimal getUnitPrice() {
        return unitPrice;
    }

    public String getImageUrl() {
        return imageUrl;
    }

    public boolean isActive() {
        return active;
    }

    public int getUnitsInStock() {
        return unitsInStock;
    }
}
