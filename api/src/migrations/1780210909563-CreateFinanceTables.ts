import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateFinanceTables1780210909563 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE IF NOT EXISTS finance_transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        owner VARCHAR NOT NULL,
        source VARCHAR(20) NOT NULL,
        "sourceRef" VARCHAR,
        leverancier VARCHAR NOT NULL,
        bedrag DECIMAL(10,2) NOT NULL,
        datum DATE NOT NULL,
        categorie VARCHAR(30) NOT NULL,
        type VARCHAR(20) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        notes VARCHAR,
        "createdAt" TIMESTAMP DEFAULT now()
      )
    `);
    await qr.query(`
      CREATE TABLE IF NOT EXISTS finance_subscriptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        owner VARCHAR NOT NULL,
        "transactionId" VARCHAR,
        naam VARCHAR NOT NULL,
        bedrag DECIMAL(10,2) NOT NULL,
        interval VARCHAR(20) NOT NULL,
        "volgendeBetaaldatum" DATE NOT NULL,
        "opzegtermijnDagen" INT NOT NULL DEFAULT 30,
        actief BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP DEFAULT now()
      )
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query('DROP TABLE IF EXISTS finance_subscriptions');
    await qr.query('DROP TABLE IF EXISTS finance_transactions');
  }
}
