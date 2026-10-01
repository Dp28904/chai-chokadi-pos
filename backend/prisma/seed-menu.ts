// Loads the Chai Chokadi menu (categories, items, combos, offers, photos).
// Run once on an empty menu:  npm run seed:menu
// Prices are in paise.
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';
import { optimiseImage } from '../src/uploads/image';

const prisma = new PrismaClient();
const rs = (rupees: number) => rupees * 100;

async function photo(file: string) {
  // Same optimisation as uploads through the app (small WebP).
  const img = await optimiseImage(readFileSync(join(__dirname, 'menu-images', file)), 'photo');
  const row = await prisma.upload.create({ data: { mime: img.mime, data: new Uint8Array(img.data) } });
  return `/api/uploads/${row.id}`;
}

/** Shown in "Chokadi Favourites" on the counter home. */
const FAVOURITES = new Set([
  'Chokadi Special Poha',
  'Chokadi Sev Khamani',
  'Chatpata Maska Bun',
  'Chokadi Thepla (2 pcs)',
  'Butter Blast Toast',
]);

const MENU: {
  category: string;
  items: { name: string; price: number; description: string; image: string }[];
}[] = [
  {
    category: 'Chai & Coffee',
    items: [
      {
        name: 'Chokadi Kulhadi Chai',
        price: 30,
        description: 'Our special masala chai with rich taste & aroma.',
        image: 'kulhadi-chai.jpg',
      },
      {
        name: 'Chokadi Coffee',
        price: 35,
        description: 'Smooth, creamy coffee for a perfect refreshment.',
        image: 'chokadi-coffee.jpg',
      },
    ],
  },
  {
    category: 'Thepla Platter',
    items: [
      {
        name: 'Chokadi Thepla (2 pcs)',
        price: 40,
        description: 'Soft, wholesome thepla served with chutney.',
        image: 'thepla.jpg',
      },
      { name: 'Extra Thepla (1 pc)', price: 20, description: 'One more soft thepla.', image: 'thepla.jpg' },
      { name: 'Add Dahi (Curd)', price: 12, description: 'Fresh curd on the side.', image: 'dahi.jpg' },
    ],
  },
  {
    category: 'Poha',
    items: [
      {
        name: 'Chokadi Special Poha',
        price: 50,
        description:
          'Light & fluffy poha tossed with homemade chutney, nylon sev, peanuts, pomegranate & fresh coriander.',
        image: 'poha.jpg',
      },
    ],
  },
  {
    category: 'Sev Khamani',
    items: [
      {
        name: 'Chokadi Sev Khamani',
        price: 60,
        description: 'Soft & fluffy khamani topped with nylon sev, pomegranate & fresh coriander.',
        image: 'sev-khamani.jpg',
      },
    ],
  },
  {
    category: 'Maska Bun',
    items: [
      {
        name: 'Butter Maska Bun',
        price: 40,
        description: 'Soft bun with rich butter.',
        image: 'butter-maska.jpg',
      },
      {
        name: 'Choco Maska Bun',
        price: 50,
        description: 'Loaded chocolate spread.',
        image: 'choco-maska.jpg',
      },
      {
        name: 'Chatpata Maska Bun',
        price: 55,
        description: 'Tasty mix of sing, sev, butter & chutney.',
        image: 'chatpata-maska.jpg',
      },
      {
        name: 'Jam Maska Bun',
        price: 50,
        description: 'Sweet & fruity jam with butter.',
        image: 'jam-maska.jpg',
      },
      {
        name: 'Butter Chocolate Bun',
        price: 50,
        description: 'Perfect blend of butter & chocolate delight.',
        image: 'butter-choco-bun.jpg',
      },
    ],
  },
  {
    category: 'Toast Bar',
    items: [
      {
        name: 'Classic Crunch Toast',
        price: 30,
        description: 'Plain toast, simple & crispy.',
        image: 'classic-crunch.jpg',
      },
      {
        name: 'Butter Blast Toast',
        price: 40,
        description: 'Golden toast loaded with butter.',
        image: 'butter-blast.jpg',
      },
      {
        name: 'Choco Crunch Toast',
        price: 40,
        description: 'Crispy toast with rich chocolate spread.',
        image: 'choco-crunch.jpg',
      },
    ],
  },
];

async function main() {
  if ((await prisma.category.count()) > 0) {
    console.log('Menu already has categories - nothing done. Clear the menu first to reseed.');
    return;
  }

  const cat: Record<string, number> = {};
  const item: Record<string, number> = {};
  const photoCache: Record<string, string> = {};
  const img = async (f: string) => (photoCache[f] ??= await photo(f));

  for (const [sortOrder, c] of MENU.entries()) {
    cat[c.category] = (await prisma.category.create({ data: { name: c.category, sortOrder } })).id;
    for (const i of c.items) {
      const row = await prisma.item.create({
        data: {
          categoryId: cat[c.category],
          name: i.name,
          description: i.description,
          price: rs(i.price),
          isFavourite: FAVOURITES.has(i.name),
          imageUrl: await img(i.image),
        },
      });
      item[i.name] = row.id;
    }
  }

  const fixed = async (
    name: string,
    price: number,
    description: string,
    image: string,
    parts: [string, number][],
  ) =>
    prisma.combo.create({
      data: {
        name,
        price: rs(price),
        description,
        imageUrl: await img(image),
        items: { create: parts.map(([n, qty]) => ({ itemId: item[n], qty })) },
      },
    });
  const choice = async (
    name: string,
    price: number,
    description: string,
    image: string,
    category: string,
    qty: number,
  ) =>
    prisma.combo.create({
      data: {
        name,
        price: rs(price),
        description,
        imageUrl: await img(image),
        choiceCategoryId: cat[category],
        choiceQty: qty,
      },
    });

  await fixed('Poha Thepla Combo', 85, 'Special Poha + Thepla (2 pcs)', 'combo-poha-thepla.jpg', [
    ['Chokadi Special Poha', 1],
    ['Chokadi Thepla (2 pcs)', 1],
  ]);
  await fixed('Khamani Thepla Combo', 95, 'Sev Khamani + Thepla (2 pcs)', 'combo-khamani-thepla.jpg', [
    ['Chokadi Sev Khamani', 1],
    ['Chokadi Thepla (2 pcs)', 1],
  ]);
  await choice(
    'Maska Duo Combo',
    85,
    'Any 2 Maska Buns (choose from menu)',
    'combo-maska-duo.jpg',
    'Maska Bun',
    2,
  );
  await choice(
    'Toast Duo Combo',
    75,
    'Any 2 Toasts (choose from menu)',
    'combo-toast-duo.jpg',
    'Toast Bar',
    2,
  );
  await fixed('Chatpata Combo', 90, 'Chatpata Maska Bun + Butter Blast Toast', 'combo-chatpata.jpg', [
    ['Chatpata Maska Bun', 1],
    ['Butter Blast Toast', 1],
  ]);

  await prisma.offer.createMany({
    data: [
      {
        name: 'Maska Bun Offer',
        type: 'PERCENT_OFF',
        scope: 'CATEGORY',
        targetId: cat['Maska Bun'],
        value: 10,
        minQty: 2,
        maxDiscount: rs(5),
      },
      {
        name: 'Toast Offer',
        type: 'PERCENT_OFF',
        scope: 'CATEGORY',
        targetId: cat['Toast Bar'],
        value: 10,
        minQty: 2,
        maxDiscount: rs(5),
      },
      {
        name: 'Make Your Own Combo',
        type: 'PERCENT_OFF',
        scope: 'BILL',
        // 5% on items picked separately (min Rs 150); repeat customers climb 5 -> 10 -> 15 -> 20%
        // when they come back 15+ hours after their last visit. Replaces all other offers.
        value: 5,
        minBillAmount: rs(150),
        excludeCombos: true,
        exclusive: true,
        loyaltyStep: 5,
        loyaltyMax: 20,
        loyaltyGapHours: 15,
        maxDiscount: rs(50),
      },
    ],
  });

  const setting = (key: string, value: string) =>
    prisma.setting.upsert({ where: { key }, update: {}, create: { key, value } });
  await setting('stallName', 'Chai Chokadi');

  console.log(
    `Seeded ${Object.keys(cat).length} categories, ${Object.keys(item).length} items, 5 combos, 3 offers.`,
  );
}

main()
  .catch((e: unknown) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
