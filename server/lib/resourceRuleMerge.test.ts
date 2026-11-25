import { assertEquals, assertEqualsObj } from "../../test/assert";
import {
    mergeResourceRules,
    type MergeableRule,
    type StackedRule
} from "./resourceRuleMerge";

function rule(
    ruleId: number,
    priority: number,
    action: "ACCEPT" | "DROP" | "PASS" = "DROP"
): MergeableRule {
    return {
        ruleId,
        resourceId: 1,
        enabled: true,
        priority,
        action,
        match: "IP",
        value: "1.2.3.4"
    };
}

function stacked(
    ruleId: number,
    priority: number,
    sortOrder: number
): StackedRule {
    return { ...rule(ruleId, priority), sortOrder };
}

function runTests() {
    // Empty input produces an empty list.
    assertEquals(
        mergeResourceRules({
            stacksBefore: [],
            direct: [],
            policy: [],
            stacksAfter: [],
            includeBaseRules: true
        }).length,
        0,
        "empty merge returns empty list"
    );

    // Base rules only: direct rules sort ahead of policy rules and priorities
    // are renumbered 1..N (direct first, policy offset by max direct).
    const baseOnly = mergeResourceRules({
        stacksBefore: [],
        direct: [rule(1, 5), rule(2, 2)],
        policy: [rule(3, 1), rule(4, 3)],
        stacksAfter: [],
        includeBaseRules: true
    });
    assertEqualsObj(
        baseOnly.map((r) => r.ruleId),
        [2, 1, 3, 4],
        "direct rules sort by priority, then policy rules follow"
    );
    assertEqualsObj(
        baseOnly.map((r) => r.priority),
        [1, 2, 3, 4],
        "priorities are renumbered sequentially"
    );

    // includeBaseRules false: base rules are skipped entirely.
    const stacksOnly = mergeResourceRules({
        stacksBefore: [stacked(10, 1, 0)],
        direct: [rule(1, 1)],
        policy: [rule(3, 1)],
        stacksAfter: [stacked(11, 1, 0)],
        includeBaseRules: false
    });
    assertEqualsObj(
        stacksOnly.map((r) => r.ruleId),
        [10, 11],
        "base rules excluded when includeBaseRules is false"
    );

    // Stacks before/after wrap the base rules.
    const full = mergeResourceRules({
        stacksBefore: [stacked(10, 1, 0)],
        direct: [rule(1, 1)],
        policy: [rule(3, 1)],
        stacksAfter: [stacked(11, 1, 0)],
        includeBaseRules: true
    });
    assertEqualsObj(
        full.map((r) => r.ruleId),
        [10, 1, 3, 11],
        "before stacks first, base rules middle, after stacks last"
    );
    assertEqualsObj(
        full.map((r) => r.priority),
        [1, 2, 3, 4],
        "merged list renumbered 1..N"
    );

    // Multiple stacks in the same group order by sortOrder, then priority.
    const multiStack = mergeResourceRules({
        stacksBefore: [
            stacked(20, 2, 1),
            stacked(21, 1, 0),
            stacked(22, 5, 1),
            stacked(23, 1, 1)
        ],
        direct: [],
        policy: [],
        stacksAfter: [],
        includeBaseRules: true
    });
    assertEqualsObj(
        multiStack.map((r) => r.ruleId),
        [21, 23, 20, 22],
        "stacks in one group sort by sortOrder then priority"
    );

    // Stacks keep their enabled flag through the merge.
    const disabledStack: StackedRule = { ...stacked(30, 1, 0), enabled: false };
    const withDisabled = mergeResourceRules({
        stacksBefore: [disabledStack],
        direct: [],
        policy: [],
        stacksAfter: [],
        includeBaseRules: true
    });
    assertEquals(
        withDisabled.length,
        1,
        "disabled stack rows are kept (caller skips them)"
    );
    assertEquals(
        withDisabled[0].enabled,
        false,
        "enabled flag survives the merge"
    );

    console.log("PASS: resource rule merge layers and renumbers correctly");
}

runTests();
