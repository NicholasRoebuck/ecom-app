import java.nio.file.*;
import java.sql.*;
import java.util.*;

// Local development only. Defaults to read-only inspection; --apply installs the additive migration.
class OrderOwnershipSchema {
    public static void main(String[] args) throws Exception {
        Properties settings = new Properties();
        try (var input = Files.newInputStream(Path.of("src/main/resources/application.properties"))) { settings.load(input); }
        String url = settings.getProperty("spring.datasource.url", "");
        if (!url.startsWith("jdbc:mysql://localhost:") && !url.startsWith("jdbc:mysql://127.0.0.1:"))
            throw new IllegalStateException("This helper only supports the local development database.");
        try (var connection = DriverManager.getConnection(url, settings.getProperty("spring.datasource.username"),
                settings.getProperty("spring.datasource.password"))) {
            int existing = 0;
            for (String column : List.of("owner_issuer", "owner_subject")) {
                try (var result = connection.getMetaData().getColumns(connection.getCatalog(), null, "orders", column)) {
                    if (result.next()) existing++;
                }
            }
            if (existing == 2) {
                try (var query = connection.prepareStatement("""
                    select count(*) from information_schema.columns
                    where table_schema = database() and table_name = 'orders'
                      and column_name in ('owner_issuer','owner_subject') and collation_name = 'utf8mb4_bin'
                    """); var result = query.executeQuery()) {
                    result.next();
                    if (result.getInt(1) != 2) throw new IllegalStateException("Ownership columns require utf8mb4_bin collation.");
                }
                System.out.println("Case-sensitive order ownership columns are installed."); return;
            }
            if (existing != 0) throw new IllegalStateException("Partial ownership migration detected. Inspect before proceeding.");
            if (args.length == 0 || !"--apply".equals(args[0])) {
                System.out.println("Order ownership migration is required."); return;
            }
            String sql = Files.readString(Path.of("order-ownership-migration.sql")).replaceAll("(?m)^--.*$", "");
            for (String statement : sql.split(";")) {
                if (!statement.isBlank()) try (var query = connection.createStatement()) { query.execute(statement); }
            }
            System.out.println("Order ownership columns and index installed. No orders were deleted or assigned by email.");
        } catch (SQLException ex) {
            throw new IllegalStateException("Database operation failed (SQL state " + ex.getSQLState() + ").");
        }
    }
}
