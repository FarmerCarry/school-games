import { spawn } from 'node:child_process';
import { constants } from 'node:os';
import { githubError } from './github-test-reporter.mjs';

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error('Usage: node tools/ci-run.mjs <command> [arguments...]');
  process.exitCode = 2;
} else {
  let tail = '', spawnError;
  const child = spawn(command, args, { stdio: ['inherit', 'pipe', 'pipe'] });
  function stream(input, output) {
    input.setEncoding('utf8');
    input.on('data', text => {
      output.write(text);
      tail = (tail + text).slice(-12000);
    });
  }
  stream(child.stdout, process.stdout);
  stream(child.stderr, process.stderr);
  child.on('error', error => { spawnError = error; });
  const interrupt = () => child.kill('SIGINT');
  const terminate = () => child.kill('SIGTERM');
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', terminate);
  child.on('close', (code, signal) => {
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', terminate);
    const status = spawnError ? 1 : code ?? (signal ? 128 + (constants.signals[signal] || 1) : 1);
    if (status !== 0) {
      const message = `${command} ${args.join(' ')}\nExit: ${signal || status}\n${spawnError ? spawnError.stack + '\n' : ''}${tail.slice(-8000)}`;
      process.stderr.write(githubError('Regression command failed', message));
    }
    process.exitCode = status;
  });
}
