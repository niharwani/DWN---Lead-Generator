/**
 * Google Places (New) adapter — server-side only, field-masked, quota-aware.
 *
 * Uses the Places v1 Text Search endpoint with an X-Goog-FieldMask to receive
 * only the public columns we store. No scraping, no HTML parsing, no HTML
 * from Google's SERPs. If the key is missing the adapter reports "needs-key"
 * and `run()` throws — the runner translates that into a job-level error.
 */

import type {
  DiscoveredCandidate,
  DiscoveryInput,
  LeadSourceAdapter,
} from "./types";

type PlacesV1Response = {
  places?: Array<{
    id?: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    nationalPhoneNumber?: string;
    internationalPhoneNumber?: string;
    websiteUri?: string;
    primaryType?: string;
    googleMapsUri?: string;
    types?: string[];
  }>;
  error?: { message?: string; code?: number };
};

const ENDPOINT = "https://places.googleapis.com/v1/places:searchText";
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.websiteUri",
  "places.nationalPhoneNumber",
  "places.internationalPhoneNumber",
  "places.primaryType",
  "places.googleMapsUri",
  "places.types",
].join(",");

export const placesAdapter: LeadSourceAdapter = {
  name: "google_places",
  label: "Google Places",
  capability: (env) => (env.GOOGLE_PLACES_API_KEY ? "ready" : "needs-key"),
  run: async (input, env) => {
    const key = env.GOOGLE_PLACES_API_KEY;
    if (!key) {
      throw new Error(
        "Google Places adapter requires GOOGLE_PLACES_API_KEY in Worker secrets."
      );
    }

    const query = buildQuery(input);
    const resp = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify({
        textQuery: query,
        pageSize: Math.min(Math.max(input.limit, 1), 20),
        languageCode: "en",
      }),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(
        `Google Places returned HTTP ${resp.status}: ${text.slice(0, 200)}`
      );
    }

    const data = (await resp.json()) as PlacesV1Response;
    if (data.error?.message) {
      throw new Error(`Google Places error: ${data.error.message}`);
    }

    const candidates: DiscoveredCandidate[] = (data.places ?? [])
      .filter((p) => p.displayName?.text)
      .map((p) => ({
        businessName: p.displayName!.text!,
        category: p.primaryType ?? undefined,
        websiteUrl: p.websiteUri ?? undefined,
        publicPhone:
          p.internationalPhoneNumber ?? p.nationalPhoneNumber ?? undefined,
        address: p.formattedAddress ?? undefined,
        city: input.city,
        region: input.region,
        country: input.country ?? "India",
        externalId: p.id ?? undefined,
        sourceUrl: p.googleMapsUri ?? undefined,
        evidence: { types: p.types ?? [], primaryType: p.primaryType ?? null },
      }))
      .slice(0, input.limit);

    return { candidates };
  },
};

function buildQuery(input: DiscoveryInput): string {
  const parts: string[] = [];
  if (input.keywords?.trim()) parts.push(input.keywords.trim());
  if (input.businessTypes?.trim()) parts.push(input.businessTypes.trim());
  if (parts.length === 0) parts.push(input.niche);
  if (input.city?.trim()) parts.push(`in ${input.city.trim()}`);
  return parts.join(" ");
}
