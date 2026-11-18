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

interface Lga {
    state: States;
    lga: string;
}

type Ownership = "federal" | "state" | "private";
type HospitalType =
    | "general"
    | "teaching"
    | "specialist"
    | "psychiatric"
    | "orthopaedic"
    | "eye"
    | "ear"
    | "maternity"
    | "other";
type HospitalStatus =
    | "unclaimed"
    | "claim_pending"
    | "claimed"
    | "verification_pending"
    | "verified"
    | "rejected"
    | "suspended";

type Insurance =
    | "nhis"
    | "hmo"
    | "out-of-pocket"
    | "unknown";

type Accreditation =
    | "accredited"
    | "not-accredited"
    | "unknown";

type VerificationStatus =
    | "unclaimed"
    | "claim_pending"
    | "claimed"
    | "verified"
    | "verification_pending"
    | "rejected"
    | "suspended";

interface PlaceLocation {
    latitude: number | null;
    longitude: number | null;
}


interface HospitalData {
    hospital_name: string;
    location: {
        state: States | `${States} State`;
        city: string;
        address?: string;
        coordinates: PlaceLocation;
    };
    contact: {
        phone_number: string[];
        email: string[];
        website: string;
        social_media: Record<string, string>;
    };
    services: string[];
    info: {
        hours: `${string} - ${string}`; // e.g "08:00 - 23:00"
        facilities: string[];
        insurance: ("nhis" | "hmo" | "out-of-pocket" | "unknown")[];
        accreditation: ("accredited" | "not-accredited" | "unknown")[];
    };
    hospital_type: HospitalType;
    ownership: Ownership;
    verification_status: VerificationStatus
}