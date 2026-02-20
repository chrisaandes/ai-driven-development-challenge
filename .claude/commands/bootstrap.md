---
description: Inicializa proyecto NestJS con Clean Architecture
---

Bootstrap the NestJS project with Clean Architecture structure:

**Step 1: Initialize NestJS**
```bash
npx @nestjs/cli new . --package-manager npm --skip-git
```

**Step 2: Install Dependencies**
```bash
# Core
npm install @prisma/client class-validator class-transformer @nestjs/swagger swagger-ui-express @nestjs/config

# Dev
npm install -D prisma @types/node jest @nestjs/testing supertest @types/supertest @types/express
```

**Step 3: Initialize Prisma**
```bash
npx prisma init
```

**Step 4: Copy Schema**
Copy the schema from .claude/specs/01-core-transactions/database-schema.prisma to prisma/schema.prisma

**Step 5: Create Module Structure**
Create these module files:
- src/domain/domain.module.ts
- src/application/application.module.ts
- src/infrastructure/infrastructure.module.ts
- src/presentation/presentation.module.ts

**Step 6: Update App Module**
Update src/app.module.ts to import all layer modules

**Step 7: Configure TypeScript**
Ensure tsconfig.json has strict mode enabled

**Step 8: Setup ESLint & Prettier**
Verify .eslintrc.js and .prettierrc exist with proper config

**Step 9: Verify Build**
```bash
npm run build
```

**Step 10: Generate Prisma Client**
```bash
npx prisma generate
```

Report any errors encountered during bootstrap.
