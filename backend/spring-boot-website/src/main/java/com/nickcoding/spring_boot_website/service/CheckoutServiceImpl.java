package com.nickcoding.spring_boot_website.service;

import com.nickcoding.spring_boot_website.dao.CustomerRepository;
import com.nickcoding.spring_boot_website.dao.OrderRepository;
import com.nickcoding.spring_boot_website.dto.*;
import com.nickcoding.spring_boot_website.entity.*;
import com.stripe.exception.StripeException;
import com.stripe.model.PaymentIntent;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import java.math.BigDecimal;
import java.util.*;

@Service
public class CheckoutServiceImpl implements CheckoutService {
    private final CustomerRepository customers;
    private final OrderRepository orders;
    private final CheckoutPricingService pricing;
    private final StripePaymentGateway payments;
    private final OrderPaymentService reconciliation;
    private final CheckoutInventoryService inventory;

    public CheckoutServiceImpl(CustomerRepository customers, OrderRepository orders,
                               CheckoutPricingService pricing, StripePaymentGateway payments, OrderPaymentService reconciliation, CheckoutInventoryService inventory) {
        this.customers = customers;
        this.orders = orders;
        this.pricing = pricing;
        this.payments = payments;
        this.reconciliation = reconciliation;
        this.inventory = inventory;
    }

    @Override
    @Transactional
    public CheckoutSummary review(CheckoutRequest request, OrderOwner owner) {
        if (request == null) throw CheckoutPricingService.badRequest("Checkout details are required.");
        validateToken(request.requestId());
        // The random request ID is also a capability: retries return the original immutable snapshot.
        Optional<Order> existing = orders.findByCheckoutToken(request.requestId());
        if (existing.isPresent()) { requireOwner(existing.get(), owner); return summary(existing.get()); }
        CheckoutValidation.review(request);
        Address shipping = address(request.shippingAddress());
        Address billing = address(request.billingAddress());
        List<CheckoutSummary.Line> lines = pricing.price(request.items());
        Order order = new Order();
        if (owner != null) {
            order.setOwnerIssuer(owner.issuer());
            order.setOwnerSubject(owner.subject());
        }
        order.setCheckoutToken(request.requestId());
        order.setOrderTrackingNumber(UUID.randomUUID().toString());
        order.setStatus("PENDING");
        order.setCurrency("usd");
        order.setTotalPrice(lines.stream().map(CheckoutSummary.Line::subtotal).reduce(BigDecimal.ZERO, BigDecimal::add));
        if (order.getTotalPrice().compareTo(new BigDecimal("0.50")) < 0 || order.getTotalPrice().compareTo(new BigDecimal("999999.99")) > 0) throw new CheckoutValidationException(Map.of("items", "Order total must be between $0.50 and $999,999.99 USD."));
        order.setTotalQuantity(lines.stream().mapToInt(CheckoutSummary.Line::quantity).sum());
        order.setShippingAddress(shipping);
        order.setBillingAddress(billing);
        for (CheckoutSummary.Line line : lines) {
            OrderItem item = new OrderItem();
            item.setVariantId(line.variantId());
            item.setSku(line.sku());
            item.setProductName(line.name());
            item.setImageUrl(line.imageUrl());
            item.setUnitPrice(line.unitPrice());
            item.setQuantity(line.quantity());
            // Retain the legacy product ID for existing order consumers.
            item.setProductId(line.productId());
            order.add(item);
        }
        inventory.reserve(order);
        Customer customer = customers.findFirstByEmailAndFirstNameAndLastName(request.customer().email().trim(),
                request.customer().firstName().trim(), request.customer().lastName().trim());
        if (customer == null) {
            customer = new Customer();
            customer.setFirstName(request.customer().firstName().trim());
            customer.setLastName(request.customer().lastName().trim());
            customer.setEmail(request.customer().email().trim());
            customer = customers.save(customer);
        }
        order.setCustomer(customer);
        orders.saveAndFlush(order);
        PaymentLog.transition(order.getId(), null, "PENDING");
        return summary(order);
    }


    @Override
    @Transactional(rollbackFor = Exception.class)
    public CheckoutPaymentResponse createPaymentIntent(String token) throws StripeException {
        Order order = findOrder(token);
        if (!OrderPaymentService.RECOVERABLE.contains(order.getStatus())) throw conflict("This checkout is no longer awaiting payment. Check payment status.");
        boolean created = order.getPaymentIntentId() == null;
        try {
            PaymentIntent intent;
            if (order.getPaymentIntentId() == null) {
                if (order.getDateCreated() != null && order.getDateCreated().toInstant().isBefore(java.time.Instant.now().minusSeconds(1800)))
                    throw conflict("This checkout has expired. Cancel it and review current prices.");
                inventory.reserve(order);
                intent = payments.create(amount(order), order.getCustomer().getEmail(), token);
                order.setPaymentIntentId(intent.getId());
                orders.saveAndFlush(order);
            } else {
                intent = payments.retrieve(order.getPaymentIntentId());
            }
            verifyIdentity(order, intent);
            PaymentLog.paymentIntent(order.getId(), created);
            return new CheckoutPaymentResponse(intent.getClientSecret());
        } catch (StripeException | RuntimeException ex) {
            PaymentLog.failed("payment_intent_failed", order.getId(), ex);
            throw ex;
        }
    }

    @Override
    public PurchaseResponse placeOrder(String token) throws StripeException {
        validateToken(token);
        // Throw only after the reconciliation transaction commits, so processing/decline states persist.
        var result = reconciliation.reconcile(token, null);
        if (!"PAID".equals(result.status()))
            throw conflict("Payment is not complete. Please check the payment status before trying again.");
        return new PurchaseResponse(result.orderTrackingNumber());
    }
    @Transactional
    public CheckoutSummary resume(String token) throws StripeException {
        validateToken(token);
        reconciliation.reconcile(token, null);
        return summary(findOrder(token));
    }

    @Transactional(rollbackFor = Exception.class)
    public void cancel(String token) throws StripeException {
        Order order = findOrder(token);
        if ("CANCELLED".equals(order.getStatus())) return;
        if ("PAID".equals(order.getStatus())) throw conflict("This order is paid. Check payment status to view confirmation.");
        if (order.getPaymentIntentId() != null) {
            PaymentIntent intent = payments.retrieve(order.getPaymentIntentId());
            verifyIdentity(order, intent);
            if ("succeeded".equals(intent.getStatus()) || "processing".equals(intent.getStatus()) || "requires_capture".equals(intent.getStatus()))
                throw conflict("Payment is complete or processing. Check payment status before continuing.");
            if (!"canceled".equals(intent.getStatus())) payments.cancel(intent.getId());
        }
        inventory.release(order);
        String previous = order.getStatus();
        order.setStatus("CANCELLED");
        orders.save(order);
        PaymentLog.transition(order.getId(), previous, "CANCELLED");
    }


    @Override
    @Transactional
    public void authorize(String token, OrderOwner owner) {
        requireOwner(findOrder(token), owner);
    }

    @Override
    @Transactional
    public CheckoutDetails details(String token, OrderOwner owner) {
        if (owner == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Sign in to restore checkout details.");
        Order order = findOrder(token);
        requireOwner(order, owner);
        if (order.getOwnerIssuer() == null || order.getOwnerSubject() == null)
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Guest checkout details cannot be restored.");
        Customer customer = order.getCustomer();
        return new CheckoutDetails(new CheckoutRequest.Contact(customer.getFirstName(), customer.getLastName(), customer.getEmail()),
                deliveryDetails(order.getShippingAddress()), deliveryDetails(order.getBillingAddress()));
    }

    private CheckoutRequest.DeliveryAddress deliveryDetails(Address address) {
        return new CheckoutRequest.DeliveryAddress(address.getStreet(), address.getCity(), address.getState(),
                address.getCountry(), address.getZipCode());
    }

    private void requireOwner(Order order, OrderOwner owner) {
        if (order.getOwnerSubject() == null && order.getOwnerIssuer() == null) return;
        if (owner == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Sign in to recover this checkout.");
        if (!Objects.equals(order.getOwnerIssuer(), owner.issuer()) || !Objects.equals(order.getOwnerSubject(), owner.subject()))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "This checkout belongs to another account.");
    }

    private Order findOrder(String token) {
        validateToken(token);
        return orders.findByCheckoutToken(token)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Checkout not found."));
    }

    private void verifyIdentity(Order order, PaymentIntent intent) {
        if (!Objects.equals(intent.getId(), order.getPaymentIntentId()) || !Objects.equals(intent.getAmount(), amount(order)) || !order.getCurrency().equals(intent.getCurrency())
                || intent.getMetadata() == null
                || !order.getCheckoutToken().equals(intent.getMetadata().get("checkout_token"))) {
            throw conflict("The payment does not match this order.");
        }
    }

    private long amount(Order order) { return order.getTotalPrice().movePointRight(2).longValueExact(); }

    private CheckoutSummary summary(Order order) {
        List<CheckoutSummary.Line> lines = order.getOrderItems().stream()
                .sorted(Comparator.comparing(OrderItem::getVariantId))
                .map(item -> new CheckoutSummary.Line(item.getVariantId(), item.getProductId(), item.getSku(), item.getProductName(),
                        item.getImageUrl(), item.getUnitPrice(), item.getQuantity(),
                        item.getUnitPrice().multiply(BigDecimal.valueOf(item.getQuantity())))).toList();
        return new CheckoutSummary(order.getCheckoutToken(), order.getOrderTrackingNumber(), order.getStatus(),
                order.getCurrency(), order.getTotalPrice(), order.getTotalQuantity(), lines);
    }

    private void validateToken(String token) {
        if (token == null || !token.matches("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}"))
            throw new CheckoutValidationException(Map.of("requestId", "A valid checkout request ID is required."));
    }

    private void validateContact(CheckoutRequest.Contact contact) {
        if (contact == null || !text(contact.firstName(), 100) || !text(contact.lastName(), 100)
                || !text(contact.email(), 254) || !contact.email().trim().matches("[^\\s@]+@[^\\s@]+\\.[^\\s@]+"))
            throw CheckoutPricingService.badRequest("A name and valid email address are required.");
    }

    private Address address(CheckoutRequest.DeliveryAddress input) {
        if (input == null || !text(input.street(), 255) || !text(input.city(), 100)
                || !text(input.state(), 100) || !text(input.country(), 100) || !text(input.zipCode(), 30))
            throw CheckoutPricingService.badRequest("Complete shipping and billing addresses are required.");
        Address address = new Address();
        address.setStreet(input.street().trim()); address.setCity(input.city().trim());
        address.setState(input.state().trim()); address.setCountry(input.country().trim());
        address.setZipCode(input.zipCode().trim());
        return address;
    }

    private boolean text(String value, int max) { return value != null && !value.isBlank() && value.length() <= max; }
    private ResponseStatusException conflict(String message) { return new ResponseStatusException(HttpStatus.CONFLICT, message); }
}
