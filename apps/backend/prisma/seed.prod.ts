/**
 * Seed de producción — MacroVision AI
 * Ejecutar UNA VEZ tras el primer deploy en Railway:
 *   DATABASE_URL="postgresql://..." npx ts-node prisma/seed.prod.ts
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seed de producción MacroVision AI...\n');

  // ─── Alimentos base ────────────────────────────
  const foods = [
    { name: 'Chicken Breast', nameEs: 'Pechuga de pollo', category: 'Protein', calories: 165, protein: 31, carbohydrates: 0, fat: 3.6, fiber: 0, source: 'ADMIN_VERIFIED', verifiedByAdmin: true },
    { name: 'Brown Rice', nameEs: 'Arroz integral', category: 'Grains', calories: 216, protein: 5, carbohydrates: 45, fat: 1.8, fiber: 3.5, source: 'ADMIN_VERIFIED', verifiedByAdmin: true },
    { name: 'Broccoli', nameEs: 'Brócoli', category: 'Vegetables', calories: 34, protein: 2.8, carbohydrates: 7, fat: 0.4, fiber: 2.6, source: 'ADMIN_VERIFIED', verifiedByAdmin: true },
    { name: 'Egg', nameEs: 'Huevo', category: 'Protein', calories: 155, protein: 13, carbohydrates: 1.1, fat: 11, fiber: 0, source: 'ADMIN_VERIFIED', verifiedByAdmin: true },
    { name: 'Oats', nameEs: 'Avena', category: 'Grains', calories: 389, protein: 17, carbohydrates: 66, fat: 7, fiber: 10.6, source: 'ADMIN_VERIFIED', verifiedByAdmin: true },
    { name: 'Salmon', nameEs: 'Salmón', category: 'Protein', calories: 208, protein: 20, carbohydrates: 0, fat: 13, fiber: 0, source: 'ADMIN_VERIFIED', verifiedByAdmin: true },
    { name: 'Sweet Potato', nameEs: 'Camote / Papa dulce', category: 'Vegetables', calories: 86, protein: 1.6, carbohydrates: 20, fat: 0.1, fiber: 3, source: 'ADMIN_VERIFIED', verifiedByAdmin: true },
    { name: 'Banana', nameEs: 'Plátano / Banana', category: 'Fruits', calories: 89, protein: 1.1, carbohydrates: 23, fat: 0.3, fiber: 2.6, source: 'ADMIN_VERIFIED', verifiedByAdmin: true },
    { name: 'Greek Yogurt', nameEs: 'Yogur griego', category: 'Dairy', calories: 59, protein: 10, carbohydrates: 3.6, fat: 0.4, fiber: 0, source: 'ADMIN_VERIFIED', verifiedByAdmin: true },
    { name: 'Almonds', nameEs: 'Almendras', category: 'Nuts', calories: 579, protein: 21, carbohydrates: 22, fat: 50, fiber: 12.5, source: 'ADMIN_VERIFIED', verifiedByAdmin: true },
    { name: 'Avocado', nameEs: 'Aguacate / Palta', category: 'Fruits', calories: 160, protein: 2, carbohydrates: 9, fat: 15, fiber: 7, source: 'ADMIN_VERIFIED', verifiedByAdmin: true },
    { name: 'White Rice', nameEs: 'Arroz blanco', category: 'Grains', calories: 130, protein: 2.7, carbohydrates: 28, fat: 0.3, fiber: 0.4, source: 'ADMIN_VERIFIED', verifiedByAdmin: true },
    { name: 'Whole Milk', nameEs: 'Leche entera', category: 'Dairy', calories: 61, protein: 3.2, carbohydrates: 4.8, fat: 3.3, fiber: 0, source: 'ADMIN_VERIFIED', verifiedByAdmin: true },
    { name: 'Tortilla de maíz', nameEs: 'Tortilla de maíz', category: 'Grains', calories: 218, protein: 5.7, carbohydrates: 46, fat: 2.5, fiber: 6.3, source: 'ADMIN_VERIFIED', verifiedByAdmin: true },
    { name: 'Black Beans', nameEs: 'Frijoles negros', category: 'Legumes', calories: 132, protein: 8.9, carbohydrates: 24, fat: 0.5, fiber: 8.7, source: 'ADMIN_VERIFIED', verifiedByAdmin: true },
  ];

  let foodCount = 0;
  for (const food of foods) {
    await prisma.foodItem.upsert({
      where: { id: food.nameEs?.toLowerCase().replace(/\s/g, '_') || food.name.toLowerCase().replace(/\s/g, '_') },
      update: {},
      create: {
        id: (food.nameEs || food.name).toLowerCase().replace(/[\s\/]/g, '_').replace(/[^a-z0-9_]/g, ''),
        ...food,
        servingSize: 100,
        servingUnit: 'g',
      },
    });
    foodCount++;
  }

  console.log(`✅ ${foodCount} alimentos insertados`);
  console.log('\n🎉 Seed de producción completado!');
  console.log('\n📋 Ahora crea tu primer usuario admin desde la app o via Supabase Dashboard.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
