package com.nickcoding.spring_boot_website.controller;
import org.springframework.context.annotation.Profile;
import org.springframework.web.bind.annotation.*;
import java.util.Map;
@RestController
@Profile("render-smoke")
public class RenderSmokeController {
    @GetMapping("/api/preview-health") public Map<String,Object> health() {
        return Map.of("status", "ok", "mode", "temporary-render-capacity-test", "dataResetsOnRestart", true,
            "checkoutEnabled", false, "catalogUrl", "/api/products?page=0&size=12");
    }
}
