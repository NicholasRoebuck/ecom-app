package com.nickcoding.spring_boot_website;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import javax.sql.DataSource;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
@SpringBootTest(properties = {"spring.datasource.url=jdbc:mysql://invalid.example/never-connect", "server.port=0"})
@ActiveProfiles("render-smoke")
@AutoConfigureMockMvc
class RenderSmokeIntegrationTest {
    @Autowired MockMvc http;
    @Autowired DataSource source;
    @Test void usesDisposableDatabaseAndServesCatalog() throws Exception {
        try(var connection = source.getConnection()) { assertTrue(connection.getMetaData().getURL().startsWith("jdbc:h2:mem:")); }
        http.perform(get("/api/preview-health")).andExpect(status().isOk()).andExpect(jsonPath("$.dataResetsOnRestart").value(true));
        http.perform(get("/api/products?size=20")).andExpect(status().isOk())
            .andExpect(jsonPath("$.page.totalElements").value(20)).andExpect(jsonPath("$.content[0].variants.length()").value(9));
        http.perform(get("/api/products/filters")).andExpect(status().isOk());
    }
    @Test void blocksCheckoutAndAdministration() throws Exception {
        http.perform(post("/api/checkout/review").contentType("application/json").content("{}")).andExpect(status().isForbidden());
        http.perform(get("/api/admin/products")).andExpect(status().isForbidden());
        http.perform(post("/api/admin/categories").contentType("application/json").content("{}")).andExpect(status().isForbidden());
    }
}
