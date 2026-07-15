const fs = require('fs');
const path = require('path');

const APP_SCHEME = 'offmap';

function findNodeModules(startDir) {
  let currentDir = startDir;

  while (currentDir !== path.dirname(currentDir)) {
    const candidate = path.join(currentDir, 'node_modules');

    if (fs.existsSync(candidate)) {
      return candidate;
    }

    currentDir = path.dirname(currentDir);
  }

  return path.join(startDir, 'node_modules');
}

const nodeModulesDir = findNodeModules(process.cwd());
const linkingPath = path.join(nodeModulesDir, 'expo-router/build/link/linking.js');

if (!fs.existsSync(linkingPath)) {
  console.log('Expo Router linking patch skipped: file not found');
  process.exit(0);
}

const source = fs.readFileSync(linkingPath, 'utf8');
const from = "_rootURL = Linking.createURL('/');";
const to = `_rootURL = '${APP_SCHEME}:///';`;

if (source.includes(to)) {
  console.log('Expo Router linking patch already applied');
  process.exit(0);
}

if (!source.includes(from)) {
  console.log('Expo Router linking patch skipped: expected source not found');
  process.exit(0);
}

fs.writeFileSync(linkingPath, source.replace(from, to));
console.log(`Patched Expo Router root URL scheme: ${APP_SCHEME}`);
