export type Place = { name: string; address: string; phone: string | null; website: string | null; mapsUrl: string | null; rating: number | null };

/**
 * Local businesses from Google Places. Returns null when no key is set, and the page then falls back
 * to opening the same search in Google Maps.
 */
export async function searchPlaces(textQuery: string): Promise<Place[] | null> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return null;
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask":
        "places.displayName,places.formattedAddress,places.internationalPhoneNumber,places.websiteUri,places.googleMapsUri,places.rating,places.businessStatus",
    },
    body: JSON.stringify({ textQuery, regionCode: "IN", pageSize: 10 }),
  });
  if (!res.ok) {
    console.error("[places]", res.status, (await res.text()).slice(0, 200));
    return null;
  }
  const { places = [] } = await res.json();
  return places
    .filter((place: { businessStatus?: string }) => !place.businessStatus || place.businessStatus === "OPERATIONAL")
    .map((place: Record<string, never>) => ({
      name: (place.displayName as { text?: string })?.text ?? "",
      address: place.formattedAddress ?? "",
      phone: place.internationalPhoneNumber ?? null,
      website: place.websiteUri ?? null,
      mapsUrl: place.googleMapsUri ?? null,
      rating: place.rating ?? null,
    }));
}
