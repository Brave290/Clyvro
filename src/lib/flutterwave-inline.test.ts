import { describe, expect, it } from "vitest";
import { paymentOptionsForCurrency } from "@/lib/flutterwave-inline";

describe("Flutterwave payment options", () => {
  it("offers OPay for NGN while retaining card checkout elsewhere", () => {
    expect(paymentOptionsForCurrency("NGN")).toBe("card, opay");
    expect(paymentOptionsForCurrency("ngn")).toBe("card, opay");
    expect(paymentOptionsForCurrency("USD")).toBe("card");
    expect(paymentOptionsForCurrency("GHS")).toBe("card");
  });
});
