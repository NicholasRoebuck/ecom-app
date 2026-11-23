package com.nickcoding.spring_boot_website.controller;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequestMapping("/api/admin")
public class AdminAccessController {
    @GetMapping("/access")
    public ResponseEntity<Map<String, String>> access() {
        // SecurityConfiguration verifies the owner before any /api/admin request reaches a controller.
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(Map.of("access", "owner"));
    }
}
