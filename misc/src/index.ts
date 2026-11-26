import { dirname } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { pool } from "./config.js";
import { classifyDistance, getAddress, getDistance } from "./utils.js";
import type { GetAddressProps, SqlQueryParams, States, UUID } from "./types.js";


async function main() {
    try {
        console.log("Starting")
        const ADDRESSES_SAVE_URL = new URL("./data/addresses.json", import.meta.url);
        const FAILED_ADDRESS_CHECKS_URL = new URL("./data/failed-address-checks.json", import.meta.url);
        const ADDRESSES_SAVE_PATH = fileURLToPath(ADDRESSES_SAVE_URL);
        const FAILED_ADDRESS_CHECKS_PATH = fileURLToPath(FAILED_ADDRESS_CHECKS_URL);

        // Fetch null address with a limit of rows according to apikeys length... But it's better to use a constant batch size... Maybe 500
        let query = `
            SELECT h.id, h.hospital_name AS name, h.latitude AS latitude, h.longitude AS longitude, s.name AS state, l.name AS lga 
            FROM hospitals h 
            INNER JOIN states s ON s.id = h.state_id 
            LEFT JOIN lgas l ON h.lga_id = l.id
            WHERE h.address IS null AND h.latitude IS NOT NULL AND h.longitude IS NOT NULL
        `
        query += ` ORDER BY h.state_id, h.id LIMIT 2`
        const { rows } = await pool.query<SqlQueryParams>(query)
        if (!rows.length) {
            console.log("No hospitals require address resolution.");
            return;
        }

        const addressesData: GetAddressProps[] = [];
        const failedChecks: {
            hospital_id: UUID;
            hospitalName: string;
            searchQuery: string
        }[] = [];

        await mkdir(dirname(ADDRESSES_SAVE_PATH), { recursive: true });
        await mkdir(dirname(FAILED_ADDRESS_CHECKS_PATH), { recursive: true });

        const saveProgress = async () => {
            await writeFile(ADDRESSES_SAVE_PATH, JSON.stringify(addressesData, null, 2));
            await writeFile(FAILED_ADDRESS_CHECKS_PATH, JSON.stringify(failedChecks, null, 2));
        };

        let processedCount = 0;
        try {
            for (const r of rows) {
                const searchQuery = ([r.name, r.lga, r.state, "Nigeria"]
                    .filter(Boolean)
                    .join(", ")
                )

                console.log(
                    `[${processedCount + 1}/${rows.length}] Processing: ${r.name}`
                );

                const addressData = await getAddress(searchQuery);
                if (!addressData.length) {
                    failedChecks.push({ hospital_id: r.id, hospitalName: r.name, searchQuery })
                } else {
                    const rankedCandidates = addressData
                        .map(candidate => {
                            const distance = (
                                r.latitude !== null &&
                                r.longitude !== null &&
                                candidate.latitude !== null &&
                                candidate.longitude !== null
                            )
                                ? getDistance(
                                    r.latitude,
                                    r.longitude,
                                    candidate.latitude,
                                    candidate.longitude
                                )
                                : null;

                            return {
                                ...candidate,
                                distance,
                                match: classifyDistance(distance)
                            };
                        })
                        .sort((a, b) => {
                            if (a.distance === null) return b.distance === null ? 0 : 1;
                            if (b.distance === null) return -1;

                            return a.distance - b.distance;
                        });

                    addressesData.push({
                        hospital_id: r.id,
                        hospitalName: r.name,
                        state: r.state as States,
                        latitude: r.latitude,
                        longitude: r.longitude,
                        candidates: rankedCandidates
                    });
                };
                processedCount++;
                if (processedCount % 10 === 0) {
                    await saveProgress();
                    console.log(`Progress saved: ${processedCount}/${rows.length}`);
                }
            };
        } finally {
            await saveProgress();
            console.log(`Progress saved: ${processedCount}/${rows.length}`);
        }
    } catch (err) {
        console.error(err);
        process.exitCode = 1
    }
}

void main();