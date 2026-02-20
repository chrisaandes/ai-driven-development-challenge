---
description: Ejecuta code review completo antes de commit
---

Use the reviewer subagent to perform comprehensive code review.

**Check Areas:**

1. **Architecture Compliance**
   ```bash
   # Verify no layer violations
   grep -r "from '@nestjs" src/domain/
   grep -r "from '@prisma" src/domain/
   grep -r "from '../infrastructure" src/application/
   ```

2. **Security**
   - All DTOs have validation decorators
   - No raw SQL queries
   - No sensitive data in logs
   - Proper error messages

3. **Code Quality**
   - JSDoc on all public methods
   - Consistent naming conventions
   - Proper error handling
   - No console.log (use Logger)

4. **Testing**
   - Run: npm run test:cov
   - Verify coverage >= 85%

5. **Linting**
   - Run: npm run lint
   - Run: npx tsc --noEmit

**Output Format:**
Generate review report with:
- Summary (PASS/FAIL)
- Issues by severity (Critical/High/Medium/Low)
- Specific file:line references
- Recommended fixes

Save to: docs/reviews/review-{timestamp}.md
