import { assertEquals } from "@test/assert";
import { isPathAllowed } from "@server/lib/pathMatch";
import {
    isAllCountriesSelector,
    isCountryListMatch,
    isIpInRegion,
    parseCountryCodeList
} from "@server/lib/resourceRuleMatchers";
import { translateRulesForNodeVersion } from "@server/lib/nodeRuleTranslation";

function runTests() {
    console.log("Running path matching tests...");

    // Test exact matching
    assertEquals(
        isPathAllowed("foo", "foo"),
        true,
        "Exact match should be allowed"
    );
    assertEquals(
        isPathAllowed("foo", "bar"),
        false,
        "Different segments should not match"
    );
    assertEquals(
        isPathAllowed("foo/bar", "foo/bar"),
        true,
        "Exact multi-segment match should be allowed"
    );
    assertEquals(
        isPathAllowed("foo/bar", "foo/baz"),
        false,
        "Partial multi-segment match should not be allowed"
    );

    // Test with leading and trailing slashes
    assertEquals(
        isPathAllowed("/foo", "foo"),
        true,
        "Pattern with leading slash should match"
    );
    assertEquals(
        isPathAllowed("foo/", "foo"),
        true,
        "Pattern with trailing slash should match"
    );
    assertEquals(
        isPathAllowed("/foo/", "foo"),
        true,
        "Pattern with both leading and trailing slashes should match"
    );

    // Test simple wildcard matching
    assertEquals(
        isPathAllowed("*", "foo"),
        true,
        "Single wildcard should match any single segment"
    );
    assertEquals(
        isPathAllowed("*", "foo/bar"),
        true,
        "Single wildcard should match multiple segments"
    );
    assertEquals(
        isPathAllowed("*/bar", "foo/bar"),
        true,
        "Wildcard prefix should match"
    );
    assertEquals(
        isPathAllowed("foo/*", "foo/bar"),
        true,
        "Wildcard suffix should match"
    );
    assertEquals(
        isPathAllowed("foo/*/baz", "foo/bar/baz"),
        true,
        "Wildcard in middle should match"
    );

    // Test multiple wildcards
    assertEquals(
        isPathAllowed("*/*", "foo/bar"),
        true,
        "Multiple wildcards should match corresponding segments"
    );
    assertEquals(
        isPathAllowed("*/*/*", "foo/bar/baz"),
        true,
        "Three wildcards should match three segments"
    );
    assertEquals(
        isPathAllowed("foo/*/*", "foo/bar/baz"),
        true,
        "Specific prefix with wildcards should match"
    );
    assertEquals(
        isPathAllowed("*/*/baz", "foo/bar/baz"),
        true,
        "Wildcards with specific suffix should match"
    );

    // Test wildcard consumption behavior
    assertEquals(
        isPathAllowed("*", ""),
        true,
        "Wildcard should optionally consume segments"
    );
    assertEquals(
        isPathAllowed("foo/*", "foo"),
        true,
        "Trailing wildcard should be optional"
    );
    assertEquals(
        isPathAllowed("*/*", "foo"),
        true,
        "Multiple wildcards can match fewer segments"
    );
    assertEquals(
        isPathAllowed("*/*/*", "foo/bar"),
        true,
        "Extra wildcards can be skipped"
    );

    // Test complex nested paths
    assertEquals(
        isPathAllowed("api/*/users", "api/v1/users"),
        true,
        "API versioning pattern should match"
    );
    assertEquals(
        isPathAllowed("api/*/users/*", "api/v1/users/123"),
        true,
        "API resource pattern should match"
    );
    assertEquals(
        isPathAllowed("api/*/users/*/profile", "api/v1/users/123/profile"),
        true,
        "Nested API pattern should match"
    );

    // Test for the requested padbootstrap* pattern
    assertEquals(
        isPathAllowed("padbootstrap*", "padbootstrap"),
        true,
        "padbootstrap* should match padbootstrap"
    );
    assertEquals(
        isPathAllowed("padbootstrap*", "padbootstrapv1"),
        true,
        "padbootstrap* should match padbootstrapv1"
    );
    assertEquals(
        isPathAllowed("padbootstrap*", "padbootstrap/files"),
        false,
        "padbootstrap* should not match padbootstrap/files"
    );
    assertEquals(
        isPathAllowed("padbootstrap*/*", "padbootstrap/files"),
        true,
        "padbootstrap*/* should match padbootstrap/files"
    );
    assertEquals(
        isPathAllowed("padbootstrap*/files", "padbootstrapv1/files"),
        true,
        "padbootstrap*/files should not match padbootstrapv1/files (wildcard is segment-based, not partial)"
    );

    // Test wildcard edge cases
    assertEquals(
        isPathAllowed("*/*/*/*/*/*", "a/b"),
        true,
        "Many wildcards can match few segments"
    );
    assertEquals(
        isPathAllowed("a/*/b/*/c", "a/anything/b/something/c"),
        true,
        "Multiple wildcards in pattern should match corresponding segments"
    );

    // Test patterns with partial segment matches
    assertEquals(
        isPathAllowed("padbootstrap*", "padbootstrap-123"),
        true,
        "Wildcards in isPathAllowed should be segment-based, not character-based"
    );
    assertEquals(
        isPathAllowed("test*", "testuser"),
        true,
        "Asterisk as part of segment name is treated as a literal, not a wildcard"
    );
    assertEquals(
        isPathAllowed("my*app", "myapp"),
        true,
        "Asterisk in middle of segment name is treated as a literal, not a wildcard"
    );

    assertEquals(
        isPathAllowed("/", "/"),
        true,
        "Root path should match root path"
    );
    assertEquals(
        isPathAllowed("/", "/test"),
        false,
        "Root path should not match non-root path"
    );

    // Path traversal / encoded-slash bypass regression tests
    assertEquals(
        isPathAllowed("public/*", "public/../admin"),
        false,
        "Literal .. traversal out of an allowed prefix must not match"
    );
    assertEquals(
        isPathAllowed("public/*", "public%2F..%2Fadmin"),
        false,
        "Encoded-slash traversal out of an allowed prefix must not match"
    );
    assertEquals(
        isPathAllowed("public/*", "public%2f..%2fadmin%2ffile"),
        false,
        "Encoded-slash traversal is case-insensitively decoded before matching"
    );
    assertEquals(
        isPathAllowed("admin/*", "public/../admin/secret"),
        true,
        ".. traversal INTO a restricted path should still be caught by its own rule"
    );
    assertEquals(
        isPathAllowed("public/*", "public%2Ffoo"),
        true,
        "Encoded slash without traversal should still resolve and match normally"
    );
    assertEquals(
        isPathAllowed("public/*", "public/./foo"),
        true,
        "Single-dot segments are a no-op and should not affect matching"
    );

    console.log("All path matching tests passed!");
}

function runSpecialCharacterTests() {
    console.log("\nRunning special character tests...");

    let threw = false;
    try {
        isPathAllowed("(api*", "anything");
        isPathAllowed("a(b*", "a(bc");
        isPathAllowed("c[d*", "c[de");
        isPathAllowed("x{2}*", "x{2}y");
        isPathAllowed("a|b*", "a|bc");
        isPathAllowed("back\\slash*", "back\\slashed");
    } catch (e) {
        threw = true;
        console.error(
            "Patterns accepted by isValidUrlGlobPattern crashed the matcher:",
            e instanceof Error ? e.message : e
        );
    }
    assertEquals(
        threw,
        false,
        "Patterns with regex metacharacters must not throw"
    );

    assertEquals(
        isPathAllowed("(api*", "(api-v1"),
        true,
        "Parenthesis should be treated as a literal character"
    );
    assertEquals(
        isPathAllowed("(api*", "xapi-v1"),
        false,
        "Parenthesis should not match other characters"
    );
    assertEquals(
        isPathAllowed("a(b)*", "a(b)c"),
        true,
        "Parentheses pair should be treated as literal characters"
    );

    assertEquals(
        isPathAllowed("*.png", "image.png"),
        true,
        "Dot should match a literal dot"
    );
    assertEquals(
        isPathAllowed("*.png", "imageXpng"),
        false,
        "Dot should not act as a regex wildcard"
    );
    assertEquals(
        isPathAllowed("v1.0*", "v1.0.1"),
        true,
        "Version-like literal should match itself"
    );
    assertEquals(
        isPathAllowed("v1.0*", "v1x0-beta"),
        false,
        "Version-like literal should not match arbitrary characters"
    );

    assertEquals(
        isPathAllowed("a+b*", "a+bc"),
        true,
        "Plus should be treated as a literal character"
    );
    assertEquals(
        isPathAllowed("a+b*", "aaabc"),
        false,
        "Plus should not act as a regex quantifier"
    );

    assertEquals(
        isPathAllowed("$ref*", "$refs"),
        true,
        "Dollar sign should be treated as a literal character"
    );
    assertEquals(
        isPathAllowed("price$*", "price$100"),
        true,
        "Dollar sign mid-pattern should be treated as a literal character"
    );

    assertEquals(
        isPathAllowed("^start*", "^started"),
        true,
        "Caret should be treated as a literal character"
    );

    assertEquals(
        isPathAllowed("a|b*", "a|bc"),
        true,
        "Pipe should be treated as a literal character"
    );
    assertEquals(
        isPathAllowed("a|b*", "a"),
        false,
        "Pipe should not act as regex alternation"
    );

    assertEquals(
        isPathAllowed("file?*", "fileX"),
        true,
        "Question mark should still act as a single-character wildcard"
    );

    assertEquals(
        isPathAllowed("api/*", "api/" + "x/".repeat(50)),
        true,
        "Deeply nested paths should still match"
    );

    assertEquals(
        isPathAllowed("*a*b", "xaxyb"),
        true,
        "Multiple wildcards within a segment should match"
    );
    assertEquals(
        isPathAllowed("*a*b", "xaxyba"),
        false,
        "In-segment wildcard pattern must still be anchored at the end"
    );

    // a `.*`-style regex backtracks catastrophically here and never returns
    const start = Date.now();
    isPathAllowed("/" + "*a".repeat(10) + "b", "/" + "a".repeat(5000));
    isPathAllowed(
        "/" + Array(10).fill("*a*a*a*").join("/") + "/nevermatch",
        "/" + Array(25).fill("a".repeat(200)).join("/")
    );
    assertEquals(
        Date.now() - start < 1000,
        true,
        "In-segment wildcards should not backtrack exponentially"
    );

    console.log("All special character tests passed!");
}

function runEncodedPatternTests() {
    console.log("\nRunning percent-encoded pattern tests...");

    // isValidUrlGlobPattern accepts percent-encoded sequences and rejects
    // raw spaces / non-ASCII, so `%20` and `%C3%A9` are the only way to write
    // a PATH rule for such a path. Badger sends the request path already
    // decoded (Go's req.URL.Path), and isPathAllowed decodes it again, so the
    // rule pattern must be decoded the same way or it can never match.
    assertEquals(
        isPathAllowed("/my%20docs/*", "/my docs/report.pdf"),
        true,
        "Percent-encoded space in pattern should match decoded request path"
    );
    assertEquals(
        isPathAllowed("/my%20docs/*", "/my%20docs/report.pdf"),
        true,
        "Percent-encoded space in pattern should match raw-encoded request path"
    );
    assertEquals(
        isPathAllowed("/caf%C3%A9", "/café"),
        true,
        "Percent-encoded UTF-8 in pattern should match decoded request path"
    );
    assertEquals(
        isPathAllowed("/my%20docs/*", "/my-docs/report.pdf"),
        false,
        "Decoded pattern must still reject a different path"
    );

    console.log("All percent-encoded pattern tests passed!");
}

function runRegionTests() {
    console.log("\nRunning isIpInRegion tests...");

    // Test undefined country code
    assertEquals(
        isIpInRegion(undefined, "150"),
        false,
        "Undefined country code should return false"
    );

    // Test subregion matching (Western Europe)
    assertEquals(
        isIpInRegion("DE", "155"),
        true,
        "Country should match its subregion"
    );
    assertEquals(
        isIpInRegion("GB", "155"),
        false,
        "Country should NOT match wrong subregion"
    );

    // Test continent matching (Europe)
    assertEquals(
        isIpInRegion("DE", "150"),
        true,
        "Country should match its continent"
    );
    assertEquals(
        isIpInRegion("GB", "150"),
        true,
        "Different European country should match Europe"
    );
    assertEquals(
        isIpInRegion("US", "150"),
        false,
        "Non-European country should NOT match Europe"
    );

    // Test case insensitivity
    assertEquals(
        isIpInRegion("de", "155"),
        true,
        "Lowercase country code should work"
    );

    // Test invalid region code
    assertEquals(
        isIpInRegion("DE", "999"),
        false,
        "Invalid region code should return false"
    );

    // --- Multi-region (comma-separated) tests ---

    // Single region in a list should behave like a single value
    assertEquals(
        isIpInRegion("DE", "150,"),
        true,
        "Trailing comma in single-region list should still match"
    );
    assertEquals(
        isIpInRegion("DE", ",150"),
        true,
        "Leading comma in single-region list should still match"
    );

    // Two regions: country matches the second one
    assertEquals(
        isIpInRegion("US", "150,021"),
        true,
        "Country should match second region in list (North America)"
    );
    assertEquals(
        isIpInRegion("DE", "150,021"),
        true,
        "Country should match first region in list (Europe)"
    );

    // Country not in any listed region
    assertEquals(
        isIpInRegion("AU", "150,021"),
        false,
        "Country not in any listed region should return false"
    );

    // Three regions: country matches the third one
    assertEquals(
        isIpInRegion("BR", "150,021,005"),
        true,
        "Country should match third region in list (South America)"
    );

    // Subregion-level multi-match
    assertEquals(
        isIpInRegion("DE", "154,155"),
        true,
        "Country should match subregion in multi-region list"
    );
    assertEquals(
        isIpInRegion("GB", "154,155"),
        true,
        "Country should match Northern Europe subregion in multi-region list"
    );

    // Whitespace tolerance in comma-separated list
    assertEquals(
        isIpInRegion("DE", "150, 155"),
        true,
        "Whitespace after comma in region list should be tolerated"
    );

    // Empty list (only commas) should return false
    assertEquals(
        isIpInRegion("DE", ","),
        false,
        "Empty region list should return false"
    );

    console.log("All region tests passed!");
}

// Mirrors the COUNTRY / COUNTRY_IS_NOT branch of checkRules in verifySession.ts:
// a rule matches when the client is in the list (COUNTRY) or outside it
// (COUNTRY_IS_NOT). Returns true when the rule fires, i.e. when its action
// applies.
function countryRuleFires(
    match: "COUNTRY" | "COUNTRY_IS_NOT",
    value: string,
    ipCountryCode: string | undefined
): boolean {
    const inCountry = isCountryListMatch(ipCountryCode, value);
    return match === "COUNTRY" ? inCountry : !inCountry;
}

function runCountryTests() {
    console.log("\nRunning country rule tests...");

    // The reported case: Block Access + Country Is Not + "DE,US" must let DE
    // and US through and block everyone else.
    assertEquals(
        countryRuleFires("COUNTRY_IS_NOT", "DE,US", "DE"),
        false,
        "COUNTRY_IS_NOT DE,US must not fire for DE"
    );
    assertEquals(
        countryRuleFires("COUNTRY_IS_NOT", "DE,US", "US"),
        false,
        "COUNTRY_IS_NOT DE,US must not fire for US"
    );
    assertEquals(
        countryRuleFires("COUNTRY_IS_NOT", "DE,US", "FR"),
        true,
        "COUNTRY_IS_NOT DE,US must fire for every other country"
    );

    // COUNTRY is the mirror image.
    assertEquals(
        countryRuleFires("COUNTRY", "DE,US", "DE"),
        true,
        "COUNTRY DE,US must fire for DE"
    );
    assertEquals(
        countryRuleFires("COUNTRY", "DE,US", "FR"),
        false,
        "COUNTRY DE,US must not fire for FR"
    );

    // Whitespace, case and a single legacy value.
    assertEquals(
        countryRuleFires("COUNTRY_IS_NOT", "de, us", "US"),
        false,
        "Country list should tolerate spaces and lower case"
    );
    assertEquals(
        countryRuleFires("COUNTRY", "DE", "DE"),
        true,
        "Single country value should still work"
    );

    // No resolvable country: not "in" any specific list, so COUNTRY_IS_NOT
    // fires and blocks, which is the safe direction.
    assertEquals(
        countryRuleFires("COUNTRY_IS_NOT", "DE,US", undefined),
        true,
        "Unknown country should be treated as outside a specific list"
    );
    assertEquals(
        countryRuleFires("COUNTRY", "DE,US", undefined),
        false,
        "Unknown country should not match a specific list"
    );

    // "ALL" alone matches every address, including an unknown country.
    assertEquals(
        isCountryListMatch(undefined, "ALL"),
        true,
        "ALL alone should match every address"
    );
    assertEquals(
        countryRuleFires("COUNTRY_IS_NOT", "ALL", "FR"),
        false,
        "COUNTRY_IS_NOT ALL must not block anyone"
    );

    // The broken value the old picker produced. "ALL" is only meaningful on
    // its own, so a stored "ALL,DE,US" is read as "DE,US" and the rule works
    // again without a migration.
    assertEquals(
        isAllCountriesSelector(parseCountryCodeList("ALL,DE,US")),
        false,
        "ALL combined with codes is not the all-countries selector"
    );
    assertEquals(
        isAllCountriesSelector(parseCountryCodeList("ALL")),
        true,
        "ALL alone is the all-countries selector"
    );
    assertEquals(
        countryRuleFires("COUNTRY_IS_NOT", "ALL,DE,US", "FR"),
        true,
        "Legacy ALL,DE,US must block countries outside the list"
    );
    assertEquals(
        countryRuleFires("COUNTRY_IS_NOT", "ALL,DE,US", "DE"),
        false,
        "Legacy ALL,DE,US must not block DE"
    );

    console.log("All country rule tests passed!");
}

function runNodeRuleTranslationTests() {
    console.log("\nRunning node rule translation tests...");

    const countryRule = { ruleId: 1, match: "COUNTRY", value: "DE,US" };
    const notCountryRule = {
        ruleId: 2,
        match: "COUNTRY_IS_NOT",
        value: "DE,US"
    };

    // A modern node gets the rules untouched.
    const modern = translateRulesForNodeVersion(
        [countryRule, notCountryRule],
        "1.12.0"
    );
    assertEquals(
        modern.rules.map((r) => r.match).join(","),
        "COUNTRY,COUNTRY_IS_NOT",
        "Modern node should receive the modern match names"
    );
    assertEquals(
        modern.unsupportedMatches.length,
        0,
        "Modern node should report nothing unsupported"
    );

    // A pre-1.1.0 node knows the legacy GEOIP name for a country rule.
    const legacy = translateRulesForNodeVersion([countryRule], "1.0.0");
    assertEquals(
        legacy.rules[0].match,
        "GEOIP",
        "Legacy node should receive GEOIP for a COUNTRY rule"
    );

    // A pre-1.1.0 node has no branch for COUNTRY_IS_NOT and ignores it
    // silently, so the caller must be told not to send it.
    const legacyNot = translateRulesForNodeVersion([notCountryRule], "1.0.0");
    assertEquals(
        legacyNot.unsupportedMatches.join(","),
        "COUNTRY_IS_NOT",
        "Legacy node must report COUNTRY_IS_NOT as unsupported"
    );

    // An unset version is treated as old, which is the safe direction.
    const unknown = translateRulesForNodeVersion(
        [countryRule, notCountryRule],
        null
    );
    assertEquals(
        unknown.rules[0].match,
        "GEOIP",
        "Unset node version should be treated as legacy"
    );
    assertEquals(
        unknown.unsupportedMatches.join(","),
        "COUNTRY_IS_NOT",
        "Unset node version must refuse COUNTRY_IS_NOT"
    );

    // An unparseable version is treated as old too.
    const garbage = translateRulesForNodeVersion(
        [countryRule],
        "not-a-version"
    );
    assertEquals(
        garbage.rules[0].match,
        "GEOIP",
        "Unparseable node version should be treated as legacy"
    );

    // The boundary itself: 1.1.0 is the first version with the matcher.
    assertEquals(
        translateRulesForNodeVersion([countryRule], "1.1.0").rules[0].match,
        "COUNTRY",
        "1.1.0 should receive the modern COUNTRY name"
    );
    assertEquals(
        translateRulesForNodeVersion([notCountryRule], "1.1.0")
            .unsupportedMatches.length,
        0,
        "1.1.0 should support COUNTRY_IS_NOT"
    );

    // Other match types pass through a legacy node untouched.
    const cidr = translateRulesForNodeVersion(
        [{ ruleId: 3, match: "CIDR", value: "10.0.0.0/8" }],
        "1.0.0"
    );
    assertEquals(
        cidr.rules[0].match,
        "CIDR",
        "CIDR rules should not be renamed"
    );
    assertEquals(
        cidr.unsupportedMatches.length,
        0,
        "CIDR is supported by legacy nodes"
    );

    console.log("All node rule translation tests passed!");
}

// Run all tests
try {
    runTests();
    runSpecialCharacterTests();
    runEncodedPatternTests();
    runRegionTests();
    runCountryTests();
    runNodeRuleTranslationTests();
    console.log("\n✅ All tests passed!");
} catch (error) {
    console.error("❌ Test failed:", error);
    process.exit(1);
}
