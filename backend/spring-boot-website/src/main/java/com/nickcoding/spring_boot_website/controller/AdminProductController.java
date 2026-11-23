package com.nickcoding.spring_boot_website.controller;

import com.nickcoding.spring_boot_website.dto.AdminProductDTO;
import com.nickcoding.spring_boot_website.dto.PagedResponseDTO;
import com.nickcoding.spring_boot_website.service.AdminProductService;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/admin/products")
public class AdminProductController {
    private final AdminProductService products;
    public AdminProductController(AdminProductService products) { this.products = products; }

    @GetMapping public PagedResponseDTO<AdminProductDTO> list(@RequestParam(defaultValue = "") String search,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return products.list(search, page, size);
    }
    @GetMapping("/categories") public List<AdminProductDTO.Category> categories() { return products.categories(); }
    @GetMapping("/{id}") public AdminProductDTO get(@PathVariable Long id) { return products.get(id); }
    @PostMapping public ResponseEntity<AdminProductDTO> create(@RequestBody AdminProductDTO input) {
        var created = products.save(null, input);
        return ResponseEntity.created(java.net.URI.create("/api/admin/products/" + created.id())).body(created);
    }
    @PutMapping("/{id}") public AdminProductDTO update(@PathVariable Long id, @RequestBody AdminProductDTO input) {
        return products.save(id, input);
    }
    @DeleteMapping("/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id, @RequestParam String revision) { products.delete(id, revision); }
}
