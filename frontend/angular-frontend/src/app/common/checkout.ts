export interface CheckoutLine {
  variantId: number;
  sku: string;
  name: string;
  imageUrl: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
}
export interface CheckoutSummary {
  checkoutToken: string;
  orderTrackingNumber: string;
  status: string;
  currency: string;
  totalPrice: number;
  totalQuantity: number;
  items: CheckoutLine[];
}
export interface CheckoutAddress {
  street: string; city: string; state: string; country: string; zipCode: string;
}
export interface CheckoutRequest {
  requestId: string;
  items: {variantId: number; quantity: number}[];
  customer: {firstName: string; lastName: string; email: string};
  shippingAddress: CheckoutAddress;
  billingAddress: CheckoutAddress;
}

export interface CartQuoteLine extends CheckoutLine {
  available: boolean;
  message: string;
}
export interface CartQuote {
  currency: string;
  totalPrice: number;
  totalQuantity: number;
  available: boolean;
  items: CartQuoteLine[];
}

export interface CheckoutDetails {
  customer: CheckoutRequest["customer"];
  shippingAddress: CheckoutAddress;
  billingAddress: CheckoutAddress;
}
