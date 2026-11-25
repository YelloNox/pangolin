import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import {
    db,
    resourcePolicies,
    resourcePolicies,
    resourcePolicyRules,
    resourceRulePolicies,
    resources
} from "@server/db";
import { and, asc, eq, sql } from "drizzle-orm";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { fromError } from "zod-validation-error";
import { OpenAPITags, registry } from "@server/openApi";

const resourceIdParamsSchema = z.strictObject({
    resourceId: z.coerce.number().int().positive()
});

const stackIdParamsSchema = z.strictObject({
    resourceId: z.coerce.number().int().positive(),
    resourcePolicyId: z.coerce.number().int().positive()
});

const attachResourceRulePolicyBodySchema = z.strictObject({
    resourcePolicyId: z.int().positive(),
    position: z.enum(["before", "after"]).default("after"),
    sortOrder: z.int().min(0).default(0),
    enabled: z.boolean().default(true)
});

const updateResourceRulePolicyBodySchema = z
    .strictObject({
        position: z.enum(["before", "after"]).optional(),
        sortOrder: z.int().min(0).optional(),
        enabled: z.boolean().optional()
    })
    .refine((data) => Object.keys(data).length > 0, {
        message: "At least one field must be provided"
    });

function registerPair(
    method: "get" | "put" | "post" | "delete",
    description: string,
    params: z.ZodObject<any>,
    body?: z.ZodTypeAny
) {
    for (const path of [
        `/resource/{resourceId}/rule-policies`,
        `/public-resource/{resourceId}/rule-policies`
    ]) {
        registry.registerPath({
            method,
            path,
            description,
            tags: [OpenAPITags.PublicResource, OpenAPITags.Rule],
            request: {
                params,
                ...(body
                    ? {
                          body: {
                              content: { "application/json": { schema: body } }
                          }
                      }
                    : {})
            },
            responses: {}
        });
    }
}

export type StackedResourceRulePolicy = {
    resourcePolicyId: number;
    name: string;
    niceId: string;
    position: "before" | "after";
    sortOrder: number;
    enabled: boolean;
    ruleCount: number;
};

export type ListResourceRulePoliciesResponse = {
    rulePolicies: StackedResourceRulePolicy[];
};

registerPair(
    "get",
    "List the access-rules-only policies stacked onto a resource, in evaluation order.",
    resourceIdParamsSchema
);
registerPair(
    "put",
    "Stack an access-rules-only policy onto a resource. The policy's rules are evaluated before or after the resource's own rules without disabling them.",
    resourceIdParamsSchema,
    attachResourceRulePolicyBodySchema
);
registerPair(
    "post",
    "Update a stacked access-rules-only policy on a resource (position, order, enabled).",
    stackIdParamsSchema,
    updateResourceRulePolicyBodySchema
);
registerPair(
    "delete",
    "Remove a stacked access-rules-only policy from a resource.",
    stackIdParamsSchema
);

/**
 * GET /resource/:resourceId/rule-policies
 *
 * Lists the stacked rules-only policies for a resource with their rule counts,
 * ordered by position group then sortOrder.
 */
export async function listResourceRulePolicies(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedParams = resourceIdParamsSchema.safeParse(req.params);
        if (!parsedParams.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedParams.error).toString()
                )
            );
        }

        const { resourceId } = parsedParams.data;

        const rows = await db
            .select({
                resourcePolicyId: resourceRulePolicies.resourcePolicyId,
                name: resourcePolicies.name,
                niceId: resourcePolicies.niceId,
                position: resourceRulePolicies.position,
                sortOrder: resourceRulePolicies.sortOrder,
                enabled: resourceRulePolicies.enabled,
                ruleCount: sql<number>`(select count(*) from ${resourcePolicyRules} where ${resourcePolicyRules.resourcePolicyId} = ${resourceRulePolicies.resourcePolicyId})`
            })
            .from(resourceRulePolicies)
            .innerJoin(
                resourcePolicies,
                eq(
                    resourcePolicies.resourcePolicyId,
                    resourceRulePolicies.resourcePolicyId
                )
            )
            .where(eq(resourceRulePolicies.resourceId, resourceId))
            .orderBy(
                asc(resourceRulePolicies.position),
                asc(resourceRulePolicies.sortOrder),
                asc(resourceRulePolicies.id)
            );

        return response<ListResourceRulePoliciesResponse>(res, {
            data: { rulePolicies: rows },
            success: true,
            error: false,
            message: "Resource rule policies retrieved successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}

/**
 * PUT /resource/:resourceId/rule-policy
 *
 * Stacks an access-rules-only policy onto a resource. The policy must exist,
 * belong to the resource's organization, and be scope "rules-only".
 */
export async function attachResourceRulePolicy(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedParams = resourceIdParamsSchema.safeParse(req.params);
        if (!parsedParams.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedParams.error).toString()
                )
            );
        }

        const parsedBody = attachResourceRulePolicyBodySchema.safeParse(
            req.body
        );
        if (!parsedBody.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedBody.error).toString()
                )
            );
        }

        const { resourceId } = parsedParams.data;
        const { resourcePolicyId, position, sortOrder, enabled } =
            parsedBody.data;

        const [resource] = await db
            .select({
                resourceId: resources.resourceId,
                orgId: resources.orgId
            })
            .from(resources)
            .where(eq(resources.resourceId, resourceId))
            .limit(1);

        if (!resource) {
            return next(
                createHttpError(
                    HttpCode.NOT_FOUND,
                    `Resource with ID ${resourceId} not found`
                )
            );
        }

        const [policy] = await db
            .select({
                resourcePolicyId: resourcePolicies.resourcePolicyId,
                orgId: resourcePolicies.orgId,
                scope: resourcePolicies.scope
            })
            .from(resourcePolicies)
            .where(eq(resourcePolicies.resourcePolicyId, resourcePolicyId))
            .limit(1);

        if (!policy) {
            return next(
                createHttpError(
                    HttpCode.NOT_FOUND,
                    `Resource policy with ID ${resourcePolicyId} not found`
                )
            );
        }

        if (policy.orgId !== resource.orgId) {
            return next(
                createHttpError(
                    HttpCode.FORBIDDEN,
                    "Resource policy does not belong to this organization"
                )
            );
        }

        if (policy.scope !== "rules-only") {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    "Only access-rules-only policies can be stacked onto a resource"
                )
            );
        }

        const [existing] = await db
            .select({ id: resourceRulePolicies.id })
            .from(resourceRulePolicies)
            .where(
                and(
                    eq(resourceRulePolicies.resourceId, resourceId),
                    eq(resourceRulePolicies.resourcePolicyId, resourcePolicyId)
                )
            )
            .limit(1);

        if (existing) {
            return next(
                createHttpError(
                    HttpCode.CONFLICT,
                    "This policy is already stacked onto the resource"
                )
            );
        }

        const [created] = await db
            .insert(resourceRulePolicies)
            .values({
                resourceId,
                resourcePolicyId,
                position,
                sortOrder,
                enabled
            })
            .returning();

        return response(res, {
            data: created,
            success: true,
            error: false,
            message: "Resource rule policy attached successfully",
            status: HttpCode.CREATED
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}

/**
 * POST /resource/:resourceId/rule-policy/:resourcePolicyId
 *
 * Updates the position, order, or enabled flag of a stacked policy.
 */
export async function updateResourceRulePolicy(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedParams = stackIdParamsSchema.safeParse(req.params);
        if (!parsedParams.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedParams.error).toString()
                )
            );
        }

        const parsedBody = updateResourceRulePolicyBodySchema.safeParse(
            req.body
        );
        if (!parsedBody.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedBody.error).toString()
                )
            );
        }

        const { resourceId, resourcePolicyId } = parsedParams.data;
        const updateData = parsedBody.data;

        const [existing] = await db
            .select()
            .from(resourceRulePolicies)
            .where(
                and(
                    eq(resourceRulePolicies.resourceId, resourceId),
                    eq(resourceRulePolicies.resourcePolicyId, resourcePolicyId)
                )
            )
            .limit(1);

        if (!existing) {
            return next(
                createHttpError(
                    HttpCode.NOT_FOUND,
                    "This policy is not stacked onto the resource"
                )
            );
        }

        const [updated] = await db
            .update(resourceRulePolicies)
            .set(updateData)
            .where(eq(resourceRulePolicies.id, existing.id))
            .returning();

        return response(res, {
            data: updated,
            success: true,
            error: false,
            message: "Resource rule policy updated successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}

/**
 * DELETE /resource/:resourceId/rule-policy/:resourcePolicyId
 *
 * Removes a stacked policy from a resource.
 */
export async function detachResourceRulePolicy(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedParams = stackIdParamsSchema.safeParse(req.params);
        if (!parsedParams.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedParams.error).toString()
                )
            );
        }

        const { resourceId, resourcePolicyId } = parsedParams.data;

        const [existing] = await db
            .select({ id: resourceRulePolicies.id })
            .from(resourceRulePolicies)
            .where(
                and(
                    eq(resourceRulePolicies.resourceId, resourceId),
                    eq(resourceRulePolicies.resourcePolicyId, resourcePolicyId)
                )
            )
            .limit(1);

        if (!existing) {
            return next(
                createHttpError(
                    HttpCode.NOT_FOUND,
                    "This policy is not stacked onto the resource"
                )
            );
        }

        await db
            .delete(resourceRulePolicies)
            .where(eq(resourceRulePolicies.id, existing.id));

        return response(res, {
            data: null,
            success: true,
            error: false,
            message: "Resource rule policy detached successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
