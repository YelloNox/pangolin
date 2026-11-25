import semver from "semver";

// How to adapt resource access rules for the exit node that requested them.
//
// Kept out of `resourceRuleMatchers.ts` on purpose: that module is imported by
// the dashboard, which should not pull in `semver`.

/**
 * The rule matcher landed in exit node 1.1.0. Before that the node only knew
 * the legacy `GEOIP` name for a country rule.
 */
export const RULE_MATCH_MIN_NODE_VERSION = "1.1.0";

// Match types renamed for a node older than the gate, which knows the old name.
const LEGACY_MATCH_NAMES: Record<string, string> = {
    COUNTRY: "GEOIP"
};

// Match types with no legacy name. A node older than the gate has no branch
// for them and ignores the rule silently, so the server must not send them.
// Kept deliberately narrow: only match types known to post-date the gate.
const LEGACY_UNSUPPORTED_MATCHES = new Set(["COUNTRY_IS_NOT"]);

export type NodeRuleTranslation<T> = {
    /** Rules as they should be sent to this node. */
    rules: T[];
    /**
     * Match types the node cannot evaluate. The caller must not send these:
     * an old node drops the rule silently, so a `DROP` rule would open access.
     */
    unsupportedMatches: string[];
};

/**
 * Adapt rules for the exit node that requested them.
 *
 * Renames `COUNTRY` to the legacy `GEOIP` for nodes older than
 * {@link RULE_MATCH_MIN_NODE_VERSION} and reports match types the node
 * predates. An unparseable version is treated as old, which is the safe
 * direction: the rule set is downgraded and newer match types are refused.
 *
 * Pure so it can be unit tested; the route that serves rules lives in
 * `server/private/routers/hybrid.ts`, and `npm test` does not collect tests
 * under a `private` directory.
 */
export function translateRulesForNodeVersion<T extends { match: string }>(
    rules: T[],
    secondaryVersion: string | null | undefined
): NodeRuleTranslation<T> {
    const isLegacy =
        !secondaryVersion ||
        !semver.valid(secondaryVersion) ||
        semver.lt(secondaryVersion, RULE_MATCH_MIN_NODE_VERSION);

    if (!isLegacy) {
        return { rules, unsupportedMatches: [] };
    }

    const unsupportedMatches: string[] = [];

    const translated = rules.map((rule) => {
        const legacyName = LEGACY_MATCH_NAMES[rule.match];
        if (legacyName) {
            // The legacy name is not part of the modern match union, so this
            // stays a string at runtime for old nodes to read.
            return { ...rule, match: legacyName } as T;
        }

        if (
            LEGACY_UNSUPPORTED_MATCHES.has(rule.match) &&
            !unsupportedMatches.includes(rule.match)
        ) {
            unsupportedMatches.push(rule.match);
        }

        return rule;
    });

    return { rules: translated, unsupportedMatches };
}
