import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Estos nombres tienen que coincidir EXACTO con VALID_CATEGORIES
// en src/tutti-frutti/tutti-frutti.service.ts
const BASIC_CATEGORIES = [
  'Jugador',
  'Equipo',
  'DT',
  'Selección',
  'Jugador Arg',
  'Equipo Arg',
  'DT Arg',
  'Estadio',
];

const ADVANCED_CATEGORIES = [
  'Campeón Champions',
  'Campeón Mundial',
  'Jugador Argentino',
  'Apodo Club',
  'Jugador Histórico',
  'Clásico',
  'Goleador',
  'País Sede',
  'Selección Campeona',
  'Equipo Campeón',
  'Jugador Promesa',
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

  console.log('✅ Categorías sembradas (alineadas con tutti-frutti.service.ts)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  }); 