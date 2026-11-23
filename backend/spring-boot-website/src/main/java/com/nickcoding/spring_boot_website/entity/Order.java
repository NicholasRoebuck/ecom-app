package com.nickcoding.spring_boot_website.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.util.Date;
import java.util.HashSet;
import java.util.Set;

@Entity
@Table(name = "orders", indexes = @Index(name = "idx_orders_owner", columnList = "owner_issuer,owner_subject"))
@Getter
@Setter
public class Order {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "order_tracking_number")
    private String orderTrackingNumber;

    @Column(name = "total_quantity")
    private int totalQuantity;

    @Column(name = "total_price")
    private BigDecimal totalPrice;

    @com.fasterxml.jackson.annotation.JsonIgnore
    @Column(name = "checkout_token", unique = true, length = 36)
    private String checkoutToken;

    @com.fasterxml.jackson.annotation.JsonIgnore
    @Column(name = "payment_intent_id", unique = true)
    private String paymentIntentId;

    @com.fasterxml.jackson.annotation.JsonIgnore
    @Column(name = "owner_issuer", length = 255)
    private String ownerIssuer;

    @com.fasterxml.jackson.annotation.JsonIgnore
    @Column(name = "owner_subject", length = 255)
    private String ownerSubject;

    @Column(name = "currency", length = 3)
    private String currency;

    @com.fasterxml.jackson.annotation.JsonIgnore
    @Column(name = "inventory_status", nullable = false, length = 16)
    private String inventoryStatus = "NONE";

    @Column(name = "status")
    private String status;

    @Column(name = "date_created")
    @CreationTimestamp
    private Date dateCreated;

    @Column(name = "last_updated")
    @UpdateTimestamp
    private Date lastUpdated;

    @ManyToOne
    @JoinColumn(name = "customer_id")
    private Customer customer;

    @OneToOne(cascade = CascadeType.ALL)
    @JoinColumn(name = "shipping_address_id", referencedColumnName = "id")
    private Address shippingAddress;

    @OneToOne(cascade = CascadeType.ALL)
    @JoinColumn(name = "billing_address_id", referencedColumnName = "id")
    private Address billingAddress;

    @OneToMany(cascade = CascadeType.ALL, mappedBy = "order")
    private Set<OrderItem> orderItems;

    public void add(OrderItem theItem){
        if (theItem != null){
            if (orderItems == null){
                orderItems = new HashSet<>();
            }
            orderItems.add(theItem);
            theItem.setOrder(this);
        }
    }
}
