package com.nickcoding.spring_boot_website.config;
import com.nickcoding.spring_boot_website.dao.*;
import com.nickcoding.spring_boot_website.entity.*;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.*;
import org.springframework.http.HttpMethod;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import java.math.BigDecimal;
import java.util.Map;
import javax.sql.DataSource;
/** Disposable capacity test. Never connects to the configured MySQL URL. */
@Configuration
@Profile({"render-smoke", "render-preview"})
public class RenderSmokeConfiguration {
    @Bean DataSource renderSmokeDataSource() {
        // Hardcoding this test-only data source prevents create-drop from reaching MySQL through environment overrides.
        var source = new DriverManagerDataSource(); source.setDriverClassName("org.h2.Driver");
        source.setUrl("jdbc:h2:mem:render_smoke;DB_CLOSE_DELAY=-1;MODE=MySQL");
        source.setUsername("sa"); source.setPassword(""); return source;
    }
    @Bean @Profile("render-smoke") SecurityFilterChain renderSmokeSecurity(HttpSecurity http) throws Exception {
        return http.sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(requests -> requests
                .requestMatchers(HttpMethod.GET, "/api/preview-health", "/api/products", "/api/products/**", "/api/nav/categories/**").permitAll()
                .anyRequest().denyAll()).build();
    }
    @Bean @Profile("render-smoke") ApplicationRunner renderSmokeCatalog(ProductCategoryRepository categories, ProductRepository products) {
        return args -> {
            var hearing = new ProductCategory(); hearing.setCategoryName("Hearing"); categories.save(hearing);
            var vision = new ProductCategory(); vision.setCategoryName("Vision"); categories.save(vision);
            var glasses = new ProductCategory(); glasses.setCategoryName("Shooting Glasses"); glasses.setParent(vision); categories.save(glasses);
            for (int i = 1; i <= 20; i++) {
                var product = new Product(); product.setName("Temporary preview glasses " + i);
                product.setDescription("Disposable Render capacity-test data."); product.setCategory(glasses);
                for (String size : new String[]{"Small", "Medium", "Large"}) for (String color : new String[]{"Purple", "Orange", "Yellow"}) {
                    var variant = new ProductVariant(); variant.setProduct(product);
                    variant.setSku("SMOKE-" + i + "-" + size + "-" + color);
                    variant.setUnitPrice(new BigDecimal("199.00")); variant.setUnitsInStock(5); variant.setActive(true);
                    variant.setImageUrl(""); variant.setOptions(Map.of("Size", size, "Color", color)); product.getVariants().add(variant);
                }
                products.save(product);
            }
        };
    }
}
