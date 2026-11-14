require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const User = require('../src/models/User');
const Category = require('../src/models/Category');
const Product = require('../src/models/Product');
const StockMovement = require('../src/models/StockMovement');
const LowStockAlert = require('../src/models/LowStockAlert');
const AuditLog = require('../src/models/AuditLog');
const { randomUUID } = require('crypto');

const starterProducts = [
  { sku: 'SW-OATS-001', name: 'Rolled Oats 1 kg', category: 'Pantry', description: 'Wholegrain rolled oats', purchasePrice: 125, sellingPrice: 199, currentStock: 24, minimumStockLevel: 5, unit: 'bag', supplierName: 'Harvest Foods' },
  { sku: 'SW-COFFEE-001', name: 'Arabica Coffee 250 g', category: 'Beverages', description: 'Medium-roast ground Arabica coffee', purchasePrice: 220, sellingPrice: 349, currentStock: 18, minimumStockLevel: 5, unit: 'bag', supplierName: 'Roastery Supply' },
  { sku: 'SW-TEA-001', name: 'Green Tea 20 Bags', category: 'Beverages', description: 'Green tea bags in a paper carton', purchasePrice: 110, sellingPrice: 189, currentStock: 4, minimumStockLevel: 5, unit: 'box', supplierName: 'Leaf & Co.' },
  { sku: 'SW-OLIVE-001', name: 'Extra Virgin Olive Oil 500 ml', category: 'Pantry', description: 'Cold-pressed olive oil', purchasePrice: 420, sellingPrice: 699, currentStock: 12, minimumStockLevel: 4, unit: 'bottle', supplierName: 'Mediterranean Goods' },
  { sku: 'SW-PASTA-001', name: 'Wholegrain Pasta 500 g', category: 'Pantry', description: 'Whole wheat penne pasta', purchasePrice: 65, sellingPrice: 119, currentStock: 30, minimumStockLevel: 8, unit: 'pack', supplierName: 'Harvest Foods' },
  { sku: 'SW-ALMOND-001', name: 'Unsweetened Almond Drink 1 L', category: 'Dairy Alternatives', description: 'Shelf-stable unsweetened almond drink', purchasePrice: 95, sellingPrice: 159, currentStock: 16, minimumStockLevel: 5, unit: 'carton', supplierName: 'Fresh Path' },
  { sku: 'SW-CHOC-001', name: 'Dark Chocolate 70% 100 g', category: 'Snacks', description: '70% cocoa dark chocolate bar', purchasePrice: 80, sellingPrice: 149, currentStock: 22, minimumStockLevel: 6, unit: 'bar', supplierName: 'Cocoa House' },
  { sku: 'SW-HONEY-001', name: 'Wildflower Honey 500 g', category: 'Pantry', description: 'Wildflower honey in a glass jar', purchasePrice: 250, sellingPrice: 399, currentStock: 10, minimumStockLevel: 3, unit: 'jar', supplierName: 'Meadow Farms' },
];

async function seedStarterProducts(email) {
  if (!email) throw new Error('Provide the registered admin email as an argument.');
  await connectDB();
  const user = await User.findOne({ email: email.toLowerCase(), role: 'admin', isActive: true });
  if (!user) throw new Error('No active admin account matches that email.');

  const session = await mongoose.startSession();
  let added = 0;
  let skipped = 0;
  try {
    await session.withTransaction(async () => {
      for (const data of starterProducts) {
        const existing = await Product.findOne({ businessId: user.businessId, sku: data.sku }).session(session);
        if (existing) {
          skipped += 1;
          continue;
        }

        const category = await Category.findOneAndUpdate(
          { businessId: user.businessId, name: data.category },
          { $setOnInsert: { description: `Starter products in ${data.category.toLowerCase()}.` } },
          { upsert: true, new: true, setDefaultsOnInsert: true, session },
        );

        const [product] = await Product.create([{
          ...data,
          productId: `PRD-${data.sku}`,
          categoryId: category._id,
          businessId: user.businessId,
        }], { session });

        const transactionId = randomUUID();
        await StockMovement.create([{
          transactionId,
          businessId: user.businessId,
          productId: product._id,
          productName: product.name,
          type: 'IN',
          operationType: 'receipt',
          quantity: product.currentStock,
          staffId: user._id,
          staffName: user.name,
          reference: 'starter-catalog',
          notes: 'Opening stock for StockWise starter products.',
          idempotencyKey: `starter-opening-${product.sku}`,
        }], { session });

        if (product.currentStock <= product.minimumStockLevel) {
          await LowStockAlert.findOneAndUpdate(
            { businessId: user.businessId, productId: product._id, resolvedAt: null },
            {
              $set: { productName: product.name, currentStock: product.currentStock, reorderLevel: product.minimumStockLevel },
              $setOnInsert: { businessId: user.businessId, productId: product._id },
            },
            { upsert: true, new: true, session },
          );
        }

        await AuditLog.create([{
          businessId: user.businessId,
          userId: user._id,
          action: 'product.starter_seeded',
          entityType: 'Product',
          entityId: product._id.toString(),
          details: { sku: product.sku, openingStock: product.currentStock, transactionId },
        }], { session });
        added += 1;
      }
    });
  } finally {
    await session.endSession();
  }
  console.log(`Starter catalog complete for ${user.name}: ${added} products added, ${skipped} already present.`);
}

seedStarterProducts(process.argv[2])
  .catch((error) => {
    console.error('Starter product setup failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
