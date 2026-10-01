export function reportPassed(report) {
  return ['pageErrors', 'consoleErrors', 'externalRequests', 'failedRequests', 'notes']
    .every(key => report[key].length === 0) && !report.evals.some(result => result.error);
}
