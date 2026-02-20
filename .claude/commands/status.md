---
description: Muestra el estado actual del proyecto y próximos pasos
---

Analyze the current project state and provide a status report.

**Check:**

1. **Project Structure**
   - List existing directories in src/
   - Count files per layer

2. **Implementation Progress**
   ```bash
   # Count implemented files
   find src/domain -name "*.ts" ! -name "*.spec.ts" | wc -l
   find src/application -name "*.ts" ! -name "*.spec.ts" | wc -l
   find src/infrastructure -name "*.ts" ! -name "*.spec.ts" | wc -l
   find src/presentation -name "*.ts" ! -name "*.spec.ts" | wc -l
   ```

3. **Test Coverage**
   - Check if tests exist
   - Run coverage if available

4. **Documentation**
   - Check docs/research/
   - Check .claude/specs/*/design.md
   - Check README.md

5. **Infrastructure**
   - Dockerfile exists?
   - k8s/ populated?
   - terraform/ populated?
   - .github/workflows/ exists?

**Output Format:**

```
# 📊 Project Status

## Phase Progress
- [x] Research (4/4 docs)
- [x] Design (3/3 specs)
- [ ] Implementation (12/20 files)
- [ ] Testing (5/15 tests)
- [ ] Infrastructure (0/4 configs)

## Coverage
- Domain: 95%
- Application: 80%
- Overall: 72%

## Next Steps
1. Complete infrastructure-dev tasks
2. Add missing e2e tests
3. Run /review before commit
```

Provide actionable next steps based on current state.
