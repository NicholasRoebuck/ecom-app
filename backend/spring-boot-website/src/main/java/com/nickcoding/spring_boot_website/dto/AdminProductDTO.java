package com.nickcoding.spring_boot_website.dto;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

public record AdminProductDTO(Long id, String name, String description, Long categoryId,
                              String revision, List<Variant> variants, Configuration configuration) {
    public record Variant(Long id, String sku, BigDecimal unitPrice, String imageUrl,
                          Boolean active, BigDecimal unitsInStock, Map<String, String> options) {}
    public record Category(Long id, String name, Long parentId, long productCount, long childCount) {
        public Category(Long id, String name, Long parentId) { this(id, name, parentId, 0, 0); }
    }
    public record Option(String name, List<String> values) {}
    public record Defaults(String skuPrefix, BigDecimal unitPrice, String imageUrl,
                           Boolean active, BigDecimal unitsInStock) {}
    public record Configuration(List<Option> options, Defaults defaults, List<String> customizedSkus,
                                List<Map<String, String>> excludedCombinations, String generationCursor) {}
}
