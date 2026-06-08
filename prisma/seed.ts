import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({
  adapter,
});

const roleNames = [
  'SUPER_ADMIN',
  'ADMIN',
  'STAFF',
  'CONTENT_EDITOR',
  'ORDER_MANAGER',
] as const;

const subjects = [
  'dashboard',
  'users',
  'roles',
  'permissions',
  'products',
  'categories',
  'tags',
  'variants',
  'inventory',
  'media',
  'orders',
  'payments',
  'shipping',
  'customers',
  'coupons',
  'reviews',
  'wishlist',
  'blog',
  'pages',
  'homepage',
  'contacts',
  'seo',
  'redirects',
  'migration',
  'notifications',
  'analytics',
  'settings',
] as const;

const actions = [
  'read',
  'create',
  'update',
  'delete',
  'manage',
  'export',
] as const;

const rolePermissionRules: Record<(typeof roleNames)[number], string[]> = {
  SUPER_ADMIN: ['*'],
  ADMIN: ['*'],
  STAFF: [
    'dashboard.read',
    'products.read',
    'categories.read',
    'tags.read',
    'inventory.read',
    'media.read',
    'orders.read',
    'orders.update',
    'orders.export',
    'payments.read',
    'shipping.read',
    'shipping.update',
    'customers.read',
    'contacts.read',
    'contacts.update',
  ],
  CONTENT_EDITOR: [
    'dashboard.read',
    'products.read',
    'categories.read',
    'tags.read',
    'media.manage',
    'blog.manage',
    'pages.manage',
    'homepage.manage',
    'seo.read',
    'seo.update',
    'redirects.read',
  ],
  ORDER_MANAGER: [
    'dashboard.read',
    'products.read',
    'products.update',
    'media.manage',
    'inventory.read',
    'inventory.update',
    'orders.manage',
    'orders.export',
    'payments.manage',
    'shipping.manage',
    'customers.read',
    'customers.update',
    'contacts.read',
  ],
};

const settings = [
  {
    key: 'site.name',
    group: 'site',
    value: 'Duky Store',
    valueType: 'STRING',
    isPublic: true,
    description: 'Tên website',
  },
  {
    key: 'site.currency',
    group: 'site',
    value: 'VND',
    valueType: 'STRING',
    isPublic: true,
    description: 'Đơn vị tiền tệ',
  },
  {
    key: 'site.logo',
    group: 'site',
    value: '',
    valueType: 'IMAGE',
    isPublic: true,
    description: 'Logo website',
  },
  {
    key: 'site.favicon',
    group: 'site',
    value: '',
    valueType: 'IMAGE',
    isPublic: true,
    description: 'Favicon website',
  },
  {
    key: 'contact.hotline',
    group: 'contact',
    value: '',
    valueType: 'STRING',
    isPublic: true,
    description: 'Hotline',
  },
  {
    key: 'contact.email',
    group: 'contact',
    value: '',
    valueType: 'STRING',
    isPublic: true,
    description: 'Email liên hệ',
  },
  {
    key: 'social.zalo',
    group: 'social',
    value: '',
    valueType: 'STRING',
    isPublic: true,
    description: 'Link Zalo',
  },
  {
    key: 'social.facebook',
    group: 'social',
    value: '',
    valueType: 'STRING',
    isPublic: true,
    description: 'Link Facebook',
  },
  {
    key: 'social.tiktok',
    group: 'social',
    value: '',
    valueType: 'STRING',
    isPublic: true,
    description: 'Link TikTok',
  },
  {
    key: 'social.shopee',
    group: 'social',
    value: '',
    valueType: 'STRING',
    isPublic: true,
    description: 'Link Shopee',
  },
  {
    key: 'shipping.default_fee',
    group: 'shipping',
    value: 30000,
    valueType: 'NUMBER',
    isPublic: true,
    description: 'Phí ship mặc định',
  },
  {
    key: 'shipping.free_threshold',
    group: 'shipping',
    value: 1000000,
    valueType: 'NUMBER',
    isPublic: true,
    description: 'Ngưỡng freeship',
  },
  {
    key: 'system.maintenance_mode',
    group: 'system',
    value: false,
    valueType: 'BOOLEAN',
    isPublic: true,
    description: 'Bật/tắt bảo trì website',
  },
  {
    key: 'storage.provider',
    group: 'integration',
    value: 'cloudinary',
    valueType: 'STRING',
    isPublic: false,
    description: 'Nhà cung cấp lưu trữ media',
  },
  {
    key: 'mail.from',
    group: 'notification',
    value: 'Duky Store <no-reply@dukystore.local>',
    valueType: 'STRING',
    isPublic: false,
    description: 'Email gửi mặc định',
  },
  {
    key: 'seo.default_title',
    group: 'seo',
    value: 'Duky Store',
    valueType: 'STRING',
    isPublic: true,
    description: 'Meta title mặc định',
  },
  {
    key: 'seo.default_description',
    group: 'seo',
    value: 'Duky Store - thời trang và giày boot.',
    valueType: 'STRING',
    isPublic: true,
    description: 'Meta description mặc định',
  },
  {
    key: 'search.synonyms',
    group: 'search',
    value: {
      'giày': ['boot', 'bốt', 'giày boot'],
      'boot': ['giày', 'giày boot', 'bốt'],
      'sandal': ['dép', 'dép sandal'],
      'dép': ['sandal', 'dép sandal'],
      'túi': ['bag', 'ví'],
      'bag': ['túi', 'ví'],
      'ví': ['túi', 'bag'],
      'áo khoác': ['jacket', 'áo jacket'],
      'jacket': ['áo khoác', 'áo jacket'],
      'đi chơi': ['dạo phố', 'đi dạo'],
      'dạo phố': ['đi chơi', 'đi dạo'],
      'công sở': ['đi làm', 'văn phòng'],
      'đi làm': ['công sở', 'văn phòng'],
      'tết': ['xuân', 'ngày tết', 'năm mới'],
      'xuân': ['tết', 'ngày tết', 'năm mới'],
      'da': ['leather', 'da thật'],
      'leather': ['da', 'da thật'],
    },
    valueType: 'JSON',
    isPublic: false,
    description: 'Từ đồng nghĩa cho tìm kiếm thông minh',
  },
] as const;

const notificationTemplates = [
  {
    key: 'order.confirmation',
    channel: 'EMAIL',
    subject: 'Duky Store đã nhận đơn hàng {{orderCode}}',
    body: 'Xin chào {{customerName}}, đơn hàng {{orderCode}} của bạn đã được ghi nhận.',
    variables: ['customerName', 'orderCode'],
  },
  {
    key: 'order.status_update',
    channel: 'EMAIL',
    subject: 'Cập nhật đơn hàng {{orderCode}}',
    body: 'Đơn hàng {{orderCode}} hiện đang ở trạng thái {{orderStatus}}.',
    variables: ['orderCode', 'orderStatus'],
  },
  {
    key: 'contact.admin_notification',
    channel: 'EMAIL',
    subject: 'Liên hệ mới từ {{fullName}}',
    body: '{{fullName}} vừa gửi liên hệ mới: {{message}}',
    variables: ['fullName', 'message'],
  },
] as const;

function permissionKey(action: string, subject: string) {
  return `${subject}.${action}`;
}

function canAssign(rule: string[], action: string, subject: string) {
  return (
    rule.includes('*') ||
    rule.includes(permissionKey(action, subject)) ||
    rule.includes(`${subject}.manage`)
  );
}

async function seedRolesAndPermissions() {
  const roles = new Map<string, string>();
  const permissions = new Map<string, string>();

  for (const name of roleNames) {
    const role = await prisma.role.upsert({
      where: { name },
      update: {
        description: `${name} role`,
        isSystem: true,
      },
      create: {
        name,
        description: `${name} role`,
        isSystem: true,
      },
    });
    roles.set(name, role.id);
  }

  for (const subject of subjects) {
    for (const action of actions) {
      const permission = await prisma.permission.upsert({
        where: {
          action_subject: {
            action,
            subject,
          },
        },
        update: {
          description: `${action} ${subject}`,
        },
        create: {
          action,
          subject,
          description: `${action} ${subject}`,
        },
      });
      permissions.set(permissionKey(action, subject), permission.id);
    }
  }

  for (const roleName of roleNames) {
    const roleId = roles.get(roleName);
    if (!roleId) {
      continue;
    }

    const rule = rolePermissionRules[roleName];
    for (const subject of subjects) {
      for (const action of actions) {
        if (!canAssign(rule, action, subject)) {
          continue;
        }

        const permissionId = permissions.get(permissionKey(action, subject));
        if (!permissionId) {
          continue;
        }

        await prisma.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId,
              permissionId,
            },
          },
          update: {},
          create: {
            roleId,
            permissionId,
          },
        });
      }
    }
  }

  return roles;
}

async function seedSuperAdmin(roles: Map<string, string>) {
  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@dukystore.local';
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@123456';
  const fullName = process.env.SEED_ADMIN_FULL_NAME ?? 'Duky Super Admin';
  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      fullName,
      status: 'ACTIVE',
    },
    create: {
      email,
      fullName,
      passwordHash,
      status: 'ACTIVE',
    },
  });

  const superAdminRoleId = roles.get('SUPER_ADMIN');
  if (superAdminRoleId) {
    await prisma.userRole.upsert({
      where: {
        userId_roleId: {
          userId: user.id,
          roleId: superAdminRoleId,
        },
      },
      update: {},
      create: {
        userId: user.id,
        roleId: superAdminRoleId,
      },
    });
  }

  return user;
}

async function seedSettings() {
  for (const setting of settings) {
    await prisma.setting.upsert({
      where: { key: setting.key },
      update: {
        group: setting.group,
        value: setting.value,
        valueType: setting.valueType,
        isPublic: setting.isPublic,
        description: setting.description,
      },
      create: {
        key: setting.key,
        group: setting.group,
        value: setting.value,
        valueType: setting.valueType,
        isPublic: setting.isPublic,
        description: setting.description,
      },
    });
  }
}

async function seedPaymentAndShipping() {
  await prisma.bankAccount.upsert({
    where: { id: 'seed_default_bank_account' },
    update: {
      bankName: 'Demo Bank',
      accountName: 'DUKY STORE',
      accountNumber: '0000000000',
      isDefault: true,
      isActive: true,
    },
    create: {
      id: 'seed_default_bank_account',
      bankName: 'Demo Bank',
      accountName: 'DUKY STORE',
      accountNumber: '0000000000',
      isDefault: true,
      isActive: true,
    },
  });

  await prisma.shippingZone.upsert({
    where: { id: 'seed_vietnam_shipping_zone' },
    update: {
      name: 'Vietnam',
      provinces: [],
      isActive: true,
    },
    create: {
      id: 'seed_vietnam_shipping_zone',
      name: 'Vietnam',
      provinces: [],
      isActive: true,
    },
  });

  await prisma.shippingRate.upsert({
    where: { id: 'seed_default_shipping_rate' },
    update: {
      zoneId: 'seed_vietnam_shipping_zone',
      name: 'Phí ship mặc định',
      fee: 30000,
      freeShippingThreshold: 1000000,
      isDefault: true,
      isActive: true,
    },
    create: {
      id: 'seed_default_shipping_rate',
      zoneId: 'seed_vietnam_shipping_zone',
      name: 'Phí ship mặc định',
      fee: 30000,
      freeShippingThreshold: 1000000,
      isDefault: true,
      isActive: true,
    },
  });
}

async function seedSeoAndNotifications() {
  await prisma.robotsRule.upsert({
    where: { id: 'seed_robots_allow_all' },
    update: {
      userAgent: '*',
      rule: 'Allow',
      path: '/',
      isActive: true,
    },
    create: {
      id: 'seed_robots_allow_all',
      userAgent: '*',
      rule: 'Allow',
      path: '/',
      isActive: true,
    },
  });

  await prisma.sitemapEntry.upsert({
    where: { url: '/' },
    update: {
      entityType: 'HOMEPAGE',
      priority: 1,
      changefreq: 'daily',
      isActive: true,
    },
    create: {
      url: '/',
      entityType: 'HOMEPAGE',
      priority: 1,
      changefreq: 'daily',
      isActive: true,
    },
  });

  for (const template of notificationTemplates) {
    await prisma.notificationTemplate.upsert({
      where: { key: template.key },
      update: {
        channel: template.channel,
        subject: template.subject,
        body: template.body,
        variables: template.variables,
        isActive: true,
      },
      create: {
        key: template.key,
        channel: template.channel,
        subject: template.subject,
        body: template.body,
        variables: template.variables,
        isActive: true,
      },
    });
  }
}

async function main() {
  const roles = await seedRolesAndPermissions();
  const superAdmin = await seedSuperAdmin(roles);
  await seedSettings();
  await seedPaymentAndShipping();
  await seedSeoAndNotifications();

  console.log('Seed completed');
  console.log(`Super admin: ${superAdmin.email}`);
  console.log(
    `Default password: ${process.env.SEED_ADMIN_PASSWORD ?? 'Admin@123456'}`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
