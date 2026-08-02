import { beforeEach, describe, expect, it } from "vitest";
import { consumeChatRateLimit, resetChatRateLimitForTests } from "@/ai/chatRateLimit";

describe("chat rate limit", () => {
  beforeEach(() => resetChatRateLimitForTests());

  it("allows twenty requests per minute and rejects the next one", () => {
    for (let index = 0; index < 20; index += 1) {
      expect(consumeChatRateLimit("client", 1_000).allowed).toBe(true);
    }
    expect(consumeChatRateLimit("client", 1_000)).toEqual({ allowed: false, retryAfterSeconds: 60 });
  });

  it("opens a new window after sixty seconds", () => {
    for (let index = 0; index < 20; index += 1) consumeChatRateLimit("client", 1_000);
    expect(consumeChatRateLimit("client", 61_000).allowed).toBe(true);
  });
});
