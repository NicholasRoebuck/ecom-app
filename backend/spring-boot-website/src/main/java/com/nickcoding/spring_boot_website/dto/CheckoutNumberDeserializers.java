package com.nickcoding.spring_boot_website.dto;

import com.fasterxml.jackson.core.*;
import com.fasterxml.jackson.databind.*;
import java.io.IOException;

public final class CheckoutNumberDeserializers {
    private CheckoutNumberDeserializers() {}
    public static class Quantity extends JsonDeserializer<Integer> {
        @Override public Integer deserialize(JsonParser parser, DeserializationContext context) throws IOException {
            if (!parser.hasToken(JsonToken.VALUE_NUMBER_INT))
                return context.reportInputMismatch(Integer.class, "Quantity must be a whole number.");
            return parser.getIntValue();
        }
    }
    public static class VariantId extends JsonDeserializer<Long> {
        @Override public Long deserialize(JsonParser parser, DeserializationContext context) throws IOException {
            if (!parser.hasToken(JsonToken.VALUE_NUMBER_INT))
                return context.reportInputMismatch(Long.class, "Variation ID must be a whole number.");
            return parser.getLongValue();
        }
    }
}
