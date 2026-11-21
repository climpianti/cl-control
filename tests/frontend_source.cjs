// Resolve shared style imports for fixtures that evaluate a classic script.
const { readFileSync } = require('node:fs');
const path = require('node:path');
const frontend = path.join(__dirname, '../custom_components/cl_control/frontend');

function inlineSharedImports(source) {
  return source.replace(/^import \{ ([^}]+) \} from '\.\/(cl-control-(?:glass|power-badge)\.mjs)';\r?$/gm,
    (_, names, file) => {
      const shared = readFileSync(path.join(frontend, file), 'utf8').replace(/^export /gm, '');
      return 'var {' + names + '} = (() => {\n' + shared + '\nreturn {' + names + '};\n})();';
    });
}

module.exports = { inlineSharedImports };
