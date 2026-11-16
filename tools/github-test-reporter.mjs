import path from 'node:path';
import { inspect, stripVTControlCharacters } from 'node:util';

function escapeData(value) {
  return stripVTControlCharacters(String(value)).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
}
function escapeProperty(value) { return escapeData(value).replaceAll(':', '%3A').replaceAll(',', '%2C'); }

export function githubError(title, message, location = {}) {
  const properties = [`title=${escapeProperty(title)}`];
  if (location.file) properties.push(`file=${escapeProperty(path.relative(process.cwd(), location.file))}`);
  if (Number.isInteger(location.line)) properties.push(`line=${location.line}`);
  if (Number.isInteger(location.column)) properties.push(`col=${location.column}`);
  return `::error ${properties.join(',')}::${escapeData(message)}\n`;
}

function located(data) {
  const file = data?.file ? path.relative(process.cwd(), data.file) : '';
  const line = Number.isInteger(data?.line) ? `:${data.line}` : '';
  return `${file}${line}`;
}

// Node's normal spec reporter remains enabled separately. Annotations make the
// actual assertion and its nested cause visible from the public Actions summary.
// A file-level timeout (Node's --test-timeout) reports the file path, not the
// test that was still running, and a killed step never prints a passing line
// for that test. Record the test as it is dequeued so both cases name it.
export default async function* report(source) {
  let running = null;
  for await (const { type, data } of source) {
    if (type === 'test:dequeue' && data?.name && data.name !== data.file) {
      running = data;
      if (process.env.GITHUB_ACTIONS === 'true') yield `[test] start ${located(data)} ${data.name}\n`;
    }
    const error = data?.details?.error;
    const timedOut = type === 'test:fail' && error?.failureType === 'testTimeoutFailure'
      ? (data?.name === data?.file ? running : data)
      : null;
    if (timedOut) yield `timed out while running: ${timedOut.name} (${located(timedOut)})\n`;
    if (type === 'test:fail' && process.env.GITHUB_ACTIONS === 'true' && error?.failureType !== 'subtestsFailed') {
      const detail = inspect(error, { depth: 8, colors: false, maxArrayLength: 100, maxStringLength: 12000 });
      const title = timedOut ? `Timed out: ${timedOut.name}` : (data.name || 'Node test failed');
      const message = timedOut ? `Still running: ${timedOut.name}\n${detail}` : detail;
      yield githubError(title, message.slice(0, 14000), timedOut || data);
    }
    if ((type === 'test:pass' || type === 'test:fail') && running && data?.name === running.name) running = null;
  }
}
