package com.nickcoding.spring_boot_website.service;

import com.nickcoding.spring_boot_website.dto.Purchase;
import com.nickcoding.spring_boot_website.dto.PurchaseResponse;

public interface CheckoutService {

    PurchaseResponse placeOrder(Purchase purchase);
}
