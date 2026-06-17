import fs from "node:fs";

export type FinalPreviewResult = {
  attempted: boolean;
  resolved: boolean;
  sourcePath: string | null;
  outputPath: string | null;
  reason?: string;
};

export async function resolveFinalPreview(input: {
  candidates: string[];
  outputPath: string;
}): Promise<FinalPreviewResult> {
  const sourcePath = input.candidates.find((candidate) => fs.existsSync(candidate)) ?? null;

  if (!sourcePath) {
    return {
      attempted: false,
      resolved: false,
      sourcePath: null,
      outputPath: null,
      reason: "No render output available."
    };
  }

  try {
    await fs.promises.copyFile(sourcePath, input.outputPath);

    return {
      attempted: true,
      resolved: true,
      sourcePath,
      outputPath: input.outputPath
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return {
      attempted: true,
      resolved: false,
      sourcePath,
      outputPath: input.outputPath,
      reason: message
    };
  }
}
