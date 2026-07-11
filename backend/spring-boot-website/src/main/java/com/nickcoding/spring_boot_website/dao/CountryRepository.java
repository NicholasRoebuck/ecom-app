package com.nickcoding.spring_boot_website.dao;

import com.nickcoding.spring_boot_website.entity.Country;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.rest.core.annotation.RepositoryRestResource;
import org.springframework.web.bind.annotation.CrossOrigin;

@RepositoryRestResource(path = "countries", collectionResourceRel = "countries")
public interface CountryRepository  extends JpaRepository<Country, Integer> {
}
