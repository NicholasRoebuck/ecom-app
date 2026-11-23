package com.nickcoding.spring_boot_website.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.util.Date;
import java.util.Map;
import java.util.LinkedHashMap;
import java.util.TreeMap;
import java.util.stream.Collectors;

@Getter
@Setter
@Table(name = "product_variant")
@Entity
public class ProductVariant {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @ManyToOne
    @JoinColumn(name = "product_id", nullable = false)
    private Product product;

    @Column(name = "sku", unique = true)
    private String sku;

    @Column(name = "unit_price")
    private BigDecimal unitPrice;

    @Column(name = "image_url")
    private String imageUrl;

    @Column(name = "active")
    private boolean active;

    @Column(name = "units_in_stock")
    private int unitsInStock;

    @ElementCollection
    @CollectionTable(name = "product_variant_option", joinColumns = @JoinColumn(name = "variant_id"))
    @MapKeyColumn(name = "option_name", length = 64)
    @Column(name = "option_value", nullable = false, length = 128)
    private Map<String, String> options = new LinkedHashMap<>();

    public String displayName() {
        String label = new TreeMap<>(options).entrySet().stream()
                .map(entry -> entry.getKey() + ": " + entry.getValue()).collect(Collectors.joining(", "));
        if (label.isEmpty() && product.getVariants().size() > 1) label = sku;
        return product.getName() + (label == null || label.isEmpty() ? "" : " (" + label + ")");
    }

    @CreationTimestamp
    @Column(name = "date_created")
    private Date dateCreated;

    @UpdateTimestamp
    @Column(name = "last_updated")
    private Date lastUpdated;
}