# GET /alerts hardening behavior (implementation note)

This document exists because the original task referenced an external attachment that was not available in the workspace at execution time.

## Contract (must hold in production)
- `GET /alerts` **must always return HTTP 200**.
- Response body **must always be a JSON array**.
- The handler must use:
  - an **outer try/catch** to protect the entire request handler
  - an **inner (nested) try/catch** around the DB/service fetch so DB errors are swallowed
- The handler must print console logs for:
  - entry into the handler
  - the limit/offset query params used
  - DB fetch success + returned count (or at least whether it is an array)
  - DB fetch failure (error logged) but still return `[]`
  - any outer/unknown failure (error logged) but still return `[]`

## Rationale
In deployed environments the database dependency may be unavailable or partially initialized. This endpoint powers dashboards and must never take the API down with a 500.

## Response shape
Always:
- `[]` on failure, non-array, or any exception
- `[ ...alerts ]` on success (array)

No object wrapper is used.
