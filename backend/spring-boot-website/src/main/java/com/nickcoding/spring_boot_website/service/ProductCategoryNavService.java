package com.nickcoding.spring_boot_website.service;

import com.nickcoding.spring_boot_website.dao.ProductCategoryRepository;
import com.nickcoding.spring_boot_website.dto.ProductCategoryNavDTO;
import com.nickcoding.spring_boot_website.entity.ProductCategory;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class ProductCategoryNavService {

    private final ProductCategoryRepository repository;

    public ProductCategoryNavService(ProductCategoryRepository repository) {
        this.repository = repository;
    }

    public List<ProductCategoryNavDTO> getTopLevelCategories() {
        return toNavDTOs(repository.findByParentIsNull());
    }

    public List<ProductCategoryNavDTO> getChildren(Long parentId) {
        return toNavDTOs(repository.findByParentId(parentId));
    }

    private List<ProductCategoryNavDTO> toNavDTOs(List<ProductCategory> categories) {
        return categories.stream()
                .map(cat -> new ProductCategoryNavDTO(
                        cat.getId(),
                        cat.getCategoryName(),
                        repository.countByParent_Id(cat.getId()) > 0
                ))
                .toList();
    }
}
