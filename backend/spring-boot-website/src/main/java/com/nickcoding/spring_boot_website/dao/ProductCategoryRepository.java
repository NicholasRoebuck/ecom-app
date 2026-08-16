package com.nickcoding.spring_boot_website.dao;

import com.nickcoding.spring_boot_website.entity.ProductCategory;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.rest.core.annotation.RepositoryRestResource;

import java.util.List;

@RepositoryRestResource(collectionResourceRel = "productCategory", path = "product-category")
public interface ProductCategoryRepository extends JpaRepository<ProductCategory, Long> {

    List<ProductCategory> findByParentIsNull();

    List<ProductCategory> findByParentId(Long parentId);

    long countByParent_Id(Long parentId);

}
