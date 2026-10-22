# Flutterwave billing architecture notes — 2026-10-22

## Recurring billing

Flutterwave supports recurring billing through Payment Plans and card tokenization.

- Payment Plans are created in Flutterwave and attached to the first charge with `payment_plan`.
- Flutterwave then manages later billing cycles, sends reminders, retries failed charges, and emits webhooks for charge success/failure/cancellation.
- A Payment Plan is tied to the customer's email and the charge currency must match the plan currency.
- If a payment plan is supplied, Flutterwave fixes the payment method to card.
- Tokenization is another option. It requires storing only the returned card token, not card data. Tokens are tied to the original email and expire after one year. The merchant is responsible for cancellation, reactivation, and charging.
- Clyvro currently creates one-time Inline checkout rows and its webhook only accepts an already-known `tx_ref`; recurring billing is not yet wired safely.

Sources:
- https://developer.flutterwave.com/docs/payment-plans-1
- https://developer.flutterwave.com/docs/tokenization

## Subaccounts and settlements

Flutterwave split payments require a subaccount ID on each collection request. Creating a subaccount alone does not route money there. The checkout/API payload must include `subaccounts: [{ id: "..." }]`; the subaccount's configured split rules determine its share and the remainder stays with the main merchant. Funds settle according to the configured settlement cycle.

The subaccount creation fields include bank code, account number, country, business name, split type, and split value. Account-name mismatch errors normally mean the bank-resolved account holder/KYC name does not match the submitted business or settlement details; the exact legal bank-account name and verified bank details must be used.

Source:
- https://developer.flutterwave.com/docs/split-payments

## Implementation decision

- Admin currency prices now scale together by the same ratio whenever one currency is edited.
- A paid plan can be prepaid before expiry; the existing settlement logic already adds 30 days from the later expiry when the same plan is paid.
- The billing UI uses “Pay for next month” while more than three days remain, and only uses “Renew / extend a month” in the final three days.
- Automatic renewal should only be enabled after per-currency Flutterwave Payment Plan IDs and recurring webhook settlement are configured; showing a working-looking toggle before that would risk charging users without extending their plans.
