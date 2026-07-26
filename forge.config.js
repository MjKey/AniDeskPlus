const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');
const package = require('./package.json');

module.exports = {
  packagerConfig: {
    asar: true,
    appBundleId: "com.mjkey.anixflow",
    name: "AniXFlow",
    appCopyright: "AniXFlow",
    icon: "icon/icon",
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'AniXFlow',
        authors: 'AniXFlow',
        iconUrl: "https://raw.githubusercontent.com/MjKey/AniXFlow/main/public/assets/icons/anixflow-icon.png",
        setupExe: `AniXFlow-${package.version}-win32.exe`,
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
          name: "anixflow",
          productName: "AniXFlow",
          icon: "icon/icon.ico",
          maintainer: 'MjKey',
          homepage: "https://github.com/MjKey/AniXFlow",
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
