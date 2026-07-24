// core/identifier.js
// Detects and normalizes variable/function-name casing styles
// (camelCase, snake_case, PascalCase, kebab-case).

export function identifierStyle(tok) {
  if (/_/.test(tok)) return 'snake_case';
  if (/-/.test(tok) && /[a-zA-Z]/.test(tok)) return 'kebab-case';
  if (/^[A-Z]/.test(tok) && /[a-z]/.test(tok) && /[A-Z]/.test(tok.slice(1))) return 'PascalCase';
  if (/^[a-z][a-zA-Z0-9]*$/.test(tok) && /[A-Z]/.test(tok)) return 'camelCase';
  return null;
}

export function identifierRoot(tok) {
  const spaced = tok
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
  return spaced.toLowerCase().replace(/\s+/g, '');
}
