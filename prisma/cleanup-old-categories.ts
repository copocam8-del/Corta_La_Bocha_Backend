import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Nombres viejos que ya NO se usan (reemplazados por los de tutti-frutti.service.ts)
const OLD_CATEGORY_NAMES = [
  'Futbolista',
  'Futbolista retirado',
  'Club de América',
  'Club de Europa',
  'Selección Conmebol',
  'Selección UEFA',
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
  // Verificamos primero si alguna tiene respuestas asociadas (no deberían, pero por seguridad)
  for (const name of OLD_CATEGORY_NAMES) {
    const category = await prisma.categories.findUnique({
      where: { name },
      include: { answers: true },
    });

    if (!category) continue;

    if (category.answers.length > 0) {
      console.log(`⚠️  Saltando "${name}": tiene ${category.answers.length} respuestas asociadas, no se borra`);
      continue;
    }

    await prisma.categories.delete({ where: { id: category.id } });
    console.log(`🗑️  Borrada: ${name}`);
  }

  console.log('✅ Limpieza completada');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  }); 