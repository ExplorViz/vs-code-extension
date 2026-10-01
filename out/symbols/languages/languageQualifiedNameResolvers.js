"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveLanguageQualifiedTypeNameParts = void 0;
const javaQualifiedNameResolver_1 = require("./java/javaQualifiedNameResolver");
/**
 * Resolves the language-specific qualified type name parts for a containing
 * symbol path.
 *
 * This function acts as the central dispatcher for language-specific qualified
 * name resolution.
 *
 * Language-specific resolvers can decide how qualifier names and type names
 * should be interpreted.
 */
function resolveLanguageQualifiedTypeNameParts(document, symbolPath) {
    switch (document.languageId) {
        case "java":
            return (0, javaQualifiedNameResolver_1.resolveJavaQualifiedTypeNameParts)(document, symbolPath);
        default:
            return buildGenericQualifiedTypeNameParts(symbolPath);
    }
}
exports.resolveLanguageQualifiedTypeNameParts = resolveLanguageQualifiedTypeNameParts;
function buildGenericQualifiedTypeNameParts(symbolPath) {
    const packageName = symbolPath.qualifierNames.join(".");
    const className = symbolPath.typeNames.join(".");
    const qualifiedName = packageName ? `${packageName}.${className}` : className;
    return {
        packageName,
        className,
        qualifiedName,
    };
}
//# sourceMappingURL=languageQualifiedNameResolvers.js.map