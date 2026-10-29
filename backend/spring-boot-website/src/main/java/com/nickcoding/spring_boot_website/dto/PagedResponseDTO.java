package com.nickcoding.spring_boot_website.dto;

import org.springframework.data.domain.Page;

import java.util.List;

public class PagedResponseDTO<T> {

    private List<T> content;
    private PageInfo page;

    public PagedResponseDTO(List<T> content, PageInfo page) {
        this.content = content;
        this.page = page;
    }

    public static <T> PagedResponseDTO<T> from(Page<?> sourcePage, List<T> mappedContent) {
        PageInfo info = new PageInfo(
                sourcePage.getSize(),
                sourcePage.getTotalElements(),
                sourcePage.getTotalPages(),
                sourcePage.getNumber()
        );
        return new PagedResponseDTO<>(mappedContent, info);
    }

    public List<T> getContent() {
        return content;
    }

    public PageInfo getPage() {
        return page;
    }

    public static class PageInfo {
        private int size;
        private long totalElements;
        private int totalPages;
        private int number;

        public PageInfo(int size, long totalElements, int totalPages, int number) {
            this.size = size;
            this.totalElements = totalElements;
            this.totalPages = totalPages;
            this.number = number;
        }

        public int getSize() {
            return size;
        }

        public long getTotalElements() {
            return totalElements;
        }

        public int getTotalPages() {
            return totalPages;
        }

        public int getNumber() {
            return number;
        }
    }
}