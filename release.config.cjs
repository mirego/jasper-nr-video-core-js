module.exports = {
    branches: [
      { name: 'stable' },
      { name: 'v*.*.*', prerelease: true },
    ],
    plugins: [
      [
        '@semantic-release/commit-analyzer',
        {
          preset: 'conventionalcommits',
          releaseRules: [
            { type: 'feat', release: 'major' },
            { type: 'fix', release: 'patch' },
            { type: 'perf', release: 'patch' },
            { type: 'BREAKING CHANGE', release: 'major' },
          ],
          parserOpts: {
            noteKeywords: ['BREAKING CHANGE', 'BREAKING CHANGES'],
          },
        },
      ],
      '@semantic-release/release-notes-generator',
      '@semantic-release/changelog',
      '@semantic-release/npm',
      '@semantic-release/github',
      '@semantic-release/git',
    ],
  };