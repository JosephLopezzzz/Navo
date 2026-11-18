const { withAppDelegate, withMainApplication } = require('expo/config-plugins');

// These startup anchors are specific to Expo SDK 58 / React Native 0.88.
// Native pointer dispatchers read these flags when the React root is created.
const BEGIN_MARKER = '// @generated begin navo-native-pointer-events';
const END_MARKER = '// @generated end navo-native-pointer-events';

function insertBeforeStartup(contents, anchorLine, statement, fileName) {
  const newline = contents.includes('\r\n') ? '\r\n' : '\n';
  const lines = contents.replace(/\r\n/g, '\n').split('\n');
  const anchors = lines.flatMap((line, index) => line === anchorLine ? [index] : []);
  if (anchors.length !== 1) {
    throw new Error(`[with-native-pointer-events] Expected one SDK 58 startup anchor in ${fileName}; found ${anchors.length}. Review the native template before enabling pointer events.`);
  }

  const block = [
    `    ${BEGIN_MARKER}`,
    `    ${statement}`,
    `    ${END_MARKER}`,
  ];
  const beginCount = lines.filter((line) => line.trim() === BEGIN_MARKER).length;
  const endCount = lines.filter((line) => line.trim() === END_MARKER).length;
  if (beginCount || endCount) {
    const precedingLines = lines.slice(Math.max(0, anchors[0] - block.length), anchors[0]);
    if (beginCount !== 1 || endCount !== 1 || precedingLines.join('\n') !== block.join('\n')) {
      throw new Error(`[with-native-pointer-events] Existing pointer-event markers in ${fileName} are incomplete, modified, or no longer before startup. Review them before prebuild.`);
    }
    return contents;
  }
  if (contents.includes(statement)) {
    throw new Error(`[with-native-pointer-events] An unmanaged pointer-event flag already exists in ${fileName}. Refusing to add another startup assignment.`);
  }

  lines.splice(anchors[0], 0, ...block);
  return lines.join(newline);
}

module.exports = function withNativePointerEvents(config) {
  config = withMainApplication(config, (modConfig) => {
    if (modConfig.modResults.language !== 'kt') {
      throw new Error('[with-native-pointer-events] Expected the SDK 58 Kotlin MainApplication template.');
    }
    modConfig.modResults.contents = insertBeforeStartup(
      modConfig.modResults.contents,
      '    loadReactNative(this)',
      'com.facebook.react.config.ReactFeatureFlags.dispatchPointerEvents = true',
      'MainApplication.kt',
    );
    return modConfig;
  });

  return withAppDelegate(config, (modConfig) => {
    if (modConfig.modResults.language !== 'swift') {
      throw new Error('[with-native-pointer-events] Expected the SDK 58 Swift AppDelegate template.');
    }
    modConfig.modResults.contents = insertBeforeStartup(
      modConfig.modResults.contents,
      '    let delegate = ReactNativeDelegate()',
      'RCTSetDispatchW3CPointerEvents(true)',
      'AppDelegate.swift',
    );
    return modConfig;
  });
};
