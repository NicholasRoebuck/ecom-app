import java.nio.file.*;
import java.sql.*;
import java.util.*;

class VariantOptionsSchema {
    public static void main(String[] args) throws Exception {
        Properties settings = new Properties();
        try (var input = Files.newInputStream(Path.of("src/main/resources/application.properties"))) { settings.load(input); }
        String url = settings.getProperty("spring.datasource.url", "");
        if (!url.startsWith("jdbc:mysql://localhost:") && !url.startsWith("jdbc:mysql://127.0.0.1:"))
            throw new IllegalStateException("This helper only supports the local development database.");
        try (var connection = DriverManager.getConnection(url, settings.getProperty("spring.datasource.username"),
                settings.getProperty("spring.datasource.password"))) {
            boolean table;
            try (var result = connection.getMetaData().getTables(connection.getCatalog(), null, "product_variant_option", null)) { table = result.next(); }
            String idType;
            try (var query = connection.prepareStatement("select column_type from information_schema.columns where table_schema=database() and table_name='product_variant' and column_name='id'");
                 var result = query.executeQuery()) { if (!result.next()) throw new IllegalStateException("Variant ID column missing."); idType = result.getString(1); }
            if (!idType.toLowerCase(Locale.ROOT).matches("bigint(\\([0-9]+\\))?( unsigned)?")) throw new IllegalStateException("Unexpected variant ID type.");
            boolean text;
            try (var query = connection.prepareStatement("select data_type from information_schema.columns where table_schema=database() and table_name='order_item' and column_name='product_name'");
                 var result = query.executeQuery()) { text = result.next() && "text".equalsIgnoreCase(result.getString(1)); }
            if (table && text) { System.out.println("Variant options schema is installed."); return; }
            if (args.length == 0 || !"--apply".equals(args[0])) { System.out.println("Variant options migration is required."); return; }
            String sql = Files.readString(Path.of("product-variant-options-migration.sql")).replaceAll("(?m)^--.*$", "")
                    .replace("variant_id BIGINT NOT NULL", "variant_id " + idType + " NOT NULL");
            for (String statement : sql.split(";")) if (!statement.isBlank())
                try (var query = connection.createStatement()) { query.execute(statement); }
            System.out.println("Variant options schema installed. Existing products and option values were not changed.");
        } catch (SQLException ex) { throw new IllegalStateException("Database operation failed (SQL state " + ex.getSQLState() + ")."); }
    }
}
