package com.nickcoding.spring_boot_website.dao;

import com.nickcoding.spring_boot_website.entity.ProductCategory;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.rest.core.annotation.RepositoryRestResource;

import java.util.List;

@RepositoryRestResource(collectionResourceRel = "productCategory", path = "product-category")
public interface ProductCategoryRepository extends JpaRepository<ProductCategory, Long> {

    List<ProductCategory> findByParentIsNull();

    List<ProductCategory> findByParentId(Long parentId);

    @org.springframework.data.rest.core.annotation.RestResource(exported = false)
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("select c from ProductCategory c where c.id = :id")
    java.util.Optional<ProductCategory> findForCategoryEdit(@org.springframework.data.repository.query.Param("id") Long id);

    // Bulk delete deliberately bypasses entity REMOVE cascades.
    @org.springframework.data.rest.core.annotation.RestResource(exported = false)
    @org.springframework.data.jpa.repository.Modifying
    @org.springframework.data.jpa.repository.Query("delete from ProductCategory c where c.id = :id")
    int deleteEmptyCategoryRow(@org.springframework.data.repository.query.Param("id") Long id);

    long countByParent_Id(Long parentId);

}
