import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const BASIC_CATEGORIES = [
  'Futbolista',
  'Futbolista retirado',
  'Club de América',
  'Club de Europa',
  'Selección Conmebol',
  'Selección UEFA',
  'Estadio',
  'Director Técnico',
];

const ADVANCED_CATEGORIES = [
  'Liga',
  'Selección CAF',
  'Selección CONCACAF',
  'Indispensable en un partido de fútbol',
  'Jugadores de un país específico',
  'Clubes que juegan Copa Libertadores',
  'Clubes que juegan Champions League',
  'Ganador de Balón de Oro',
];

async function main() {
  for (const name of BASIC_CATEGORIES) {
    await prisma.categories.upsert({
      where: { name },
      update: {},
      create: { name, is_advanced: false, is_active: true },
    });
  }

  for (const name of ADVANCED_CATEGORIES) {
    await prisma.categories.upsert({
      where: { name },
      update: {},
      create: { name, is_advanced: true, is_active: true },
    });
  }

  console.log('✅ Categorías sembradas');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  }); 