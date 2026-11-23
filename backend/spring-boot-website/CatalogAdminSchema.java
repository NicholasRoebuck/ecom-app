import java.nio.file.*;
import java.sql.*;
import java.util.*;

class CatalogAdminSchema {
    public static void main(String[] args) throws Exception {
        Properties p = new Properties();
        try (var in = Files.newInputStream(Path.of("src/main/resources/application.properties"))) { p.load(in); }
        String url = p.getProperty("spring.datasource.url", "");
        if (!url.startsWith("jdbc:mysql://localhost:") && !url.startsWith("jdbc:mysql://127.0.0.1:"))
            throw new IllegalStateException("This helper only supports the local development database.");
        try (var c = DriverManager.getConnection(url, p.getProperty("spring.datasource.username"), p.getProperty("spring.datasource.password"))) {
            String collation;
            try (var s = c.prepareStatement("select collation_name from information_schema.columns where table_schema=database() and table_name='product_variant' and column_name='sku'");
                 var r = s.executeQuery()) {
                if (!r.next()) throw new IllegalStateException("SKU column missing.");
                collation = r.getString(1);
            }
            if (collation == null || !collation.toLowerCase(Locale.ROOT).endsWith("_ci"))
                throw new IllegalStateException("SKU uniqueness requires a case-insensitive SKU collation.");
            try (var s = c.prepareStatement("select count(*) from (select lower(trim(sku)) from product_variant where sku is not null group by lower(trim(sku)) having count(*) > 1) duplicates");
                 var r = s.executeQuery()) {
                r.next();
                if (r.getLong(1) > 0) throw new IllegalStateException("Duplicate SKUs exist. No changes were made. Resolve duplicates before installing the unique index.");
            }
            boolean unique;
            try (var s = c.prepareStatement("select index_name from information_schema.statistics where table_schema=database() and table_name='product_variant' and non_unique=0 group by index_name having count(*)=1 and max(column_name)='sku'");
                 var r = s.executeQuery()) { unique = r.next(); }

            Map<String, List<String>> legacy = new LinkedHashMap<>();
            try (var r = c.getMetaData().getImportedKeys(c.getCatalog(), null, "order_item")) {
                while (r.next()) {
                    String table = r.getString("PKTABLE_NAME");
                    if (table.equals("product") || table.equals("product_variant"))
                        legacy.computeIfAbsent(r.getString("FK_NAME"), key -> new ArrayList<>())
                            .add(r.getString("FKCOLUMN_NAME") + ":" + table + ":" + r.getString("PKCOLUMN_NAME"));
                }
            }
            for (var references : legacy.values())
                if (references.size() != 1 || !Set.of("product_id:product:id", "variant_id:product_variant:id").contains(references.getFirst()))
                    throw new IllegalStateException("Unexpected order-item catalog foreign key. Inspect it manually; no changes were made.");
            if (unique && legacy.isEmpty()) { System.out.println("Catalog management schema is installed."); return; }
            if (args.length == 0 || !"--apply".equals(args[0])) {
                System.out.println("Catalog management migration required: unique SKU index=" + !unique + ", legacy snapshot foreign keys=" + legacy.size()); return;
            }
            if (!unique) try (var s = c.createStatement()) {
                s.execute("CREATE UNIQUE INDEX uk_product_variant_sku ON product_variant (sku)");
            }
            if (!legacy.isEmpty()) {
                String drops = legacy.keySet().stream().map(name -> "DROP FOREIGN KEY `" + name.replace("`", "``") + "`")
                        .collect(java.util.stream.Collectors.joining(", "));
                try (var s = c.createStatement()) { s.execute("ALTER TABLE order_item " + drops); }
            }
            System.out.println("Catalog management schema installed. Catalog and order records were retained unchanged.");
        } catch (SQLException ex) { throw new IllegalStateException("Catalog migration failed (SQL state " + ex.getSQLState() + ")."); }
    }
}
