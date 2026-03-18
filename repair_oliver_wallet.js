#!/usr/bin/env node

/**
 * Script to manually credit Oliver's wallet with the 50,000 COP payment
 * that was charged by Mercado Pago but never registered in the database
 * 
 * Operation details:
 * - Amount: 50,000 COP
 * - MP Operation ID: 150809365288
 * - Date: 17/mar 18:38
 * - Status: Approved
 */

require('dotenv').config();
const mongoose = require('mongoose');

async function creditOliverWallet() {
  let session;
  
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI, {
      dbName: process.env.MONGO_DB_NAME
    });
    
    session = await mongoose.startSession();
    session.startTransaction();
    
    const db = mongoose.connection.db;
    
    // Step 1: Find Oliver's wallet by the reference from the MP receipt
    console.log('🔍 Finding Oliver\'s wallet...');
    const wallet = await db.collection('wallets').findOne(
      { autoDebitAgreementId: { $ne: '' } },
      { session }
    );
    
    if (!wallet) {
      throw new Error('Could not find Oliver\'s wallet');
    }
    
    console.log('✓ Found wallet:', wallet._id);
    console.log('  Current balance:', wallet.balance);
    
    // Step 2: Find the parent (for createdBy)
    const parentStudentLink = await db.collection('parentstudentlinks').findOne(
      { studentId: wallet.studentId },
      { session }
    );
    
    if (!parentStudentLink) {
      throw new Error('Could not find parent student link');
    }
    
    console.log('✓ Found parent:', parentStudentLink.parentId);
    
    // Step 3: Create PaymentTransaction record
    console.log('💳 Creating PaymentTransaction record...');
    const paymentTransactionId = new mongoose.Types.ObjectId();
    await db.collection('paymenttransactions').insertOne(
      {
        _id: paymentTransactionId,
        schoolId: wallet.schoolId,
        studentId: wallet.studentId,
        parentId: parentStudentLink.parentId,
        walletId: wallet._id,
        provider: 'mercadopago',
        providerTransactionId: '150809365288',
        reference: `${wallet.schoolId}:${wallet.studentId}:${parentStudentLink.parentId}:${Date.now()}`,
        amount: 50000,
        status: 'approved',
        providerStatus: 'approved',
        method: 'auto_debit',
        callbackPayload: {
          type: 'payment',
          data: { id: '150809365288' },
          manualCredit: true,
          notes: 'Manual credit for preapproval activation charge'
        },
        notes: 'Recarga automática aprobada por Mercado Pago (150809365288) - Manual credit for preapproval activation',
        approvedAt: new Date(),
        createdAt: new Date('2026-03-17T23:38:00Z'),
        updatedAt: new Date(),
      },
      { session }
    );
    
    console.log('✓ PaymentTransaction created:', paymentTransactionId);
    
    // Step 4: Create WalletTransaction record
    console.log('📊 Creating WalletTransaction record...');
    const walletTransactionId = new mongoose.Types.ObjectId();
    await db.collection('wallettransactions').insertOne(
      {
        _id: walletTransactionId,
        schoolId: wallet.schoolId,
        studentId: wallet.studentId,
        walletId: wallet._id,
        type: 'recharge',
        amount: 50000,
        method: 'mercadopago',
        createdBy: parentStudentLink.parentId,
        notes: 'Recarga automática aprobada por Mercado Pago (150809365288) - Manual reconciliation',
        createdAt: new Date('2026-03-17T23:38:00Z'),
        updatedAt: new Date(),
      },
      { session }
    );
    
    console.log('✓ WalletTransaction created:', walletTransactionId);
    
    // Step 5: Update PaymentTransaction with walletTransactionId
    await db.collection('paymenttransactions').updateOne(
      { _id: paymentTransactionId },
      { $set: { walletTransactionId } },
      { session }
    );
    
    // Step 6: Update Wallet balance
    console.log('💰 Updating wallet balance...');
    const newBalance = wallet.balance + 50000;
    
    await db.collection('wallets').updateOne(
      { _id: wallet._id },
      {
        $set: {
          balance: newBalance,
          autoDebitLastChargeAt: new Date('2026-03-17T23:38:00Z'),
          autoDebitInProgress: false,
          autoDebitLockAt: null,
          autoDebitRetryAt: null,
          autoDebitRetryCount: 0,
        }
      },
      { session }
    );
    
    console.log('✓ Wallet updated:');
    console.log('  Old balance:', wallet.balance);
    console.log('  New balance:', newBalance);
    console.log('  Added: 50,000');
    
    // Commit transaction
    await session.commitTransaction();
    console.log('\n✅ Successfully credited Oliver\'s wallet with 50,000 COP');
    console.log('\n📋 Summary:');
    console.log('- PaymentTransaction ID:', paymentTransactionId);
    console.log('- WalletTransaction ID:', walletTransactionId);
    console.log('- New balance:', newBalance);
    
  } catch (error) {
    if (session && session.inTransaction()) {
      await session.abortTransaction();
    }
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    if (session) {
      session.endSession();
    }
    await mongoose.disconnect();
  }
}

creditOliverWallet();
