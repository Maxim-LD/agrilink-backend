/**
 * AgriLink Demo Seed Script
 * Run: npm run seed
 *
 * Creates all demo accounts needed for the hackathon pitch.
 * Safe to run multiple times — uses findOneAndUpdate (upsert).
 *
 * BUYER COVERAGE:
 *   Factories  (agri_waste):   cassava_peel | corn_chaff | rice_husks | groundnut_shells
 *   Restaurants (fresh_produce): tomatoes | pepper | leafy_greens | fresh_cassava
 *
 * Every buyer has an anchor StandingOrder so any matching Log submission
 * immediately creates a Match without needing the scoring algorithm.
 */
import 'dotenv/config';
import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import { connectDB } from './config/db';
import { User } from './models/User';
import { Aggregator } from './models/Aggregator';
import { Buyer } from './models/Buyer';
import { Dealer } from './models/Dealer';
import { StandingOrder } from './models/StandingOrder';
import { UserRole, UserStatus, BuyerType, Pipeline } from './types';

const BCRYPT_ROUNDS = 10;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const upsertUser = async (
  phone:     string,
  fullName:  string,
  role:      UserRole,
  password:  string,
  buyerType?: BuyerType,
) => {
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  return User.findOneAndUpdate(
    { phone },
    { phone, fullName, role, buyerType, status: UserStatus.ACTIVE, passwordHash },
    { upsert: true, returnDocument: 'after' },
  );
};

const upsertBuyer = async (
  userId:       mongoose.Types.ObjectId,
  buyerType:    BuyerType,
  companyName:  string,
  address:      string,
  lng:          number,
  lat:          number,
  contactName:  string,
  contactPhone: string,
  logisticsMode?: 'mode_a' | 'mode_b',
) =>
  Buyer.findOneAndUpdate(
    { userId },
    {
      userId, buyerType, companyName, address,
      location: { type: 'Point', coordinates: [lng, lat] },
      logisticsMode,
      contactName, contactPhone,
      status: UserStatus.ACTIVE,
    },
    { upsert: true, returnDocument: 'after' },
  );

const upsertOrder = async (
  buyerId:      mongoose.Types.ObjectId,
  pipeline:     Pipeline,
  category:     string,
  minQty:       number,
  price:        number,
) =>
  StandingOrder.findOneAndUpdate(
    { buyerId, pipeline, category },
    { buyerId, pipeline, category, minQuantityKg: minQty, pricePerKg: price, isActive: true, isAnchor: true },
    { upsert: true, returnDocument: 'after' },
  );

// ─── Main ─────────────────────────────────────────────────────────────────────

const seed = async () => {
  await connectDB();
  console.log('\n🌱 Seeding AgriLink demo data...\n');

  // ── 1. Admin ──────────────────────────────────────────────────────────────
  await upsertUser('+2340000000001', 'AgriLink Admin', UserRole.ADMIN, 'admin123');
  console.log('✅ Admin          +2340000000001  / admin123');

  // ── 2. Aggregator ─────────────────────────────────────────────────────────
  const aggUser = await upsertUser('+2340000000002', 'Adewale Aggregator', UserRole.AGGREGATOR, 'agg123');
  await Aggregator.findOneAndUpdate(
    { userId: aggUser._id },
    {
      userId:               aggUser._id,
      zone:                 'Ibadan North',
      governmentIdType:     'nin',
      governmentIdNumber:   '12345678901',
      governmentIdPhotoUrl: 'https://placeholder.pics/svg/300',
      guarantorPhone:       '+2340000000099',
      disputesCount:        0,
    },
    { upsert: true, returnDocument: 'after' },
  );
  console.log('✅ Aggregator     +2340000000002  / agg123');

  // ── 3. Dealer ─────────────────────────────────────────────────────────────
  const dealerUser = await upsertUser('+2340000000010', 'Kunle Agro Dealer', UserRole.DEALER, 'dealer123');
  await Dealer.findOneAndUpdate(
    { userId: dealerUser._id },
    { userId: dealerUser._id, shopName: 'Kunle Agro Supplies', dealerCode: 'DEALER007', zone: 'Ibadan North', status: UserStatus.ACTIVE },
    { upsert: true, returnDocument: 'after' },
  );
  console.log('✅ Dealer         +2340000000010  / dealer123  (code: DEALER007)');

  console.log('\n── Factories (agri_waste pipeline) ─────────────────────────────────\n');

  // ── 4. Factory: Dangote Starch — cassava_peel ─────────────────────────────
  const f1User  = await upsertUser('+2340000000003', 'Dangote Starch Factory', UserRole.BUYER, 'factory123', BuyerType.FACTORY);
  const f1Buyer = await upsertBuyer(f1User._id, BuyerType.FACTORY, 'Dangote Starch Factory', 'Km 10 Lagos-Ibadan Expressway, Ibadan', 3.9470, 7.3775, 'Emeka Okonkwo', '+2340000000003');
  await upsertOrder(f1Buyer._id, Pipeline.AGRI_WASTE, 'cassava_peel', 50, 30);
  console.log('✅ Dangote Starch  +2340000000003  / factory123  → cassava_peel @ ₦30/kg (min 50kg)');

  // ── 5. Factory: NASCO Feeds — corn_chaff ──────────────────────────────────
  const f2User  = await upsertUser('+2340000000004', 'NASCO Animal Feeds', UserRole.BUYER, 'nasco123', BuyerType.FACTORY);
  const f2Buyer = await upsertBuyer(f2User._id, BuyerType.FACTORY, 'NASCO Animal Feeds', 'Ojoo Industrial Estate, Ibadan', 3.9105, 7.4290, 'Ibrahim Musa', '+2340000000004');
  await upsertOrder(f2Buyer._id, Pipeline.AGRI_WASTE, 'corn_chaff', 80, 25);
  console.log('✅ NASCO Feeds     +2340000000004  / nasco123    → corn_chaff @ ₦25/kg (min 80kg)');

  // ── 6. Factory: Grand Cereals — rice_husks ────────────────────────────────
  const f3User  = await upsertUser('+2340000000005', 'Grand Cereals Ltd', UserRole.BUYER, 'grand123', BuyerType.FACTORY);
  const f3Buyer = await upsertBuyer(f3User._id, BuyerType.FACTORY, 'Grand Cereals Ltd', 'Agodi Industrial Area, Ibadan', 3.9000, 7.3920, 'Ngozi Eze', '+2340000000005');
  await upsertOrder(f3Buyer._id, Pipeline.AGRI_WASTE, 'rice_husks', 100, 20);
  console.log('✅ Grand Cereals   +2340000000005  / grand123    → rice_husks @ ₦20/kg (min 100kg)');

  // ── 7. Factory: Chi Farms — groundnut_shells ──────────────────────────────
  const f4User  = await upsertUser('+2340000000006', 'Chi Farms Nigeria', UserRole.BUYER, 'chi123', BuyerType.FACTORY);
  const f4Buyer = await upsertBuyer(f4User._id, BuyerType.FACTORY, 'Chi Farms Nigeria', 'Abeokuta Road, Ibadan', 3.8510, 7.3470, 'Tunde Adeleke', '+2340000000006');
  await upsertOrder(f4Buyer._id, Pipeline.AGRI_WASTE, 'groundnut_shells', 40, 35);
  console.log('✅ Chi Farms       +2340000000006  / chi123      → groundnut_shells @ ₦35/kg (min 40kg)');

  console.log('\n── Restaurants (fresh_produce pipeline) ────────────────────────────\n');

  // ── 8. Restaurant: Chicken Republic — tomatoes ────────────────────────────
  const r1User  = await upsertUser('+2340000000007', 'Chicken Republic Ibadan', UserRole.BUYER, 'rest123', BuyerType.RESTAURANT);
  const r1Buyer = await upsertBuyer(r1User._id, BuyerType.RESTAURANT, 'Chicken Republic Ibadan', '12 Ring Road, Ibadan', 3.8965, 7.3874, 'Blessing Adeyemi', '+2340000000007', 'mode_b');
  await upsertOrder(r1Buyer._id, Pipeline.FRESH_PRODUCE, 'tomatoes', 20, 800);
  console.log('✅ Chicken Republic +2340000000007  / rest123     → tomatoes @ ₦800/kg (min 20kg)');

  // ── 9. Restaurant: Mr Biggs — pepper ─────────────────────────────────────
  const r2User  = await upsertUser('+2340000000008', 'Mr Biggs Ibadan', UserRole.BUYER, 'biggs123', BuyerType.RESTAURANT);
  const r2Buyer = await upsertBuyer(r2User._id, BuyerType.RESTAURANT, 'Mr Biggs Ibadan', '45 Bodija Market Road, Ibadan', 3.9020, 7.4031, 'Yetunde Bakare', '+2340000000008', 'mode_a');
  await upsertOrder(r2Buyer._id, Pipeline.FRESH_PRODUCE, 'pepper', 10, 1200);
  console.log('✅ Mr Biggs        +2340000000008  / biggs123    → pepper @ ₦1,200/kg (min 10kg)');

  // ── 10. Restaurant: Tantalizers — leafy_greens ───────────────────────────
  const r3User  = await upsertUser('+2340000000009', 'Tantalizers Ibadan', UserRole.BUYER, 'tanta123', BuyerType.RESTAURANT);
  const r3Buyer = await upsertBuyer(r3User._id, BuyerType.RESTAURANT, 'Tantalizers Ibadan', '23 Iwo Road, Ibadan', 3.8820, 7.3975, 'Kemi Oladele', '+2340000000009', 'mode_b');
  await upsertOrder(r3Buyer._id, Pipeline.FRESH_PRODUCE, 'leafy_greens', 15, 600);
  console.log('✅ Tantalizers     +2340000000009  / tanta123    → leafy_greens @ ₦600/kg (min 15kg)');

  // ── 11. Restaurant: Yellow Chilli — fresh_cassava ────────────────────────
  const r4User  = await upsertUser('+2340000000011', 'Yellow Chilli Ibadan', UserRole.BUYER, 'yellow123', BuyerType.RESTAURANT);
  const r4Buyer = await upsertBuyer(r4User._id, BuyerType.RESTAURANT, 'Yellow Chilli Ibadan', '8 Dugbe Market Road, Ibadan', 3.8740, 7.3820, 'Sola Babatunde', '+2340000000011', 'mode_a');
  await upsertOrder(r4Buyer._id, Pipeline.FRESH_PRODUCE, 'fresh_cassava', 30, 200);
  console.log('✅ Yellow Chilli   +2340000000011  / yellow123   → fresh_cassava @ ₦200/kg (min 30kg)');

  // ── Summary ───────────────────────────────────────────────────────────────

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 Login: POST /api/v1/auth/login  { phone, password }');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\n🏭 Instant-match categories (agri_waste):');
  console.log('   cassava_peel      → Dangote Starch    ₦30/kg   (min 50kg)');
  console.log('   corn_chaff        → NASCO Feeds        ₦25/kg   (min 80kg)');
  console.log('   rice_husks        → Grand Cereals      ₦20/kg   (min 100kg)');
  console.log('   groundnut_shells  → Chi Farms          ₦35/kg   (min 40kg)');
  console.log('\n🍅 Instant-match categories (fresh_produce):');
  console.log('   tomatoes          → Chicken Republic   ₦800/kg  (min 20kg)');
  console.log('   pepper            → Mr Biggs           ₦1,200/kg (min 10kg)');
  console.log('   leafy_greens      → Tantalizers        ₦600/kg  (min 15kg)');
  console.log('   fresh_cassava     → Yellow Chilli      ₦200/kg  (min 30kg)');
  console.log('\n📌 Aggregator phone for log submissions: +2340000000002 (agg123)');
  console.log('📌 Farmer auto-created on first log — use any phone e.g. +2348012345678');
  console.log('📌 Dealer code for SMS redemption: DEALER007');
  console.log('\n✅ Seed complete!\n');

  await mongoose.disconnect();
};

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
