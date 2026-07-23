const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');
const package = require('./package.json');

module.exports = {
  packagerConfig: {
    asar: true,
    appBundleId: "com.mjkey.anideskplus",
    name: "AniDeskPlus",
    appCopyright: "AniDeskPlus",
    icon: "icon/icon",
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'AniDeskPlus',
        authors: 'AniDeskPlus',
        iconUrl: "https://raw.githubusercontent.com/MjKey/AniDeskPlus/main/public/assets/icons/anidesk-icon.png",
        setupExe: `AniDeskPlus-${package.version}-win32.exe`,
        setupIcon: 'icon/icon.ico',
        loadingGif: 'icon/install-anim.gif'
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin', 'linux'],
    },
    {
      name: '@electron-forge/maker-deb',
      config: {
        options: {
          name: "anideskplus",
          productName: "AniDeskPlus",
          icon: "icon/icon.ico",
          maintainer: 'MjKey',
          homepage: "https://github.com/MjKey/AniDeskPlus",
        }
      },
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {},
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};
