package com.nickcoding.spring_boot_website.dao;

import com.nickcoding.spring_boot_website.entity.Product;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.repository.query.Param;
import org.springframework.data.rest.core.annotation.RepositoryRestResource;
import org.springframework.web.bind.annotation.CrossOrigin;

import java.util.List;

// No longer @RepositoryRestResource: products are served through
// ProductController/ProductQueryService instead, so the response shape
// (including each product's variant list) is explicit and controlled
// rather than relying on Spring Data REST's default entity serialization.
public interface ProductRepository extends JpaRepository<Product, Long> {

    Page<Product> findByCategoryId(@Param("id") Long id, Pageable pageable);

    Page<Product> findByCategoryIdIn(List<Long> categoryIds, Pageable pageable);

    Page<Product> findByNameContaining(@Param("name") String name, Pageable pageable);
}