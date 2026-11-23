package com.nickcoding.spring_boot_website.dto;
import java.util.List;
public record CatalogFilterOptions(List<Option> options) {
    public record Option(String name, List<String> values) {}
}
