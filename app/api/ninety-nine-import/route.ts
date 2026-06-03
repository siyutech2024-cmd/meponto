import {
  ninetyNineImportBatches,
  ninetyNineImportRules,
  ninetyNineRiderPreviews,
  ninetyNineSourceDefinitions,
  summarizeNinetyNineImport,
} from "../../lib/ninetyNineImport";
import { jsonResponse } from "../../lib/server/memory";

export function GET() {
  return jsonResponse({
    data: {
      summary: summarizeNinetyNineImport(),
      sources: ninetyNineSourceDefinitions,
      rules: ninetyNineImportRules,
      batches: ninetyNineImportBatches,
      previewRows: ninetyNineRiderPreviews,
      readModel: "rider_99_daily_performance_read_model",
      featureFlag: "ninety_nine_daily_import_beta",
      standard: "docs/modules/ninety-nine-import-contract.md",
    },
  });
}
