package com.nickcoding.spring_boot_website.dto;

import com.nickcoding.spring_boot_website.entity.Address;
import com.nickcoding.spring_boot_website.entity.Customer;
import com.nickcoding.spring_boot_website.entity.Order;
import com.nickcoding.spring_boot_website.entity.OrderItem;
import lombok.Data;

import java.util.Set;

@Data
public class Purchase {

    private Customer customer;
    private Address shippingAddress;
    private Address billingAddress;
    private Order order;
    private Set<OrderItem> orderItems;

}
