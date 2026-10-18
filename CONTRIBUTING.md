# Contributing to BidBattle

Thank you for your interest in contributing to **BidBattle**! To maintain code quality, consistency, and a seamless developer experience, please follow these guidelines.

---

## 🚀 Development Setup

1. **Prerequisites:**
   - Node.js `>= 22.0.0` (run `nvm use` or `fnm use`)
   - npm `>= 10.0.0`
   - Docker & Docker Compose
2. **Setup:**
   ```bash
   npm install
   cd server && npm install
   cd ../client && npm install
   cd ..
   ```
3. **Verify Git Hooks:**
   Ensure Husky hooks are installed by running `npm run prepare`.

---

## 🌿 Branch Naming Conventions

Prefix your branches with the type of work you are performing:

- `feat/feature-name` — New feature or capability
- `fix/bug-description` — Bug fix
- `chore/task-name` — Tooling, dependency updates, configuration
- `refactor/scope-name` — Code restructuring without feature change
- `docs/topic-name` — Documentation improvements
- `ci/workflow-name` — CI/CD automation changes
- `test/test-scope` — Adding or updating test suites

---

## 📝 Commit Conventions (Conventional Commits)

We strictly enforce [Conventional Commits](https://www.conventionalcommits.org/) via `commitlint`:

```text
<type>(<scope>): <short description>
```

### Allowed Types:

- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation only changes
- `style`: Changes that do not affect code logic (formatting, white-space)
- `refactor`: Code change that neither fixes a bug nor adds a feature
- `perf`: Code change that improves performance
- `test`: Adding missing tests or correcting existing tests
- `chore`: Tooling, build process, or auxiliary package changes
- `ci`: Changes to CI/CD workflows and scripts

### Examples:

- `feat(bid): implement optimistic lock retry mechanism`
- `fix(auth): handle expired refresh token race condition`
- `chore(deps): update testcontainers to latest version`

---

## 🧪 Pull Request Guidelines

Before opening a Pull Request:

1. Ensure all TypeScript files pass type checking:
   ```bash
   npm run typecheck
   ```
2. Ensure linter passes:
   ```bash
   npm run lint
   ```
3. Ensure unit and integration tests pass:
   ```bash
   npm run test
   npm run test:e2e
   ```
4. Fill out the Pull Request template completely, including testing steps.
5. All PRs require review and passing GitHub Actions status checks (`client-ci`, `server-ci`, `commitlint`) before merging.
