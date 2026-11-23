package com.nickcoding.spring_boot_website;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.nickcoding.spring_boot_website.entity.*;
import com.nickcoding.spring_boot_website.service.StripePaymentGateway;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties={"spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect",
    "spring.jpa.hibernate.ddl-auto=create-drop","checkout.reconciliation.enabled=false","logging.level.root=ERROR","debug=false"})
@AutoConfigureMockMvc
@AutoConfigureTestDatabase(replace=AutoConfigureTestDatabase.Replace.ANY)
@Transactional
class CatalogFilterIntegrationTest {
    @Autowired MockMvc http;
    @Autowired EntityManager em;
    @Autowired ObjectMapper json;
    @MockitoBean JwtDecoder decoder;
    @MockitoBean StripePaymentGateway payments;
    ProductCategory root,child,other;
    @BeforeEach void fixtures(){
        root=category("Vision",null);child=category("Shooting",root);other=category("Hearing",null);
        Product alpha=product("Alpha",child);
        variant(alpha,"100",0,true,Map.of("Color","Red","Frame","X6"));
        variant(alpha,"250",4,true,Map.of("Color","Blue","Frame","X7"));
        variant(alpha,"275",2,true,Map.of("Color","Blue","Frame","X7","Size","Large"));
        Product beta=product("Beta",child);variant(beta,"150",3,true,Map.of("Color","Red","Frame","X6","Lens type","Rose & Gold"));
        variant(product("Gamma",root),"80",5,true,Map.of("Color","Green"));
        variant(product("Delta",other),"20",8,true,Map.of("Color","Black"));
        variant(product("Disabled",child),"1",20,false,Map.of("Color","Invisible"));
        em.flush();em.clear();
    }
    ProductCategory category(String name,ProductCategory parent){ProductCategory c=new ProductCategory();c.setCategoryName(name);c.setParent(parent);em.persist(c);return c;}
    Product product(String name,ProductCategory category){Product p=new Product();p.setName(name);p.setCategory(category);em.persist(p);return p;}
    void variant(Product product,String price,int stock,boolean active,Map<String,String> options){
        ProductVariant v=new ProductVariant();v.setProduct(product);v.setSku(UUID.randomUUID().toString());v.setUnitPrice(new BigDecimal(price));
        v.setUnitsInStock(stock);v.setActive(active);v.setOptions(new LinkedHashMap<>(options));em.persist(v);product.getVariants().add(v);
    }
    MockHttpServletRequestBuilder scoped(){return get("/api/products/category/"+root.getId()).param("includeDescendants","true");}
    JsonNode result(MockHttpServletRequestBuilder request)throws Exception{return json.readTree(http.perform(request).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());}
    @Test void priceAndStockMustMatchTheSameVariant()throws Exception{
        JsonNode page=result(scoped().param("minPrice","90").param("maxPrice","200").param("inStock","true"));
        assertEquals(1,page.path("page").path("totalElements").asInt());assertEquals("Beta",page.path("content").get(0).path("name").asText());
    }
    @Test void multipleOptionsMustMatchTheSameVariant()throws Exception{
        assertEquals(0,result(scoped().param("option.Color","Blue").param("option.Frame","X6")).path("page").path("totalElements").asInt());
        assertEquals(1,result(scoped().param("option.Color","Blue").param("option.Frame","X7")).path("page").path("totalElements").asInt());
    }
    @Test void matchingSeveralVariantsDoesNotDuplicateProducts()throws Exception{
        JsonNode page=result(scoped().param("minPrice","200").param("option.Color","Blue"));
        assertEquals(1,page.path("content").size());assertEquals(1,page.path("page").path("totalElements").asInt());
    }
    @Test void filtersApplyBeforePaginationAndKeepSortAndCounts()throws Exception{
        JsonNode first=result(scoped().param("minPrice","0").param("size","1").param("sort","name"));
        JsonNode second=result(scoped().param("minPrice","0").param("size","1").param("sort","name").param("page","1"));
        assertEquals(3,first.path("page").path("totalElements").asInt());assertEquals(3,first.path("page").path("totalPages").asInt());
        assertEquals("Alpha",first.path("content").get(0).path("name").asText());assertEquals("Beta",second.path("content").get(0).path("name").asText());
    }
    @Test void directCategoryDoesNotIncludeDescendantsUnlessRequested()throws Exception{
        JsonNode page=result(get("/api/products/category/"+root.getId()).param("inStock","true"));
        assertEquals(1,page.path("content").size());assertEquals("Gamma",page.path("content").get(0).path("name").asText());
    }
    @Test void priceBoundsAreInclusive()throws Exception{
        JsonNode page=result(scoped().param("minPrice","150").param("maxPrice","150"));
        assertEquals(1,page.path("content").size());assertEquals("Beta",page.path("content").get(0).path("name").asText());
    }
    @Test void searchFiltersRespectSearchText()throws Exception{
        JsonNode page=result(get("/api/products/search").param("name","Alpha").param("option.Color","Blue"));
        assertEquals(1,page.path("content").size());assertEquals("Alpha",page.path("content").get(0).path("name").asText());
        assertEquals(0,result(get("/api/products/search").param("name","Alpha").param("option.Color","Black")).path("content").size());
    }
    @Test void searchWildcardsAreLiteral()throws Exception{
        ProductCategory c=em.find(ProductCategory.class,other.getId());variant(product("100% real",c),"10",1,true,Map.of());em.flush();
        JsonNode page=result(get("/api/products/search").param("name","%").param("inStock","true"));
        assertEquals(1,page.path("content").size());assertEquals("100% real",page.path("content").get(0).path("name").asText());
    }
    @Test void optionValuesComeFromTheWholeCategoryScopeAndOnlyActiveVariants()throws Exception{
        JsonNode response=result(get("/api/products/filters").param("categoryId",root.getId().toString()).param("includeDescendants","true"));
        Map<String,List<String>> options=new HashMap<>();for(JsonNode option:response.path("options")){
            List<String> values=new ArrayList<>();option.path("values").forEach(value->values.add(value.asText()));options.put(option.path("name").asText(),values);
        }
        assertEquals(List.of("Blue","Green","Red"),options.get("Color"));assertEquals(List.of("X6","X7"),options.get("Frame"));
        assertFalse(options.get("Color").contains("Black"));assertFalse(options.get("Color").contains("Invisible"));
        JsonNode search=result(get("/api/products/filters").param("name","Beta"));assertTrue(search.toString().contains("Rose & Gold"));assertFalse(search.toString().contains("Green"));
    }
    @Test void supportsOptionNamesAndValuesWithSpacesAndPunctuation()throws Exception{
        JsonNode page=result(scoped().param("option.Lens type","Rose & Gold"));assertEquals(1,page.path("content").size());
    }
    @Test void rejectsInvalidFilters()throws Exception{
        for(String value:List.of("-1","abc","0.001","100000000"))http.perform(scoped().param("minPrice",value)).andExpect(status().isBadRequest());
        http.perform(scoped().param("minPrice","200").param("maxPrice","100")).andExpect(status().isBadRequest());
        http.perform(scoped().param("inStock","yes")).andExpect(status().isBadRequest());
        http.perform(scoped().param("option.Color","Red","Blue")).andExpect(status().isBadRequest());
        http.perform(scoped().param("option.Color","")).andExpect(status().isBadRequest());
        http.perform(scoped().param("minPrice","1").param("size","101")).andExpect(status().isBadRequest());
    }
    @Test void noFiltersPreserveTheExistingCatalogResponse()throws Exception{
        JsonNode page=result(scoped());assertEquals(4,page.path("page").path("totalElements").asInt());
    }
}
