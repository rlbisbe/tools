# Agent Development Guidelines

This document provides essential guidelines for AI agents (like Claude Code) working on this repository.

## Testing Requirements

### Tests Are Mandatory

All code changes MUST include appropriate tests. This is not optional.

- **New features** require new tests that verify the functionality
- **Bug fixes** require tests that prevent regression
- **Refactoring** must maintain or improve existing test coverage

### Tests Must Pass Before Committing

**CRITICAL**: All tests must pass before committing any changes.

```bash
# Always run the full test suite before committing
npm test  # or appropriate test command for this project
```

### When Tests Fail

If tests fail after your changes, you must fix the underlying issue.

**NEVER do the following:**

- ❌ Comment out failing tests
- ❌ Skip or ignore failing tests
- ❌ Use `.skip()` or similar mechanisms to bypass tests
- ❌ Delete tests that are failing
- ❌ Commit with the intention to "fix tests later"

**Instead, you MUST:**

- ✅ Understand why the test is failing
- ✅ Fix your code to make the test pass
- ✅ Update the test if it's testing outdated behavior (only after careful analysis)
- ✅ Ask for clarification if the expected behavior is unclear

### Test-Driven Development Workflow

The recommended workflow is:

1. **Understand** the requirement
2. **Read** existing tests to understand patterns
3. **Write** tests for new functionality (or update existing tests)
4. **Implement** the feature/fix
5. **Run** all tests
6. **Fix** any failures by correcting the implementation
7. **Verify** all tests pass
8. **Commit** only when everything is green

### Test Quality

Tests should be:

- **Clear**: Easy to understand what they're testing
- **Focused**: Each test should verify one specific behavior
- **Reliable**: No flaky tests; they should pass consistently
- **Fast**: Tests should run quickly to encourage frequent execution
- **Maintainable**: Easy to update when requirements change

## Why This Matters

Commenting out or ignoring tests is a form of technical debt that:

- Hides bugs and regressions
- Erodes confidence in the codebase
- Makes future changes more risky
- Wastes the effort that went into writing the tests

**Tests are documentation of expected behavior.** When they fail, they're telling you something important.

## Summary

> When tests fail, fix the code, not the tests. Only modify tests when the expected behavior has genuinely changed, and only after careful analysis.
