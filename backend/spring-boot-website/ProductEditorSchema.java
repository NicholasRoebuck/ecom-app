import java.nio.file.*;
import java.sql.*;
import java.util.*;
class ProductEditorSchema {
 public static void main(String[] args) throws Exception {
  Properties p=new Properties();try(var in=Files.newInputStream(Path.of("src/main/resources/application.properties"))){p.load(in);}
  String url=p.getProperty("spring.datasource.url","");
  if(!url.startsWith("jdbc:mysql://localhost:")&&!url.startsWith("jdbc:mysql://127.0.0.1:"))throw new IllegalStateException("Local database required.");
  try(var c=DriverManager.getConnection(url,p.getProperty("spring.datasource.username"),p.getProperty("spring.datasource.password"))){
   try(var s=c.prepareStatement("select data_type from information_schema.columns where table_schema=database() and table_name='product' and column_name='variant_configuration'");var r=s.executeQuery()){
    if(!r.next())throw new IllegalStateException("Apply the product option definitions migration first.");
    if("longtext".equalsIgnoreCase(r.getString(1))){System.out.println("Product editor schema is installed.");return;}
    if(!"text".equalsIgnoreCase(r.getString(1)))throw new IllegalStateException("Unexpected configuration column type.");
   }
   if(args.length==0||!"--apply".equals(args[0])){System.out.println("Product editor migration is required.");return;}
   try(var s=c.createStatement()){s.execute("ALTER TABLE product MODIFY COLUMN variant_configuration LONGTEXT NULL");}
   System.out.println("Product configuration storage widened. Existing values were retained unchanged.");
  }catch(SQLException e){throw new IllegalStateException("Schema operation failed, SQL state "+e.getSQLState());}
 }
}
