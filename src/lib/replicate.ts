import Replicate from "replicate";

// Use globalThis to access process for environment variables
const processEnv = (globalThis as any).process?.env || {};

export const replicate = new Replicate({
  auth: processEnv.REPLICATE_API_TOKEN!,
});
