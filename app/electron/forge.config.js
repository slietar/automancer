module.exports = {
  packagerConfig: {
    extraResource: [
      'tmp/host'
    ],
    ignore: [
      /^renderer\.js$/,
      /^tmp$/
    ],
    name: 'PR–1'
  },
  makers: [
    { name: '@electron-forge/maker-zip' },
    { name: '@electron-forge/maker-squirrel',
      config: {
        authors: 'LBNC',
        description: 'Protocol Runner 1'
      } }
  ]
}
