package com.nickcoding.spring_boot_website.controller;
import com.nickcoding.spring_boot_website.dao.ProductCategoryRepository;
import com.nickcoding.spring_boot_website.dao.ProductRepository;
import com.nickcoding.spring_boot_website.dto.AdminProductDTO;
import com.nickcoding.spring_boot_website.entity.ProductCategory;
import org.springframework.http.*;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/admin/categories")
@Transactional
public class AdminCategoryController {
    private final ProductCategoryRepository categories;
    private final ProductRepository products;
    public AdminCategoryController(ProductCategoryRepository categories, ProductRepository products) { this.categories = categories; this.products = products; }
    public record Input(String name, Long parentId, String originalName) {}
    @PostMapping
    public ResponseEntity<AdminProductDTO.Category> create(@RequestBody Input input) {
        String name = name(input.name());
        if (input.parentId() == null) throw bad("Choose an existing parent category or department.");
        // Lock the parent so creation and deletion cannot race.
        ProductCategory parent = find(input.parentId());
        duplicate(name, parent.getId(), null);
        var category = new ProductCategory(); category.setCategoryName(name); category.setParent(parent);
        categories.saveAndFlush(category);
        return ResponseEntity.created(java.net.URI.create("/api/admin/categories/" + category.getId()))
            .body(new AdminProductDTO.Category(category.getId(), name, parent.getId()));
    }
    @PutMapping("/{id}")
    public AdminProductDTO.Category rename(@PathVariable Long id, @RequestBody Input input) {
        String name = name(input.name());
        var category = find(id);
        if (!category.getCategoryName().equals(input.originalName()))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This category changed. Reload categories before saving.");
        Long parentId = category.getParent() == null ? null : category.getParent().getId();
        if (!java.util.Objects.equals(input.parentId(), parentId)) throw bad("This editor only changes the name.");
        duplicate(name, parentId, id); category.setCategoryName(name);
        return new AdminProductDTO.Category(id, name, parentId);
    }
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id, @RequestParam String originalName) {
        var category = find(id);
        if (category.getParent() == null) throw bad("Departments cannot be deleted here.");
        if (!category.getCategoryName().equals(originalName))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This category changed. Reload categories before deleting.");
        if (products.countByCategoryId(id) > 0)
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Move this category's products to another category before deleting it.");
        if (categories.countByParent_Id(id) > 0)
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This category has subcategories. Handle those before deleting it.");
        categories.deleteEmptyCategoryRow(id);
    }

    private ProductCategory find(Long id) {
        return categories.findForCategoryEdit(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Category not found."));
    }
    private String name(String value) {
        if (value == null || value.isBlank() || value.strip().length() > 255) throw bad("Enter a category name (up to 255 characters).");
        return value.strip();
    }
    private void duplicate(String name, Long parentId, Long except) {
        var siblings = parentId == null ? categories.findByParentIsNull() : categories.findByParentId(parentId);
        if (siblings.stream().anyMatch(c -> !java.util.Objects.equals(c.getId(), except) && c.getCategoryName().equalsIgnoreCase(name)))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "A category with this name already exists under this parent.");
    }
    private ResponseStatusException bad(String message) { return new ResponseStatusException(HttpStatus.BAD_REQUEST, message); }
}
