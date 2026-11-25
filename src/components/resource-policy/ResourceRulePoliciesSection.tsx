"use client";

import { Button } from "@app/components/ui/button";
import { Checkbox } from "@app/components/ui/checkbox";
import { Label } from "@app/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@app/components/ui/select";
import { Switch } from "@app/components/ui/switch";
import {
    SettingsSection,
    SettingsSectionBody,
    SettingsSectionDescription,
    SettingsSectionHeader,
    SettingsSectionTitle
} from "@app/components/Settings";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { useOrgContext } from "@app/hooks/useOrgContext";
import { toast } from "@app/hooks/useToast";
import { createApiClient, formatAxiosError } from "@app/lib/api";
import { orgQueries, resourceQueries } from "@app/lib/queries";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { StackedResourceRulePolicy } from "@server/routers/resource/resourceRulePolicies";

type RulePolicyPosition = "before" | "after";

function useRulePolicyMutations(resourceId: number) {
    const t = useTranslations();
    const api = createApiClient(useEnvContext());
    const queryClient = useQueryClient();

    const invalidate = () =>
        queryClient.invalidateQueries({
            queryKey: ["RESOURCES", resourceId, "RULE_POLICIES"]
        });

    async function attach(policyId: number, position: RulePolicyPosition) {
        try {
            await api.put(`/resource/${resourceId}/rule-policies`, {
                resourcePolicyId: policyId,
                position,
                sortOrder: 0,
                enabled: true
            });
            invalidate();
            toast({
                title: t("success"),
                description: t("resourceRulePoliciesAttached")
            });
            return true;
        } catch (e) {
            toast({
                variant: "destructive",
                title: t("resourceRulePoliciesError"),
                description: formatAxiosError(
                    e,
                    t("resourceRulePoliciesErrorDescription")
                )
            });
            return false;
        }
    }

    async function update(
        policyId: number,
        data: {
            position?: RulePolicyPosition;
            sortOrder?: number;
            enabled?: boolean;
        }
    ) {
        try {
            await api.post(
                `/resource/${resourceId}/rule-policies/${policyId}`,
                data
            );
            invalidate();
            return true;
        } catch (e) {
            toast({
                variant: "destructive",
                title: t("resourceRulePoliciesError"),
                description: formatAxiosError(
                    e,
                    t("resourceRulePoliciesErrorDescription")
                )
            });
            return false;
        }
    }

    async function detach(policyId: number) {
        try {
            await api.delete(
                `/resource/${resourceId}/rule-policies/${policyId}`
            );
            invalidate();
            toast({
                title: t("success"),
                description: t("resourceRulePoliciesDetached")
            });
            return true;
        } catch (e) {
            toast({
                variant: "destructive",
                title: t("resourceRulePoliciesError"),
                description: formatAxiosError(
                    e,
                    t("resourceRulePoliciesErrorDescription")
                )
            });
            return false;
        }
    }

    return { attach, update, detach };
}

function useRulesOnlyPolicies() {
    const { org } = useOrgContext();
    const [query, setQuery] = useState("");

    const { data: policies = [] } = useQuery(
        orgQueries.policies({ orgId: org.org.orgId, query })
    );

    const rulesOnlyPolicies = useMemo(
        () => policies.filter((p) => p.scope === "rules-only"),
        [policies]
    );

    return { rulesOnlyPolicies, query, setQuery, orgId: org.org.orgId };
}

// ─── Rules tab box ───────────────────────────────────────────────────────────

export type ResourceRulePoliciesSectionProps = {
    resourceId: number;
    readonly?: boolean;
};

export function ResourceRulePoliciesSection({
    resourceId,
    readonly
}: ResourceRulePoliciesSectionProps) {
    const t = useTranslations();
    const { rulesOnlyPolicies, query, setQuery, orgId } =
        useRulesOnlyPolicies();
    const { attach, update, detach } = useRulePolicyMutations(resourceId);
    const [isPending, startTransition] = useTransition();
    const [showPicker, setShowPicker] = useState(false);

    const { data, isLoading } = useQuery(
        resourceQueries.rulePolicies({ resourceId })
    );

    const stacked = data?.rulePolicies ?? [];
    const stackedIds = new Set(stacked.map((p) => p.resourcePolicyId));
    const available = rulesOnlyPolicies.filter(
        (p) => !stackedIds.has(p.resourcePolicyId)
    );

    return (
        <SettingsSection>
            <SettingsSectionHeader>
                <SettingsSectionTitle>
                    {t("resourceRulePoliciesTitle")}
                </SettingsSectionTitle>
                <SettingsSectionDescription>
                    {t("resourceRulePoliciesDescription")}
                </SettingsSectionDescription>
            </SettingsSectionHeader>
            <SettingsSectionBody>
                <div className="space-y-4">
                    {isLoading ? null : stacked.length === 0 ? (
                        <p className="text-muted-foreground text-sm">
                            {t("resourceRulePoliciesEmpty")}
                        </p>
                    ) : (
                        <div className="divide-border divide-y rounded-md border">
                            {stacked.map((policy) => (
                                <StackedPolicyRow
                                    key={policy.resourcePolicyId}
                                    policy={policy}
                                    orgId={orgId}
                                    readonly={readonly}
                                    isPending={isPending}
                                    onPositionChange={(position) =>
                                        startTransition(() => {
                                            update(policy.resourcePolicyId, {
                                                position
                                            });
                                        })
                                    }
                                    onEnabledChange={(enabled) =>
                                        startTransition(() => {
                                            update(policy.resourcePolicyId, {
                                                enabled
                                            });
                                        })
                                    }
                                    onRemove={() =>
                                        startTransition(() => {
                                            detach(policy.resourcePolicyId);
                                        })
                                    }
                                />
                            ))}
                        </div>
                    )}

                    {!readonly &&
                        (showPicker ? (
                            <RulePolicyPicker
                                available={available}
                                query={query}
                                setQuery={setQuery}
                                isPending={isPending}
                                onPick={(policyId) =>
                                    startTransition(async () => {
                                        const ok = await attach(
                                            policyId,
                                            "after"
                                        );
                                        if (ok) setShowPicker(false);
                                    })
                                }
                                onCancel={() => setShowPicker(false)}
                            />
                        ) : (
                            <Button
                                type="button"
                                variant="outline"
                                disabled={isPending}
                                onClick={() => setShowPicker(true)}
                            >
                                <Plus className="mr-2 h-4 w-4" />
                                {t("resourceRulePoliciesAdd")}
                            </Button>
                        ))}
                </div>
            </SettingsSectionBody>
        </SettingsSection>
    );
}

function StackedPolicyRow({
    policy,
    orgId,
    readonly,
    isPending,
    onPositionChange,
    onEnabledChange,
    onRemove
}: {
    policy: StackedResourceRulePolicy;
    orgId: string;
    readonly?: boolean;
    isPending: boolean;
    onPositionChange: (position: RulePolicyPosition) => void;
    onEnabledChange: (enabled: boolean) => void;
    onRemove: () => void;
}) {
    const t = useTranslations();

    return (
        <div className="flex flex-wrap items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
                <Link
                    href={`/${orgId}/settings/policies/resources/public/${policy.niceId}/rules`}
                    className="text-primary hover:underline truncate text-sm font-medium"
                >
                    {policy.name}
                </Link>
                <p className="text-muted-foreground text-xs">
                    {t("resourceRulePoliciesRulesCount", {
                        count: policy.ruleCount
                    })}
                </p>
            </div>

            <Select
                value={policy.position}
                onValueChange={(value) =>
                    onPositionChange(value as RulePolicyPosition)
                }
                disabled={readonly || isPending}
            >
                <SelectTrigger className="w-[180px]">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="before">
                        {t("resourceRulePoliciesPositionBefore")}
                    </SelectItem>
                    <SelectItem value="after">
                        {t("resourceRulePoliciesPositionAfter")}
                    </SelectItem>
                </SelectContent>
            </Select>

            <div className="flex items-center gap-2">
                <Label
                    htmlFor={`rule-policy-enabled-${policy.resourcePolicyId}`}
                    className="text-muted-foreground text-xs"
                >
                    {t("resourceRulePoliciesEnabled")}
                </Label>
                <Switch
                    id={`rule-policy-enabled-${policy.resourcePolicyId}`}
                    checked={policy.enabled}
                    disabled={readonly || isPending}
                    onCheckedChange={onEnabledChange}
                />
            </div>

            {!readonly && (
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={isPending}
                    onClick={onRemove}
                >
                    <Trash2 className="h-4 w-4" />
                    <span className="sr-only">
                        {t("resourceRulePoliciesRemove")}
                    </span>
                </Button>
            )}
        </div>
    );
}

function RulePolicyPicker({
    available,
    query,
    setQuery,
    isPending,
    onPick,
    onCancel
}: {
    available: { resourcePolicyId: number; name: string }[];
    query: string;
    setQuery: (query: string) => void;
    isPending: boolean;
    onPick: (policyId: number) => void;
    onCancel: () => void;
}) {
    const t = useTranslations();

    return (
        <div className="space-y-2 rounded-md border p-3">
            <input
                className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                placeholder={t("resourcePolicySearch")}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === "Enter") e.preventDefault();
                }}
            />
            {available.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                    {t("resourceRulePoliciesNoPolicies")}
                </p>
            ) : (
                <div className="max-h-48 space-y-1 overflow-y-auto">
                    {available.map((policy) => (
                        <button
                            key={policy.resourcePolicyId}
                            type="button"
                            disabled={isPending}
                            className="hover:bg-accent flex w-full items-center rounded px-2 py-1.5 text-left text-sm"
                            onClick={() => onPick(policy.resourcePolicyId)}
                        >
                            {policy.name}
                        </button>
                    ))}
                </div>
            )}
            <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
                {t("cancel")}
            </Button>
        </div>
    );
}

// ─── General page checkbox picker ────────────────────────────────────────────

export type ResourceRulePoliciesPickerProps = {
    resourceId: number;
    readonly?: boolean;
};

export function ResourceRulePoliciesPicker({
    resourceId,
    readonly
}: ResourceRulePoliciesPickerProps) {
    const t = useTranslations();
    const { rulesOnlyPolicies, query, setQuery } = useRulesOnlyPolicies();
    const { attach, detach } = useRulePolicyMutations(resourceId);
    const [isPending, startTransition] = useTransition();

    const { data } = useQuery(resourceQueries.rulePolicies({ resourceId }));
    const stacked = data?.rulePolicies ?? [];
    const stackedIds = new Set(stacked.map((p) => p.resourcePolicyId));

    // Only render when there are rules-only policies to stack.
    if (rulesOnlyPolicies.length === 0) {
        return null;
    }

    return (
        <div className="space-y-2">
            <input
                className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                placeholder={t("resourcePolicySearch")}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === "Enter") e.preventDefault();
                }}
            />
            <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border p-3">
                {rulesOnlyPolicies.map((policy) => {
                    const checked = stackedIds.has(policy.resourcePolicyId);
                    return (
                        <div
                            key={policy.resourcePolicyId}
                            className="flex items-center gap-2"
                        >
                            <Checkbox
                                id={`stack-${policy.resourcePolicyId}`}
                                checked={checked}
                                disabled={readonly || isPending}
                                onCheckedChange={(value) =>
                                    startTransition(() => {
                                        if (value) {
                                            attach(
                                                policy.resourcePolicyId,
                                                "after"
                                            );
                                        } else {
                                            detach(policy.resourcePolicyId);
                                        }
                                    })
                                }
                            />
                            <Label
                                htmlFor={`stack-${policy.resourcePolicyId}`}
                                className="cursor-pointer text-sm"
                            >
                                {policy.name}
                            </Label>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
