package com.nickcoding.spring_boot_website.controller;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.*;
import java.util.Map;
@Controller
@Profile("render-preview")
public class RenderPreviewController {
    @GetMapping("/api/preview-health") @ResponseBody public Map<String,Object> health() {
        return Map.of("status","ok","mode","owner-preview","dataResetsOnRestart",true);
    }
    @GetMapping({"/home","/products","/products/{id}","/category","/category/{id}","/search/{keyword}","/help","/admin","/admin-access","/members","/order-history","/checkout","/cart-details","/login/callback"})
    public String app() { return "forward:/index.html"; }
}
