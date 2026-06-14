type ApiObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is ApiObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date);
}

function lowerFirst(value: string): string {
  return value.length === 0 ? value : value.charAt(0).toLowerCase() + value.slice(1);
}

function upperFirst(value: string): string {
  return value.length === 0 ? value : value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Temporary adapter for the current API shape.
 * Backend currently serializes DTOs with PascalCase in several endpoints.
 * Angular features should call this adapter instead of using `any` or duplicating `x ?? X` checks.
 */
export function apiToCamelCase<T>(value: unknown): T {
  if (Array.isArray(value)) {
    return value.map(item => apiToCamelCase(item)) as T;
  }

  if (!isPlainObject(value)) {
    return value as T;
  }

  return Object.entries(value).reduce<ApiObject>((result, [key, entry]) => {
    result[lowerFirst(key)] = apiToCamelCase(entry);
    return result;
  }, {}) as T;
}

/**
 * Use this when sending data to endpoints that still expect PascalCase request models.
 * Long term target: introduce a versioned camelCase API and remove this conversion.
 */
export function camelToApiPascalCase<T>(value: unknown): T {
  if (Array.isArray(value)) {
    return value.map(item => camelToApiPascalCase(item)) as T;
  }

  if (!isPlainObject(value)) {
    return value as T;
  }

  return Object.entries(value).reduce<ApiObject>((result, [key, entry]) => {
    result[upperFirst(key)] = camelToApiPascalCase(entry);
    return result;
  }, {}) as T;
}

/**
 * Reads either camelCase or PascalCase without falling back to `any` in feature code.
 */
export function readApiField<T>(source: unknown, camelName: string, fallback?: T): T | undefined {
  if (!isPlainObject(source)) {
    return fallback;
  }

  const pascalName = upperFirst(camelName);
  return (source[camelName] as T | undefined) ?? (source[pascalName] as T | undefined) ?? fallback;
}
