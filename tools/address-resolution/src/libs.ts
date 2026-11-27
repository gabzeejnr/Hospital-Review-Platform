import "dotenv/config";

const GOOGLE_PLACES_API_KEYS = [
    process.env.GOOGLE_PLACES_API_KEY_1!,
    process.env.GOOGLE_PLACES_API_KEY_2!
].filter(Boolean);

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));


export { delay, GOOGLE_PLACES_API_KEYS }