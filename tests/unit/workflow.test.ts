import { describe, expect, it } from "vitest";
import { availableActions, checkTransition, type TransitionContext } from "@/lib/domain/workflow";

const base: TransitionContext = { status: "draft", role: "owner", workingHash: "h1", reviewHash: null, approvedHash: null, publishedHash: null, blockingIssues: 0 };

describe("approval workflow", () => {
  it("allows submit from draft when no blocking issues", () => {
    expect(checkTransition("submit", base).ok).toBe(true);
  });
  it("blocks submit when the pre-publication check has blocking issues", () => {
    const r = checkTransition("submit", { ...base, blockingIssues: 2 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("PRECONDITION_FAILED");
  });
  it("forbids editors from approving", () => {
    const r = checkTransition("approve", { ...base, status: "in_review", role: "editor", reviewHash: "h1" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("FORBIDDEN");
  });
  it("rejects approval when content changed after submission", () => {
    const r = checkTransition("approve", { ...base, status: "in_review", reviewHash: "old" });
    expect(r.ok).toBe(false);
  });
  it("cannot publish a draft or an unapproved version", () => {
    expect(checkTransition("publish", base).ok).toBe(false);
    expect(checkTransition("publish", { ...base, status: "approved", approvedHash: "other" }).ok).toBe(false);
    expect(checkTransition("publish", { ...base, status: "approved", approvedHash: "h1" }).ok).toBe(true);
  });
  it("requires a comment to request revision", () => {
    expect(checkTransition("request_revision", { ...base, status: "in_review" }).ok).toBe(false);
    expect(checkTransition("request_revision", { ...base, status: "in_review", comment: "出典を追加" }).ok).toBe(true);
  });
  it("supports suspend and republish of the approved version only", () => {
    expect(checkTransition("suspend", { ...base, status: "published" }).ok).toBe(true);
    expect(checkTransition("republish", { ...base, status: "suspended", publishedHash: "a", approvedHash: "a" }).ok).toBe(true);
    expect(checkTransition("republish", { ...base, status: "suspended", publishedHash: "a", approvedHash: "b" }).ok).toBe(false);
  });
  it("lists only actions allowed for the role", () => {
    expect(availableActions("in_review", "editor").map((a) => a.action)).toEqual(["reopen"]);
    expect(availableActions("in_review", "lawyer").map((a) => a.action)).toContain("approve");
    expect(availableActions("published", null)).toEqual([]);
  });
});
