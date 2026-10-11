// Roster has no plan system or Stripe subscription yet. The plan comes from LICENSED_PLAN (written by Impact Digital's
// provisioning on customer installs: basico | essencial | completo); without it the install runs as "completo" like the
// other products do when nothing limits them. Extra reads are only billable when BILLING_STRIPE_CUSTOMER_ID is set.
export async function effectivePlan() {
  const p = process.env.LICENSED_PLAN;
  return ['basico', 'essencial', 'completo'].includes(p) ? p : 'completo';
}
export async function getSubscription() {
  return null;
}
