import { describe, expect, it } from "vitest";
import { applyRules, categorizeByRules } from "../src/lib/rules.js";

describe("applyRules — marketing domains", () => {
  it("categorizes known marketing sender domain as marketing", () => {
    const result = applyRules("deals@mailchimp.com", "Weekly update", false);
    expect(result?.category).toBe("marketing");
    expect(result?.confidence).toBe("high");
  });

  it("categorizes sendgrid subdomain as marketing", () => {
    const result = applyRules("noreply@em.sendgrid.net", "Your newsletter", false);
    expect(result?.category).toBe("marketing");
  });
});

describe("applyRules — marketing sender patterns", () => {
  it("categorizes noreply@ as marketing", () => {
    const result = applyRules("noreply@somecompany.com", "Update", false);
    expect(result?.category).toBe("marketing");
  });

  it("categorizes deals@ as marketing", () => {
    const result = applyRules("deals@somestore.com", "Flash sale", false);
    expect(result?.category).toBe("marketing");
  });
});

describe("applyRules — marketing subject patterns", () => {
  it("detects percentage discount in subject", () => {
    const result = applyRules("contact@brand.com", "50% off this weekend only", false);
    expect(result?.category).toBe("marketing");
    expect(result?.confidence).toBe("medium");
  });

  it("detects flash sale in subject", () => {
    const result = applyRules("contact@brand.com", "Flash sale ends tonight", false);
    expect(result?.category).toBe("marketing");
  });

  it("detects promo code in subject", () => {
    const result = applyRules("contact@brand.com", "Use promo code SAVE20", false);
    expect(result?.category).toBe("marketing");
  });
});

describe("applyRules — transactional", () => {
  it("categorizes order confirmation as transactional", () => {
    const result = applyRules("orders@shop.com", "Order confirmation #12345", false);
    expect(result?.category).toBe("transactional");
    expect(result?.confidence).toBe("high");
  });

  it("categorizes password reset as transactional", () => {
    const result = applyRules("security@service.com", "Password reset request", false);
    expect(result?.category).toBe("transactional");
  });

  it("categorizes shipping update as transactional", () => {
    const result = applyRules("noreply@fedex.com", "Shipping confirmation for order", false);
    expect(result?.category).toBe("transactional");
  });

  it("categorizes 2FA code as transactional", () => {
    const result = applyRules("auth@service.com", "Your 2FA verification code", false);
    expect(result?.category).toBe("transactional");
  });
});

describe("applyRules — social", () => {
  it("categorizes GitHub as social", () => {
    const result = applyRules("noreply@github.com", "Someone starred your repo", false);
    expect(result?.category).toBe("social");
    expect(result?.confidence).toBe("high");
  });

  it("categorizes LinkedIn as social", () => {
    const result = applyRules("no-reply@linkedin.com", "You have a new connection", false);
    expect(result?.category).toBe("social");
  });
});

describe("applyRules — newsletter via List-Unsubscribe", () => {
  it("falls back to newsletter when List-Unsubscribe header present", () => {
    const result = applyRules("editor@techblog.com", "This week in tech", true);
    expect(result?.category).toBe("newsletter");
    expect(result?.confidence).toBe("medium");
  });
});

describe("applyRules — unknown", () => {
  it("returns null for personal-looking email", () => {
    const result = applyRules("john.doe@gmail.com", "Hey, catching up soon?", false);
    expect(result).toBeNull();
  });
});

describe("categorizeByRules", () => {
  it("returns null for emails that need AI", () => {
    const results = categorizeByRules([
      { from: "alice@gmail.com", subject: "Lunch tomorrow?", hasUnsubscribe: false },
    ]);
    expect(results[0]).toBeNull();
  });

  it("categorizes a batch with mixed results", () => {
    const results = categorizeByRules([
      { from: "noreply@mailchimp.com", subject: "Weekly digest", hasUnsubscribe: true },
      { from: "alice@gmail.com", subject: "Hello!", hasUnsubscribe: false },
      { from: "orders@shop.com", subject: "Order confirmation #999", hasUnsubscribe: false },
    ]);
    expect(results[0]).toBe("marketing");
    expect(results[1]).toBeNull();
    expect(results[2]).toBe("transactional");
  });
});
