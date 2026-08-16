package com.nickcoding.spring_boot_website.dao;

import com.nickcoding.spring_boot_website.entity.ProductVariant;
import org.springframework.data.rest.core.annotation.RepositoryRestResource;

import java.util.List;

@RepositoryRestResource
public interface ProductVariantRepository {
    List<ProductVariant> findByProductId(Long productId);
}
