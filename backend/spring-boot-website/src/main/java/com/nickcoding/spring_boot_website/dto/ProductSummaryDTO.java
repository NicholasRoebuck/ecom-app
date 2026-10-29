package com.nickcoding.spring_boot_website.dto;

import java.util.Date;
import java.util.List;

public class ProductSummaryDTO {

    private Long id;
    private String name;
    private String description;
    private Date dateCreated;
    private Date lastUpdated;
    private List<ProductVariantSummaryDTO> variants;

    public ProductSummaryDTO(Long id, String name, String description, Date dateCreated,
                             Date lastUpdated, List<ProductVariantSummaryDTO> variants) {
        this.id = id;
        this.name = name;
        this.description = description;
        this.dateCreated = dateCreated;
        this.lastUpdated = lastUpdated;
        this.variants = variants;
    }

    public Long getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public String getDescription() {
        return description;
    }

    public Date getDateCreated() {
        return dateCreated;
    }

    public Date getLastUpdated() {
        return lastUpdated;
    }

    public List<ProductVariantSummaryDTO> getVariants() {
        return variants;
    }
}
