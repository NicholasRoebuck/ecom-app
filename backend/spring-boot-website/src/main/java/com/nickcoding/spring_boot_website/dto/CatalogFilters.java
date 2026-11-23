package com.nickcoding.spring_boot_website.dto;
import org.springframework.http.HttpStatus;
import org.springframework.util.MultiValueMap;
import org.springframework.web.server.ResponseStatusException;
import java.math.BigDecimal;
import java.util.*;

public record CatalogFilters(BigDecimal minPrice, BigDecimal maxPrice, boolean inStock, Map<String,String> options) {
    public CatalogFilters {
        options = options == null ? Map.of() : Map.copyOf(options);
        for (BigDecimal price : new BigDecimal[]{minPrice,maxPrice})
            if (price != null && (price.signum()<0 || price.compareTo(new BigDecimal("99999999.99"))>0 || price.stripTrailingZeros().scale()>2))
                throw invalid("Invalid USD price filter.");
        if (minPrice != null && maxPrice != null && minPrice.compareTo(maxPrice)>0) throw invalid("Minimum price exceeds maximum price.");
        if (options.size()>20) throw invalid("Too many option filters.");
        options.forEach((key,value)->{if(key.isBlank() || key.length()>64 || value.isBlank() || value.length()>128) throw invalid("Invalid option filter.");});
    }
    public boolean isEmpty(){return minPrice==null && maxPrice==null && !inStock && options.isEmpty();}
    public static CatalogFilters from(MultiValueMap<String,String> query){
        Map<String,String> options=new TreeMap<>();
        query.keySet().stream().filter(key->key.startsWith("option.")).forEach(key->options.put(key.substring(7),single(query,key)));
        String stock=single(query,"inStock");
        if(stock!=null && !List.of("true","false").contains(stock)) throw invalid("Invalid stock filter.");
        return new CatalogFilters(price(single(query,"minPrice")),price(single(query,"maxPrice")),"true".equals(stock),options);
    }
    private static String single(MultiValueMap<String,String> query,String key){
        List<String> values=query.get(key); if(values==null)return null;
        if(values.size()!=1)throw invalid("A filter may only have one value."); return values.getFirst();
    }
    private static BigDecimal price(String value){
        if(value==null)return null;
        try{return new BigDecimal(value);}catch(NumberFormatException ex){throw invalid("Invalid price filter.");}
    }
    private static ResponseStatusException invalid(String message){return new ResponseStatusException(HttpStatus.BAD_REQUEST,message);}
}
