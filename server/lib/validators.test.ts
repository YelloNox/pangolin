import {
    getResourceRuleValueValidationError,
    isValidCountryList,
    isValidDomain,
    isValidUrlGlobPattern,
    normalizeCountryList,
    normalizeRegionList,
    normalizeRuleValue,
    parseHttpMethodList
} from "./validators";
import { assertEquals, assertEqualsObj } from "@test/assert";

function runTests() {
    console.log("Running domain validation tests...");

    assertEquals(
        isValidDomain("example.com"),
        true,
        "Standard ASCII domain should be valid"
    );
    assertEquals(
        isValidDomain("xn--e1afmkfd.xn--p1ai"),
        true,
        "Punycode IDN domain should be valid"
    );
    assertEquals(
        isValidDomain("example.invalid-tld"),
        false,
        "Domain with unknown TLD should be invalid"
    );

    console.log("Running URL pattern validation tests...");

    // Test valid patterns
    assertEquals(
        isValidUrlGlobPattern("simple"),
        true,
        "Simple path segment should be valid"
    );
    assertEquals(
        isValidUrlGlobPattern("simple/path"),
        true,
        "Simple path with slash should be valid"
    );
    assertEquals(
        isValidUrlGlobPattern("/leading/slash"),
        true,
        "Path with leading slash should be valid"
    );
    assertEquals(
        isValidUrlGlobPattern("path/"),
        true,
        "Path with trailing slash should be valid"
    );
    assertEquals(
        isValidUrlGlobPattern("path/*"),
        true,
        "Path with wildcard segment should be valid"
    );
    assertEquals(
        isValidUrlGlobPattern("*"),
        true,
        "Single wildcard should be valid"
    );
    assertEquals(
        isValidUrlGlobPattern("*/subpath"),
        true,
        "Wildcard with subpath should be valid"
    );
    assertEquals(
        isValidUrlGlobPattern("path/*/more"),
        true,
        "Path with wildcard in the middle should be valid"
    );

    // Test with special characters
    assertEquals(
        isValidUrlGlobPattern("path-with-dash"),
        true,
        "Path with dash should be valid"
    );
    assertEquals(
        isValidUrlGlobPattern("path_with_underscore"),
        true,
        "Path with underscore should be valid"
    );
    assertEquals(
        isValidUrlGlobPattern("path.with.dots"),
        true,
        "Path with dots should be valid"
    );
    assertEquals(
        isValidUrlGlobPattern("path~with~tilde"),
        true,
        "Path with tilde should be valid"
    );
    assertEquals(
        isValidUrlGlobPattern("path!with!exclamation"),
        true,
        "Path with exclamation should be valid"
    );
    assertEquals(
        isValidUrlGlobPattern("path$with$dollar"),
        true,
        "Path with dollar should be valid"
    );
    assertEquals(
        isValidUrlGlobPattern("path&with&ampersand"),
        true,
        "Path with ampersand should be valid"
    );
    assertEquals(
        isValidUrlGlobPattern("path'with'quote"),
        true,
        "Path with quote should be valid"
    );
    assertEquals(
        isValidUrlGlobPattern("path(with)parentheses"),
        true,
        "Path with parentheses should be valid"
    );
    assertEquals(
        isValidUrlGlobPattern("path+with+plus"),
        true,
        "Path with plus should be valid"
    );
    assertEquals(
        isValidUrlGlobPattern("path,with,comma"),
        true,
        "Path with comma should be valid"
    );
    assertEquals(
        isValidUrlGlobPattern("path;with;semicolon"),
        true,
        "Path with semicolon should be valid"
    );
    assertEquals(
        isValidUrlGlobPattern("path=with=equals"),
        true,
        "Path with equals should be valid"
    );
    assertEquals(
        isValidUrlGlobPattern("path:with:colon"),
        true,
        "Path with colon should be valid"
    );
    assertEquals(
        isValidUrlGlobPattern("path@with@at"),
        true,
        "Path with at should be valid"
    );

    // Test with percent encoding
    assertEquals(
        isValidUrlGlobPattern("path%20with%20spaces"),
        true,
        "Path with percent-encoded spaces should be valid"
    );
    assertEquals(
        isValidUrlGlobPattern("path%2Fwith%2Fencoded%2Fslashes"),
        true,
        "Path with percent-encoded slashes should be valid"
    );

    // Test with wildcards in segments (the fixed functionality)
    assertEquals(
        isValidUrlGlobPattern("padbootstrap*"),
        true,
        "Path with wildcard at the end of segment should be valid"
    );
    assertEquals(
        isValidUrlGlobPattern("pad*bootstrap"),
        true,
        "Path with wildcard in the middle of segment should be valid"
    );
    assertEquals(
        isValidUrlGlobPattern("*bootstrap"),
        true,
        "Path with wildcard at the start of segment should be valid"
    );
    assertEquals(
        isValidUrlGlobPattern("multiple*wildcards*in*segment"),
        true,
        "Path with multiple wildcards in segment should be valid"
    );
    assertEquals(
        isValidUrlGlobPattern("wild*/cards/in*/different/seg*ments"),
        true,
        "Path with wildcards in different segments should be valid"
    );

    // Test invalid patterns
    assertEquals(
        isValidUrlGlobPattern(""),
        false,
        "Empty string should be invalid"
    );
    assertEquals(
        isValidUrlGlobPattern("//double/slash"),
        false,
        "Path with double slash should be invalid"
    );
    assertEquals(
        isValidUrlGlobPattern("path//end"),
        false,
        "Path with double slash in the middle should be invalid"
    );
    assertEquals(
        isValidUrlGlobPattern("invalid<char>"),
        false,
        "Path with invalid characters should be invalid"
    );
    assertEquals(
        isValidUrlGlobPattern("invalid|char"),
        false,
        "Path with invalid pipe character should be invalid"
    );
    assertEquals(
        isValidUrlGlobPattern('invalid"char'),
        false,
        "Path with invalid quote character should be invalid"
    );
    assertEquals(
        isValidUrlGlobPattern("invalid`char"),
        false,
        "Path with invalid backtick character should be invalid"
    );
    assertEquals(
        isValidUrlGlobPattern("invalid^char"),
        false,
        "Path with invalid caret character should be invalid"
    );
    assertEquals(
        isValidUrlGlobPattern("invalid\\char"),
        false,
        "Path with invalid backslash character should be invalid"
    );
    assertEquals(
        isValidUrlGlobPattern("invalid[char]"),
        false,
        "Path with invalid square brackets should be invalid"
    );
    assertEquals(
        isValidUrlGlobPattern("invalid{char}"),
        false,
        "Path with invalid curly braces should be invalid"
    );

    // Test invalid percent encoding
    assertEquals(
        isValidUrlGlobPattern("invalid%2"),
        false,
        "Path with incomplete percent encoding should be invalid"
    );
    assertEquals(
        isValidUrlGlobPattern("invalid%GZ"),
        false,
        "Path with invalid hex in percent encoding should be invalid"
    );
    assertEquals(
        isValidUrlGlobPattern("invalid%"),
        false,
        "Path with isolated percent sign should be invalid"
    );

    // ASN validation tests
    assertEquals(
        getResourceRuleValueValidationError("ASN", "AS15169"),
        null,
        "Standard ASN should be valid"
    );
    assertEquals(
        getResourceRuleValueValidationError("ASN", "  As15169  "),
        null,
        "Standard ASN should be valid with mixed case and whitespace"
    );
    assertEquals(
        getResourceRuleValueValidationError("ASN", "ALL"),
        null,
        "ALL ASN selector should be valid"
    );
    assertEquals(
        getResourceRuleValueValidationError("ASN", " all "),
        null,
        "ALL ASN selector should be valid with mixed case and whitespace"
    );
    assertEquals(
        getResourceRuleValueValidationError("ASN", "AS0"),
        null,
        "AS0 alias should be valid"
    );
    assertEquals(
        getResourceRuleValueValidationError("ASN", " as0 "),
        null,
        "AS0 alias should be valid with mixed case and whitespace"
    );
    assertEquals(
        getResourceRuleValueValidationError("ASN", "not-an-asn"),
        "Invalid ASN provided",
        "Invalid ASN should return an error"
    );

    // HTTP method validation tests
    assertEquals(
        getResourceRuleValueValidationError("METHOD", "POST"),
        null,
        "Single HTTP method should be valid"
    );
    assertEquals(
        getResourceRuleValueValidationError("METHOD", " post , Put "),
        null,
        "Method list should be valid with mixed case and whitespace"
    );
    assertEquals(
        getResourceRuleValueValidationError("METHOD", "PROPFIND"),
        null,
        "Extension methods such as the WebDAV verbs should be valid"
    );
    assertEquals(
        getResourceRuleValueValidationError("METHOD", ""),
        "Invalid HTTP method provided",
        "Empty method list should return an error"
    );
    assertEquals(
        getResourceRuleValueValidationError("METHOD", ",,"),
        "Invalid HTTP method provided",
        "Method list of only separators should return an error"
    );
    assertEquals(
        getResourceRuleValueValidationError("METHOD", "GET POST"),
        "Invalid HTTP method provided",
        "Space separated methods should return an error"
    );

    assertEqualsObj(
        parseHttpMethodList(" get ,post, "),
        ["GET", "POST"],
        "Method list should be normalized to uppercase without empty entries"
    );

    // Country list validation. "ALL" is a selector for every country, so it is
    // only accepted on its own: "ALL,DE,US" matches every address and turns a
    // COUNTRY_IS_NOT rule into a no-op that blocks nobody.
    assertEquals(
        isValidCountryList("DE,US"),
        true,
        "Multi-country list should be valid"
    );
    assertEquals(
        isValidCountryList(" de , us "),
        true,
        "Country list should tolerate case and whitespace"
    );
    assertEquals(
        isValidCountryList("ALL"),
        true,
        "ALL on its own should be valid"
    );
    assertEquals(
        isValidCountryList("ALL,DE,US"),
        false,
        "ALL combined with specific countries should be invalid"
    );
    assertEquals(
        isValidCountryList("DE,ALL"),
        false,
        "ALL combined in any position should be invalid"
    );
    assertEquals(
        isValidCountryList("DE,XX"),
        false,
        "Unknown country code should be invalid"
    );
    assertEquals(
        isValidCountryList(""),
        false,
        "Empty country list should be invalid"
    );
    assertEquals(
        getResourceRuleValueValidationError("COUNTRY_IS_NOT", "ALL,DE,US"),
        "Invalid country code list provided",
        "The API should reject ALL combined with specific countries"
    );

    // Canonical country value: uppercase, deduped, in COUNTRIES order, and with
    // a stray ALL dropped so a value saved by the old picker reads as intended.
    assertEquals(
        normalizeCountryList("us, de"),
        "DE,US",
        "Country list should normalize to a stable order"
    );
    assertEquals(
        normalizeCountryList("DE,US,DE"),
        "DE,US",
        "Duplicate country codes should be removed"
    );
    assertEquals(
        normalizeCountryList("ALL,DE,US"),
        "DE,US",
        "A stray ALL should be dropped in favour of the specific codes"
    );
    assertEquals(
        normalizeCountryList("ALL"),
        "ALL",
        "ALL on its own should be preserved"
    );

    assertEquals(
        normalizeRegionList("155,154"),
        "154,155",
        "Region list should normalize to the order REGIONS declares"
    );
    assertEquals(
        normalizeRegionList("150, 002"),
        "002,150",
        "Region list should tolerate whitespace and normalize order"
    );

    // A hand-entered ASN number is stored in the same shape the picker stores,
    // so the row renders the ASN name instead of "Custom".
    assertEquals(
        normalizeRuleValue("ASN", "15169"),
        "AS15169",
        "A bare ASN number should gain the AS prefix"
    );
    assertEquals(
        normalizeRuleValue("ASN", " as15169 "),
        "AS15169",
        "An ASN with prefix, case and whitespace should canonicalize"
    );
    assertEquals(
        normalizeRuleValue("ASN", "ALL"),
        "ALL",
        "The ALL ASN selector should be preserved"
    );
    assertEquals(
        normalizeRuleValue("COUNTRY_IS_NOT", "us, de"),
        "DE,US",
        "normalizeRuleValue should route country rules to the country list"
    );
    assertEquals(
        normalizeRuleValue("METHOD", " get ,post "),
        "GET,POST",
        "normalizeRuleValue should route method rules to the method list"
    );
    assertEquals(
        normalizeRuleValue("PATH", "/Foo/Bar"),
        "/Foo/Bar",
        "Path values should pass through untouched"
    );

    console.log("All tests passed!");
}

// Run all tests
try {
    runTests();
} catch (error) {
    console.error("Test failed:", error);
    process.exit(1);
}
