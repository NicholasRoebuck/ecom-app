package com.nickcoding.spring_boot_website.controller;

import com.nickcoding.spring_boot_website.dto.PagedResponseDTO;
import com.nickcoding.spring_boot_website.dto.ProductSummaryDTO;
import com.nickcoding.spring_boot_website.service.ProductQueryService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/products")
public class ProductController {

    private final ProductQueryService productQueryService;

    public ProductController(ProductQueryService productQueryService) {
        this.productQueryService = productQueryService;
    }

    @GetMapping
    public PagedResponseDTO<ProductSummaryDTO> getAll(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "12") int size,
            @RequestParam(defaultValue = "catalog") String sort) {
        return productQueryService.getAll(page, size, sort);
    }

    @GetMapping("/category/{categoryId}")
    public PagedResponseDTO<ProductSummaryDTO> getByCategory(
            @PathVariable Long categoryId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "12") int size,
            @RequestParam(defaultValue = "false") boolean includeDescendants,
            @RequestParam(defaultValue = "catalog") String sort) {
        return productQueryService.getByCategory(categoryId, page, size, includeDescendants, sort);
    }

    @GetMapping("/search")
    public PagedResponseDTO<ProductSummaryDTO> search(
            @RequestParam String name,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "12") int size,
            @RequestParam(defaultValue = "catalog") String sort) {
        return productQueryService.searchByName(name, page, size, sort);
    }

    @GetMapping("/{id}")
    public ProductSummaryDTO getById(@PathVariable Long id) {
        return productQueryService.getById(id);
    }
}
