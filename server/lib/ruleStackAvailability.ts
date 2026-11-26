/**
 * Tracks whether the `resourceRulePolicies` table can be queried.
 *
 * The table is created by a migration that ships with a later release, so an
 * existing database can be running this code before the table exists. Anything
 * that reads the stack table must degrade to "no stacks" instead of failing,
 * otherwise unrelated features (shared policy list, rule evaluation, blueprint
 * export) break on databases that have not been upgraded yet.
 *
 * The flag is process-wide: the first failure marks the table unavailable so
 * we log once and skip the query instead of throwing (and spamming logs) on
 * every request.
 */
import logger from "@server/logger";

let tableAvailable = true;

export function isRuleStackTableAvailable(): boolean {
    return tableAvailable;
}

export function markRuleStackTableUnavailable(error?: unknown): void {
    if (tableAvailable) {
        tableAvailable = false;
        logger.warn({
            msg: "resourceRulePolicies table is unavailable; stacked access rules are disabled until the database is migrated",
            error
        });
    }
}

/**
 * True when the error is the database telling us the table is not there yet
 * (SQLite: "no such table", Postgres: "relation ... does not exist").
 */
export function isMissingRuleStackTableError(error: unknown): boolean {
    const message =
        typeof error === "object" &&
        error !== null &&
        "message" in error &&
        typeof (error as { message: unknown }).message === "string"
            ? (error as { message: string }).message
            : String(error ?? "");

    return (
        /no such table/i.test(message) ||
        /does not exist/i.test(message) ||
        /resourceRulePolicies/i.test(message)
    );
}

/**
 * Handle a failed read of the stack table: mark it unavailable when that's the
 * cause and re-throw anything else, so real query problems stay visible.
 */
export function handleRuleStackReadError(error: unknown): never {
    if (isMissingRuleStackTableError(error)) {
        markRuleStackTableUnavailable(error);
    }
    throw error;
}
