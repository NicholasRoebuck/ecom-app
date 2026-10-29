package com.nickcoding.spring_boot_website.service;

import com.nickcoding.spring_boot_website.dao.ProductCategoryRepository;
import com.nickcoding.spring_boot_website.dao.ProductRepository;
import com.nickcoding.spring_boot_website.entity.ProductCategory;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

import java.util.List;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ProductQueryServiceTest {

    @Mock
    private ProductRepository productRepository;

    @Mock
    private ProductCategoryRepository productCategoryRepository;

    @InjectMocks
    private ProductQueryService productQueryService;

    @Test
    void getsAllProductsUsingRequestedPage() {
        when(productRepository.findAll(PageRequest.of(0, 10)))
                .thenReturn(new PageImpl<>(List.of(), PageRequest.of(0, 10), 0));

        productQueryService.getAll(0, 10);

        verify(productRepository).findAll(PageRequest.of(0, 10));
    }

    @Test
    void getsProductsInDepartmentAndDescendantCategories() {
        when(productCategoryRepository.findByParentId(1L))
                .thenReturn(List.of(category(2L), category(3L)));
        when(productCategoryRepository.findByParentId(2L))
                .thenReturn(List.of(category(4L)));
        when(productCategoryRepository.findByParentId(3L)).thenReturn(List.of());
        when(productCategoryRepository.findByParentId(4L)).thenReturn(List.of());
        when(productRepository.findByCategoryIdIn(
                List.of(1L, 2L, 3L, 4L), PageRequest.of(0, 10)))
                .thenReturn(new PageImpl<>(List.of(), PageRequest.of(0, 10), 0));

        productQueryService.getByCategory(1L, 0, 10, true);

        verify(productRepository).findByCategoryIdIn(
                List.of(1L, 2L, 3L, 4L), PageRequest.of(0, 10));
    }

    private ProductCategory category(Long id) {
        ProductCategory category = new ProductCategory();
        category.setId(id);
        return category;
    }
}
