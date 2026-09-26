module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.jsx?$': 'babel-jest',
  },
  roots: ['<rootDir>/test'],
  moduleFileExtensions: ['js', 'json'],
  verbose: true,
}
