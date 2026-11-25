import { db, resourcePolicies } from "@server/db";
import { eq } from "drizzle-orm";
import type { NextFunction, Response } from "express";
import createHttpError from "http-errors";
import HttpCode from "@server/types/HttpCode";

/**
 * Access-rules-only policies carry no authentication stack (no SSO, users,
 * roles, password, pincode, header auth, email whitelist, or mTLS). Guard the
 * endpoints that write those fields so a rules-only policy can never end up
 * with auth data that the UI never shows and the matcher never applies.
 *
 * Returns a truthy value (and calls `next` with a 400) when the policy is
 * rules-only, so callers use it as `if (await rejectIfRulesOnly(...)) return;`.
 */
export async function rejectIfRulesOnlyPolicy(
    resourcePolicyId: number,
    next: NextFunction
): Promise<boolean> {
    const [policy] = await db
        .select({ scope: resourcePolicies.scope })
        .from(resourcePolicies)
        .where(eq(resourcePolicies.resourcePolicyId, resourcePolicyId))
        .limit(1);

    if (!policy) {
        next(createHttpError(HttpCode.NOT_FOUND, "Resource policy not found"));
        return true;
    }

    if (policy.scope === "rules-only") {
        next(
            createHttpError(
                HttpCode.BAD_REQUEST,
                "Access-rules-only policies do not support authentication settings"
            )
        );
        return true;
    }

    return false;
}
