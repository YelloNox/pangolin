/**
 * Merges the rule layers that decide access for a single resource.
 *
 * Layers, in evaluation order:
 *   1. Stacked rules-only policies positioned "before"
 *   2. The resource's own rules (direct + assigned policy), only when
 *      includeBaseRules is true
 *   3. Stacked rules-only policies positioned "after"
 *
 * Stacked policies are an independent layer: they evaluate whenever their own
 * row is enabled, regardless of the resource's `applyRules` flag. The base
 * rules keep the existing semantics and are skipped when `applyRules` is off.
 *
 * Priorities are renumbered 1..N over the merged list so the caller's
 * "sort by priority, first match wins" loop sees the layer order. Renumbering
 * is behavior-preserving: the relative order of the base rules is unchanged
 * (direct rules already always sort ahead of policy rules, which are offset by
 * the highest direct priority).
 */

export type MergeableRule = {
    ruleId: number;
    resourceId: number;
    enabled: boolean;
    priority: number;
    action: string;
    match: string;
    value: string;
};

/** A rule that came from a stacked policy, carrying its stack's sort order. */
export type StackedRule<T extends MergeableRule = MergeableRule> = T & {
    sortOrder: number;
};

export type MergeResourceRulesInput<T extends MergeableRule = MergeableRule> = {
    /** Enabled stacks with position "before", any order. */
    stacksBefore: StackedRule<T>[];
    /** The resource's own rules. Used only when includeBaseRules is true. */
    direct: T[];
    /** Rules of the assigned policy. Used only when includeBaseRules is true. */
    policy: T[];
    /** Enabled stacks with position "after", any order. */
    stacksAfter: StackedRule<T>[];
    /** Whether the base rules evaluate (the effective `applyRules` flag). */
    includeBaseRules: boolean;
};

function byPriority<T extends MergeableRule>(a: T, b: T): number {
    return a.priority - b.priority;
}

function byStackOrder<T extends MergeableRule>(
    a: StackedRule<T>,
    b: StackedRule<T>
): number {
    return a.sortOrder - b.sortOrder || a.priority - b.priority;
}

export function mergeResourceRules<T extends MergeableRule = MergeableRule>({
    stacksBefore,
    direct,
    policy,
    stacksAfter,
    includeBaseRules
}: MergeResourceRulesInput<T>): T[] {
    const ordered: T[] = [];

    ordered.push(...[...stacksBefore].sort(byStackOrder));

    if (includeBaseRules) {
        const directSorted = [...direct].sort(byPriority);
        const maxDirectPriority = directSorted.reduce(
            (max, rule) => Math.max(max, rule.priority),
            0
        );
        ordered.push(...directSorted);
        ordered.push(
            ...[...policy].sort(byPriority).map((rule) => ({
                ...rule,
                priority: maxDirectPriority + rule.priority
            }))
        );
    }

    ordered.push(...[...stacksAfter].sort(byStackOrder));

    return ordered.map((rule, index) => ({ ...rule, priority: index + 1 }));
}
