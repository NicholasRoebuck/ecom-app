package com.nickcoding.spring_boot_website.config;

import com.nickcoding.spring_boot_website.entity.*;
import jakarta.persistence.EntityManager;
import jakarta.persistence.metamodel.EntityType;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.rest.core.config.RepositoryRestConfiguration;
import org.springframework.data.rest.webmvc.config.RepositoryRestConfigurer;
import org.springframework.http.HttpMethod;
import org.springframework.web.servlet.config.annotation.CorsRegistry;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

@Configuration
public class MyDataRestConfig implements RepositoryRestConfigurer {

    @Value("${allowed.origins}")
    private String[] allowedOrigins;

    private EntityManager entityManager;

    @Autowired
    public MyDataRestConfig(EntityManager entityManager){
        this.entityManager = entityManager;
    }


    @Override
    public void configureRepositoryRestConfiguration(RepositoryRestConfiguration config, CorsRegistry cors) {
        RepositoryRestConfigurer.super.configureRepositoryRestConfiguration(config, cors);

        HttpMethod[] unsupportedHttpMethods = {HttpMethod.PUT, HttpMethod.POST, HttpMethod.DELETE, HttpMethod.PATCH};

        // disable methods for Product: post, put, delete
        disableHttpMethods(Product.class, config, unsupportedHttpMethods);
        disableHttpMethods(ProductCategory.class, config, unsupportedHttpMethods);
        disableHttpMethods(Country.class, config, unsupportedHttpMethods);
        disableHttpMethods(State.class, config, unsupportedHttpMethods);
        disableHttpMethods(Order.class, config, unsupportedHttpMethods);

        // call internal helper method to expose entity ids
        exposeIds(config);

        // configure cors mapping
        cors.addMapping(config.getBasePath() + "/**").allowedOrigins(allowedOrigins);
    }

    private static void disableHttpMethods(Class<?> theClass, RepositoryRestConfiguration config, HttpMethod[] unsupportedHttpMethods) {
        config.getExposureConfiguration()
                .forDomainType(theClass)
                .withItemExposure(((metdata, httpMethods) -> httpMethods.disable(unsupportedHttpMethods)))
                .withCollectionExposure((metdata, httpMethods) -> httpMethods.disable(unsupportedHttpMethods));
    }

    private void exposeIds(RepositoryRestConfiguration config) {
        // expose entity ids

        // get a lst of all entity classes from entity manager
        Set<EntityType<?>> entityTypes = entityManager.getMetamodel().getEntities();

        // create an array of the entity types
        List<Class<?>> entityClasses = new ArrayList<>();

        // get the entity types for the entities
        for(EntityType<?> entityType : entityTypes){
            entityClasses.add(entityType.getJavaType());
        }

        // expose the entity ids for the array of entity domain types
        Class<?>[] domainTypes = entityClasses.toArray(new Class[0]);
        config.exposeIdsFor(domainTypes);
    }
}
