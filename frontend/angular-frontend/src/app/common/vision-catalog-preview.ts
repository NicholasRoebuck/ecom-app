import { Product } from './product';

// Temporary photography assignments for the existing development fixtures only.
// Prices, stock, IDs and names continue to come from the server.
const images = [
  "/assets/images/products/vision/pilla/15cihc.png",
  "/assets/images/products/vision/pilla/18ced.png",
  "/assets/images/products/vision/pilla/19cin.png",
  "/assets/images/products/vision/pilla/21cihp.png",
  "/assets/images/products/vision/pilla/25cieb.jpg",
  "/assets/images/products/vision/pilla/26cied.png",
  "/assets/images/products/vision/pilla/28cr.png",
  "/assets/images/products/vision/pilla/29cimx.png",
  "/assets/images/products/vision/pilla/30cdc.png",
  "/assets/images/products/vision/pilla/30cihb.png",
  "/assets/images/products/vision/pilla/30cmos.png",
  "/assets/images/products/vision/pilla/31cihp.png",
  "/assets/images/products/vision/pilla/35cia.webp",
  "/assets/images/products/vision/pilla/36cpom.webp",
  "/assets/images/products/vision/pilla/38cied.webp",
  "/assets/images/products/vision/pilla/39cig.webp",
  "/assets/images/products/vision/pilla/40cn.webp",
  "/assets/images/products/vision/pilla/42cdkx.webp",
  "/assets/images/products/vision/pilla/42cila.jpeg",
  "/assets/images/products/vision/pilla/46cipa.jpeg"
];
export function withVisionPreviewImage(product: Product): Product {
  const match = /^Shooting Glasses Item ([1-9]\d*)$/.exec(product.name);
  if (!match || product.id !== 156 + Number(match[1])) return product;
  const imageUrl = images[Number(match[1]) - 1];
  if (!imageUrl) return product;
  return {...product, variants: product.variants.map(variant =>
    variant.sku === 'test-sku-' + product.id && variant.imageUrl?.endsWith('/placeholder.png')
      ? {...variant, imageUrl} : variant)};
}
