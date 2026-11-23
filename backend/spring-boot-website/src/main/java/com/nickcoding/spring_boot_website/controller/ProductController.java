package com.nickcoding.spring_boot_website.controller;

import com.nickcoding.spring_boot_website.dto.PagedResponseDTO;
import com.nickcoding.spring_boot_website.dto.ProductSummaryDTO;
import com.nickcoding.spring_boot_website.service.ProductQueryService;
import org.springframework.web.bind.annotation.*;
import org.springframework.util.MultiValueMap;
import com.nickcoding.spring_boot_website.dto.CatalogFilters;
import com.nickcoding.spring_boot_website.dto.CatalogFilterOptions;
import com.nickcoding.spring_boot_website.service.CatalogFilterService;

@RestController
@RequestMapping("/api/products")
public class ProductController {

    private final ProductQueryService productQueryService;
    private final CatalogFilterService filters;

    public ProductController(ProductQueryService productQueryService, CatalogFilterService filters) {
        this.productQueryService = productQueryService;
        this.filters = filters;
    }

    @GetMapping
    public PagedResponseDTO<ProductSummaryDTO> getAll(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "12") int size,
            @RequestParam(defaultValue = "catalog") String sort, @RequestParam MultiValueMap<String, String> parameters) {
        CatalogFilters selected = CatalogFilters.from(parameters);
        return selected.isEmpty() ? productQueryService.getAll(page, size, sort) : filters.search(null, false, null, page, size, sort, selected);
    }

    @GetMapping("/category/{categoryId}")
    public PagedResponseDTO<ProductSummaryDTO> getByCategory(
            @PathVariable Long categoryId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "12") int size,
            @RequestParam(defaultValue = "false") boolean includeDescendants,
            @RequestParam(defaultValue = "catalog") String sort, @RequestParam MultiValueMap<String, String> parameters) {
        CatalogFilters selected = CatalogFilters.from(parameters);
        return selected.isEmpty() ? productQueryService.getByCategory(categoryId, page, size, includeDescendants, sort) : filters.search(categoryId, includeDescendants, null, page, size, sort, selected);
    }

    @GetMapping("/search")
    public PagedResponseDTO<ProductSummaryDTO> search(
            @RequestParam String name,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "12") int size,
            @RequestParam(defaultValue = "catalog") String sort, @RequestParam MultiValueMap<String, String> parameters) {
        CatalogFilters selected = CatalogFilters.from(parameters);
        return selected.isEmpty() ? productQueryService.searchByName(name, page, size, sort) : filters.search(null, false, name, page, size, sort, selected);
    }

    @GetMapping("/filters")
    public CatalogFilterOptions filterOptions(@RequestParam(required = false) Long categoryId,
            @RequestParam(defaultValue = "false") boolean includeDescendants, @RequestParam(required = false) String name) {
        return filters.options(categoryId, includeDescendants, name);
    }

    @GetMapping("/{id}")
    public ProductSummaryDTO getById(@PathVariable Long id) {
        return productQueryService.getById(id);
    }
}
