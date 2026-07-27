package com.nickcoding.spring_boot_website.dao;

import lombok.Data;

@Data
public class PaymentInfo {

    private int amount;
    private String currency;
    private String receiptEmail;
}
