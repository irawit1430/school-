import { defineConfig } from "eslint/config";
import next from "eslint-config-next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig([
    // ponytail/ is a vendored plugin with its own conventions. Linting it reported
    // problems nobody here can act on, which is what kept lint out of CI.
    { ignores: ['ponytail/**', 'out/**', '.next/**'] },
    { extends: [...next] },
]);
