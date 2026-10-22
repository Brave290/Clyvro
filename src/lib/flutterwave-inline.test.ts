import { describe, expect, it } from "vitest";
import { paymentOptionsForCurrency } from "@/lib/flutterwave-inline";

describe("Flutterwave payment options", () => {
  it("uses card checkout for every supported currency", () => {
    expect(paymentOptionsForCurrency("NGN")).toBe("card");
    expect(paymentOptionsForCurrency("ngn")).toBe("card");
    expect(paymentOptionsForCurrency("USD")).toBe("card");
    expect(paymentOptionsForCurrency("GHS")).toBe("card");
  });
});
