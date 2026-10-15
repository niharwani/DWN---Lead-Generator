/**
 * SSRF (Server-Side Request Forgery) defense for the website audit engine.
 *
 * This is spec §9 §Server-side request security — the FIRST place the app
 * makes outbound requests to third-party URLs. Every outbound fetch must pass
 * through `validateUrlForFetch()` before the request is issued, and every
 * redirect target must be re-validated.
 *
 * ## Trust boundaries
 *
 * In the Cloudflare Workers production runtime, this file's checks run
 * ALONGSIDE the `global_fetch_strictly_public` compatibility flag we set in
 * `wrangler.jsonc`. That flag makes `fetch()` itself refuse to resolve a URL
 * to a private / loopback / link-local IP at the DNS layer. We cannot see
 * resolved IPs from a Worker (no `dns.resolve4`), so the two layers divide
 * labour:
 *
 *   - Application layer (this file): parse the URL, reject bad schemes,
 *     reject hostnames that are IP literals in private ranges, reject
 *     well-known-dangerous hostnames (localhost, *.local, metadata.google…),
 *     revalidate after each redirect.
 *   - Runtime layer (`global_fetch_strictly_public`): refuses to connect to
 *     private IPs even if DNS resolves there. Also kills DNS rebinding since
 *     the resolved IP has to be public at connect time.
 *
 * In Next.js dev (Node runtime), the runtime flag does NOT apply. The
 * application-layer checks here are the only defense. If you need to audit a
 * real site from local dev, that works — but you cannot bypass the
 * application-layer blocklist. For local-only test harnesses (private IPs,
 * loopback), use `AUDIT_ALLOW_PRIVATE=1` as an environment opt-in.
 *
 * ## What is rejected
 *
 *   - Scheme other than http / https
 *   - Empty or non-RFC-3986 host
 *   - Userinfo in URL (`user:pass@host`)
 *   - Hostname literal in these IPv4 ranges:
 *       10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16,          (RFC 1918)
 *       127.0.0.0/8,                                        (loopback)
 *       169.254.0.0/16,                                     (link-local)
 *       0.0.0.0/8, 100.64.0.0/10,                           (reserved + CGNAT)
 *       192.0.0.0/24, 192.0.2.0/24, 198.18.0.0/15,          (reserved)
 *       198.51.100.0/24, 203.0.113.0/24,                    (documentation)
 *       224.0.0.0/4, 240.0.0.0/4,                           (multicast + reserved)
 *   - Hostname literal in these IPv6 ranges:
 *       ::/128, ::1/128,                                    (unspecified, loopback)
 *       fc00::/7, fe80::/10, ff00::/8,                      (ULA, link-local, multicast)
 *       64:ff9b::/96, 2001::/32, 2001:db8::/32,             (reserved)
 *       ::ffff:0:0/96 (IPv4-mapped — if the mapped IPv4 is private)
 *   - Known-dangerous hostnames: localhost, 0.0.0.0, broadcasthost
 *   - Known-dangerous suffixes: .local, .internal, .localhost, .onion
 *   - Known cloud-metadata hostnames: metadata.google.internal, 169.254.169.254,
 *     metadata.azure.com, instance-data.ec2.internal, etc.
 */

export type SsrfOk = { ok: true; url: URL };
export type SsrfReject = { ok: false; code: SsrfRejectCode; reason: string };
export type SsrfResult = SsrfOk | SsrfReject;

export type SsrfRejectCode =
  | "invalid_url"
  | "unsupported_scheme"
  | "userinfo_not_allowed"
  | "empty_host"
  | "blocked_hostname"
  | "blocked_suffix"
  | "private_ipv4"
  | "private_ipv6"
  | "metadata_endpoint";

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "0.0.0.0",
  "broadcasthost",
  "ip6-localhost",
  "ip6-loopback",
  "metadata.google.internal",
  "metadata.azure.com",
  "instance-data.ec2.internal",
]);

const BLOCKED_SUFFIXES = [".local", ".internal", ".localhost", ".onion"];

const IPV4_LITERAL = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/** True if the host string looks like an IPv4 literal. */
function parseIpv4(host: string): [number, number, number, number] | null {
  const match = IPV4_LITERAL.exec(host);
  if (!match) return null;
  const octets = [match[1], match[2], match[3], match[4]].map(Number);
  for (const o of octets) {
    if (!Number.isInteger(o) || o < 0 || o > 255) return null;
  }
  return octets as [number, number, number, number];
}

/** Return true if the given IPv4 is in a private / reserved / loopback range. */
export function isPrivateIpv4(a: number, b: number, c: number, d: number): boolean {
  // RFC 1918
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  // Loopback
  if (a === 127) return true;
  // Link-local
  if (a === 169 && b === 254) return true;
  // "This network" / CGNAT
  if (a === 0) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  // Reserved + documentation (RFC 5735 / 5737 / 6598 / 6890)
  if (a === 192 && b === 0 && c === 0) return true;
  if (a === 192 && b === 0 && c === 2) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 198 && b === 51 && c === 100) return true;
  if (a === 203 && b === 0 && c === 113) return true;
  // Multicast + reserved
  if (a >= 224) return true;
  // Explicit metadata IP
  if (a === 169 && b === 254 && c === 169 && d === 254) return true;
  return false;
}

/**
 * Parse an IPv6 literal (RFC-3986 bracket form stripped by `new URL`) into
 * eight 16-bit groups. Returns `null` for anything we can't confidently
 * classify — the caller treats null as "this isn't an IPv6 literal, leave it
 * for DNS at fetch time".
 */
export function parseIpv6(host: string): number[] | null {
  // IPv6 may contain :: (zero compression) and may be an IPv4-mapped form
  // (::ffff:1.2.3.4). We handle both.
  if (!host.includes(":")) return null;

  // IPv4-mapped: ::ffff:a.b.c.d or ::a.b.c.d
  const v4MapMatch = /^(::(?:ffff:)?)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i.exec(host);
  if (v4MapMatch) {
    const v4 = parseIpv4(v4MapMatch[2]!);
    if (!v4) return null;
    // Represent as 8 groups: :: + ffff + v4-mapped
    const groups = [0, 0, 0, 0, 0, 0xffff, (v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]];
    return groups;
  }

  const hasCompression = host.includes("::");
  if (hasCompression && host.indexOf("::") !== host.lastIndexOf("::")) {
    // Multiple "::" is invalid
    return null;
  }

  let left: string[] = [];
  let right: string[] = [];
  if (hasCompression) {
    const [l, r] = host.split("::");
    left = l ? l.split(":") : [];
    right = r ? r.split(":") : [];
  } else {
    left = host.split(":");
  }

  const totalExplicit = left.length + right.length;
  if (!hasCompression && totalExplicit !== 8) return null;
  if (totalExplicit > 8) return null;

  const zeros = Array<string>(8 - totalExplicit).fill("0");
  const groupsStr = hasCompression ? [...left, ...zeros, ...right] : left;
  if (groupsStr.length !== 8) return null;

  const groups: number[] = [];
  for (const g of groupsStr) {
    if (g.length === 0 || g.length > 4) return null;
    if (!/^[0-9a-f]+$/i.test(g)) return null;
    groups.push(parseInt(g, 16));
  }
  return groups;
}

export function isPrivateIpv6(groups: number[]): boolean {
  if (groups.length !== 8) return true; // malformed → reject
  const [g0, g1, , , , g5, g6, g7] = groups;
  const g0_ = g0!;
  const g1_ = g1!;
  // ::0 unspecified, ::1 loopback
  if (groups.every((g, i) => (i < 7 ? g === 0 : true))) {
    const last = g7!;
    if (last === 0 || last === 1) return true;
  }
  // ::ffff:a.b.c.d IPv4-mapped is blocked outright — mapped forms are a
  // routine SSRF bypass trick (public /etc/hosts resolves to a private
  // target), so safer to reject every IPv4-mapped IPv6 even if the embedded
  // IPv4 is public.
  if (
    g0 === 0 &&
    g1 === 0 &&
    groups[2] === 0 &&
    groups[3] === 0 &&
    groups[4] === 0 &&
    g5 === 0xffff
  ) {
    return true;
  }
  // ULA fc00::/7
  if ((g0_ & 0xfe00) === 0xfc00) return true;
  // Link-local fe80::/10
  if ((g0_ & 0xffc0) === 0xfe80) return true;
  // Multicast ff00::/8
  if ((g0_ & 0xff00) === 0xff00) return true;
  // IPv4-IPv6 translation 64:ff9b::/96
  if (g0_ === 0x0064 && g1_ === 0xff9b) return true;
  // Reserved 2001::/32 and 2001:db8::/32 (documentation)
  if (g0_ === 0x2001 && (g1_ === 0x0000 || g1_ === 0x0db8)) return true;
  return false;
}

/** Normalize a user-supplied URL string into a safe `URL`, applying all SSRF checks. */
export function validateUrlForFetch(input: string): SsrfResult {
  if (typeof input !== "string" || input.trim() === "") {
    return { ok: false, code: "invalid_url", reason: "URL is empty." };
  }
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return { ok: false, code: "invalid_url", reason: "URL is not parseable." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return {
      ok: false,
      code: "unsupported_scheme",
      reason: `Scheme "${url.protocol.replace(":", "")}" is not permitted; only http and https are allowed.`,
    };
  }
  if (url.username || url.password) {
    return {
      ok: false,
      code: "userinfo_not_allowed",
      reason: "URLs may not include userinfo (user:password@…).",
    };
  }
  // `URL.hostname` returns an IPv6 literal wrapped in brackets ("[::1]"). We
  // need the bare address for the SSRF classifier. Strip the brackets here
  // and only here.
  const rawHost = url.hostname.toLowerCase();
  const host =
    rawHost.startsWith("[") && rawHost.endsWith("]")
      ? rawHost.slice(1, -1)
      : rawHost;
  if (!host) {
    return { ok: false, code: "empty_host", reason: "URL has no host." };
  }

  // Opt-in dev-only bypass. Only honored when NODE_ENV !== 'production' AND
  // the env flag is set explicitly. Production is never affected regardless.
  const allowPrivate =
    typeof process !== "undefined" &&
    process.env.NODE_ENV !== "production" &&
    process.env.AUDIT_ALLOW_PRIVATE === "1";

  // IP literal checks — these happen BEFORE DNS, so they catch e.g.
  // http://127.0.0.1 and http://[::1] directly.
  const v4 = parseIpv4(host);
  if (v4) {
    if (isPrivateIpv4(...v4)) {
      if (allowPrivate) return { ok: true, url };
      const isMetadata = v4[0] === 169 && v4[1] === 254 && v4[2] === 169 && v4[3] === 254;
      return {
        ok: false,
        code: isMetadata ? "metadata_endpoint" : "private_ipv4",
        reason: isMetadata
          ? "Cloud metadata endpoint 169.254.169.254 is blocked."
          : `IPv4 ${v4.join(".")} is in a private / reserved range.`,
      };
    }
  }
  const v6 = parseIpv6(host);
  if (v6) {
    if (isPrivateIpv6(v6)) {
      if (allowPrivate) return { ok: true, url };
      return {
        ok: false,
        code: "private_ipv6",
        reason: `IPv6 host is in a private / reserved range.`,
      };
    }
  }

  // Hostname blocklist + suffix blocklist
  if (BLOCKED_HOSTNAMES.has(host)) {
    if (allowPrivate) return { ok: true, url };
    const isMetadata = host.endsWith(".google.internal") || host.endsWith(".azure.com") || host === "metadata.google.internal";
    return {
      ok: false,
      code: isMetadata ? "metadata_endpoint" : "blocked_hostname",
      reason: `Hostname "${host}" is blocked by policy.`,
    };
  }
  for (const suffix of BLOCKED_SUFFIXES) {
    if (host === suffix.slice(1) || host.endsWith(suffix)) {
      if (allowPrivate) return { ok: true, url };
      return {
        ok: false,
        code: "blocked_suffix",
        reason: `Hostname ends in "${suffix}", which is reserved for local / internal use.`,
      };
    }
  }

  return { ok: true, url };
}
