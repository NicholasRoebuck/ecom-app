export type CheckoutState = 'loading' | 'ready' | 'submitting' | 'authentication-required' |
  'processing' | 'recovery-required' | 'cart-updating' | 'failed' | 'confirmed';

export interface CheckoutStateContext {
  confirmed: boolean; submitting: boolean; loading: boolean; status?: string;
  cartChanged: boolean; recoveryPending: boolean; hasError: boolean; pricesReady: boolean;
}

// Derive one UI state from current server status and active work; no independent state can go stale.
export function checkoutState(context: CheckoutStateContext): CheckoutState {
  if (context.confirmed) return 'confirmed';
  if (context.submitting) return 'submitting';
  if (context.loading) return 'loading';
  if (context.status === 'PROCESSING') return 'processing';
  if (context.cartChanged) return 'cart-updating';
  if (context.recoveryPending) return 'recovery-required';
  if (context.status === 'REQUIRES_ACTION') return 'authentication-required';
  if (context.hasError || !context.pricesReady) return 'failed';
  return 'ready';
}
