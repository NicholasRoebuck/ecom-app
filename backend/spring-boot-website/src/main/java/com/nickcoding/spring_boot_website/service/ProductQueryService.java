package com.nickcoding.spring_boot_website.service;

import com.nickcoding.spring_boot_website.dao.ProductRepository;
import com.nickcoding.spring_boot_website.dao.ProductCategoryRepository;
import com.nickcoding.spring_boot_website.dto.PagedResponseDTO;
import com.nickcoding.spring_boot_website.dto.ProductSummaryDTO;
import com.nickcoding.spring_boot_website.dto.ProductVariantSummaryDTO;
import com.nickcoding.spring_boot_website.entity.Product;
import com.nickcoding.spring_boot_website.entity.ProductVariant;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.Set;

@Service
public class ProductQueryService {

    private final ProductRepository productRepository;
    private final ProductCategoryRepository productCategoryRepository;

    public ProductQueryService(ProductRepository productRepository,
                               ProductCategoryRepository productCategoryRepository) {
        this.productRepository = productRepository;
        this.productCategoryRepository = productCategoryRepository;
    }

    public PagedResponseDTO<ProductSummaryDTO> getAll(int page, int size) {
        return toPagedDTO(productRepository.findAll(PageRequest.of(page, size)));
    }

    public PagedResponseDTO<ProductSummaryDTO> getByCategory(Long categoryId, int page, int size) {
        return getByCategory(categoryId, page, size, false);
    }

    public PagedResponseDTO<ProductSummaryDTO> getByCategory(
            Long categoryId, int page, int size, boolean includeDescendants) {
        PageRequest pageable = PageRequest.of(page, size);
        Page<Product> productPage;

        if (includeDescendants) {
            productPage = productRepository.findByCategoryIdIn(getCategoryTreeIds(categoryId), pageable);
        } else {
            productPage = productRepository.findByCategoryId(categoryId, pageable);
        }

        return toPagedDTO(productPage);
    }

    public PagedResponseDTO<ProductSummaryDTO> searchByName(String name, int page, int size) {
        Page<Product> productPage = productRepository.findByNameContaining(name, PageRequest.of(page, size));
        return toPagedDTO(productPage);
    }

    public ProductSummaryDTO getById(Long id) {
        Product product = productRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Product not found: " + id));
        return toSummaryDTO(product);
    }

    private PagedResponseDTO<ProductSummaryDTO> toPagedDTO(Page<Product> productPage) {
        List<ProductSummaryDTO> content = productPage.getContent().stream()
                .map(this::toSummaryDTO)
                .toList();
        return PagedResponseDTO.from(productPage, content);
    }

    private List<Long> getCategoryTreeIds(Long rootCategoryId) {
        List<Long> categoryIds = new ArrayList<>();
        Set<Long> visited = new HashSet<>();
        ArrayDeque<Long> pending = new ArrayDeque<>();
        pending.add(rootCategoryId);

        while (!pending.isEmpty()) {
            Long categoryId = pending.remove();
            if (!visited.add(categoryId)) {
                continue;
            }

            categoryIds.add(categoryId);
            productCategoryRepository.findByParentId(categoryId).stream()
                    .map(category -> category.getId())
                    .filter(childId -> !visited.contains(childId))
                    .forEach(pending::add);
        }

        return categoryIds;
    }

    private ProductSummaryDTO toSummaryDTO(Product product) {
        List<ProductVariantSummaryDTO> variantDTOs = product.getVariants().stream()
                .map(this::toVariantDTO)
                .toList();

        return new ProductSummaryDTO(
                product.getId(),
                product.getName(),
                product.getDescription(),
                product.getDateCreated(),
                product.getLastUpdated(),
                variantDTOs
        );
    }

    private ProductVariantSummaryDTO toVariantDTO(ProductVariant variant) {
        return new ProductVariantSummaryDTO(
                variant.getId(),
                variant.getSku(),
                variant.getUnitPrice(),
                variant.getImageUrl(),
                variant.isActive(),
                variant.getUnitsInStock()
        );
    }
}