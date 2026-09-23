// Paths are resolved from this file's own location so the config works from any
// clone, on any platform — pm2 is otherwise given absolute paths and will not
// find tsx if the repo lives anywhere but the author's machine.
const path = require('path')
const { pathToFileURL } = require('url')

const root = __dirname
const tsx = (...p) => path.join(root, 'node_modules', 'tsx', 'dist', ...p)

module.exports = {
  apps: [
    {
      name: 'nudge-worker',
      script: 'src/worker/index.ts',
      // process.execPath is the node running pm2, so the worker can't drift onto
      // a different runtime than the one that launched it.
      interpreter: process.execPath,
      interpreter_args: [
        '--require',
        tsx('preflight.cjs'),
        '--import',
        pathToFileURL(tsx('loader.mjs')).href,
      ].join(' '),
      cwd: root,
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
    },
  ],
}
