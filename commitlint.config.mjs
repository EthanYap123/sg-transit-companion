/** Conventional Commits: https://www.conventionalcommits.org */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [2, 'always', ['api', 'web', 'worker', 'db', 'ci', 'deps', 'docs', 'release']],
    'body-max-line-length': [0],
  },
};
