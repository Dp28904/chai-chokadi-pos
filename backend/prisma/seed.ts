import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const username = process.env.ADMIN_USERNAME ?? 'admin';
  const password = process.env.ADMIN_PASSWORD ?? 'admin123';
  await prisma.user.upsert({
    where: { username },
    update: {},
    create: {
      name: 'Admin',
      username,
      passwordHash: await bcrypt.hash(password, 10),
      role: 'ADMIN',
    },
  });
  console.log(`Seeded admin user "${username}"`);
}

main()
  .catch((e: unknown) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
