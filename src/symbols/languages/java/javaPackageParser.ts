const JAVA_IDENTIFIER = String.raw`[A-Za-z_$][\w$]*`;
const JAVA_QUALIFIED_NAME = String.raw`${JAVA_IDENTIFIER}(?:\.${JAVA_IDENTIFIER})*`;

/**
 * Matches a Java package declaration.
 *
 * Examples:
 * - package com.example;
 *
 * The qualified name pattern intentionally requires identifiers between dots.
 * Therefore, invalid names like "com.example.", ".example", or "com..example"
 * are not matched.
 */
const JAVA_PACKAGE_DECLARATION = new RegExp(
  String.raw`^\s*package\s+(${JAVA_QUALIFIED_NAME})\s*;`,
  "m"
);

/**
 * Extracts the package name from a Java source file.
 *
 * Returns an empty string when the file is in the default package or when no
 * valid package declaration can be found.
 *
 * Comments are removed before matching so that commented-out package
 * declarations do not accidentally get detected.
 *
 * Example:
 * ```java
 * package net.example.debug;
 * ```
 *
 * returns:
 * ```text
 * net.example.debug
 * ```
 */
export function extractJavaPackageName(documentText: string): string {
  const textWithoutComments = stripJavaComments(documentText);
  const match = textWithoutComments.match(JAVA_PACKAGE_DECLARATION);

  return match?.[1] ?? "";
}

/**
 * Removes Java line and block comments from source text.
 *
 * This is mainly needed to avoid false positives such as:
 *
 * ```java
 * /*
 * package fake.name;
 * *\/
 *
 * package real.name;
 * ```
 *
 * Without removing comments first, the parser could incorrectly return
 * "fake.name" instead of "real.name".
 *
 * This function is intentionally lightweight. It is not meant to be a full Java
 * lexer, but it is sufficient for making package declaration extraction more
 * robust.
 */
function stripJavaComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}