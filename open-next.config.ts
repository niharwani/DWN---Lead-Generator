import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({
  // No incremental cache in Phase 0 — add R2 or KV cache in later phases
  // when ISR / revalidation is actually used.
});
