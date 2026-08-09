const { FuseV1Options, FuseVersion } = require('@electron/fuses')
const path = require('node:path')

const applicationIcon = path.join(
  __dirname,
  'resources',
  process.platform === 'win32' ? 'icon.ico' : process.platform === 'darwin' ? 'icon.icns' : 'icon.png',
)

module.exports = {
  packagerConfig: {
    asar: true,
    prune: false,
    executableName: 'markmap-plus-plus',
    appBundleId: 'io.github.jeoitim.markmap-plus-plus',
    appCategoryType: 'public.app-category.productivity',
    icon: applicationIcon,
    download:
      process.platform === 'win32' && process.arch === 'x64'
        ? {
            checksums: {
              'electron-v43.3.0-win32-x64.zip': '18528bedc6a9b04bdc5efb7b803cbc3cb0e5ea6415d54046e23d464d89a00da9',
            },
          }
        : undefined,
    extraResource: ['resources/update.json'],
    ignore: [
      /^\/src(?:\/|$)/,
      /^\/out(?:\/|$)/,
      /^\/resources(?:\/|$)/,
      /^\/node_modules(?:\/|$)/,
      /^\/tsconfig\.json$/,
      /^\/forge\.config\.cjs$/,
    ],
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'markmap_plus_plus',
        setupExe: 'markmap-plus-plus-Setup.exe',
        setupIcon: path.join(__dirname, 'resources', 'icon.ico'),
        noMsi: true,
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['win32'],
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-fuses',
      config: {
        version: FuseVersion.V1,
        [FuseV1Options.RunAsNode]: false,
        [FuseV1Options.EnableCookieEncryption]: true,
        [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
        [FuseV1Options.EnableNodeCliInspectArguments]: false,
        [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
        [FuseV1Options.OnlyLoadAppFromAsar]: true,
      },
    },
  ],
}
