import { REGIONS } from "@server/db/regions";

// Pure, dependency-light helpers for evaluating resource access rules.
//
// This module deliberately imports nothing that touches the database, the
// config file, the logger or `semver`: it is imported by the dashboard, by
// `server/lib/validators.ts`, and by `npm test`, which runs each `*.test.ts`
// in its own process with no app boot. Anything heavier than a data module
// pulls in the config/logger cycle. Keep it that way.

export const ALL_COUNTRY_CODE = "ALL";

// rule.value holds a comma-separated list of country codes, e.g. "US,DE".
// A single code like "US" is also valid (legacy).
export function parseCountryCodeList(value: string): string[] {
    return value
        .split(",")
        .map((c) => c.trim().toUpperCase())
        .filter(Boolean);
}

/**
 * "ALL" is a selector for every country, so it is only meaningful on its own.
 *
 * The country picker used to allow "ALL" alongside specific countries, which
 * stored values like "ALL,DE,US". Treated literally, "ALL" matches every IP, so
 * a COUNTRY_IS_NOT rule containing it matched nothing and silently blocked
 * nobody. Rules saved that way are read as if "ALL" had not been there.
 */
export function isAllCountriesSelector(codes: string[]): boolean {
    return codes.length === 1 && codes[0] === ALL_COUNTRY_CODE;
}

/**
 * True when `ipCountryCode` is one of the countries in `checkCountryCodes`.
 *
 * An "ALL"-only list matches every address, including addresses with no
 * resolvable country. A list that mixes "ALL" with specific codes is read as
 * those codes only (see `isAllCountriesSelector`).
 */
export function isCountryListMatch(
    ipCountryCode: string | undefined,
    checkCountryCodes: string
): boolean {
    const codes = parseCountryCodeList(checkCountryCodes);

    if (isAllCountriesSelector(codes)) {
        return true;
    }

    if (!ipCountryCode) {
        return false;
    }

    return codes.includes(ipCountryCode.toUpperCase());
}

// rule.value holds a comma-separated list of region IDs, e.g. "150,151".
// A single ID like "150" is also valid (legacy).
export function isIpInRegion(
    ipCountryCode: string | undefined,
    checkRegionCodes: string
): boolean {
    if (!ipCountryCode) {
        return false;
    }

    const upperCode = ipCountryCode.toUpperCase();
    const regionIds = checkRegionCodes
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean);

    for (const regionId of regionIds) {
        for (const region of REGIONS) {
            // Check if it's a top-level region (continent)
            if (region.id === regionId) {
                for (const subregion of region.includes) {
                    if (subregion.countries.includes(upperCode)) {
                        return true;
                    }
                }
            }

            // Check subregions
            for (const subregion of region.includes) {
                if (subregion.id === regionId) {
                    if (subregion.countries.includes(upperCode)) {
                        return true;
                    }
                }
            }
        }
    }

    return false;
}

// Region and subregion IDs in the order REGIONS declares them, used to keep a
// stored region list in a stable order so it does not churn on every edit.
export const REGION_ID_ORDER: string[] = REGIONS.flatMap((region) => [
    region.id,
    ...region.includes.map((subregion) => subregion.id)
]);

export function parseRegionIdList(value: string): string[] {
    return value
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean);
}

// Orders a list by a reference list, appending anything the reference list
// does not know in the order it appeared, so a stored value stays stable
// across edits and an unknown value is never silently dropped.
export function orderByReference(
    items: string[],
    reference: string[]
): string[] {
    const seen = new Set<string>();
    const unique = items.filter((item) => {
        if (seen.has(item)) {
            return false;
        }
        seen.add(item);
        return true;
    });

    const known = reference.filter((id) => seen.has(id));
    const unknown = unique.filter((item) => !reference.includes(item));

    return [...known, ...unknown];
}

export function orderRegionIds(ids: string[]): string[] {
    return orderByReference(ids, REGION_ID_ORDER);
}
