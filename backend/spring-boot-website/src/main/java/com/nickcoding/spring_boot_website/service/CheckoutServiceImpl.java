package com.nickcoding.spring_boot_website.service;

import com.nickcoding.spring_boot_website.dao.CustomerRepository;
import com.nickcoding.spring_boot_website.dto.Purchase;
import com.nickcoding.spring_boot_website.dto.PurchaseResponse;
import com.nickcoding.spring_boot_website.entity.Customer;
import com.nickcoding.spring_boot_website.entity.Order;
import com.nickcoding.spring_boot_website.entity.OrderItem;
import jakarta.transaction.Transactional;
import org.springframework.stereotype.Service;

import java.util.Set;
import java.util.UUID;

@Service
public class CheckoutServiceImpl implements CheckoutService{

    private CustomerRepository customerRepository;

    public CheckoutServiceImpl(CustomerRepository customerRepository){
        this.customerRepository = customerRepository;
    }

    @Override
    @Transactional
    public PurchaseResponse placeOrder(Purchase purchase) {
        // retrieve the order info from dto
        Order order = purchase.getOrder();

        // generate tracking number
        String orderTrackingNumber = generateOrderTrackingNumber();
        order.setOrderTrackingNumber(orderTrackingNumber);

        // populate order with orderItem
        Set<OrderItem> orderItems = purchase.getOrderItems();
        orderItems.forEach(item -> order.add(item));

        // populate order with billingAddress and shippingAdress
        order.setShippingAddress(purchase.getShippingAddress());
        order.setBillingAddress(purchase.getBillingAddress());

        // populate customer with order
        Customer customer = purchase.getCustomer();

        // check if the customer exists
        String customerEmail = customer.getEmail();

        Customer existingCustomer = customerRepository.findByEmail(customerEmail);

        if (existingCustomer != null){
            // found the customer
            customer = existingCustomer;
        }

        customer.add(order);

        // save to the db
        customerRepository.save(customer);

        // return a response
        return new PurchaseResponse(orderTrackingNumber);
    }

    private String generateOrderTrackingNumber() {
        // create a random UUID (UUID version 4)
        return UUID.randomUUID().toString();
    }
}
