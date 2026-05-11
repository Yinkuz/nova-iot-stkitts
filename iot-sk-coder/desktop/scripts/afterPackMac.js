/**
 * afterPack hook — ad-hoc code sign the macOS .app bundle.
 *
 * Without any signature macOS shows "NOVA is damaged and can't be opened."
 * Ad-hoc signing (identity "-") replaces that with the milder
 * "unidentified developer" warning, which users dismiss with
 * right-click → Open → Open Anyway (one time only).
 *
 * This runs on the CI macOS runner after electron-builder packs the .app
 * but before it wraps it into the DMG, so the DMG ships pre-signed.
 */

const { execSync } = require('child_process');
const path         = require('path');

exports.default = async function afterPack(context) {
  // Only applies to macOS builds
  if (context.electronPlatformName !== 'darwin') return;

  const appName = context.packager.appInfo.productName;
  const appPath = path.join(context.appOutDir, `${appName}.app`);

  console.log(`\n[afterPack] Ad-hoc signing: ${appPath}`);
  try {
    execSync(
      `codesign --sign - --force --deep --no-strict "${appPath}"`,
      { stdio: 'inherit' }
    );
    console.log('[afterPack] Ad-hoc signing complete.\n');
  } catch (err) {
    // Non-fatal: log and continue — build still produces a usable DMG
    console.warn('[afterPack] codesign failed (non-fatal):', err.message);
  }
};
