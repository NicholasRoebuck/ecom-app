package com.nickcoding.spring_boot_website.dao;

import com.nickcoding.spring_boot_website.entity.Customer;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CustomerRepository extends JpaRepository<Customer, Long> {

    Customer findByEmail(String email);
}
