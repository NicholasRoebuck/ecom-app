package com.nickcoding.spring_boot_website.service;
import com.nickcoding.spring_boot_website.dao.ProductRepository;
import com.nickcoding.spring_boot_website.dto.*;
import com.nickcoding.spring_boot_website.entity.*;
import jakarta.persistence.EntityManager;
import jakarta.persistence.Tuple;
import jakarta.persistence.criteria.*;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.*;

@Service
@Transactional(readOnly=true)
public class CatalogFilterService {
    private final ProductRepository products;
    private final ProductQueryService catalog;
    private final EntityManager em;
    public CatalogFilterService(ProductRepository products,ProductQueryService catalog,EntityManager em){this.products=products;this.catalog=catalog;this.em=em;}
    public PagedResponseDTO<ProductSummaryDTO> search(Long categoryId,boolean descendants,String name,int page,int size,String sort,CatalogFilters filters){
        List<Long> ids=categoryIds(categoryId,descendants);
        PageRequest pageable=catalog.catalogPage(page,size,sort);
        if(pageable.getSort().isUnsorted())pageable=PageRequest.of(page,size,Sort.by("id"));
        Specification<Product> specification=(root,query,cb)->{
            Subquery<Long> available=query.subquery(Long.class);
            Root<ProductVariant> variant=available.from(ProductVariant.class);
            List<Predicate> predicates=new ArrayList<>();
            predicates.add(cb.equal(variant.get("product"),root));predicates.add(cb.isTrue(variant.get("active")));
            if(filters.minPrice()!=null)predicates.add(cb.greaterThanOrEqualTo(variant.get("unitPrice"),filters.minPrice()));
            if(filters.maxPrice()!=null)predicates.add(cb.lessThanOrEqualTo(variant.get("unitPrice"),filters.maxPrice()));
            if(filters.inStock())predicates.add(cb.greaterThan(variant.get("unitsInStock"),0));
            // All selected conditions must match the SAME variant.
            filters.options().forEach((key,value)->{
                MapJoin<ProductVariant,String,String> option=variant.joinMap("options");
                predicates.add(cb.equal(option.key(),key));predicates.add(cb.equal(option.value(),value));
            });
            available.select(variant.get("id")).where(predicates.toArray(Predicate[]::new));
            return cb.and(scope(root,cb,ids,name),cb.exists(available));
        };
        return catalog.toPagedDTO(products.findAll(specification,pageable));
    }
    public CatalogFilterOptions options(Long categoryId,boolean descendants,String name){
        CriteriaBuilder cb=em.getCriteriaBuilder();CriteriaQuery<Tuple> query=cb.createTupleQuery();Root<Product> root=query.from(Product.class);
        Join<Product,ProductVariant> variant=root.join("variants");MapJoin<ProductVariant,String,String> option=variant.joinMap("options");
        query.multiselect(option.key(),option.value()).distinct(true)
            .where(scope(root,cb,categoryIds(categoryId,descendants),name),cb.isTrue(variant.get("active")))
            .orderBy(cb.asc(option.key()),cb.asc(option.value()));
        Map<String,List<String>> groups=new TreeMap<>();
        for(Tuple row:em.createQuery(query).getResultList())groups.computeIfAbsent(row.get(0,String.class),key->new ArrayList<>()).add(row.get(1,String.class));
        return new CatalogFilterOptions(groups.entrySet().stream().map(entry->new CatalogFilterOptions.Option(entry.getKey(),List.copyOf(entry.getValue()))).toList());
    }
    private List<Long> categoryIds(Long id,boolean descendants){return id==null?null:descendants?catalog.getCategoryTreeIds(id):List.of(id);}
    private Predicate scope(Root<Product> root,CriteriaBuilder cb,List<Long> ids,String name){
        List<Predicate> predicates=new ArrayList<>();
        if(ids!=null)predicates.add(root.get("category").get("id").in(ids));
        if(name!=null){String escaped=name.replace("\\","\\\\").replace("%","\\%").replace("_","\\_");predicates.add(cb.like(root.get("name"),"%"+escaped+"%",'\\'));}
        return cb.and(predicates.toArray(Predicate[]::new));
    }
}
