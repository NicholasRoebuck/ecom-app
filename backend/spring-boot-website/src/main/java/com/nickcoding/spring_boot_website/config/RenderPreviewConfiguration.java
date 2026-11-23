package com.nickcoding.spring_boot_website.config;
import com.nickcoding.spring_boot_website.dao.*;
import com.nickcoding.spring_boot_website.entity.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.*;
import org.springframework.core.annotation.Order;
import org.springframework.web.servlet.config.annotation.*;
import org.springframework.web.servlet.HandlerInterceptor;
import jakarta.servlet.http.*;
import java.math.BigDecimal;
import java.util.Map;
@Configuration
@Profile("render-preview")
public class RenderPreviewConfiguration implements WebMvcConfigurer {
    private final String stripeKey;
    public RenderPreviewConfiguration(@Value("${stripe.key.secret}") String stripeKey) {
        requireTestKey(stripeKey); this.stripeKey = stripeKey;
    }
    public static void requireTestKey(String key) {
        if (!"disabled-render-preview".equals(key) && (key == null || !key.startsWith("sk_test_")))
            throw new IllegalStateException("The owner preview accepts only a Stripe test secret key.");
    }
    @Override public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new HandlerInterceptor() {
            @Override public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
                if (!stripeKey.startsWith("sk_test_") && !request.getRequestURI().equals("/api/checkout/quote")) {
                    response.setStatus(503); response.setContentType("application/json");
                    response.getWriter().write("{\"message\":\"Test checkout is not configured for this preview.\"}"); return false;
                }
                return true;
            }
        }).addPathPatterns("/api/checkout/**");
    }
    @Bean @Order(1) ApplicationRunner ownerPreviewData(ProductCategoryRepository categories, ProductRepository products, CountryRepository countries, StateRepository states) {
        return args -> {
            var hearing = category(categories, "Hearing", null); var vision = category(categories, "Vision", null);
            for (String name : new String[]{"Hearing Aids", "Music", "Shooting", "Misc"}) {
                var child = category(categories, name, hearing); var product = new Product();
                product.setName(name + " sample"); product.setDescription("Sample listing for owner feedback."); product.setCategory(child);
                variant(product, "SAMPLE-HEARING-" + child.getId(), "Standard", "Black", "", 99); products.save(product);
            }
            category(categories, "Sunglasses", vision);
            var glasses = category(categories, "Shooting Glasses", vision);
            category(categories, "Prescription Lenses", vision); category(categories, "Misc", vision);
            String[] colors={"Purple","Orange","Yellow"}, pictures={"19cin.png","30cmos.png","58cip.webp"};
            for (int i=1;i<=20;i++) {
                var product=new Product(); product.setName("Shooting Glasses Item " + i); product.setCategory(glasses);
                product.setDescription("Sample lens listing. Use Store management to edit its name, options and price.");
                int sizeIndex=0;
                for(String size:new String[]{"Small","Medium","Large"}) {
                    int options=2+(i+sizeIndex)%2;
                    for(int j=0;j<options;j++) { int color=(i+j+sizeIndex)%3;
                        variant(product,"PREVIEW-"+i+"-"+size+"-"+colors[color],size,colors[color],"/assets/images/products/vision/pilla/"+pictures[color],199);
                    }
                    sizeIndex++;
                }
                products.save(product);
            }
            var country=new Country(); country.setCode("US"); country.setName("United States"); countries.save(country);
            for(String name:new String[]{"Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut","Delaware","District of Columbia","Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa","Kansas","Kentucky","Louisiana","Maine","Maryland","Massachusetts","Michigan","Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada","New Hampshire","New Jersey","New Mexico","New York","North Carolina","North Dakota","Ohio","Oklahoma","Oregon","Pennsylvania","Rhode Island","South Carolina","South Dakota","Tennessee","Texas","Utah","Vermont","Virginia","Washington","West Virginia","Wisconsin","Wyoming"}) { var state=new State(); state.setName(name); state.setCountry(country); states.save(state); }
        };
    }
    private static ProductCategory category(ProductCategoryRepository repo,String name,ProductCategory parent) {
        var category=new ProductCategory(); category.setCategoryName(name); category.setParent(parent); return repo.save(category);
    }
    private static void variant(Product product,String sku,String size,String color,String image,int price) {
        var v=new ProductVariant(); v.setProduct(product); v.setSku(sku); v.setUnitPrice(BigDecimal.valueOf(price));
        v.setActive(true); v.setUnitsInStock(10); v.setImageUrl(image); v.setOptions(Map.of("Size",size,"Color",color)); product.getVariants().add(v);
    }
}
