package com.nickcoding.spring_boot_website;
import com.nickcoding.spring_boot_website.config.RenderPreviewConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.web.servlet.MockMvc;
import javax.sql.DataSource;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
@SpringBootTest(properties={"spring.datasource.url=jdbc:mysql://invalid.example/never-connect", "checkout.reconciliation.enabled=false", "app.owner.issuer=https://owner.example.test/", "app.owner.subject=owner-Subject"})
@ActiveProfiles("render-preview")
@AutoConfigureMockMvc
class RenderPreviewIntegrationTest {
 @Autowired MockMvc http;
 @Autowired DataSource source;
 @MockitoBean JwtDecoder decoder;
 @Test void disposableCatalogIncludesProductsAndAddressChoices() throws Exception {
  try(var connection=source.getConnection()) { assertTrue(connection.getMetaData().getURL().startsWith("jdbc:h2:mem:")); }
  http.perform(get("/api/products?size=48")).andExpect(status().isOk()).andExpect(jsonPath("$.page.totalElements").value(24));
  http.perform(get("/api/countries")).andExpect(status().isOk()).andExpect(jsonPath("$._embedded.countries[0].code").value("US"));
  http.perform(get("/api/states/search/findByCountryCode?code=US&size=60")).andExpect(status().isOk()).andExpect(jsonPath("$._embedded.states.length()").value(51));
 }
 @Test void protectsAdministrationAndDisablesUnconfiguredPayments() throws Exception {
  http.perform(get("/api/admin/products")).andExpect(status().isUnauthorized());
  http.perform(post("/api/checkout/review").contentType("application/json").content("{}")).andExpect(status().isServiceUnavailable());
  http.perform(get("/api/preview-health")).andExpect(status().isOk()).andExpect(jsonPath("$.dataResetsOnRestart").value(true));
 }
 @Test void supportsDirectStorefrontLinks() throws Exception {
  http.perform(get("/products/1")).andExpect(status().isOk()).andExpect(forwardedUrl("/index.html"));
 }
 @Test void onlyConfiguredOwnerCanManagePreview() throws Exception {
  var jwt=org.springframework.security.oauth2.jwt.Jwt.withTokenValue("owner").header("alg","RS256")
   .issuer("https://owner.example.test/").subject("owner-Subject").build();
  org.mockito.Mockito.when(decoder.decode("owner")).thenReturn(jwt);
  http.perform(get("/api/admin/products").header("Authorization","Bearer owner")).andExpect(status().isOk());
  var customer=org.springframework.security.oauth2.jwt.Jwt.withTokenValue("customer").header("alg","RS256")
   .issuer("https://owner.example.test/").subject("customer").build();
  org.mockito.Mockito.when(decoder.decode("customer")).thenReturn(customer);
  http.perform(get("/api/admin/products").header("Authorization","Bearer customer")).andExpect(status().isForbidden());
 }
 @Test void refusesLivePaymentKeys() {
  assertThrows(IllegalStateException.class,()->RenderPreviewConfiguration.requireTestKey("sk_live_example"));
  assertThrows(IllegalStateException.class,()->RenderPreviewConfiguration.requireTestKey(""));
  assertDoesNotThrow(()->RenderPreviewConfiguration.requireTestKey("sk_test_example"));
 }
}
