// src/lib/paddle/webhook-handlers/index.ts
//
// Barrel re-export for the webhook handlers. webhook-processor.ts
// imports from here so the dispatcher file can stay at ~30 lines.

export { handleSubscriptionCreated } from './subscription-handlers';
export { handleSubscriptionUpdated } from './subscription-handlers';
export { handleSubscriptionCanceled } from './subscription-handlers';
export { handleSubscriptionPaused } from './subscription-handlers';
export { handleTransactionCompleted } from './transaction-handlers';
export { handlePaymentFailed } from './transaction-handlers';
export { handleAdjustment } from './adjustment-handlers';
