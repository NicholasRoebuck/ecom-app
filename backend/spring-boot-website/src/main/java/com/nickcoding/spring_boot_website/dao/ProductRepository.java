package com.nickcoding.spring_boot_website.dao;

import com.nickcoding.spring_boot_website.entity.Product;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.repository.query.Param;
import org.springframework.data.rest.core.annotation.RepositoryRestResource;
import org.springframework.web.bind.annotation.CrossOrigin;

import java.util.List;

// Repository export is disabled: products are served through
// ProductController/ProductQueryService instead, so the response shape
// (including each product's variant list) is explicit and controlled
// rather than relying on Spring Data REST's default entity serialization.
@RepositoryRestResource(exported = false)
public interface ProductRepository extends JpaRepository<Product, Long>, org.springframework.data.jpa.repository.JpaSpecificationExecutor<Product> {
    long countByCategoryId(Long categoryId);

    Page<Product> findByNameContainingIgnoreCase(String name, Pageable pageable);

    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("select p from Product p where p.id = :id")
    java.util.Optional<Product> findForAdminUpdate(@Param("id") Long id);


    Page<Product> findByCategoryId(@Param("id") Long id, Pageable pageable);

    Page<Product> findByCategoryIdIn(List<Long> categoryIds, Pageable pageable);

    Page<Product> findByNameContaining(@Param("name") String name, Pageable pageable);
}