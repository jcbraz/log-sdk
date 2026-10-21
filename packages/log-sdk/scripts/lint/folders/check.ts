import { dirname } from "node:path";
import { TEST_FILE_PATTERN } from "../constants.ts";
import { type AuditFinding, AuditRule } from "../types.ts";

const MAX_IMPLEMENTATION_FILES_PER_FOLDER = 20;

export function checkFolderFileCounts(
  files: readonly string[],
): AuditFinding[] {
  const implementationFilesByFolder = Map.groupBy(
    files.filter((file): boolean => !TEST_FILE_PATTERN.test(file)).sort(),
    (file): string => dirname(file),
  );
  return [...implementationFilesByFolder].flatMap(
    ([, folderFiles]): AuditFinding[] => {
      const firstExtra = folderFiles[MAX_IMPLEMENTATION_FILES_PER_FOLDER];
      if (!firstExtra) return [];
      return [
        {
          rule: AuditRule.FolderFileCount,
          file: firstExtra,
          line: 1,
          column: 1,
          start: 0,
          end: 0,
          message: `This folder holds ${folderFiles.length} implementation files. Group related files into subfolders so each folder holds at most ${MAX_IMPLEMENTATION_FILES_PER_FOLDER}.`,
        },
      ];
    },
  );
}
