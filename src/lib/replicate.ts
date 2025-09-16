import Replicate from "replicate";

export const replicate = new Replicate({
  auth: (process.env as any).REPLICATE_API_TOKEN!,
});
