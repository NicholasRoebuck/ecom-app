import java.nio.file.*;
import java.sql.*;
import java.util.*;

class ProductOptionDefinitionsSchema {
    public static void main(String[] args) throws Exception {
        Properties p = new Properties();
        try (var in = Files.newInputStream(Path.of("src/main/resources/application.properties"))) { p.load(in); }
        String url = p.getProperty("spring.datasource.url", "");
        if (!url.startsWith("jdbc:mysql://localhost:") && !url.startsWith("jdbc:mysql://127.0.0.1:"))
            throw new IllegalStateException("This helper only supports the local development database.");
        try (var c = DriverManager.getConnection(url, p.getProperty("spring.datasource.username"), p.getProperty("spring.datasource.password"))) {
            try (var s = c.prepareStatement("select data_type from information_schema.columns where table_schema=database() and table_name='product' and column_name='variant_configuration'");
                 var r = s.executeQuery()) {
                if (r.next()) {
                    if (!Set.of("text", "longtext").contains(r.getString(1).toLowerCase(Locale.ROOT))) throw new IllegalStateException("Unexpected configuration column type.");
                    System.out.println("Product option definitions schema is installed."); return;
                }
            }
            if (args.length == 0 || !"--apply".equals(args[0])) {
                System.out.println("Product option definitions migration is required."); return;
            }
            try (var s = c.createStatement()) {
                s.execute("ALTER TABLE product ADD COLUMN variant_configuration TEXT NULL");
            }
            System.out.println("Product option definitions schema installed. Existing catalog records were retained unchanged.");
        } catch (SQLException ex) { throw new IllegalStateException("Schema operation failed (SQL state " + ex.getSQLState() + ")."); }
    }
}
