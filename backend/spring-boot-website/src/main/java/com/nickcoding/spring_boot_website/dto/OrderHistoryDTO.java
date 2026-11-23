package com.nickcoding.spring_boot_website.dto;

import java.math.BigDecimal;
import java.util.Date;

public record OrderHistoryDTO(Long id, String orderTrackingNumber, BigDecimal totalPrice,
                              int totalQuantity, Date dateCreated, String status, String currency) {}
