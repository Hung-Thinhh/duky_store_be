import 'dotenv/config';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import { Pool } from 'pg';

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }

  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@dukystore.local';
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@123456';
  const fullName = process.env.SEED_ADMIN_FULL_NAME ?? 'Duky Super Admin';
  const passwordHash = await bcrypt.hash(password, 12);

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    await client.query('begin');

    const user = await client.query<{
      id: string;
      email: string;
      fullName: string;
      status: string;
    }>(
      `
        insert into "users" (
          "id",
          "email",
          "passwordHash",
          "fullName",
          "status",
          "createdAt",
          "updatedAt"
        )
        values ($1, $2, $3, $4, 'ACTIVE', now(), now())
        on conflict ("email")
        do update set
          "passwordHash" = excluded."passwordHash",
          "fullName" = excluded."fullName",
          "status" = 'ACTIVE',
          "deletedAt" = null,
          "updatedAt" = now()
        returning "id", "email", "fullName", "status"
      `,
      [`admin_${randomUUID()}`, email, passwordHash, fullName],
    );

    const role = await client.query<{ id: string }>(
      'select "id" from "roles" where "name" = $1',
      ['SUPER_ADMIN'],
    );

    if (!role.rowCount) {
      throw new Error('SUPER_ADMIN role not found. Run the base seed first.');
    }

    await client.query(
      `
        insert into "user_roles" ("userId", "roleId")
        values ($1, $2)
        on conflict ("userId", "roleId") do nothing
      `,
      [user.rows[0].id, role.rows[0].id],
    );

    await client.query('commit');
    console.log(`Admin ready: ${user.rows[0].email} (${user.rows[0].status})`);
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
