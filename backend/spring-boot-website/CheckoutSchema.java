import java.nio.file.*;
import java.sql.*;
import java.util.*;

// Run from backend/spring-boot-website. Defaults to a read-only schema check.
// java --class-path <mysql-connector-j.jar> CheckoutSchema.java [--apply]
class CheckoutSchema {
    public static void main(String[] args) throws Exception {
        Properties props = new Properties();
        try (var input = Files.newInputStream(Path.of("src/main/resources/application.properties"))) { props.load(input); }
        String url = props.getProperty("spring.datasource.url", "");
        if (!url.startsWith("jdbc:mysql://localhost:") && !url.startsWith("jdbc:mysql://127.0.0.1:"))
            throw new IllegalStateException("This helper only supports a local development database.");
        try (Connection connection = DriverManager.getConnection(url, props.getProperty("spring.datasource.username"),
                props.getProperty("spring.datasource.password"))) {
            Map<String, List<String>> required = Map.of(
                    "orders", List.of("checkout_token", "payment_intent_id", "currency"),
                    "order_item", List.of("variant_id", "sku", "product_name"));
            int existing = 0;
            for (var entry : required.entrySet()) {
                for (String column : entry.getValue()) {
                    try (ResultSet columns = connection.getMetaData().getColumns(connection.getCatalog(), null, entry.getKey(), column)) {
                        if (columns.next()) existing++;
                    }
                }
            }
            if (existing == 6) { System.out.println("Checkout schema is already installed."); return; }
            if (existing != 0) throw new IllegalStateException("Partial migration detected. Inspect the schema before continuing.");
            if (args.length == 0 || !"--apply".equals(args[0])) {
                System.out.println("Checkout migration is required. Run with --apply to add the six columns and two unique indexes.");
                return;
            }
            String sql = Files.readString(Path.of("checkout-pricing-migration.sql")).replaceAll("(?m)^--.*$", "");
            for (String statement : sql.split(";")) {
                if (!statement.isBlank()) try (Statement command = connection.createStatement()) { command.execute(statement); }
            }
            System.out.println("Checkout migration applied. Existing orders were preserved.");
        } catch (SQLException ex) {
            // Never echo a JDBC URL, password, or connection configuration.
            throw new IllegalStateException("Database operation failed (SQL state " + ex.getSQLState() + ").");
        }
    }
}
