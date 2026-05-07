// c:/Users/Asus/smart-fiber-backendd/src/database/migrations/1774915200000-InitialSchema.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1774915200000 implements MigrationInterface {
  name = 'InitialSchema1774915200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

    await queryRunner.query(
      `CREATE TYPE "public"."users_role_enum" AS ENUM('admin', 'technician')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."reclamations_status_enum" AS ENUM('open', 'in_progress', 'resolved')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."tickets_status_enum" AS ENUM('open', 'assigned', 'closed')`,
    );

    await queryRunner.query(
      `CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "email" character varying NOT NULL,
        "password" character varying NOT NULL,
        "role" "public"."users_role_enum" NOT NULL DEFAULT 'technician',
        "fullName" character varying,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_users_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_users_email" UNIQUE ("email")
      )`,
    );

    await queryRunner.query(
      `CREATE TABLE "zones" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying NOT NULL,
        "description" character varying,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_zones_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_zones_name" UNIQUE ("name")
      )`,
    );

    await queryRunner.query(
      `CREATE TABLE "polygons" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying NOT NULL,
        "zoneId" uuid NOT NULL,
        "boundary" geometry(Polygon,4326) NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_polygons_id" PRIMARY KEY ("id")
      )`,
    );

    await queryRunner.query(
      `CREATE TABLE "clients" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "contractId" character varying NOT NULL,
        "location" geometry(Point,4326) NOT NULL,
        "polygonId" uuid NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_clients_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_clients_contractId" UNIQUE ("contractId")
      )`,
    );

    await queryRunner.query(
      `CREATE TABLE "reclamations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "crmReference" character varying NOT NULL,
        "description" text NOT NULL,
        "status" "public"."reclamations_status_enum" NOT NULL DEFAULT 'open',
        "clientId" uuid NOT NULL,
        "polygonId" uuid NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_reclamations_id" PRIMARY KEY ("id")
      )`,
    );

    await queryRunner.query(
      `CREATE TABLE "tickets" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "title" character varying NOT NULL,
        "description" text NOT NULL,
        "status" "public"."tickets_status_enum" NOT NULL DEFAULT 'open',
        "sourceReclamationId" uuid,
        "polygonId" uuid,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_tickets_id" PRIMARY KEY ("id")
      )`,
    );

    await queryRunner.query(
      `CREATE TABLE "zone_technicians" (
        "zonesId" uuid NOT NULL,
        "usersId" uuid NOT NULL,
        CONSTRAINT "PK_zone_technicians" PRIMARY KEY ("zonesId", "usersId")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_zone_technicians_zonesId" ON "zone_technicians" ("zonesId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_zone_technicians_usersId" ON "zone_technicians" ("usersId")`,
    );

    await queryRunner.query(
      `ALTER TABLE "polygons"
       ADD CONSTRAINT "FK_polygons_zone"
       FOREIGN KEY ("zoneId") REFERENCES "zones"("id")
       ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `ALTER TABLE "clients"
       ADD CONSTRAINT "FK_clients_polygon"
       FOREIGN KEY ("polygonId") REFERENCES "polygons"("id")
       ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `ALTER TABLE "reclamations"
       ADD CONSTRAINT "FK_reclamations_client"
       FOREIGN KEY ("clientId") REFERENCES "clients"("id")
       ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `ALTER TABLE "tickets"
       ADD CONSTRAINT "FK_tickets_sourceReclamation"
       FOREIGN KEY ("sourceReclamationId") REFERENCES "reclamations"("id")
       ON DELETE SET NULL ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `ALTER TABLE "zone_technicians"
       ADD CONSTRAINT "FK_zone_technicians_zone"
       FOREIGN KEY ("zonesId") REFERENCES "zones"("id")
       ON DELETE CASCADE ON UPDATE CASCADE`,
    );

    await queryRunner.query(
      `ALTER TABLE "zone_technicians"
       ADD CONSTRAINT "FK_zone_technicians_user"
       FOREIGN KEY ("usersId") REFERENCES "users"("id")
       ON DELETE CASCADE ON UPDATE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "zone_technicians" DROP CONSTRAINT "FK_zone_technicians_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "zone_technicians" DROP CONSTRAINT "FK_zone_technicians_zone"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tickets" DROP CONSTRAINT "FK_tickets_sourceReclamation"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reclamations" DROP CONSTRAINT "FK_reclamations_client"`,
    );
    await queryRunner.query(
      `ALTER TABLE "clients" DROP CONSTRAINT "FK_clients_polygon"`,
    );
    await queryRunner.query(
      `ALTER TABLE "polygons" DROP CONSTRAINT "FK_polygons_zone"`,
    );

    await queryRunner.query(`DROP INDEX "public"."IDX_zone_technicians_usersId"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_zone_technicians_zonesId"`);
    await queryRunner.query(`DROP TABLE "zone_technicians"`);

    await queryRunner.query(`DROP TABLE "tickets"`);
    await queryRunner.query(`DROP TABLE "reclamations"`);
    await queryRunner.query(`DROP TABLE "clients"`);
    await queryRunner.query(`DROP TABLE "polygons"`);
    await queryRunner.query(`DROP TABLE "zones"`);
    await queryRunner.query(`DROP TABLE "users"`);

    await queryRunner.query(`DROP TYPE "public"."tickets_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."reclamations_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
  }
}
