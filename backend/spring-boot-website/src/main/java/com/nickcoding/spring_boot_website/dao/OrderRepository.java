package com.nickcoding.spring_boot_website.dao;

import com.nickcoding.spring_boot_website.entity.Order;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.repository.query.Param;
import org.springframework.data.rest.core.annotation.RepositoryRestResource;

@RepositoryRestResource(exported = false)
public interface OrderRepository extends JpaRepository<Order, Long> {
    @org.springframework.data.rest.core.annotation.RestResource(exported = false)
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    java.util.Optional<Order> findByCheckoutToken(String checkoutToken);

    interface PaymentRecoveryCandidate {
        Long getId();
        String getCheckoutToken();
    }

    @org.springframework.data.rest.core.annotation.RestResource(exported = false)
    @org.springframework.data.jpa.repository.Query("""
        select o.id as id, o.checkoutToken as checkoutToken from Order o
        where o.status in :statuses and o.checkoutToken is not null and o.id > :afterId
          and (o.paymentIntentId is not null or o.dateCreated < :expiredBefore)
        order by o.id
        """)
    java.util.List<PaymentRecoveryCandidate> findPaymentRecoveryCandidates(
        @Param("statuses") java.util.Collection<String> statuses,
        @Param("afterId") long afterId, @Param("expiredBefore") java.util.Date expiredBefore, Pageable pageable);

    Page<Order> findByOwnerIssuerAndOwnerSubject(String ownerIssuer, String ownerSubject, Pageable pageable);

    java.util.Optional<Order> findByIdAndOwnerIssuerAndOwnerSubject(Long id, String ownerIssuer, String ownerSubject);
}
