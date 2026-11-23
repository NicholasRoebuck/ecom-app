package com.nickcoding.spring_boot_website.controller;

import com.nickcoding.spring_boot_website.dto.ProductCategoryNavDTO;
import com.nickcoding.spring_boot_website.service.ProductCategoryNavService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/nav/categories")
public class ProductCategoryNavController {

    private final ProductCategoryNavService service;

    public ProductCategoryNavController(ProductCategoryNavService service) {
        this.service = service;
    }

    @GetMapping("/all")
    public List<ProductCategoryNavDTO> getAll() { return service.getAllCategories(); }

    @GetMapping("/top-level")
    public List<ProductCategoryNavDTO> getTopLevel() {
        return service.getTopLevelCategories();
    }

    @GetMapping("/{parentId}/children")
    public List<ProductCategoryNavDTO> getChildren(@PathVariable Long parentId) {
        return service.getChildren(parentId);
    }
}