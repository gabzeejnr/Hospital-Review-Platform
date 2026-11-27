import { delay, GOOGLE_PLACES_API_KEYS } from "./libs.js";
import type { AddressProps, GooglePlace, MatchConfidence } from "./types.js";


interface GooglePlacesResponse {
    places?: GooglePlace[];
}

/**
 * 
 * @param textQuery - The search string to search for location
 * @returns A record containing formattedAddress, displayName, latitude and longitude
 * @throws All API keys exhausted or unavailable.
 * @throws Places API error (${response.status}): ${errorText}
 * 
 * @example
 * ```ts
 * const place = await getAddress("ABC Medical Centre, Ikeja, Lagos, Nigeria")
 * ```
 */
async function getAddress(textQuery: string): Promise<AddressProps[]> {
    const url = "https://places.googleapis.com/v1/places:searchText";

    for (const apiKey of GOOGLE_PLACES_API_KEYS) {
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                const response = await fetch(url, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "X-Goog-Api-Key": apiKey,
                        "X-Goog-FieldMask": [
                            "places.formattedAddress",
                            "places.displayName",
                            "places.location",
                            "places.id"
                        ].join(","),
                    },
                    body: JSON.stringify({
                        textQuery,
                        regionCode: "NG",
                        pageSize: 5,
                    }),
                });

                if (response.ok) {
                    const data: GooglePlacesResponse = await response.json();

                    return data.places?.map(p => ({
                        placeId: p.id ?? null,
                        formattedAddress: p.formattedAddress ?? null,
                        displayName: p.displayName?.text ?? null,
                        latitude: p.location?.latitude ?? null,
                        longitude: p.location?.longitude ?? null
                    })) ?? []
                }

                const errorText = await response.text();
                let errorStatus: string | undefined;

                try {
                    errorStatus = JSON.parse(errorText)?.error?.status;
                } catch { }

                if (
                    errorStatus === "RESOURCE_EXHAUSTED" ||
                    response.status === 429 ||
                    response.status === 403
                ) break;

                if (response.status >= 500) {
                    if (attempt < 3) {
                        await delay(attempt * 1000);
                        continue;
                    }
                    break;
                }

                throw new Error(`Places API error (${response.status}): ${errorText}`);
            } catch (err) {
                if (err instanceof TypeError && attempt < 3) {
                    await delay(attempt * 1000);
                    continue;
                }
                throw err;
            }
        }
    }
    throw new Error("All API keys exhausted or unavailable.");
}


/**
 * 
 * @param lat1 - Latitude for the first coordinate
 * @param lon1 - Longitude for the first coordinate
 * @param lat2 - Latitude for the second coordinate
 * @param lon2 - Longitude for the second coordinate
 * 
 * @returns distance - number in kilometers
 */
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const toRad = (d: number) => d * Math.PI / 180;

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a = (
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) ** 2
    )

    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}


/**
 * 
 * @param distance - The number in ```kms``` between coordinates
 * @returns any of ```unmatched```, ```high```, ```medium```, ```low```
 */
function classifyDistance(distance: number | null): MatchConfidence {
    if (distance === null) return "unmatched";
    if (distance <= 0.1) return "high";
    if (distance <= 2) return "medium";
    if (distance <= 10) return "low";

    return "unmatched";
}


export { getAddress, getDistance, classifyDistance }