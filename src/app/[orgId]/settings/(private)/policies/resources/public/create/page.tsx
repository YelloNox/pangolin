import { CreatePolicyForm } from "@app/components/resource-policy/CreatePolicyForm";
import SettingsSectionTitle from "@app/components/SettingsSectionTitle";
import { Button } from "@app/components/ui/button";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

export interface CreateResourcePolicyPageProps {
    params: Promise<{ orgId: string }>;
    searchParams: Promise<Record<string, string>>;
}

export default async function CreateResourcePolicyPage(
    props: CreateResourcePolicyPageProps
) {
    const params = await props.params;
    const searchParams = await props.searchParams;
    const t = await getTranslations();

    const scope = searchParams.scope === "rules-only" ? "rules-only" : "global";

    return (
        <>
            <div className="flex justify-between">
                <SettingsSectionTitle
                    title={
                        scope === "rules-only"
                            ? t("resourcePoliciesCreateRulesOnly")
                            : t("resourcePoliciesCreate")
                    }
                    description={
                        scope === "rules-only"
                            ? t("resourcePoliciesCreateRulesOnlyDescription")
                            : t("resourcePoliciesCreateDescription")
                    }
                />

                <Button asChild variant="outline">
                    <Link
                        href={`/${params.orgId}/settings/policies/resources/public`}
                    >
                        {t("resourcePoliciesSeeAll")}
                    </Link>
                </Button>
            </div>

            <CreatePolicyForm scope={scope} />
        </>
    );
}
