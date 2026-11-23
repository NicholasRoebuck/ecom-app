package com.nickcoding.spring_boot_website;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import com.nickcoding.spring_boot_website.dao.*;
import com.nickcoding.spring_boot_website.entity.*;
import com.nickcoding.spring_boot_website.service.StripePaymentGateway;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.util.*;
import static org.mockito.Mockito.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {
    "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect",
    "spring.jpa.hibernate.ddl-auto=create-drop", "checkout.reconciliation.enabled=false",
    "app.owner.issuer=https://owner.example.test/", "app.owner.subject=owner-Subject",
    "allowed.origins=https://localhost:4200"
})
@AutoConfigureMockMvc
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.ANY)
@Transactional
class AdminProductIntegrationTest {
    @Autowired MockMvc http;
    @Autowired ObjectMapper json;
    @Autowired ProductCategoryRepository categories;
    @Autowired ProductRepository products;
    @Autowired ProductVariantRepository variants;
    @Autowired EntityManager em;
    @MockitoBean JwtDecoder decoder;
    @MockitoBean StripePaymentGateway payments;
    Long categoryId;

    @BeforeEach void setup() {
        when(decoder.decode("owner")).thenReturn(identity("owner-Subject"));
        when(decoder.decode("customer")).thenReturn(identity("customer"));
        var category = new ProductCategory(); category.setCategoryName("Test accessories");
        categoryId = categories.saveAndFlush(category).getId();
    }
    Jwt identity(String subject) {
        return Jwt.withTokenValue("test").header("alg", "RS256").issuer("https://owner.example.test/")
            .subject(subject).issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(300)).build();
    }
    ObjectNode input(String sku) {
        ObjectNode product = json.createObjectNode().put("name", "Test glasses").put("description", "Catalog test")
            .put("categoryId", categoryId);
        product.putArray("variants").addObject().put("sku", sku).put("unitPrice", 22.4)
            .put("imageUrl", "https://example.com/test.webp").put("active", true).put("unitsInStock", 5)
            .putObject("options").put("Color", "Black");
        return product;
    }
    ObjectNode create(String sku) throws Exception {
        return (ObjectNode) json.readTree(http.perform(post("/api/admin/products")
            .header("Authorization", "Bearer owner").contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsBytes(input(sku))))
            .andExpect(status().isCreated()).andExpect(header().exists("Location")).andReturn().getResponse().getContentAsString());
    }
    ObjectNode variant(ObjectNode product) { return (ObjectNode) product.withArray("variants").get(0); }
    ObjectNode update(ObjectNode product) throws Exception {
        return (ObjectNode) json.readTree(http.perform(put("/api/admin/products/" + product.get("id").asLong())
            .header("Authorization", "Bearer owner").contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsBytes(product)))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }

    @Test void ownerCreatesEditsAddsRemovesVariantsAndDeletesProduct() throws Exception {
        ObjectNode created = create("CRUD-BLACK");
        long id = created.get("id").asLong();
        long variantId = variant(created).get("id").asLong();
        http.perform(get("/api/admin/products/" + id).header("Authorization", "Bearer owner"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.revision").value(created.get("revision").asText()));
        ObjectNode second = variant(created).deepCopy();
        second.remove("id"); second.put("sku", "CRUD-WHITE").withObject("/options").put("Color", "White");
        created.withArray("variants").add(second);
        variant(created).put("unitPrice", 30).put("unitsInStock", 2).put("active", false);
        ObjectNode updated = update(created);
        assertEquals(variantId, variant(updated).get("id").asLong());
        assertEquals(2, updated.withArray("variants").size());
        http.perform(get("/api/products/" + id)).andExpect(status().isOk())
            .andExpect(jsonPath("$.variants[0].unitPrice").value(30.0))
            .andExpect(jsonPath("$.variants[0].active").value(false));
        updated.withArray("variants").remove(0);
        ObjectNode remaining = update(updated);
        assertFalse(variants.existsById(variantId));
        http.perform(delete("/api/admin/products/" + id).param("revision", remaining.get("revision").asText())
            .header("Authorization", "Bearer owner")).andExpect(status().isNoContent());
        assertFalse(products.existsById(id));
        http.perform(get("/api/products/" + id)).andExpect(status().isNotFound());
    }

    @Test void customerAndAnonymousCannotReadOrMutateActualManagementRoutes() throws Exception {
        var product = create("PRIVATE");
        long count = products.count();
        for (String method : List.of("GET", "POST", "PUT", "DELETE")) {
            String path = method.equals("POST") ? "/api/admin/products" : "/api/admin/products/" + product.get("id").asLong();
            http.perform(request(org.springframework.http.HttpMethod.valueOf(method), path)
                .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsBytes(product)))
                .andExpect(status().isUnauthorized());
            http.perform(request(org.springframework.http.HttpMethod.valueOf(method), path)
                .header("Authorization", "Bearer customer").contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsBytes(product)))
                .andExpect(status().isForbidden());
        }
        http.perform(get("/api/admin/products/categories").header("Authorization", "Bearer customer")).andExpect(status().isForbidden());
        assertEquals(count, products.count());
        verifyNoInteractions(payments);
    }

    @Test void invalidRequestsDoNotPartiallyCreateProducts() throws Exception {
        List<ObjectNode> bad = new ArrayList<>();
        var p = input("BAD-NAME"); p.put("name", " "); bad.add(p);
        p = input("BAD-PRICE"); variant(p).put("unitPrice", -1); bad.add(p);
        p = input("BAD-PRECISION"); variant(p).put("unitPrice", 1.234); bad.add(p);
        p = input("BAD-STOCK"); variant(p).put("unitsInStock", -1); bad.add(p);
        p = input("FRACTIONAL-STOCK"); variant(p).put("unitsInStock", 1.5); bad.add(p);
        p = input("BAD-CATEGORY"); p.put("categoryId", -1); bad.add(p);
        p = input("NO-VARIANTS"); p.putArray("variants"); bad.add(p);
        p = input("BAD-IMAGE"); variant(p).put("imageUrl", "javascript:alert(1)"); bad.add(p);
        p = input("LONG-DESCRIPTION"); p.put("description", "a".repeat(256)); bad.add(p);
        long count = products.count();
        for (ObjectNode body : bad)
            http.perform(post("/api/admin/products").header("Authorization", "Bearer owner")
                .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsBytes(body)))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").isNotEmpty());
        assertEquals(count, products.count());
    }

    @Test void invalidUpdateLeavesExistingDetailsUnchanged() throws Exception {
        var product = create("ATOMIC");
        product.put("name", "Should not persist");
        variant(product).put("unitPrice", -2);
        http.perform(put("/api/admin/products/" + product.get("id").asLong()).header("Authorization", "Bearer owner")
            .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsBytes(product))).andExpect(status().isBadRequest());
        em.clear();
        assertEquals("Test glasses", products.findById(product.get("id").asLong()).orElseThrow().getName());
    }

    @Test void variantsCannotBeMovedAcrossProductsOrRepeated() throws Exception {
        var first = create("OWNED-A"); var second = create("OWNED-B");
        variant(first).put("id", variant(second).get("id").asLong());
        http.perform(put("/api/admin/products/" + first.get("id").asLong()).header("Authorization", "Bearer owner")
            .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsBytes(first))).andExpect(status().isBadRequest());
        first = (ObjectNode) json.readTree(http.perform(get("/api/admin/products/" + first.get("id").asLong())
            .header("Authorization", "Bearer owner")).andReturn().getResponse().getContentAsString());
        first.withArray("variants").add(variant(first).deepCopy().put("sku", "OWNED-C"));
        http.perform(put("/api/admin/products/" + first.get("id").asLong()).header("Authorization", "Bearer owner")
            .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsBytes(first))).andExpect(status().isBadRequest());
    }

    @Test void skusAreUniqueAcrossCatalogAndWithinRequestIgnoringCase() throws Exception {
        create("UNIQUE");
        var body = input("unique");
        http.perform(post("/api/admin/products").header("Authorization", "Bearer owner").contentType(MediaType.APPLICATION_JSON)
            .content(json.writeValueAsBytes(body))).andExpect(status().isConflict());
        body = input("LOCAL");
        body.withArray("variants").add(variant(body).deepCopy().put("sku", "local"));
        http.perform(post("/api/admin/products").header("Authorization", "Bearer owner").contentType(MediaType.APPLICATION_JSON)
            .content(json.writeValueAsBytes(body))).andExpect(status().isConflict());
    }

    @Test void optionsRequireConsistentNamesAndUniqueCombinationsButLegacyEmptyMapsAreAllowed() throws Exception {
        var body = input("OPTIONS-A");
        var extra = variant(body).deepCopy().put("sku", "OPTIONS-B"); extra.putObject("options").put("Size", "M");
        body.withArray("variants").add(extra);
        http.perform(post("/api/admin/products").header("Authorization", "Bearer owner").contentType(MediaType.APPLICATION_JSON)
            .content(json.writeValueAsBytes(body))).andExpect(status().isBadRequest());
        extra.putObject("options").put("Color", "Black");
        http.perform(post("/api/admin/products").header("Authorization", "Bearer owner").contentType(MediaType.APPLICATION_JSON)
            .content(json.writeValueAsBytes(body))).andExpect(status().isBadRequest());
        variant(body).putObject("options"); extra.putObject("options");
        http.perform(post("/api/admin/products").header("Authorization", "Bearer owner").contentType(MediaType.APPLICATION_JSON)
            .content(json.writeValueAsBytes(body))).andExpect(status().isCreated());
    }

    @Test void staleUpdatesAndDeletesCannotOverwriteNewerDetails() throws Exception {
        var product = create("STALE"); var outdated = product.deepCopy();
        variant(product).put("unitPrice", 44);
        var updated = update(product);
        assertNotEquals(outdated.get("revision").asText(), updated.get("revision").asText());
        outdated.put("name", "Lost update");
        http.perform(put("/api/admin/products/" + outdated.get("id").asLong()).header("Authorization", "Bearer owner")
            .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsBytes(outdated))).andExpect(status().isConflict());
        http.perform(delete("/api/admin/products/" + outdated.get("id").asLong()).header("Authorization", "Bearer owner")
            .param("revision", outdated.get("revision").asText())).andExpect(status().isConflict());
        assertTrue(products.existsById(updated.get("id").asLong()));
    }

    @Test void deletingCatalogDataPreservesSavedOrderItemSnapshot() throws Exception {
        var product = create("SNAPSHOT");
        var item = new OrderItem();
        item.setProductId(product.get("id").asLong()); item.setVariantId(variant(product).get("id").asLong());
        item.setProductName("Purchased glasses (Color: Black)"); item.setSku("SNAPSHOT");
        item.setUnitPrice(new java.math.BigDecimal("22.40")); item.setQuantity(1);
        em.persist(item); em.flush(); Long itemId = item.getId();
        http.perform(delete("/api/admin/products/" + product.get("id").asLong()).header("Authorization", "Bearer owner")
            .param("revision", product.get("revision").asText())).andExpect(status().isNoContent());
        em.clear();
        var saved = em.find(OrderItem.class, itemId);
        assertNotNull(saved);
        assertEquals("Purchased glasses (Color: Black)", saved.getProductName());
        assertEquals(new java.math.BigDecimal("22.40"), saved.getUnitPrice());
    }

    @Test void ownerCanSearchPageAndLoadCategoriesAndInvalidPagesAreRejected() throws Exception {
        create("SEARCH");
        http.perform(get("/api/admin/products").param("search", "GLASSES").param("size", "1").header("Authorization", "Bearer owner"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.page.totalElements").value(1))
            .andExpect(jsonPath("$.content[0].categoryId").value(categoryId));
        http.perform(get("/api/admin/products/categories").header("Authorization", "Bearer owner"))
            .andExpect(status().isOk()).andExpect(jsonPath("$[0].name").value("Test accessories"));
        http.perform(get("/api/admin/products").param("size", "101").header("Authorization", "Bearer owner")).andExpect(status().isBadRequest());
        http.perform(get("/api/admin/products/-1").header("Authorization", "Bearer owner")).andExpect(status().isNotFound());
    }

    @Test void browserAllowsOwnerMutationPreflightsFromConfiguredOriginOnly() throws Exception {
        for (String method : List.of("POST", "PUT", "DELETE")) {
            http.perform(options("/api/admin/products/1").header("Origin", "https://localhost:4200")
                .header("Access-Control-Request-Method", method).header("Access-Control-Request-Headers", "authorization,content-type"))
                .andExpect(status().isOk()).andExpect(header().string("Access-Control-Allow-Origin", "https://localhost:4200"));
        }
        http.perform(options("/api/admin/products/1").header("Origin", "https://untrusted.example")
            .header("Access-Control-Request-Method", "PUT")).andExpect(status().isForbidden());
    }

    @Test void automaticPublicRepositoryWritesCannotBypassOwnerControllers() throws Exception {
        var product = create("PUBLIC-WRITE");
        long before = products.count();
        for (String path : List.of("/api/products", "/api/products/" + product.get("id").asLong() + "/variants",
                "/api/productVariants", "/api/product-variants")) {
            http.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsBytes(input("BYPASS"))))
                .andExpect(status().is4xxClientError());
        }
        assertEquals(before, products.count());
    }

    ObjectNode configuredInput(String sku) {
        var body = input(sku);
        var config = body.putObject("configuration");
        config.putArray("options").addObject().put("name", "Color").putArray("values").add("Black").add("White");
        config.putObject("defaults").put("skuPrefix", "OUTLAW-90").put("unitPrice", 80)
            .put("unitsInStock", 12).put("imageUrl", "https://example.com/default.webp").put("active", false);
        return body;
    }
    ObjectNode createConfigured(String sku) throws Exception {
        return (ObjectNode) json.readTree(http.perform(post("/api/admin/products").header("Authorization", "Bearer owner")
            .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsBytes(configuredInput(sku))))
            .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
    }

    @Test void productDefinitionsAndDefaultsPersistWithoutOverwritingVariantDetails() throws Exception {
        var product = createConfigured("DEFINED");
        em.clear();
        http.perform(get("/api/admin/products/" + product.get("id").asLong()).header("Authorization", "Bearer owner"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.configuration.options[0].values[1]").value("White"))
            .andExpect(jsonPath("$.configuration.defaults.unitPrice").value(80))
            .andExpect(jsonPath("$.configuration.defaults.active").value(false))
            .andExpect(jsonPath("$.variants[0].unitPrice").value(22.4))
            .andExpect(jsonPath("$.variants[0].unitsInStock").value(5))
            .andExpect(jsonPath("$.variants[0].active").value(true))
            .andExpect(jsonPath("$.revision").value(product.get("revision").asText()));
    }

    @Test void newOptionDimensionsPreserveIncludedVariantIdsAndOrderTheirDefinitions() throws Exception {
        var product = createConfigured("DIMENSION");
        long existingId = variant(product).get("id").asLong();
        var config = (ObjectNode) product.get("configuration");
        config.withArray("options").addObject().put("name", "Size").putArray("values").add("Small").add("Large");
        variant(product).withObject("/options").put("Size", "Small");
        var extra = variant(product).deepCopy(); extra.remove("id"); extra.put("sku", "DIMENSION-LARGE");
        extra.withObject("/options").put("Size", "Large");
        product.withArray("variants").add(extra);
        var updated = update(product);
        assertEquals(existingId, variant(updated).get("id").asLong());
        assertEquals(2, updated.withArray("variants").size());
        assertEquals("Color", updated.at("/configuration/options/0/name").asText());
        assertEquals("Size", updated.at("/configuration/options/1/name").asText());
        http.perform(get("/api/products/" + product.get("id").asLong())).andExpect(status().isOk())
            .andExpect(jsonPath("$.variants[0].options.Size").value("Small"))
            .andExpect(jsonPath("$.configuration").doesNotExist());
    }

    @Test void invalidDefinitionsAndUnconfiguredVariantValuesAreRejectedBeforeSaving() throws Exception {
        List<ObjectNode> bad = new ArrayList<>();
        var body = configuredInput("BAD-OPTION-NAME");
        ((ObjectNode)body.get("configuration")).withArray("options").addObject().put("name", " color ")
            .putArray("values").add("Red"); bad.add(body);
        body = configuredInput("BAD-OPTION-VALUES");
        ((ObjectNode)body.at("/configuration/options/0")).withArray("values").add(" black "); bad.add(body);
        body = configuredInput("BAD-VALUE");
        variant(body).withObject("/options").put("Color", "Purple"); bad.add(body);
        body = configuredInput("BAD-DEFAULT-STOCK");
        ((ObjectNode)body.at("/configuration/defaults")).put("unitsInStock", 1.5); bad.add(body);
        body = configuredInput("BAD-DEFAULT-IMAGE");
        ((ObjectNode)body.at("/configuration/defaults")).put("imageUrl", "javascript:alert(1)"); bad.add(body);
        body = configuredInput("BAD-DEFAULT-PRICE");
        ((ObjectNode)body.at("/configuration/defaults")).put("unitPrice", -1);
        bad.add(body);
        long before = products.count();
        for (var request : bad)
            http.perform(post("/api/admin/products").header("Authorization", "Bearer owner")
                .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsBytes(request)))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").isNotEmpty());
        assertEquals(before, products.count());
    }

    @Test void configurationOnlyEditsChangeRevisionAndMissingConfigurationDoesNotEraseSavedChoices() throws Exception {
        var product = createConfigured("CONFIG-REVISION"); var stale = product.deepCopy();
        ((ObjectNode)product.at("/configuration/defaults")).put("unitPrice", 90);
        var changed = update(product);
        assertNotEquals(stale.get("revision").asText(), changed.get("revision").asText());
        http.perform(put("/api/admin/products/" + product.get("id").asLong()).header("Authorization", "Bearer owner")
            .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsBytes(stale))).andExpect(status().isConflict());
        changed.remove("configuration");
        var retained = update(changed);
        assertEquals("White", retained.at("/configuration/options/0/values/1").asText());
        assertEquals(90, retained.at("/configuration/defaults/unitPrice").asInt());
    }

    @Test void acceptsMoreThanOneHundredValuesAndVariantsAndStoresGenerationProgress() throws Exception {
        var body = configuredInput("MANY");
        var values = ((ObjectNode)body.at("/configuration/options/0")).putArray("values");
        var rows = body.putArray("variants");
        for (int i = 0; i < 125; i++) {
            values.add("Color " + i);
            var variant = variant(input("MANY-" + i)).deepCopy();
            variant.withObject("/options").put("Color", "Color " + i);
            rows.add(variant);
        }
        ((ObjectNode)body.get("configuration")).put("generationCursor", "125").putArray("customizedSkus").add("MANY-0");
        var created = json.readTree(http.perform(post("/api/admin/products").header("Authorization", "Bearer owner")
            .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsBytes(body)))
            .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        assertEquals(125, created.get("variants").size());
        assertEquals(125, created.at("/configuration/options/0/values").size());
        assertEquals("125", created.at("/configuration/generationCursor").asText());
        assertEquals("MANY-0", created.at("/configuration/customizedSkus/0").asText());
    }
    @Test void acceptsOptionSpacesBeyondTheFormerOneThousandCombinationLimit() throws Exception {
        var body = configuredInput("LARGE-SPACE");
        var definitions = ((ObjectNode)body.get("configuration")).putArray("options");
        for (String name : List.of("Size", "Color")) {
            var values = definitions.addObject().put("name", name).putArray("values");
            for (int i = 0; i < 40; i++) values.add("Value " + i);
        }
        variant(body).putObject("options").put("Size", "Value 0").put("Color", "Value 0");
        http.perform(post("/api/admin/products").header("Authorization", "Bearer owner")
            .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsBytes(body))).andExpect(status().isCreated());
    }
    @Test void missingSkuIsGeneratedAndNewAssetPathsAreRejected() throws Exception {
        var body = input("OPTIONAL"); variant(body).remove("sku");
        http.perform(post("/api/admin/products").header("Authorization", "Bearer owner")
            .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsBytes(body)))
            .andExpect(status().isCreated()).andExpect(jsonPath("$.variants[0].sku").isNotEmpty());
        body = input("ASSET"); variant(body).put("imageUrl", "assets/images/new.webp");
        http.perform(post("/api/admin/products").header("Authorization", "Bearer owner")
            .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsBytes(body))).andExpect(status().isBadRequest());
    }
    @Test void unchangedLegacyImagesAreRetainedWhenOtherDetailsAreEdited() throws Exception {
        var created = create("LEGACY-IMAGE");
        var id = variant(created).get("id").asLong();
        var entity = variants.findById(id).orElseThrow();
        entity.setImageUrl("assets/images/legacy.webp"); variants.saveAndFlush(entity); em.clear();
        var legacy = (ObjectNode) json.readTree(http.perform(get("/api/admin/products/" + created.get("id").asLong())
            .header("Authorization", "Bearer owner")).andReturn().getResponse().getContentAsString());
        variant(legacy).put("unitPrice", 45);
        var updated = update(legacy);
        assertEquals("assets/images/legacy.webp", variant(updated).get("imageUrl").asText());
    }


    @Test void publicCatalogSortsBeforePaginationAcrossCollectionsAndSearch() throws Exception {
        for (String name : List.of("Zulu", "Alpha", "Beta")) {
            var created = create("SORT-" + name);
            var entity = products.findById(created.get("id").asLong()).orElseThrow();
            entity.setName(name); products.saveAndFlush(entity);
        }
        http.perform(get("/api/products").param("sort", "name").param("size", "1"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.content[0].name").value("Alpha"))
            .andExpect(jsonPath("$.page.totalElements").value(3));
        http.perform(get("/api/products").param("sort", "name").param("size", "1").param("page", "1"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.content[0].name").value("Beta"));
        http.perform(get("/api/products/category/" + categoryId).param("sort", "name-desc").param("size", "1"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.content[0].name").value("Zulu"));
        http.perform(get("/api/products/search").param("name", "a").param("sort", "name").param("size", "1"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.content[0].name").value("Alpha"));
        http.perform(get("/api/products").param("sort", "newest").param("size", "1"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.content[0].name").value("Beta"));
        http.perform(get("/api/products").param("sort", "invalid")).andExpect(status().isBadRequest());
    }

    @Test void ownerRenamesCategoryWithoutChangingProductAssignments() throws Exception {
        var product = create("category-rename-test");
        var body = json.createObjectNode().put("name", "Sport equipment").put("originalName", "Test accessories").putNull("parentId");
        http.perform(put("/api/admin/categories/" + categoryId).header("Authorization", "Bearer owner")
            .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsBytes(body)))
            .andExpect(status().isOk()).andExpect(jsonPath("$.id").value(categoryId)).andExpect(jsonPath("$.name").value("Sport equipment"));
        http.perform(get("/api/admin/products/" + product.get("id").asLong()).header("Authorization", "Bearer owner"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.categoryId").value(categoryId));
        http.perform(get("/api/nav/categories/all")).andExpect(status().isOk())
            .andExpect(jsonPath("$[?(@.id == " + categoryId + ")].categoryName").value("Sport equipment"));
        http.perform(put("/api/admin/categories/" + categoryId).header("Authorization", "Bearer owner")
            .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsBytes(body))).andExpect(status().isConflict());
    }
    @Test void ownerAddsCategoriesAndSubcategoriesUnderExistingParents() throws Exception {
        var body = json.createObjectNode().put("name", "  Lenses  ").put("parentId", categoryId);
        var response = http.perform(post("/api/admin/categories").header("Authorization", "Bearer owner")
            .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsBytes(body)))
            .andExpect(status().isCreated()).andExpect(jsonPath("$.name").value("Lenses"))
            .andExpect(jsonPath("$.parentId").value(categoryId)).andReturn();
        var child = json.readTree(response.getResponse().getContentAsString()).get("id").asLong();
        http.perform(post("/api/admin/categories").header("Authorization", "Bearer owner")
            .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsBytes(body))).andExpect(status().isConflict());
        body.put("parentId", child).put("name", "Nested");
        http.perform(post("/api/admin/categories").header("Authorization", "Bearer owner")
            .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsBytes(body))).andExpect(status().isCreated()).andExpect(jsonPath("$.parentId").value(child));
    }
    @Test void categoryMutationsRejectCustomersAndInvalidNames() throws Exception {
        for (String token : List.of("customer", "owner")) {
            http.perform(post("/api/admin/categories").header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"  \"}"))
                .andExpect(status().is(token.equals("owner") ? 400 : 403));
        }
        http.perform(post("/api/admin/categories").contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isUnauthorized());
    }

    Long addCategory(String name, Long parentId) throws Exception {
        var body = json.createObjectNode().put("name", name).put("parentId", parentId);
        var response = http.perform(post("/api/admin/categories").header("Authorization", "Bearer owner")
            .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsBytes(body)))
            .andExpect(status().isCreated()).andReturn();
        return json.readTree(response.getResponse().getContentAsString()).get("id").asLong();
    }
    @Test void deletesOnlyEmptyCategoryAndKeepsItsParent() throws Exception {
        var child = addCategory("Empty lens category", categoryId);
        http.perform(delete("/api/admin/categories/" + child).param("originalName", "Empty lens category")
            .header("Authorization", "Bearer owner")).andExpect(status().isNoContent());
        em.clear(); assertFalse(categories.existsById(child)); assertTrue(categories.existsById(categoryId));
    }
    @Test void deletionDoesNotCascadeToProductsOrSubcategories() throws Exception {
        var child = addCategory("Occupied", categoryId);
        var product = create("category-delete-preserve"); product.put("categoryId", child); update(product);
        http.perform(delete("/api/admin/categories/" + child).param("originalName", "Occupied")
            .header("Authorization", "Bearer owner")).andExpect(status().isConflict());
        assertTrue(products.existsById(product.get("id").asLong()));
        var branch = addCategory("Branch", categoryId); var leaf = addCategory("Leaf", branch);
        http.perform(delete("/api/admin/categories/" + branch).param("originalName", "Branch")
            .header("Authorization", "Bearer owner")).andExpect(status().isConflict());
        assertTrue(categories.existsById(branch)); assertTrue(categories.existsById(leaf));
        http.perform(get("/api/admin/products/categories").header("Authorization", "Bearer owner"))
            .andExpect(status().isOk()).andExpect(jsonPath("$[?(@.id == " + child + ")].productCount").value(1))
            .andExpect(jsonPath("$[?(@.id == " + branch + ")].childCount").value(1));
    }
    @Test void categoryDeletionProtectsDepartmentsStaleNamesAndOwnerAccess() throws Exception {
        http.perform(delete("/api/admin/categories/" + categoryId).param("originalName", "Test accessories")
            .header("Authorization", "Bearer owner")).andExpect(status().isBadRequest());
        var child = addCategory("Original", categoryId);
        http.perform(delete("/api/admin/categories/" + child).param("originalName", "Old name")
            .header("Authorization", "Bearer owner")).andExpect(status().isConflict());
        http.perform(delete("/api/admin/categories/" + child).param("originalName", "Original")
            .header("Authorization", "Bearer customer")).andExpect(status().isForbidden());
        http.perform(delete("/api/admin/categories/" + child).param("originalName", "Original"))
            .andExpect(status().isUnauthorized());
        assertTrue(categories.existsById(child));
    }
}
