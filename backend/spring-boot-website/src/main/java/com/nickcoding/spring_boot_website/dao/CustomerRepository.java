package com.nickcoding.spring_boot_website.dao;

import com.nickcoding.spring_boot_website.entity.Customer;
import org.springframework.data.jpa.repository.JpaRepository;

@org.springframework.data.rest.core.annotation.RepositoryRestResource(exported = false)
public interface CustomerRepository extends JpaRepository<Customer, Long> {

    Customer findFirstByEmailAndFirstNameAndLastName(String email, String firstName, String lastName);
}
