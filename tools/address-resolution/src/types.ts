type UUID = `${string}-${string}-${string}-${string}-${string}`
type MatchConfidence = "high" | "medium" | "low" | "unmatched";
type States = |
    "Abia"
    | "Adamawa"
    | "Akwa Ibom"
    | "Anambra"
    | "Bauchi"
    | "Bayelsa"
    | "Benue"
    | "Borno"
    | "Cross River"
    | "Delta"
    | "Ebonyi"
    | "Edo"
    | "Ekiti"
    | "Enugu"
    | "Gombe"
    | "Imo"
    | "Jigawa"
    | "Kaduna"
    | "Kano"
    | "Katsina"
    | "Kebbi"
    | "Kogi"
    | "Kwara"
    | "Lagos"
    | "Nasarawa"
    | "Niger"
    | "Ogun"
    | "Ondo"
    | "Osun"
    | "Oyo"
    | "Plateau"
    | "Rivers"
    | "Sokoto"
    | "Taraba"
    | "Yobe"
    | "Zamfara"
    | "FCT";

interface SqlQueryParams {
    id: UUID;
    name: string;
    state: string;
    lga: string | null;
    latitude: number;
    longitude: number;
}


interface AddressProps {
    placeId: string | null;
    formattedAddress: string | null;
    displayName: string | null;
    latitude: number | null;
    longitude: number | null;
}

interface RankedAddressProps extends AddressProps {
    distance: number | null;
    match: MatchConfidence;
}

interface GooglePlace {
    id?: string;
    formattedAddress?: string;
    displayName?: {
        text?: string;
        languageCode?: string;
    };
    location?: {
        latitude: number;
        longitude: number;
    }
}


interface GetAddressProps {
    hospital_id: UUID;
    hospitalName: string;
    state: States;
    latitude: number;
    longitude: number;
    candidates: RankedAddressProps[];
}


export type { AddressProps, GooglePlace, MatchConfidence, RankedAddressProps, GetAddressProps, States, SqlQueryParams, UUID }