package com.nickcoding.spring_boot_website.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.nickcoding.spring_boot_website.dao.*;
import com.nickcoding.spring_boot_website.dto.AdminProductDTO;
import com.nickcoding.spring_boot_website.dto.PagedResponseDTO;
import com.nickcoding.spring_boot_website.entity.*;
import org.springframework.data.domain.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.net.URI;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.*;

@Service
@Transactional(readOnly = true)
public class AdminProductService {
    private final ProductRepository products;
    private final ProductVariantRepository variants;
    private final ProductCategoryRepository categories;
    private final ObjectMapper json;

    public AdminProductService(ProductRepository products, ProductVariantRepository variants,
                               ProductCategoryRepository categories, ObjectMapper json) {
        this.products = products; this.variants = variants; this.categories = categories; this.json = json;
    }

    public PagedResponseDTO<AdminProductDTO> list(String search, int page, int size) {
        if (page < 0 || size < 1 || size > 100) throw invalid("Use a page of zero or greater and a size from 1 to 100.");
        var result = products.findByNameContainingIgnoreCase(search == null ? "" : search.trim(),
                PageRequest.of(page, size, Sort.by("name", "id")));
        return PagedResponseDTO.from(result, result.getContent().stream().map(this::view).toList());
    }

    public List<AdminProductDTO.Category> categories() {
        return categories.findAll(Sort.by("categoryName", "id")).stream()
                .map(c -> new AdminProductDTO.Category(c.getId(), c.getCategoryName(),
                        c.getParent() == null ? null : c.getParent().getId(), products.countByCategoryId(c.getId()), categories.countByParent_Id(c.getId()))).toList();
    }

    public AdminProductDTO get(Long id) {
        return view(products.findById(id).orElseThrow(() -> missing("Product")));
    }

    @Transactional
    public AdminProductDTO save(Long id, AdminProductDTO input) {
        if (input == null) throw invalid("Product details are required.");
        Product product = id == null ? new Product() :
                products.findForAdminUpdate(id).orElseThrow(() -> missing("Product"));
        if (id != null) checkRevision(product, input.revision());
        if (input.id() != null && !input.id().equals(id)) throw invalid("Product ID does not match the URL.");
        String name = text(input.name(), "Product name", 255);
        String description = input.description() == null ? "" : input.description().trim();
        if (description.length() > 255) throw invalid("Description must be 255 characters or fewer.");
        if (input.categoryId() == null) throw invalid("Choose a category.");
        ProductCategory category = categories.findForCategoryEdit(input.categoryId()).orElseThrow(() -> invalid("Choose an existing category."));
        if (input.variants() == null || input.variants().isEmpty())
            throw invalid("A product must have at least one variant.");

        var configuration = configuration(input.configuration() == null ? readConfiguration(product) : input.configuration(), product);
        Map<Long, ProductVariant> existing = new HashMap<>();
        product.getVariants().forEach(v -> existing.put(v.getId(), v));
        Set<Long> usedIds = new HashSet<>();
        Set<String> skus = new HashSet<>();
        Set<Map<String, String>> combinations = new HashSet<>();
        Set<String> optionNames = null;
        List<AdminProductDTO.Variant> normalized = new ArrayList<>();
        for (var v : input.variants()) {
            if (v == null) throw invalid("Variant details are required.");
            if (v.id() != null && (!existing.containsKey(v.id()) || !usedIds.add(v.id())))
                throw invalid("A variant ID is duplicated or belongs to a different product.");
            String sku = v.sku() == null || v.sku().isBlank() ? "PRODUCT-" + UUID.randomUUID() : text(v.sku(), "SKU", 255);
            if (!skus.add(sku.toLowerCase(Locale.ROOT)) ||
                    variants.existsBySkuIgnoreCaseAndIdNot(sku, v.id() == null ? -1L : v.id()))
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Every variant needs a unique SKU.");
            if (v.unitPrice() == null || v.unitPrice().signum() < 0 ||
                    v.unitPrice().compareTo(new BigDecimal("99999999.99")) > 0 ||
                    v.unitPrice().stripTrailingZeros().scale() > 2)
                throw invalid("Each price must be between 0 and 99999999.99 with at most two decimal places.");
            if (v.unitsInStock() == null || v.unitsInStock().signum() < 0 || v.unitsInStock().stripTrailingZeros().scale() > 0 || v.unitsInStock().compareTo(BigDecimal.valueOf(Integer.MAX_VALUE)) > 0) throw invalid("Stock must be a nonnegative whole number.");
            if (v.active() == null) throw invalid("Each variant needs an active setting.");
            String image = image(v.imageUrl(), v.id() == null ? null : existing.get(v.id()).getImageUrl());
            Map<String, String> options = new TreeMap<>();
            if (v.options() != null) {
                if (v.options().size() > 20) throw invalid("Use at most 20 options per variant.");
                for (var entry : v.options().entrySet()) {
                    String key = text(entry.getKey(), "Option name", 64);
                    String value = text(entry.getValue(), "Option value", 128);
                    if (options.putIfAbsent(key, value) != null) throw invalid("Option names must be unique.");
                }
            }
            if (configuration != null) {
                if (options.size() != configuration.options().size())
                    throw invalid("Each variant must use the configured product options. Update variants first.");
                for (var definition : configuration.options())
                    if (!definition.values().contains(options.get(definition.name())))
                        throw invalid("Variant options must use the configured option names and values.");
            }
            if (optionNames == null) optionNames = new TreeSet<>(options.keySet());
            else if (!optionNames.equals(options.keySet())) throw invalid("Use the same option names for every variant.");
            // Empty maps preserve the existing SKU-based variation selector.
            if (!options.isEmpty() && !combinations.add(options)) throw invalid("Each option combination must be unique.");
            normalized.add(new AdminProductDTO.Variant(v.id(), sku, v.unitPrice().setScale(2), image, v.active(), v.unitsInStock(), options));
        }

        product.setVariantConfiguration(writeConfiguration(configuration));
        product.setName(name); product.setDescription(description); product.setCategory(category);
        for (var variant : product.getVariants())
            if (!usedIds.contains(variant.getId()) && variants.hasInventoryReservations(variant.getId()))
                throw new ResponseStatusException(HttpStatus.CONFLICT, "A variant has reserved inventory. Deactivate it instead of deleting it.");
        product.getVariants().removeIf(v -> !usedIds.contains(v.getId()));
        for (var v : normalized) {
            ProductVariant entity = v.id() == null ? new ProductVariant() : existing.get(v.id());
            if (v.id() == null) { entity.setProduct(product); product.getVariants().add(entity); }
            entity.setSku(v.sku()); entity.setUnitPrice(v.unitPrice()); entity.setImageUrl(v.imageUrl());
            entity.setActive(v.active()); entity.setUnitsInStock(v.unitsInStock().intValueExact());
            entity.getOptions().clear(); entity.getOptions().putAll(v.options());
        }
        return view(products.saveAndFlush(product));
    }

    @Transactional
    public void delete(Long id, String revision) {
        Product product = products.findForAdminUpdate(id).orElseThrow(() -> missing("Product"));
        checkRevision(product, revision);
        for (var variant : product.getVariants())
            if (variants.hasInventoryReservations(variant.getId()))
                throw new ResponseStatusException(HttpStatus.CONFLICT, "This product has reserved inventory. Deactivate it instead of deleting it.");
        products.delete(product);
        products.flush();
    }

    private void checkRevision(Product product, String revision) {
        if (revision == null || !revision.equals(view(product).revision()))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This product changed after you opened it. Reload it before saving or deleting.");
    }

    private AdminProductDTO view(Product p) {
        var rows = p.getVariants().stream().sorted(Comparator.comparing(ProductVariant::getId))
                .map(v -> new AdminProductDTO.Variant(v.getId(), v.getSku(), v.getUnitPrice(), v.getImageUrl(),
                        v.isActive(), BigDecimal.valueOf(v.getUnitsInStock()), new TreeMap<>(v.getOptions()))).toList();
        var configuration = readConfiguration(p);
        var snapshot = new AdminProductDTO(p.getId(), p.getName(), p.getDescription(), p.getCategory().getId(), null, rows, configuration);
        try {
            String revision = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(json.writeValueAsBytes(snapshot)));
            return new AdminProductDTO(p.getId(), p.getName(), p.getDescription(), p.getCategory().getId(), revision, rows, configuration);
        } catch (NoSuchAlgorithmException | JsonProcessingException ex) {
            throw new IllegalStateException("Could not generate product revision.", ex);
        }
    }


    private AdminProductDTO.Configuration configuration(AdminProductDTO.Configuration config, Product product) {
        if (config == null) return null; // Older catalog clients can still submit explicit variants.
        if (config.options() == null || config.options().size() > 20 || config.defaults() == null)
            throw invalid("Define up to 20 product options and provide product pricing and stock.");
        Set<String> names = new HashSet<>();
        List<AdminProductDTO.Option> definitions = new ArrayList<>();
        for (var option : config.options()) {
            if (option == null) throw invalid("Product option details are required.");
            String name = text(option.name(), "Option name", 64);
            if (!names.add(name.toLowerCase(Locale.ROOT))) throw invalid("Product option names must be unique.");
            if (option.values() == null || option.values().isEmpty())
                throw invalid("Each product option needs at least one value.");
            List<String> values = new ArrayList<>();
            Set<String> used = new HashSet<>();
            for (String raw : option.values()) {
                String value = text(raw, "Option value", 128);
                if (!used.add(value.toLowerCase(Locale.ROOT))) throw invalid("Option values must be unique within each option.");
                values.add(value);
            }
            definitions.add(new AdminProductDTO.Option(name, values));
        }
        var defaults = config.defaults();
        if (defaults.unitPrice() == null || defaults.unitPrice().signum() < 0 ||
                defaults.unitPrice().compareTo(new BigDecimal("99999999.99")) > 0 ||
                defaults.unitPrice().stripTrailingZeros().scale() > 2)
            throw invalid("Product price must be nonnegative with at most two decimal places.");
        if (defaults.unitsInStock() == null || defaults.unitsInStock().signum() < 0 ||
                defaults.unitsInStock().stripTrailingZeros().scale() > 0 ||
                defaults.unitsInStock().compareTo(BigDecimal.valueOf(Integer.MAX_VALUE)) > 0)
            throw invalid("Product stock must be a nonnegative whole number.");
        if (defaults.active() == null) throw invalid("Choose product availability.");
        String prefix = defaults.skuPrefix() == null ? "" : defaults.skuPrefix().trim();
        if (prefix.length() > 255) throw invalid("SKU must be 255 characters or fewer.");
        var previous = readConfiguration(product);
        String previousImage = previous == null ? product.getVariants().stream().findFirst().map(ProductVariant::getImageUrl).orElse(null) : previous.defaults().imageUrl();
        List<String> customized = config.customizedSkus() == null ? null : config.customizedSkus().stream()
                .map(sku -> text(sku, "Customized SKU", 255)).distinct().toList();
        List<Map<String, String>> excluded = new ArrayList<>();
        if (config.excludedCombinations() != null) for (var combination : config.excludedCombinations()) {
            if (combination == null || combination.size() != definitions.size()) throw invalid("Excluded combinations must match product options.");
            for (var definition : definitions)
                if (!definition.values().contains(combination.get(definition.name()))) throw invalid("Excluded combinations must use configured values.");
            excluded.add(new TreeMap<>(combination));
        }
        String cursor = config.generationCursor() == null ? "0" : config.generationCursor();
        if (!cursor.matches("0|[1-9][0-9]*")) throw invalid("Invalid variant generation progress.");
        var total = java.math.BigInteger.ONE;
        for (var definition : definitions) total = total.multiply(java.math.BigInteger.valueOf(definition.values().size()));
        if (new java.math.BigInteger(cursor).compareTo(total) > 0) throw invalid("Invalid variant generation progress.");
        return new AdminProductDTO.Configuration(definitions, new AdminProductDTO.Defaults(prefix,
                defaults.unitPrice().setScale(2), image(defaults.imageUrl(), previousImage), defaults.active(),
                defaults.unitsInStock().setScale(0)), customized, excluded, cursor);
    }

    private String writeConfiguration(AdminProductDTO.Configuration configuration) {
        if (configuration == null) return null;
        try { return json.writeValueAsString(configuration); }
        catch (JsonProcessingException ex) { throw new IllegalStateException("Could not save variant configuration.", ex); }
    }

    private AdminProductDTO.Configuration readConfiguration(Product product) {
        if (product.getVariantConfiguration() == null) return null;
        try { return json.readValue(product.getVariantConfiguration(), AdminProductDTO.Configuration.class); }
        catch (JsonProcessingException ex) { throw new IllegalStateException("Could not read variant configuration.", ex); }
    }

    private String image(String raw, String previous) {
        if (raw == null || raw.isBlank()) return "";
        String value = text(raw, "Image URL", 255);
        try {
            URI uri = URI.create(value);
            boolean asset = value.equals(previous) && (value.startsWith("assets/") || value.startsWith("/assets/"));
            boolean remote = ("https".equalsIgnoreCase(uri.getScheme()) || "http".equalsIgnoreCase(uri.getScheme()))
                    && uri.getHost() != null && uri.getUserInfo() == null;
            if ((!asset && !remote) || value.contains("\\") || value.contains("..") || uri.getFragment() != null)
                throw invalid("Use an http(s) image URL.");
        } catch (IllegalArgumentException ex) { throw invalid("Use a valid image URL."); }
        return value;
    }

    private String text(String value, String label, int max) {
        if (value == null || value.isBlank() || value.trim().length() > max)
            throw invalid(label + " is required and must be " + max + " characters or fewer.");
        return value.trim();
    }

    private ResponseStatusException invalid(String message) { return new ResponseStatusException(HttpStatus.BAD_REQUEST, message); }
    private ResponseStatusException missing(String resource) { return new ResponseStatusException(HttpStatus.NOT_FOUND, resource + " not found."); }
}

