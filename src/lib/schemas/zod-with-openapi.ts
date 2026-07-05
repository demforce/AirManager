import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

/**
 * Every schema file that the OpenAPI registry (`registry.ts`, story 1.5)
 * registers must import `z` from *here* instead of `'zod'` directly.
 *
 * `extendZodWithOpenApi` patches Zod's schema classes at call time and has
 * no retroactive effect on instances already constructed — verified
 * against the installed `zod@4.4.3` + `@asteasolutions/zod-to-openapi@8.5.0`:
 * a `z.object(...)` built before this call never gains a working
 * `.openapi()` (needed internally by `registry.register()`), even though
 * `instanceof ZodType` still holds for it. Centralizing the extension as
 * the first import of every OpenAPI-registered schema module guarantees it
 * always runs before any such schema is built, regardless of which route
 * or service happens to import which schema file first.
 */
extendZodWithOpenApi(z);

export { z };
