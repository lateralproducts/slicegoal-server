module.exports = {
    presets: ['@babel/preset-env'],
    babelrcRoots: [
        "test/*", //allow for loading babel config for test with jest
    ],
}