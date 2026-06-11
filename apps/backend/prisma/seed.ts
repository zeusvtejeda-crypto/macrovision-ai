import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

// Constantes de enums (ahora son Strings en SQLite)
const UserRole = { USER: 'USER', ADMIN: 'ADMIN', SUPER_ADMIN: 'SUPER_ADMIN' } as const;
const SubscriptionStatus = { FREE: 'FREE', ACTIVE: 'ACTIVE', TRIAL: 'TRIAL' } as const;
const FoodSource = { ADMIN_VERIFIED: 'ADMIN_VERIFIED', CUSTOM: 'CUSTOM' } as const;

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed de MacroVision AI...');

  // ─── Admin User ─────────────────────────────
  const adminPassword = await bcrypt.hash('Admin123!', 12);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@macrovision.ai' },
    update: {},
    create: {
      email: 'admin@macrovision.ai',
      passwordHash: adminPassword,
      name: 'Admin MacroVision',
      emailVerified: true,
      role: UserRole.SUPER_ADMIN,
      subscriptionStatus: SubscriptionStatus.ACTIVE,
      onboardingCompleted: true,
      profile: {
        create: {
          age: 30,
          weight: 75,
          height: 175,
          targetCalories: 2000,
          targetProtein: 150,
          targetCarbs: 200,
          targetFat: 67,
        },
      },
    },
  });

  console.log('✅ Admin creado:', admin.email);

  // ─── Demo User ──────────────────────────────
  const demoPassword = await bcrypt.hash('Demo123!', 12);

  const demo = await prisma.user.upsert({
    where: { email: 'demo@macrovision.ai' },
    update: {},
    create: {
      email: 'demo@macrovision.ai',
      passwordHash: demoPassword,
      name: 'Usuario Demo',
      emailVerified: true,
      onboardingCompleted: true,
      profile: {
        create: {
          age: 28,
          sex: 'MALE',
          weight: 80,
          height: 180,
          activityLevel: 'MODERATELY_ACTIVE',
          goal: 'LOSE_FAT',
          bmr: 1875,
          tdee: 2906,
          targetCalories: 2406, // TDEE - 500 déficit
          targetProtein: 180,
          targetCarbs: 241,
          targetFat: 80,
          targetFiber: 30,
          proteinPercent: 30,
          carbsPercent: 40,
          fatPercent: 30,
        },
      },
    },
  });

  console.log('✅ Demo user creado:', demo.email);

  // ─── Alimentos Base (100 alimentos comunes) ──
  const foods = [
    // Proteínas
    { name: 'Pechuga de pollo (sin piel)', nameEs: 'Pechuga de pollo', category: 'Carnes', calories: 165, protein: 31, carbohydrates: 0, fat: 3.6, fiber: 0 },
    { name: 'Salmón atlántico', nameEs: 'Salmón', category: 'Pescados', calories: 208, protein: 20, carbohydrates: 0, fat: 13, fiber: 0 },
    { name: 'Atún en agua', nameEs: 'Atún', category: 'Pescados', calories: 116, protein: 25.5, carbohydrates: 0, fat: 1, fiber: 0 },
    { name: 'Huevo entero', nameEs: 'Huevo', category: 'Huevos', calories: 143, protein: 12.6, carbohydrates: 0.7, fat: 9.5, fiber: 0, servingSize: 50, servingUnit: 'pza' },
    { name: 'Clara de huevo', nameEs: 'Clara de huevo', category: 'Huevos', calories: 52, protein: 10.9, carbohydrates: 0.7, fat: 0.2, fiber: 0 },
    { name: 'Carne molida 90/10', nameEs: 'Carne molida', category: 'Carnes', calories: 176, protein: 20, carbohydrates: 0, fat: 10, fiber: 0 },
    { name: 'Pechuga de pavo', nameEs: 'Pechuga de pavo', category: 'Carnes', calories: 135, protein: 30, carbohydrates: 0, fat: 1, fiber: 0 },
    { name: 'Camarones', nameEs: 'Camarones', category: 'Mariscos', calories: 99, protein: 18, carbohydrates: 0.9, fat: 1.7, fiber: 0 },

    // Carbohidratos
    { name: 'Arroz blanco cocido', nameEs: 'Arroz blanco', category: 'Cereales', calories: 130, protein: 2.7, carbohydrates: 28, fat: 0.3, fiber: 0.4 },
    { name: 'Arroz integral cocido', nameEs: 'Arroz integral', category: 'Cereales', calories: 112, protein: 2.3, carbohydrates: 23, fat: 0.8, fiber: 1.8 },
    { name: 'Pasta cocida', nameEs: 'Pasta', category: 'Cereales', calories: 158, protein: 5.8, carbohydrates: 31, fat: 0.9, fiber: 1.8 },
    { name: 'Pan integral', nameEs: 'Pan integral', category: 'Panadería', calories: 247, protein: 13, carbohydrates: 41, fat: 3.4, fiber: 7, servingSize: 30, servingUnit: 'rebanada' },
    { name: 'Avena', nameEs: 'Avena', category: 'Cereales', calories: 389, protein: 17, carbohydrates: 66, fat: 6.9, fiber: 10.6, servingSize: 40, servingUnit: 'porción' },
    { name: 'Papa/Patata cocida', nameEs: 'Papa', category: 'Tubérculos', calories: 87, protein: 1.9, carbohydrates: 20, fat: 0.1, fiber: 1.8 },
    { name: 'Camote/Batata cocido', nameEs: 'Camote', category: 'Tubérculos', calories: 90, protein: 2, carbohydrates: 21, fat: 0.1, fiber: 3.3 },
    { name: 'Frijoles negros cocidos', nameEs: 'Frijoles negros', category: 'Leguminosas', calories: 132, protein: 8.9, carbohydrates: 24, fat: 0.5, fiber: 8.7 },
    { name: 'Lentejas cocidas', nameEs: 'Lentejas', category: 'Leguminosas', calories: 116, protein: 9, carbohydrates: 20, fat: 0.4, fiber: 7.9 },
    { name: 'Quinoa cocida', nameEs: 'Quinoa', category: 'Cereales', calories: 120, protein: 4.4, carbohydrates: 21, fat: 1.9, fiber: 2.8 },
    { name: 'Tortilla de maíz', nameEs: 'Tortilla de maíz', category: 'Panadería', calories: 218, protein: 6, carbohydrates: 46, fat: 2.5, fiber: 4, servingSize: 30, servingUnit: 'pza' },
    { name: 'Pan blanco', nameEs: 'Pan blanco', category: 'Panadería', calories: 265, protein: 9, carbohydrates: 49, fat: 3.2, fiber: 2.7, servingSize: 30, servingUnit: 'rebanada' },

    // Frutas
    { name: 'Manzana', nameEs: 'Manzana', category: 'Frutas', calories: 52, protein: 0.3, carbohydrates: 14, fat: 0.2, fiber: 2.4, servingSize: 180, servingUnit: 'pza' },
    { name: 'Plátano/Banana', nameEs: 'Plátano', category: 'Frutas', calories: 89, protein: 1.1, carbohydrates: 23, fat: 0.3, fiber: 2.6, servingSize: 118, servingUnit: 'pza' },
    { name: 'Naranja', nameEs: 'Naranja', category: 'Frutas', calories: 47, protein: 0.9, carbohydrates: 12, fat: 0.1, fiber: 2.4, servingSize: 130, servingUnit: 'pza' },
    { name: 'Fresa/Fresas', nameEs: 'Fresas', category: 'Frutas', calories: 32, protein: 0.7, carbohydrates: 7.7, fat: 0.3, fiber: 2 },
    { name: 'Mango', nameEs: 'Mango', category: 'Frutas', calories: 60, protein: 0.8, carbohydrates: 15, fat: 0.4, fiber: 1.6 },
    { name: 'Aguacate/Palta', nameEs: 'Aguacate', category: 'Frutas', calories: 160, protein: 2, carbohydrates: 9, fat: 15, fiber: 7, servingSize: 68, servingUnit: 'mitad' },
    { name: 'Uvas', nameEs: 'Uvas', category: 'Frutas', calories: 69, protein: 0.7, carbohydrates: 18, fat: 0.2, fiber: 0.9 },
    { name: 'Kiwi', nameEs: 'Kiwi', category: 'Frutas', calories: 61, protein: 1.1, carbohydrates: 15, fat: 0.5, fiber: 3, servingSize: 69, servingUnit: 'pza' },

    // Verduras
    { name: 'Brócoli cocido', nameEs: 'Brócoli', category: 'Verduras', calories: 35, protein: 2.4, carbohydrates: 7.2, fat: 0.4, fiber: 3.3 },
    { name: 'Espinaca cruda', nameEs: 'Espinaca', category: 'Verduras', calories: 23, protein: 2.9, carbohydrates: 3.6, fat: 0.4, fiber: 2.2 },
    { name: 'Zanahoria cruda', nameEs: 'Zanahoria', category: 'Verduras', calories: 41, protein: 0.9, carbohydrates: 10, fat: 0.2, fiber: 2.8 },
    { name: 'Tomate', nameEs: 'Tomate', category: 'Verduras', calories: 18, protein: 0.9, carbohydrates: 3.9, fat: 0.2, fiber: 1.2 },
    { name: 'Pepino', nameEs: 'Pepino', category: 'Verduras', calories: 15, protein: 0.7, carbohydrates: 3.6, fat: 0.1, fiber: 0.5 },
    { name: 'Lechuga romana', nameEs: 'Lechuga', category: 'Verduras', calories: 17, protein: 1.2, carbohydrates: 3.3, fat: 0.3, fiber: 2.1 },
    { name: 'Pimiento rojo', nameEs: 'Pimiento', category: 'Verduras', calories: 31, protein: 1, carbohydrates: 7.3, fat: 0.3, fiber: 2.5 },
    { name: 'Cebolla', nameEs: 'Cebolla', category: 'Verduras', calories: 40, protein: 1.1, carbohydrates: 9.3, fat: 0.1, fiber: 1.7 },
    { name: 'Coliflor cocida', nameEs: 'Coliflor', category: 'Verduras', calories: 23, protein: 1.9, carbohydrates: 4.1, fat: 0.5, fiber: 2.3 },
    { name: 'Calabacita/Zucchini', nameEs: 'Calabacita', category: 'Verduras', calories: 17, protein: 1.2, carbohydrates: 3.1, fat: 0.3, fiber: 1 },

    // Lácteos
    { name: 'Leche entera', nameEs: 'Leche entera', category: 'Lácteos', calories: 61, protein: 3.2, carbohydrates: 4.8, fat: 3.3, fiber: 0, servingSize: 240, servingUnit: 'taza' },
    { name: 'Leche descremada', nameEs: 'Leche descremada', category: 'Lácteos', calories: 34, protein: 3.4, carbohydrates: 5, fat: 0.2, fiber: 0, servingSize: 240, servingUnit: 'taza' },
    { name: 'Yogur griego natural', nameEs: 'Yogur griego', category: 'Lácteos', calories: 59, protein: 10, carbohydrates: 3.6, fat: 0.4, fiber: 0, servingSize: 150, servingUnit: 'porción' },
    { name: 'Queso cottage', nameEs: 'Queso cottage', category: 'Lácteos', calories: 98, protein: 11.1, carbohydrates: 3.4, fat: 4.3, fiber: 0, servingSize: 100, servingUnit: 'porción' },
    { name: 'Queso cheddar', nameEs: 'Queso cheddar', category: 'Lácteos', calories: 403, protein: 25, carbohydrates: 1.3, fat: 33, fiber: 0, servingSize: 30, servingUnit: 'rebanada' },
    { name: 'Queso mozzarella', nameEs: 'Queso mozzarella', category: 'Lácteos', calories: 280, protein: 28, carbohydrates: 3.1, fat: 17, fiber: 0, servingSize: 30, servingUnit: 'porción' },

    // Grasas y oleaginosas
    { name: 'Aceite de oliva', nameEs: 'Aceite de oliva', category: 'Aceites', calories: 884, protein: 0, carbohydrates: 0, fat: 100, fiber: 0, servingSize: 14, servingUnit: 'cdita' },
    { name: 'Mantequilla de maní', nameEs: 'Mantequilla de maní', category: 'Oleaginosas', calories: 588, protein: 25, carbohydrates: 20, fat: 50, fiber: 6, servingSize: 32, servingUnit: 'cda' },
    { name: 'Almendras', nameEs: 'Almendras', category: 'Oleaginosas', calories: 579, protein: 21, carbohydrates: 22, fat: 49, fiber: 12.5, servingSize: 28, servingUnit: 'porción' },
    { name: 'Nueces', nameEs: 'Nueces', category: 'Oleaginosas', calories: 654, protein: 15, carbohydrates: 14, fat: 65, fiber: 6.7, servingSize: 28, servingUnit: 'porción' },

    // Comidas mexicanas (mercado principal)
    { name: 'Taco de pollo', nameEs: 'Taco de pollo', category: 'Comida mexicana', calories: 180, protein: 15, carbohydrates: 18, fat: 5, fiber: 2, servingSize: 100, servingUnit: 'taco' },
    { name: 'Enchiladas rojas', nameEs: 'Enchiladas', category: 'Comida mexicana', calories: 207, protein: 10, carbohydrates: 22, fat: 9, fiber: 3, servingSize: 180, servingUnit: 'porción' },
    { name: 'Caldo de pollo', nameEs: 'Caldo de pollo', category: 'Sopas', calories: 15, protein: 1.5, carbohydrates: 1, fat: 0.5, fiber: 0, servingSize: 240, servingUnit: 'taza' },
    { name: 'Pozole rojo', nameEs: 'Pozole', category: 'Comida mexicana', calories: 97, protein: 7, carbohydrates: 13, fat: 2, fiber: 2, servingSize: 250, servingUnit: 'tazón' },
    { name: 'Guacamole', nameEs: 'Guacamole', category: 'Comida mexicana', calories: 150, protein: 2, carbohydrates: 8, fat: 13, fiber: 5, servingSize: 100, servingUnit: 'porción' },
  ];

  let createdFoods = 0;
  for (const food of foods) {
    await prisma.foodItem.upsert({
      where: { id: `seed-${food.name.replace(/\s/g, '-').toLowerCase()}` },
      update: {},
      create: {
        id: `seed-${food.name.replace(/\s/g, '-').toLowerCase()}`,
        name: food.name,
        nameEs: food.nameEs,
        category: food.category,
        calories: food.calories,
        protein: food.protein,
        carbohydrates: food.carbohydrates,
        fat: food.fat,
        fiber: food.fiber || 0,
        servingSize: food.servingSize || 100,
        servingUnit: food.servingUnit || 'g',
        source: FoodSource.ADMIN_VERIFIED,
        verifiedByAdmin: true,
        confidenceScore: 1.0,
      },
    });
    createdFoods++;
  }

  console.log(`✅ ${createdFoods} alimentos base creados`);
  console.log('🎉 Seed completado exitosamente!');
  console.log('\n📋 Credenciales:');
  console.log('   Admin: admin@macrovision.ai / Admin123!');
  console.log('   Demo:  demo@macrovision.ai / Demo123!');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('❌ Error en seed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
