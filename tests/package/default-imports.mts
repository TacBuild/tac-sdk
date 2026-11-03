// @ts-expect-error The ESM entry point has no default export.
import sdk from '@tonappchain/sdk';
// @ts-expect-error The ESM entry point has no default export.
import artifacts from '@tonappchain/sdk/artifacts';
// @ts-expect-error The type-only ESM entry point has no default export.
import tacTypes from '@tonappchain/sdk/artifacts/types/tac';
// @ts-expect-error The type-only ESM entry point has no default export.
import tonTypes from '@tonappchain/sdk/artifacts/types/ton';

void [sdk, artifacts, tacTypes, tonTypes];
