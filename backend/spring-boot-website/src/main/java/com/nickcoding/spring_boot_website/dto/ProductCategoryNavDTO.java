package com.nickcoding.spring_boot_website.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@AllArgsConstructor
public class ProductCategoryNavDTO {
    private Long id;
    private String categoryName;
    private boolean hasChildren;
}