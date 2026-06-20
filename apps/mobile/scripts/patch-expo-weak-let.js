const fs = require('fs');
const path = require('path');

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

const replacements = [
  {
    file: 'node_modules/expo-modules-jsi/apple/Sources/ExpoModulesJSI/Contexts/HostFunctionContext.swift',
    from: 'internal final class HostFunctionContext: Sendable {',
    to: 'internal final class HostFunctionContext: @unchecked Sendable {',
  },
  {
    file: 'node_modules/expo-modules-jsi/apple/Sources/ExpoModulesJSI/Contexts/HostFunctionContext.swift',
    from: '  weak let runtime: JavaScriptRuntime?',
    to: '  weak var runtime: JavaScriptRuntime?',
  },
  {
    file: 'node_modules/expo-modules-jsi/apple/Sources/ExpoModulesJSI/Contexts/HostObjectContext.swift',
    from: 'internal final class HostObjectContext: Sendable {',
    to: 'internal final class HostObjectContext: @unchecked Sendable {',
  },
  {
    file: 'node_modules/expo-modules-jsi/apple/Sources/ExpoModulesJSI/Contexts/HostObjectContext.swift',
    from: '  weak let runtime: JavaScriptRuntime?',
    to: '  weak var runtime: JavaScriptRuntime?',
  },
  {
    file: 'node_modules/expo-modules-jsi/apple/Sources/ExpoModulesJSI/Runtime/JavaScriptActor.swift',
    from: '  private weak let runtime: JavaScriptRuntime?',
    to: '  private weak var runtime: JavaScriptRuntime?',
  },
  {
    file: 'node_modules/expo-modules-jsi/apple/Sources/ExpoModulesJSI/Runtime/JavaScriptPropNameID.swift',
    from: '  private weak let runtime: JavaScriptRuntime?',
    to: '  private weak var runtime: JavaScriptRuntime?',
  },
  {
    file: 'node_modules/expo-modules-jsi/apple/Sources/ExpoModulesJSI/Runtime/JavaScriptPropNameID.swift',
    from: 'public final class JavaScriptPropNameID: JavaScriptType {',
    to: 'public final class JavaScriptPropNameID: JavaScriptType, @unchecked Sendable {',
  },
  {
    file: 'node_modules/expo-modules-jsi/apple/Sources/ExpoModulesJSI/Runtime/Values/JavaScriptArray.swift',
    from: '  internal weak let runtime: JavaScriptRuntime?',
    to: '  internal weak var runtime: JavaScriptRuntime?',
  },
  {
    file: 'node_modules/expo-modules-jsi/apple/Sources/ExpoModulesJSI/Runtime/Values/JavaScriptArrayBuffer.swift',
    from: '  internal weak let runtime: JavaScriptRuntime?',
    to: '  internal weak var runtime: JavaScriptRuntime?',
  },
  {
    file: 'node_modules/expo-modules-jsi/apple/Sources/ExpoModulesJSI/Runtime/Values/JavaScriptBigInt.swift',
    from: '  internal weak let runtime: JavaScriptRuntime?',
    to: '  internal weak var runtime: JavaScriptRuntime?',
  },
  {
    file: 'node_modules/expo-modules-jsi/apple/Sources/ExpoModulesJSI/Runtime/Values/JavaScriptError.swift',
    from: '  private weak let runtime: JavaScriptRuntime?',
    to: '  private weak var runtime: JavaScriptRuntime?',
  },
  {
    file: 'node_modules/expo-modules-jsi/apple/Sources/ExpoModulesJSI/Runtime/Values/JavaScriptFunction.swift',
    from: '  internal weak let runtime: JavaScriptRuntime?',
    to: '  internal weak var runtime: JavaScriptRuntime?',
  },
  {
    file: 'node_modules/expo-modules-jsi/apple/Sources/ExpoModulesJSI/Runtime/Values/JavaScriptObject.swift',
    from: '  internal weak let runtime: JavaScriptRuntime?',
    to: '  internal weak var runtime: JavaScriptRuntime?',
  },
  {
    file: 'node_modules/expo-modules-jsi/apple/Sources/ExpoModulesJSI/Runtime/Values/JavaScriptPromise.swift',
    from: '  private weak let runtime: JavaScriptRuntime?',
    to: '  private weak var runtime: JavaScriptRuntime?',
  },
  {
    file: 'node_modules/expo-modules-jsi/apple/Sources/ExpoModulesJSI/Runtime/Values/JavaScriptTypedArray.swift',
    from: '  internal weak let runtime: JavaScriptRuntime?',
    to: '  internal weak var runtime: JavaScriptRuntime?',
  },
  {
    file: 'node_modules/expo-modules-jsi/apple/Sources/ExpoModulesJSI/Runtime/Values/JavaScriptValue.swift',
    from: '  internal weak let runtime: JavaScriptRuntime?',
    to: '  internal weak var runtime: JavaScriptRuntime?',
  },
  {
    file: 'node_modules/expo-modules-jsi/apple/Sources/ExpoModulesJSI/Runtime/Values/JavaScriptValue.swift',
    from: 'public final class JavaScriptValue: JavaScriptType, Equatable, Escapable, Error {',
    to: 'public final class JavaScriptValue: JavaScriptType, Equatable, Escapable, Error, @unchecked Sendable {',
  },
  {
    file: 'node_modules/expo-modules-jsi/apple/Sources/ExpoModulesJSI/Runtime/Values/JavaScriptWeakObject.swift',
    from: '  internal weak let runtime: JavaScriptRuntime?',
    to: '  internal weak var runtime: JavaScriptRuntime?',
  },
  {
    file: 'node_modules/expo-modules-core/ios/Core/SharedObjects/SharedObjectRegistry.swift',
    from: '  private weak let appContext: AppContext?',
    to: '  private weak var appContext: AppContext?',
  },
];

let patched = 0;

for (const replacement of replacements) {
  const absolutePath = path.join(nodeModulesDir, replacement.file.replace(/^node_modules\//, ''));

  if (!fs.existsSync(absolutePath)) {
    continue;
  }

  const source = fs.readFileSync(absolutePath, 'utf8');
  const updated = source.replaceAll(replacement.from, replacement.to);

  if (updated !== source) {
    fs.writeFileSync(absolutePath, updated);
    patched += 1;
  }
}

console.log(`Patched Expo Swift declarations: ${patched}`);
