# PayPlus Integration

## Overview

PayPlus provides a REST API for integrating online payments, Payment Pages, direct transactions, tokenization, recurring payments, refunds, callbacks, transaction reporting, and additional payment methods.

This document describes the integration flow for connecting a website, application, or e-commerce platform to PayPlus.

---

# 1. API Environments

PayPlus provides two API environments.

| Environment | Base URL                                     |
| ----------- | -------------------------------------------- |
| Staging     | `https://restapidev.payplus.co.il/api/v1.0/` |
| Production  | `https://restapi.payplus.co.il/api/v1.0/`    |

The API credentials used for each environment are different and must match the environment being accessed.

For staging, use the development credentials.

For production, use the production credentials.

---

# 2. Authentication

Every API request must include the following HTTP headers:

```http
api-key: YOUR_API_KEY
secret-key: YOUR_SECRET_KEY
```

Example:

```http
POST /api/v1.0/PaymentPages/generateLink
Host: restapidev.payplus.co.il
Content-Type: application/json
api-key: YOUR_API_KEY
secret-key: YOUR_SECRET_KEY
```

### Security

API calls must be performed server-side.

Do not expose the `api-key` or `secret-key` in browser-side JavaScript, mobile applications, or publicly accessible client-side code.

---

# 3. General Integration Flow

A standard Payment Page integration works as follows:

```text
Customer
   |
   v
Merchant Website
   |
   | 1. Generate Payment Link
   v
PayPlus API
   |
   | 2. Payment Page URL
   v
Merchant Website
   |
   | 3. Redirect Customer
   v
PayPlus Payment Page
   |
   | 4. Customer completes payment
   v
PayPlus
   |
   +--------------------+
   |                    |
   v                    v
Success / Failure     Callback
Redirect              refURL_callback
   |                    |
   +---------+----------+
             |
             v
      Merchant Server
             |
             v
       Verify Transaction
```

The recommended architecture is:

1. Merchant server creates the Payment Page request.
2. PayPlus returns a payment page URL.
3. Customer is redirected to the PayPlus Payment Page.
4. Customer completes the payment.
5. PayPlus redirects the customer to the configured success/failure URL.
6. PayPlus sends a server-to-server callback.
7. Merchant verifies the transaction using the callback or `IPN-FULL`.
8. Merchant updates the order/payment status.

---

# 4. Payment Page Integration

The main endpoint for creating a Payment Page transaction is:

```http
POST /PaymentPages/generateLink
```

Production:

```text
https://restapi.payplus.co.il/api/v1.0/PaymentPages/generateLink
```

Staging:

```text
https://restapidev.payplus.co.il/api/v1.0/PaymentPages/generateLink
```

---

# 5. Generate Payment Link

## Request

```json
{
  "payment_page_uid": "YOUR_PAYMENT_PAGE_UID",
  "amount": 100,
  "currency_code": "ILS",
  "charge_method": 1,
  "language_code": "he",
  "sendEmailApproval": true,
  "sendEmailFailure": false,
  "expiry_datetime": "30",
  "refURL_success": "https://example.com/payment/success",
  "refURL_failure": "https://example.com/payment/failure",
  "refURL_cancel": "https://example.com/payment/cancel",
  "refURL_callback": "https://example.com/payment/callback",
  "send_failure_callback": true,
  "more_info": "ORDER-12345"
}
```

The `generateLink` endpoint supports configuration of amount, currency, charge method, redirects, callbacks, payment methods, allowed cards/BINs, customer data, invoices, installments, tokenization, and additional metadata.

---

# 6. Important GenerateLink Parameters

## payment_page_uid

The UID of the Payment Page configured in PayPlus.

```json
{
  "payment_page_uid": "7a0bc4d4-f35f-4301-a945-926378a2416d"
}
```

Required.

---

## amount

The amount to charge.

```json
{
  "amount": 100
}
```

Required.

---

## currency_code

The transaction currency.

For Israeli Shekels:

```json
{
  "currency_code": "ILS"
}
```

---

## charge_method

Determines the transaction type.

| Value | Transaction | Description       |
| ----: | ----------- | ----------------- |
|   `0` | J2          | Card check        |
|   `1` | J4          | Charge            |
|   `2` | J5          | Approval          |
|   `3` | Recurring   | Recurring payment |
|   `4` | Refund      | Refund            |
|   `5` | Token       | Token transaction |

For a normal one-time payment, use:

```json
{
  "charge_method": 1
}
```

The PayPlus documentation identifies J2 as card validation, J4 as immediate charge, and J5 as authorization/approval.

---

# 7. Payment Method Selection

Payment Pages can support multiple payment methods.

Example:

```json
{
  "allowed_charge_methods": [
    "credit-card",
    "google-pay"
  ]
}
```

You can also select which payment method is opened by default:

```json
{
  "charge_default": "credit-card"
}
```

To hide the other available methods:

```json
{
  "charge_default": "credit-card",
  "hide_other_charge_methods": true
}
```

Supported payment-method values depend on the configuration and modules enabled on the Payment Page.

Examples include:

```text
credit-card
bit
google-pay
apple-pay
paypal
multipass
valuecard
```

---

# 8. Restricting Card Brands

You can restrict the transaction to specific card brands.

Example:

```json
{
  "allowed_cards": [
    "visa",
    "mastercard"
  ]
}
```

---

# 9. Restricting BINs

Specific card BINs can be allowed for a transaction.

```json
{
  "allowed_bins": [
    "123456",
    "654321"
  ]
}
```

BIN values can be 6 or 8 digits.

This can be used when the merchant needs to restrict or control which cards can be used for a specific transaction.

---

# 10. Redirect URLs

PayPlus supports success, failure, and cancellation redirects.

## Success

```json
{
  "refURL_success": "https://example.com/payment/success"
}
```

The customer is redirected here after a successful transaction.

---

## Failure

```json
{
  "refURL_failure": "https://example.com/payment/failure"
}
```

The customer is redirected here after a failed transaction.

---

## Cancel

```json
{
  "refURL_cancel": "https://example.com/payment/cancel"
}
```

This URL is used when the customer chooses to return to the merchant website.

---

# 11. Callback

The callback should be treated as the server-to-server notification of the transaction.

Configure:

```json
{
  "refURL_callback": "https://example.com/payment/callback"
}
```

For failed transactions as well:

```json
{
  "send_failure_callback": true
}
```

PayPlus sends transaction information to the configured callback URL.

---

# 12. Callback Security

PayPlus callbacks include a `hash` header.

The merchant should verify the hash before processing the callback.

Example Node.js validation:

```javascript
const crypto = require("crypto");

function validatePayPlusCallback(body, headers, secretKey) {

    if (headers["user-agent"] !== "PayPlus") {
        return false;
    }

    const hash = headers["hash"];

    if (!hash) {
        return false;
    }

    const message = JSON.stringify(body);

    const generatedHash = crypto
        .createHmac("sha256", secretKey)
        .update(message)
        .digest("base64");

    return generatedHash === hash;
}
```

The PayPlus documentation describes validating the callback by checking the `PayPlus` user-agent and calculating an HMAC-SHA256 value using the secret key.

---

# 13. IPN

PayPlus provides an IPN endpoint for retrieving transaction information.

```http
POST /PaymentPages/ipn
```

Production:

```text
https://restapi.payplus.co.il/api/v1.0/PaymentPages/ipn
```

The request can identify the transaction using:

* `payment_request_uid`
* `transaction_uid`
* `approval_num`
* `voucher_num`
* `more_info`

Example:

```json
{
  "transaction_uid": "TRANSACTION_UID"
}
```

The IPN endpoint can also return related transactions when:

```json
{
  "transaction_uid": "TRANSACTION_UID",
  "related_transaction": true
}
```

---

# 14. IPN-FULL

For retrieving complete transaction information, use:

```http
POST /PaymentPages/ipn-full
```

Production:

```text
https://restapi.payplus.co.il/api/v1.0/PaymentPages/ipn-full
```

Example:

```json
{
  "transaction_uid": "TRANSACTION_UID",
  "related_transaction": true
}
```

The request can also use:

```json
{
  "payment_request_uid": "PAYMENT_REQUEST_UID"
}
```

or:

```json
{
  "approval_num": "APPROVAL_NUMBER"
}
```

or:

```json
{
  "voucher_num": "VOUCHER_NUMBER"
}
```

or:

```json
{
  "more_info": "ORDER-12345"
}
```

`IPN-FULL` is especially useful when the merchant needs the complete transaction details or related transactions.

---

# 15. Recommended Transaction Verification Flow

The redirect should not be treated as the final source of truth for payment confirmation.

Recommended flow:

```text
Customer completes payment
          |
          v
PayPlus
          |
          +--------------------+
          |                    |
          v                    v
Success Redirect          Server Callback
                               |
                               v
                       Verify PayPlus Hash
                               |
                               v
                         Get transaction
                               |
                               v
                           IPN-FULL
                               |
                               v
                      Verify transaction
                               |
                               v
                       Update order
```

The merchant should verify:

* Transaction UID
* Transaction status
* Amount
* Currency
* Payment method
* Order/reference information
* Approval number
* Voucher number where applicable
* Related transactions where applicable

---

# 16. Transaction Metadata

PayPlus supports additional transaction information.

Example:

```json
{
  "more_info": "ORDER-12345",
  "more_info_2": "CUSTOMER-9988",
  "more_info_3": "SHOPIFY-ORDER-1001"
}
```

These fields can be used to associate PayPlus transactions with merchant orders, customer IDs, external references, or internal business logic.

PayPlus supports `more_info` through `more_info_5` in the Payment Page flow.

---

# 17. Customer Information

Customer information can be supplied as part of the Payment Page request.

Example:

```json
{
  "customer": {
    "customer_name": "John Doe",
    "email": "john@example.com",
    "phone": "972501234567",
    "identification_number": "123456789"
  }
}
```

The exact customer fields should be aligned with the PayPlus API schema and the merchant's Payment Page configuration.

---

# 18. Items

Items can be attached to a Payment Page request.

Example:

```json
{
  "items": [
    {
      "name": "Product A",
      "price": 100,
      "quantity": 1
    }
  ]
}
```

When a `product_uid` is provided, PayPlus can use the existing product configuration.

---

# 19. Installments

Payment Page requests can configure installments.

Example:

```json
{
  "payments": 5
}
```

For credit transactions:

```json
{
  "payments_credit": true,
  "payments": 5
}
```

A specific number of payments can also be selected:

```json
{
  "payments_selected": 3
}
```

---

# 20. Tokenization

If tokenization is enabled for the merchant, a payment request can request a customer token.

```json
{
  "create_token": true
}
```

The returned token can subsequently be used for future transactions without requiring the customer to enter the card details again.

Tokenization requires the appropriate permissions/module on the PayPlus account.

---

# 21. J5 Approval Transactions

For authorization without immediately completing the final charge, use J5.

Endpoint:

```http
POST /Transactions/Approval
```

Production:

```text
https://restapi.payplus.co.il/api/v1.0/Transactions/Approval
```

Example:

```json
{
  "terminal_uid": "TERMINAL_UID",
  "cashier_uid": "CASHIER_UID",
  "credit_terms": 1,
  "amount": 100,
  "currency_code": "ILS",
  "use_token": false,
  "credit_card": {
    "card_number": "4111111111111111",
    "expiration_month": "12",
    "expiration_year": "30",
    "cvv": "123"
  }
}
```

The J5 endpoint supports regular, credit, and installment credit terms.

---

# 22. Direct API Transactions

For integrations that do not use a hosted Payment Page, PayPlus also provides direct transaction endpoints.

Typical flow:

```text
Merchant
   |
   v
PayPlus API
   |
   v
Transactions
   |
   v
Payment Processor
   |
   v
Transaction Result
```

Direct API integrations should always be performed server-side.

---

# 23. Transaction Reports

PayPlus provides transaction reporting endpoints.

Example:

```http
POST /TransactionReports/TransactionsApproval
```

The endpoint requires:

```json
{
  "terminal_uid": "TERMINAL_UID"
}
```

Pagination can be controlled using:

```json
{
  "skip": "0",
  "take": "100"
}
```

The maximum value for `take` is 500 according to the API documentation.

---

# 24. Transaction UID

The `transaction_uid` is the primary reference for a PayPlus transaction.

It should be stored by the merchant.

Recommended database structure:

```text
order_id
payment_request_uid
transaction_uid
amount
currency
status
approval_number
voucher_number
created_at
updated_at
```

The `transaction_uid` should be used when retrieving detailed transaction information through IPN/IPN-FULL.

---

# 25. Payment Request UID

Payment Page transactions can also contain a:

```text
payment_request_uid
```

This identifies the Payment Page payment request.

A merchant should store both:

```text
payment_request_uid
transaction_uid
```

when available.

---

# 26. Example Complete GenerateLink Request

```http
POST https://restapidev.payplus.co.il/api/v1.0/PaymentPages/generateLink
Content-Type: application/json
api-key: YOUR_API_KEY
secret-key: YOUR_SECRET_KEY
```

```json
{
  "payment_page_uid": "7a0bc4d4-f35f-4301-a945-926378a2416d",
  "amount": 100,
  "currency_code": "ILS",
  "charge_method": 1,
  "language_code": "he",
  "sendEmailApproval": true,
  "sendEmailFailure": false,
  "expiry_datetime": "30",
  "refURL_success": "https://example.com/payment/success",
  "refURL_failure": "https://example.com/payment/failure",
  "refURL_cancel": "https://example.com/payment/cancel",
  "refURL_callback": "https://example.com/payment/callback",
  "send_failure_callback": true,
  "more_info": "ORDER-12345",
  "customer": {
    "customer_name": "John Doe",
    "email": "john@example.com",
    "phone": "972501234567"
  },
  "items": [
    {
      "name": "Test Product",
      "price": 100,
      "quantity": 1
    }
  ]
}
```

---

# 27. Example GenerateLink Response

A successful GenerateLink request returns a payment-page link.

Example structure:

```json
{
  "results": {
    "status": "success",
    "code": 0,
    "description": "payment page link is been generated"
  },
  "data": {
    "page_request_uid": "PAYMENT_REQUEST_UID",
    "payment_page_link": "https://payplus.co.il/..."
  }
}
```

The merchant should save the `page_request_uid` and redirect the customer to `payment_page_link`.

---

# 28. Example IPN-FULL Request

```http
POST https://restapi.payplus.co.il/api/v1.0/PaymentPages/ipn-full
Content-Type: application/json
api-key: YOUR_API_KEY
secret-key: YOUR_SECRET_KEY
```

```json
{
  "transaction_uid": "TRANSACTION_UID",
  "related_transaction": true
}
```

---

# 29. Failure Handling

The integration should handle:

* API validation errors
* Invalid credentials
* Expired Payment Pages
* Declined transactions
* Cancelled transactions
* Failed 3DS authentication
* Callback failures
* Duplicate callbacks
* Network timeouts
* Transaction status uncertainty

Do not automatically mark an order as paid solely because the customer reached the success URL.

Always verify the transaction server-side.

---

# 30. Idempotency

The merchant application should be able to process the same callback more than once without creating duplicate orders, shipments, invoices, or refunds.

Recommended logic:

```text
Receive callback
      |
      v
Extract transaction_uid
      |
      v
Does transaction already exist?
      |
   +--+--+
   |     |
  YES    NO
   |     |
   v     v
Ignore   Verify
         |
         v
      Save transaction
         |
         v
      Update order
```

Use `transaction_uid` as a unique identifier in the merchant database.

---

# 31. 3D Secure

3D Secure may be configured through the Payment Page or transaction configuration.

The merchant should not assume that a transaction is successful merely because the customer completed the 3DS screen.

The final transaction status must be verified through the PayPlus response/callback.

---

# 32. Apple Pay and Google Pay

PayPlus Payment Pages can support alternative payment methods such as Apple Pay and Google Pay when enabled and configured for the merchant.

Payment methods can be restricted using:

```json
{
  "allowed_charge_methods": [
    "credit-card",
    "google-pay"
  ]
}
```

The exact availability depends on the Payment Page, terminal, acquiring configuration, and PayPlus setup.

---

# 33. PayPal

PayPal can be enabled as a Payment Page payment method where supported.

Example:

```json
{
  "charge_default": "paypal"
}
```

or:

```json
{
  "allowed_charge_methods": [
    "credit-card",
    "paypal"
  ]
}
```

Availability depends on the PayPlus account configuration.

---

# 34. BIT

BIT can be configured as a Payment Page payment method.

Example:

```json
{
  "charge_default": "bit"
}
```

---

# 35. Cibus

For Cibus-only Payment Pages, the payment configuration can be restricted to the relevant payment method.

Example configuration pattern:

```json
{
  "charge_default": "cibus",
  "hide_other_charge_methods": true
}
```

The exact availability and configuration should match the merchant's PayPlus setup.

---

# 36. Vouchers / Gift Cards

PayPlus can support voucher/payment-wallet scenarios depending on the merchant configuration.

When using a voucher or wallet alongside another payment method, the merchant should always verify the final transaction data returned by PayPlus.

For split or related transactions:

```text
Original Payment
      |
      +---- Voucher / Wallet
      |
      +---- Credit Card
```

Use `transaction_uid` and `IPN-FULL` to retrieve related transactions when required.

---

# 37. Split Transactions

When a transaction contains related transactions, request:

```json
{
  "transaction_uid": "TRANSACTION_UID",
  "related_transaction": true
}
```

This allows the merchant to retrieve related transaction information.

This is particularly useful when a single order contains multiple payment components.

---

# 38. Invoice Generation

If an invoice integration is configured, an invoice can be generated as part of the transaction.

Example:

```json
{
  "initial_invoice": true
}
```

The invoice behavior depends on the merchant's configured invoice provider and Payment Page settings.

---

# 39. VAT

The Payment Page API supports controlling whether the tax document includes VAT.

Example:

```json
{
  "paying_vat": true
}
```

For transactions that should not include VAT:

```json
{
  "paying_vat": false
}
```

This should only be used according to the merchant's tax/accounting requirements.

---

# 40. Expiration

A Payment Page request can have its own expiration period.

Example:

```json
{
  "expiry_datetime": "30"
}
```

The value represents the expiration period in minutes.

---

# 41. Recommended Database Fields

A merchant integration should consider storing at least:

```text
order_id
payment_request_uid
transaction_uid
terminal_uid
amount
currency_code
payment_method
charge_method
transaction_status
approval_num
voucher_num
more_info
more_info_2
more_info_3
customer_id
created_at
updated_at
```

Additional fields may be required depending on the business flow.

---

# 42. Recommended Payment Statuses

The merchant system should maintain its own internal payment status.

Example:

```text
PENDING
SUCCESS
FAILED
CANCELLED
REFUNDED
PARTIALLY_REFUNDED
UNKNOWN
```

Do not directly map a browser redirect to `SUCCESS`.

The status should be based on a verified PayPlus transaction.

---

# 43. Recommended Order Flow

```text
1. Customer creates order
        |
        v
2. Merchant creates Payment Page
        |
        v
3. PayPlus returns page_request_uid
        |
        v
4. Merchant saves payment_request_uid
        |
        v
5. Customer redirected to PayPlus
        |
        v
6. Customer completes payment
        |
        +--------------------------+
        |                          |
        v                          v
7. Success/Failure URL        8. Callback
                                   |
                                   v
                              Verify hash
                                   |
                                   v
                              IPN-FULL
                                   |
                                   v
                            Verify transaction
                                   |
                                   v
                            Update order
```

---

# 44. Testing

Use the PayPlus staging environment for development and testing.

```text
https://restapidev.payplus.co.il/api/v1.0/
```

Do not use production credentials for development.

Test at minimum:

* Successful credit-card transaction
* Failed credit-card transaction
* Cancelled payment
* Expired payment page
* 3DS transaction
* Callback
* Failed callback
* IPN
* IPN-FULL
* Duplicate callback
* Refund
* J5 approval
* Token creation
* Token payment
* Installments
* Apple Pay / Google Pay where enabled
* Alternative payment methods where enabled

---

# 45. Postman Example

### Request

```http
POST {{base_url}}/PaymentPages/generateLink
```

### Headers

```http
Content-Type: application/json
api-key: {{api_key}}
secret-key: {{secret_key}}
```

### Body

```json
{
  "payment_page_uid": "{{payment_page_uid}}",
  "amount": 100,
  "currency_code": "ILS",
  "charge_method": 1,
  "more_info": "TEST-ORDER-001",
  "refURL_success": "https://example.com/success",
  "refURL_failure": "https://example.com/failure",
  "refURL_callback": "https://example.com/callback"
}
```

---

# 46. Python Example

```python
import requests

url = "https://restapidev.payplus.co.il/api/v1.0/PaymentPages/generateLink"

headers = {
    "Content-Type": "application/json",
    "api-key": "YOUR_API_KEY",
    "secret-key": "YOUR_SECRET_KEY"
}

payload = {
    "payment_page_uid": "YOUR_PAYMENT_PAGE_UID",
    "amount": 100,
    "currency_code": "ILS",
    "charge_method": 1,
    "more_info": "ORDER-12345",
    "refURL_success": "https://example.com/success",
    "refURL_failure": "https://example.com/failure",
    "refURL_callback": "https://example.com/callback"
}

response = requests.post(
    url,
    headers=headers,
    json=payload
)

print(response.status_code)
print(response.json())
```

---

# 47. Node.js Example

```javascript
const axios = require("axios");

const response = await axios.post(
    "https://restapidev.payplus.co.il/api/v1.0/PaymentPages/generateLink",
    {
        payment_page_uid: "YOUR_PAYMENT_PAGE_UID",
        amount: 100,
        currency_code: "ILS",
        charge_method: 1,
        more_info: "ORDER-12345",
        refURL_success: "https://example.com/success",
        refURL_failure: "https://example.com/failure",
        refURL_callback: "https://example.com/callback"
    },
    {
        headers: {
            "Content-Type": "application/json",
            "api-key": "YOUR_API_KEY",
            "secret-key": "YOUR_SECRET_KEY"
        }
    }
);

console.log(response.data);
```

---

# 48. Integration Checklist

* [ ] Obtain PayPlus staging credentials
* [ ] Obtain `payment_page_uid`
* [ ] Configure Payment Page
* [ ] Configure payment methods
* [ ] Implement server-side GenerateLink request
* [ ] Store `payment_request_uid`
* [ ] Redirect customer to PayPlus
* [ ] Configure success URL
* [ ] Configure failure URL
* [ ] Configure cancel URL
* [ ] Configure callback URL
* [ ] Implement callback validation
* [ ] Validate PayPlus hash
* [ ] Implement IPN-FULL
* [ ] Store `transaction_uid`
* [ ] Verify transaction amount
* [ ] Verify transaction currency
* [ ] Verify transaction status
* [ ] Implement idempotent callback processing
* [ ] Implement refund handling
* [ ] Test successful transaction
* [ ] Test failed transaction
* [ ] Test cancellation
* [ ] Test 3DS
* [ ] Test duplicate callbacks
* [ ] Test related transactions
* [ ] Test production credentials
* [ ] Switch API URL to production

---

# 49. Production Configuration

Before going live, replace:

```text
https://restapidev.payplus.co.il/api/v1.0/
```

with:

```text
https://restapi.payplus.co.il/api/v1.0/
```

Use production API credentials and verify that:

* Payment Page is active
* Terminal is configured
* Required payment methods are active
* Callback URL is publicly accessible
* SSL certificate is valid
* Callback hash validation is enabled
* Orders cannot be duplicated
* Transaction status is verified server-side
* Refund functionality has been tested
* Logging and monitoring are enabled

---

# 50. Error Handling

All API integrations should handle non-success HTTP responses.

Example:

```python
if response.status_code != 200:
    # Log PayPlus response
    # Do not mark transaction as successful
    # Return an appropriate error to the merchant system
    pass
```

Do not expose API keys, secret keys, or sensitive transaction information in application logs.

---

# 51. Logging

Recommended logging fields:

```text
request_id
order_id
payment_request_uid
transaction_uid
amount
currency
endpoint
HTTP status
PayPlus response code
transaction status
timestamp
```

Never log:

```text
API secret key
CVV
Full card number
Sensitive authentication information
```

---

# 52. Final Integration Architecture

A production-ready PayPlus integration should follow this architecture:

```text
                    +------------------+
                    |     Customer     |
                    +--------+---------+
                             |
                             v
                    +------------------+
                    | Merchant Website |
                    +--------+---------+
                             |
                             | GenerateLink
                             v
                    +------------------+
                    |   Merchant API   |
                    +--------+---------+
                             |
                             | api-key
                             | secret-key
                             v
                    +------------------+
                    |    PayPlus API   |
                    +--------+---------+
                             |
                             v
                    +------------------+
                    |  Payment Page   |
                    +--------+---------+
                             |
                             v
                    +------------------+
                    |    Customer      |
                    |    Payment       |
                    +--------+---------+
                             |
                +------------+------------+
                |                         |
                v                         v
       +------------------+      +------------------+
       | Success/Failure  |      |    Callback     |
       |    Redirect      |      |   Merchant API  |
       +------------------+      +--------+---------+
                                          |
                                          v
                                 +------------------+
                                 |    IPN-FULL      |
                                 | Transaction      |
                                 | Verification     |
                                 +--------+---------+
                                          |
                                          v
                                 +------------------+
                                 | Merchant Order  |
                                 | Status Update   |
                                 +------------------+
```

---

# 53. Important Rules

1. Never expose PayPlus API credentials client-side.
2. Never trust the success redirect as proof of payment.
3. Always validate the server-side callback.
4. Verify the callback hash.
5. Store the PayPlus `transaction_uid`.
6. Use `IPN-FULL` when full transaction information is required.
7. Use `related_transaction: true` for flows containing related transactions.
8. Make callback processing idempotent.
9. Verify amount and currency before marking an order as paid.
10. Keep staging and production credentials completely separate.
11. Do not store CVV.
12. Do not log sensitive card information.
13. Test all payment flows before production deployment.

---

# 54. Official API Documentation

The official PayPlus API documentation should be used as the authoritative reference for endpoint schemas, available parameters, response structures, and newly introduced functionality.

Base API documentation:

https://docs.payplus.co.il/

Staging API:

https://restapidev.payplus.co.il/api/v1.0/

Production API:

https://restapi.payplus.co.il/api/v1.0/

---

## Document Version

```text
Document: payplus-integration.md
Provider: PayPlus
API Version: v1.0
Environment: Staging / Production
Last Updated: 2026-08-16
```
