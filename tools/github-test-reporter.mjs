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

// Node's normal spec reporter remains enabled separately. Annotations make the
// actual assertion and its nested cause visible from the public Actions summary.
export default async function* report(source) {
  for await (const { type, data } of source) {
    if (type !== 'test:fail' || process.env.GITHUB_ACTIONS !== 'true') continue;
    const error = data.details?.error;
    if (error?.failureType === 'subtestsFailed') continue;
    const detail = inspect(error, { depth: 8, colors: false, maxArrayLength: 100, maxStringLength: 12000 });
    yield githubError(data.name || 'Node test failed', detail.slice(0, 14000), data);
  }
}
